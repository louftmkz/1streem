import { useEffect, useState } from 'react';
import { exchangeCodeForToken } from '../lib/spotifyAuth.js';

// Handles the Spotify OAuth callback at /callback. Exchanges the code for
// a token, then redirects home with a flag the app picks up to open the
// URL-paste modal.
export default function Callback() {
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const err = params.get('error');
    if (err) {
      setError(`Spotify-Login abgebrochen: ${err}`);
      return;
    }
    if (!code) {
      setError('Kein Authorization-Code in der URL.');
      return;
    }
    exchangeCodeForToken(code)
      .then(() => {
        sessionStorage.setItem('spotify_just_connected', '1');
        window.location.replace('/');
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-neutral-100 antialiased"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');`}</style>
      <div className="max-w-sm w-full text-center px-6">
        {error ? (
          <>
            <div className="mx-auto mb-6 h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center text-2xl">
              ⚠
            </div>
            <h1 className="text-xl font-bold mb-2">Fehler beim Spotify-Login</h1>
            <p className="text-neutral-400 text-sm mb-6 break-words">{error}</p>
            <a
              href="/"
              className="inline-block px-5 py-2.5 rounded font-bold text-sm bg-neutral-800 text-neutral-200"
            >
              Zurück
            </a>
          </>
        ) : (
          <>
            <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-4 border-neutral-800 border-t-[#1DB954]" />
            <h1 className="text-base font-semibold mb-1">Verbinde mit Spotify...</h1>
            <p className="text-neutral-500 text-xs">Token wird ausgetauscht.</p>
          </>
        )}
      </div>
    </div>
  );
}
