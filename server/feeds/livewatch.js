import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../config.js';

const PLATFORMS = new Set(['kick', 'twitch', 'youtube', 'rumble']);
const TIMEOUT_MS = 15000;
const MAX_ENTRIES = 60;

function defaultUrl(platform, handle) {
  if (platform === 'kick') return `https://kick.com/${handle}`;
  if (platform === 'twitch') return `https://www.twitch.tv/${handle}`;
  if (platform === 'youtube') return `https://www.youtube.com/@${handle}`;
  if (platform === 'rumble') return `https://rumble.com/${handle}`;
  return '';
}

export function sanitizeWatchlist(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) continue;
    if (seen.has(id)) continue;
    const platform = typeof entry.platform === 'string' ? entry.platform.trim().toLowerCase() : '';
    if (!PLATFORMS.has(platform)) continue;
    const handle = typeof entry.handle === 'string' ? entry.handle.trim() : '';
    if (!handle) continue;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!name) continue;
    seen.add(id);
    const url = typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : defaultUrl(platform, handle);
    out.push({
      id,
      platform,
      handle,
      name,
      url,
      enabled: Boolean(entry.enabled),
    });
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

function loadWatchlist() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const watchlistPath = path.join(here, '..', 'config', 'live-watchlist.json');
    return sanitizeWatchlist(JSON.parse(fs.readFileSync(watchlistPath, 'utf8')));
  } catch { /* intentional: a missing or unreadable watchlist file means no tracked channels */ }
  return [];
}

const watchlist = loadWatchlist();

function isHttpError(res) {
  return res?.ok === false || (typeof res?.status === 'number' && res.status >= 400);
}

export async function checkOne(
  entry,
  {
    fetchImpl = fetch,
    twitchClientId = process.env.TWITCH_CLIENT_ID || '',
    twitchToken = process.env.TWITCH_ACCESS_TOKEN || '',
  } = {},
) {
  const checkedAt = new Date().toISOString();
  const id = entry?.id ?? null;
  const name = typeof entry?.name === 'string' ? entry.name : '';
  const platform = typeof entry?.platform === 'string' ? entry.platform : '';
  const handle = typeof entry?.handle === 'string' ? entry.handle : '';
  const url = typeof entry?.url === 'string' && entry.url ? entry.url : defaultUrl(platform, handle) || null;

  const base = (overrides = {}) => ({
    id,
    name,
    platform,
    live: false,
    unknown: true,
    title: null,
    category: null,
    viewers: null,
    thumbnail: null,
    url,
    startedAt: null,
    checkedAt,
    ...overrides,
  });

  if (platform === 'kick') {
    try {
      const res = await fetchImpl(`https://kick.com/api/v2/channels/${encodeURIComponent(handle)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (isHttpError(res)) throw new Error(`Kick HTTP ${res.status}`);
      const json = await res.json();
      const livestream = json?.livestream;
      if (livestream) {
        return base({
          live: true,
          unknown: false,
          title: livestream.session_title ?? null,
          category: livestream.category?.name ?? (typeof livestream.category === 'string' ? livestream.category : null),
          viewers: livestream.viewers ?? livestream.viewer_count ?? null,
          thumbnail:
            livestream.thumbnail_url ??
            (typeof livestream.thumbnail === 'string' ? livestream.thumbnail : livestream.thumbnail?.url ?? null),
          startedAt: livestream.created_at ?? null,
        });
      }
      return base({ live: false, unknown: false });
    } catch { /* intentional: a failed Kick lookup means we do not know the live state */ }
    return base({ live: false, unknown: true });
  }

  if (platform === 'twitch') {
    if (!twitchClientId || !twitchToken) return base({ live: false, unknown: true });
    try {
      const res = await fetchImpl(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(handle)}`, {
        headers: {
          'Client-Id': twitchClientId,
          Authorization: `Bearer ${twitchToken}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (isHttpError(res)) throw new Error(`Twitch HTTP ${res.status}`);
      const json = await res.json();
      const streams = Array.isArray(json?.data) ? json.data : [];
      if (streams.length > 0) {
        const stream = streams[0];
        return base({
          live: true,
          unknown: false,
          title: stream.title ?? null,
          category: stream.game_name ?? null,
          viewers: stream.viewer_count ?? null,
          thumbnail: typeof stream.thumbnail_url === 'string'
            ? stream.thumbnail_url.replace('{width}', '440').replace('{height}', '248')
            : null,
          startedAt: stream.started_at ?? null,
        });
      }
      return base({ live: false, unknown: false });
    } catch { /* intentional: a failed Twitch lookup means we do not know the live state */ }
    return base({ live: false, unknown: true });
  }

  // youtube / rumble: no free live-status API wired here — never fake-live.
  return base({ live: false, unknown: true });
}

let lastSnapshot = { ok: false, updatedAt: null, items: [] };

export function liveNowSnapshot() {
  return lastSnapshot;
}

export async function refreshLiveWatchlist(options = {}) {
  const enabled = watchlist.filter((entry) => entry.enabled);
  try {
    const results = await Promise.allSettled(enabled.map((entry) => checkOne(entry, options)));
    const items = results.map((result, index) => {
      const entry = enabled[index];
      if (result.status === 'fulfilled') return { ...result.value, handle: entry.handle };
      return {
        id: entry.id,
        name: entry.name,
        platform: entry.platform,
        live: false,
        unknown: true,
        title: null,
        category: null,
        viewers: null,
        thumbnail: null,
        url: entry.url,
        startedAt: null,
        checkedAt: new Date().toISOString(),
        handle: entry.handle,
      };
    });
    // An empty watchlist is not a failure, but it is not live either — the
    // TopBar pill will say so instead of showing a dead "Live" chip.
    lastSnapshot = { ok: items.length > 0, updatedAt: new Date().toISOString(), items };
    return lastSnapshot;
  } catch { /* intentional: refreshLiveWatchlist never rejects; fall back to an empty snapshot */ }
  lastSnapshot = { ok: false, updatedAt: new Date().toISOString(), items: [] };
  return lastSnapshot;
}

let intervalId = null;

function stopLiveWatchlist() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function startLiveWatchlist() {
  if (intervalId !== null) return stopLiveWatchlist;
  refreshLiveWatchlist().catch(() => { /* intentional: refreshLiveWatchlist resolves with an error snapshot */ });
  intervalId = setInterval(() => {
    refreshLiveWatchlist().catch(() => { /* intentional: refreshLiveWatchlist resolves with an error snapshot */ });
  }, 60_000);
  if (typeof intervalId.unref === 'function') intervalId.unref();
  return stopLiveWatchlist;
}
