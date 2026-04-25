import { useEffect, useState } from 'react';
import { exchangeCodeForToken } from '../lib/spotifyAuth.js';

export default function Callback() {
  const [status, setStatus] = useState('loading'); // loading | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const err = params.get('error');

    if (err) {
      setStatus('error');
      setErrorMsg(`Spotify-Login abgebrochen: ${err}`);
      return;
    }
    if (!code) {
      setStatus('error');
      setErrorMsg('Kein Authorization-Code in der URL.');
      return;
    }

    exchangeCodeForToken(code)
      .then(() => {
        // Clean URL and go home
        window.history.replaceState({}, '', '/');
        window.location.assign('/');
      })
      .catch((e) => {
        setStatus('error');
        setErrorMsg(e.message);
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="max-w-md text-center px-6">
        {status === 'loading' && (
          <>
            <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-500" />
            <h1 className="text-2xl font-bold mb-2">Verbinde mit Spotify...</h1>
            <p className="text-slate-400 text-sm">
              Token wird ausgetauscht. Einen Moment.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="mx-auto mb-6 h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center text-2xl">
              ⚠
            </div>
            <h1 className="text-2xl font-bold mb-2">Fehler beim Login</h1>
            <p className="text-slate-400 text-sm mb-6 break-words">{errorMsg}</p>
            <a
              href="/"
              className="inline-block px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition"
            >
              Zurück zum Dashboard
            </a>
          </>
        )}
      </div>
    </div>
  );
}
