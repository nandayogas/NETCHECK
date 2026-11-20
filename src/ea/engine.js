// Mesin EA Builder: pengaturan EA, data historis, backtest, dan optimasi.
// Semua sinyal dihitung oleh analyzeAll() milik NetCheck (src/ndax/analyzer.js) tanpa diubah.
import { mergeConfig, TF_ORDER } from '../ndax/config.js';
import { analyzeAll } from '../ndax/analyzer.js';

export const TF_MS = { M1: 6e4, M5: 3e5, M15: 9e5, M30: 18e5, H1: 36e5, H4: 144e5, D1: 864e5 };
const INTERVAL = { M1: '1m', M5: '5m', M15: '15m', M30: '30m', H1: '1h', H4: '4h', D1: '1d' };
const CONTRACT = 100;                 // XAUUSD: 1 lot = 100 oz, jadi 1 USD gerak harga = 100 USD per lot
const WARM = 300;

// Sumber data: Binance publik. XAUUSDT (futures emas) dipakai sebagai proxy XAUUSD MT5.
const SPOT = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api-gcp.binance.com'];
const FUT = ['https://fapi.binance.com', 'https://fapi1.binance.com', 'https://fapi2.binance.com'];
export const DATA_SYMBOLS = [
  { sym: 'XAUUSDT', label: 'XAUUSDT (Binance Futures)', fut: true },
  { sym: 'PAXGUSDT', label: 'PAXGUSDT (token emas, spot)', fut: false },
];

export function cfgFromCache() {
  try { return mergeConfig(JSON.parse(localStorage.getItem('ndax.cfg'))); } catch { return mergeConfig(null); }
}

// Pengaturan awal EA diturunkan dari konfigurasi NetCheck aktif.
export function defaultsFromNetcheck(cfg = cfgFromCache()) {
  const tfs = {};
  for (const k of TF_ORDER) tfs[k] = { on: !!cfg.timeframes[k].enabled, weight: cfg.timeframes[k].weight };
  const primaryTf = cfg.primaryTf in tfs ? cfg.primaryTf : 'H1';
  tfs[primaryTf].on = true;
  return {
    name: 'NetCheckXAU', symbol: 'XAUUSD', dataSym: 'XAUUSDT', primaryTf, tfs,
    direction: 0, magic: 26051901,
    threshold: cfg.signal.threshold, sensitivity: cfg.signal.sensitivity,
    lotMode: 'risk', lot: 0.01, riskPct: 1, maxLot: 1,
    slAtr: cfg.signal.atrSlMult, rr: cfg.signal.rr,
    trail: { on: true, atrMult: 1, startRR: 1 },
    maxPos: 3, cooldown: 3, closeOpposite: true, maxSpread: 50, slippage: 30,
    mode: 'swing',
    bt: { bars: 1000, balance: 1000, spread: 0.25 },
    compileUrl: '',
  };
}

// ---------- Mode Swing / Scalping ----------
// Setiap mode punya set pengaturannya sendiri. Berpindah mode menyimpan set aktif lalu memuat set tujuan.
export const MODE_FIELDS = ['primaryTf', 'tfs', 'threshold', 'slAtr', 'rr', 'cooldown', 'maxPos', 'maxSpread', 'trail', 'closeOpposite', 'stopOff', 'expiry', 'be', 'follow', 'addWhile'];
const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const pickMode = s => Object.fromEntries(MODE_FIELDS.map(k => [k, clone(s[k])]));

// Preset scalping: M5 sebagai acuan, timeframe lebih rendah ikut, SL ketat, RR kecil, sesi aktif.
export const SCALP_TFS = { M1: 0.6, M5: 1.0, M15: 1.0, M30: 0.6, H1: 0.4 };
export function scalpPreset(s) {
  const t = {
    ...s, primaryTf: 'M5', threshold: 0.3, slAtr: 0.8, rr: 1.2, cooldown: 1, maxPos: 2, maxSpread: 20,
    trail: { on: true, atrMult: 0.6, startRR: 0.5 }, closeOpposite: true,
  };
  t.tfs = {};
  for (const k of TF_ORDER) t.tfs[k] = { on: k in SCALP_TFS, weight: SCALP_TFS[k] ?? s.tfs[k].weight };
  return pickMode(t);
}

// Preset Fast Signal Conservative: sinyal lebih sering dari M15/M5 yang dikonfirmasi M30/H1,
// tapi ambang lebih tinggi, SL lebih longgar, RR lebih besar, jeda antar entri lebih lama, dan 1 posisi.
export const FAST_TFS = { M5: 1.0, M15: 1.0, M30: 0.8, H1: 0.6 };
export function fastPreset(s) {
  const t = {
    ...s, primaryTf: 'M15', threshold: 0.45, slAtr: 1.2, rr: 1.5, cooldown: 4, maxPos: 1, maxSpread: 20,
    trail: { on: true, atrMult: 1, startRR: 1 }, closeOpposite: true,
  };
  t.tfs = {};
  for (const k of TF_ORDER) t.tfs[k] = { on: k in FAST_TFS, weight: FAST_TFS[k] ?? s.tfs[k].weight };
  return pickMode(t);
}

// Preset Stop Order Straddle: BUY STOP di atas dan SELL STOP di bawah harga, dipasang bersamaan.
// Sisi yang terisi membatalkan sisi lain (OCO). Hanya satu siklus pada satu waktu.
// stopOff = jarak pending dari harga (x ATR), expiry = masa berlaku pending (bar).
export const STRADDLE_TFS = { M1: 1.0 };
export function straddlePreset(s) {
  const t = {
    ...s, primaryTf: 'M1', threshold: 0, slAtr: 1.0, rr: 1.0, cooldown: 1, maxPos: 1, maxSpread: 20,
    stopOff: 0.5, expiry: 5, follow: true, addWhile: false,
    trail: { on: true, atrMult: 0.6, startRR: 0.5, candle: true }, closeOpposite: false,
  };
  t.tfs = {};
  for (const k of TF_ORDER) t.tfs[k] = { on: k in STRADDLE_TFS, weight: STRADDLE_TFS[k] ?? s.tfs[k].weight };
  return pickMode(t);
}

// Preset per mode selain swing (yang memakai pengaturan NetCheck).
export const PRESETS = { scalp: scalpPreset, fast: fastPreset, straddle: straddlePreset };
export const MODES = ['swing', 'scalp', 'fast', 'straddle'];

// Pastikan semua set mode ada. Dipanggil saat memuat pengaturan.
export function ensureModes(s) {
  if (s.useAnalysis == null) s.useAnalysis = true;   // false = tanpa analisa NdaxTrade (pasang BUY STOP + SELL STOP)
  if (!s.be) s.be = { on: true, start: 1, buffer: 2 };   // SL ke impas saat profit >= start x risiko, + buffer (points)
  if (s.stopOff == null) s.stopOff = 0.5;
  if (s.expiry == null) s.expiry = 5;
  if (!s.modes) {
    s.mode = 'swing';
    s.modes = { swing: pickMode(s) };
  }
  for (const m of Object.keys(PRESETS)) if (!s.modes[m]) s.modes[m] = PRESETS[m](s);
  for (const m of Object.keys(s.modes)) if (!s.modes[m].be) s.modes[m].be = { on: true, start: 1, buffer: 2 };
  for (const m of Object.keys(s.modes)) if (s.modes[m].follow == null) s.modes[m].follow = true;
  for (const m of Object.keys(s.modes)) if (s.modes[m].addWhile == null) s.modes[m].addWhile = false;
  if (s.addWhile == null) s.addWhile = false;
  if (s.follow == null) s.follow = true;
  if (!MODES.includes(s.mode)) s.mode = 'swing';
  return s;
}

export function switchMode(s, to) {
  ensureModes(s);
  if (s.mode === to) return s;
  s.modes[s.mode] = pickMode(s);
  Object.assign(s, clone(s.modes[to] || (PRESETS[to] ? PRESETS[to](s) : s.modes.swing)));
  if (!s.be) s.be = { on: true, start: 1, buffer: 2 };
  if (s.follow == null) s.follow = true;
  if (s.addWhile == null) s.addWhile = false;
  s.mode = to;
  return s;
}

// Config analisis NetCheck yang dipakai backtest = konfigurasi NetCheck + pengaturan EA.
export function analysisCfg(s, cfg = cfgFromCache(), tfList = TF_ORDER) {
  const c = JSON.parse(JSON.stringify(cfg));
  c.primaryTf = s.primaryTf;
  c.signal.threshold = s.threshold;
  c.signal.sensitivity = s.sensitivity;
  for (const k of TF_ORDER) {
    c.timeframes[k].enabled = tfList.includes(k) && s.tfs[k].on;
    c.timeframes[k].weight = s.tfs[k].weight;
  }
  return c;
}

async function getJson(hosts, path) {
  let last = null;
  for (const h of hosts) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(h + path, { cache: 'no-store', signal: ctl.signal });
      if (r.ok) return await r.json();
      last = new Error('HTTP ' + r.status);
    } catch (e) { last = e; } finally { clearTimeout(t); }
  }
  throw new Error(last && /^HTTP/.test(last.message) ? last.message : 'Tidak bisa terhubung ke Binance (kemungkinan diblokir ISP)');
}

// Ambil `bars` candle tertutup terakhir, dipecah per halaman.
export async function fetchHistory(dataSym, tf, bars) {
  const meta = DATA_SYMBOLS.find(d => d.sym === dataSym) || DATA_SYMBOLS[0];
  const base = meta.fut ? '/fapi/v1/klines' : '/api/v3/klines';
  const hosts = meta.fut ? FUT : SPOT;
  const page = meta.fut ? 1500 : 1000;
  let out = [], end = null;
  while (out.length < bars) {
    const lim = Math.min(page, bars - out.length);
    const rows = await getJson(hosts, `${base}?symbol=${dataSym}&interval=${INTERVAL[tf]}&limit=${lim}${end ? '&endTime=' + end : ''}`);
    if (!rows.length) break;
    const part = rows.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], ct: k[6] }));
    out = part.concat(out);
    end = part[0].t - 1;
    if (rows.length < lim) break;
  }
  const now = Date.now();
  return out.filter(k => k.ct < now);
}

// Timeframe di bawah timeframe utama tidak ikut backtest (datanya terlalu pendek); tetap dipakai EA live.
export const btTfs = s => TF_ORDER.filter(k => s.tfs[k].on && TF_MS[k] >= TF_MS[s.primaryTf]);

export async function loadData(s, onProgress) {
  const tfs = btTfs(s);
  const span = (s.bt.bars + WARM) * TF_MS[s.primaryTf];
  const data = {};
  let i = 0;
  for (const k of tfs) {
    onProgress && onProgress(`Mengambil data ${k} (${++i}/${tfs.length})…`);
    const need = Math.min(6000, Math.ceil(span / TF_MS[k]) + WARM);
    data[k] = await fetchHistory(s.dataSym, k, need);
  }
  return { data, tfs };
}

const tick = () => new Promise(r => setTimeout(r, 0));

// Fase 1: skor NetCheck per bar (mahal, dihitung sekali). Mengembalikan deret bar untuk simulasi.
export async function precompute(s, loaded, cfg = cfgFromCache(), onProgress, isAlive = () => true) {
  const { data, tfs } = loaded;
  const prim = data[s.primaryTf];
  if (!prim || prim.length < WARM + 50) throw new Error('Data historis timeframe utama terlalu sedikit');
  const ac = analysisCfg(s, cfg, tfs);
  const ptr = Object.fromEntries(tfs.map(k => [k, 0]));
  const series = [];
  const from = Math.max(WARM, prim.length - s.bt.bars - 1);
  for (let i = from; i < prim.length - 1; i++) {
    const now = prim[i].ct;
    const snap = {};
    for (const k of tfs) {
      const a = data[k];
      while (ptr[k] < a.length && a[ptr[k]].ct <= now) ptr[k]++;
      snap[k] = a.slice(Math.max(0, ptr[k] - ac.market.candles), ptr[k]);
    }
    const r = analyzeAll(snap, ac);
    const pa = r && r.tfs[s.primaryTf];
    series.push({
      t: prim[i + 1].t, o: prim[i + 1].o, h: prim[i + 1].h, l: prim[i + 1].l, c: prim[i + 1].c,
      score: r ? r.score : 0, atr: pa && Number.isFinite(pa.atr) ? pa.atr : null,
    });
    if (i % 20 === 0) {
      onProgress && onProgress(`Menganalisis ${i - from + 1}/${prim.length - 1 - from} bar…`);
      await tick();
      if (!isAlive()) throw new Error('dibatalkan');
    }
  }
  return series;
}

// Fase 2: simulasi trading di atas deret skor. Murah, jadi bisa dipakai untuk optimasi.
export function simulate(series, s, from = 0, to = series.length) {
  const d = s.direction;
  let bal = s.bt.balance, peak = bal, maxDD = 0, lastEntry = -1e9;
  const open = [], trades = [], curve = [{ t: series[from]?.t, v: bal }];
  const spread = s.bt.spread;
  const close = (p, price, t, why) => {
    const pnl = (p.dir > 0 ? price - p.entry : p.entry - price) * p.lots * CONTRACT;
    bal += pnl;
    trades.push({ dir: p.dir, entry: p.entry, exit: price, lots: p.lots, pnl, t0: p.t0, t1: t, why });
  };
  for (let i = from; i < to; i++) {
    const b = series[i];
    // 1) kelola posisi pada bar ini (SL lebih dulu bila SL dan TP tersentuh di bar yang sama)
    for (let k = open.length - 1; k >= 0; k--) {
      const p = open[k];
      let hit = null;
      if (p.dir > 0) { if (b.l <= p.sl) hit = [p.sl, 'SL']; else if (b.h >= p.tp) hit = [p.tp, 'TP']; }
      else { if (b.h + spread >= p.sl) hit = [p.sl, 'SL']; else if (b.l + spread <= p.tp) hit = [p.tp, 'TP']; }
      if (hit) { close(p, hit[0], b.t, hit[1]); open.splice(k, 1); }
    }
    // 2) trailing berdasarkan penutupan bar
    if (s.trail.on && b.atr) {
      for (const p of open) {
        const profit = p.dir > 0 ? b.c - p.entry : p.entry - (b.c + spread);
        if (profit < s.trail.startRR * s.slAtr * b.atr) continue;
        const nsl = p.dir > 0 ? b.c - s.trail.atrMult * b.atr : b.c + spread + s.trail.atrMult * b.atr;
        if (p.dir > 0 ? nsl > p.sl : nsl < p.sl) p.sl = nsl;
      }
    }
    // 3) sinyal bar sebelumnya dieksekusi di open bar ini
    // (skor di deret ini dihitung dari candle yang baru tertutup sebelum bar ini dibuka)
    if (b.atr) {
      const sig = b.score >= s.threshold ? 1 : b.score <= -s.threshold ? -1 : 0;
      const allowed = sig !== 0 && !(d === 1 && sig < 0) && !(d === 2 && sig > 0);
      if (allowed) {
        if (s.closeOpposite) for (let k = open.length - 1; k >= 0; k--) if (open[k].dir === -sig) { close(open[k], sig > 0 ? b.o + spread : b.o, b.t, 'Balik'); open.splice(k, 1); }
        if (open.length < s.maxPos && i - lastEntry >= s.cooldown) {
          const risk = b.atr * s.slAtr;
          const entry = sig > 0 ? b.o + spread : b.o;
          let lots = s.lot;
          if (s.lotMode === 'risk') lots = Math.floor((bal * s.riskPct / 100) / (risk * CONTRACT) * 100) / 100;
          lots = Math.max(0.01, Math.min(s.maxLot, lots));
          open.push({ dir: sig, entry, sl: entry - sig * risk, tp: entry + sig * risk * s.rr, lots, t0: b.t });
          lastEntry = i;
        }
      }
    }
    // equity (floating) untuk drawdown
    let eq = bal;
    for (const p of open) eq += (p.dir > 0 ? b.c - p.entry : p.entry - (b.c + spread)) * p.lots * CONTRACT;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak > 0 ? (peak - eq) / peak * 100 : 0);
    curve.push({ t: b.t, v: eq });
  }
  const last = series[to - 1];
  for (const p of open) close(p, last.c, last.t, 'Akhir');
  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0);
  const gp = wins.reduce((a, t) => a + t.pnl, 0), gl = -losses.reduce((a, t) => a + t.pnl, 0);
  return {
    trades, curve, balance: bal, net: bal - s.bt.balance, netPct: (bal / s.bt.balance - 1) * 100,
    n: trades.length, winRate: trades.length ? wins.length / trades.length * 100 : 0,
    pf: gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0), maxDD,
    avgWin: wins.length ? gp / wins.length : 0, avgLoss: losses.length ? -gl / losses.length : 0,
    expectancy: trades.length ? (bal - s.bt.balance) / trades.length : 0,
  };
}

// Grid pencarian per mode. Scalping: lebih banyak kombinasi (jeda antar entri ikut dicari)
// dan syarat minimal trade lebih tinggi, karena hasil scalping perlu sampel yang cukup.
export const GRIDS = {
  swing: { threshold: [0.15, 0.2, 0.25, 0.3, 0.4], slAtr: [1, 1.5, 2, 2.5], rr: [1.5, 2, 3], cooldown: null, minN: 8 },
  scalp: { threshold: [0.2, 0.25, 0.3, 0.35, 0.45], slAtr: [0.6, 0.8, 1, 1.2, 1.5], rr: [1, 1.25, 1.5, 2], cooldown: [0, 1, 2, 4], minN: 20 },
  // Fast Signal Conservative: ambang lebih tinggi dan jeda lebih lama, supaya sinyal tidak terlalu banyak.
  fast: { threshold: [0.35, 0.4, 0.45, 0.5, 0.6], slAtr: [0.8, 1, 1.2, 1.5], rr: [1.25, 1.5, 2, 2.5], cooldown: [2, 4, 6, 8], minN: 15 },
};
export const gridSize = mode => { const G = GRIDS[mode] || GRIDS.swing; return G.threshold.length * G.slAtr.length * G.rr.length * (G.cooldown ? G.cooldown.length : 1); };

// "AI Strategy Generator": mencari kombinasi parameter terbaik dari mesin NetCheck lewat backtest.
// Memilih di data latih (70%) lalu menguji di data uji (30%) agar overfitting kelihatan.
export function optimize(series, s, mode = s.mode || 'swing') {
  const G = GRIDS[mode] || GRIDS.swing;
  const cut = Math.floor(series.length * 0.7);
  const grid = [];
  for (const threshold of G.threshold)
    for (const slAtr of G.slAtr)
      for (const rr of G.rr)
        for (const cd of G.cooldown || [null]) grid.push(cd == null ? { threshold, slAtr, rr } : { threshold, slAtr, rr, cooldown: cd });
  const rows = grid.map(g => {
    const r = simulate(series, { ...s, ...g }, 0, cut);
    const score = r.n >= G.minN ? r.netPct / (r.maxDD + 5) : -999;
    return { ...g, train: r, score };
  }).sort((a, b) => b.score - a.score);
  const top = rows.slice(0, 3).map(r => ({ ...r, test: simulate(series, { ...s, ...r }, cut, series.length) }));
  return { top, cut, tried: grid.length, mode, minN: G.minN };
}
