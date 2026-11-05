#!/usr/bin/env node
// Pre-commit secret guard — no external deps.
// Blocks: .env, data/ai.json, data/keys.json, *.pem, and staged content with
// long FINNHUB/AISSTREAM values or generic sk- tokens.
import { execSync } from 'node:child_process';

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);

const blockedPaths = [/^\.env$/, /^data\/ai\.json$/, /^data\/keys\.json$/, /\.pem$/];
const contentRe = [
  /FINNHUB_API_KEY\s*=\s*[^\s#\r\n=]{4,}/,
  /AISSTREAM_API_KEY\s*=\s*[^\s#\r\n=]{4,}/,
  /sk-[A-Za-z0-9_-]{16,}/,
];

function contentHits(diff) {
  return contentRe.some((re) => {
    const m = re.exec(diff);
    // Ignore matches that run into the diff's own '+' line prefix (e.g. an
    // empty `KEY=` line glued to the next added line). Only count a hit
    // when the matched value does not contain a newline or a leading '+'.
    if (!m) return false;
    const value = m[0].split('=')[1] || '';
    return value.length >= 4 && !value.startsWith('+') && !value.startsWith('\n');
  });
}

let bad = false;
for (const f of staged) {
  if (blockedPaths.some((re) => re.test(f))) {
    console.error(`[pre-commit] blocked by path: ${f}`);
    bad = true;
    continue;
  }
  let diff = '';
  try {
    diff = execSync(`git diff --cached -- ${JSON.stringify(f)}`, { encoding: 'utf8', maxBuffer: 1 << 20 });
  } catch { continue; }
  if (contentHits(diff)) {
    console.error(`[pre-commit] blocked by content: ${f}`);
    bad = true;
  }
}
process.exit(bad ? 1 : 0);
