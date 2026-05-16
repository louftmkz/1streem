// Thin wrapper around the Spotify Web API.
import { getValidAccessToken, logout } from './spotifyAuth.js';

const BASE = 'https://api.spotify.com/v1';

async function request(path) {
  const token = await getValidAccessToken();
  const url = `${BASE}${path}`;
  console.log('[spotify] GET', url);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const bodyText = await res.text().catch(() => '');
  console.log('[spotify] →', res.status, bodyText.slice(0, 200));
  if (res.status === 401) {
    logout();
    throw new Error('Spotify-Session abgelaufen. Bitte neu verbinden.');
  }
  if (res.status === 403) {
    throw new Error(
      `Spotify hat den Request abgelehnt (403). Häufige Ursache: du bist nicht im User-Management der Dev App eingetragen. Details: ${bodyText.slice(0, 200)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Spotify API ${res.status} bei ${path}: ${bodyText.slice(0, 300)}`);
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error(`Spotify API: nicht-JSON Antwort von ${path}`);
  }
}

export function getMe() {
  return request('/me');
}

export function getArtist(id) {
  return request(`/artists/${id}`);
}

export function getArtistAlbums(id, { offset = 0 } = {}) {
  // Lassen Spotify den limit selbst defaulten (20) — explizites Setzen führte
  // bei aktueller API zu 400 'invalid limit'.
  const params = new URLSearchParams({
    offset: String(offset),
    include_groups: 'album,single',
  });
  return request(`/artists/${id}/albums?${params.toString()}`);
}

export function getAlbum(id) {
  return request(`/albums/${id}`);
}

export async function getAllArtistAlbums(id) {
  const all = [];
  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const data = await getArtistAlbums(id, { offset });
    all.push(...(data.items || []));
    if (!data.next || (data.items || []).length === 0) break;
    offset += data.items.length;
  }
  return all;
}
