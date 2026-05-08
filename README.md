# 1streem

Spotify Stream Aggregator für Artists. Zeigt Total Streams, Songanzahl, Durchschnitt pro Song und Top 10 — aus **allen** Tracks deines Artist-Profils inklusive "Enthalten in".

Live: <https://1streem.vercel.app>

## Stack

Vite + React 18 + Tailwind CSS 3, Frontend-only auf Vercel. Keine API-Keys im Repo, kein OAuth.

## Wie kommen die Zahlen rein?

Die Spotify Web API liefert keine globalen Stream-Counts pro Track. Daher zwei Strategien:

### Phase 1 — Manuelle Eingabe via Vercel Env Vars

Du liest die Zahlen aus [Spotify for Artists](https://artists.spotify.com) ab und trägst sie als Env Vars in Vercel ein. Dashboard zeigt sie sofort. Update = Vars anpassen + Redeploy.

| Env Var | Beispiel | Erklärung |
|---|---|---|
| `VITE_ARTIST_NAME` | `Lou FTMKZ` | Anzeigename oben im Header |
| `VITE_TOTAL_STREAMS` | `2456789` | All-time Total Streams (S4A → Audience) |
| `VITE_SONG_COUNT` | `42` | Anzahl Songs |
| `VITE_STATS_AS_OF` | `2026-05-08` | Datum, an dem die Zahlen abgegriffen wurden |
| `VITE_TOP_TRACKS_JSON` | siehe unten | JSON-Array der Top 10 |

`VITE_TOP_TRACKS_JSON` Format:

```json
[
  {"name":"FRIEDRICHSHAIN","streams":987654},
  {"name":"STAUB","streams":543210},
  {"name":"...","streams":123456}
]
```

In Vercel: Project → Settings → Environment Variables → Add. Eine Zeile pro Var, alle als Production. JSON-String als ein einzeiliger String einfügen. Anschließend Deployments → ⋯ → Redeploy.

### Phase 2 — Auto-Update via Backend-Scraper (kommt)

Ein Backend (Railway, Puppeteer) loggt sich täglich mit deinem S4A-Cookie ein, scraped die Zahlen, exposed `/api/stats`. Du setzt dann nur noch:

| Env Var | Beispiel |
|---|---|
| `VITE_BACKEND_URL` | `https://1streem-backend.up.railway.app` |

Ist das gesetzt, ignoriert der Frontend die manuellen Vars. Setup-Anleitung kommt im nächsten Schritt.

## Lokale Entwicklung

```bash
npm install
npm run dev
```

Lokale Env Vars in `.env.local` (siehe `.env.example`).

## Build

```bash
npm run build
npm run preview
```

## Verhalten ohne Daten

Wenn weder `VITE_BACKEND_URL` noch die manuellen Vars gesetzt sind, zeigt das Dashboard überall `—`. Keine Mock-Zahlen. Status-Pill rechts oben sagt `kein data`.
