const LABEL = { hormuz: 'Hormuz', redsea: 'Red Sea', suez: 'Suez', blacksea: 'Black Sea', panama: 'Panama', taiwan: 'Taiwan' };

export default function Chokepoints({ boxes, shipsStatus }) {
  if (!Array.isArray(boxes) || !boxes.length) return null;
  const ais = shipsStatus === 'ok' || shipsStatus === 'stale';
  return (
    <div className="border-b-2 border-black bg-white/80 px-3 py-1.5" data-testid="chokepoints">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
        <span className="uppercase tracking-wide text-mute">Chokepoints</span>
        <span className="text-mute">{ais ? 'AIS live' : 'Ships off — showing live aircraft in each box · events in box: see per-box'}</span>
        <span className="sr-only">Chokepoint activity: {boxes.map((b) => `${LABEL[b.id] || b.id} ${b.events || 0} event${(b.events || 0) === 1 ? '' : 's'}, ${(b.tankers || 0) + (b.cargo || 0) + (b.other || 0) + (b.aircraft || 0)} activity`).join(', ')}</span>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {boxes.map((b) => {
            const shipsN = (b.tankers || 0) + (b.cargo || 0) + (b.other || 0);
            const evN = b.events || 0;
            const highlighted = evN > 0;
            const label = LABEL[b.id] || b.id;
            const countText = ais
              ? `${shipsN} ships · ${evN} event${evN === 1 ? '' : 's'}`
              : `${evN} event${evN === 1 ? '' : 's'} · ${b.aircraft || 0} aircraft`;
            const title = ais
              ? `${label}: ${b.tankers} tankers, ${b.cargo} cargo, ${b.other} other · ${evN} context event${evN === 1 ? '' : 's'}${b.topEvent ? ': ' + b.topEvent : ''}`
              : `${label}: ${b.aircraft || 0} live aircraft (ships need an AIS key) · ${evN} context event${evN === 1 ? '' : 's'}${b.topEvent ? ': ' + b.topEvent : ''}${evN === 0 ? ' — no activity in box' : ''}`;
            return (
              <span key={b.id} className={highlighted ? 'inline-flex items-center gap-1 whitespace-nowrap border border-emerald-600 bg-emerald-50/60 rounded px-1' : 'inline-flex items-center gap-1 whitespace-nowrap'} title={title} data-highlighted={highlighted ? 'true' : undefined}>
                <strong>{label}</strong>
                <span className={highlighted ? 'font-bold text-emerald-800' : 'text-mute'}>{countText}</span>
                {evN === 0 && (ais ? shipsN === 0 : (b.aircraft || 0) === 0) ? <span className="text-mute">no activity</span> : null}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

