// Free market APIs do not give futures, so commodities use ETF proxies.
export const ASSETS = {
  USO: { label: 'Oil (USO)', kind: 'commodity', row: 'trad' },
  UNG: { label: 'Natural gas (UNG)', kind: 'commodity', row: 'trad' },
  GLD: { label: 'Gold (GLD)', kind: 'commodity', row: 'trad' },
  CPER: { label: 'Copper (CPER)', kind: 'commodity', row: 'trad' },
  WEAT: { label: 'Wheat (WEAT)', kind: 'commodity', row: 'trad' },
  CORN: { label: 'Corn (CORN)', kind: 'commodity', row: 'trad' },
  ITA: { label: 'Defense (ITA)', kind: 'stock', row: 'trad' },
  JETS: { label: 'Airlines (JETS)', kind: 'stock', row: 'trad' },
  SOXX: { label: 'Chip makers (SOXX)', kind: 'stock', row: 'trad' },
  TSM: { label: 'TSMC (TSM)', kind: 'stock', row: 'trad' },
  STNG: { label: 'Oil tankers (STNG)', kind: 'stock', row: 'trad' },
  ZIM: { label: 'Container shipping (ZIM)', kind: 'stock', row: 'trad' },
  SPY: { label: 'US stocks (SPY)', kind: 'stock', row: 'trad' },
  BTC: { label: 'Bitcoin (BTC)', kind: 'crypto', row: 'crypto', cg: 'bitcoin' },
  ETH: { label: 'Ethereum (ETH)', kind: 'crypto', row: 'crypto', cg: 'ethereum' },
  SOL: { label: 'Solana (SOL)', kind: 'crypto', row: 'crypto', cg: 'solana' },
  USDT: { label: 'Tether (USDT)', kind: 'crypto', row: 'crypto', cg: 'tether' },
};
export const TRAD = Object.keys(ASSETS).filter((k) => ASSETS[k].row === 'trad');
export const CRYPTO = Object.keys(ASSETS).filter((k) => ASSETS[k].row === 'crypto');
