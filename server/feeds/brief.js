// server/feeds/brief.js
// Round 9: no-AI two-sentence brief synthesized from live data only.
// src is always 'rules' — the AI brief (server/ai.js getBrief) overrides it
// in buildState when a key is connected. Every fact quoted here is a real
// title, asset, place, or count from the current state — no boilerplate.

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const short = (s, max = 90) => {
  const t = clean(s);
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '\u2026' : t;
};
const ago = (ts, now) => {
  const m = Math.max(0, Math.round((now - Number(ts || 0)) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 48) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
};

// state: { events, signals, boxes, headlines, sentiment, now }
// Returns { text, src: 'rules' } — text is 2-3 sentences, <400 chars.
export function buildBrief(state) {
  const s = state || {};
  const now = Number(s.now) || Date.now();
  const events = Array.isArray(s.events) ? s.events : [];
  const signals = Array.isArray(s.signals) ? s.signals : [];
  const boxes = Array.isArray(s.boxes) ? s.boxes : [];
  const headlines = Array.isArray(s.headlines) ? s.headlines : [];

  const sentences = [];

  // Sentence 1: top event by impact — real title, place, age.
  const top = events.slice().sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))[0];
  if (top && (top.title || top.place)) {
    const evSig = signals.filter((x) => x.eventId === top.id).sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0))[0];
    const assetBit = evSig && evSig.asset
      ? ', most exposed ' + evSig.asset + ' at ' + Math.round((evSig.conf ?? 0) * 100) + '% confidence'
      : '';
    const placeBit = top.place ? ' near ' + short(top.place, 40) : '';
    sentences.push(short(top.title, 90) + placeBit + ' (' + ago(top.ts, now) + ')' + assetBit + '.');
  }

  // Sentence 2: second event (different story) or strongest signal on a
  // different event — avoids repeating the same headline twice.
  let second = null;
  let secondSig = null;
  if (top) {
    const rest = events.filter((e) => e.id !== top.id)
      .sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0));
    second = rest[0] || null;
    if (second) {
      secondSig = signals.filter((x) => x.eventId === second.id)
        .sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0))[0] || null;
    }
  }
  if (second && (second.title || second.place)) {
    const assetBit = secondSig && secondSig.asset
      ? ' (' + secondSig.action + ' ' + secondSig.asset + ' ' + Math.round((secondSig.conf ?? 0) * 100) + '%)'
      : '';
    const placeBit = second.place ? ' — ' + short(second.place, 36) : '';
    sentences.push('Also watch ' + short(second.title, 80) + placeBit + assetBit + '.');
  } else if (signals.length) {
    const strong = signals.slice().sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0))[0];
    if (strong && strong.asset) {
      sentences.push(strong.action + ' ' + strong.asset + ' at ' + Math.round((strong.conf ?? 0) * 100) + '% confidence leads signals right now.');
    }
  }

  // Sentence 3 (only when room): chokepoint or BTC sentiment or headline.
  // Prefer a chokepoint with real in-box events; otherwise BTC sentiment;
  // otherwise the newest headline text. Whichever fires is real data.
  if (sentences.length < 3) {
    const active = boxes.filter((b) => Number(b.events || 0) > 0)
      .sort((a, b) => Number(b.events || 0) - Number(a.events || 0))[0];
    const btc = s.sentiment && s.sentiment.BTC ? s.sentiment.BTC : null;
    const btcLabel = btc && (btc.label || btc.value != null) ? String(btc.label || '') : '';
    const hl = headlines.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
    if (active && (active.label || active.id)) {
      sentences.push(short(active.label || active.id, 24) + ' chokepoint shows ' + Number(active.events) + ' events in-box' +
        (active.topEvent ? ' (' + short(active.topEvent, 50) + ')' : '') + '.');
    } else if (btcLabel) {
      sentences.push('BTC sentiment reads ' + btcLabel + ' right now.');
    } else if (hl && hl.text) {
      sentences.push('Latest wire: ' + short(hl.text, 90) + '.');
    }
  }

  if (!sentences.length) {
    return { text: 'No live events linked to a tradable asset right now.', src: 'rules' };
  }
  let text = sentences.join(' ');
  if (text.length > 390) {
    text = text.slice(0, 389).replace(/\s+\S*$/, '') + '\u2026';
  }
  return { text, src: 'rules' };
}
