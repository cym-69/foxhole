// name: list of boxes, each [latMin, latMax, lngMin, lngMax].
// Thin seas use several small boxes so inland places do not count.
const R = {
  gulf: [[22, 31, 47, 60]],
  middle_east: [[12, 38, 34, 60]],
  redsea: [[12, 16, 41, 44], [16, 22, 36, 41], [22, 28, 34, 37.5], [28, 30, 32.3, 35.5]],
  suez: [[29, 32, 31.5, 33.3]],
  blacksea: [[40.5, 47.5, 27, 41.8]],
  ukraine: [[44, 53, 22, 40.5]],
  taiwan: [[21, 26.5, 119, 123]],
  japan: [[30, 46, 129, 146.5]],
  korea: [[33, 39, 124, 131]],
  chile_peru: [[-40, -10, -80, -66]],
  panama: [[6.5, 10, -81, -78.5]],
  gulf_mexico: [[18, 31, -98, -80]],
  us_midwest: [[36, 46, -104, -88]],
};

export function regionsOf(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return [];
  return Object.entries(R)
    .filter(([, boxes]) => boxes.some(([a, b, c, d]) => lat >= a && lat <= b && lng >= c && lng <= d))
    .map(([k]) => k);
}
