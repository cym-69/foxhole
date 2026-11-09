// NWS (weather.gov) alerts adapter — no key, point-based.
// GET https://api.weather.gov/alerts/active?status=actual&point=lat,lng
const UA = 'Foxhole/1.0 (personal project)';
const TIMEOUT_MS = 12000;
const POINT_LIST = [
  { name: 'New York', lat: 40.7128, lng: -74.006 },
  { name: 'Houston', lat: 29.76, lng: -95.37 },
  { name: 'Los Angeles', lat: 34.05, lng: -118.24 },
  { name: 'Chicago', lat: 41.88, lng: -87.63 },
];
export { POINT_LIST };
const SEV = { extreme: 1, severe: 0.85, moderate: 0.65, minor: 0.45, unknown: 0.3 };
export function nwsSize(severity) { return SEV[String(severity || 'unknown').toLowerCase()] ?? 0.3; }
export function normalizeNwsFeature(f, point) {
  const p = f?.properties || {};
  const urn = p.id || f?.id || '';
  if (!urn) return null;
  const geom = f?.geometry;
  const lat = typeof geom?.coordinates?.[1] === 'number' ? geom.coordinates[1] : point?.lat;
  const lng = typeof geom?.coordinates?.[0] === 'number' ? geom.coordinates[0] : point?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const area = String(p.areaDesc || point?.name || 'weather alert').slice(0, 120);
  const ts = Date.parse(p.effective) || Date.parse(p.onset) || Date.now();
  return {
    id: 'nws:' + urn,
    kind: 'storm',
    layer: 'nature',
    title: String(p.event || 'Weather alert'),
    place: area,
    lat,
    lng,
    size: nwsSize(p.severity),
    sources: 1,
    ts,
    src: 'nws',
    url: String(p.id || ''),
  };
}
export function normalizeNwsPayload(j, point) {
  if (!Array.isArray(j?.features)) throw new Error('NWS reply had no features list');
  return j.features.map((f) => normalizeNwsFeature(f, point)).filter(Boolean);
}
export async function fetchPoint(point, fetchImpl = fetch) {
  const url = `https://api.weather.gov/alerts/active?status=actual&point=${point.lat},${point.lng}`;
  const r = await fetchImpl(url, {
    headers: { 'User-Agent': UA, Accept: 'application/geo+json, application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return normalizeNwsPayload(j, point);
}
export async function fetchNws(fetchImpl = fetch) {
  const all = [];
  for (const p of POINT_LIST) all.push(...(await fetchPoint(p, fetchImpl)));
  const seen = new Set();
  return all.filter((e) => !seen.has(e.id) && seen.add(e.id));
}
