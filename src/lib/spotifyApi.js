// Thin wrapper around the Spotify Web API.
// Auto-refreshes the access token on 401.

import { getValidAccessToken, logout } from './spotifyAuth.js';

const API = 'https://api.spotify.com/v1';

async function request(path, { retry = true } = {}) {
  const token = await getValidAccessToken();
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && retry) {
    // Token expired or revoked — clear and let caller re-auth
    logout();
    throw new Error('Spotify-Session abgelaufen. Bitte neu verbinden.');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API ${res.status}: ${text}`);
  }
  return res.json();
}

export function getMe() {
  return request('/me');
}

// time_range: short_term (4 weeks), medium_term (6 months), long_term (~1 year)
export function getTopTracks(timeRange = 'medium_term', limit = 10) {
  return request(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`);
}

export function getTopArtists(timeRange = 'medium_term', limit = 10) {
  return request(`/me/top/artists?time_range=${timeRange}&limit=${limit}`);
}

export function getRecentlyPlayed(limit = 50) {
  return request(`/me/player/recently-played?limit=${limit}`);
}

export function getSavedTracksCount() {
  // Trick: ask for 1 track, the response also contains `total`.
  return request('/me/tracks?limit=1').then((data) => data.total);
}

export function getFollowedArtistsCount() {
  return request('/me/following?type=artist&limit=1').then(
    (data) => data.artists?.total ?? 0,
  );
}

// ---------- Artist endpoints (Lou FTMKZ as artist) ----------

export function getArtist(artistId) {
  return request(`/artists/${artistId}`);
}

export function getArtistTopTracks(artistId, market = 'DE') {
  return request(`/artists/${artistId}/top-tracks?market=${market}`);
}

export function getArtistAlbums(
  artistId,
  { market = 'DE', limit = 50, includeGroups = 'album,single,ep' } = {},
) {
  const params = new URLSearchParams({
    market,
    limit: String(limit),
    include_groups: includeGroups,
  });
  return request(`/artists/${artistId}/albums?${params.toString()}`);
}
