// Data real-time dari endpoint publik Binance (tanpa API key). Tidak ada data dummy.
// Beberapa ISP memblokir api.binance.com, jadi dicoba beberapa alamat cadangan.
// data-api.binance.vision khusus data pasar publik dan sering tetap bisa dibuka.
const SPOT = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api3.binance.com',
];
const FUT = ['https://fapi.binance.com'];

// Simbol yang hanya ada di Binance Futures (kontrak perpetual TradFi).
const FUTURES_SYMBOLS = new Set(['XAUUSDT', 'XAGUSDT']);
const isFut = s => FUTURES_SYMBOLS.has(s);

const good = { spot: null, fut: null }; // alamat yang terakhir berhasil

async function getJson(kind, base, path) {
  const list = kind === 'fut' ? FUT : [base, ...SPOT];
  const bases = [...new Set([good[kind], ...list].filter(Boolean))];
  let last = null;
  for (const b of bases) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch(b + path, { cache: 'no-store', signal: ctl.signal });
      if (r.ok) { good[kind] = b; return await r.json(); }
      last = new Error('HTTP ' + r.status);
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  good[kind] = null;
  throw new Error(last && /^HTTP/.test(last.message)
    ? last.message
    : 'Tidak bisa terhubung ke Binance (kemungkinan diblokir ISP)');
}

export async function fetchPrice(base, symbol) {
  const f = isFut(symbol);
  const j = await getJson(f ? 'fut' : 'spot', base,
    `${f ? '/fapi/v1' : '/api/v3'}/ticker/price?symbol=${symbol}`);
  return +j.price;
}

// Hanya candle yang sudah tertutup agar pivot dan sinyal stabil.
export async function fetchKlines(base, symbol, interval, limit) {
  const f = isFut(symbol);
  const rows = await getJson(f ? 'fut' : 'spot', base,
    `${f ? '/fapi/v1' : '/api/v3'}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  const now = Date.now();
  return rows.filter(k => k[6] < now).map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
}

// ---------- WebSocket publik (realtime) ----------
// Stream publik tanpa API key. Futures (XAUUSDT) dan spot pakai alamat yang berbeda.
const WS_FUT = ['wss://fstream.binance.com/ws'];
const WS_SPOT = ['wss://data-stream.binance.vision/ws', 'wss://stream.binance.com:9443/ws'];

// Membuka satu stream, mis. openStream('XAUUSDT', 'trade', onMsg, onState).
// Kalau putus, otomatis sambung ulang dengan alamat cadangan. Mengembalikan fungsi untuk menutup.
export function openStream(symbol, stream, onMsg, onState) {
  const urls = isFut(symbol) ? WS_FUT : WS_SPOT;
  let ws = null, closed = false, idx = 0, timer = null;
  const connect = () => {
    if (closed) return;
    ws = new WebSocket(`${urls[idx % urls.length]}/${symbol.toLowerCase()}@${stream}`);
    ws.onopen = () => onState && onState('open');
    ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch { /* abaikan pesan rusak */ } };
    ws.onclose = () => {
      onState && onState('closed');
      if (closed) return;
      idx++;
      timer = setTimeout(connect, 3000);
    };
  };
  connect();
  return () => {
    closed = true;
    clearTimeout(timer);
    try { ws && ws.close(); } catch { /* sudah tertutup */ }
  };
}

// Format candle dari payload stream kline Binance.
export const toCandle = k => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, closed: k.x });
