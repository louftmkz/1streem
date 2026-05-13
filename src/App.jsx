import { useEffect, useState } from 'react';

// =============================================================================
// 1streem — Spotify Stream Aggregator
// Single-file dashboard. Shows real Spotify-for-Artists numbers
// once they're configured (via backend or env vars).
// Until then: shows "—" everywhere. No mock numbers.
// =============================================================================

const ACCENT = '#1DB954'; // Spotify green
const DASH = '—';

export default function App() {
  const [stats, setStats] = useState(null);
  const [state, setState] = useState('loading'); // loading | empty | ready | error
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    loadStats()
      .then((s) => {
        if (s) {
          setStats(s);
          setState('ready');
        } else {
          setState('empty');
        }
      })
      .catch((e) => {
        console.error('Stats load failed:', e);
        setErrorMsg(e.message);
        setState('error');
      });
  }, []);

  const total = stats?.totalStreams;
  const count = stats?.songCount;
  const avg =
    Number.isFinite(total) && Number.isFinite(count) && count > 0
      ? Math.round(total / count)
      : null;

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-neutral-100 antialiased"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      `}</style>

      {/* Header — extends background into iOS status-bar area */}
      <header
        className="border-b border-neutral-900 bg-[#0a0a0a]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-bold tracking-tight">1streem</span>
            {stats?.artistName && (
              <span className="text-sm text-neutral-500">· {stats.artistName}</span>
            )}
          </div>
          <StatusBadge state={state} source={stats?.source} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-20">
        {/* Hero — Total Streams */}
        <section>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-4">
            Total Streams · Spotify · All Time
          </p>
          <p
            className="mono font-bold tracking-tight tabular-nums leading-none"
            style={{
              color: stats ? ACCENT : '#404040',
              fontSize: 'clamp(3rem, 12vw, 7rem)',
            }}
          >
            {fmtNum(total)}
          </p>
          {stats?.asOf && (
            <p className="text-xs text-neutral-600 mt-4">
              Stand: {stats.asOf}
            </p>
          )}
        </section>

        {/* Secondary stats */}
        <section className="grid grid-cols-2 md:grid-cols-3 gap-8 border-t border-neutral-900 pt-10">
          <Stat label="Songs" value={fmtNum(count)} />
          <Stat label="Ø pro Song" value={fmtNum(avg)} />
          <Stat
            label="Quelle"
            value={stats?.source ? sourceLabel(stats.source) : DASH}
            small
          />
        </section>

        {/* Top 10 */}
        <section>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-6">
            Top 10 · All Time High
          </p>
          {stats?.topTracks?.length > 0 ? (
            <ol className="divide-y divide-neutral-900">
              {stats.topTracks.slice(0, 10).map((t, i) => (
                <li
                  key={`${t.name}-${i}`}
                  className="flex items-baseline gap-4 py-3"
                >
                  <span className="mono text-xs text-neutral-600 w-6 text-right tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1 truncate text-neutral-200">{t.name}</span>
                  <span
                    className="mono text-sm tabular-nums whitespace-nowrap"
                    style={{ color: ACCENT }}
                  >
                    {fmtNum(t.streams)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-neutral-700 text-sm">{DASH}</p>
          )}
        </section>
      </main>

      <footer
        className="border-t border-neutral-900 mt-24"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-3xl mx-auto px-6 py-8 text-xs text-neutral-600 leading-relaxed">
          {state === 'empty' && <EmptyHint />}
          {state === 'error' && (
            <p className="text-red-400">Fehler beim Laden: {errorMsg}</p>
          )}
          {state === 'ready' && stats?.source === 'manual' && (
            <p>
              Daten manuell gepflegt via Vercel Env Vars · Update durch Anpassen
              der Vars + Redeploy.
            </p>
          )}
          {state === 'ready' && stats?.source === 'backend' && (
            <p>Auto-update via Backend-Scraper.</p>
          )}
        </div>
      </footer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Subcomponents
// -----------------------------------------------------------------------------

function Stat({ label, value, small = false }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2">
        {label}
      </p>
      <p
        className={
          small
            ? 'text-sm text-neutral-300'
            : 'mono text-2xl font-bold tabular-nums text-neutral-100'
        }
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ state, source }) {
  if (state === 'loading') {
    return <span className="text-xs text-neutral-600">laden...</span>;
  }
  if (state === 'empty') {
    return (
      <span className="text-xs text-neutral-500 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
        kein data
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="text-xs text-red-400 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        error
      </span>
    );
  }
  return (
    <span className="text-xs flex items-center gap-2" style={{ color: ACCENT }}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
      />
      live · {sourceLabel(source)}
    </span>
  );
}

function EmptyHint() {
  return (
    <div className="space-y-3">
      <p className="text-neutral-400">Noch keine Daten konfiguriert.</p>
      <p>
        Setze Vercel Env Vars für manuelle Eingabe (Phase 1) — oder{' '}
        <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-neutral-300">
          VITE_BACKEND_URL
        </code>{' '}
        wenn der S4A-Scraper läuft (Phase 2).
      </p>
      <p className="text-neutral-600">Siehe README für die Var-Liste.</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Data loading — backend first, then manual env vars, else null
// -----------------------------------------------------------------------------

async function loadStats() {
  // Primary: stats.json from the GitHub-Actions scraper (committed daily)
  try {
    const res = await fetch(`/stats.json?t=${Date.now()}`); // bust cache
    if (res.ok) {
      const data = await res.json();
      // The scraper writes the same shape we already use, plus a fetchedAt
      return {
        artistName: data.artistName,
        songCount: data.songCount,
        totalStreams: data.totalStreams,
        topTracks: data.topTracks || [],
        asOf: data.asOf,
        source: 'auto',
      };
    }
  } catch (e) {
    console.warn('stats.json not available yet:', e.message);
  }

  // Optional: external backend (only if VITE_BACKEND_URL is set)
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/stats`);
      if (res.ok) {
        const data = await res.json();
        return { ...data, source: 'backend' };
      }
      console.warn('Backend responded with', res.status);
    } catch (e) {
      console.warn('Backend unreachable, falling back to manual:', e.message);
    }
  }

  // Fallback: manual via env vars
  const total = parseNum(import.meta.env.VITE_TOTAL_STREAMS);
  const count = parseNum(import.meta.env.VITE_SONG_COUNT);
  let topTracks = [];
  try {
    const raw = import.meta.env.VITE_TOP_TRACKS_JSON;
    if (raw) topTracks = JSON.parse(raw);
  } catch (e) {
    console.warn('VITE_TOP_TRACKS_JSON parse error:', e.message);
  }

  const hasAny =
    Number.isFinite(total) || Number.isFinite(count) || topTracks.length > 0;
  if (hasAny) {
    return {
      artistName: import.meta.env.VITE_ARTIST_NAME || null,
      songCount: Number.isFinite(count) ? count : null,
      totalStreams: Number.isFinite(total) ? total : null,
      topTracks: Array.isArray(topTracks) ? topTracks : [],
      asOf: import.meta.env.VITE_STATS_AS_OF || null,
      source: 'manual',
    };
  }

  return null;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function fmtNum(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return n.toLocaleString('de-DE');
}

function parseNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sourceLabel(source) {
  if (source === 'manual') return 'manual';
  if (source === 'backend') return 'auto';
  return source || DASH;
}
