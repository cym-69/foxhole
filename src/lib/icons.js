// One icon per layer. Dot icon tells you the type of event.
export const ICONS = {
  conflict: '<circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  trade: '<path d="M4 15l2 4h12l2-4z"/><path d="M12 3v8"/><path d="M7 11h10"/>',
  policy: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8"/><path d="M3 20h18"/>',
  nature: '<path d="M3 9c3-3 6 3 9 0s6 3 9 0"/><path d="M3 15c3-3 6 3 9 0s6 3 9 0"/>',
  crypto: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9h4a1.6 1.6 0 010 3.2h-4m0 0h4.4a1.6 1.6 0 010 3.2H9.5M12 7v2M12 15.4v1.8"/>',
};
export const ICON_SHAPES = {
  conflict: [
    { tag: 'circle', props: { cx: '12', cy: '12', r: '6' } },
    { tag: 'path', props: { d: 'M12 2v4M12 18v4M2 12h4M18 12h4' } },
  ],
  trade: [
    { tag: 'path', props: { d: 'M4 15l2 4h12l2-4z' } },
    { tag: 'path', props: { d: 'M12 3v8' } },
    { tag: 'path', props: { d: 'M7 11h10' } },
  ],
  policy: [
    { tag: 'path', props: { d: 'M3 10l9-6 9 6' } },
    { tag: 'path', props: { d: 'M5 10v8M10 10v8M14 10v8M19 10v8' } },
    { tag: 'path', props: { d: 'M3 20h18' } },
  ],
  nature: [
    { tag: 'path', props: { d: 'M3 9c3-3 6 3 9 0s6 3 9 0' } },
    { tag: 'path', props: { d: 'M3 15c3-3 6 3 9 0s6 3 9 0' } },
  ],
  crypto: [
    { tag: 'circle', props: { cx: '12', cy: '12', r: '8' } },
    { tag: 'path', props: { d: 'M9.5 9h4a1.6 1.6 0 010 3.2h-4m0 0h4.4a1.6 1.6 0 010 3.2H9.5M12 7v2M12 15.4v1.8' } },
  ],
};
export const LAYERS = [
  { id: 'conflict', label: 'Conflict' },
  { id: 'trade', label: 'Trade' },
  { id: 'policy', label: 'Policy' },
  { id: 'nature', label: 'Nature' },
  { id: 'crypto', label: 'Crypto' },
];
