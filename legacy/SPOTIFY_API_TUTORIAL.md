# Spotify API Integration Tutorial

## Überblick

Dieses Tutorial zeigt dir, wie du dein Music Dashboard mit **echten Spotify-Daten** verbindest. Am Ende werden deine Streams, Hörer und Follower automatisch aktualisiert.

**Was du am Ende haben wirst:**
- ✅ Echte Spotify-Daten in deinem Dashboard
- ✅ Automatische tägliche Updates
- ✅ Cross-Platform Daten (später auch Deezer, Apple Music, etc.)

---

## Phase 1: Spotify Developer Account Setup (10 Minuten)

### Schritt 1: Developer Account erstellen

1. Gehe auf https://developer.spotify.com
2. Klick "Log In" (oben rechts)
3. Melde dich mit deinem Spotify Account an (oder erstelle einen)
4. Akzeptiere die Terms & Conditions
5. Du gelangst zu deinem Dashboard

### Schritt 2: Eine App erstellen

1. Im Developer Dashboard auf der linken Seite: **"Apps"** oder **"Create an App"** klicken
2. App Name: `Music Analytics Dashboard` (oder wie du willst)
3. Beschreibung: `Personal music analytics and streaming metrics`
4. Häkchen setzen: "I agree to Spotify's Developer Terms"
5. "Create" klicken

### Schritt 3: API Credentials kopieren

Nach dem Erstellen siehst du:
- **Client ID** (wichtig!)
- **Client Secret** (GEHEIM! Niemals in Git pushen!)

Diese brauchst du später. Speichern!

---

## Phase 2: Authentication verstehen

### Wie funktioniert Spotify OAuth?

```
Du         → Spotify Login    → Spotify gibt dir Token
  ↓
Dein App   → Token + API Call → Spotify API → Streams Daten
  ↓
Dashboard zeigt echte Daten
```

Es gibt 2 Wege:

**1. Authorization Code Flow** (für dein Dashboard)
- Nutzer loggt sich mit Spotify ein
- App bekommt Zugriff auf deren Daten
- Sauberer & sicherer

**2. Client Credentials Flow** (für Backend-Services)
- App authentifiziert sich selbst
- Keine Nutzer-Anmeldung nötig
- Für tägliche Auto-Updates besser

→ Wir nutzen **Authorization Code Flow** für dein Dashboard

---

## Phase 3: Dashboard Code anpassen

### Schritt 1: Umgebungsvariablen einrichten

Erstelle eine `.env.local` Datei im Root-Verzeichnis deines Projekts:

```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173/callback
```

**WICHTIG:**
- `VITE_` Prefix ist für Vite (deinen Build-Tool)
- Client ID ist deine App ID von Spotify
- Redirect URI muss in Spotify Developer Settings registriert sein

### Schritt 2: Spotify Auth Service erstellen

Erstelle eine neue Datei `src/services/spotifyAuth.js`:

```javascript
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-library-read'
];

// 1. Nutzer zum Spotify Login weiterleiten
export const redirectToSpotifyLogin = () => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    show_dialog: true
  });
  
  window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
};

// 2. Token aus URL auslesen (nach dem Login)
export const getAuthCode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('code');
};

// 3. Auth Code gegen Access Token tauschen (braucht Backend!)
export const exchangeCodeForToken = async (code) => {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      client_secret: import.meta.env.VITE_SPOTIFY_CLIENT_SECRET // ⚠️ NICHT im Frontend!
    })
  });
  
  return await response.json();
};
```

**⚠️ WICHTIG:** Client Secret darf NICHT im Frontend sein! Siehe Phase 4.

---

## Phase 4: Backend für Token-Exchange (WICHTIG!)

Du **brauchst einen Backend** weil du den `Client Secret` nicht im Frontend speichern darfst!

### Einfache Node.js/Express Lösung:

Erstelle `backend/routes/spotify-auth.js`:

```javascript
import express from 'express';
import axios from 'axios';

const router = express.Router();

router.post('/exchange-code', async (req, res) => {
  const { code } = req.body;
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
  const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // Token sicher in HttpOnly Cookie speichern
    res.cookie('spotify_token', response.data.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict'
    });

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: 'Token exchange failed' });
  }
});

export default router;
```

`.env` Backend:
```
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret
SPOTIFY_REDIRECT_URI=http://localhost:5173/callback
```

---

## Phase 5: Spotify API Calls

### Daten fetchen:

```javascript
// src/services/spotifyApi.js

export const getSpotifyData = async (accessToken) => {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  try {
    // 1. Top Songs (aktuell)
    const topTracksRes = await fetch(
      'https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=long_term',
      { headers }
    );
    const topTracks = await topTracksRes.json();

    // 2. Top Songs (monatlich)
    const monthlyRes = await fetch(
      'https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=short_term',
      { headers }
    );
    const monthlyTracks = await monthlyRes.json();

    // 3. User Profil (für Follower)
    const profileRes = await fetch(
      'https://api.spotify.com/v1/me',
      { headers }
    );
    const profile = await profileRes.json();

    return {
      topTracks: topTracks.items,
      monthlyTracks: monthlyTracks.items,
      followers: profile.followers.total,
      username: profile.display_name
    };
  } catch (error) {
    console.error('Spotify API Error:', error);
    return null;
  }
};
```

**⚠️ Problem:** Spotify API gibt dir **keine Rohdaten wie "monatliche Hörer"**!

Die API gibt dir:
- ✅ Deine Top Songs (was du am meisten hörst)
- ✅ Follower (deines Profils)
- ❌ NICHT: Echte Stream-Zahlen, monatliche Hörer, etc.

→ Das sind proprietäre Metriken von Spotify (nur für dich einsehbar im Admin Dashboard)

---

## Phase 6: Das "Streams & Hörer" Problem

### Die Realität:

Spotify zeigt dir im **Spotify for Artists Dashboard**:
- Streams pro Song
- Monatliche Hörer
- Länder-Verteilung
- Etc.

Aber die **Spotify API gibt diese Daten nicht her** (aus geschäftlichen Gründen).

### Lösungen:

**Option A: Web Scraping** (risky, gegen Terms of Service)
- Automatisches Scraping des Spotify for Artists Dashboards
- Könnte IP-banned werden

**Option B: Manual Data Entry** (tedious)
- Jeden Monat manuell die Zahlen reinschreiben
- Dann speichern & historisieren

**Option C: Andere Plattformen nutzen** 
- YouTube Music API gibt Stream-Counts
- Apple Music hat bessere API-Dokumentation
- Deezer API ist offener

**Option D: Hybrid-Ansatz** (empfohlen)
```
Spotify: Top Songs, Follower (per API)
         + Monthly Manual Update der Stream-Counts
Deezer:  Echte Stream-Zahlen (API verfügbar!)
YouTube: Stream-Zahlen direkt
```

---

## Phase 7: Praktische Implementierung

### Schritt 1: Login-Button im Dashboard

```javascript
// In deinem Dashboard
import { redirectToSpotifyLogin } from './services/spotifyAuth';

export const LoginSection = () => {
  return (
    <button 
      onClick={redirectToSpotifyLogin}
      className="px-6 py-3 bg-green-600 text-white rounded-full font-bold"
    >
      Connect Spotify
    </button>
  );
};
```

### Schritt 2: Callback Handler

Erstelle `src/pages/Callback.jsx`:

```javascript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthCode } from '../services/spotifyAuth';

export default function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const code = getAuthCode();
    
    if (!code) {
      setError('Kein Auth Code gefunden');
      return;
    }

    // Backend aufrufen um Token zu tauschen
    fetch('/api/spotify/exchange-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // Token ist jetzt in HttpOnly Cookie
          navigate('/dashboard');
        } else {
          setError('Token exchange failed');
        }
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) return <div>Fehler: {error}</div>;
  return <div>Authentifizierung läuft...</div>;
}
```

### Schritt 3: Dashboard Daten laden

```javascript
// In deinem MusicDashboard.jsx
useEffect(() => {
  const loadSpotifyData = async () => {
    try {
      const res = await fetch('/api/spotify/get-data'); // Backend API
      const data = await res.json();
      
      setTopSongs(data.topTracks.map(track => ({
        name: track.name,
        // ⚠️ Streams musst du manuell hinzufügen oder von Deezer holen
        streams: Math.random() * 100000, // Placeholder
        listeners: Math.random() * 50000
      })));
      
      setMetrics(prev => ({
        ...prev,
        followers: data.followers
      }));
    } catch (error) {
      console.error('Failed to load Spotify data:', error);
    }
  };

  loadSpotifyData();
}, []);
```

---

## Phase 8: Nächste Schritte

### Was du noch brauchst:

1. **Backend Server** (Node.js, Python, etc.)
   - Für sicheren Token-Exchange
   - Für Daten-Caching
   - Für tägliche Updates

2. **Datenbank** (optional aber empfohlen)
   - Um monatliche Metriken zu speichern
   - Um Historie zu tracken

3. **Scheduled Jobs** (z.B. mit node-cron)
   ```javascript
   cron.schedule('0 0 * * *', async () => {
     // Täglich um Mitternacht: Spotify-Daten abrufen
     const data = await getSpotifyData(accessToken);
     await saveToDatabase(data);
   });
   ```

4. **Stream-Daten** von anderen Plattformen
   - YouTube Music API
   - Deezer API
   - Apple Music (komplizierter)

---

## Checkliste

- [ ] Spotify Developer Account erstellt
- [ ] App registriert, Client ID & Secret kopiert
- [ ] `.env.local` mit Credentials
- [ ] OAuth Auth Service geschrieben
- [ ] Backend für Token-Exchange aufgesetzt
- [ ] Spotify API Test-Calls funktionieren
- [ ] Login-Button im Dashboard funktioniert
- [ ] Callback-Page funktioniert
- [ ] Erste echte Daten im Dashboard sichtbar

---

## Hilfreiche Links

- https://developer.spotify.com/documentation/web-api
- https://developer.spotify.com/documentation/general/authentication/authorization-code-flow
- https://developer.spotify.com/console
- https://developer.spotify.com/community

---

## Fragen?

Wenn du an einem Punkt hängst, beschreib genau wo das Problem ist und ich helfe dir!

Nächste Phase: Backend Setup, Datenbank & tägliche Updates
