#!/usr/bin/env node
/**
 * Playwright-based Spotify stats scraper.
 *
 * Why: Spotify's edge (Akamai) blocks Node.js fetch based on TLS
 * fingerprinting, even from residential IPs with valid cookies. A real
 * headless Chromium has the right TLS signature and isn't blocked.
 *
 * Flow:
 *   1. Launch headless Chrome
 *   2. Set the sp_dc cookie on the .spotify.com domain
 *   3. Navigate to open.spotify.com so the page session is alive
 *   4. Run our scrape logic INSIDE the page via page.evaluate(): the
 *      browser then issues Pathfinder calls with real-browser TLS and
 *      our user-bound session cookies.
 *   5. Aggregate, write public/stats.json
 *
 * Env:
 *   SPOTIFY_SP_DC       — required
 *   SPOTIFY_ARTIST_ID   — optional, defaults to 3LaYDsZXr5HlfDY7vtxq0v
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTIST_ID =
  process.env.SPOTIFY_ARTIST_ID || '3LaYDsZXr5HlfDY7vtxq0v';
const SP_DC = process.env.SPOTIFY_SP_DC;
if (!SP_DC) {
  console.error('[1streem] Missing SPOTIFY_SP_DC env var.');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'public', 'stats.json');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  console.log(`[1streem] Scraping artist ${ARTIST_ID} via headless browser...`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });

    // Inject the persistent login cookie
    await context.addCookies([
      {
        name: 'sp_dc',
        value: SP_DC,
        domain: '.spotify.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'None',
      },
    ]);

    const page = await context.newPage();
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        console.log(`[page ${msg.type()}]`, msg.text().slice(0, 300));
      }
    });

    console.log('[1streem] Visiting open.spotify.com...');
    await page.goto('https://open.spotify.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    // Brief settle — let the SPA boot & token refresh kick in
    await page.waitForTimeout(3000);

    console.log('[1streem] Running scrape logic inside the page context...');
    const result = await page.evaluate(scrapeInPage, ARTIST_ID);

    if (result.__error) {
      throw new Error('In-page error: ' + result.__error);
    }

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2) + '\n');

    console.log(`[1streem] Wrote ${OUTPUT_PATH}`);
    console.log(
      `[1streem] Total: ${result.totalStreams.toLocaleString('de-DE')} streams · ${result.songCount} songs`,
    );
    if (result.topTracks?.length) {
      console.log('[1streem] Top tracks:');
      for (const [i, t] of result.topTracks.entries()) {
        console.log(
          `  ${String(i + 1).padStart(2, '0')}. ${t.name} — ${t.streams.toLocaleString('de-DE')}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
}

// ----------------------------------------------------------------------------
// This function is serialized and executed in the page context (real browser).
// It cannot reference anything outside its arguments and the browser globals.
// ----------------------------------------------------------------------------

async function scrapeInPage(ARTIST_ID) {
  try {
    const ARTIST_URI = `spotify:artist:${ARTIST_ID}`;

    // 1) Authenticated token (same-origin request, cookies attached automatically)
    const tokRes = await fetch(
      '/get_access_token?reason=transport&productType=web_player',
      { credentials: 'include' },
    );
    if (!tokRes.ok) {
      const t = await tokRes.text();
      return { __error: `get_access_token HTTP ${tokRes.status}: ${t.slice(0, 200)}` };
    }
    const tokData = await tokRes.json();
    if (!tokData.accessToken)
      return { __error: 'No accessToken in get_access_token response' };
    if (tokData.isAnonymous)
      return {
        __error: 'Token is anonymous — sp_dc cookie expired or wrong account',
      };
    const token = tokData.accessToken;

    // 2) Discover Pathfinder hashes by fetching the page's own JS bundles
    const homeRes = await fetch('/');
    const homeHtml = await homeRes.text();
    const bundleUrls = new Set();
    for (const m of homeHtml.matchAll(
      /https:\/\/[^"'\s]+\.spotifycdn\.com\/[^"'\s]+\.js/g,
    )) {
      bundleUrls.add(m[0]);
    }
    for (const m of homeHtml.matchAll(/src="(\/[^"]+\.js)"/g)) {
      bundleUrls.add(new URL(m[1], location.origin).toString());
    }
    const need = [
      'queryArtistDiscographyAll',
      'queryArtistAppearsOn',
      'getAlbum',
      'queryArtistOverview',
    ];
    const hashes = {};
    for (const url of bundleUrls) {
      if (need.every((n) => hashes[n])) break;
      let body;
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        body = await r.text();
      } catch {
        continue;
      }
      for (const op of need) {
        if (hashes[op]) continue;
        const re1 = new RegExp(
          `["']${op}["'][^]{0,400}?["']([a-f0-9]{64})["']`,
        );
        const re2 = new RegExp(
          `["']([a-f0-9]{64})["'][^]{0,200}?["']${op}["']`,
        );
        const m = body.match(re1) || body.match(re2);
        if (m) hashes[op] = m[1];
      }
    }
    const missingHashes = need.filter((n) => !hashes[n]);
    if (missingHashes.length) {
      return {
        __error: 'Hashes not discovered: ' + missingHashes.join(', '),
      };
    }

    // 3) Pathfinder helper
    async function pf(operationName, hash, variables) {
      const url =
        'https://api-partner.spotify.com/pathfinder/v1/query' +
        `?operationName=${operationName}` +
        `&variables=${encodeURIComponent(JSON.stringify(variables))}` +
        `&extensions=${encodeURIComponent(
          JSON.stringify({
            persistedQuery: { version: 1, sha256Hash: hash },
          }),
        )}`;
      const r = await fetch(url, {
        headers: {
          Authorization: 'Bearer ' + token,
          'App-Platform': 'WebPlayer',
          'Spotify-App-Version': '1.2.45.1',
          Accept: 'application/json',
        },
      });
      const t = await r.text();
      let b;
      try {
        b = JSON.parse(t);
      } catch {
        throw new Error(`${operationName}: non-JSON ${t.slice(0, 200)}`);
      }
      if (!r.ok || b.errors)
        throw new Error(
          `${operationName} ${r.status}: ${JSON.stringify(b.errors || b).slice(0, 300)}`,
        );
      return b.data;
    }

    // 4) Artist overview (name, monthly listeners, followers)
    let artistName = null,
      monthlyListeners = null,
      followers = null;
    try {
      const d = await pf('queryArtistOverview', hashes.queryArtistOverview, {
        uri: ARTIST_URI,
        locale: '',
        includePrerelease: true,
      });
      const a = d?.artistUnion;
      artistName = a?.profile?.name || null;
      monthlyListeners = a?.stats?.monthlyListeners ?? null;
      followers = a?.stats?.followers ?? null;
    } catch (e) {
      console.warn('artist overview failed:', e.message);
    }

    // 5) Full discography (paginated)
    const ownReleases = [];
    {
      let offset = 0;
      const limit = 50;
      for (let i = 0; i < 30; i++) {
        const d = await pf(
          'queryArtistDiscographyAll',
          hashes.queryArtistDiscographyAll,
          { uri: ARTIST_URI, offset, limit, order: null },
        );
        const root =
          d?.artistUnion?.discography?.all ||
          d?.artistUnion?.discography ||
          {};
        const items =
          root?.items?.flatMap?.(
            (c) => c?.releases?.items || c?.items || [],
          ) || [];
        if (!items.length) break;
        ownReleases.push(...items);
        offset += limit;
        if (root?.totalCount && offset >= root.totalCount) break;
      }
    }

    // 6) Appears-on
    let appearsOnReleases = [];
    try {
      const d = await pf(
        'queryArtistAppearsOn',
        hashes.queryArtistAppearsOn,
        { uri: ARTIST_URI, offset: 0, limit: 100 },
      );
      const items =
        d?.artistUnion?.relatedContent?.appearsOn?.items ||
        d?.artistUnion?.appearsOn?.items ||
        [];
      appearsOnReleases = items
        .map((it) => it?.releases?.items?.[0] || it)
        .filter(Boolean);
    } catch (e) {
      console.warn('appears-on failed:', e.message);
    }

    // 7) Per-album tracklist
    const tracksByUri = new Map();
    async function ingest(releases, requireOurArtist) {
      for (const r of releases) {
        const uri = r.uri || (r.id ? `spotify:album:${r.id}` : null);
        if (!uri) continue;
        try {
          const d = await pf('getAlbum', hashes.getAlbum, {
            uri,
            locale: '',
            offset: 0,
            limit: 50,
          });
          const items =
            d?.albumUnion?.tracks?.items ||
            d?.albumUnion?.tracksV2?.items ||
            [];
          for (const it of items) {
            const t = it.track || it;
            const playcount = Number(t.playcount) || 0;
            const artists =
              t.artists?.items?.map((a) => a.uri) ||
              t.artists?.map((a) => a.uri) ||
              [];
            if (requireOurArtist && !artists.includes(ARTIST_URI)) continue;
            const obj = { uri: t.uri, name: t.name, playcount };
            const ex = tracksByUri.get(t.uri);
            if (!ex || playcount > ex.playcount) tracksByUri.set(t.uri, obj);
          }
        } catch (e) {
          console.warn(`getAlbum ${uri}: ${e.message}`);
        }
      }
    }
    await ingest(ownReleases, false);
    await ingest(appearsOnReleases, true);

    const all = [...tracksByUri.values()];
    const songCount = all.length;
    const totalStreams = all.reduce(
      (s, t) => s + (Number.isFinite(t.playcount) ? t.playcount : 0),
      0,
    );
    const topTracks = all
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
  } catch (e) {
    return { __error: e.message || String(e) };
  }
}

main().catch((e) => {
  console.error('[1streem] FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
