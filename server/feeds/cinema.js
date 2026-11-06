import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../config.js';

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TIMEOUT_MS = 15000;
const TRACKING_STATUSES = ['watching', 'want', 'done'];

function imageUrl(p) {
  return typeof p === 'string' && p ? `${IMAGE_BASE}${p}` : null;
}

export function normalizeTmdbItem(raw, fallbackMediaType) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: null,
      media_type: fallbackMediaType || null,
      title: '',
      overview: '',
      rating: null,
      popularity: null,
      poster: null,
      backdrop: null,
      release_date: '',
      genre_names: [],
    };
  }
  return {
    id: raw.id ?? null,
    media_type: raw.media_type || fallbackMediaType || null,
    title: raw.title || raw.name || '',
    overview: typeof raw.overview === 'string' ? raw.overview : '',
    rating: typeof raw.vote_average === 'number' ? raw.vote_average : null,
    popularity: typeof raw.popularity === 'number' ? raw.popularity : null,
    poster: imageUrl(raw.poster_path),
    backdrop: imageUrl(raw.backdrop_path),
    release_date: raw.release_date || raw.first_air_date || '',
    genre_names: Array.isArray(raw.genres)
      ? raw.genres.map((g) => g?.name).filter((n) => typeof n === 'string' && n)
      : [],
  };
}

export function sanitizeTracking(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.id === null || entry.id === undefined || entry.id === '') continue;
    const id = Number(entry.id);
    if (!Number.isFinite(id)) continue;
    if (entry.media_type !== 'movie' && entry.media_type !== 'tv') continue;
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    if (!title) continue;
    const key = `${entry.media_type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let status = typeof entry.status === 'string' ? entry.status.trim().toLowerCase() : '';
    if (!TRACKING_STATUSES.includes(status)) status = 'want';
    out.push({
      id,
      media_type: entry.media_type,
      title,
      poster: typeof entry.poster === 'string' && entry.poster ? entry.poster : null,
      status,
      note: typeof entry.note === 'string' ? entry.note : '',
    });
    if (out.length >= 200) break;
  }
  return out;
}

function loadTrackingSeed() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const seedPath = path.join(here, '..', 'config', 'cinema-tracking.json');
    return sanitizeTracking(JSON.parse(fs.readFileSync(seedPath, 'utf8')));
  } catch { /* intentional: a missing or unreadable seed file means no tracked titles */ }
  return [];
}

const trackingSeed = loadTrackingSeed();

function makeSnapshot(status, fetchedAt, lists = {}) {
  return {
    ok: status === 'live',
    status,
    fetchedAt: fetchedAt || null,
    trending: lists.trending || [],
    nowPlaying: lists.nowPlaying || [],
    upcoming: lists.upcoming || [],
    airingToday: lists.airingToday || [],
    tracking: trackingSeed,
  };
}

let lastSnapshot = makeSnapshot(process.env.TMDB_API_KEY ? 'error' : 'missing-key', null);
let lastGoodSnapshot = null;

export function cinemaSnapshot() {
  return lastSnapshot;
}

async function fetchJson(url, fetchImpl) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (r?.status === 401) {
    const err = new Error('TMDB access rejected');
    err.status = 401;
    throw err;
  }
  if (r?.ok === false || (typeof r?.status === 'number' && r.status >= 400)) {
    const err = new Error(`TMDB HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

function normalizeList(json, fallbackMediaType, filterToMediaTypes = false) {
  const results = Array.isArray(json?.results) ? json.results : [];
  return results
    .map((raw) => normalizeTmdbItem(raw, fallbackMediaType))
    .filter((item) => !filterToMediaTypes || item.media_type === 'movie' || item.media_type === 'tv');
}

export async function refreshCinema(fetchImpl = fetch) {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    lastSnapshot = makeSnapshot('missing-key', new Date().toISOString());
    return lastSnapshot;
  }
  const urls = [
    `${TMDB_BASE}/trending/all/day?api_key=${key}`,
    `${TMDB_BASE}/movie/now_playing?api_key=${key}&page=1`,
    `${TMDB_BASE}/movie/upcoming?api_key=${key}&page=1`,
    `${TMDB_BASE}/tv/airing_today?api_key=${key}&page=1`,
  ];
  try {
    // Partial outage should not blank the whole rail: fill each list
    // independently, keep live status when any list resolves.
    const [tRes, npRes, upRes, atRes] = await Promise.allSettled(
      urls.map((url) => fetchJson(url, fetchImpl)),
    );
    const failed = [tRes, npRes, upRes, atRes].filter((r) => r.status === 'rejected');
    const pick = (r) => (r.status === 'fulfilled' ? r.value : null);
    lastSnapshot = makeSnapshot(failed.length === 4 ? 'error' : 'live', new Date().toISOString(), {
      trending: normalizeList(pick(tRes), 'movie', true),
      nowPlaying: normalizeList(pick(npRes), 'movie'),
      upcoming: normalizeList(pick(upRes), 'movie'),
      airingToday: normalizeList(pick(atRes), 'tv'),
    });
    if (failed.length < 4) lastGoodSnapshot = lastSnapshot;
    return lastSnapshot;
  } catch (err) {
    if (err?.status === 401) {
      lastSnapshot = makeSnapshot('invalid-key', new Date().toISOString(), lastGoodSnapshot || {});
      return lastSnapshot;
    }
    if (lastGoodSnapshot) {
      lastSnapshot = lastGoodSnapshot;
      return lastSnapshot;
    }
    lastSnapshot = makeSnapshot('error', new Date().toISOString());
    return lastSnapshot;
  }
}

let intervalId = null;

function stopCinema() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function startCinema() {
  if (intervalId !== null) return stopCinema;
  refreshCinema().catch(() => { /* intentional: refreshCinema resolves with an error-status snapshot */ });
  intervalId = setInterval(() => {
    refreshCinema().catch(() => { /* intentional: refreshCinema resolves with an error-status snapshot */ });
  }, 60 * 60 * 1000);
  if (typeof intervalId.unref === 'function') intervalId.unref();
  return stopCinema;
}
