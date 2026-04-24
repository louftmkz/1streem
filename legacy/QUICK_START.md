# 🚀 1streem Quick Start - Los geht's!

Deine Infos:
- 📧 **Email:** lou@fmcrew.de
- 👤 **GitHub:** louftmkz  
- 🎨 **Domain:** 1streem.vercel.app
- 🎵 **Artist ID:** 3LaYDsZXr5HlfDY7vtxq0v

---

## ⏱️ Timeline: 2-3 Stunden bis Live

### 0. Vorbereitung (Jetzt!)

Lade dir diese Dateien herunter und speichere sie:
- ✅ 1STREEM_LAUNCH_GUIDE.md (kompletter Guide)
- ✅ spotify-daily-scraper.js (Backend Scraper)
- ✅ backend-server.js (Express Server)
- ✅ MusicDashboard-updated.jsx (Dashboard mit Login & Dark Mode)
- ✅ frontend-package.json
- ✅ backend-package.json

---

## 1️⃣ Spotify Developer Setup (10 Min)

### 1.1 Developer Account & App

```
https://developer.spotify.com/dashboard
→ "Create an App"
→ Name: 1streem
→ Copy: Client ID & Client Secret
```

**Speichern in Textdatei:**
```
SPOTIFY_CLIENT_ID=xxxxx
SPOTIFY_CLIENT_SECRET=xxxxx
```

### 1.2 Redirect URIs registrieren

Im Spotify Dashboard → App Settings → Redirect URIs:
```
http://localhost:5173/callback
http://localhost:3001/callback
https://1streem.vercel.app/callback
```

Speichern!

---

## 2️⃣ MongoDB Atlas Setup (10 Min)

```
https://www.mongodb.com/cloud/atlas
→ Sign Up
→ Create Cluster
  - Name: 1streem
  - Provider: AWS
  - Region: Frankfurt (eu-central-1)
  - Tier: Free (M0)
→ Warte 5-10 Min bis Cluster ready
→ Connect → Drivers → Node.js
→ Copy Connection String
```

**Speichern:**
```
MONGODB_URI=mongodb+srv://user:pass@1streem.mongodb.net/...
```

---

## 3️⃣ GitHub Repo erstellen (5 Min)

```bash
# 1. Neues Repo auf GitHub erstellen
# Name: 1streem
# Privat (optional)

# 2. Lokal clonen
git clone https://github.com/louftmkz/1streem.git
cd 1streem

# 3. Struktur erstellen
mkdir frontend backend

# 4. Deine Dateien reinpacken:
# frontend/ → MusicDashboard-updated.jsx, package.json, etc.
# backend/ → spotify-daily-scraper.js, server.js, package.json

# 5. Commit & Push
git add .
git commit -m "Initial 1streem setup"
git push origin main
```

---

## 4️⃣ Frontend auf Vercel (10 Min)

```
https://vercel.com
→ "Add New Project"
→ Wähle 1streem GitHub Repo
→ Framework: Vite
→ Root Directory: ./frontend
→ Build Command: npm run build
→ Output: dist
```

**Environment Variables hinzufügen:**
```
VITE_SPOTIFY_CLIENT_ID=xxxxx (von Spotify)
VITE_SPOTIFY_REDIRECT_URI=https://1streem.vercel.app/callback
VITE_BACKEND_URL=https://1streem-backend-production.up.railway.app (später!)
```

Klick "Deploy" → ✅ Live auf 1streem.vercel.app

---

## 5️⃣ Backend auf Railway (15 Min)

```
https://railway.app
→ "New Project"
→ "Deploy from GitHub"
→ Wähle 1streem Repo
→ Railway erkennt Backend automatisch
```

**Environment Variables:**
```
MONGODB_URI=mongodb+srv://... (von MongoDB)
SPOTIFY_CLIENT_ID=xxxxx
SPOTIFY_CLIENT_SECRET=xxxxx
SPOTIFY_ARTIST_ID=3LaYDsZXr5HlfDY7vtxq0v
NODE_ENV=production
PORT=3001
```

Railway deployed automatisch → Backend läuft! ✅

**Backend URL kopieren:**
```
https://1streem-backend-production-xxxxx.up.railway.app
```

Gib diese URL in Vercel `VITE_BACKEND_URL` ein!

---

## 6️⃣ Testing (5 Min)

### Test 1: Frontend lädt
```
https://1streem.vercel.app
→ Sollte Login-Screen zeigen
```

### Test 2: Spotify Login funktioniert
```
Klick "Mit Spotify verbinden"
→ Werde zu Spotify Login weitergeleitet
→ Log In & genehmige
→ Sollte zu https://1streem.vercel.app/callback gehen
→ Dann zu Dashboard
```

### Test 3: Metriken laden
```
Nach dem Login sollten deine echten Spotify-Daten angezeigt werden:
- Monthly Listeners
- All-Time Streams
- Top Songs
- Followers
```

### Test 4: Daily Scraper
```
Gehe zu:
https://1streem-backend-production-xxxxx.up.railway.app/api/spotify/test

Sollte JSON mit deinen Metriken zurückgeben
```

---

## 🎉 Du bist Live!

```
✅ https://1streem.vercel.app
   → Dein Music Analytics Dashboard
   → Mit echten Spotify-Daten
   → Täglich automatisch aktualisiert
```

---

## 📋 Troubleshooting

### Problem: "Cannot find module"
```bash
# Backend
cd backend
npm install

# Frontend  
cd frontend
npm install
```

### Problem: Spotify Login funktioniert nicht
1. Check: Ist deine Vercel URL in Spotify Redirect URIs registriert?
2. Check: VITE_SPOTIFY_CLIENT_ID in Vercel Environment korrekt?
3. Check: Browser Console (F12) → Welcher Fehler?

### Problem: Daten laden nicht nach Login
1. Check: Backend URL korrekt in Vercel VITE_BACKEND_URL?
2. Check: MongoDB URI korrekt auf Railway?
3. Test: `/api/spotify/test` direkt aufrufen

### Problem: Scraper läuft nicht
```
Railway Dashboard → Logs checken
Sollte sehen: "✅ Daily Spotify Scraper started"
```

---

## 🔧 Was zu tun ist nach dem Launch

### Kurz-fristig (diese Woche)
- [ ] Daten 1-2 Tage beobachten (lädt der Scraper?)
- [ ] Mit verschiedenen Browsern testen
- [ ] Mobile auf iPhone testen

### Mittelfristig (nächste Woche)
- [ ] Andere Plattformen (Deezer, YouTube) hinzufügen
- [ ] Historie Chart hinzufügen (letzte 30 Tage)
- [ ] Sharing Feature (Share deinen Status auf Twitter)

### Langfristig (später)
- [ ] Multi-Artist Support (Team Feature)
- [ ] Custom Domain (1streem.com)
- [ ] Mobile App
- [ ] Public Profiles für andere Artists

---

## 🆘 Support

Wenn etwas nicht funktioniert:

1. Schreib genau wo das Problem ist:
   - "Frontend lädt nicht" oder "Spotify Login funktioniert nicht"
   
2. Screenshot vom Fehler

3. Browser Console Fehler (F12 → Console)

Dann kann ich dir schnell helfen! 

---

**Ready? Los geht's! 🚀**

Fang mit Punkt 1️⃣ an und arbeite dich durch.
Wenn du stecken bleibst, sag Bescheid!
