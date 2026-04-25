// Spotify Authorization Code Flow with PKCE
// https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI =
  import.meta.env.VITE_SPOTIFY_REDIRECT_URI ||
  `${window.location.origin}/callback`;

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
  'user-library-read',
  'user-follow-read',
].join(' ');

const STORAGE = {
  accessToken: 'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiry: 'spotify_token_expiry',
  verifier: 'spotify_code_verifier',
};

// ---------- PKCE helpers ----------

function generateCodeVerifier(length = 64) {
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  let str = '';
  for (let i = 0; i < length; i++) {
    str += possible[values[i] % possible.length];
  }
  return str;
}

function base64UrlEncode(arrayBuffer) {
  let str = '';
  const bytes = new Uint8Array(arrayBuffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(plain) {
  const encoded = new TextEncoder().encode(plain);
  return crypto.subtle.digest('SHA-256', encoded);
}

async function generateCodeChallenge(verifier) {
  const hashed = await sha256(verifier);
  return base64UrlEncode(hashed);
}

// ---------- Public API ----------

export function isConfigured() {
  return Boolean(CLIENT_ID);
}

export function isLoggedIn() {
  const token = localStorage.getItem(STORAGE.accessToken);
  const expiry = Number(localStorage.getItem(STORAGE.expiry) || 0);
  return Boolean(token) && Date.now() < expiry;
}

export async function login() {
  if (!CLIENT_ID) {
    throw new Error('VITE_SPOTIFY_CLIENT_ID nicht gesetzt.');
  }
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem(STORAGE.verifier, verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location.assign(`${AUTH_URL}?${params.toString()}`);
}

export async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem(STORAGE.verifier);
  if (!verifier) {
    throw new Error('PKCE verifier fehlt — bitte erneut einloggen.');
  }
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
    const text = await res.text();
    throw new Error(`Token-Tausch fehlgeschlagen: ${res.status} ${text}`);
  }
  const data = await res.json();
  saveTokens(data);
  localStorage.removeItem(STORAGE.verifier);
  return data;
}

export async function refreshAccessToken() {
  const refresh = localStorage.getItem(STORAGE.refreshToken);
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
    const text = await res.text();
    throw new Error(`Refresh fehlgeschlagen: ${res.status} ${text}`);
  }
  const data = await res.json();
  saveTokens(data);
  return data;
}

export async function getValidAccessToken() {
  const token = localStorage.getItem(STORAGE.accessToken);
  const expiry = Number(localStorage.getItem(STORAGE.expiry) || 0);
  // Refresh if missing, expired, or expires in <60s
  if (!token || Date.now() >= expiry - 60_000) {
    await refreshAccessToken();
    return localStorage.getItem(STORAGE.accessToken);
  }
  return token;
}

export function logout() {
  localStorage.removeItem(STORAGE.accessToken);
  localStorage.removeItem(STORAGE.refreshToken);
  localStorage.removeItem(STORAGE.expiry);
  localStorage.removeItem(STORAGE.verifier);
}

function saveTokens({ access_token, refresh_token, expires_in }) {
  if (access_token) {
    localStorage.setItem(STORAGE.accessToken, access_token);
  }
  if (refresh_token) {
    localStorage.setItem(STORAGE.refreshToken, refresh_token);
  }
  if (expires_in) {
    localStorage.setItem(
      STORAGE.expiry,
      String(Date.now() + expires_in * 1000),
    );
  }
}
