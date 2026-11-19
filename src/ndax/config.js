// Konfigurasi NdaxTrade. Diatur dari aplikasi NdaxTrade Dev dan dibaca APK utama
// dari API, sehingga perubahan berlaku tanpa mengubah source code atau build ulang.
export const NDAX_API = 'https://netcheck-api.nandayoga711.workers.dev';
const ready = () => !NDAX_API.includes('GANTI');

// Nama timeframe boleh ditulis angka menit (15, 60, dst.) lalu diubah ke kunci yang benar.
const TF_ALIAS = { '1': 'M1', '5': 'M5', '15': 'M15', '30': 'M30', '60': 'H1', '240': 'H4', '1440': 'D1' };
const normTf = v => { const x = String(v ?? '').trim().toUpperCase(); return TF_ALIAS[x] || x; };

export const TF_ORDER = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

export const DEFAULT_CONFIG = {
  market: {
    symbol: 'BTCUSDT',
    baseUrl: 'https://api.binance.com',
    priceRefreshSec: 2,
    analysisRefreshSec: 30,
    candles: 300,
  },
  primaryTf: 'H1',
  timeframes: {
    M1:  { enabled: true, interval: '1m',  weight: 0.5, threshold: null, sensitivity: null, atrSlMult: null, rr: null },
    M5:  { enabled: true, interval: '5m',  weight: 0.7, threshold: null, sensitivity: null, atrSlMult: null, rr: null },
    M15: { enabled: true, interval: '15m', weight: 1.0, threshold: null, sensitivity: null, atrSlMult: null, rr: null },
    M30: { enabled: true, interval: '30m', weight: 1.2, threshold: null, sensitivity: null, atrSlMult: null, rr: null },
    H1:  { enabled: true, interval: '1h',  weight: 1.5, threshold: null, sensitivity: null, atrSlMult: null, rr: null },
    H4:  { enabled: true, interval: '4h',  weight: 1.8, threshold: null, sensitivity: null, atrSlMult: null, rr: null },
    D1:  { enabled: true, interval: '1d',  weight: 2.0, threshold: null, sensitivity: null, atrSlMult: null, rr: null },
  },
  signal: {
    threshold: 0.25,  // skor minimum (0-1) untuk BUY/SELL
    sensitivity: 1,   // pengali skor akhir
    atrSlMult: 1.5,   // jarak SL = ATR x nilai ini
    rr: 2,            // rasio reward:risk untuk TP
  },
  methods: {
    ema:          { enabled: true, weight: 1.2, periods: [9, 21, 50] },
    rsi:          { enabled: true, weight: 1.0, period: 14, overbought: 70, oversold: 30 },
    macd:         { enabled: true, weight: 1.0, fast: 12, slow: 26, signal: 9 },
    sr:           { enabled: true, weight: 1.2, pivot: 3, lookback: 150 },
    price_action: { enabled: true, weight: 1.0 },
    volume:       { enabled: true, weight: 0.6, period: 20 },
    atr:          { enabled: true, weight: 0, period: 14, minPct: 0.05, lowVolFactor: 0.5 },
    structure:    { enabled: true, weight: 1.4, pivot: 3, lookback: 200 },
    liquidity:    { enabled: true, weight: 1.1, lookback: 20 },
    fibonacci: {
      enabled: true, weight: 0.8, lookback: 100,
      levels: [0.236, 0.382, 0.5, 0.618, 0.786],
      goldenMin: 0.382, goldenMax: 0.618,
      scoreGolden: 0.8, scoreShallow: 0.4, scoreDeep: 0.2, scoreBreakout: 0.6,
    },
  },
};

const mergeMap = (d, r) => Object.fromEntries(
  Object.keys(d).map(k => [k, { ...d[k], ...((r && r[k]) || {}) }])
);

export function mergeConfig(r) {
  r = r || {};
  return {
    market: { ...DEFAULT_CONFIG.market, ...(r.market || {}) },
    signal: { ...DEFAULT_CONFIG.signal, ...(r.signal || {}) },
    primaryTf: normTf(r.primaryTf) || DEFAULT_CONFIG.primaryTf,
    timeframes: mergeMap(DEFAULT_CONFIG.timeframes, r.timeframes),
    methods: mergeMap(DEFAULT_CONFIG.methods, r.methods),
  };
}

// Null bila gagal, sehingga aplikasi memakai cache/default.
export async function loadRemoteConfig() {
  if (!ready()) return null;
  try {
    const r = await fetch(`${NDAX_API}/api/ndax/config`, { cache: 'no-store' });
    if (!r.ok) return null;
    return mergeConfig(await r.json());
  } catch {
    return null;
  }
}

export async function saveRemoteConfig(cfg, token) {
  if (!ready()) throw new Error('NDAX_API belum diisi di src/ndax/config.js');
  const r = await fetch(`${NDAX_API}/api/ndax/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Dev-Token': token },
    body: JSON.stringify(cfg),
  });
  if (!r.ok) throw new Error(r.status === 401 ? 'Token salah' : 'HTTP ' + r.status);
}
