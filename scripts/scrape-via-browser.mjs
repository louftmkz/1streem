#!/usr/bin/env node
/**
 * Spotify stats scraper — Playwright + Stealth.
 *
 * Akamai blocks Node-fetch AND plain headless Chromium based on bot
 * fingerprinting (navigator.webdriver, missing plugins, request shape,
 * etc.). The stealth plugin patches dozens of these signals so the
 * browser looks like a real user's Chrome.
 *
 * Plus: warm-up by visiting the actual artist page first, letting
 * Spotify set its session-related cookies organically before we call
 * get_access_token.
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

chromium.use(StealthPlugin());

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
  console.log(`[1streem] Scraping artist ${ARTIST_ID} via stealth Chromium...`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      timezoneId: 'Europe/Berlin',
      deviceScaleFactor: 2,
    });

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

    // Warm-up: visit the actual artist page like a real user would.
    // This lets Spotify set sp_t, sp_key and other session cookies before
    // we hit get_access_token.
    console.log('[1streem] Warming up on /artist page...');
    await page.goto(`https://open.spotify.com/artist/${ARTIST_ID}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    // Wait long enough for the SPA to boot and run its own auth flow
    await page.waitForTimeout(8000);

    // Log which cookies got set
    const cookies = await context.cookies('https://open.spotify.com');
    console.log(
      '[1streem] Cookies set:',
      cookies.map((c) => c.name).join(', '),
    );

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

async function scrapeInPage(ARTIST_ID) {
  try {
    const ARTIST_URI = `spotify:artist:${ARTIST_ID}`;

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

    // Hash discovery from JS bundles
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
      return { __error: 'Hashes not discovered: ' + missingHashes.join(', ') };
    }

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
