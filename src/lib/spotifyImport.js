// Orchestrates: fetch full catalog from Spotify, dedupe against existing
// catalog by Spotify URI first, then by normalized name.

import * as api from './spotifyApi.js';

function norm(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function extractArtistId(input) {
  const s = (input || '').trim();
  if (!s) return null;
  // Plain id
  if (/^[a-zA-Z0-9]{20,24}$/.test(s)) return s;
  // open.spotify.com URL (with or without locale prefix, with or without query)
  const m = s.match(/\/artist\/([a-zA-Z0-9]+)/);
  if (m) return m[1];
  // spotify:artist:URI
  const u = s.match(/spotify:artist:([a-zA-Z0-9]+)/);
  if (u) return u[1];
  return null;
}

// Loads the artist's full catalog (own albums + singles, plus the tracks).
// Returns { artist, tracks: [{ spotifyUri, name, date, cover, artists }] }
export async function fetchArtistCatalog(artistId, onProgress = null) {
  const artist = await api.getArtist(artistId);
  if (onProgress) onProgress({ phase: 'artist', label: artist.name });

  const albums = await api.getAllArtistAlbums(artistId);
  // Dedupe albums by (name + release_date) to avoid pulling the same release
  // from multiple markets twice.
  const seen = new Set();
  const dedupedAlbums = albums.filter((a) => {
    const k = `${a.name.toLowerCase()}|${a.release_date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (onProgress) onProgress({ phase: 'albums', count: dedupedAlbums.length });

  const tracksByUri = new Map();
  for (let i = 0; i < dedupedAlbums.length; i++) {
    const a = dedupedAlbums[i];
    if (onProgress)
      onProgress({
        phase: 'tracks',
        current: i + 1,
        total: dedupedAlbums.length,
        album: a.name,
      });
    let album = null;
    try {
      album = await api.getAlbum(a.id);
    } catch (e) {
      console.warn(`Failed to load album ${a.id}: ${e.message}`);
      continue;
    }
    const cover = album.images?.[1]?.url || album.images?.[0]?.url || null;
    const releaseDate = album.release_date || a.release_date || '';
    const tracks = album.tracks?.items || [];
    for (const t of tracks) {
      if (!t.uri || !t.name) continue;
      const isOurs = (t.artists || []).some((x) => x.id === artistId);
      if (!isOurs) continue;
      const entry = {
        spotifyUri: t.uri,
        name: t.name,
        date: releaseDate,
        cover,
        artists: (t.artists || []).map((x) => x.name),
      };
      const existing = tracksByUri.get(t.uri);
      if (!existing || (entry.date && entry.date < existing.date)) {
        tracksByUri.set(t.uri, entry);
      }
    }
  }

  return {
    artist: {
      id: artist.id,
      name: artist.name,
      followers: artist.followers?.total ?? null,
      images: artist.images,
    },
    tracks: [...tracksByUri.values()],
  };
}

// Given Spotify tracks + existing songs, returns:
//   matches: [{ spotify, existing }]
//   newOnes: [spotify track]
export function computeDiff(spotifyTracks, existingSongs) {
  const byUri = new Map();
  const byName = new Map();
  for (const s of existingSongs) {
    if (s.spotifyUri) byUri.set(s.spotifyUri, s);
    const n = norm(s.name);
    if (n && !byName.has(n)) byName.set(n, s);
  }
  const matches = [];
  const newOnes = [];
  for (const t of spotifyTracks) {
    let m = byUri.get(t.spotifyUri);
    if (!m) m = byName.get(norm(t.name));
    if (m) matches.push({ spotify: t, existing: m });
    else newOnes.push(t);
  }
  return { matches, newOnes };
}

// Apply diff: for matches, enrich existing (cover/date/spotifyUri/artists),
// keep streams + platforms intact. For new, append with the platforms config
// passed in. Returns the new songs array.
export function applyImport(existingSongs, diff, choices, platformsConfig) {
  const { matches, newOnes } = diff;
  const acceptedMatches = new Set();
  const acceptedNew = new Set();
  for (const [key, ok] of Object.entries(choices)) {
    if (!ok) continue;
    if (key.startsWith('m:')) acceptedMatches.add(key.slice(2));
    if (key.startsWith('n:')) acceptedNew.add(key.slice(2));
  }

  // Build map of existing songs by id for fast lookup
  const songMap = new Map(existingSongs.map((s) => [s.id, s]));

  // 1) Merge matches
  for (const m of matches) {
    if (!acceptedMatches.has(m.spotify.spotifyUri)) continue;
    const existing = songMap.get(m.existing.id);
    if (!existing) continue;
    const merged = {
      ...existing,
      // Only fill blanks — never overwrite user data
      date: existing.date || m.spotify.date,
      cover: existing.cover || m.spotify.cover,
      spotifyUri: existing.spotifyUri || m.spotify.spotifyUri,
      artists: existing.artists || m.spotify.artists,
    };
    songMap.set(existing.id, merged);
  }

  // 2) Append new
  const platBools = {};
  const platNums = {};
  for (const p of platformsConfig) {
    platBools[p.id] = true;
    platNums[p.id] = 0;
  }
  const added = [];
  for (const t of newOnes) {
    if (!acceptedNew.has(t.spotifyUri)) continue;
    added.push({
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2),
      name: t.name,
      date: t.date || '',
      cover: t.cover || null,
      spotifyUri: t.spotifyUri,
      artists: t.artists || [],
      platforms: { ...platBools },
      streams: { ...platNums },
    });
  }

  return [...songMap.values(), ...added];
}
