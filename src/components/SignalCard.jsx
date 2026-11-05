import { actionBg, arrow, dirColor } from '../lib/format.js';

export default function SignalCard({ s }) {
  const rec = s.record.n >= 1 ? `Rule record: ${s.record.hits} of ${s.record.n} hit` : 'Rule record: none yet';
  return (
    <div className="rounded-[10px] border border-line bg-panel p-3">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${actionBg(s.action)}`}>{s.action}</span>
        <span className="text-sm font-medium">{s.label}</span>
        <span className={`text-xs ${dirColor(s.dir)}`}>{arrow(s.dir)}</span>
        <span className="ml-auto text-xs text-mute">{s.level} confidence</span>
      </div>
      <dl className="mt-2.5 space-y-1.5 text-[13px] leading-snug">
        <div className="flex gap-2"><dt className="w-[74px] shrink-0 text-mute">Window</dt><dd>{s.window}</dd></div>
        <div className="flex gap-2"><dt className="w-[74px] shrink-0 text-mute">Why</dt><dd>{s.why}</dd></div>
        <div className="flex gap-2"><dt className="w-[74px] shrink-0 text-mute">Crypto link</dt><dd>{s.cryptoLink}</dd></div>
        <div className="flex gap-2"><dt className="w-[74px] shrink-0 text-down">Wrong if</dt><dd>{s.wrongIf}</dd></div>
      </dl>
      <p className="mt-2.5 border-t border-line pt-2 text-[11px] text-mute" title={s.ruleTitle}>
        {s.ruleTitle}. {rec}.{s.whySrc === 'ai' ? ' Reworded by your AI.' : ''}
      </p>
    </div>
  );
}
