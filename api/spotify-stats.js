// Vercel Serverless Function — Edge Runtime
// Holt Spotify-Stats über die interne Pathfinder-API.
// Mehrere Strategien für Token-Acquisition, weil Spotify get_access_token
// inzwischen ohne Cookies/Browser-Kontext oft 403 zurückgibt.

export const config = { runtime: 'edge' };

const ARTIST_ID =
  (typeof process !== 'undefined' && process.env?.SPOTIFY_ARTIST_ID) ||
  '3LaYDsZXr5HlfDY7vtxq0v';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const ARTIST_OVERVIEW_HASHES = [
  '4bc52527bb77a5f8bbb9afe491e9aa725698d29ab73bff58d49169ee29800167',
  '35648a112beb1794e39ab931ea1f88e29b8d24b2a47b75bfb7f59ee75a87b7e8',
  '5a8b9f97e02d86f1c0f4d68f3d76a7e3d6c7f9a8b5e2c1d4f7a8b9c6d3e2f1a0',
];

const BROWSER_HEADERS = {
  'User-Agent': UA,
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'sec-ch-ua':
    '"Not_A Brand";v="8", "Chromium";v="124", "Google Chrome";v="124"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  Referer: 'https://open.spotify.com/',
  Origin: 'https://open.spotify.com',
};

// --- Token-Acquisition (mehrere Strategien) ---

async function tokenViaGetAccessTokenEndpoint() {
  const url =
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) {
    throw new Error(`get_access_token: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data?.accessToken) throw new Error('get_access_token: no accessToken');
  return { accessToken: data.accessToken, clientId: data.clientId, source: 'get_access_token' };
}

async function tokenViaHtmlBootstrap() {
  // open.spotify.com bettet im initial HTML eine session-JSON ein, die u.a.
  // den anonymen accessToken enthält, mit dem der React-Player startet.
  const res = await fetch('https://open.spotify.com/', {
    headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`open.spotify.com html: HTTP ${res.status}`);
  const html = await res.text();
  // Variante 1: <script id="session" type="application/json">{...}</script>
  const sessionMatch = html.match(
    /<script[^>]+id=["']session["'][^>]*>([^<]+)<\/script>/,
  );
  if (sessionMatch) {
    try {
      const session = JSON.parse(sessionMatch[1]);
      if (session.accessToken) {
        return {
          accessToken: session.accessToken,
          clientId: session.clientId,
          source: 'html-session-script',
        };
      }
    } catch {
      // weiter zur nächsten Strategie
    }
  }
  // Variante 2: irgendwo im HTML steht "accessToken":"BQ..."
  const tokenMatch = html.match(/"accessToken"\s*:\s*"([^"]{40,})"/);
  if (tokenMatch) {
    const clientIdMatch = html.match(/"clientId"\s*:\s*"([^"]+)"/);
    return {
      accessToken: tokenMatch[1],
      clientId: clientIdMatch ? clientIdMatch[1] : null,
      source: 'html-regex',
    };
  }
  throw new Error('html-bootstrap: no token pattern found');
}

async function acquireToken() {
  const errors = [];
  const strategies = [tokenViaGetAccessTokenEndpoint, tokenViaHtmlBootstrap];
  for (const fn of strategies) {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${fn.name}: ${e.message}`);
    }
  }
  const err = new Error('All token strategies failed: ' + errors.join(' | '));
  err.attempts = errors;
  throw err;
}

// --- Pathfinder-Call ---

async function callPathfinder({ operationName, variables, hash, token }) {
  const extensions = { persistedQuery: { version: 1, sha256Hash: hash } };
  const url =
    'https://api-partner.spotify.com/pathfinder/v1/query' +
    `?operationName=${operationName}` +
    `&variables=${encodeURIComponent(JSON.stringify(variables))}` +
    `&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'App-Platform': 'WebPlayer',
      'Spotify-App-Version': '1.2.45.1',
      Accept: 'application/json',
      'User-Agent': UA,
    },
  });
  let body = {};
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body, ok: res.ok };
}

// --- Handler ---

export default async function handler() {
  try {
    let tokenInfo;
    try {
      tokenInfo = await acquireToken();
    } catch (tokenErr) {
      return jsonResponse(
        {
          error: tokenErr.message,
          attempts: tokenErr.attempts,
          hint:
            'Spotify hat den anonymen Token-Endpoint vermutlich gehärtet. Manuelle Pflege der Stats über Env Vars als Fallback.',
        },
        502,
      );
    }

    const variables = {
      uri: `spotify:artist:${ARTIST_ID}`,
      locale: '',
      includePrerelease: true,
    };

    let overview = null;
    const attempts = [];
    for (const hash of ARTIST_OVERVIEW_HASHES) {
      const r = await callPathfinder({
        operationName: 'queryArtistOverview',
        variables,
        hash,
        token: tokenInfo.accessToken,
      });
      attempts.push({
        hash: hash.slice(0, 8) + '…',
        status: r.status,
        hasData: Boolean(r.body?.data?.artistUnion),
        errors: r.body?.errors?.map((e) => e.message) || null,
      });
      if (r.ok && r.body?.data?.artistUnion) {
        overview = r.body;
        break;
      }
    }

    if (!overview) {
      return jsonResponse(
        {
          error: 'Pathfinder queryArtistOverview hat mit allen bekannten Hashes failed.',
          tokenSource: tokenInfo.source,
          attempts,
        },
        502,
      );
    }

    const a = overview.data.artistUnion;
    const profile = a.profile || {};
    const stats = a.stats || {};
    const monthlyListeners = stats.monthlyListeners ?? null;
    const followers = stats.followers ?? null;
    const worldRank = stats.worldRank ?? null;

    const topTracksRaw = a.discography?.topTracks?.items || [];
    const topTracks = topTracksRaw
      .map((it) => {
        const t = it.track || it;
        return {
          name: t.name,
          uri: t.uri,
          playcount: Number(t.playcount) || 0,
          albumImage:
            t.albumOfTrack?.coverArt?.sources?.[0]?.url ||
            t.album?.coverArt?.sources?.[0]?.url ||
            null,
        };
      })
      .filter((t) => t.name);

    const topTracksTotal = topTracks.reduce((s, t) => s + t.playcount, 0);

    return jsonResponse({
      artistId: ARTIST_ID,
      artistName: profile.name || null,
      monthlyListeners,
      followers,
      worldRank,
      topTracks,
      topTracksTotal,
      tokenSource: tokenInfo.source,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return jsonResponse(
      { error: err.message || 'Unknown error' },
      500,
    );
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, s-maxage=600, stale-while-revalidate=86400',
    },
  });
}
