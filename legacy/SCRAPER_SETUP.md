# Spotify Daily Scraper - Setup Guide

## Was dieser Scraper macht:

✅ **1x täglich um 00:00 Uhr** deine Spotify-Metriken abrufen:
- Monatliche Hörer
- Streams (alle Zeit)
- Top 5 Songs
- Follower

✅ **Speichert in Datenbank** → Geschichte tracken
✅ **Zero Ban-Risiko** → Nur 1 Request pro Tag

---

## Installation

### 1. Dependencies installieren

```bash
npm install puppeteer node-cron
```

### 2. Deine Artist-ID finden

Gehe auf dein Spotify Profile:
```
https://open.spotify.com/artist/[DIESE ID KOPIEREN]
```

In `spotify-daily-scraper.js`:
```javascript
const ARTIST_ID = '1234567890abcdef'; // ← Hier einfügen
```

### 3. Backend Setup (Express)

```javascript
// server.js
import express from 'express';
import { startDailySpotifyJob, testScrapeNow } from './spotify-daily-scraper.js';

const app = express();

// Starte den täglichen Job beim Server-Start
startDailySpotifyJob();

// Optional: Endpoint zum manuell testen
app.get('/api/spotify/test', async (req, res) => {
  const result = await testScrapeNow();
  res.json(result);
});

// API Endpoint für Dashboard um Daten abzurufen
app.get('/api/spotify/latest-metrics', async (req, res) => {
  const metrics = await db.collection('spotify_metrics')
    .findOne({}, { sort: { date: -1 } });
  
  res.json(metrics);
});

app.listen(3001, () => {
  console.log('🎵 Server running on port 3001');
});
```

### 4. Datenbank (MongoDB - empfohlen)

```javascript
// database.js
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db('music-dashboard');

export default db;
```

`.env`:
```
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/music-dashboard
```

---

## Daten im Dashboard anzeigen

### Frontend: Metriken laden

```javascript
// src/hooks/useSpotifyMetrics.js
import { useEffect, useState } from 'react';

export const useSpotifyMetrics = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/spotify/latest-metrics')
      .then(res => res.json())
      .then(data => {
        setMetrics(data);
        setLoading(false);
      });
  }, []);

  return { metrics, loading };
};
```

### Dashboard nutzen

```javascript
// MusicDashboard.jsx
import { useSpotifyMetrics } from './hooks/useSpotifyMetrics';

export default function MusicDashboard() {
  const { metrics, loading } = useSpotifyMetrics();

  if (loading) return <div>Loading Spotify data...</div>;

  return (
    <div>
      {/* Ersetze Mock-Daten mit echten Daten */}
      <KPICard
        label="Monthly Listeners"
        value={metrics?.monthlyListeners || 0}
        trend={5}
      />
      
      <KPICard
        label="All-Time Streams"
        value={metrics?.allTimeStreams || 0}
        trend={8}
      />

      <KPICard
        label="Followers"
        value={metrics?.followers || 0}
        trend={3}
      />
    </div>
  );
}
```

---

## Historie tracken (optional aber cool)

### Daten über Zeit visualisieren

```javascript
// Get historical data for chart
app.get('/api/spotify/history', async (req, res) => {
  const last30days = await db.collection('spotify_metrics')
    .find({})
    .sort({ date: -1 })
    .limit(30)
    .toArray();

  res.json(last30days);
});
```

```javascript
// Dashboard: Monthly trend
const getMonthlyTrend = async () => {
  const history = await fetch('/api/spotify/history')
    .then(r => r.json());

  return history.reverse().map(entry => ({
    date: new Date(entry.date).toLocaleDateString('de-DE'),
    listeners: entry.monthlyListeners
  }));
};
```

---

## Troubleshooting

### Problem: "Timeout waiting for selector"
**Lösung:** Spotify Seite braucht länger zum Laden
```javascript
// Erhöhe den Timeout
await page.waitForSelector('main', { timeout: 45000 }); // 45 Sekunden
```

### Problem: "Could not find monthly listeners"
**Lösung:** Spotify ändert HTML-Struktur
- Öffne https://open.spotify.com/artist/[ID]
- Rechtsklick → Inspect → Finde das Element mit den Zahlen
- Update den Selector im Code

### Problem: Browser crasht auf Server
**Lösung:** Puppeteer braucht mehr RAM
```javascript
const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage' // ← Das hilft!
  ]
});
```

---

## Deployment Tipps

### Auf Heroku/Vercel deployen

1. `package.json`:
```json
{
  "engines": {
    "node": "18.x"
  },
  "scripts": {
    "start": "node server.js"
  }
}
```

2. Buildpack für Puppeteer:
```bash
heroku buildpacks:add jontewks/puppeteer
```

### Auf eigenem Server (VPS)

1. Server Setup:
```bash
apt-get update
apt-get install -y chromium-browser

# Node.js installieren
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs
```

2. PM2 für Dauerhafte Ausführung:
```bash
npm install -g pm2
pm2 start server.js
pm2 startup
pm2 save
```

---

## Was jetzt noch fehlt:

1. **Andere Plattformen**
   - Deezer API (einfacher als Spotify!)
   - YouTube Music Scraper
   - Apple Music (kompliziert)

2. **Vergleiche**
   - Welche Plattform bringt die meisten Streams?
   - Geografische Verteilung

3. **Alerts**
   - "Du hast 10k neue Monthly Listener!" Notification

---

## Security Notes

✅ **Safe:**
- 1 Request pro Tag
- User Agent gesetzt
- Headless Browser

❌ **Nicht tun:**
- Mehrfach pro Stunde scrapen
- Daten weiterverkaufen
- Andere Artists scrapen ohne Erlaubnis

---

## Support

Wenn etwas nicht funktioniert:
1. Check die Browser Console für Errors
2. Teste manuell: `/api/spotify/test`
3. Check die Selektoren (Spotify kann HTML ändern)

Los geht's! 🚀
