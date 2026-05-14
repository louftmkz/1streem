# 1streem

Spotify Stream Aggregator für Artists. Du pflegst deine Songs + Streams direkt in der App; das Dashboard berechnet Total, Durchschnitt und Top 10 dynamisch daraus.

Live: <https://1streem.vercel.app>

## Stack

Vite + React 18 + Tailwind CSS 3. Frontend-only auf Vercel. Daten im `localStorage` des Browsers (pro Gerät), Export/Import via JSON-Zwischenablage.

## Lokal

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Konfiguration

Eine optionale Env Var im Vercel-Dashboard (oder `.env.local`):

| Env Var | Beispiel | Zweck |
|---|---|---|
| `VITE_ARTIST_NAME` | `Lou FTMKZ` | Anzeigename oben im Header |

Sonst keine Konfig nötig. Songs werden komplett in der App eingetragen.

## Datenhaltung

Songs leben im `localStorage` des Browsers (Key: `1streem-songs-v1`). Das heißt:

- **Pro Gerät separat.** iPhone-PWA und Desktop-Browser sind unabhängig.
- **Browser-Cache leeren = Daten weg.** Drum: hin und wieder Export-JSON in die Zwischenablage kopieren (Footer-Button) und sicher ablegen.
- **Cross-Device-Sync:** Export auf Gerät A → Import auf Gerät B.
