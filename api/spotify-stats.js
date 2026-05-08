// Vercel Serverless Function — Edge Runtime
// Holt Spotify-Stats über die interne Pathfinder-API (was der Web-Player benutzt)
// Liefert: Monthly Listeners, Followers, Top-Tracks mit echten Lifetime-Stream-Counts.
// Aufrufbar unter: https://1streem.vercel.app/api/spotify-stats

export const config = { runtime: 'edge' };

const ARTIST_ID =
  process.env.SPOTIFY_ARTIST_ID || '3LaYDsZXr5HlfDY7vtxq0v';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Mehrere bekannte queryArtistOverview persistedQuery-Hashes, neueste zuerst.
// Wenn Spotify den Web-Bundle updatet, ändern sich die Hashes — wir versuchen
// alle bekannten durch und reporten klar, falls keiner mehr matcht.
const ARTIST_OVERVIEW_HASHES = [
  '4bc52527bb77a5f8bbb9afe491e9aa725698d29ab73bff58d49169ee29800167',
  '35648a112beb1794e39ab931ea1f88e29b8d24b2a47b75bfb7f59ee75a87b7e8',
  '63a2cc414c8b3c52fe2a8f24bb14ed5e0dd9b9e0a2f5a3a4c4ff5b3a5b1c5d6e',
];

async function getAnonymousToken() {
  const url =
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) {
    throw new Error(`get_access_token failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data.accessToken) {
    throw new Error('No accessToken in response');
  }
  return data;
}

async function callPathfinder({ operationName, variables, hash, token, clientId }) {
  const extensions = {
    persistedQuery: { version: 1, sha256Hash: hash },
  };
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
      'Client-Token': clientId || '',
      Accept: 'application/json',
      'User-Agent': UA,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, ok: res.ok };
}

export default async function handler() {
  try {
    const tokenData = await getAnonymousToken();
    const token = tokenData.accessToken;
    const clientId = tokenData.clientId;

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
        token,
        clientId,
      });
      attempts.push({ hash: hash.slice(0, 8) + '…', status: r.status, hasData: Boolean(r.body?.data?.artistUnion) });
      if (r.ok && r.body?.data?.artistUnion) {
        overview = r.body;
        break;
      }
    }

    if (!overview) {
      return jsonResponse(
        {
          error:
            'Pathfinder queryArtistOverview hat mit allen bekannten Hashes failed. Spotify hat vermutlich das Web-Bundle aktualisiert.',
          attempts,
          fallback: null,
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

    const topTracksRaw =
      a.discography?.topTracks?.items ||
      a.preRelease?.preReleaseContent?.items ||
      [];
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
      // Hinweis: das ist die Summe der Top-Tracks (max. 10), nicht ALLER Tracks.
      // Erweiterung: queryArtistDiscography iterieren — Phase 2.
      fetchedAt: new Date().toISOString(),
      attempts,
    });
  } catch (err) {
    return jsonResponse(
      { error: err.message || 'Unknown error', stack: err.stack },
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
      // 10 Min Cache am Edge, 1 Tag stale-while-revalidate
      'cache-control': 'public, s-maxage=600, stale-while-revalidate=86400',
    },
  });
}
