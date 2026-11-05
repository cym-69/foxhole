// Horizon profile engine — scores headline items against topic profiles.
// Reads profiles from ./profiles.json at module init; falls back to inline defaults.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PROFILES = [
  {
    id: 'war',
    name: 'War & Conflict',
    description: 'Armed conflict, missile strikes, maritime chokepoints and oil disruption.',
    threshold: 6,
    keywords: [
      { term: 'Iran', weight: 3 },
      { term: 'Houthi', weight: 3 },
      { term: 'Red Sea', weight: 3 },
      { term: 'oil', weight: 2 },
      { term: 'missile', weight: 3 },
      { term: 'strike', weight: 2 },
      { term: 'sanctions', weight: 1 },
    ],
    exclude: ['celebrity', 'sports'],
    sources: ['bbc', 'aljazeera', 'dw', 'guardian', 'npr', 'bbcbiz', 'marketwatch'],
    accent: '#e11d48',
  },
  {
    id: 'markets',
    name: 'Markets',
    description: 'Rates, central banks, equities and recession risk.',
    threshold: 6,
    keywords: [
      { term: 'Fed', weight: 3 },
      { term: 'rates', weight: 3 },
      { term: 'SPY', weight: 2 },
      { term: 'recession', weight: 3 },
      { term: 'inflation', weight: 2 },
      { term: 'earnings', weight: 2 },
      { term: 'stock', weight: 1 },
    ],
    exclude: ['crypto', 'meme'],
    sources: ['bbcbiz', 'marketwatch', 'npr'],
    accent: '#2563eb',
  },
  {
    id: 'tech',
    name: 'Tech',
    description: 'AI, semiconductors, big tech and cyber security.',
    threshold: 6,
    keywords: [
      { term: 'AI', weight: 3 },
      { term: 'chips', weight: 3 },
      { term: 'Nvidia', weight: 3 },
      { term: 'cyber', weight: 2 },
      { term: 'semiconductor', weight: 2 },
      { term: 'software', weight: 1 },
      { term: 'data breach', weight: 2 },
    ],
    exclude: ['sports', 'celebrity'],
    sources: ['bbcbiz', 'marketwatch', 'npr', 'bbc'],
    accent: '#7c3aed',
  },
  {
    id: 'cinema',
    name: 'Cinema',
    description: 'Box office, premieres, streaming and auteurs.',
    threshold: 4,
    keywords: [
      { term: 'box office', weight: 3 },
      { term: 'premiere', weight: 3 },
      { term: 'streaming', weight: 2 },
      { term: 'Tarantino', weight: 3 },
      { term: 'film', weight: 1 },
      { term: 'director', weight: 2 },
      { term: 'festival', weight: 2 },
    ],
    exclude: ['sports', 'politics'],
    sources: ['bbc', 'npr', 'guardian', 'dw'],
    accent: '#d97706',
  },
  {
    id: 'crypto',
    name: 'Crypto',
    description: 'Bitcoin, ETFs, stablecoins and digital assets.',
    threshold: 6,
    keywords: [
      { term: 'Bitcoin', weight: 3 },
      { term: 'ETF', weight: 3 },
      { term: 'stablecoin', weight: 3 },
      { term: 'crypto', weight: 3 },
      { term: 'Ethereum', weight: 2 },
      { term: 'blockchain', weight: 2 },
      { term: 'token', weight: 1 },
    ],
    exclude: ['sports', 'celebrity'],
    sources: ['bbcbiz', 'marketwatch', 'npr'],
    accent: '#0891b2',
  },
];

const MAX_PROFILES = 12;
const MAX_KEYWORDS = 40;

export function sanitizeProfiles(list) {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set();
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!id || !name) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const rawThreshold = Number(raw.threshold);
    const threshold = Number.isFinite(rawThreshold)
      ? Math.min(10, Math.max(0, rawThreshold))
      : 5;
    const keywords = [];
    if (Array.isArray(raw.keywords)) {
      for (const kw of raw.keywords) {
        if (keywords.length >= MAX_KEYWORDS) break;
        if (!kw || typeof kw !== 'object') continue;
        const term = typeof kw.term === 'string' ? kw.term.trim() : '';
        const weight = Number(kw.weight);
        if (!term) continue;
        if (!Number.isFinite(weight) || weight < 1 || weight > 3) continue;
        keywords.push({ term, weight });
      }
    }
    const exclude = Array.isArray(raw.exclude)
      ? raw.exclude.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : [];
    const sources = Array.isArray(raw.sources)
      ? raw.sources.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : [];
    const accent = typeof raw.accent === 'string' ? raw.accent.trim() : '';
    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    out.push({ id, name, description, threshold, keywords, exclude, sources, accent });
    if (out.length >= MAX_PROFILES) break;
  }
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scoreText(text, profile) {
  const hay = String(text || '').toLowerCase();
  const lowerHay = hay;
  const keywords = profile && Array.isArray(profile.keywords) ? profile.keywords : [];
  const excludeList = profile && Array.isArray(profile.exclude) ? profile.exclude : [];
  let score = 0;
  const matchedTerms = [];
  for (const kw of keywords) {
    const term = kw && typeof kw.term === 'string' ? kw.term.trim() : '';
    const weight = Number(kw && kw.weight);
    if (!term || !Number.isFinite(weight)) continue;
    const lowerTerm = term.toLowerCase();
    const exactRe = new RegExp(`(^|[^a-z0-9])${escapeRegExp(lowerTerm)}($|[^a-z0-9])`, 'i');
    let contributed = 0;
    if (lowerHay === lowerTerm || exactRe.test(lowerHay)) {
      contributed = 3 * weight;
    } else if (lowerHay.includes(lowerTerm)) {
      contributed = 1 * weight;
    } else {
      continue;
    }
    score += contributed;
    matchedTerms.push(term);
  }
  for (const ex of excludeList) {
    const e = typeof ex === 'string' ? ex.trim().toLowerCase() : '';
    if (!e) continue;
    if (lowerHay.includes(e)) score -= 5;
  }
  score = Math.min(10, Math.max(0, score));
  return { score, matchedTerms };
}

export function scoreItem(item, profile) {
  const base = scoreText(
    `${item && item.text ? item.text : ''} ${item && item.srcName ? item.srcName : ''}`,
    profile,
  );
  let score = base.score;
  const sources = profile && Array.isArray(profile.sources) ? profile.sources : [];
  if (sources.length && item && !sources.includes(item.src) && !sources.includes(item.srcName)) {
    score = Math.max(0, score - 0.5);
  }
  score = Math.round(score * 100) / 100;
  return { score, matchedTerms: base.matchedTerms };
}

function canonicalUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return String(url).trim().replace(/\/$/, '');
  }
}

function titleTokens(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean);
}

function fuzzyTitleEqual(aText, bText) {
  const a = String(aText || '').toLowerCase().trim();
  const b = String(bText || '').toLowerCase().trim();
  if (!a || !b) return false;
  if (a.slice(0, 60) === b.slice(0, 60)) return true;
  const aTokens = new Set(titleTokens(aText));
  const bTokens = new Set(titleTokens(bText));
  if (!aTokens.size || !bTokens.size) return false;
  let inter = 0;
  for (const t of aTokens) if (bTokens.has(t)) inter++;
  const overlap = inter / Math.max(aTokens.size, bTokens.size);
  return overlap >= 0.8;
}

// scores: optional map of item.id -> {score, matchedTerms} or item.score field.
// dedupeItems(items) expected to receive items already carrying a score field
// (as produced by profileFeed) or plain items; keeping highest score item.
export function dedupeItems(items) {
  if (!Array.isArray(items)) return [];
  const byUrl = new Map();
  const result = [];
  // First pass: group by canonical URL, keep highest-score / newest per URL.
  for (const item of items) {
    if (!item) continue;
    const key = canonicalUrl(item.url);
    if (!key) {
      result.push(item);
      continue;
    }
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, item);
      continue;
    }
    const exScore = typeof existing.score === 'number' ? existing.score : 0;
    const newScore = typeof item.score === 'number' ? item.score : 0;
    if (newScore > exScore || (newScore === exScore && (item.ts || 0) > (existing.ts || 0))) {
      byUrl.set(key, item);
    }
  }
  const urlKept = Array.from(byUrl.values());
  const noUrl = result;
  const all = [...urlKept, ...noUrl];

  // Second pass: fuzzy title within 30 minutes, keep highest-score item.
  const kept = [];
  for (const item of all) {
    const idx = kept.findIndex((k) => {
      const dt = Math.abs((k.ts || 0) - (item.ts || 0));
      if (dt > 30 * 60 * 1000) return false;
      // do not fuzzy-merge items whose URLs are both present and different
      // if they came from different URLs but same title content — still merge
      // only when title is fuzzy-equal.
      return fuzzyTitleEqual(k.text, item.text);
    });
    if (idx === -1) {
      kept.push(item);
    } else {
      const existing = kept[idx];
      const exScore = typeof existing.score === 'number' ? existing.score : 0;
      const newScore = typeof item.score === 'number' ? item.score : 0;
      if (newScore > exScore || (newScore === exScore && (item.ts || 0) > (existing.ts || 0))) {
        kept[idx] = item;
      }
    }
  }
  // Newest-kept: sort by ts desc as final ordering.
  kept.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return kept;
}

export function profileFeed(profileId, items, { allProfiles } = {}) {
  const profiles = allProfiles ? sanitizeProfiles(allProfiles) : loadProfiles();
  const profile = profiles.find((p) => p.id === profileId) || null;
  if (!profile) return { profile: null, items: [] };
  const list = Array.isArray(items) ? items : [];
  const scored = list.map((item) => {
    const { score, matchedTerms } = scoreItem(item, profile);
    return { ...item, score, matchedTerms };
  });
  const filtered = scored.filter((x) => x.score >= profile.threshold);
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.ts || 0) - (a.ts || 0);
  });
  const deduped = dedupeItems(filtered);
  // Re-sort after dedupe by score then ts (dedupeItems sorts by ts).
  deduped.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.ts || 0) - (a.ts || 0);
  });
  return { profile, items: deduped.slice(0, 40) };
}

export function profilesSummary(items, { allProfiles } = {}) {
  const profiles = allProfiles ? sanitizeProfiles(allProfiles) : loadProfiles();
  const list = Array.isArray(items) ? items : [];
  return profiles.map((p) => {
    let count = 0;
    let topScore = 0;
    for (const item of list) {
      const { score } = scoreItem(item, p);
      if (score >= p.threshold) {
        count++;
        if (score > topScore) topScore = score;
      }
    }
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      threshold: p.threshold,
      accent: p.accent,
      count,
      topScore,
    };
  });
}

export function loadProfiles() {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const filePath = path.join(dir, 'profiles.json');
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const clean = sanitizeProfiles(parsed);
    if (clean.length) return clean;
    return sanitizeProfiles(DEFAULT_PROFILES);
  } catch {
    // intentional: fallback to defaults if the file is missing or invalid
    return sanitizeProfiles(DEFAULT_PROFILES);
  }
}

// Eager load at module init so callers get a stable list without extra I/O.
export const profiles = loadProfiles();
