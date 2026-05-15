import { useEffect, useMemo, useRef, useState } from 'react';

// =============================================================================
// 1streem — Multi-Platform Stream Aggregator
// Storage: localStorage (key: 1streem-songs-v2). Auto-migrates from v1.
// =============================================================================

const DASH = '—';
const STORAGE_KEY = '1streem-songs-v2';
const LEGACY_KEY = '1streem-songs-v1';
const ARTIST_NAME = import.meta.env.VITE_ARTIST_NAME || 'Lou FTMKZ';

const PLATFORMS = [
  { id: 'spotify', label: 'Spotify', short: 'Spotify', color: '#1DB954' },
  { id: 'apple', label: 'Apple Music', short: 'Apple', color: '#A2AAAD' },
  { id: 'youtube', label: 'YouTube', short: 'YouTube', color: '#FF0000' },
  { id: 'amazon', label: 'Amazon Music', short: 'Amazon', color: '#46C3D0' },
];
const ALL_TAB = { id: 'all', label: 'Alle', short: 'Alle', color: '#fafafa' };
const TABS = [ALL_TAB, ...PLATFORMS];

const lookupTab = (id) => TABS.find((t) => t.id === id) || ALL_TAB;
const isPlatform = (id) => PLATFORMS.some((p) => p.id === id);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const emptyPlatformBools = () =>
  PLATFORMS.reduce((o, p) => ({ ...o, [p.id]: true }), {});
const emptyPlatformNums = () =>
  PLATFORMS.reduce((o, p) => ({ ...o, [p.id]: 0 }), {});

function migrateSong(s) {
  if (
    s &&
    typeof s === 'object' &&
    s.streams &&
    typeof s.streams === 'object' &&
    s.platforms &&
    typeof s.platforms === 'object'
  ) {
    return {
      id: s.id || uuid(),
      name: s.name || '',
      date: s.date || '',
      platforms: { ...emptyPlatformBools(), ...s.platforms },
      streams: { ...emptyPlatformNums(), ...s.streams },
    };
  }
  // Legacy v1: { streams: number } — treat as Spotify only
  return {
    id: s?.id || uuid(),
    name: s?.name || '',
    date: s?.date || '',
    platforms: emptyPlatformBools(),
    streams: {
      ...emptyPlatformNums(),
      spotify: Number(s?.streams) || 0,
    },
  };
}

function loadSongs() {
  try {
    const v2 = localStorage.getItem(STORAGE_KEY);
    if (v2) {
      const arr = JSON.parse(v2);
      if (Array.isArray(arr)) return arr.map(migrateSong);
    }
  } catch {}
  try {
    const v1 = localStorage.getItem(LEGACY_KEY);
    if (v1) {
      const arr = JSON.parse(v1);
      if (Array.isArray(arr)) return arr.map(migrateSong);
    }
  } catch {}
  return [];
}

function fmt(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return DASH;
  return Number(n).toLocaleString('de-DE');
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function songTotal(song) {
  return PLATFORMS.reduce((sum, p) => {
    if (!song.platforms?.[p.id]) return sum;
    return sum + (Number(song.streams?.[p.id]) || 0);
  }, 0);
}

// dd.mm.yy(yy) date helpers --------------------------------------------------
function formatDateInput(raw) {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}
function parseDateInput(input) {
  if (!input) return '';
  const m = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (!m) return null;
  let [, dd, mm, yy] = m;
  if (yy.length === 2) yy = `20${yy}`;
  dd = dd.padStart(2, '0');
  mm = mm.padStart(2, '0');
  const d = new Date(`${yy}-${mm}-${dd}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() !== Number(yy)) return null;
  if (d.getUTCMonth() + 1 !== Number(mm)) return null;
  if (d.getUTCDate() !== Number(dd)) return null;
  return `${yy}-${mm}-${dd}`;
}

// =============================================================================
// Main
// =============================================================================

export default function App() {
  const [songs, setSongs] = useState(loadSongs);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const fileInputRef = useRef(null);
  const heroRef = useRef(null);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
    } catch {}
  }, [songs]);

  // Detect when the big Hero leaves the viewport so we can show the
  // compact hero sticky under the tabs.
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { rootMargin: '-40px 0px 0px 0px', threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const activeTab = lookupTab(tab);
  const accent = activeTab.color;

  // Sorted, filtered
  const sortedByDate = useMemo(
    () =>
      [...songs].sort((a, b) => {
        const da = a.date || '0000-00-00';
        const db = b.date || '0000-00-00';
        return db.localeCompare(da);
      }),
    [songs],
  );

  const filteredForList = useMemo(() => {
    let list = sortedByDate;
    if (isPlatform(tab)) list = list.filter((s) => s.platforms?.[tab]);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    return list;
  }, [sortedByDate, search, tab]);

  // Metrics
  const { totalStreams, songCount, avg, top10, heroLabel } = useMemo(() => {
    if (tab === 'all') {
      const total = songs.reduce((s, x) => s + songTotal(x), 0);
      const top = [...songs]
        .map((s) => ({ ...s, _val: songTotal(s) }))
        .filter((s) => s._val > 0)
        .sort((a, b) => b._val - a._val)
        .slice(0, 10);
      return {
        totalStreams: total,
        songCount: songs.length,
        avg: songs.length ? Math.round(total / songs.length) : null,
        top10: top,
        heroLabel: 'Total Streams · Alle Plattformen',
      };
    }
    const enabled = songs.filter((s) => s.platforms?.[tab]);
    const total = enabled.reduce(
      (s, x) => s + (Number(x.streams?.[tab]) || 0),
      0,
    );
    const top = enabled
      .map((s) => ({ ...s, _val: Number(s.streams?.[tab]) || 0 }))
      .filter((s) => s._val > 0)
      .sort((a, b) => b._val - a._val)
      .slice(0, 10);
    return {
      totalStreams: total,
      songCount: enabled.length,
      avg: enabled.length ? Math.round(total / enabled.length) : null,
      top10: top,
      heroLabel: `Total Streams · ${activeTab.label}`,
    };
  }, [tab, songs, activeTab.label]);

  // Mutators
  const addSong = ({ name, date }) => {
    if (!name?.trim()) return;
    setSongs((s) => [
      ...s,
      {
        id: uuid(),
        name: name.trim(),
        date: date || '',
        platforms: emptyPlatformBools(),
        streams: emptyPlatformNums(),
      },
    ]);
    setShowAdd(false);
  };

  const setPlatformStreams = (id, platformId, value) => {
    setSongs((all) =>
      all.map((s) =>
        s.id === id
          ? {
              ...s,
              streams: { ...s.streams, [platformId]: Number(value) || 0 },
            }
          : s,
      ),
    );
  };

  const togglePlatform = (id, platformId) => {
    setSongs((all) =>
      all.map((s) =>
        s.id === id
          ? {
              ...s,
              platforms: {
                ...s.platforms,
                [platformId]: !s.platforms[platformId],
              },
            }
          : s,
      ),
    );
  };

  const deleteSong = (id) => {
    if (!window.confirm('Song löschen?')) return;
    setSongs((s) => s.filter((x) => x.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const nextEditableId = (currentId) => {
    const idx = filteredForList.findIndex((s) => s.id === currentId);
    return idx >= 0 && idx + 1 < filteredForList.length
      ? filteredForList[idx + 1].id
      : null;
  };

  // Backup / restore
  const downloadBackup = () => {
    const payload = {
      app: '1streem',
      version: 2,
      artist: ARTIST_NAME,
      exportedAt: new Date().toISOString(),
      songs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `1streem-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const pickRestoreFile = () => fileInputRef.current?.click();
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawSongs = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.songs)
          ? parsed.songs
          : null;
      if (!rawSongs) throw new Error('Datei enthält keine Songs.');
      const cleaned = rawSongs
        .filter((x) => x && typeof x.name === 'string')
        .map(migrateSong);
      setPendingImport({ songs: cleaned, fileName: file.name });
    } catch (err) {
      setPendingImport({ error: err.message || 'Datei nicht lesbar.' });
    }
  };
  const confirmImport = () => {
    if (pendingImport?.songs) setSongs(pendingImport.songs);
    setPendingImport(null);
  };

  // ---------------------------------------------------------------------------

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-neutral-100 antialiased"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=search]::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
        input[type=search]::-webkit-search-decoration { -webkit-appearance: none; }
        .tabs-scroll::-webkit-scrollbar { display: none; }
        .tabs-scroll {
          scrollbar-width: none;
          touch-action: pan-x;
          overscroll-behavior-x: contain;
        }
      `}</style>

      {/* Sticky top zone — header + tabs + compact hero */}
      <div
        className="sticky top-0 z-30 bg-[#0a0a0a]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <header className="border-b border-neutral-900">
          <div className="max-w-3xl mx-auto px-6 py-3 flex items-baseline gap-3">
            <span className="text-base font-bold tracking-tight">1streem</span>
            <span className="text-xs text-neutral-500">· {ARTIST_NAME}</span>
          </div>
        </header>
        <TabBar tabs={TABS} active={tab} onSelect={setTab} />
        <div
          className="border-b overflow-hidden transition-all duration-200 ease-out"
          style={{
            borderColor: heroVisible ? 'transparent' : '#171717',
            maxHeight: heroVisible ? 0 : 48,
            opacity: heroVisible ? 0 : 1,
          }}
        >
          <div className="max-w-3xl mx-auto px-6 py-2.5 flex items-baseline justify-between gap-4">
            <span className="text-[10px] uppercase tracking-widest text-neutral-500 truncate">
              {tab === 'all' ? 'Alle Plattformen' : activeTab.label}
            </span>
            <span
              className="mono text-base font-bold tabular-nums whitespace-nowrap"
              style={{ color: totalStreams > 0 ? accent : '#404040' }}
            >
              {fmt(totalStreams)}
            </span>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-10">
        {/* Hero */}
        <section ref={heroRef}>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-4">
            {heroLabel}
          </p>
          <p
            className="mono font-bold tracking-tight tabular-nums leading-none"
            style={{
              color: totalStreams > 0 ? accent : '#404040',
              fontSize: 'clamp(3rem, 12vw, 7rem)',
            }}
          >
            {fmt(totalStreams)}
          </p>
        </section>

        {/* Secondary stats */}
        <section className="grid grid-cols-2 gap-8 border-t border-neutral-900 pt-6">
          <Stat label="Songs" value={fmt(songCount)} />
          <Stat label="Ø pro Song" value={fmt(avg)} />
        </section>

        {/* Top 10 */}
        <section>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-6">
            Top 10 · All Time High
          </p>
          {top10.length > 0 ? (
            <ol className="divide-y divide-neutral-900">
              {top10.map((t, i) => (
                <li key={t.id} className="flex items-center gap-4 py-3">
                  <span className="mono text-xs text-neutral-600 w-6 text-right tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-neutral-200">{t.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-600 mt-0.5">
                      {t.date || DASH}
                    </div>
                  </div>
                  <span
                    className="mono text-sm tabular-nums whitespace-nowrap"
                    style={{ color: accent }}
                  >
                    {fmt(t._val)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-neutral-700 text-sm">{DASH}</p>
          )}
        </section>

        {/* Catalog / Platform songs */}
        <section>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-4">
            {tab === 'all' ? 'Katalog' : `Songs auf ${activeTab.label}`}
          </p>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 relative">
              <input
                type="search"
                placeholder="Suche..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded pl-3 pr-9 py-2 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700"
                style={{ fontSize: '16px' }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Suche löschen"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-200 w-7 h-7 flex items-center justify-center text-lg leading-none rounded"
                >
                  ×
                </button>
              )}
            </div>
            {tab === 'all' && (
              <button
                onClick={() => setShowAdd(!showAdd)}
                className="px-4 py-2 rounded font-bold text-sm text-black whitespace-nowrap"
                style={{ backgroundColor: accent }}
              >
                {showAdd ? '× Abbrechen' : '+ Song'}
              </button>
            )}
          </div>

          {tab === 'all' && showAdd && (
            <div className="mb-4">
              <AddForm
                accent={accent}
                onSave={addSong}
                onCancel={() => setShowAdd(false)}
              />
            </div>
          )}

          {filteredForList.length === 0 ? (
            <p className="text-neutral-700 text-sm py-12 text-center">
              {search
                ? 'Keine Treffer.'
                : tab === 'all'
                  ? 'Noch keine Songs. Tap auf + um den ersten hinzuzufügen.'
                  : `Keine Songs auf ${activeTab.label} aktiviert. Wechsel zu "Alle" und aktivier die Plattform pro Song.`}
            </p>
          ) : tab === 'all' ? (
            <ul className="divide-y divide-neutral-900">
              {filteredForList.map((song) => (
                <CatalogRow
                  key={song.id}
                  song={song}
                  onTogglePlatform={(pid) => togglePlatform(song.id, pid)}
                  onDelete={() => deleteSong(song.id)}
                />
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-neutral-900">
              {filteredForList.map((song) => (
                <PlatformRow
                  key={song.id}
                  song={song}
                  platformId={tab}
                  accent={accent}
                  editing={editingId === song.id}
                  onEdit={() => setEditingId(song.id)}
                  onSave={(v) => setPlatformStreams(song.id, tab, v)}
                  onCancel={() => setEditingId(null)}
                  onNext={() => setEditingId(nextEditableId(song.id))}
                />
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer
        className="border-t border-neutral-900 mt-8"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-2 text-xs">
          <button
            onClick={downloadBackup}
            className="px-3 py-2 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 transition-colors"
          >
            Backup
          </button>
          <button
            onClick={pickRestoreFile}
            className="px-3 py-2 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 transition-colors"
          >
            Wiederherstellen
          </button>
          <span className="text-neutral-700 ml-auto mono tabular-nums">
            {songs.length} {songs.length === 1 ? 'Song' : 'Songs'}
          </span>
        </div>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {pendingImport && (
        <Modal onClose={() => setPendingImport(null)}>
          {pendingImport.error ? (
            <>
              <h3 className="text-base font-bold text-neutral-100">
                Datei nicht lesbar
              </h3>
              <p className="text-sm text-neutral-400">{pendingImport.error}</p>
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setPendingImport(null)}
                  className="px-4 py-2 text-sm font-bold rounded text-black"
                  style={{ backgroundColor: accent }}
                >
                  OK
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-base font-bold text-neutral-100">
                Backup einspielen?
              </h3>
              <p className="text-sm text-neutral-400">
                <span className="mono text-neutral-200">
                  {pendingImport.fileName}
                </span>{' '}
                enthält{' '}
                <span className="mono text-neutral-200 tabular-nums">
                  {pendingImport.songs.length}
                </span>{' '}
                Songs. Aktuelle{' '}
                <span className="mono text-neutral-200 tabular-nums">
                  {songs.length}
                </span>{' '}
                werden ersetzt.
              </p>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => setPendingImport(null)}
                  className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-neutral-300"
                >
                  Abbrechen
                </button>
                <button
                  onClick={confirmImport}
                  className="px-4 py-2 text-sm font-bold rounded text-black"
                  style={{ backgroundColor: accent }}
                >
                  Ersetzen
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function TabBar({ tabs, active, onSelect }) {
  const containerRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const el = activeRef.current;
      const container = containerRef.current;
      const elLeft = el.offsetLeft;
      const elRight = elLeft + el.offsetWidth;
      const visLeft = container.scrollLeft;
      const visRight = visLeft + container.offsetWidth;
      if (elLeft < visLeft || elRight > visRight) {
        container.scrollTo({
          left: elLeft - container.offsetWidth / 2 + el.offsetWidth / 2,
          behavior: 'smooth',
        });
      }
    }
  }, [active]);

  return (
    <nav className="border-b border-neutral-900 bg-[#0a0a0a]">
      <div className="max-w-3xl mx-auto">
        <div
          ref={containerRef}
          className="tabs-scroll flex gap-1 overflow-x-auto px-6"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              ref={t.id === active ? activeRef : null}
              onClick={() => onSelect(t.id)}
              className="py-4 px-2 text-sm font-semibold tracking-tight border-b-2 -mb-px transition-colors whitespace-nowrap"
              style={{
                color: t.id === active ? t.color : '#737373',
                borderColor: t.id === active ? t.color : 'transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2">
        {label}
      </p>
      <p className="mono text-2xl font-bold tabular-nums text-neutral-100">{value}</p>
    </div>
  );
}

// In ALL tab: catalog management. No inline stream editing. Platform pills.
function CatalogRow({ song, onTogglePlatform, onDelete }) {
  const total = songTotal(song);
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-neutral-200 truncate">{song.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-600 mt-0.5">
            {song.date || DASH}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {PLATFORMS.map((p) => {
              const enabled = !!song.platforms?.[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => onTogglePlatform(p.id)}
                  className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider transition-colors"
                  style={{
                    backgroundColor: enabled ? p.color : 'transparent',
                    color: enabled ? '#0a0a0a' : '#525252',
                    border: `1px solid ${enabled ? p.color : '#262626'}`,
                  }}
                >
                  {p.short}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="mono text-sm tabular-nums text-right text-neutral-100 min-w-[5.5rem]">
            {total > 0 ? fmt(total) : DASH}
          </div>
          <button
            onClick={onDelete}
            className="text-neutral-700 hover:text-red-500 text-lg leading-none px-2 py-1"
            aria-label="Löschen"
          >
            ×
          </button>
        </div>
      </div>
    </li>
  );
}

// In platform tabs: tap to edit streams for that platform.
// No delete here — deletion is a catalog action (Alle tab only).
function PlatformRow({
  song,
  platformId,
  accent,
  editing,
  onEdit,
  onSave,
  onCancel,
  onNext,
}) {
  const inputRef = useRef(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      inputRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [editing]);

  const value = Number(song.streams?.[platformId]) || 0;

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-neutral-200 truncate">{song.name}</div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-600 mt-0.5">
          {song.date || DASH}
        </div>
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          defaultValue={value || ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              skipBlurRef.current = true;
              onSave(e.currentTarget.value);
              onNext();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              skipBlurRef.current = true;
              onCancel();
            }
          }}
          onBlur={(e) => {
            if (skipBlurRef.current) {
              skipBlurRef.current = false;
              return;
            }
            onSave(e.currentTarget.value);
            onCancel();
          }}
          className="mono w-32 text-right bg-neutral-900 border rounded px-2 py-1 tabular-nums focus:outline-none"
          style={{ borderColor: accent, fontSize: '16px' }}
        />
      ) : (
        <button
          onClick={onEdit}
          className="mono w-32 text-right tabular-nums text-sm py-1 px-2 rounded hover:bg-neutral-900 transition-colors"
          style={{ color: value > 0 ? accent : '#525252' }}
        >
          {value > 0 ? fmt(value) : DASH}
        </button>
      )}
    </li>
  );
}

function AddForm({ accent, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [dateErr, setDateErr] = useState(false);

  const inputStyle = { fontSize: '16px' };
  const inputClass =
    'w-full bg-[#0a0a0a] border border-neutral-800 rounded px-3 py-3 text-base focus:outline-none focus:border-neutral-700';
  const labelClass =
    'block text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2';

  const submit = (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    let isoDate = '';
    if (dateInput.trim()) {
      const parsed = parseDateInput(dateInput.trim());
      if (parsed === null) {
        setDateErr(true);
        return;
      }
      isoDate = parsed;
    }
    onSave({ name, date: isoDate });
  };

  return (
    <form
      onSubmit={submit}
      className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-5"
    >
      <div>
        <label className={labelClass}>Songname</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          className={inputClass}
          style={inputStyle}
        />
      </div>
      <div>
        <label className={labelClass}>Release (dd.mm.yy)</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="dd.mm.yy"
          value={dateInput}
          onChange={(e) => {
            setDateInput(formatDateInput(e.target.value));
            setDateErr(false);
          }}
          maxLength={10}
          className={inputClass + ' mono tabular-nums'}
          style={{ ...inputStyle, borderColor: dateErr ? '#ef4444' : undefined }}
        />
        {dateErr && (
          <p className="text-xs text-red-400 mt-1">Ungültiges Datum</p>
        )}
      </div>
      <p className="text-xs text-neutral-600">
        Alle 4 Plattformen werden default aktiviert. Stream-Zahlen trägst du in
        den jeweiligen Plattform-Tabs ein.
      </p>
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-neutral-300"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-bold rounded text-black"
          style={{ backgroundColor: accent }}
        >
          Speichern
        </button>
      </div>
    </form>
  );
}

function Modal({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-sm w-full space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
