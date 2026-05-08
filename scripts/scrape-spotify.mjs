#!/usr/bin/env node
/**
 * Spotify Stats Scraper
 *
 * Reads the user's sp_dc cookie from env (SPOTIFY_SP_DC), obtains a
 * fresh authenticated bearer token from open.spotify.com, then queries
 * Spotify's internal Pathfinder GraphQL API for:
 *   1. The artist's full discography (all own albums/singles/EPs)
 *   2. The artist's "Appears on" releases (featured-on tracks)
 *
 * For each release, fetches the album/single track list with the
 * per-track lifetime playcount. Featured-on releases are filtered to
 * only include tracks where the configured artist URI is in the
 * track's artist list.
 *
 * Aggregates everything into:
 *   - totalStreams
 *   - songCount
 *   - topTracks (top 10 by playcount)
 *
 * Writes the result to public/stats.json so the React app can read it
 * as a static asset after the next build.
 *
 * Persisted-query hashes are discovered dynamically from the live
 * web-player JS bundle so the scraper survives Spotify's regular
 * bundle rotations without code changes.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const ARTIST_ID =
  process.env.SPOTIFY_ARTIST_ID || '3LaYDsZXr5HlfDY7vtxq0v';
const ARTIST_URI = `spotify:artist:${ARTIST_ID}`;
const SP_DC = process.env.SPOTIFY_SP_DC;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'public', 'stats.json');

// -----------------------------------------------------------------------------
// HTTP helpers
// -----------------------------------------------------------------------------

const SHARED_HEADERS = {
  'User-Agent': UA,
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://open.spotify.com/',
  Origin: 'https://open.spotify.com',
};

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { ...SHARED_HEADERS, ...headers } });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Expected JSON from ${url}, got: ${text.slice(0, 200)} (status ${res.status})`,
    );
  }
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

// -----------------------------------------------------------------------------
// Step 1: Authenticated bearer token via sp_dc cookie
// -----------------------------------------------------------------------------

async function getAccessToken() {
  if (!SP_DC) {
    throw new Error('SPOTIFY_SP_DC env var is missing.');
  }
  const data = await getJson(
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
    {
      Cookie: `sp_dc=${SP_DC}`,
    },
  );
  if (!data.accessToken) {
    throw new Error('No accessToken in get_access_token response.');
  }
  if (data.isAnonymous) {
    throw new Error(
      'Token is anonymous — sp_dc cookie is invalid or expired. Re-extract it from open.spotify.com.',
    );
  }
  return data.accessToken;
}

// -----------------------------------------------------------------------------
// Step 2: Discover Pathfinder query hashes from the live web bundle
// -----------------------------------------------------------------------------

async function getJsBundleUrls() {
  const res = await fetch('https://open.spotify.com/', {
    headers: SHARED_HEADERS,
  });
  const html = await res.text();
  // Match all referenced .js bundles loaded by the web player
  const matches = [
    ...html.matchAll(/https:\/\/[^"'\s]+\.spotifycdn\.com\/[^"'\s]+\.js/g),
    ...html.matchAll(/href="(\/[^"]+\.js)"/g),
    ...html.matchAll(/src="(https:\/\/[^"]+\.js)"/g),
  ];
  const urls = new Set();
  for (const m of matches) {
    const u = m[1] || m[0];
    if (!u) continue;
    if (u.startsWith('http')) urls.add(u);
    else if (u.startsWith('/')) urls.add(`https://open.spotify.com${u}`);
  }
  return [...urls];
}

const HASH_CACHE = {};

async function discoverHashes(operationNames) {
  const need = operationNames.filter((n) => !HASH_CACHE[n]);
  if (need.length === 0) return HASH_CACHE;

  const bundleUrls = await getJsBundleUrls();
  for (const url of bundleUrls) {
    if (Object.keys(HASH_CACHE).length === operationNames.length) break;
    let body;
    try {
      const r = await fetch(url, { headers: SHARED_HEADERS });
      if (!r.ok) continue;
      body = await r.text();
    } catch {
      continue;
    }
    for (const opName of need) {
      if (HASH_CACHE[opName]) continue;
      // Pattern variants we've seen in Spotify's webpack output:
      //   value:"queryArtistDiscographyAll", ... operationId:"abcd1234..."
      //   {operationName:"queryArtistDiscographyAll",operationId:"abcd1234..."}
      //   "queryArtistDiscographyAll".concat(...) ... "abcd1234..."
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
          HASH_CACHE[opName] = m[1];
          break;
        }
      }
    }
  }
  const stillMissing = operationNames.filter((n) => !HASH_CACHE[n]);
  if (stillMissing.length > 0) {
    throw new Error(
      `Could not discover Pathfinder hashes for: ${stillMissing.join(', ')}. ` +
        `Spotify may have changed their bundle structure.`,
    );
  }
  return HASH_CACHE;
}

// -----------------------------------------------------------------------------
// Step 3: Pathfinder query helper
// -----------------------------------------------------------------------------

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
      `Pathfinder ${operationName} returned non-JSON: ${text.slice(0, 200)}`,
    );
  }
  if (!res.ok || body.errors) {
    throw new Error(
      `Pathfinder ${operationName} ${res.status}: ${JSON.stringify(
        body.errors || body,
      ).slice(0, 400)}`,
    );
  }
  return body.data;
}

// -----------------------------------------------------------------------------
// Step 4: Discography + appears-on enumeration
// -----------------------------------------------------------------------------

async function fetchAllReleases(token, hashes) {
  const allReleases = [];
  let offset = 0;
  const limit = 50;
  // queryArtistDiscographyAll paginates
  for (let safety = 0; safety < 20; safety++) {
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
      root?.items?.flatMap?.((cat) => cat?.releases?.items || cat?.items || []) ||
      [];
    if (items.length === 0) break;
    allReleases.push(...items);
    offset += limit;
    if (root?.totalCount && offset >= root.totalCount) break;
  }
  return allReleases;
}

async function fetchAppearsOn(token, hashes) {
  // Some Spotify bundles call this queryArtistAppearsOn, others have it inline
  // in queryArtistOverview. Try the dedicated query first.
  try {
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
  } catch (e) {
    console.warn('queryArtistAppearsOn failed, skipping featured-on:', e.message);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Step 5: For each release, fetch tracks + playcounts
// -----------------------------------------------------------------------------

async function fetchAlbumTracks(token, hashes, albumUri) {
  const data = await pathfinder({
    token,
    operationName: 'getAlbum',
    hash: hashes.getAlbum,
    variables: { uri: albumUri, locale: '', offset: 0, limit: 50 },
  });
  const items =
    data?.albumUnion?.tracks?.items ||
    data?.albumUnion?.tracksV2?.items ||
    [];
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

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  console.log(`[1streem] Scraping artist ${ARTIST_ID}...`);

  const token = await getAccessToken();
  console.log('[1streem] Got authenticated token.');

  const hashes = await discoverHashes([
    'queryArtistDiscographyAll',
    'queryArtistAppearsOn',
    'getAlbum',
    'queryArtistOverview',
  ]);
  console.log(
    '[1streem] Pathfinder hashes resolved:',
    Object.fromEntries(
      Object.entries(hashes).map(([k, v]) => [k, v.slice(0, 8) + '…']),
    ),
  );

  // Artist profile (name + monthlyListeners as bonus)
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

  // Own discography
  const ownReleases = await fetchAllReleases(token, hashes);
  console.log(`[1streem] Found ${ownReleases.length} own releases.`);

  // Appears-on
  const appearsOnReleases = await fetchAppearsOn(token, hashes);
  console.log(
    `[1streem] Found ${appearsOnReleases.length} appears-on releases.`,
  );

  // Track aggregation
  const tracksByUri = new Map();

  // Helper to add tracks, dedupe by URI, only keep our artist's tracks
  // for appears-on (own releases keep all tracks)
  function ingestTracks(tracks, requireOurArtist) {
    for (const t of tracks) {
      if (requireOurArtist && !t.artists.includes(ARTIST_URI)) continue;
      // Prefer the entry with the higher playcount if duplicated
      const existing = tracksByUri.get(t.uri);
      if (!existing || (t.playcount || 0) > (existing.playcount || 0)) {
        tracksByUri.set(t.uri, t);
      }
    }
  }

  // Iterate own releases
  for (const r of ownReleases) {
    const uri = r.uri || (r.id ? `spotify:album:${r.id}` : null);
    if (!uri) continue;
    try {
      const tracks = await fetchAlbumTracks(token, hashes, uri);
      ingestTracks(tracks, false);
    } catch (e) {
      console.warn(`getAlbum failed for ${uri}: ${e.message}`);
    }
  }

  // Iterate appears-on (filter by artist)
  for (const r of appearsOnReleases) {
    const uri = r.uri || (r.id ? `spotify:album:${r.id}` : null);
    if (!uri) continue;
    try {
      const tracks = await fetchAlbumTracks(token, hashes, uri);
      ingestTracks(tracks, true);
    } catch (e) {
      console.warn(`getAlbum (appears-on) failed for ${uri}: ${e.message}`);
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

  const result = {
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

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2) + '\n');
  console.log(`[1streem] Wrote ${OUTPUT_PATH}`);
  console.log(
    `[1streem] Total: ${totalStreams.toLocaleString('de-DE')} streams · ${songCount} songs`,
  );
  if (topTracks.length > 0) {
    console.log('[1streem] Top tracks:');
    for (const [i, t] of topTracks.entries()) {
      console.log(
        `  ${String(i + 1).padStart(2, '0')}. ${t.name} — ${t.streams.toLocaleString('de-DE')}`,
      );
    }
  }
}

main().catch((e) => {
  console.error('[1streem] ERROR:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
