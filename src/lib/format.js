export function ago(ts, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export function price(n) {
  if (n == null) return '-';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(n < 2 ? 4 : 3);
}
export function pct(n) {
  if (n == null || Number.isNaN(n)) return '-';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}
export const arrow = (d) => (d > 0 ? '▲' : d < 0 ? '▼' : '◆');
export const dirColor = (d) => (d > 0 ? 'text-up' : d < 0 ? 'text-down' : 'text-warn');
export const actionColor = (a) => (a === 'BUY' ? 'text-up' : a === 'SELL' ? 'text-down' : 'text-warn');
export const actionBg = (a) => (a === 'BUY' ? 'bg-up/15 text-up' : a === 'SELL' ? 'bg-down/15 text-down' : 'bg-warn/15 text-warn');
export function usd(n) {
  if (n == null) return '';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n)}`;
}
