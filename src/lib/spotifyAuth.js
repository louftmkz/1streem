// Spotify Authorization Code Flow with PKCE — frontend-only, no client secret.
// Used to import the artist's catalog (albums + tracks + cover art + release dates).

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI =
  import.meta.env.VITE_SPOTIFY_REDIRECT_URI ||
  (typeof window !== 'undefined' ? `${window.location.origin}/callback` : '');

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = ['user-read-private', 'user-read-email'].join(' ');

const KEY = {
  accessToken: 'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiry: 'spotify_token_expiry',
  verifier: 'spotify_code_verifier',
};

// ---------- PKCE helpers ----------

function randomVerifier(length = 64) {
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += possible[bytes[i] % possible.length];
  return out;
}

function base64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function challenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hashed = await crypto.subtle.digest('SHA-256', data);
  return base64Url(hashed);
}

// ---------- Public API ----------

export function isConfigured() {
  return Boolean(CLIENT_ID);
}

export function isLoggedIn() {
  const t = localStorage.getItem(KEY.accessToken);
  const exp = Number(localStorage.getItem(KEY.expiry) || 0);
  return Boolean(t) && Date.now() < exp;
}

export function hasRefreshToken() {
  return Boolean(localStorage.getItem(KEY.refreshToken));
}

export async function login() {
  if (!CLIENT_ID) {
    throw new Error(
      'VITE_SPOTIFY_CLIENT_ID nicht gesetzt. Trag sie in Vercel Env Vars ein und re-deploy.',
    );
  }
  const v = randomVerifier();
  const c = await challenge(v);
  localStorage.setItem(KEY.verifier, v);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: c,
  });
  window.location.assign(`${AUTH_URL}?${params.toString()}`);
}

export async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem(KEY.verifier);
  if (!verifier) throw new Error('PKCE verifier fehlt — bitte erneut einloggen.');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token-Tausch fehlgeschlagen: ${res.status} ${t}`);
  }
  const data = await res.json();
  saveTokens(data);
  localStorage.removeItem(KEY.verifier);
  return data;
}

export async function refreshAccessToken() {
  const refresh = localStorage.getItem(KEY.refreshToken);
  if (!refresh) throw new Error('Kein Refresh-Token vorhanden.');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh,
    client_id: CLIENT_ID,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Refresh fehlgeschlagen: ${res.status} ${t}`);
  }
  const data = await res.json();
  saveTokens(data);
  return data;
}

export async function getValidAccessToken() {
  const t = localStorage.getItem(KEY.accessToken);
  const exp = Number(localStorage.getItem(KEY.expiry) || 0);
  if (!t || Date.now() >= exp - 60_000) {
    await refreshAccessToken();
    return localStorage.getItem(KEY.accessToken);
  }
  return t;
}

export function logout() {
  localStorage.removeItem(KEY.accessToken);
  localStorage.removeItem(KEY.refreshToken);
  localStorage.removeItem(KEY.expiry);
  localStorage.removeItem(KEY.verifier);
}

function saveTokens({ access_token, refresh_token, expires_in }) {
  if (access_token) localStorage.setItem(KEY.accessToken, access_token);
  if (refresh_token) localStorage.setItem(KEY.refreshToken, refresh_token);
  if (expires_in)
    localStorage.setItem(KEY.expiry, String(Date.now() + expires_in * 1000));
}
