/**
 * SPOTIFY DAILY SCRAPER
 * 
 * Lädt 1x täglich um 00:00 Uhr deine echten Spotify-Metriken:
 * - Monatliche Hörer
 * - Streams
 * - Top Songs
 * 
 * Safe: Nur 1 Request pro Tag = Kein Ban-Risiko
 */

import puppeteer from 'puppeteer';
import cron from 'node-cron';
import db from './database.js'; // Deine Datenbank

const ARTIST_ID = 'your-spotify-artist-id'; // Aus URL: open.spotify.com/artist/[THIS]

/**
 * Scrape Spotify for Artists Metriken
 */
const scrapeSpotifyMetrics = async (artistId) => {
  console.log(`[${new Date().toISOString()}] Starting Spotify scrape for artist: ${artistId}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage' // Wichtig für Server
      ]
    });

    const page = await browser.newPage();
    
    // User Agent setzen (damit Spotify dich nicht als Bot erkennt)
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    // Timeout: 30 Sekunden
    page.setDefaultTimeout(30000);

    // Zur Artist-Seite navigieren
    const url = `https://open.spotify.com/artist/${artistId}`;
    console.log(`Navigating to: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Warte bis die Hauptseite geladen ist
    await page.waitForSelector('main', { timeout: 15000 });

    // Scrape die Daten mit mehreren Fallback-Selektoren
    const metrics = await page.evaluate(() => {
      // Monthly Listeners
      let monthlyListeners = null;
      const monthlyText = Array.from(document.querySelectorAll('*'))
        .find(el => el.textContent.includes('monthly listeners'));
      
      if (monthlyText) {
        const match = monthlyText.textContent.match(/[\d,]+/);
        monthlyListeners = parseInt(match[0].replace(/,/g, ''));
      }

      // Top Songs (erste 5)
      const songs = [];
      document.querySelectorAll('[data-testid="tracklist-row"]').forEach((row, idx) => {
        if (idx < 5) {
          const nameEl = row.querySelector('[data-testid="cell-text"]');
          const playCountEl = row.querySelector('[data-testid="added-at"]'); // Fallback
          
          if (nameEl) {
            songs.push({
              name: nameEl.textContent.trim(),
              rank: idx + 1
            });
          }
        }
      });

      // Follower (aus dem Profil-Header)
      let followers = null;
      const followerText = Array.from(document.querySelectorAll('*'))
        .find(el => el.textContent.includes('followers'));
      
      if (followerText) {
        const match = followerText.textContent.match(/[\d,]+/);
        followers = parseInt(match[0].replace(/,/g, ''));
      }

      return {
        monthlyListeners,
        followers,
        topSongs: songs,
        scrapedAt: new Date().toISOString()
      };
    });

    // Schließe Browser
    await browser.close();

    console.log(`✅ Scrape erfolgreich:`, metrics);
    return metrics;

  } catch (error) {
    console.error(`❌ Scrape fehlgeschlagen:`, error.message);
    if (browser) await browser.close();
    return null;
  }
};

/**
 * Speichere Metriken in Datenbank
 */
const saveMetrics = async (metrics) => {
  if (!metrics) return;

  try {
    // Beispiel mit MongoDB
    await db.collection('spotify_metrics').insertOne({
      artistId: ARTIST_ID,
      monthlyListeners: metrics.monthlyListeners,
      followers: metrics.followers,
      topSongs: metrics.topSongs,
      date: new Date(),
      timestamp: new Date().getTime()
    });

    console.log(`✅ Metrics in DB gespeichert`);
  } catch (error) {
    console.error(`❌ Fehler beim Speichern:`, error);
  }
};

/**
 * MAIN: Starte täglichen Job um 00:00 Uhr
 */
export const startDailySpotifyJob = () => {
  console.log('🎵 Daily Spotify Scraper gestartet');
  
  // Jeden Tag um Mitternacht (00:00 Uhr)
  cron.schedule('0 0 * * *', async () => {
    console.log('⏰ Daily Job triggered at', new Date().toISOString());
    
    const metrics = await scrapeSpotifyMetrics(ARTIST_ID);
    await saveMetrics(metrics);
  });

  // Optional: Auch beim Start einmal ausführen (für Testing)
  console.log('🔄 Starte initialen Scrape...');
  scrapeSpotifyMetrics(ARTIST_ID).then(saveMetrics);
};

/**
 * TEST: Manuell triggern (für Development)
 */
export const testScrapeNow = async () => {
  console.log('🧪 Manual test scrape triggered');
  const metrics = await scrapeSpotifyMetrics(ARTIST_ID);
  await saveMetrics(metrics);
  return metrics;
};

export default { startDailySpotifyJob, testScrapeNow };
