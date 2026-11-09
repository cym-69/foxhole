const LABEL = { hormuz: 'Hormuz', redsea: 'Red Sea', suez: 'Suez', blacksea: 'Black Sea', panama: 'Panama', taiwan: 'Taiwan' };

export default function Chokepoints({ boxes, shipsStatus }) {
  if (!Array.isArray(boxes) || !boxes.length) return null;
  const ais = shipsStatus === 'ok' || shipsStatus === 'stale';
  return (
    <div className="border-b-2 border-black bg-white/80 px-3 py-1.5" data-testid="chokepoints">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
        <span className="uppercase tracking-wide text-mute">Chokepoints</span>
        <span className="text-mute">{ais ? 'AIS live' : 'Ships off — showing live aircraft in each box'}</span>
        <span className="sr-only">Chokepoint activity: {boxes.map((b) => `${LABEL[b.id] || b.id} ${b.tankers + b.cargo + b.other + (b.aircraft || 0)}`).join(', ')}</span>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {boxes.map((b) => {
            const shipsN = (b.tankers || 0) + (b.cargo || 0) + (b.other || 0);
            return (
              <span key={b.id} className="inline-flex items-center gap-1 whitespace-nowrap" title={ais ? `${LABEL[b.id] || b.id}: ${b.tankers} tankers, ${b.cargo} cargo, ${b.other} other` : `${LABEL[b.id] || b.id}: ${b.aircraft || 0} live aircraft (ships need an AIS key)`}>
                <strong>{LABEL[b.id] || b.id}</strong>
                <span className="text-mute">{ais ? `${shipsN} ships` : `${b.aircraft || 0} aircraft`}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
