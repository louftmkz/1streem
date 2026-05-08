import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Music, Users, Activity, Flame, LogIn, LogOut } from 'lucide-react';
import { isConfigured, isLoggedIn, login, logout } from '../lib/spotifyAuth.js';
import { getMe, getArtist, getArtistTopTracks, getArtistAlbums } from '../lib/spotifyApi.js';

const ARTIST_ID =
  import.meta.env.VITE_SPOTIFY_ARTIST_ID || '3LaYDsZXr5HlfDY7vtxq0v';
const MusicDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [monthlyData, setMonthlyData] = useState([]);
  const [topSongs, setTopSongs] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [hoveredSong, setHoveredSong] = useState(0);
  const [spotifyUser, setSpotifyUser] = useState(null);
  const [artistProfile, setArtistProfile] = useState(null);
  const [artistAlbums, setArtistAlbums] = useState([]);
  const [spotifyError, setSpotifyError] = useState(null);
  const [loadingSpotify, setLoadingSpotify] = useState(false);
  const [hasToken, setHasToken] = useState(() => isLoggedIn());
  // Pathfinder-Stats vom eigenen Vercel-Backend (kein OAuth nötig)
  const [pathfinderStats, setPathfinderStats] = useState(null);
  const [pathfinderError, setPathfinderError] = useState(null);
  const usingRealData = Boolean(artistProfile) || Boolean(pathfinderStats);
  const platforms = [
    { id: 'all', label: 'Alle', color: '#6366f1' },
    { id: 'spotify', label: 'Spotify', color: '#1DB954' },
    { id: 'deezer', label: 'Deezer', color: '#A238FF' },
    { id: 'applemusic', label: 'Apple', color: '#5C6470' },
    { id: 'amazonmusic', label: 'Amazon', color: '#06B6D4' },
    { id: 'youtube', label: 'YouTube', color: '#FF0000' },
  ];
  const themeColor = (platforms.find((p) => p.id === selectedPlatform) || platforms[0]).color;
  // hex + alpha helper (alpha 0..1)
  const withAlpha = (hex, alpha) => {
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
      .toString(16)
      .padStart(2, '0');
    return `${hex}${a}`;
  };
  // 5 Abstufungen für Pie/Cells: 100/78/58/40/25 % Deckkraft
  const themeShades = [1.0, 0.78, 0.58, 0.4, 0.25].map((a) => withAlpha(themeColor, a));
  // Mock-Daten pro Plattform
  const platformData = {
    spotify: {
      streams: 165200,
      listeners: 28900,
      allTimeHigh: 12500,
      followers: 2847,
      trend: 12,
    },
    deezer: {
      streams: 89300,
      listeners: 15400,
      allTimeHigh: 8200,
      followers: 1203,
      trend: 8,
    },
    applemusic: {
      streams: 121000,
      listeners: 22100,
      allTimeHigh: 9800,
      followers: 1567,
      trend: 10,
    },
    amazonmusic: {
      streams: 76500,
      listeners: 12300,
      allTimeHigh: 6500,
      followers: 891,
      trend: 6,
    },
    youtube: {
      streams: 204100,
      listeners: 35600,
      allTimeHigh: 14200,
      followers: 3421,
      trend: 15,
    },
  };
  useEffect(() => {
    const mockMonthlyStreams = [
      { month: 'Jan', streams: 12400, listeners: 2400 },
      { month: 'Feb', streams: 15300, listeners: 2210 },
      { month: 'Mär', streams: 18200, listeners: 2290 },
      { month: 'Apr', streams: 21100, listeners: 2000 },
      { month: 'Mai', streams: 19800, listeners: 2181 },
      { month: 'Jun', streams: 24600, listeners: 2500 },
    ];
    const mockTopSongs = [
      { name: 'Song Title 1', streams: 45200, listeners: 8900 },
      { name: 'Song Title 2', streams: 38900, listeners: 7200 },
      { name: 'Song Title 3', streams: 32100, listeners: 6100 },
      { name: 'Song Title 4', streams: 28700, listeners: 5300 },
      { name: 'Song Title 5', streams: 21400, listeners: 4100 },
    ];
    setMonthlyData(mockMonthlyStreams);
    setTopSongs(mockTopSongs);
  }, []);
  // Pathfinder-Stats vom eigenen Backend laden — kein OAuth nötig, läuft sofort
  useEffect(() => {
    let cancelled = false;
    fetch('/api/spotify-stats')
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) {
          setPathfinderError(data.error || `HTTP ${res.status}`);
          console.error('Pathfinder fetch failed:', data);
          return;
        }
        setPathfinderStats(data);
        console.log('Pathfinder stats loaded:', data);
        // Top Songs aus echten Pathfinder-Stream-Counts
        if (Array.isArray(data.topTracks) && data.topTracks.length > 0) {
          const realSongs = data.topTracks.slice(0, 5).map((t) => ({
            name: t.name,
            streams: t.playcount || 0,
            listeners: Math.round((t.playcount || 0) * 0.18), // grobe Schätzung als Platzhalter
            albumImage: t.albumImage,
          }));
          setTopSongs(realSongs);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setPathfinderError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // Spotify-Daten laden, wenn eingeloggt — Artist-Profil von Lou FTMKZ
  // Promise.allSettled = jeder Call separat, partielle Erfolge erlaubt
  useEffect(() => {
    if (!isLoggedIn()) return;
    let cancelled = false;
    setLoadingSpotify(true);
    setSpotifyError(null);
    Promise.allSettled([
      getMe(),
      getArtist(ARTIST_ID),
      getArtistTopTracks(ARTIST_ID, 'DE'),
      getArtistAlbums(ARTIST_ID, { market: 'DE', limit: 50 }),
    ])
      .then((results) => {
        if (cancelled) return;
        const [meRes, artistRes, topTracksRes, albumsRes] = results;
        const labels = ['/me', `/artists/${ARTIST_ID}`, 'top-tracks', 'albums'];
        const errors = [];
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.error(`Spotify call failed: ${labels[i]}`, r.reason);
            errors.push(`${labels[i]}: ${r.reason?.message || 'Fehler'}`);
          } else {
            console.log(`Spotify call OK: ${labels[i]}`);
          }
        });

        // /me: User-Profil (für Display-Name)
        if (meRes.status === 'fulfilled') setSpotifyUser(meRes.value);

        // Artist-Profile: für Followers + Genres
        if (artistRes.status === 'fulfilled') setArtistProfile(artistRes.value);

        // Top Tracks → Songs/Pie/Tabelle
        if (topTracksRes.status === 'fulfilled') {
          const realSongs = (topTracksRes.value.tracks || []).slice(0, 5).map((t) => {
            const pop = Number.isFinite(t.popularity) ? t.popularity : 0;
            return {
              name: t.name,
              streams: Math.max(pop * 1000, 1),
              listeners: Math.max(pop * 200, 1),
              popularity: pop,
              albumImage: t.album?.images?.[2]?.url || t.album?.images?.[0]?.url,
            };
          });
          if (realSongs.length > 0) setTopSongs(realSongs);
        }

        // Albums → Releases-Grid
        if (albumsRes.status === 'fulfilled') {
          const seen = new Set();
          const dedupedAlbums = (albumsRes.value.items || [])
            .filter((a) => {
              const key = a.name.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .sort(
              (a, b) =>
                new Date(b.release_date).getTime() -
                new Date(a.release_date).getTime(),
            );
          setArtistAlbums(dedupedAlbums);
        }

        // Fehlersammlung — nur anzeigen wenn überhaupt was kaputt ist
        if (errors.length > 0) {
          setSpotifyError(errors.join(' | '));
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingSpotify(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const handleConnect = () => {
    login().catch((e) => setSpotifyError(e.message));
  };
  const handleDisconnect = () => {
    logout();
    setSpotifyUser(null);
    setArtistProfile(null);
    setArtistAlbums([]);
    setSpotifyError(null);
    setHasToken(false);
    window.location.reload();
  };
  // Daten basierend auf Platform berechnen
  // Pathfinder hat Priorität, dann Spotify-OAuth-Profil, dann Mock
  const getMetrics = () => {
    const pf = pathfinderStats; // shortcut
    const allTimeHighFromTopTracks = pf?.topTracks?.length
      ? Math.max(...pf.topTracks.map((t) => t.playcount || 0))
      : null;

    if (selectedPlatform === 'all') {
      const base = {
        streams: Object.values(platformData).reduce((sum, p) => sum + p.streams, 0),
        listeners: Object.values(platformData).reduce((sum, p) => sum + p.listeners, 0),
        allTimeHigh: Math.max(...Object.values(platformData).map(p => p.allTimeHigh)),
        followers: Object.values(platformData).reduce((sum, p) => sum + p.followers, 0),
        trend: 11,
      };
      // Pathfinder-Werte einsetzen wo vorhanden
      if (pf) {
        return {
          ...base,
          streams: pf.topTracksTotal ?? base.streams,
          listeners: pf.monthlyListeners ?? base.listeners,
          followers: pf.followers ?? base.followers,
          allTimeHigh: allTimeHighFromTopTracks ?? base.allTimeHigh,
        };
      }
      // Fallback: nur Followers aus OAuth-Profil
      if (artistProfile) {
        return {
          ...base,
          followers: artistProfile.followers?.total ?? base.followers,
          allTimeHigh: topSongs.length > 0
            ? Math.max(...topSongs.map((s) => s.streams || 0))
            : base.allTimeHigh,
        };
      }
      return base;
    }
    if (selectedPlatform === 'spotify') {
      const base = platformData.spotify;
      if (pf) {
        return {
          ...base,
          streams: pf.topTracksTotal ?? base.streams,
          listeners: pf.monthlyListeners ?? base.listeners,
          followers: pf.followers ?? base.followers,
          allTimeHigh: allTimeHighFromTopTracks ?? base.allTimeHigh,
        };
      }
      if (artistProfile) {
        return {
          ...base,
          followers: artistProfile.followers?.total ?? base.followers,
          allTimeHigh: topSongs.length > 0
            ? Math.max(...topSongs.map((s) => s.streams || 0))
            : base.allTimeHigh,
        };
      }
      return base;
    }
    return platformData[selectedPlatform];
  };
  const metrics = getMetrics();
  // Sicheres Number-Format: NaN/undefined → 0
  const fmtNum = (v) => (Number.isFinite(v) ? v : 0).toLocaleString('de-DE');
  // KPI-Karten Komponente — alle in der aktuellen Theme-Farbe, mit dezenter Aufhellung pro Karte
  const KPICard = ({ icon: Icon, label, value, trend }) => (
    <div
      className="relative overflow-hidden rounded-xl p-6 border transition-all duration-300 group"
      style={{
        background: `linear-gradient(135deg, ${themeColor} 0%, ${withAlpha(themeColor, 0.85)} 100%)`,
        borderColor: withAlpha(themeColor, 0.3),
        color: '#ffffff',
      }}
    >
      <div className="absolute inset-0 opacity-5" />
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-semibold mb-2 text-white/70">{label}</p>
          <p className="text-3xl font-bold mb-3 text-white">{fmtNum(value)}</p>
          {trend && (
            <div className="flex items-center gap-1 text-sm font-semibold text-white/75">
              <TrendingUp size={16} />
              {trend}% vs. letzter Monat
            </div>
          )}
        </div>
        <div className="p-3 rounded-lg opacity-30 group-hover:opacity-50 transition-opacity">
          <Icon size={28} className="text-white" />
        </div>
      </div>
    </div>
  );
  const totalStreams = topSongs.length > 0 ? topSongs.reduce((sum, song) => sum + (Number.isFinite(song.streams) ? song.streams : 0), 0) : 0;
  const safePct = (v) => {
    if (!Number.isFinite(v) || !totalStreams) return '0.0';
    return ((v / totalStreams) * 100).toFixed(1);
  };
  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800' : 'bg-gradient-to-b from-slate-50 to-slate-100'}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        * { font-family: 'Lexend', sans-serif; }
        .mono { font-family: 'Space Mono', monospace; }
      `}</style>
      {/* Header - Full */}
      <div className={`border-b ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-end justify-between mb-4">
            <div className="flex items-end gap-3">
              <div
                className="rounded-xl p-3"
                style={{
                  background: `linear-gradient(135deg, ${themeColor} 0%, ${withAlpha(themeColor, 0.75)} 100%)`,
                }}
              >
                <Music size={28} className="text-white" />
              </div>
              <div>
                <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>Your Analytics</h1>
                <p className={`text-xs font-medium mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Music performance across all platforms</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className={`text-xs uppercase tracking-widest font-semibold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Updated</p>
                <p className={`font-bold text-sm ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{new Date().toLocaleDateString('de-DE')}</p>
              </div>
              {isConfigured() && !hasToken && (
                <button
                  onClick={handleConnect}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm bg-[#1DB954] text-white hover:bg-[#1ed760] transition-all duration-200 shadow-sm"
                >
                  <LogIn size={14} />
                  Connect Spotify
                </button>
              )}
              {hasToken && (
                <div className="flex items-center gap-2">
                  {usingRealData && (
                    <span className={`hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      {spotifyUser?.display_name || spotifyUser?.id}
                    </span>
                  )}
                  {!usingRealData && spotifyError && (
                    <span className={`hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-700'}`}>
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      Verbindung fehlgeschlagen
                    </span>
                  )}
                  <button
                    onClick={handleDisconnect}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-xs transition-all duration-200 ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                    title="Spotify trennen"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              )}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`px-3 py-2 rounded-lg font-bold text-xs transition-all duration-200 ${isDarkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
              >
                {isDarkMode ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Sticky Filter Pills Only */}
      <div className={`border-b backdrop-blur-md sticky top-0 z-50 ${isDarkMode ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white/40'}`}>
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
            {platforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => setSelectedPlatform(platform.id)}
                className={`px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition-all duration-200 ${
                  selectedPlatform === platform.id
                    ? 'text-white shadow-lg'
                    : isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                style={selectedPlatform === platform.id ? { backgroundColor: platform.color } : {}}
              >
                {platform.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* KPI Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <KPICard icon={Music} label="Total Streams" value={metrics.streams} trend={metrics.trend} />
          <KPICard icon={Users} label="Unique Listeners" value={metrics.listeners} trend={metrics.trend} />
          <KPICard icon={Flame} label="All-Time High" value={metrics.allTimeHigh} trend={metrics.trend} />
          <KPICard icon={TrendingUp} label="Followers" value={metrics.followers} trend={metrics.trend} />
        </div>
        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          {/* Monthly Streams Chart */}
          <div className={`lg:col-span-2 rounded-2xl p-8 border shadow-sm ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>Monthly Performance</h2>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Streams and listener growth</p>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="month" stroke={isDarkMode ? '#94a3b8' : '#94a3b8'} style={{ fontSize: '12px' }} />
                <YAxis stroke={isDarkMode ? '#94a3b8' : '#94a3b8'} style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                    border: `1px solid ${isDarkMode ? '#475569' : '#e2e8f0'}`,
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    color: isDarkMode ? '#f1f5f9' : '#0f172a',
                  }}
                  labelStyle={{ color: isDarkMode ? '#f1f5f9' : '#0f172a', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line
                  type="monotone"
                  dataKey="streams"
                  stroke={themeColor}
                  strokeWidth={3}
                  dot={{ fill: themeColor, r: 5 }}
                  activeDot={{ r: 7 }}
                />
                <Line
                  type="monotone"
                  dataKey="listeners"
                  stroke={withAlpha(themeColor, 0.55)}
                  strokeWidth={3}
                  dot={{ fill: withAlpha(themeColor, 0.55), r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Top Songs Distribution */}
          <div className={`rounded-2xl p-8 border shadow-sm ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>Stream Mix</h2>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Distribution by song</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="relative w-full flex justify-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={topSongs}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={105}
                      fill="#8884d8"
                      dataKey="streams"
                      label={false}
                      onMouseEnter={(_, index) => setHoveredSong(index)}
                      onMouseLeave={() => setHoveredSong(0)}
                    >
                      {topSongs.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={themeShades[index % themeShades.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    {topSongs[hoveredSong]?.name || 'Loading...'}
                  </p>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {topSongs[hoveredSong] ? fmtNum(topSongs[hoveredSong].streams) : '—'}
                  </p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {topSongs[hoveredSong] ? safePct(topSongs[hoveredSong].streams) + '%' : '—'}
                  </p>
                </div>
              </div>
              {/* Legend */}
              <div className="w-full space-y-2">
                {topSongs.map((song, index) => {
                  return (
                    <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-slate-50 hover:bg-slate-100'} transition-colors`}>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: themeShades[index % themeShades.length] }} />
                        <span className={`text-sm font-medium truncate ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{song.name}</span>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{safePct(song.streams)}%</p>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{fmtNum(song.streams)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {/* Top Songs Table */}
        <div className={`rounded-2xl p-8 border shadow-sm ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="mb-8">
            <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>Top Songs</h2>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Your best performing tracks</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <th className={`text-left py-3 px-4 font-bold text-xs uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{minWidth: '150px'}}>Song</th>
                  <th className={`text-right py-3 px-4 font-bold text-xs uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Streams</th>
                  <th className={`text-right py-3 px-4 font-bold text-xs uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Listeners</th>
                  <th className={`text-right py-3 px-4 font-bold text-xs uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Share</th>
                </tr>
              </thead>
              <tbody>
                {topSongs.map((song, idx) => (
                  <tr key={idx} className={`border-b transition-colors ${isDarkMode ? 'border-slate-700/50 hover:bg-slate-800/50' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <td className={`py-3 px-4 font-medium text-sm ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{song.name}</td>
                    <td className="py-3 px-4 text-right font-semibold text-sm mono" style={{ color: themeColor }}>{fmtNum(song.streams)}</td>
                    <td className="py-3 px-4 text-right font-semibold text-sm mono" style={{ color: withAlpha(themeColor, 0.65) }}>{fmtNum(song.listeners)}</td>
                    <td className={`py-3 px-4 text-right font-medium text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {safePct(song.streams)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Releases (Artist Albums/Singles) — nur wenn echte Daten geladen */}
      {usingRealData && artistAlbums.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 pb-12">
          <div className={`rounded-2xl p-8 border shadow-sm ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>Releases</h2>
                <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {artistAlbums.length} Veröffentlichungen auf Spotify
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {artistAlbums.map((album) => (
                <a
                  key={album.id}
                  href={album.external_urls?.spotify || `https://open.spotify.com/album/${album.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group rounded-xl overflow-hidden border transition-all hover:scale-[1.02] ${isDarkMode ? 'bg-slate-800/50 border-slate-700 hover:border-slate-600' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                >
                  {album.images?.[0]?.url && (
                    <div className="aspect-square overflow-hidden bg-slate-700">
                      <img
                        src={album.images[0].url}
                        alt={album.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-3">
                    <p className={`text-sm font-bold truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {album.name}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-xs uppercase tracking-wide font-semibold ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                        {album.album_type === 'single' && album.total_tracks >= 4
                          ? 'EP'
                          : album.album_type}
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {album.release_date?.slice(0, 4)}
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Footer */}
      <div className={`border-t mt-16 ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className={`rounded-2xl p-8 border ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200'}`}>
            {usingRealData ? (
              <>
                <h3 className={`font-bold text-lg mb-3 ${isDarkMode ? 'text-slate-100' : 'text-slate-950'}`}>
                  Verbunden — Artist: {artistProfile?.name || pathfinderStats?.artistName || 'Lou FTMKZ'}
                </h3>
                <p className={`text-sm mb-4 max-w-2xl ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {pathfinderStats ? (
                    <>
                      <strong>Total Streams</strong>, <strong>Monthly Listeners</strong> und <strong>Followers</strong> sind echte Zahlen aus Spotifys Pathfinder-API — gleicher Datenstand wie auf deiner public Spotify-Profilseite. <em>Total Streams</em> ist aktuell die Summe der Top-10-Tracks (Phase 2 erweitert das auf alle Releases). Daten werden 10 Min am Edge gecached.
                    </>
                  ) : (
                    <>
                      Top Songs und Releases unten zeigen die echten Spotify-Daten von <strong>{artistProfile.name}</strong>. <strong>Followers</strong> und <strong>All-Time High</strong> sind echt; <strong>Total Streams</strong> und <strong>Unique Listeners</strong> bleiben Mock.
                    </>
                  )}
                </p>
                {pathfinderStats?.fetchedAt && (
                  <p className={`text-xs mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                    Stand: {new Date(pathfinderStats.fetchedAt).toLocaleString('de-DE')}
                  </p>
                )}
                {artistProfile?.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {artistProfile.genres.slice(0, 5).map((g) => (
                      <span
                        key={g}
                        className={`px-2 py-1 rounded text-xs ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'}`}
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}
                {pathfinderError && (
                  <p className="text-xs text-amber-400 mt-2">Pathfinder-Hinweis: {pathfinderError}</p>
                )}
                {loadingSpotify && (
                  <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>Lade Spotify-Daten...</p>
                )}
                {spotifyError && (
                  <p className="text-xs text-red-400 mt-2">Fehler: {spotifyError}</p>
                )}
              </>
            ) : (
              <>
                <h3 className={`font-bold text-lg mb-3 ${isDarkMode ? 'text-slate-100' : 'text-slate-950'}`}>
                  {isConfigured() ? 'Mit Spotify verbinden' : 'Spotify-Setup ausstehend'}
                </h3>
                <p className={`text-sm mb-4 max-w-2xl ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {isConfigured()
                    ? 'Klick oben auf "Connect Spotify", um echte Spotify-Daten deines Artist-Profils zu laden.'
                    : 'Setze die Environment Variable VITE_SPOTIFY_CLIENT_ID in Vercel und re-deploy, damit der Login-Flow aktiv wird.'}
                </p>
                {spotifyError && (
                  <div className={`mt-3 p-4 rounded-lg border ${isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'}`}>
                    <p className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>Verbindung fehlgeschlagen</p>
                    <p className={`text-xs mb-3 break-words ${isDarkMode ? 'text-red-400/80' : 'text-red-600'}`}>{spotifyError}</p>
                    {spotifyError.includes('403') && (
                      <p className={`text-xs mb-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Wahrscheinlich: Spotify-User noch nicht im{' '}
                        <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-400">Developer-Dashboard</a>
                        {' '}als Tester eingetragen, oder die E-Mail dort matcht nicht mit deinem Spotify-Account.
                      </p>
                    )}
                    {hasToken && (
                      <button
                        onClick={handleDisconnect}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold ${isDarkMode ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                      >
                        <LogOut size={12} /> Token löschen & neu versuchen
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default MusicDashboard;
