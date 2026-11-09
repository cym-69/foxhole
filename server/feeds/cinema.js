import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg } from '../config.js';

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

let lastSnapshot = makeSnapshot(cfg.tmdbKey ? 'error' : 'missing-key', null);
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

// Free fallback when no TMDB key: current-year films from Wikipedia (no key needed).
// Labelled 'free-fallback' so the UI never pretends this is TMDB trending.
export async function refreshWikipediaFallback(fetchImpl = fetch) {
  try {
    const year = new Date().getFullYear();
    const q = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(`${year} film`)}&gsrlimit=12&prop=pageimages|extracts&exintro=1&explaintext=1&exchars=400&piprop=thumbnail&pithumbsize=500`;
    const j = await fetchJson(q, fetchImpl);
    const pages = j?.query?.pages ? Object.values(j.query.pages) : [];
    const items = [];
    const seen = new Set();
    for (const pg of pages) {
      const title = typeof pg?.title === 'string' ? pg.title.trim() : '';
      if (!title || seen.has(title)) continue;
      seen.add(title);
      const thumb = typeof pg?.thumbnail?.source === 'string' && pg.thumbnail.source ? pg.thumbnail.source : null;
      items.push(normalizeTmdbItem({ id: pg.pageid ?? null, title, overview: typeof pg.extract === 'string' ? pg.extract.slice(0, 400) : '', poster_path: null, vote_average: null }, 'movie'));
      if (thumb) items[items.length - 1].poster = thumb;
      if (items.length >= 12) break;
    }
    if (!items.length) return null;
    return makeSnapshot('free-fallback', new Date().toISOString(), { trending: items });
  } catch { return null; }
}

export async function refreshCinema(fetchImpl = fetch) {
  const key = cfg.tmdbKey;
  if (!key) {
    const fallback = await refreshWikipediaFallback(fetchImpl);
    if (fallback) {
      lastSnapshot = fallback;
      return lastSnapshot;
    }
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
    clearTimeout(intervalId);
    intervalId = null;
  }
}

// Jittered poll interval: cinema polls hourly; ±25% avoids lockstep spikes.
export function cinemaIntervalMs(base = 60 * 60 * 1000) {
  return Math.round(base * (1 + (Math.random() - 0.5) * 0.5));
}

export function startCinema() {
  if (intervalId !== null) return stopCinema;
  refreshCinema().catch(() => { /* intentional: refreshCinema resolves with an error-status snapshot */ });
  console.log('[cinema] hourly poll with jitter');
  let timer;
  const schedule = () => {
    timer = setTimeout(() => {
      refreshCinema().catch(() => { /* intentional: refreshCinema resolves with an error-status snapshot */ });
      schedule();
    }, cinemaIntervalMs());
  };
  schedule();
  intervalId = timer;
  if (typeof intervalId.unref === 'function') intervalId.unref();
  return stopCinema;
}
