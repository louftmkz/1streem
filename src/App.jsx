import { useEffect, useMemo, useRef, useState } from 'react';
import * as spotifyAuth from './lib/spotifyAuth.js';
import { fetchArtistCatalog, computeDiff, applyImport, extractArtistId } from './lib/spotifyImport.js';
import Callback from './pages/Callback.jsx';

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
const ARTIST_NAME_STORAGE = '1streem-artist-name-v1';
const SPOTIFY_LINK_STORAGE = '1streem-spotify-link-v1';

function loadSpotifyLink() {
  try {
    const raw = localStorage.getItem(SPOTIFY_LINK_STORAGE);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && obj.artistId) return obj;
    }
  } catch {}
  return null;
}
const DEFAULT_ARTIST_NAME =
  import.meta.env.VITE_ARTIST_NAME || 'Artist Name';
const SUPPORT_EMAIL = 'lou+1streem@fmcrew.de';

function loadArtistName() {
  try {
    const stored = localStorage.getItem(ARTIST_NAME_STORAGE);
    if (stored && stored.trim()) return stored;
  } catch {}
  return DEFAULT_ARTIST_NAME;
}

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

// ISO yyyy-mm-dd → dd.mm.yy (kompakt für enge Spalten)
function fmtDateShort(iso) {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso || '';
  return `${m[3]}.${m[2]}.${m[1].slice(2)}`;
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
  const [showPlatformsModal, setShowPlatformsModal] = useState(false);
  const [showTestimonial, setShowTestimonial] = useState(false);
  const [artistName, setArtistName] = useState(loadArtistName);
  const [editingArtist, setEditingArtist] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const [path, setPath] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  );
  const [spotifyLink, setSpotifyLink] = useState(loadSpotifyLink);
  const [showUrlPaste, setShowUrlPaste] = useState(false);
  const [importBusy, setImportBusy] = useState(null);
  const [importDiff, setImportDiff] = useState(null);
  const [importError, setImportError] = useState(null);
  const [showSpotifyInfo, setShowSpotifyInfo] = useState(false);
  const fileInputRef = useRef(null);
  const heroRef = useRef(null);
  const heroNumRef = useRef(null);
  const stickyRef = useRef(null);
  const sentinelRef = useRef(null);
  const touchStartRef = useRef(null);
  const [heroTranslateX, setHeroTranslateX] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [view, setView] = useState('top10');

  // Persist
  useEffect(() => {
    try { localStorage.setItem(SONGS_STORAGE, JSON.stringify(songs)); } catch {}
  }, [songs]);
  useEffect(() => {
    try { localStorage.setItem(PLATFORMS_STORAGE, JSON.stringify(platforms)); } catch {}
  }, [platforms]);
  useEffect(() => {
    try { localStorage.setItem(ARTIST_NAME_STORAGE, artistName); } catch {}
  }, [artistName]);
  useEffect(() => {
    try {
      if (spotifyLink) localStorage.setItem(SPOTIFY_LINK_STORAGE, JSON.stringify(spotifyLink));
      else localStorage.removeItem(SPOTIFY_LINK_STORAGE);
    } catch {}
  }, [spotifyLink]);
  // Popstate for /callback handling
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Post-OAuth: open URL paste if not yet linked, or auto-refresh if linked
  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    const justConnected = sessionStorage.getItem('spotify_just_connected');
    if (!justConnected) return;
    sessionStorage.removeItem('spotify_just_connected');
    if (spotifyLink?.artistId) {
      runImport(spotifyLink.artistId);
    } else {
      setShowUrlPaste(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Measure distance from the big hero number's right edge to its parent's
  // right edge — so we know how far to translate it as it shrinks toward
  // the top-right corner (FLIP-style transition into the sticky compact).
  useEffect(() => {
    const measure = () => {
      const el = heroNumRef.current;
      const parent = el?.parentElement;
      if (!el || !parent) return;
      const prev = el.style.transform;
      el.style.transform = 'none';
      const elRect = el.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      el.style.transform = prev;
      setHeroTranslateX(Math.max(0, parentRect.right - elRect.right));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [songs]);

  // Detect "stuck" state for the sticky-top zone: a 1px sentinel sits right
  // above the sticky div. While it's in the viewport, the sticky hasn't hit
  // top:0 yet. Once it scrolls past, sticky is stuck → enable safe-area
  // padding so the iOS status-bar doesn't overlap the tabs.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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

  // ----- Spotify catalog import -----
  const handleConnectSpotify = async () => {
    setImportError(null);
    try {
      await spotifyAuth.login();
    } catch (e) {
      setImportError(e.message);
    }
  };
  const handleSubmitArtistUrl = async (url) => {
    const id = extractArtistId(url);
    if (!id) {
      setImportError('Konnte keine Artist-ID aus der URL erkennen.');
      return;
    }
    setShowUrlPaste(false);
    await runImport(id);
  };
  const runImport = async (artistId) => {
    setImportError(null);
    setImportBusy({ phase: 'starting' });
    try {
      const result = await fetchArtistCatalog(artistId, (p) => setImportBusy(p));
      const diff = computeDiff(result.tracks, songs);
      const link = {
        artistId: result.artist.id,
        artistName: result.artist.name,
        followers: result.artist.followers,
        images: result.artist.images || [],
        lastSyncedAt: new Date().toISOString(),
      };
      setSpotifyLink(link);
      setArtistName(result.artist.name);
      setImportBusy(null);
      setImportDiff({ artist: result.artist, matches: diff.matches, newOnes: diff.newOnes });
    } catch (e) {
      setImportBusy(null);
      setImportError(e.message);
    }
  };
  const handleApplyImport = (choices) => {
    if (!importDiff) return;
    const next = applyImport(
      songs,
      { matches: importDiff.matches, newOnes: importDiff.newOnes },
      choices,
      platforms,
    );
    setSongs(next);
    setImportDiff(null);
  };
  const handleResetAllData = () => {
    if (!window.confirm(
      'ALLE Daten löschen?\n\nSongs, Plattformen, Spotify-Verbindung, Artist-Name — alles zurück auf Default. Die Seite lädt danach neu.\n\nDieser Schritt kann nicht rückgängig gemacht werden.',
    )) return;
    try { localStorage.removeItem(SONGS_STORAGE); } catch {}
    try { localStorage.removeItem(SONGS_LEGACY_V2); } catch {}
    try { localStorage.removeItem(SONGS_LEGACY_V1); } catch {}
    try { localStorage.removeItem(PLATFORMS_STORAGE); } catch {}
    try { localStorage.removeItem(ARTIST_NAME_STORAGE); } catch {}
    try { localStorage.removeItem(SPOTIFY_LINK_STORAGE); } catch {}
    try { spotifyAuth.logout(); } catch {}
    window.location.reload();
  };
  const handleDisconnectSpotify = () => {
    if (!window.confirm(
      'Spotify trennen? Artist-Name wird wieder editierbar. Songs bleiben unangetastet.',
    )) return;
    spotifyAuth.logout();
    setSpotifyLink(null);
    setShowSpotifyInfo(false);
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

  // /callback route — Spotify OAuth redirect handler
  if (path === '/callback') return <Callback />;

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

      {/* Header — NOT sticky, scrolls away */}
      <header
        className="border-b border-neutral-900 bg-[#0a0a0a]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <span className="text-base font-bold tracking-tight">1streem</span>
          <span className="text-xs text-neutral-500">·</span>
          {spotifyLink ? (
            <button
              onClick={() => setShowSpotifyInfo(true)}
              className="flex items-center gap-2 text-sm text-neutral-300 hover:text-neutral-100 truncate min-w-0"
              title="Spotify-Verbindung"
            >
              {spotifyLink.images?.length > 0 ? (
                <img
                  src={
                    spotifyLink.images[spotifyLink.images.length - 1]?.url ||
                    spotifyLink.images[0]?.url
                  }
                  alt=""
                  className="w-6 h-6 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="shrink-0 inline-flex" style={{ color: '#1DB954' }}>
                  <SpotifyIcon size={14} />
                </span>
              )}
              <span className="truncate">{spotifyLink.artistName || artistName}</span>
            </button>
          ) : editingArtist ? (
            <input
              type="text"
              autoFocus
              defaultValue={artistName}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                if (v) setArtistName(v);
                setEditingArtist(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditingArtist(false);
              }}
              className="flex-1 min-w-0 bg-transparent border-b border-neutral-700 focus:border-neutral-400 outline-none text-sm text-neutral-300"
              style={{ fontSize: '16px' }}
            />
          ) : (
            <button
              onClick={() => setEditingArtist(true)}
              className="text-sm text-neutral-500 hover:text-neutral-300 truncate text-left"
              title="Artist Name bearbeiten"
            >
              {artistName}
            </button>
          )}
        </div>
      </header>

      {/* Sentinel — 1px element used by IntersectionObserver to detect when
         the sticky zone below has hit the top of the viewport. */}
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

      {/* Sticky top zone — tabs + compact hero */}
      <div
        ref={stickyRef}
        className="sticky top-0 z-30 bg-[#0a0a0a] transition-[padding] duration-150 ease-out"
        style={{
          paddingTop: isStuck ? 'env(safe-area-inset-top, 0px)' : '0px',
        }}
      >
        <TabBar
          tabs={TABS}
          active={tab}
          onSelect={setTab}
          onOpenManager={() => setShowPlatformsModal(true)}
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
        {/* Hero — left-aligned, slides+shrinks toward top-right corner */}
        <section ref={heroRef}>
          <p
            className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-4"
            style={{ opacity: 1 - scrollProgress }}
          >
            {heroLabel}
          </p>
          <p
            ref={heroNumRef}
            className="mono font-bold tracking-tight tabular-nums leading-none inline-block"
            style={{
              color: totalStreams > 0 ? accent : '#404040',
              fontSize: 'clamp(3rem, 12vw, 7rem)',
              opacity: 1 - scrollProgress,
              transform: `translateX(${heroTranslateX * scrollProgress}px) scale(${1 - scrollProgress * 0.7})`,
              transformOrigin: 'top right',
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
              {tab === 'all' ? 'Katalog' : 'Alle Songs'}
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
                        <div
                          key={t.id}
                          className="relative rounded-lg border border-neutral-800 p-3 flex flex-col gap-2 overflow-hidden"
                        >
                          {/* Rank top-right, absolutely positioned */}
                          <span className="pointer-events-none absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-full bg-neutral-800 mono text-[10px] font-medium text-neutral-400 tabular-nums">
                            {String(rank).padStart(2, '0')}
                          </span>
                          {/* Cover + title block */}
                          <div className="flex gap-2">
                            <div className="shrink-0">
                              <Cover url={t.cover} size={56} />
                            </div>
                            <div className="flex-1 flex flex-col gap-1 min-w-0">
                              <p className="text-[10px] uppercase tracking-wider text-neutral-600 mono truncate">
                                {t.date ? fmtDateShort(t.date) : DASH}
                              </p>
                              <p className="line-clamp-2 text-sm font-medium text-neutral-200 leading-tight">
                                {t.name}
                              </p>
                            </div>
                          </div>
                          {/* Divider */}
                          <div className="h-px w-full bg-neutral-800" />
                          {/* Streams — big, right-aligned */}
                          <p
                            className="mono font-bold tabular-nums leading-none text-right"
                            style={{
                              color: accent,
                              fontSize: 'clamp(1.25rem, 6vw, 2rem)',
                            }}
                          >
                            {fmt(t._val)}
                          </p>
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
              {tab === 'all' && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="px-4 py-2 rounded font-bold text-sm text-black whitespace-nowrap"
                    style={{ backgroundColor: accent }}
                  >
                    {showAdd ? '× Abbrechen' : '+ Song'}
                  </button>
                  {spotifyLink ? (
                    <button
                      onClick={() => runImport(spotifyLink.artistId)}
                      disabled={Boolean(importBusy)}
                      className="px-3 py-2 rounded font-semibold text-sm text-white inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                      style={{ backgroundColor: '#1DB954' }}
                      title="Spotify-Katalog aktualisieren"
                    >
                      <RefreshIcon size={14} />
                      {importBusy ? 'lädt...' : 'Aktualisieren'}
                    </button>
                  ) : (
                    <button
                      onClick={handleConnectSpotify}
                      className="px-3 py-2 rounded font-bold text-sm text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                      style={{ backgroundColor: '#1DB954' }}
                      title="Spotify-Katalog verbinden"
                    >
                      <SpotifyIcon size={14} />
                      Spotify verbinden
                    </button>
                  )}
                </div>
              )}

              <div className="relative mb-4">
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
        <div className="max-w-3xl mx-auto px-6 py-4 flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
            <button
              onClick={downloadBackup}
              className="px-3 py-2 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 transition-colors"
            >
              Export
            </button>
            <button
              onClick={pickRestoreFile}
              className="px-3 py-2 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 transition-colors"
            >
              Import
            </button>
            <button
              onClick={() => setShowTestimonial(true)}
              className="px-3 py-2 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 transition-colors"
            >
              Early Access
            </button>
            <button
              onClick={handleResetAllData}
              className="px-3 py-2 rounded bg-neutral-900 hover:bg-red-900/40 text-neutral-500 hover:text-red-300 transition-colors"
            >
              Alle Daten löschen
            </button>
          </div>
          <p className="text-[11px] text-neutral-600">© 2026 1streem</p>
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

      {showPlatformsModal && (
        <ManagePlatformsModal
          activePlatforms={platforms}
          onAddLibrary={addPlatformFromLibrary}
          onAddCustom={addCustomPlatform}
          onToggleHidden={togglePlatformHidden}
          onUpdate={updatePlatformMeta}
          onRemove={removePlatform}
          onClose={() => setShowPlatformsModal(false)}
        />
      )}

      {showTestimonial && (
        <TestimonialModal
          email={SUPPORT_EMAIL}
          onClose={() => setShowTestimonial(false)}
        />
      )}

      {showUrlPaste && (
        <ArtistUrlModal
          onSubmit={handleSubmitArtistUrl}
          onCancel={() => setShowUrlPaste(false)}
        />
      )}

      {importBusy && <ImportBusyModal busy={importBusy} />}

      {importError && (
        <Modal onClose={() => setImportError(null)}>
          <h3 className="text-base font-bold text-neutral-100">Spotify-Fehler</h3>
          <p className="text-sm text-neutral-400 break-words">{importError}</p>
          <p className="text-xs text-neutral-600">
            Häufige Ursachen: Client ID nicht gesetzt, Redirect URI in der Dev App nicht
            registriert, dein Spotify-Account nicht im User-Management eingetragen.
          </p>
          <div className="flex justify-end pt-1">
            <button
              onClick={() => setImportError(null)}
              className="px-4 py-2 text-sm font-bold rounded text-black"
              style={{ backgroundColor: '#1DB954' }}
            >
              OK
            </button>
          </div>
        </Modal>
      )}

      {importDiff && (
        <ImportDiffModal
          diff={importDiff}
          onCancel={() => setImportDiff(null)}
          onApply={handleApplyImport}
        />
      )}

      {showSpotifyInfo && spotifyLink && (
        <Modal onClose={() => setShowSpotifyInfo(false)}>
          <h3 className="text-base font-bold text-neutral-100">Spotify-Verbindung</h3>
          <div className="text-sm text-neutral-400 space-y-1">
            <p>
              Artist: <span className="text-neutral-200">{spotifyLink.artistName}</span>
            </p>
            {spotifyLink.followers != null && (
              <p>
                Follower:{' '}
                <span className="mono tabular-nums text-neutral-200">
                  {fmt(spotifyLink.followers)}
                </span>
              </p>
            )}
            {spotifyLink.lastSyncedAt && (
              <p>
                Letzter Sync:{' '}
                <span className="text-neutral-200">
                  {new Date(spotifyLink.lastSyncedAt).toLocaleString('de-DE')}
                </span>
              </p>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={handleDisconnectSpotify}
              className="px-4 py-2 text-sm font-semibold text-red-400 hover:text-red-300"
            >
              Trennen
            </button>
            <button
              onClick={() => setShowSpotifyInfo(false)}
              className="px-4 py-2 text-sm font-bold rounded text-black"
              style={{ backgroundColor: '#1DB954' }}
            >
              Schließen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =============================================================================
// Components
// =============================================================================

function TabBar({ tabs, active, onSelect, onOpenManager }) {
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
          <div className="flex items-center ml-2 shrink-0">
            <button
              onClick={onOpenManager}
              className="p-2 text-neutral-500 hover:text-neutral-200 transition-colors"
              aria-label="Plattformen verwalten"
              title="Plattformen verwalten"
            >
              <PlusIcon />
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
    <li className="py-3 space-y-2">
      {/* Top row: cover | name+date | streams + delete */}
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <Cover url={song.cover} size={44} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-neutral-200 truncate">{song.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-600 mt-0.5 mono">
            {song.date ? fmtDateShort(song.date) : DASH}
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
      {/* Pills row — full width below */}
      <div className="flex flex-wrap gap-1">
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

function ManagePlatformsModal({
  activePlatforms,
  onAddLibrary,
  onAddCustom,
  onToggleHidden,
  onUpdate,
  onRemove,
  onClose,
}) {
  const [mode, setMode] = useState('list'); // 'list' | 'custom'
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8b5cf6');

  const activeIds = new Set(activePlatforms.map((p) => p.id));
  const available = PLATFORM_LIBRARY.filter((p) => !activeIds.has(p.id));

  const submitCustom = (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    onAddCustom({ label: name, color });
    setName('');
    setColor('#8b5cf6');
    setMode('list');
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-neutral-100">Plattformen</h3>
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
          onClick={() => setMode('list')}
          className="py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
          style={{
            color: mode === 'list' ? '#fafafa' : '#737373',
            borderColor: mode === 'list' ? '#fafafa' : 'transparent',
          }}
        >
          Plattformen
        </button>
        <button
          onClick={() => setMode('custom')}
          className="py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
          style={{
            color: mode === 'custom' ? '#fafafa' : '#737373',
            borderColor: mode === 'custom' ? '#fafafa' : 'transparent',
          }}
        >
          Weitere hinzufügen
        </button>
      </div>

      {mode === 'list' && (
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1 -mx-1">
          {/* Active section */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 px-1 pb-2">
              Aktiv ({activePlatforms.filter((p) => !p.hidden).length}) ·
              ausblenden, bearbeiten oder entfernen
            </p>
            {activePlatforms.length === 0 ? (
              <p className="text-sm text-neutral-500 py-2 px-1">Keine Plattformen aktiv.</p>
            ) : (
              <ul className="space-y-1">
                {activePlatforms.map((p) => (
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
          </div>

          <div className="border-t border-neutral-800" />

          {/* Library section */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 px-1 pb-2">
              Weitere bekannte Plattformen · 1 Klick zum Hinzufügen
            </p>
            {available.length === 0 ? (
              <p className="text-sm text-neutral-500 py-2 px-1">
                Alle bekannten Plattformen sind bereits in deiner Liste.
              </p>
            ) : (
              <div className="space-y-1">
                {available.map((p) => (
                  <PlatformPickerRow key={p.id} platform={p} onAdd={() => onAddLibrary(p.id)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'custom' && (
        <form onSubmit={submitCustom} className="space-y-4">
          <p className="text-xs text-neutral-500">
            Eigene/Nischen-Plattform anlegen (z.B. lokale Dienste, neue Anbieter).
          </p>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
                {name || 'Vorschau'}
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
      className="w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-r hover:bg-neutral-800/60 text-left transition-colors border-l-2"
      style={{ borderLeftColor: platform.color }}
    >
      <span className="flex-1 text-sm text-neutral-200">{platform.label}</span>
      {badge && (
        <span className="text-[9px] uppercase tracking-widest text-neutral-500">{badge}</span>
      )}
      <span className="text-neutral-500 text-lg leading-none">+</span>
    </button>
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
    <li
      className="flex items-center gap-2 pl-3 pr-2 py-2.5 rounded-r hover:bg-neutral-800/40 border-l-2"
      style={{ borderLeftColor: platform.color }}
    >
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

function ArtistUrlModal({ onSubmit, onCancel }) {
  const [url, setUrl] = useState('');
  const submit = (e) => {
    e?.preventDefault();
    if (!url.trim()) return;
    onSubmit(url);
  };
  return (
    <Modal onClose={onCancel} wide>
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-neutral-100">Spotify-Artist-URL einfügen</h3>
        <button
          onClick={onCancel}
          className="text-neutral-500 hover:text-neutral-200 text-lg leading-none"
          aria-label="Schließen"
        >
          ×
        </button>
      </div>
      <p className="text-sm text-neutral-400">
        Öffne dein Artist-Profil in Spotify, kopier die URL aus der Adressleiste oder via
        Teilen → Link kopieren. Beispiel:
      </p>
      <code className="block text-xs text-neutral-500 bg-[#0a0a0a] border border-neutral-800 rounded px-3 py-2 break-all">
        https://open.spotify.com/artist/3LaYDsZXr5HlfDY7vtxq0v
      </code>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          required
          placeholder="https://open.spotify.com/artist/..."
          className="w-full bg-[#0a0a0a] border border-neutral-800 rounded px-3 py-3 text-base focus:outline-none focus:border-neutral-700"
          style={{ fontSize: '16px' }}
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-neutral-300"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-bold rounded text-white"
            style={{ backgroundColor: '#1DB954' }}
          >
            Importieren
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportBusyModal({ busy }) {
  let label = 'Lade...';
  if (busy.phase === 'artist') label = `Artist: ${busy.label}`;
  else if (busy.phase === 'albums') label = `${busy.count} Releases gefunden`;
  else if (busy.phase === 'tracks')
    label = `Lade Tracks ${busy.current}/${busy.total}${busy.album ? ` · ${busy.album}` : ''}`;
  const progress =
    busy.phase === 'tracks' && busy.total ? (busy.current / busy.total) * 100 : null;
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-sm w-full space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-[#1DB954]" />
          <h3 className="text-base font-bold text-neutral-100">Spotify-Import</h3>
        </div>
        <p className="text-sm text-neutral-400 break-words">{label}</p>
        {progress != null && (
          <div className="w-full h-1 bg-neutral-800 rounded overflow-hidden">
            <div
              className="h-full transition-all duration-200"
              style={{ width: `${progress}%`, backgroundColor: '#1DB954' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ImportDiffModal({ diff, onCancel, onApply }) {
  const { matches, newOnes, artist } = diff;
  const [choices, setChoices] = useState(() => {
    const init = {};
    for (const m of matches) init[`m:${m.spotify.spotifyUri}`] = true;
    for (const n of newOnes) init[`n:${n.spotifyUri}`] = true;
    return init;
  });
  const setAll = (val, prefix) => {
    setChoices((c) => {
      const next = { ...c };
      for (const k of Object.keys(c)) {
        if (k.startsWith(prefix)) next[k] = val;
      }
      return next;
    });
  };
  const toggle = (key) => setChoices((c) => ({ ...c, [key]: !c[key] }));
  const newAccepted = newOnes.filter((n) => choices[`n:${n.spotifyUri}`]).length;
  const matchAccepted = matches.filter((m) => choices[`m:${m.spotify.spotifyUri}`]).length;

  return (
    <Modal onClose={onCancel} wide>
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-neutral-100">
          Import-Vorschau · {artist?.name}
        </h3>
        <button
          onClick={onCancel}
          className="text-neutral-500 hover:text-neutral-200 text-lg leading-none"
          aria-label="Schließen"
        >
          ×
        </button>
      </div>

      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 -mx-1">
        <p className="text-xs text-neutral-500">
          Stream-Zahlen werden bei Matches{' '}
          <strong className="text-neutral-300">nicht überschrieben</strong>. Nur leere
          Metadaten (Cover, Datum) werden ergänzt.
        </p>

        {/* New */}
        <div>
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">
              Neu hinzufügen ({newOnes.length})
            </p>
            {newOnes.length > 0 && (
              <div className="text-[10px] text-neutral-600">
                <button onClick={() => setAll(true, 'n:')} className="hover:text-neutral-300">
                  alle
                </button>
                {' · '}
                <button onClick={() => setAll(false, 'n:')} className="hover:text-neutral-300">
                  keine
                </button>
              </div>
            )}
          </div>
          {newOnes.length === 0 ? (
            <p className="text-xs text-neutral-600 px-1">Keine neuen Songs.</p>
          ) : (
            <ul className="space-y-1">
              {newOnes.map((t) => (
                <DiffRow
                  key={t.spotifyUri}
                  track={t}
                  badge="NEU"
                  checked={!!choices[`n:${t.spotifyUri}`]}
                  onToggle={() => toggle(`n:${t.spotifyUri}`)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Match */}
        <div className="border-t border-neutral-800 pt-3">
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">
              Matches — Streams bleiben ({matches.length})
            </p>
            {matches.length > 0 && (
              <div className="text-[10px] text-neutral-600">
                <button onClick={() => setAll(true, 'm:')} className="hover:text-neutral-300">
                  alle
                </button>
                {' · '}
                <button onClick={() => setAll(false, 'm:')} className="hover:text-neutral-300">
                  keine
                </button>
              </div>
            )}
          </div>
          {matches.length === 0 ? (
            <p className="text-xs text-neutral-600 px-1">Keine Übereinstimmungen.</p>
          ) : (
            <ul className="space-y-1">
              {matches.map((m) => (
                <DiffRow
                  key={m.spotify.spotifyUri}
                  track={m.spotify}
                  badge={`MATCH: ${m.existing.name}`}
                  checked={!!choices[`m:${m.spotify.spotifyUri}`]}
                  onToggle={() => toggle(`m:${m.spotify.spotifyUri}`)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-800">
        <p className="text-xs text-neutral-500">
          {newAccepted} neu · {matchAccepted} merge
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-neutral-300"
          >
            Abbrechen
          </button>
          <button
            onClick={() => onApply(choices)}
            disabled={newAccepted + matchAccepted === 0}
            className="px-4 py-2 text-sm font-bold rounded text-white disabled:opacity-40"
            style={{ backgroundColor: '#1DB954' }}
          >
            Importieren
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DiffRow({ track, badge, checked, onToggle }) {
  return (
    <li>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-neutral-800/40 text-left"
      >
        <Cover url={track.cover} size={36} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-neutral-200 truncate">{track.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-600 mt-0.5 truncate">
            {track.date || '—'} · {badge}
          </div>
        </div>
        <span
          className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
            checked ? 'border-[#1DB954] bg-[#1DB954]/20' : 'border-neutral-700'
          }`}
        >
          {checked && (
            <span className="text-[10px] leading-none" style={{ color: '#1DB954' }}>
              ✓
            </span>
          )}
        </span>
      </button>
    </li>
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
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center px-4 pt-16 pb-6 z-50 overflow-y-auto"
      onClick={onClose}
      style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 3rem)` }}
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

function RefreshIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function SpotifyIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 1 1-.277-1.215c3.809-.87 7.077-.496 9.713 1.114a.623.623 0 0 1 .206.858zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 1 1-.453-1.494c3.633-1.102 8.147-.568 11.234 1.33a.78.78 0 0 1 .256 1.073zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 1 1-.542-1.79c3.532-1.072 9.404-.865 13.115 1.338a.935.935 0 1 1-.955 1.608z" />
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
