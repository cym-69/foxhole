import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'foxhole.layout.split';
const MARK_V = 900;

export function SplitHandle({ side, label, valueNow, minNow, maxNow, onStep, onReset }) {
  const dragRef = useRef(null);
  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startV = valueNow;
    const move = (ev) => {
      const dx = ev.clientX - startX;
      onStep(Math.round(startV + (side === 'left' ? dx : -dx)));
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    dragRef.current = up;
  }, [side, valueNow, onStep]);
  const onKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onStep(valueNow - 10); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onStep(valueNow + 10); }
    else if (e.key === 'Home') { e.preventDefault(); onStep(minNow); }
    else if (e.key === 'End') { e.preventDefault(); onStep(maxNow); }
  }, [valueNow, minNow, maxNow, onStep]);
  return (
    <div role="slider" tabIndex={0} aria-label={label} aria-valuemin={minNow} aria-valuemax={maxNow} aria-valuenow={valueNow} aria-orientation="vertical" data-testid={"split-handle-" + side} onPointerDown={onPointerDown} onDoubleClick={onReset} onKeyDown={onKeyDown} className="rs-handle cursor-col-resize touch-none select-none" title={label} />
  );
}

export default function ResizableSplit({ children }) {
  const [leftPct, setLeftPct] = useState(340);
  const [rightPct, setRightPct] = useState(360);
  const [hidden, setHidden] = useState(false);
  const ROOT_MIN = 200; const ROOT_MAX = 600;
  const clamp = useCallback((v) => Math.round(Math.min(ROOT_MAX, Math.max(ROOT_MIN, v))), []);
  const persist = useCallback((l, r) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: l, right: r })); } catch {} }, []);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (s && typeof s.left === 'number' && typeof s.right === 'number') { setLeftPct(clamp(s.left)); setRightPct(clamp(s.right)); }
    } catch {}
    const check = () => setHidden(window.innerWidth < MARK_V);
    check(); window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [clamp]);
  useEffect(() => { if (!hidden) persist(leftPct, rightPct); }, [leftPct, rightPct, hidden, persist]);
  const setL = useCallback((v) => setLeftPct(clamp(v)), [clamp]);
  const setR = useCallback((v) => setRightPct(clamp(v)), [clamp]);
  const reset = useCallback(() => { setL(340); setR(360); try { localStorage.removeItem(STORAGE_KEY); } catch {} }, [setL, setR]);
  const kids = Array.isArray(children) ? children : [children];
  const left = kids[0]; const center = kids[1]; const right = kids[2];
  if (hidden) return <div className="rs-root flex flex-col" style={{ minHeight: 0 }}>{children}</div>;
  const style = { minHeight: 0 };
  return (
    <div className="rs-root flex" style={style}>
      <div className="min-w-0 shrink-0" style={{ width: leftPct }}>{left}</div>
      <SplitHandle side="left" label="Resize left pane" valueNow={leftPct} minNow={ROOT_MIN} maxNow={ROOT_MAX} onStep={setL} onReset={reset} />
      <div className="min-w-0 flex-1 relative">{center}</div>
      <SplitHandle side="right" label="Resize right pane" valueNow={rightPct} minNow={ROOT_MIN} maxNow={ROOT_MAX} onStep={setR} onReset={reset} />
      <div className="min-w-0 shrink-0" style={{ width: rightPct }}>{right}</div>
    </div>
  );
}
