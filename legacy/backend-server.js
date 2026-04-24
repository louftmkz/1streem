/**
 * 1STREEM Backend Server
 * Express.js + MongoDB + Puppeteer für Daily Spotify Scraping
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { startDailySpotifyJob, testScrapeNow } from './spotify-daily-scraper.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// MongoDB Connection
let db = null;
const MONGODB_URI = process.env.MONGODB_URI;
const client = new MongoClient(MONGODB_URI);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://1streem.vercel.app',
    process.env.FRONTEND_URL
  ],
  credentials: true
}));
app.use(express.json());

/**
 * Connect to MongoDB on startup
 */
async function connectDB() {
  try {
    await client.connect();
    db = client.db('1streem');
    console.log('✅ Connected to MongoDB');
    
    // Start the daily scraper
    startDailySpotifyJob();
    console.log('🎵 Daily Spotify Scraper started');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}

/**
 * ROUTES
 */

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET latest Spotify metrics
 */
app.get('/api/spotify/latest-metrics', async (req, res) => {
  try {
    const metrics = await db
      .collection('spotify_metrics')
      .findOne(
        { artistId: process.env.SPOTIFY_ARTIST_ID },
        { sort: { date: -1 } }
      );

    if (!metrics) {
      return res.status(404).json({
        error: 'No metrics found. Scraper might not have run yet.'
      });
    }

    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * GET historical metrics (last 30 days)
 */
app.get('/api/spotify/history', async (req, res) => {
  try {
    const history = await db
      .collection('spotify_metrics')
      .find({ artistId: process.env.SPOTIFY_ARTIST_ID })
      .sort({ date: -1 })
      .limit(30)
      .toArray();

    res.json(history.reverse());
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * TEST: Manually trigger scrape (for testing)
 */
app.get('/api/spotify/test', async (req, res) => {
  try {
    console.log('🧪 Manual scrape test triggered');
    const result = await testScrapeNow();
    
    if (!result) {
      return res.status(500).json({ error: 'Scrape failed' });
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test scrape error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * OAuth Endpoints (optional - if you want user authentication)
 */

// Exchange auth code for access token
app.post('/api/spotify/exchange-code', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'No auth code provided' });
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error_description });
    }

    // Store token (httpOnly cookie or in DB)
    res.json({
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in
    });
  } catch (error) {
    console.error('Token exchange failed:', error);
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

/**
 * Error handling
 */
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

/**
 * 404 Handler
 */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/**
 * Server startup
 */
async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 http://localhost:${PORT}`);
      console.log(`🎵 Daily scraper will run at 00:00 UTC`);
      console.log(`🧪 Test endpoint: GET http://localhost:${PORT}/api/spotify/test`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down gracefully...');
  await client.close();
  process.exit(0);
});

export default app;
