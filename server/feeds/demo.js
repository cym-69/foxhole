// Clearly labeled demo data so the app is never empty on first run.
const m = (min) => Date.now() - min * 60000;
export function demoEvents() {
  return [
    { id: 'demo:hormuz', kind: 'blockade', layer: 'trade', title: 'Tanker hit near the Strait of Hormuz', place: 'Strait of Hormuz', lat: 26.5, lng: 56.3, size: 0.82, sources: 9, ts: m(40) },
    { id: 'demo:redsea', kind: 'conflict', layer: 'conflict', title: 'Missile strike on a cargo ship in the Red Sea', place: 'Red Sea', lat: 14.0, lng: 42.5, size: 0.7, sources: 7, ts: m(180) },
    { id: 'demo:gaza', kind: 'conflict', layer: 'conflict', title: 'Heavy fighting reported in the eastern Mediterranean', place: 'Eastern Mediterranean', lat: 31.4, lng: 34.3, size: 0.78, sources: 12, ts: m(15) },
    { id: 'demo:odesa', kind: 'conflict', layer: 'conflict', title: 'Strikes on grain port near Odesa', place: 'Odesa', lat: 46.5, lng: 30.7, size: 0.65, sources: 6, ts: m(120) },
    { id: 'demo:taiwan', kind: 'quake', layer: 'nature', title: 'M7.0 earthquake', place: 'off the east coast of Taiwan', lat: 24.1, lng: 121.9, size: 0.72, sources: 3, ts: m(60) },
    { id: 'demo:chile', kind: 'quake', layer: 'nature', title: 'M6.8 earthquake', place: 'near Valparaiso, Chile', lat: -33.5, lng: -71.8, size: 0.66, sources: 2, ts: m(300) },
    { id: 'demo:panama', kind: 'drought', layer: 'nature', title: 'Drought limits Panama Canal crossings', place: 'Panama Canal', lat: 9.1, lng: -79.7, size: 0.5, sources: 4, ts: m(360) },
    { id: 'demo:midwest', kind: 'drought', layer: 'nature', title: 'Severe drought across the Corn Belt', place: 'US Midwest', lat: 41.5, lng: -95.5, size: 0.55, sources: 4, ts: m(720) },
    { id: 'demo:hurricane', kind: 'storm', layer: 'nature', title: 'Hurricane heading into the Gulf of Mexico', place: 'Gulf of Mexico', lat: 25.5, lng: -90, size: 0.6, sources: 5, ts: m(240) },
    { id: 'demo:tariff', kind: 'sanction', layer: 'policy', title: 'New tariffs announced on imported chips', place: 'Washington', lat: 38.9, lng: -77.0, size: 0.6, sources: 8, ts: m(90) },
    { id: 'demo:rotterdam', kind: 'strike', layer: 'trade', title: 'Dockworkers strike at Rotterdam port', place: 'Rotterdam', lat: 51.9, lng: 4.1, size: 0.5, sources: 3, ts: m(480) },
    { id: 'demo:merapi', kind: 'volcano', layer: 'nature', title: 'Volcano eruption sends ash into the air', place: 'Java, Indonesia', lat: -7.5, lng: 110.4, size: 0.55, sources: 2, ts: m(420) },
    { id: 'demo:fire', kind: 'wildfire', layer: 'nature', title: 'Wildfire spreads in central California', place: 'California', lat: 36.7, lng: -119.4, size: 0.4, sources: 2, ts: m(540) },
    { id: 'demo:sudan', kind: 'conflict', layer: 'conflict', title: 'Clashes reported around Khartoum', place: 'Khartoum', lat: 15.5, lng: 32.5, size: 0.5, sources: 4, ts: m(200) },
    { id: 'demo:hack', kind: 'hack', layer: 'crypto', title: 'Hack or exploit: exchange says hot wallet drained', place: 'Crypto markets', lat: null, lng: null, size: 0.6, sources: 5, ts: m(50) },
    { id: 'demo:depeg', kind: 'depeg', layer: 'crypto', title: 'Stablecoin peg break: token slips below $0.97', place: 'Crypto markets', lat: null, lng: null, size: 0.5, sources: 3, ts: m(20) },
  ].map((e) => ({ ...e, src: 'demo' }));
}
export const DEMO_SENTIMENT = {
  BTC: { label: 'bearish', score: -0.34 }, ETH: { label: 'bearish', score: -0.41 },
  SOL: { label: 'neutral', score: -0.05 }, USDT: { label: 'neutral', score: 0 },
};
