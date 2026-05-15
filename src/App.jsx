import { useEffect, useMemo, useRef, useState } from 'react';

// =============================================================================
// 1streem — Multi-Platform Stream Aggregator
// Storage (localStorage):
//   - 1streem-songs-v3        : array of songs
//   - 1streem-platforms-v1    : array of active platforms (incl. hidden)
// =============================================================================

const DASH = '—';
const SONGS_STORAGE = '1streem-songs-v3';
const SONGS_LEGACY_V2 = '1streem-songs-v2';
const SONGS_LEGACY_V1 = '1streem-songs-v1';
const PLATFORMS_STORAGE = '1streem-platforms-v1';
const ARTIST_NAME = import.meta.env.VITE_ARTIST_NAME || 'Lou FTMKZ';
const SUPPORT_EMAIL = 'lou+1streem@fmcrew.de';

const ALL_TAB = { id: 'all', label: 'Alle', short: 'Alle', color: '#fafafa' };

// Library of pre-defined platforms (one-click add from + menu)
const PLATFORM_LIBRARY = [
  { id: 'spotify',        label: 'Spotify',              short: 'Spotify',    color: '#1DB954' },
  { id: 'apple',          label: 'Apple Music',          short: 'Apple',      color: '#A2AAAD' },
  { id: 'youtube-music',  label: 'YouTube Music',        short: 'YT Music',   color: '#FF0000' },
  { id: 'amazon',         label: 'Amazon Music',         short: 'Amazon',     color: '#46C3D0' },
  { id: 'tidal',          label: 'Tidal',                short: 'Tidal',      color: '#00FFFF' },
  { id: 'deezer',         label: 'Deezer',               short: 'Deezer',     color: '#A238FF' },
  { id: 'soundcloud',     label: 'SoundCloud',           short: 'SoundCloud', color: '#FF5500' },
  { id: 'beatport',       label: 'Beatport',             short: 'Beatport',   color: '#A4DA64' },
  { id: 'pandora',        label: 'Pandora',              short: 'Pandora',    color: '#3668FF' },
  { id: 'audiomack',      label: 'Audiomack',            short: 'Audiomack',  color: '#FFA200' },
  { id: 'anghami',        label: 'Anghami',              short: 'Anghami',    color: '#B660CD' },
  { id: 'boomplay',       label: 'Boomplay',             short: 'Boomplay',   color: '#FFB400' },
  { id: 'vk-music',       label: 'VK Music',             short: 'VK',         color: '#4A76A8' },
  { id: 'yandex-music',   label: 'Yandex Music',         short: 'Yandex',     color: '#FFCC00' },
  { id: 'qq-music',       label: 'QQ Music',             short: 'QQ',         color: '#31C27C' },
  { id: 'netease',        label: 'NetEase Cloud Music',  short: 'NetEase',    color: '#E64545' },
  { id: 'joox',           label: 'Joox',                 short: 'Joox',       color: '#00BFA6' },
];

const DEFAULT_PLATFORM_IDS = ['spotify', 'apple', 'youtube-music', 'amazon'];

const libraryById = (id) => PLATFORM_LIBRARY.find((p) => p.id === id);

// -----------------------------------------------------------------------------
// Storage / migration
// -----------------------------------------------------------------------------

function migrateSongsV2ToV3(arr) {
  return arr.map((s) => {
    const streams = { ...(s.streams || {}) };
    const platforms = { ...(s.platforms || {}) };
    if ('youtube' in streams) {
      streams['youtube-music'] = streams.youtube;
      delete streams.youtube;
    }
    if ('youtube' in platforms) {
      platforms['youtube-music'] = platforms.youtube;
      delete platforms.youtube;
    }
    return {
      id: s.id || uuid(),
      name: s.name || '',
      date: s.date || '',
      cover: s.cover || null,
      platforms,
      streams,
    };
  });
}

function migrateSongV1(s) {
  return {
    id: s?.id || uuid(),
    name: s?.name || '',
    date: s?.date || '',
    cover: null,
    platforms: {
      spotify: true,
      apple: true,
      'youtube-music': true,
      amazon: true,
    },
    streams: {
      spotify: Number(s?.streams) || 0,
      apple: 0,
      'youtube-music': 0,
      amazon: 0,
    },
  };
}

function loadSongs() {
  try {
    const v3 = localStorage.getItem(SONGS_STORAGE);
    if (v3) {
      const arr = JSON.parse(v3);
      if (Array.isArray(arr)) return arr;
    }
  } catch {}
  try {
    const v2 = localStorage.getItem(SONGS_LEGACY_V2);
    if (v2) {
      const arr = JSON.parse(v2);
      if (Array.isArray(arr)) return migrateSongsV2ToV3(arr);
    }
  } catch {}
  try {
    const v1 = localStorage.getItem(SONGS_LEGACY_V1);
    if (v1) {
      const arr = JSON.parse(v1);
      if (Array.isArray(arr)) return arr.map(migrateSongV1);
    }
  } catch {}
  return [];
}

function defaultPlatforms() {
  return DEFAULT_PLATFORM_IDS.map((id) => {
    const lib = libraryById(id);
    return { ...lib, hidden: false, builtIn: true };
  });
}

function loadPlatforms() {
  try {
    const raw = localStorage.getItem(PLATFORMS_STORAGE);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((p) => ({
          id: p.id,
          label: p.label || '',
          short: p.short || p.label || '',
          color: p.color || '#888888',
          hidden: !!p.hidden,
          builtIn: !!p.builtIn,
        })).filter((p) => p.id);
      }
    }
  } catch {}
  return defaultPlatforms();
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function fmt(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return DASH;
  return Number(n).toLocaleString('de-DE');
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function songTotal(song, visiblePlatforms) {
  return visiblePlatforms.reduce((sum, p) => {
    if (!song.platforms?.[p.id]) return sum;
    return sum + (Number(song.streams?.[p.id]) || 0);
  }, 0);
}

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
  const [platforms, setPlatforms] = useState(loadPlatforms);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [showAddPlatform, setShowAddPlatform] = useState(false);
  const [showEditPlatforms, setShowEditPlatforms] = useState(false);
  const [showTestimonial, setShowTestimonial] = useState(false);
  const fileInputRef = useRef(null);
  const heroRef = useRef(null);
  const stickyRef = useRef(null);
  const touchStartRef = useRef(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [view, setView] = useState('top10');

  // Persist
  useEffect(() => {
    try { localStorage.setItem(SONGS_STORAGE, JSON.stringify(songs)); } catch {}
  }, [songs]);
  useEffect(() => {
    try { localStorage.setItem(PLATFORMS_STORAGE, JSON.stringify(platforms)); } catch {}
  }, [platforms]);

  // Visible (non-hidden) platforms — drive UI everywhere
  const visiblePlatforms = useMemo(() => platforms.filter((p) => !p.hidden), [platforms]);

  // Tabs derived from visible platforms
  const TABS = useMemo(() => [ALL_TAB, ...visiblePlatforms], [visiblePlatforms]);
  const activeTab = TABS.find((t) => t.id === tab) || ALL_TAB;
  const accent = activeTab.color;

  // If active tab no longer visible (e.g. user hid it), fallback to "all"
  useEffect(() => {
    if (tab !== 'all' && !visiblePlatforms.some((p) => p.id === tab)) {
      setTab('all');
    }
  }, [visiblePlatforms, tab]);

  // Scroll-driven hero shrink
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const heroEl = heroRef.current;
      if (!heroEl) return;
      const stickyH = stickyRef.current?.offsetHeight ?? 100;
      const heroBottom = heroEl.getBoundingClientRect().bottom;
      const range = 100;
      const p = Math.max(0, Math.min(1, (stickyH + range - heroBottom) / range));
      setScrollProgress(p);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    measure();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Sorted by date desc
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
    if (tab !== 'all') list = list.filter((s) => s.platforms?.[tab]);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    return list;
  }, [sortedByDate, search, tab]);

  // Metrics
  const { totalStreams, songCount, avg, top10, heroLabel } = useMemo(() => {
    if (tab === 'all') {
      const total = songs.reduce((s, x) => s + songTotal(x, visiblePlatforms), 0);
      const top = [...songs]
        .map((s) => ({ ...s, _val: songTotal(s, visiblePlatforms) }))
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
    const total = enabled.reduce((s, x) => s + (Number(x.streams?.[tab]) || 0), 0);
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
  }, [tab, songs, visiblePlatforms, activeTab.label]);

  // Mutators — songs
  const addSong = ({ name, date }) => {
    if (!name?.trim()) return;
    const platBools = {};
    const platNums = {};
    for (const p of platforms) {
      platBools[p.id] = true;
      platNums[p.id] = 0;
    }
    setSongs((s) => [
      ...s,
      {
        id: uuid(),
        name: name.trim(),
        date: date || '',
        cover: null,
        platforms: platBools,
        streams: platNums,
      },
    ]);
    setShowAdd(false);
  };

  const setPlatformStreams = (id, platformId, value) => {
    setSongs((all) =>
      all.map((s) =>
        s.id === id
          ? { ...s, streams: { ...s.streams, [platformId]: Number(value) || 0 } }
          : s,
      ),
    );
  };

  const togglePlatformOnSong = (id, platformId) => {
    setSongs((all) =>
      all.map((s) =>
        s.id === id
          ? { ...s, platforms: { ...s.platforms, [platformId]: !s.platforms[platformId] } }
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
    return idx >= 0 && idx + 1 < filteredForList.length ? filteredForList[idx + 1].id : null;
  };

  // Mutators — platforms
  const addPlatformFromLibrary = (id) => {
    const lib = libraryById(id);
    if (!lib) return;
    setPlatforms((all) => {
      const existing = all.find((p) => p.id === id);
      if (existing) {
        return all.map((p) => (p.id === id ? { ...p, hidden: false } : p));
      }
      return [...all, { ...lib, hidden: false, builtIn: true }];
    });
    // Ensure new platform is enabled on all songs by default
    setSongs((all) =>
      all.map((s) => ({
        ...s,
        platforms: { ...s.platforms, [id]: s.platforms?.[id] ?? true },
        streams: { ...s.streams, [id]: s.streams?.[id] ?? 0 },
      })),
    );
  };

  const addCustomPlatform = ({ label, color }) => {
    let baseId = slugify(label);
    if (!baseId) return;
    // Ensure uniqueness against all existing platform ids
    const allIds = new Set(platforms.map((p) => p.id));
    let id = baseId;
    let i = 1;
    while (allIds.has(id)) id = `${baseId}-${++i}`;
    const newPlatform = { id, label: label.trim(), short: label.trim(), color, hidden: false, builtIn: false };
    setPlatforms((all) => [...all, newPlatform]);
    setSongs((all) =>
      all.map((s) => ({
        ...s,
        platforms: { ...s.platforms, [id]: true },
        streams: { ...s.streams, [id]: 0 },
      })),
    );
  };

  const removePlatform = (id) => {
    if (!window.confirm('Plattform entfernen? Eingegebene Stream-Daten bleiben gespeichert.')) return;
    setPlatforms((all) => all.filter((p) => p.id !== id));
    if (tab === id) setTab('all');
  };

  const togglePlatformHidden = (id) => {
    setPlatforms((all) => all.map((p) => (p.id === id ? { ...p, hidden: !p.hidden } : p)));
  };

  const updatePlatformMeta = (id, updates) => {
    setPlatforms((all) => all.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  // Backup / restore
  const downloadBackup = () => {
    const payload = {
      app: '1streem',
      version: 3,
      artist: ARTIST_NAME,
      exportedAt: new Date().toISOString(),
      platforms,
      songs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
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
      const rawSongs = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.songs) ? parsed.songs : null;
      if (!rawSongs) throw new Error('Datei enthält keine Songs.');
      const isV3 = parsed && parsed.version === 3;
      const isV2Shape = rawSongs[0]?.streams && typeof rawSongs[0].streams === 'object';
      const cleaned = isV3
        ? rawSongs.filter((x) => x && typeof x.name === 'string')
        : isV2Shape
          ? migrateSongsV2ToV3(rawSongs.filter((x) => x && typeof x.name === 'string'))
          : rawSongs.filter((x) => x && typeof x.name === 'string').map(migrateSongV1);
      const importedPlatforms = Array.isArray(parsed?.platforms) ? parsed.platforms : null;
      setPendingImport({ songs: cleaned, platforms: importedPlatforms, fileName: file.name });
    } catch (err) {
      setPendingImport({ error: err.message || 'Datei nicht lesbar.' });
    }
  };
  const confirmImport = () => {
    if (pendingImport?.songs) {
      setSongs(pendingImport.songs);
      if (pendingImport.platforms?.length) setPlatforms(pendingImport.platforms);
    }
    setPendingImport(null);
  };

  // Swipe nav
  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };
  const handleTouchEnd = (e) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const elapsed = Date.now() - start.time;
    if (elapsed > 600) return;
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = TABS.findIndex((x) => x.id === tab);
    if (idx < 0) return;
    if (dx < 0 && idx < TABS.length - 1) setTab(TABS[idx + 1].id);
    else if (dx > 0 && idx > 0) setTab(TABS[idx - 1].id);
  };

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

      {/* Sticky top zone */}
      <div
        ref={stickyRef}
        className="sticky top-0 z-30 bg-[#0a0a0a]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <header className="border-b border-neutral-900">
          <div className="max-w-3xl mx-auto px-6 py-3 flex items-baseline gap-3">
            <span className="text-base font-bold tracking-tight">1streem</span>
            <span className="text-xs text-neutral-500">· {ARTIST_NAME}</span>
          </div>
        </header>
        <TabBar
          tabs={TABS}
          active={tab}
          onSelect={setTab}
          onAddPlatform={() => setShowAddPlatform(true)}
          onEditPlatforms={() => setShowEditPlatforms(true)}
        />
        <div
          className="border-b overflow-hidden"
          style={{
            borderColor: scrollProgress > 0.1 ? '#171717' : 'transparent',
            maxHeight: scrollProgress * 48,
            opacity: scrollProgress,
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

      <main
        className="max-w-3xl mx-auto px-6 py-8 space-y-10"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Hero */}
        <section ref={heroRef}>
          <p
            className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-4"
            style={{ opacity: 1 - scrollProgress }}
          >
            {heroLabel}
          </p>
          <p
            className="mono font-bold tracking-tight tabular-nums leading-none origin-top-left"
            style={{
              color: totalStreams > 0 ? accent : '#404040',
              fontSize: 'clamp(3rem, 12vw, 7rem)',
              opacity: 1 - scrollProgress,
              transform: `scale(${1 - scrollProgress * 0.7})`,
            }}
          >
            {fmt(totalStreams)}
          </p>
        </section>

        <section className="grid grid-cols-2 gap-8 border-t border-neutral-900 pt-6">
          <Stat label="Songs" value={fmt(songCount)} />
          <Stat label="Ø pro Song" value={fmt(avg)} />
        </section>

        {/* Toggle: Top 10 ↔ Songs */}
        <section>
          <div className="flex gap-6 border-b border-neutral-900 mb-6">
            <button
              onClick={() => setView('top10')}
              className="py-2 text-sm font-semibold tracking-tight border-b-2 -mb-px transition-colors whitespace-nowrap"
              style={{
                color: view === 'top10' ? accent : '#737373',
                borderColor: view === 'top10' ? accent : 'transparent',
              }}
            >
              Top 10 (All-Time Streams)
            </button>
            <button
              onClick={() => setView('songs')}
              className="py-2 text-sm font-semibold tracking-tight border-b-2 -mb-px transition-colors whitespace-nowrap"
              style={{
                color: view === 'songs' ? accent : '#737373',
                borderColor: view === 'songs' ? accent : 'transparent',
              }}
            >
              Alle Songs
            </button>
          </div>

          {view === 'top10' &&
            (top10.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {[0, 5].map((offset) => (
                  <div key={offset} className="space-y-3">
                    {top10.slice(offset, offset + 5).map((t, idx) => {
                      const rank = offset + idx + 1;
                      return (
                        <div key={t.id} className="rounded-lg border border-neutral-800 px-3 py-3">
                          <div className="text-[9px] uppercase tracking-widest text-neutral-600 mb-1">
                            {t.date || DASH}
                          </div>
                          <div className="flex items-baseline gap-1.5 mb-1">
                            <span className="mono text-[10px] text-neutral-600 tabular-nums shrink-0">
                              {String(rank).padStart(2, '0')}
                            </span>
                            <span className="text-sm text-neutral-200 truncate min-w-0">
                              {t.name}
                            </span>
                          </div>
                          <div className="mono text-sm tabular-nums whitespace-nowrap" style={{ color: accent }}>
                            {fmt(t._val)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-700 text-sm">{DASH}</p>
            ))}

          {view === 'songs' && (
            <>
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
                  <AddSongForm
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
                      platforms={visiblePlatforms}
                      visiblePlatforms={visiblePlatforms}
                      onTogglePlatform={(pid) => togglePlatformOnSong(song.id, pid)}
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
            </>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer
        className="border-t border-neutral-900 mt-8"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-2 text-xs flex-wrap">
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
          <button
            onClick={() => setShowTestimonial(true)}
            className="px-3 py-2 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 transition-colors"
          >
            Mitmachen?
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

      {/* Modals */}
      {pendingImport && (
        <Modal onClose={() => setPendingImport(null)}>
          {pendingImport.error ? (
            <>
              <h3 className="text-base font-bold text-neutral-100">Datei nicht lesbar</h3>
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
              <h3 className="text-base font-bold text-neutral-100">Backup einspielen?</h3>
              <p className="text-sm text-neutral-400">
                <span className="mono text-neutral-200">{pendingImport.fileName}</span>{' '}
                enthält{' '}
                <span className="mono text-neutral-200 tabular-nums">{pendingImport.songs.length}</span>{' '}
                Songs
                {pendingImport.platforms?.length ? (
                  <>
                    {' '}und{' '}
                    <span className="mono text-neutral-200 tabular-nums">
                      {pendingImport.platforms.length}
                    </span>{' '}
                    Plattformen
                  </>
                ) : null}
                . Aktuelle Daten werden ersetzt.
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

      {showAddPlatform && (
        <AddPlatformModal
          activePlatforms={platforms}
          onAddLibrary={(id) => {
            addPlatformFromLibrary(id);
            setShowAddPlatform(false);
          }}
          onAddCustom={(data) => {
            addCustomPlatform(data);
            setShowAddPlatform(false);
          }}
          onClose={() => setShowAddPlatform(false)}
        />
      )}

      {showEditPlatforms && (
        <EditPlatformsModal
          platforms={platforms}
          onToggleHidden={togglePlatformHidden}
          onUpdate={updatePlatformMeta}
          onRemove={removePlatform}
          onClose={() => setShowEditPlatforms(false)}
        />
      )}

      {showTestimonial && (
        <TestimonialModal
          email={SUPPORT_EMAIL}
          onClose={() => setShowTestimonial(false)}
        />
      )}
    </div>
  );
}

// =============================================================================
// Components
// =============================================================================

function TabBar({ tabs, active, onSelect, onAddPlatform, onEditPlatforms }) {
  const containerRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const el = activeRef.current;
      const c = containerRef.current;
      const elLeft = el.offsetLeft;
      const elRight = elLeft + el.offsetWidth;
      const visLeft = c.scrollLeft;
      const visRight = visLeft + c.offsetWidth;
      if (elLeft < visLeft || elRight > visRight) {
        c.scrollTo({
          left: elLeft - c.offsetWidth / 2 + el.offsetWidth / 2,
          behavior: 'smooth',
        });
      }
    }
  }, [active]);

  return (
    <nav className="border-b border-neutral-900 bg-[#0a0a0a]">
      <div className="max-w-3xl mx-auto">
        <div ref={containerRef} className="tabs-scroll flex gap-1 overflow-x-auto px-6">
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
          <div className="flex items-center ml-2 gap-1 shrink-0">
            <button
              onClick={onAddPlatform}
              className="p-2 text-neutral-500 hover:text-neutral-200 transition-colors"
              aria-label="Plattform hinzufügen"
              title="Plattform hinzufügen"
            >
              <PlusIcon />
            </button>
            <button
              onClick={onEditPlatforms}
              className="p-2 text-neutral-500 hover:text-neutral-200 transition-colors"
              aria-label="Plattformen verwalten"
              title="Plattformen verwalten"
            >
              <EditIcon />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2">{label}</p>
      <p className="mono text-2xl font-bold tabular-nums text-neutral-100">{value}</p>
    </div>
  );
}

function CatalogRow({ song, platforms, onTogglePlatform, onDelete }) {
  const total = songTotal(song, platforms);
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <Cover url={song.cover} size={44} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-neutral-200 truncate">{song.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-600 mt-0.5">
            {song.date || DASH}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {platforms.map((p) => {
              const enabled = !!song.platforms?.[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => onTogglePlatform(p.id)}
                  className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-normal tracking-wider transition-colors inline-flex items-center gap-1"
                  style={{
                    backgroundColor: 'transparent',
                    color: enabled ? p.color : '#525252',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: enabled ? `${p.color}55` : '#262626',
                  }}
                >
                  {enabled && (
                    <span aria-hidden="true" className="leading-none text-[9px]">
                      ✓
                    </span>
                  )}
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

function PlatformRow({ song, platformId, accent, editing, onEdit, onSave, onCancel, onNext }) {
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
      <div className="shrink-0">
        <Cover url={song.cover} size={40} />
      </div>
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

function AddSongForm({ accent, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [dateErr, setDateErr] = useState(false);

  const inputStyle = { fontSize: '16px' };
  const inputClass =
    'w-full bg-[#0a0a0a] border border-neutral-800 rounded px-3 py-3 text-base focus:outline-none focus:border-neutral-700';
  const labelClass = 'block text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2';

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
        {dateErr && <p className="text-xs text-red-400 mt-1">Ungültiges Datum</p>}
      </div>
      <p className="text-xs text-neutral-600">
        Alle aktivierten Plattformen werden default eingeschaltet. Stream-Zahlen trägst du in den
        jeweiligen Plattform-Tabs ein.
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

function AddPlatformModal({ activePlatforms, onAddLibrary, onAddCustom, onClose }) {
  const [mode, setMode] = useState('library'); // 'library' | 'custom'
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8b5cf6');

  const activeIds = new Set(activePlatforms.map((p) => p.id));
  const available = PLATFORM_LIBRARY.filter((p) => !activeIds.has(p.id));
  const hiddenActive = activePlatforms.filter((p) => p.hidden);

  const submitCustom = (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    onAddCustom({ label: name, color });
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-neutral-100">Plattform hinzufügen</h3>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-200 text-lg leading-none"
          aria-label="Schließen"
        >
          ×
        </button>
      </div>

      <div className="flex gap-4 border-b border-neutral-800 -mx-1">
        <button
          onClick={() => setMode('library')}
          className="py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
          style={{
            color: mode === 'library' ? '#fafafa' : '#737373',
            borderColor: mode === 'library' ? '#fafafa' : 'transparent',
          }}
        >
          Bekannte Plattform
        </button>
        <button
          onClick={() => setMode('custom')}
          className="py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
          style={{
            color: mode === 'custom' ? '#fafafa' : '#737373',
            borderColor: mode === 'custom' ? '#fafafa' : 'transparent',
          }}
        >
          Eigene Plattform
        </button>
      </div>

      {mode === 'library' && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {hiddenActive.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-widest text-neutral-500 pt-1">
                Versteckt — re-aktivieren
              </p>
              {hiddenActive.map((p) => (
                <PlatformPickerRow
                  key={p.id}
                  platform={p}
                  badge="Hidden"
                  onAdd={() => onAddLibrary(p.id)}
                />
              ))}
              <div className="border-t border-neutral-800 my-2" />
            </>
          )}
          {available.length === 0 && hiddenActive.length === 0 ? (
            <p className="text-sm text-neutral-500 py-4">
              Alle bekannten Plattformen sind bereits aktiv. Lege eine eigene Plattform an.
            </p>
          ) : (
            available.map((p) => (
              <PlatformPickerRow key={p.id} platform={p} onAdd={() => onAddLibrary(p.id)} />
            ))
          )}
        </div>
      )}

      {mode === 'custom' && (
        <form onSubmit={submitCustom} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              placeholder="z.B. SoundOn, Napster, Resso ..."
              className="w-full bg-[#0a0a0a] border border-neutral-800 rounded px-3 py-3 text-base focus:outline-none focus:border-neutral-700"
              style={{ fontSize: '16px' }}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2">
              Brand Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-12 h-12 rounded border border-neutral-800 bg-transparent cursor-pointer"
              />
              <span className="mono text-sm text-neutral-400 tabular-nums">{color.toUpperCase()}</span>
              <span
                className="ml-auto px-3 py-1 rounded-full text-xs uppercase tracking-wider"
                style={{ color, border: `1px solid ${color}55` }}
              >
                Vorschau
              </span>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-neutral-300"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-bold rounded text-black"
              style={{ backgroundColor: color }}
            >
              Anlegen
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function PlatformPickerRow({ platform, badge, onAdd }) {
  return (
    <button
      onClick={onAdd}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-neutral-800/60 text-left transition-colors"
    >
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: platform.color }}
      />
      <span className="flex-1 text-sm text-neutral-200">{platform.label}</span>
      {badge && (
        <span className="text-[9px] uppercase tracking-widest text-neutral-500">{badge}</span>
      )}
      <span className="text-neutral-500 text-lg leading-none">+</span>
    </button>
  );
}

function EditPlatformsModal({ platforms, onToggleHidden, onUpdate, onRemove, onClose }) {
  const [editingId, setEditingId] = useState(null);

  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-neutral-100">Plattformen verwalten</h3>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-200 text-lg leading-none"
          aria-label="Schließen"
        >
          ×
        </button>
      </div>

      {platforms.length === 0 ? (
        <p className="text-sm text-neutral-500 py-4">Keine Plattformen aktiv.</p>
      ) : (
        <ul className="space-y-1 max-h-[60vh] overflow-y-auto pr-1 -mx-1">
          {platforms.map((p) => (
            <EditPlatformRow
              key={p.id}
              platform={p}
              editing={editingId === p.id}
              onEdit={() => setEditingId(p.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(updates) => {
                onUpdate(p.id, updates);
                setEditingId(null);
              }}
              onToggleHidden={() => onToggleHidden(p.id)}
              onRemove={() => onRemove(p.id)}
            />
          ))}
        </ul>
      )}

      <p className="text-xs text-neutral-600 pt-2 border-t border-neutral-800">
        <strong className="text-neutral-400">Auge</strong> versteckt — Daten bleiben.{' '}
        <strong className="text-neutral-400">Mülleimer</strong> entfernt aus der Liste — Daten in
        Songs werden technisch behalten, kommen bei Re-Add zurück.
      </p>
    </Modal>
  );
}

function EditPlatformRow({ platform, editing, onEdit, onCancelEdit, onSaveEdit, onToggleHidden, onRemove }) {
  const [name, setName] = useState(platform.label);
  const [color, setColor] = useState(platform.color);

  useEffect(() => {
    if (editing) {
      setName(platform.label);
      setColor(platform.color);
    }
  }, [editing, platform.label, platform.color]);

  if (editing) {
    return (
      <li className="px-2 py-3 rounded bg-neutral-800/40 space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-1.5">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full bg-[#0a0a0a] border border-neutral-800 rounded px-3 py-2 text-base focus:outline-none focus:border-neutral-700"
            style={{ fontSize: '16px' }}
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-10 rounded border border-neutral-800 bg-transparent cursor-pointer"
          />
          <span className="mono text-xs text-neutral-400 tabular-nums">{color.toUpperCase()}</span>
          <span
            className="ml-auto px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider"
            style={{ color, border: `1px solid ${color}55` }}
          >
            {name || 'Vorschau'}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancelEdit}
            className="px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-300"
          >
            Abbrechen
          </button>
          <button
            onClick={() => onSaveEdit({ label: name.trim() || platform.label, short: name.trim() || platform.short, color })}
            className="px-3 py-1.5 text-xs font-bold rounded text-black"
            style={{ backgroundColor: color }}
          >
            Speichern
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 px-2 py-2.5 rounded hover:bg-neutral-800/40">
      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: platform.color }} />
      <span className={`flex-1 text-sm ${platform.hidden ? 'text-neutral-500 line-through' : 'text-neutral-200'} truncate`}>
        {platform.label}
      </span>
      {!platform.builtIn && (
        <span className="text-[9px] uppercase tracking-widest text-neutral-600">Custom</span>
      )}
      <button
        onClick={onToggleHidden}
        className={`p-2 transition-colors ${platform.hidden ? 'text-neutral-600 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-200'}`}
        aria-label={platform.hidden ? 'Einblenden' : 'Ausblenden'}
        title={platform.hidden ? 'Einblenden' : 'Ausblenden'}
      >
        {platform.hidden ? <EyeOffIcon /> : <EyeIcon />}
      </button>
      {!platform.builtIn && (
        <button
          onClick={onEdit}
          className="p-2 text-neutral-500 hover:text-neutral-200 transition-colors"
          aria-label="Bearbeiten"
          title="Bearbeiten"
        >
          <PencilIcon />
        </button>
      )}
      <button
        onClick={onRemove}
        className="p-2 text-neutral-600 hover:text-red-500 transition-colors"
        aria-label="Entfernen"
        title="Entfernen"
      >
        <TrashIcon />
      </button>
    </li>
  );
}

function TestimonialModal({ email, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <Modal onClose={onClose}>
      <h3 className="text-base font-bold text-neutral-100">Mitmachen?</h3>
      <p className="text-sm text-neutral-400">
        Cool, dass du Interesse an 1streem hast. Schreib mir an die Adresse unten — frag nach Early
        Access, melde dich als Tester, oder gib Feedback. Antwort meist innerhalb weniger Tage.
      </p>
      <div className="flex items-center gap-2 bg-neutral-800/50 border border-neutral-800 rounded p-3">
        <span className="mono text-sm flex-1 break-all text-neutral-200">{email}</span>
        <button
          onClick={copy}
          className="px-3 py-1.5 text-xs font-bold rounded text-neutral-200 bg-neutral-700 hover:bg-neutral-600 transition-colors whitespace-nowrap"
        >
          {copied ? 'Kopiert ✓' : 'Kopieren'}
        </button>
      </div>
      <div className="flex justify-end pt-1">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-semibold text-neutral-400 hover:text-neutral-200"
        >
          Schließen
        </button>
      </div>
    </Modal>
  );
}

function Cover({ url, size = 40 }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="rounded object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded bg-neutral-900 flex items-center justify-center text-neutral-600"
      style={{ width: size, height: size }}
    >
      <MusicNoteIcon size={Math.round(size * 0.55)} />
    </div>
  );
}

function Modal({ onClose, children, wide = false }) {
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
        className={`bg-neutral-900 border border-neutral-800 rounded-lg p-6 ${wide ? 'max-w-md' : 'max-w-sm'} w-full space-y-4 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Icons (inline SVG, heroicons-style)
// -----------------------------------------------------------------------------

function PlusIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function PencilIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function EyeIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function MusicNoteIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.952 1.651a.75.75 0 0 1 .298.599V16.303a3 3 0 0 1-2.176 2.884l-1.32.377a2.553 2.553 0 1 1-1.403-4.909l2.311-.66a1.5 1.5 0 0 0 1.088-1.442V6.994l-9 2.572v9.737a3 3 0 0 1-2.176 2.884l-1.32.377a2.553 2.553 0 1 1-1.402-4.909l2.31-.66a1.5 1.5 0 0 0 1.088-1.442V5.25a.75.75 0 0 1 .544-.721l10.5-3a.75.75 0 0 1 .658.122Z" />
    </svg>
  );
}
