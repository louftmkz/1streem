# 1streem

Music-Analytics-Dashboard. Aggregiert Spotify, Deezer, Apple Music, Amazon Music und YouTube in einer View.

Deployed auf Vercel: <https://1streem.vercel.app>

## Stack

Vite + React 18, Tailwind CSS 3, Recharts, Lucide. Aktuell Frontend-only mit Mock-Daten. Backend (Express + MongoDB + Puppeteer-Scraper) liegt unter `legacy/` und wird in einer späteren Phase auf Railway deployed.

## Lokale Entwicklung

```bash
npm install
npm run dev
```

Läuft auf <http://localhost:5173>.

## Build

```bash
npm run build
npm run preview
```

## Mock-Modus aus, Spotify-OAuth an

1. Spotify Developer App anlegen: <https://developer.spotify.com/dashboard>
2. Redirect URI registrieren: `https://1streem.vercel.app/callback`
3. In Vercel → Settings → Environment Variables setzen:
   - `VITE_SPOTIFY_CLIENT_ID`
   - `VITE_SPOTIFY_REDIRECT_URI` = `https://1streem.vercel.app/callback`
4. In `src/components/MusicDashboard.jsx` `MOCK_MODE` auf `false` setzen.
5. Redeploy.

## Nächste Schritte

- OAuth-Callback-Seite (`/callback`) bauen, die den Auth-Code einlöst
- Backend auf Railway deployen (Code unter `legacy/`)
- Daily Scraper via `node-cron` aufsetzen oder auf Spotify Web API umbauen
- MongoDB Atlas Cluster verbinden

Siehe `legacy/1STREEM_LAUNCH_GUIDE.md` für den ursprünglichen Full-Stack-Deployment-Plan.
