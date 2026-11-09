import { actionBg, ago, arrow, dirColor, pct, price } from '../lib/format.js';

const ASSET_TAILS = {
  USO: 'Oil tends to rise on supply risk.',
  STNG: 'Tanker rates firm on rerouting.',
  ITA: 'Airlines slip on route risk.',
  GLD: 'Haven bid lifts gold.',
  JETS: 'Airlines fall on route disruption.',
};

export default function SignalCard({ s, q, now }) {
  const rec = s.record.n >= 1 ? `Rule record: ${s.record.hits} of ${s.record.n} hit` : 'Rule record: none yet';
  const tail = ASSET_TAILS[s.asset] || '';
  const why = tail && !(s.why || '').includes(tail) ? `${s.why} ${tail}` : (s.why || '');
  return (
    <div className="sb-card p-3">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${actionBg(s.action)}`}>{s.action}</span>
        <span className="text-sm font-medium">{s.label}</span>
        <span className={`text-xs ${dirColor(s.dir)}`}>{arrow(s.dir)}</span>
        <span className="ml-auto text-xs text-mute">{s.level} confidence · {s.evidenceLabel || 'evidence n/a'}</span>
      </div>
      {s.eventTitle ? (
        <p className="mt-2 text-[13px] font-medium leading-snug" title={s.eventPlace ? `Event: ${s.eventPlace}` : undefined}>
          “{s.eventTitle}”
        </p>
      ) : null}
      {(q || s.eventTs) ? (
        <p className="mt-2 text-[12px] font-bold leading-snug">
          {s.eventTs ? <>Seen <time dateTime={new Date(s.eventTs).toISOString()} title={new Date(s.eventTs).toLocaleString()}>{ago(s.eventTs, now)}</time>. </> : null}
          {q ? <span className="num">{s.asset} {price(q.price)} · <span className={q.pct >= 0 ? 'text-up' : 'text-down'}>{pct(q.pct)}</span>{q.demo ? ' (demo)' : ''}</span> : null}
        </p>
      ) : null}
      <dl className="mt-2.5 space-y-1.5 text-[13px] leading-snug">
        <div className="flex gap-2"><dt className="w-[74px] shrink-0 text-mute">Window</dt><dd>{s.window}</dd></div>
        <div className="flex gap-2"><dt className="w-[74px] shrink-0 text-mute">Evidence</dt><dd>{s.evidenceLabel || ((s.evidenceCount || 1) + ' linked event(s)')}</dd></div>
        <div className="flex gap-2"><dt className="w-[74px] shrink-0 text-mute">Why</dt><dd>{why}</dd></div>
        <div className="flex gap-2"><dt className="w-[74px] shrink-0 text-mute">Crypto link</dt><dd>{s.cryptoLink}</dd></div>
        <div className="flex gap-2"><dt className="w-[74px] shrink-0 text-down">Wrong if</dt><dd>{s.wrongIf}</dd></div>
      </dl>
      <p className="mt-2.5 border-t-2 border-black pt-2 text-[11px] text-mute" title={s.ruleTitle}>
        {s.ruleTitle}. {rec}.{s.whySrc === 'ai' ? ' Reworded by your AI.' : ''}
      </p>
    </div>
  );
}
