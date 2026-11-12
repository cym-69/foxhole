import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'foxhole.layout.split';
const MARK_V = 900;
const LEFT_MIN = 200;
const RIGHT_MIN = 200;
const MAX_EXPAND = 0.35;
const LEFT_DEFAULT = 340;
const RIGHT_DEFAULT = 360;
const CENTRAL_MIN = 320;

export function SplitHandle({ side, label, valueNow, minNow, maxNow, onStep, onReset, getTotal }) {
  const dragRef = useRef(null);
  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startV = valueNow;
    const total = getTotal ? getTotal() : 0;
    const move = (ev) => {
      const dx = ev.clientX - startX;
      onStep(Math.round(startV + (side === 'left' ? dx : -dx)), total);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    dragRef.current = up;
  }, [side, valueNow, onStep, getTotal]);
  const onKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onStep(valueNow - 10, 0); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onStep(valueNow + 10, 0); }
    else if (e.key === 'Home') { e.preventDefault(); onStep(minNow, 0); }
    else if (e.key === 'End') { e.preventDefault(); onStep(maxNow, 0); }
  }, [valueNow, minNow, maxNow, onStep]);
  return (
    <div role="slider" tabIndex={0} aria-label={label} aria-valuemin={minNow} aria-valuemax={maxNow} aria-valuenow={valueNow} aria-orientation="vertical" data-testid={"split-handle-" + side} onPointerDown={onPointerDown} onDoubleClick={onReset} onKeyDown={onKeyDown} className="rs-handle cursor-col-resize touch-none select-none" title={label} />
  );
}

export function computeLayout(leftFloat, rightFloat, containerW) {
  const total = containerW > 0 ? containerW : 0;
  const maxLeft = Math.round(LEFT_DEFAULT * (1 + MAX_EXPAND));
  const maxRight = Math.round(RIGHT_DEFAULT * (1 + MAX_EXPAND));
  let left = Math.round(Math.min(maxLeft, Math.max(LEFT_MIN, leftFloat || LEFT_DEFAULT)));
  let right = Math.round(Math.min(maxRight, Math.max(RIGHT_MIN, rightFloat || RIGHT_DEFAULT)));
  if (total > 0 && left + right + CENTRAL_MIN > total) {
    const overflow = Math.max(0, left + right + CENTRAL_MIN - total);
    const lShr = left - LEFT_MIN;
    const rShr = right - RIGHT_MIN;
    const shrAll = lShr + rShr;
    if (shrAll > 0) {
      const lCut = Math.min(lShr, Math.round(overflow * (lShr / shrAll)));
      const lCut2 = Math.min(overflow, lShr);
      left = left - Math.min(lCut, lCut2);
      right = right - (overflow - Math.min(lCut, lCut2));
      if (left < LEFT_MIN) { right = right - (LEFT_MIN - left); left = LEFT_MIN; }
      if (right < RIGHT_MIN) { left = left - (RIGHT_MIN - right); right = RIGHT_MIN; }
      if (left < LEFT_MIN) left = LEFT_MIN;
      if (right < RIGHT_MIN) right = RIGHT_MIN;
    }
  }
  return { left: Math.round(left), right: Math.round(right), minLeft: LEFT_MIN, maxLeft, minRight: RIGHT_MIN, maxRight };
}
export default function ResizableSplit({ children }) {
  const rootRef = useRef(null);
  const [leftPct, setLeftPct] = useState(LEFT_DEFAULT);
  const [rightPct, setRightPct] = useState(RIGHT_DEFAULT);
  const [hidden, setHidden] = useState(false);
  const persist = useCallback((l, r) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: l, right: r })); } catch {} }, []);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (s && typeof s.left === 'number' && typeof s.right === 'number') { setLeftPct(Math.round(s.left)); setRightPct(Math.round(s.right)); }
    } catch {}
    const check = () => setHidden(window.innerWidth < MARK_V);
    check(); window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  useEffect(() => { if (!hidden) persist(leftPct, rightPct); }, [leftPct, rightPct, hidden, persist]);
  useEffect(() => {
    const norm = () => {
      const total = rootRef.current ? rootRef.current.getBoundingClientRect().width : 0;
      const layout = computeLayout(leftPct, rightPct, total);
      if (layout.left !== leftPct || layout.right !== rightPct) { setLeftPct(layout.left); setRightPct(layout.right); }
    };
    norm();
    window.addEventListener('resize', norm);
    return () => window.removeEventListener('resize', norm);
  }, [leftPct, rightPct]);
  const containerWidth = () => (rootRef.current ? rootRef.current.getBoundingClientRect().width : 0);
  const setL = useCallback((v, total) => {
    const tt = typeof total === 'number' && total > 0 ? total : containerWidth();
    const layout = computeLayout(v, rightPct, tt);
    setLeftPct(layout.left);
  }, [rightPct]);
  const setR = useCallback((v, total) => {
    const tt = typeof total === 'number' && total > 0 ? total : containerWidth();
    const layout = computeLayout(leftPct, v, tt);
    setRightPct(layout.right);
  }, [leftPct]);
  const reset = useCallback(() => { setLeftPct(LEFT_DEFAULT); setRightPct(RIGHT_DEFAULT); try { localStorage.removeItem(STORAGE_KEY); } catch {} }, []);
  const kids = Array.isArray(children) ? children : [children];
  const left = kids[0]; const center = kids[1]; const right = kids[2];
  if (hidden) return <div className="rs-root flex flex-col" style={{ minHeight: 0 }}>{children}</div>;
  const layout = computeLayout(leftPct, rightPct, containerWidth());
  const cols = layout.left + 'px 6px minmax(0,1fr) 6px ' + layout.right + 'px';
  return (
    <div id="main" className="rs-root grid min-h-0" style={{ gridTemplateColumns: cols }} ref={rootRef}>
      <div className="min-w-0 overflow-hidden" style={{ minHeight: 0 }}>{left}</div>
      <SplitHandle side="left" label="Resize left pane" valueNow={layout.left} minNow={layout.minLeft} maxNow={layout.maxLeft} onStep={setL} onReset={reset} getTotal={containerWidth} />
      <div className="min-w-0 min-h-0 overflow-hidden" style={{ minHeight: 0 }}>{center}</div>
      <SplitHandle side="right" label="Resize right pane" valueNow={layout.right} minNow={layout.minRight} maxNow={layout.maxRight} onStep={setR} onReset={reset} getTotal={containerWidth} />
      <div className="min-w-0 overflow-hidden" style={{ minHeight: 0 }}>{right}</div>
    </div>
  );
}
