// Map profiles (pure data). One row of buttons next to the layer switches.
// Keys match the mapLayers keys used by the switches plus noLink for the
// "show events with no trade link" checkbox.
export const PROFILES = [
  {
    id: 'all', label: 'All',
    layers: { quakes: true, storms: true, military: true, ships: true, sats: true, noLink: true },
  },
  {
    id: 'conflict', label: 'Conflict',
    layers: { quakes: false, storms: false, military: true, ships: false, sats: false, noLink: true },
  },
  {
    id: 'energy', label: 'Energy & Shipping',
    layers: { quakes: false, storms: true, military: false, ships: true, sats: false, noLink: false },
  },
  {
    id: 'disasters', label: 'Disasters',
    layers: { quakes: true, storms: true, military: false, ships: false, sats: false, noLink: true },
  },
  {
    id: 'markets', label: 'Markets',
    layers: { quakes: false, storms: false, military: false, ships: true, sats: false, noLink: false },
  },
];

// Which profile button is lit: the preset has to match the current switches exactly.
export function matchProfile(mapLayers) {
  return PROFILES.find((p) => Object.entries(p.layers).every(([k, v]) => mapLayers[k] === v)) || null;
}
