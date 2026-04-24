# 🎵 1streem Launch Guide

Willkommen! Hier ist dein **kompletter Deployment Path** für 1streem.

**Deine Daten:**
- 📧 Email: lou@fmcrew.de
- 👤 GitHub: louftmkz
- 🎨 Domain: 1streem.vercel.app
- 🎵 Artist ID: 3LaYDsZXr5HlfDY7vtxq0v

---

## Phase 1: Vorbereitungen (30 Min)

### 1.1 MongoDB Atlas Setup (kostenlos)

1. Gehe auf https://www.mongodb.com/cloud/atlas
2. Klick "Sign Up" (oder mit Google)
3. Email: `lou@fmcrew.de`
4. Erstelle einen Cluster:
   - Provider: AWS
   - Region: Frankfurt (eu-central-1) - für beste Performance
   - Tier: Free Tier (M0)
   - Cluster Name: `1streem`
5. **Warte** bis der Cluster erstellt ist (5-10 Min)

**Connection String kopieren:**
1. Cluster → "Connect"
2. "Drivers" wählen
3. Node.js wählen
4. Connection String kopieren → Speichern für später!

Sieht so aus:
```
mongodb+srv://username:password@1streem.mongodb.net/myFirstDatabase?retryWrites=true&w=majority
```

### 1.2 Spotify Developer App erstellen

1. Gehe auf https://developer.spotify.com/dashboard
2. Log In mit deinem Spotify Account
3. "Create an App"
   - Name: `1streem`
   - Beschreibung: `Music Analytics Dashboard`
   - Akzeptiere Terms
   - "Create" klicken
4. **Client ID & Client Secret kopieren** (beide brauchst du!)

Speichern in einer Textdatei:
```
CLIENT_ID: xxxxxxxxxxxxx
CLIENT_SECRET: xxxxxxxxxxxxx
ARTIST_ID: 3LaYDsZXr5HlfDY7vtxq0v
```

### 1.3 Spotify Redirect URI registrieren

1. Im Spotify Dashboard → App Settings
2. Scrolle zu "Redirect URIs"
3. Füge diese ein:
   ```
   http://localhost:5173/callback
   http://localhost:3001/callback
   https://1streem.vercel.app/callback
   ```
4. Speichern!

---

## Phase 2: GitHub Repo Setup (10 Min)

### 2.1 Repo forken/erstellen

Ich stelle dir einen **Repo-Template** zur Verfügung:

```bash
git clone https://github.com/louftmkz/1streem.git
cd 1streem
```

**Struktur:**
```
1streem/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── MusicDashboard.jsx (dein Dashboard)
│   │   ├── pages/
│   │   │   └── Callback.jsx (Spotify Login Callback)
│   │   ├── hooks/
│   │   │   └── useSpotifyMetrics.js
│   │   ├── services/
│   │   │   └── spotifyAuth.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.local (NICHT in Git!)
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── server.js
│   ├── spotify-daily-scraper.js
│   ├── routes/
│   │   └── spotify.js
│   ├── .env (NICHT in Git!)
│   └── package.json
├── .gitignore
└── README.md
```

### 2.2 .gitignore erstellen

```
# Environment Variables
.env
.env.local
.env.*.local

# Dependencies
node_modules/
dist/
.pnp

# Development
.DS_Store
.vscode
.idea

# Secrets
*.secret
credentials.json
```

### 2.3 Commit & Push

```bash
git add .
git commit -m "Initial commit: 1streem music analytics"
git push origin main
```

---

## Phase 3: Frontend Deployment auf Vercel (15 Min)

### 3.1 Vercel Projekt erstellen

1. Gehe auf https://vercel.com
2. Sign In mit GitHub
3. "Add New" → "Project"
4. Wähle dein `1streem` Repository
5. Framework: "Vite"
6. Root Directory: `./frontend`
7. **Build Command:** `npm run build`
8. **Output Directory:** `dist`

### 3.2 Environment Variables auf Vercel

Im Vercel Dashboard → Settings → Environment Variables:

```
VITE_SPOTIFY_CLIENT_ID=YOUR_CLIENT_ID_HERE
VITE_SPOTIFY_REDIRECT_URI=https://1streem.vercel.app/callback
VITE_BACKEND_URL=https://1streem-backend.vercel.app (oder Railway URL später)
```

### 3.3 Deploy!

Klick "Deploy" → Warte bis grün ✅

Deine Frontend läuft jetzt auf:
```
https://1streem.vercel.app
```

---

## Phase 4: Backend Deployment auf Railway (20 Min)

⚠️ **Wichtig:** Vercel Serverless Functions haben Zeitlimits. Für Cron-Jobs (tägliche Scraper) brauchst du einen "richtigen" Server.

**Railway.app ist perfekt dafür (kostenlos für Start):**

### 4.1 Railway Setup

1. Gehe auf https://railway.app
2. Sign In mit GitHub
3. "New Project" → "Deploy from GitHub"
4. Wähle `1streem` Repository
5. Railway erkennt automatisch die Root (Backend)

### 4.2 Environment Variables auf Railway

Im Railway Dashboard → Variables:

```
MONGODB_URI=mongodb+srv://user:pass@...
SPOTIFY_CLIENT_ID=YOUR_CLIENT_ID
SPOTIFY_CLIENT_SECRET=YOUR_CLIENT_SECRET
SPOTIFY_ARTIST_ID=3LaYDsZXr5HlfDY7vtxq0v
NODE_ENV=production
PORT=3001
```

### 4.3 Domain verbinden

Railway gibt dir eine URL:
```
https://1streem-backend-production-1234.up.railway.app
```

Diese kopierst du in Vercel als `VITE_BACKEND_URL`

### 4.4 Deploy!

Railway deployed automatisch beim Push zu Main ✅

---

## Phase 5: Spotify OAuth Flow Testen (10 Min)

### Test 1: Login-Button klicken
1. Gehe zu https://1streem.vercel.app
2. Klick "Connect Spotify"
3. Werde zu Spotify Login weitergeleitet
4. Log In mit deinem Spotify Account
5. Genehmige die Berechtigung
6. Sollte zu `/callback` redirected werden

### Test 2: Daten laden
Nach dem Login sollten deine echten Daten erscheinen:
- Monatliche Hörer
- Streams
- Follower
- Top Songs

---

## Phase 6: Daily Scraper aktivieren (5 Min)

Der Scraper läuft automatisch um 00:00 Uhr (Mitternacht).

**Manuell testen:**
```
https://1streem-backend-production-1234.up.railway.app/api/spotify/test
```

Sollte deine aktuellen Metriken returnen.

---

## Phase 7: Monitoring & Maintenance

### Logs checken
- **Frontend Errors:** Vercel Dashboard → Deployments → Logs
- **Backend Errors:** Railway Dashboard → Logs

### Daily Scraper Check
Jede Nacht um 00:05 Uhr prüfen ob neue Daten da sind:
```javascript
// Dashboard macht automatisch:
fetch('/api/spotify/latest-metrics')
```

---

## 🚀 Checkliste zum Abhaken

### Vorbereitung
- [ ] MongoDB Atlas Cluster erstellt
- [ ] Spotify Developer App erstellt
- [ ] Client ID & Secret kopiert
- [ ] Redirect URIs registriert

### GitHub
- [ ] Repo erstellt
- [ ] .gitignore korrekt
- [ ] Alles gepusht

### Vercel Frontend
- [ ] Projekt erstellt
- [ ] Environment Variables gesetzt
- [ ] Erfolgreich deployed auf 1streem.vercel.app
- [ ] Frontend lädt ohne Fehler

### Railway Backend
- [ ] Projekt erstellt
- [ ] Environment Variables gesetzt
- [ ] Erfolgreich deployed
- [ ] Backend URL funktioniert

### Integration
- [ ] Login-Button funktioniert
- [ ] Spotify OAuth Flow funktioniert
- [ ] Daten laden nach dem Login
- [ ] Daily Scraper läuft (um 00:00 Uhr)

### Final
- [ ] https://1streem.vercel.app ist live!
- [ ] Alle echten Spotify-Daten anzeigen!
- [ ] Dark Mode lädt & speichert preference
- [ ] Mobile responsiv auf iPhone

---

## Wenn etwas nicht funktioniert:

### Frontend lädt nicht
```bash
# Frontend Logs
vercel logs 1streem
```

### Spotify Login funktioniert nicht
1. Check ob Redirect URI bei Spotify registriert ist
2. Check ob Client ID in Vercel Environment korrekt ist
3. Browser Console öffnen (F12) → Errors?

### Daten laden nicht
```bash
# Backend Logs
railway logs
```

### Daily Scraper läuft nicht
1. Railway Dashboard → Logs checken
2. Manual Test: `/api/spotify/test` aufrufen
3. MongoDB Connection String korrekt?

---

## Fragen?

Bei Fragen im Setup, schreib mir exakt:
1. Welcher Schritt?
2. Welcher Fehler?
3. Screenshot der Fehlermeldung

Dann helfe ich direkt! 

Los geht's! 🚀
