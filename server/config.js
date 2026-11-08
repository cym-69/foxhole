import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.umask(0o077); } catch { /* intentional: umask unsupported on some platforms */ }

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA_DIR = process.env.FOXHOLE_DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
try { fs.chmodSync(DATA_DIR, 0o700); } catch { /* intentional: chmod is a no-op on Windows */ }

// Tiny .env loader (no extra dependency)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* intentionally optional: .env may be absent */ }

const keysFile = path.join(DATA_DIR, 'keys.json');
let saved = {};
try { saved = JSON.parse(fs.readFileSync(keysFile, 'utf8')); } catch { /* intentionally optional: keys file may be absent or empty */ }

const host = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
  throw new Error('Foxhole is a private local app. HOST must be a loopback address.');
}

export const cfg = {
  port: Number(process.env.PORT) || 4180,
  host,
  demoForced: process.argv.includes('--demo'),
  finnhubBase: process.env.FINNHUB_BASE_URL || 'https://finnhub.io/api/v1',
  cryptoBase: process.env.CRYPTO_NEWS_BASE_URL || 'https://cryptocurrency.cv',
  get finnhubKey() { return saved.finnhub || process.env.FINNHUB_API_KEY || ''; },
  get tmdbKey() { return saved.tmdb || process.env.TMDB_API_KEY || ''; },
};

export function saveKey(name, value) {
  saved[name] = value;
  fs.writeFileSync(keysFile, JSON.stringify(saved, null, 2), { mode: 0o600 });
  try { fs.chmodSync(keysFile, 0o600); } catch { /* intentional: chmod is a no-op on Windows */ }
}
