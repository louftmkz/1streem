/**
 * 1streem Spotify Stats Worker (Cloudflare Workers)
 *
 * Cron: täglich → scraped Spotify, schreibt JSON nach KV.
 * Fetch:
 *   GET /api/stats        → liefert cachten JSON (CORS)
 *   GET /api/scrape-now   → triggert sofort, returnt JSON (für Verifikation)
 *
 * Bindings (im CF Dashboard zu setzen):
 *   - KV Namespace        STATS_KV
 *   - Secret              SPOTIFY_SP_DC      (dein open.spotify.com sp_dc Cookie)
 *   - Plain text variable SPOTIFY_ARTIST_ID  (z.B. 3LaYDsZXr5HlfDY7vtxq0v)
 *
 * Cron Trigger: 0 3 * * *  (täglich 03:00 UTC)
 */

const ARTIST_ID_DEFAULT = '3LaYDsZXr5HlfDY7vtxq0v';
const KV_KEY = 'stats:v1';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const SHARED_HEADERS = {
  'User-Agent': UA,
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://open.spotify.com/',
  Origin: 'https://open.spotify.com',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === '/api/stats') {
      const cached = await env.STATS_KV.get(KV_KEY, 'json');
      if (!cached) {
        return jsonRes(
          {
            error:
              'Stats noch nicht generiert. Erster Cron-Run pending oder /api/scrape-now manuell triggern.',
          },
          503,
        );
      }
      return jsonRes(cached, 200, {
        'cache-control': 'public, max-age=300',
      });
    }

    if (url.pathname === '/api/scrape-now') {
      try {
        const stats = await scrape(env);
        await env.STATS_KV.put(KV_KEY, JSON.stringify(stats));
        return jsonRes({ ok: true, stats });
      } catch (e) {
        return jsonRes({ error: e.message, stack: e.stack }, 500);
      }
    }

    return new Response(
      '1streem-scraper Worker.\n\nEndpoints:\n  GET /api/stats        — cached JSON\n  GET /api/scrape-now   — trigger now',
      { headers: { 'content-type': 'text/plain', ...CORS } },
    );
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          const stats = await scrape(env);
          await env.STATS_KV.put(KV_KEY, JSON.stringify(stats));
          console.log(
            '[1streem] Cron OK:',
            stats.totalStreams,
            'streams,',
            stats.songCount,
            'songs',
          );
        } catch (e) {
          console.error('[1streem] Cron FAILED:', e.message);
        }
      })(),
    );
  },
};

function jsonRes(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS,
      ...extra,
    },
  });
}

// ---------------------------------------------------------------------------
// Core scrape logic
// ---------------------------------------------------------------------------

async function scrape(env) {
  const SP_DC = env.SPOTIFY_SP_DC;
  if (!SP_DC) throw new Error('SPOTIFY_SP_DC secret is not set in worker bindings.');

  const ARTIST_ID = env.SPOTIFY_ARTIST_ID || ARTIST_ID_DEFAULT;
  const ARTIST_URI = `spotify:artist:${ARTIST_ID}`;

  const token = await getAccessToken(SP_DC);
  const hashes = await discoverHashes([
    'queryArtistDiscographyAll',
    'queryArtistAppearsOn',
    'getAlbum',
    'queryArtistOverview',
  ]);

  let artistName = null;
  let monthlyListeners = null;
  let followers = null;
  try {
    const overview = await pathfinder({
      token,
      operationName: 'queryArtistOverview',
      hash: hashes.queryArtistOverview,
      variables: { uri: ARTIST_URI, locale: '', includePrerelease: true },
    });
    const a = overview?.artistUnion;
    artistName = a?.profile?.name || null;
    monthlyListeners = a?.stats?.monthlyListeners ?? null;
    followers = a?.stats?.followers ?? null;
  } catch (e) {
    console.warn('queryArtistOverview failed:', e.message);
  }

  const ownReleases = await fetchDiscography(token, hashes, ARTIST_URI);
  let appearsOnReleases = [];
  try {
    appearsOnReleases = await fetchAppearsOn(token, hashes, ARTIST_URI);
  } catch (e) {
    console.warn('queryArtistAppearsOn failed:', e.message);
  }

  const tracksByUri = new Map();

  for (const r of ownReleases) {
    const uri = r.uri || (r.id ? `spotify:album:${r.id}` : null);
    if (!uri) continue;
    try {
      const tracks = await fetchAlbumTracks(token, hashes, uri);
      for (const t of tracks) {
        const ex = tracksByUri.get(t.uri);
        if (!ex || t.playcount > ex.playcount) tracksByUri.set(t.uri, t);
      }
    } catch (e) {
      console.warn(`getAlbum ${uri}: ${e.message}`);
    }
  }

  for (const r of appearsOnReleases) {
    const uri = r.uri || (r.id ? `spotify:album:${r.id}` : null);
    if (!uri) continue;
    try {
      const tracks = await fetchAlbumTracks(token, hashes, uri);
      for (const t of tracks) {
        if (!t.artists.includes(ARTIST_URI)) continue;
        const ex = tracksByUri.get(t.uri);
        if (!ex || t.playcount > ex.playcount) tracksByUri.set(t.uri, t);
      }
    } catch (e) {
      console.warn(`getAlbum (appears-on) ${uri}: ${e.message}`);
    }
  }

  const allTracks = [...tracksByUri.values()];
  const songCount = allTracks.length;
  const totalStreams = allTracks.reduce(
    (s, t) => s + (Number.isFinite(t.playcount) ? t.playcount : 0),
    0,
  );
  const topTracks = allTracks
    .filter((t) => t.playcount > 0)
    .sort((a, b) => b.playcount - a.playcount)
    .slice(0, 10)
    .map((t) => ({ name: t.name, streams: t.playcount, uri: t.uri }));

  return {
    artistId: ARTIST_ID,
    artistName,
    songCount,
    totalStreams,
    monthlyListeners,
    followers,
    topTracks,
    asOf: new Date().toISOString().slice(0, 10),
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Token + hashes
// ---------------------------------------------------------------------------

async function getAccessToken(SP_DC) {
  const res = await fetch(
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
    { headers: { ...SHARED_HEADERS, Cookie: `sp_dc=${SP_DC}` } },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `get_access_token: HTTP ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`get_access_token: non-JSON ${text.slice(0, 300)}`);
  }
  if (!data.accessToken) throw new Error('No accessToken in response');
  if (data.isAnonymous) {
    throw new Error('Token is anonymous — sp_dc cookie expired or invalid');
  }
  return data.accessToken;
}

async function discoverHashes(operationNames) {
  const cache = {};
  const homeRes = await fetch('https://open.spotify.com/', {
    headers: SHARED_HEADERS,
  });
  if (!homeRes.ok) {
    throw new Error(`open.spotify.com home HTTP ${homeRes.status}`);
  }
  const homeHtml = await homeRes.text();
  const bundleUrls = new Set();
  for (const m of homeHtml.matchAll(
    /https:\/\/[^"'\s]+\.spotifycdn\.com\/[^"'\s]+\.js/g,
  )) {
    bundleUrls.add(m[0]);
  }
  for (const m of homeHtml.matchAll(/src="(\/[^"]+\.js)"/g)) {
    bundleUrls.add(`https://open.spotify.com${m[1]}`);
  }
  for (const url of bundleUrls) {
    if (operationNames.every((n) => cache[n])) break;
    let body;
    try {
      const r = await fetch(url, { headers: SHARED_HEADERS });
      if (!r.ok) continue;
      body = await r.text();
    } catch {
      continue;
    }
    for (const opName of operationNames) {
      if (cache[opName]) continue;
      const patterns = [
        new RegExp(
          `["']${opName}["'][^]{0,400}?["']([a-f0-9]{64})["']`,
          'i',
        ),
        new RegExp(
          `["']([a-f0-9]{64})["'][^]{0,200}?["']${opName}["']`,
          'i',
        ),
      ];
      for (const re of patterns) {
        const m = body.match(re);
        if (m) {
          cache[opName] = m[1];
          break;
        }
      }
    }
  }
  const missing = operationNames.filter((n) => !cache[n]);
  if (missing.length) {
    throw new Error(`Pathfinder hashes not found: ${missing.join(', ')}`);
  }
  return cache;
}

// ---------------------------------------------------------------------------
// Pathfinder
// ---------------------------------------------------------------------------

async function pathfinder({ token, operationName, hash, variables }) {
  const url =
    'https://api-partner.spotify.com/pathfinder/v1/query' +
    `?operationName=${operationName}` +
    `&variables=${encodeURIComponent(JSON.stringify(variables))}` +
    `&extensions=${encodeURIComponent(
      JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }),
    )}`;
  const res = await fetch(url, {
    headers: {
      ...SHARED_HEADERS,
      Authorization: `Bearer ${token}`,
      'App-Platform': 'WebPlayer',
      'Spotify-App-Version': '1.2.45.1',
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Pathfinder ${operationName}: non-JSON ${text.slice(0, 200)}`,
    );
  }
  if (!res.ok || body.errors) {
    throw new Error(
      `Pathfinder ${operationName} ${res.status}: ${JSON.stringify(
        body.errors || body,
      ).slice(0, 300)}`,
    );
  }
  return body.data;
}

async function fetchDiscography(token, hashes, ARTIST_URI) {
  const all = [];
  let offset = 0;
  const limit = 50;
  for (let i = 0; i < 20; i++) {
    const data = await pathfinder({
      token,
      operationName: 'queryArtistDiscographyAll',
      hash: hashes.queryArtistDiscographyAll,
      variables: { uri: ARTIST_URI, offset, limit, order: null },
    });
    const root =
      data?.artistUnion?.discography?.all ||
      data?.artistUnion?.discography ||
      {};
    const items =
      root?.items?.flatMap?.(
        (cat) => cat?.releases?.items || cat?.items || [],
      ) || [];
    if (!items.length) break;
    all.push(...items);
    offset += limit;
    if (root?.totalCount && offset >= root.totalCount) break;
  }
  return all;
}

async function fetchAppearsOn(token, hashes, ARTIST_URI) {
  const data = await pathfinder({
    token,
    operationName: 'queryArtistAppearsOn',
    hash: hashes.queryArtistAppearsOn,
    variables: { uri: ARTIST_URI, offset: 0, limit: 100 },
  });
  const items =
    data?.artistUnion?.relatedContent?.appearsOn?.items ||
    data?.artistUnion?.appearsOn?.items ||
    [];
  return items.map((it) => it?.releases?.items?.[0] || it).filter(Boolean);
}

async function fetchAlbumTracks(token, hashes, albumUri) {
  const data = await pathfinder({
    token,
    operationName: 'getAlbum',
    hash: hashes.getAlbum,
    variables: { uri: albumUri, locale: '', offset: 0, limit: 50 },
  });
  const items =
    data?.albumUnion?.tracks?.items || data?.albumUnion?.tracksV2?.items || [];
  return items
    .map((it) => {
      const t = it.track || it;
      return {
        uri: t.uri,
        name: t.name,
        playcount: Number(t.playcount) || 0,
        artists:
          t.artists?.items?.map((a) => a.uri) ||
          t.artists?.map((a) => a.uri) ||
          [],
      };
    })
    .filter((t) => t.name && t.uri);
}
