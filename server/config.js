import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Tiny .env loader (no extra dependency)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const keysFile = path.join(DATA_DIR, 'keys.json');
let saved = {};
try { saved = JSON.parse(fs.readFileSync(keysFile, 'utf8')); } catch {}

export const cfg = {
  port: Number(process.env.PORT) || 4180,
  host: process.env.HOST || '127.0.0.1',
  demoForced: process.argv.includes('--demo'),
  finnhubBase: process.env.FINNHUB_BASE_URL || 'https://finnhub.io/api/v1',
  cryptoBase: process.env.CRYPTO_NEWS_BASE_URL || 'https://cryptocurrency.cv',
  get finnhubKey() { return saved.finnhub || process.env.FINNHUB_API_KEY || ''; },
};

export function saveKey(name, value) {
  saved[name] = value;
  fs.writeFileSync(keysFile, JSON.stringify(saved, null, 2));
}
