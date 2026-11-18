export const sma = (arr, n) => {
  const out = new Array(arr.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[i];
    if (i >= n) s -= arr[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
};

// EMA dengan seed SMA; melewati NaN di awal (dipakai untuk signal MACD).
export function ema(arr, n) {
  const out = new Array(arr.length).fill(NaN);
  const start = arr.findIndex(v => Number.isFinite(v));
  if (start < 0 || arr.length - start < n) return out;
  const k = 2 / (n + 1);
  let prev = 0;
  for (let i = start; i < start + n; i++) prev += arr[i];
  prev /= n;
  out[start + n - 1] = prev;
  for (let i = start + n; i < arr.length; i++) {
    prev = arr[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes, n = 14) {
  const out = new Array(closes.length).fill(NaN);
  if (closes.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  let ag = g / n, al = l / n;
  out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + (d > 0 ? d : 0)) / n;
    al = (al * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

export function atr(c, n = 14) {
  const tr = c.map((k, i) => i === 0
    ? k.h - k.l
    : Math.max(k.h - k.l, Math.abs(k.h - c[i - 1].c), Math.abs(k.l - c[i - 1].c)));
  const out = new Array(c.length).fill(NaN);
  if (c.length <= n) return out;
  let p = tr.slice(1, n + 1).reduce((a, b) => a + b, 0) / n;
  out[n] = p;
  for (let i = n + 1; i < c.length; i++) {
    p = (p * (n - 1) + tr[i]) / n;
    out[i] = p;
  }
  return out;
}

export function macd(closes, f = 12, s = 26, sig = 9) {
  const ef = ema(closes, f), es = ema(closes, s);
  const line = closes.map((_, i) => ef[i] - es[i]);
  const signal = ema(line, sig);
  const hist = line.map((v, i) => v - signal[i]);
  return { line, signal, hist };
}

// Swing high/low: lebih tinggi/rendah dari L candle di kiri dan kanan.
export function pivots(c, L) {
  const highs = [], lows = [];
  for (let i = L; i < c.length - L; i++) {
    let isH = true, isL = true;
    for (let j = i - L; j <= i + L; j++) {
      if (j === i) continue;
      if (c[j].h >= c[i].h) isH = false;
      if (c[j].l <= c[i].l) isL = false;
      if (!isH && !isL) break;
    }
    if (isH) highs.push({ i, p: c[i].h });
    if (isL) lows.push({ i, p: c[i].l });
  }
  return { highs, lows };
}
