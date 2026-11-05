import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from 'satellite.js';

// One TLE set -> { lat, lng, altKm } for a given moment, or null when it cannot be propagated.
export function satPosition(satrec, date = new Date()) {
  if (!satrec) return null;
  const p = propagate(satrec, date);
  if (!p || !p.position || typeof p.position.x !== 'number' || !Number.isFinite(p.position.x)) return null;
  const g = eciToGeodetic(p.position, gstime(date));
  const altKm = g.height;
  if (!Number.isFinite(altKm)) return null;
  return { lat: degreesLat(g.latitude), lng: degreesLong(g.longitude), altKm };
}

export function satrecOf(tle) {
  try { return twoline2satrec(tle.line1, tle.line2); } catch { return null; }
}

// Altitude above the surface, as a fraction of Earth radius (what globe.gl expects).
export const altFraction = (altKm) => altKm / 6371;
