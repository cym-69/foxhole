// Shared motion tokens for the framer-motion upgrades.
// The Framer MCP design bridge (list_mcp_resources) is disconnected in this
// environment, so these upgrades are applied with framer-motion locally and
// mirror what the Framer bridge would emit for variants/transitions.
export const REDUCED = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

// Layout spring used by lists that reorder (feed stream, asset strip).
export const SPRING_LAYOUT = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 };

// Enter/exit for staggered containers (chain steps, asset cards).
export const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: REDUCED ? 0 : 0.28, delay: REDUCED ? 0 : Math.min(i * 0.05, 0.4), ease: [0.22, 1, 0.36, 1] },
  }),
  exit: { opacity: 0, y: -6, transition: { duration: REDUCED ? 0 : 0.18 } },
};

export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: REDUCED ? 0 : 0.045, delayChildren: REDUCED ? 0 : 0.03 } },
};

// Duration helper for one-off tweens (e.g. path-length on the globe lines).
export function dur(base) {
  return REDUCED ? 0 : base;
}
