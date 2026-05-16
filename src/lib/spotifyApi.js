// Thin wrapper around the Spotify Web API.
import { getValidAccessToken, logout } from './spotifyAuth.js';

const BASE = 'https://api.spotify.com/v1';

async function request(path) {
  const token = await getValidAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    logout();
    throw new Error('Spotify-Session abgelaufen. Bitte neu verbinden.');
  }
  if (res.status === 403) {
    const t = await res.text().catch(() => '');
    throw new Error(
      `Spotify hat den Request abgelehnt (403). Häufige Ursache: du bist nicht im User-Management der Dev App eingetragen. Details: ${t.slice(0, 200)}`,
    );
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Spotify API ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

export function getMe() {
  return request('/me');
}

export function getArtist(id) {
  return request(`/artists/${id}`);
}

export function getArtistAlbums(id, { offset = 0, limit = 20 } = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    include_groups: 'album,single',
    market: 'from_token',
  });
  return request(`/artists/${id}/albums?${params.toString()}`);
}

export function getAlbum(id) {
  return request(`/albums/${id}?market=from_token`);
}

export async function getAllArtistAlbums(id) {
  const all = [];
  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const data = await getArtistAlbums(id, { offset, limit: 20 });
    all.push(...(data.items || []));
    if (!data.next || (data.items || []).length === 0) break;
    offset += data.items.length;
  }
  return all;
}
