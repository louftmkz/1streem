import { useEffect, useMemo, useRef, useState } from 'react';

// =============================================================================
// 1streem — single-file dashboard
// Data: localStorage. Songs DB editable in-app. Export/Import via clipboard.
// =============================================================================

const ACCENT = '#1DB954';
const DASH = '—';
const STORAGE_KEY = '1streem-songs-v1';
const ARTIST_NAME = import.meta.env.VITE_ARTIST_NAME || 'Lou FTMKZ';

function loadSongs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function fmt(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return DASH;
  return Number(n).toLocaleString('de-DE');
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function App() {
  const [songs, setSongs] = useState(loadSongs);
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const fileInputRef = useRef(null);

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
    } catch {}
  }, [songs]);

  // Sort by release date — newest first; empty dates sink to bottom
  const sortedByDate = useMemo(
    () =>
      [...songs].sort((a, b) => {
        const da = a.date || '0000-00-00';
        const db = b.date || '0000-00-00';
        return db.localeCompare(da);
      }),
    [songs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedByDate;
    return sortedByDate.filter((s) => s.name.toLowerCase().includes(q));
  }, [sortedByDate, search]);

  const totalStreams = songs.reduce((s, x) => s + (Number(x.streams) || 0), 0);
  const songCount = songs.length;
  const avg = songCount ? Math.round(totalStreams / songCount) : null;
  const top10 = useMemo(
    () =>
      [...songs]
        .sort((a, b) => (Number(b.streams) || 0) - (Number(a.streams) || 0))
        .slice(0, 10),
    [songs],
  );

  // Mutators
  const addSong = ({ name, date, streams }) => {
    if (!name?.trim()) return;
    setSongs((s) => [
      ...s,
      { id: uuid(), name: name.trim(), date: date || '', streams: Number(streams) || 0 },
    ]);
    setShowAdd(false);
  };

  const setStreams = (id, value) => {
    setSongs((s) =>
      s.map((x) => (x.id === id ? { ...x, streams: Number(value) || 0 } : x)),
    );
  };

  const deleteSong = (id) => {
    if (!window.confirm('Song löschen?')) return;
    setSongs((s) => s.filter((x) => x.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const nextEditableId = (currentId) => {
    const idx = filtered.findIndex((s) => s.id === currentId);
    return idx >= 0 && idx + 1 < filtered.length ? filtered[idx + 1].id : null;
  };

  // Backup → JSON-Datei downloaden
  const downloadBackup = () => {
    const payload = {
      app: '1streem',
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

  // Wiederherstellen → File-Picker
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
        .map((x) => ({
          id: x.id || uuid(),
          name: x.name,
          date: x.date || '',
          streams: Number(x.streams) || 0,
        }));
      setPendingImport({ songs: cleaned, fileName: file.name });
    } catch (err) {
      setPendingImport({ error: err.message || 'Datei nicht lesbar.' });
    }
  };

  const confirmImport = () => {
    if (pendingImport?.songs) setSongs(pendingImport.songs);
    setPendingImport(null);
  };

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-neutral-100 antialiased"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        /* Hide default number-input spinners */
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* Header */}
      <header
        className="border-b border-neutral-900 bg-[#0a0a0a]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-baseline gap-3">
          <span className="text-lg font-bold tracking-tight">1streem</span>
          <span className="text-sm text-neutral-500">· {ARTIST_NAME}</span>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-neutral-900 bg-[#0a0a0a]">
        <div className="max-w-3xl mx-auto px-6 flex gap-6">
          <TabBtn label="Übersicht" active={tab === 'overview'} onClick={() => setTab('overview')} />
          <TabBtn label="Songs" active={tab === 'songs'} onClick={() => setTab('songs')} />
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {tab === 'overview' ? (
          <Overview total={totalStreams} count={songCount} avg={avg} top10={top10} />
        ) : (
          <SongsView
            songs={filtered}
            search={search}
            setSearch={setSearch}
            editingId={editingId}
            setEditingId={setEditingId}
            setStreams={setStreams}
            nextEditableId={nextEditableId}
            showAdd={showAdd}
            setShowAdd={setShowAdd}
            onAdd={addSong}
            onDelete={deleteSong}
          />
        )}
      </main>

      {/* Footer: Backup/Restore */}
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
            {songCount} {songCount === 1 ? 'Song' : 'Songs'}
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
              <p className="text-sm text-neutral-400">
                {pendingImport.error}
              </p>
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setPendingImport(null)}
                  className="px-4 py-2 text-sm font-bold rounded text-black"
                  style={{ backgroundColor: ACCENT }}
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
                Songs. Deine aktuellen{' '}
                <span className="mono text-neutral-200 tabular-nums">
                  {songCount}
                </span>{' '}
                Songs werden ersetzt.
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
                  style={{ backgroundColor: ACCENT }}
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

function Modal({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll
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

// ----------------------------------------------------------------------------
function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="py-4 text-sm font-semibold tracking-tight border-b-2 -mb-px transition-colors"
      style={{
        color: active ? ACCENT : '#737373',
        borderColor: active ? ACCENT : 'transparent',
      }}
    >
      {label}
    </button>
  );
}

// ----------------------------------------------------------------------------
function Overview({ total, count, avg, top10 }) {
  return (
    <div className="space-y-16">
      <section>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-4">
          Total Streams · Spotify · All Time
        </p>
        <p
          className="mono font-bold tracking-tight tabular-nums leading-none"
          style={{
            color: total > 0 ? ACCENT : '#404040',
            fontSize: 'clamp(3rem, 12vw, 7rem)',
          }}
        >
          {fmt(total)}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-8 border-t border-neutral-900 pt-10">
        <Stat label="Songs" value={fmt(count)} />
        <Stat label="Ø pro Song" value={fmt(avg)} />
      </section>

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
                  style={{ color: ACCENT }}
                >
                  {fmt(t.streams)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-neutral-700 text-sm">{DASH}</p>
        )}
      </section>
    </div>
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

// ----------------------------------------------------------------------------
function SongsView({
  songs,
  search,
  setSearch,
  editingId,
  setEditingId,
  setStreams,
  nextEditableId,
  showAdd,
  setShowAdd,
  onAdd,
  onDelete,
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 sticky top-0 bg-[#0a0a0a] pt-2 pb-3 z-10">
        <input
          type="search"
          placeholder="Suche..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-base placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700"
          style={{ fontSize: '16px' }}
        />
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 rounded font-bold text-sm text-black whitespace-nowrap"
          style={{ backgroundColor: ACCENT }}
        >
          {showAdd ? '× Abbrechen' : '+ Song'}
        </button>
      </div>

      {showAdd && <AddForm onSave={onAdd} onCancel={() => setShowAdd(false)} />}

      {songs.length === 0 ? (
        <p className="text-neutral-700 text-sm py-12 text-center">
          {search
            ? 'Keine Treffer.'
            : 'Noch keine Songs. Tap auf + um den ersten hinzuzufügen.'}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-900">
          {songs.map((song) => (
            <Row
              key={song.id}
              song={song}
              editing={editingId === song.id}
              onEdit={() => setEditingId(song.id)}
              onSave={(v) => setStreams(song.id, v)}
              onCancel={() => setEditingId(null)}
              onNext={() => setEditingId(nextEditableId(song.id))}
              onDelete={() => onDelete(song.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ song, editing, onEdit, onSave, onCancel, onNext, onDelete }) {
  const inputRef = useRef(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      // Scroll the row into view on mobile so the keyboard doesn't cover it
      inputRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [editing]);

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
          defaultValue={song.streams || ''}
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
          style={{ borderColor: ACCENT, fontSize: '16px' }}
        />
      ) : (
        <button
          onClick={onEdit}
          className="mono w-32 text-right tabular-nums text-sm py-1 px-2 rounded hover:bg-neutral-900 transition-colors"
          style={{ color: song.streams > 0 ? ACCENT : '#525252' }}
        >
          {song.streams > 0 ? fmt(song.streams) : DASH}
        </button>
      )}
      <button
        onClick={onDelete}
        className="text-neutral-700 hover:text-red-500 text-lg leading-none px-2 py-1"
        aria-label="Löschen"
      >
        ×
      </button>
    </li>
  );
}

// ----------------------------------------------------------------------------
// dd.mm.yy oder dd.mm.yyyy live-formatieren während des Tippens
function formatDateInput(raw) {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

// dd.mm.yy(yy) → ISO yyyy-mm-dd. Gibt null bei ungültigem Datum.
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

function AddForm({ onSave, onCancel }) {
  const [name, setName] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [streams, setStreams] = useState('');
  const [dateErr, setDateErr] = useState(false);

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
    onSave({ name, date: isoDate, streams });
  };

  const inputStyle = { fontSize: '16px' };
  const inputClass =
    'w-full bg-[#0a0a0a] border border-neutral-800 rounded px-3 py-3 text-base focus:outline-none focus:border-neutral-700';
  const labelClass =
    'block text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2';

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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Release</label>
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
            style={{
              ...inputStyle,
              borderColor: dateErr ? '#ef4444' : undefined,
            }}
          />
          {dateErr && (
            <p className="text-xs text-red-400 mt-1">Ungültiges Datum</p>
          )}
        </div>
        <div>
          <label className={labelClass}>Streams</label>
          <input
            type="number"
            inputMode="numeric"
            value={streams}
            onChange={(e) => setStreams(e.target.value)}
            className={inputClass + ' mono tabular-nums'}
            style={inputStyle}
          />
        </div>
      </div>
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
          style={{ backgroundColor: ACCENT }}
        >
          Speichern
        </button>
      </div>
    </form>
  );
}
