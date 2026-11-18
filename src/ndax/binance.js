// Data real-time dari endpoint publik Binance (tanpa API key). Tidak ada data dummy.
export async function fetchPrice(base, symbol) {
  const r = await fetch(`${base}/api/v3/ticker/price?symbol=${symbol}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return +(await r.json()).price;
}

// Hanya candle yang sudah tertutup agar pivot dan sinyal stabil.
export async function fetchKlines(base, symbol, interval, limit) {
  const r = await fetch(`${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const rows = await r.json();
  const now = Date.now();
  return rows.filter(k => k[6] < now).map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
}
