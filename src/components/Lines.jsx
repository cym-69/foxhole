import { motion } from 'framer-motion';
import { REDUCED, dur } from '../lib/motion.js';

const COLOR = { up: '#5FD39A', down: '#E5706B', warn: '#E0B45A' };

// Flowing lines from the selected event to every asset card it touches
export default function Lines({ lines }) {
  return (
    <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full" aria-hidden="true">
      {lines.map((l, i) => {
        const my = (l.from.y + l.to.y) / 2;
        const d = `M ${l.from.x} ${l.from.y} C ${l.from.x} ${my}, ${l.to.x} ${my}, ${l.to.x} ${l.to.y}`;
        const c = COLOR[l.dir > 0 ? 'up' : l.dir < 0 ? 'down' : 'warn'];
        return (
          <g key={l.a}>
            <motion.path d={d} fill="none" stroke={c} strokeOpacity="0.35" strokeWidth="1.2" initial={REDUCED ? { pathLength: 1 } : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: dur(0.6), delay: REDUCED ? 0 : i * 0.05 }} />
            <motion.path d={d} fill="none" stroke={c} strokeWidth="1.6" className="fx-flow" initial={{ opacity: 0 }} animate={{ opacity: 0.9 }} transition={{ delay: REDUCED ? 0 : 0.5 + i * 0.05 }} />
            <circle cx={l.to.x} cy={l.to.y} r="3" fill={c} />
          </g>
        );
      })}
    </svg>
  );
}
