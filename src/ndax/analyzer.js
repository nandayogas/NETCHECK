import { ema, rsi, macd, atr, sma, pivots } from './indicators.js';

export const LABELS = {
  ema: 'EMA Trend',
  rsi: 'RSI',
  macd: 'MACD',
  sr: 'Support / Resistance',
  price_action: 'Price Action',
  volume: 'Volume',
  atr: 'ATR (filter volatilitas)',
  structure: 'BOS / CHoCH',
  liquidity: 'Liquidity Sweep',
  fibonacci: 'Fibonacci',
};

const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const sgn = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
const ok = v => Number.isFinite(v);
export const fmtP = v => Number(v.toFixed(v >= 1000 ? 2 : v >= 1 ? 4 : 6)).toString();

// Parameter sinyal per timeframe: nilai override jika diisi, selain itu nilai global.
const ov = (v, g) => (v == null || v === '' || !Number.isFinite(Number(v)) ? g : Number(v));
export const sigFor = (t, cfg) => ({
  threshold: ov(t?.threshold, cfg.signal.threshold),
  sensitivity: ov(t?.sensitivity, cfg.signal.sensitivity),
  atrSlMult: ov(t?.atrSlMult, cfg.signal.atrSlMult),
  rr: ov(t?.rr, cfg.signal.rr),
});

// Analisis satu timeframe. Tiap metode menghasilkan skor -1..+1.
export function analyzeTf(c, cfg) {
  const M = cfg.methods;
  const n = c.length - 1;
  const last = c[n], prev = c[n - 1];
  const closes = c.map(k => k.c);
  const atrNow = atr(c, M.atr.period)[n];
  const atrPct = ok(atrNow) ? atrNow / last.c * 100 : NaN;
  const out = [];

  const buf = ok(atrNow) ? 0.2 * atrNow : 0;
  // Level per metode: entry = harga terakhir; SL dari titik struktur jika valid, else ATR; TP = jarak SL * rr.
  const levelOf = (s, sl) => {
    const d = sgn(s);
    if (!d || !ok(atrNow) || !atrNow) return null;
    let risk = atrNow * cfg.signal.atrSlMult;
    let stop = last.c - d * risk;
    if (ok(sl)) {
      const r2 = (last.c - sl) * d;
      if (r2 > 0) { stop = sl; risk = r2; }
    }
    const rr = cfg.signal.rr;
    return { dir: d > 0 ? 'BUY' : 'SELL', entry: last.c, sl: stop, tp: last.c + d * risk * rr, rr };
  };
  const add = (id, score, note, slArg) => {
    if (!M[id].enabled) return;
    const sc = clamp(score);
    const sl = typeof slArg === 'function' ? slArg(sc) : slArg;
    out.push({ id, label: LABELS[id], score: sc, weight: M[id].weight, note, levels: levelOf(sc, sl) });
  };

  // EMA: posisi harga terhadap tiap EMA + susunan (cepat > menengah > lambat)
  {
    const es = M.ema.periods.map(p => ema(closes, p)[n]);
    if (es.every(ok)) {
      const mean = es.reduce((a, e) => a + sgn(last.c - e), 0) / es.length;
      const bull = es.every((e, i) => i === 0 || es[i - 1] > e);
      const bear = es.every((e, i) => i === 0 || es[i - 1] < e);
      add('ema', mean * 0.7 + (bull ? 0.3 : bear ? -0.3 : 0),
        `Harga ${last.c > es[0] ? 'di atas' : 'di bawah'} EMA${M.ema.periods[0]}, susunan ${bull ? 'bullish' : bear ? 'bearish' : 'campuran'}`);
    }
  }

  // RSI: momentum; zona jenuh beli/jual dibaca sebagai peringatan balik arah
  {
    const r = rsi(closes, M.rsi.period)[n];
    if (ok(r)) {
      const s = r >= M.rsi.overbought ? -0.3 : r <= M.rsi.oversold ? 0.3 : (r - 50) / 25;
      add('rsi', s, `RSI ${r.toFixed(1)}`);
    }
  }

  // MACD: arah histogram dan apakah momentumnya menguat
  {
    const m = macd(closes, M.macd.fast, M.macd.slow, M.macd.signal);
    const h = m.hist[n], hp = m.hist[n - 1];
    if (ok(h) && ok(hp)) {
      const grow = Math.abs(h) > Math.abs(hp);
      add('macd', sgn(h) * (grow ? 1 : 0.6), `Histogram ${h > 0 ? '+' : ''}${h.toPrecision(3)} ${grow ? 'menguat' : 'melemah'}`);
    }
  }

  // Support / Resistance: posisi harga di antara pivot terdekat
  {
    const p = pivots(c.slice(-M.sr.lookback), M.sr.pivot);
    const res = p.highs.map(x => x.p).filter(x => x > last.c);
    const sup = p.lows.map(x => x.p).filter(x => x < last.c);
    const a = ok(atrNow) ? atrNow : 0;
    if (res.length && sup.length) {
      const R = Math.min(...res), S = Math.max(...sup);
      let s = ((last.c - S) / (R - S) * 2 - 1) * 0.6;
      if (R - last.c < 0.3 * a) s -= 0.4;
      if (last.c - S < 0.3 * a) s += 0.4;
      add('sr', s, `Support ${fmtP(S)} · Resistance ${fmtP(R)}`, s >= 0 ? S - buf : R + buf);
    }
  }

  // Price action: engulfing, pin bar, candle biasa
  {
    const body = Math.abs(last.c - last.o);
    const range = (last.h - last.l) || 1e-9;
    const upW = last.h - Math.max(last.c, last.o);
    const lowW = Math.min(last.c, last.o) - last.l;
    const bullEng = prev.c < prev.o && last.c > last.o && last.c >= prev.o && last.o <= prev.c;
    const bearEng = prev.c > prev.o && last.c < last.o && last.c <= prev.o && last.o >= prev.c;
    if (bullEng) add('price_action', 1, 'Bullish engulfing');
    else if (bearEng) add('price_action', -1, 'Bearish engulfing');
    else if (lowW > 2 * body && lowW / range > 0.6) add('price_action', 0.6, 'Pin bar bawah (penolakan harga rendah)');
    else if (upW > 2 * body && upW / range > 0.6) add('price_action', -0.6, 'Pin bar atas (penolakan harga tinggi)');
    else add('price_action', sgn(last.c - last.o) * 0.2, 'Candle biasa');
  }

  // Volume: relatif terhadap rata-rata, searah candle
  {
    const vs = sma(c.map(k => k.v), M.volume.period)[n];
    const rel = vs > 0 ? last.v / vs : 1;
    add('volume', sgn(last.c - last.o) * clamp((rel - 1) * 0.8, 0, 1), `Volume ${rel.toFixed(2)}x rata-rata`);
  }

  // ATR: info volatilitas. Jika volatilitas di bawah minPct, skor TF dikali lowVolFactor.
  if (M.atr.enabled && ok(atrPct)) {
    add('atr', 0, `ATR ${fmtP(atrNow)} (${atrPct.toFixed(3)}%)${atrPct < M.atr.minPct ? ' · volatilitas rendah' : ''}`);
  }
  const volFactor = M.atr.enabled && ok(atrPct) && atrPct < M.atr.minPct ? M.atr.lowVolFactor : 1;

  // BOS / CHoCH: arah struktur pivot dan penembusan terakhir
  {
    const p = pivots(c.slice(-M.structure.lookback), M.structure.pivot);
    const H = p.highs, Lw = p.lows;
    if (H.length >= 2 && Lw.length >= 2) {
      const h1 = H.at(-1).p, h0 = H.at(-2).p, l1 = Lw.at(-1).p, l0 = Lw.at(-2).p;
      const up = h1 > h0 && l1 > l0, down = h1 < h0 && l1 < l0;
      if (last.c > h1) add('structure', up ? 1 : 0.8, up ? 'BOS Bullish (lanjut naik)' : 'CHoCH Bullish (balik arah naik)', l1 - buf);
      else if (last.c < l1) add('structure', down ? -1 : -0.8, down ? 'BOS Bearish (lanjut turun)' : 'CHoCH Bearish (balik arah turun)', h1 + buf);
      else add('structure', up ? 0.3 : down ? -0.3 : 0, `Struktur ${up ? 'HH-HL' : down ? 'LH-LL' : 'campuran'}`, up ? l1 - buf : h1 + buf);
    }
  }

  // Liquidity sweep: tembus high/low lalu close kembali ke dalam range
  {
    const win = c.slice(Math.max(0, n - M.liquidity.lookback), n);
    const hi = Math.max(...win.map(k => k.h)), lo = Math.min(...win.map(k => k.l));
    if (last.h > hi && last.c < hi) add('liquidity', -1, `Sweep high ${fmtP(hi)}, close kembali di bawah`, last.h + buf);
    else if (last.l < lo && last.c > lo) add('liquidity', 1, `Sweep low ${fmtP(lo)}, close kembali di atas`, last.l - buf);
    else add('liquidity', 0, 'Tidak ada sweep');
  }

  // Fibonacci: posisi harga pada retracement dari swing dalam lookback (semua parameter dari config)
  let fib = null;
  {
    const F = M.fibonacci;
    const seg = c.slice(-F.lookback);
    let hi = -Infinity, lo = Infinity, hiI = 0, loI = 0;
    seg.forEach((k, i) => {
      if (k.h > hi) { hi = k.h; hiI = i; }
      if (k.l < lo) { lo = k.l; loI = i; }
    });
    const range = hi - lo;
    if (range > 0) {
      const up = loI < hiI;
      // SL fibonacci: di bawah swing low untuk BUY, di atas swing high untuk SELL
      const slF = s => (s > 0 ? lo - buf : hi + buf);
      const addF = (id, sc, note) => add(id, sc, note, slF);
      const retr = up ? (hi - last.c) / range : (last.c - lo) / range;
      const pct = (retr * 100).toFixed(1);
      const near = F.levels.length
        ? F.levels.reduce((a, b) => (Math.abs(b - retr) < Math.abs(a - retr) ? b : a))
        : null;
      fib = {
        levels: F.levels.map(r => ({ ratio: r, price: up ? hi - range * r : lo + range * r })),
      };
      if (retr < 0) addF('fibonacci', up ? F.scoreBreakout : -F.scoreBreakout, 'Breakout di luar range');
      else if (retr >= F.goldenMin && retr <= F.goldenMax)
        addF('fibonacci', up ? F.scoreGolden : -F.scoreGolden, `Golden zone ${pct}%${near != null ? ` (dekat ${(near * 100).toFixed(1)}%)` : ''}`);
      else if (retr < F.goldenMin) addF('fibonacci', up ? F.scoreShallow : -F.scoreShallow, `Koreksi dangkal ${pct}%`);
      else addF('fibonacci', up ? -F.scoreDeep : F.scoreDeep, `Koreksi dalam ${pct}%`);
    }
  }

  const wSum = out.reduce((a, r) => a + r.weight, 0);
  const raw = wSum ? out.reduce((a, r) => a + r.score * r.weight, 0) / wSum : 0;
  return {
    price: last.c,
    atr: atrNow,
    score: clamp(raw * cfg.signal.sensitivity * volFactor),
    methods: out,
    fib,
  };
}

// Gabungkan semua timeframe aktif menjadi satu keputusan.
export function analyzeAll(data, cfg) {
  const tfs = {};
  let num = 0, den = 0;
  const thr = cfg.signal.threshold;
  for (const [tf, t] of Object.entries(cfg.timeframes)) {
    const c = data[tf];
    if (!t.enabled || !c || c.length < 60) continue;
    const sg = sigFor(t, cfg);
    const r = analyzeTf(c, { ...cfg, signal: sg });
    r.sig = sg;
    r.signal = r.score >= sg.threshold ? 'BUY' : r.score <= -sg.threshold ? 'SELL' : 'WAIT';
    tfs[tf] = r;
    num += r.score * t.weight;
    den += t.weight;
  }
  const keys = Object.keys(tfs);
  if (!keys.length) return null;

  const score = den ? num / den : 0;
  const bull = Math.round((1 + score) / 2 * 100);
  const dir = score > 0.05 ? 'BULLISH' : score < -0.05 ? 'BEARISH' : 'SIDEWAYS';
  const signal = score >= thr ? 'BUY' : score <= -thr ? 'SELL' : 'WAIT';

  const primaryTf = tfs[cfg.primaryTf] ? cfg.primaryTf : keys[0];
  const prim = tfs[primaryTf];
  let levels = { entry: null, sl: null, tp: null, rr: null };
  if (signal !== 'WAIT' && prim.atr) {
    const sg = prim.sig || cfg.signal;
    const risk = prim.atr * sg.atrSlMult;
    const s = signal === 'BUY' ? 1 : -1;
    const entry = prim.price, sl = prim.price - s * risk, tp = prim.price + s * risk * sg.rr;
    // RR dihitung dari level yang ditampilkan: jarak TP dibagi jarak SL.
    const rr = Math.abs(tp - entry) / Math.abs(entry - sl);
    levels = { entry, sl, tp, rr: Number.isFinite(rr) ? rr : null };
  }
  return {
    score, bull, bear: 100 - bull, dir, signal, tfs, levels, primaryTf,
    strength: Math.round(Math.abs(score) * 100),
  };
}
