const { createRequire } = await import('node:module');
const __require = createRequire(import.meta.url);
const { chromium } = __require('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');

const url = process.argv[2] || 'http://127.0.0.1:4180';
const CHROME_PATH = (process.env.PLAYWRIGHT_CHROME_PATH || 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage();
const lines = [];
page.on('console', (m) => {
  const loc = m.location();
  lines.push('[console:' + m.type() + '] ' + m.text() + (loc && loc.url ? ` (${loc.url}:${loc.lineNumber}:${loc.columnNumber})` : ''));
});
page.on('pageerror', (e) => {
  const parts = ['[pageerror] message=' + (e.message || String(e))];
  if (e.stack) parts.push('stack=' + e.stack);
  if (e.location) parts.push(`source=${e.location.url}:${e.location.lineNumber}:${e.location.columnNumber}`);
  lines.push(parts.join('\n  '));
});
page.on('requestfailed', (r) => lines.push('[requestfailed] ' + r.url() + ' ' + (r.failure() ? r.failure().errorText : '')));
try { await page.goto(url, { waitUntil: 'load', timeout: 15000 }); } catch (e) { lines.push('[goto-error] ' + (e.message || String(e))); }
await page.waitForTimeout(60000);
await browser.close();
process.stdout.write((lines.length ? lines.join('\n') : '0 messages') + '\n');