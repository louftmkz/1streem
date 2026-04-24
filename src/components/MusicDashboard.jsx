import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Music, Users, Activity, Flame } from 'lucide-react';
const MusicDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [monthlyData, setMonthlyData] = useState([]);
  const [topSongs, setTopSongs] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [hoveredSong, setHoveredSong] = useState(0);
  const platforms = [
    { id: 'all', label: 'Alle', color: '#6366f1' },
    { id: 'spotify', label: 'Spotify', color: '#1DB954' },
    { id: 'deezer', label: 'Deezer', color: '#FF0080' },
    { id: 'applemusic', label: 'Apple', color: '#FA243C' },
    { id: 'amazonmusic', label: 'Amazon', color: '#00A3E0' },
    { id: 'youtube', label: 'YouTube', color: '#FF0000' },
  ];
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
  // Daten basierend auf Platform berechnen
  const getMetrics = () => {
    if (selectedPlatform === 'all') {
      return {
        streams: Object.values(platformData).reduce((sum, p) => sum + p.streams, 0),
        listeners: Object.values(platformData).reduce((sum, p) => sum + p.listeners, 0),
        allTimeHigh: Math.max(...Object.values(platformData).map(p => p.allTimeHigh)),
        followers: Object.values(platformData).reduce((sum, p) => sum + p.followers, 0),
        trend: 11,
      };
    }
    return platformData[selectedPlatform];
  };
  const metrics = getMetrics();
  // KPI-Karten Komponente mit dynamischen Daten
  const KPICard = ({ icon: Icon, label, value, trend, color }) => (
    <div className={`relative overflow-hidden rounded-xl p-6 border transition-all duration-300 group ${color}`}>
      <div className="absolute inset-0 opacity-5" />
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-white/70' : 'opacity-70'}`}>{label}</p>
          <p className={`text-3xl font-bold mb-3 ${isDarkMode ? 'text-white' : ''}`}>{value.toLocaleString('de-DE')}</p>
          {trend && (
            <div className={`flex items-center gap-1 text-sm font-semibold ${isDarkMode ? 'text-white/75' : 'opacity-75'}`}>
              <TrendingUp size={16} />
              {trend}% vs. letzter Monat
            </div>
          )}
        </div>
        <div className="p-3 rounded-lg opacity-30 group-hover:opacity-50 transition-opacity">
          <Icon size={28} className={isDarkMode ? 'text-white' : ''} />
        </div>
      </div>
    </div>
  );
  const totalStreams = topSongs.length > 0 ? topSongs.reduce((sum, song) => sum + song.streams, 0) : 0;
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
              <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl p-3">
                <Music size={28} className="text-white" />
              </div>
              <div>
                <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>Your Analytics</h1>
                <p className={`text-xs font-medium mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Music performance across all platforms</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className={`text-xs uppercase tracking-widest font-semibold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Updated</p>
                <p className={`font-bold text-sm ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{new Date().toLocaleDateString('de-DE')}</p>
              </div>
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
          <KPICard
            icon={Music}
            label="Total Streams"
            value={metrics.streams}
            trend={metrics.trend}
            color="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-indigo-300"
          />
          <KPICard
            icon={Users}
            label="Unique Listeners"
            value={metrics.listeners}
            trend={metrics.trend}
            color="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-emerald-300"
          />
          <KPICard
            icon={Flame}
            label="All-Time High"
            value={metrics.allTimeHigh}
            trend={metrics.trend}
            color="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-orange-300"
          />
          <KPICard
            icon={TrendingUp}
            label="Followers"
            value={metrics.followers}
            trend={metrics.trend}
            color="bg-gradient-to-br from-pink-500 to-pink-600 text-white border-pink-300"
          />
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
                  stroke="#6366f1"
                  strokeWidth={3}
                  dot={{ fill: '#6366f1', r: 5 }}
                  activeDot={{ r: 7 }}
                />
                <Line
                  type="monotone"
                  dataKey="listeners"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ fill: '#10b981', r: 5 }}
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
                        <Cell key={`cell-${index}`} fill={['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899'][index]} />
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
                    {topSongs[hoveredSong]?.streams.toLocaleString('de-DE') || '—'}
                  </p>
                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {topSongs[hoveredSong] ? ((topSongs[hoveredSong].streams / totalStreams) * 100).toFixed(1) + '%' : '—'}
                  </p>
                </div>
              </div>
              {/* Legend */}
              <div className="w-full space-y-2">
                {topSongs.map((song, index) => {
                  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
                  const percentage = ((song.streams / totalStreams) * 100).toFixed(1);
                  return (
                    <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-slate-50 hover:bg-slate-100'} transition-colors`}>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors[index] }} />
                        <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{song.name}</span>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{percentage}%</p>
                        <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{song.streams.toLocaleString('de-DE')}</p>
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
                    <td className={`py-3 px-4 text-right font-semibold text-sm mono ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>{song.streams.toLocaleString('de-DE')}</td>
                    <td className={`py-3 px-4 text-right font-semibold text-sm mono ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{song.listeners.toLocaleString('de-DE')}</td>
                    <td className={`py-3 px-4 text-right font-medium text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {((song.streams / totalStreams) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Footer */}
      <div className={`border-t mt-16 ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className={`rounded-2xl p-8 border ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200'}`}>
            <h3 className={`font-bold text-lg mb-3 ${isDarkMode ? 'text-slate-100' : 'text-slate-950'}`}>Ready to Connect Real Data?</h3>
            <p className={`text-sm mb-4 max-w-2xl ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              This dashboard is currently showing example data. To integrate real Spotify data, you'll need to create a Developer Account and authenticate with OAuth. It takes about 5 minutes.
            </p>
            <ol className={`text-sm space-y-2 list-decimal list-inside ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              <li>Create a Spotify Developer Account at developer.spotify.com</li>
              <li>Generate API credentials (Client ID & Secret)</li>
              <li>Authenticate your account with OAuth</li>
              <li>Dashboard will auto-update daily with your real metrics</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
export default MusicDashboard;
