// FX NEWS INTELLIGENCE: kerangka tampilan.
// Data di bawah ini SIMULASI. Hanya untuk membangun tampilan, TIDAK boleh dipakai
// untuk statistik, probabilitas, atau arah BULLISH/BEARISH.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SIM_EVENTS = [
  { id: 'sim-cpi', name: 'CPI (SIMULASI)', impact: 'high', time: '2026-11-19T20:30:00+07:00', actual: 3.5, forecast: 3.2, previous: 3.3, simulated: true },
  { id: 'sim-nfp', name: 'NFP (SIMULASI)', impact: 'high', time: '2026-12-04T20:30:00+07:00', actual: null, forecast: 180, previous: 190, simulated: true },
];

// Input yang dibutuhkan mesin. Status tiap input dibaca dari sini.
export function inputStatus({ events = [], fedText = null, usdSeries = null, geoNews = null }) {
  const calendarReal = events.some(e => !e.simulated && e.actual != null);
  const calendarSim = events.some(e => e.simulated);
  return [
    { key: 'Kalender ekonomi (Actual, Forecast, Previous)', state: calendarReal ? 'REAL' : calendarSim ? 'SIMULASI' : 'BELUM ADA' },
    { key: 'Teks pernyataan The Fed', state: fedText ? 'REAL' : 'BELUM ADA' },
    { key: 'Seri USD (DXY atau EURUSD)', state: usdSeries ? 'REAL' : 'BELUM ADA' },
    { key: 'Berita geopolitik', state: geoNews ? 'REAL' : 'BELUM ADA' },
    { key: 'Volatilitas dan momentum XAUUSD', state: 'MENUNGGU CANDLE' },
  ];
}

// Mesin tidak menampilkan arah atau probabilitas sampai semua input REAL tersedia.
export function engineStatus(inputs) {
  const allReal = inputs.every(i => i.state === 'REAL');
  if (allReal) return { label: 'SIAP', detail: 'Semua input real tersedia.' };
  return { label: 'WAITING FOR CONFIRMATION', detail: 'Input real belum lengkap. Arah dan probabilitas tidak ditampilkan.' };
}

const tagOf = s => ({ REAL: 'buy', SIMULASI: 'wait', 'BELUM ADA': 'sell', 'MENUNGGU CANDLE': 'wait' }[s] || 'wait');

export function newsPanelHtml({ events = SIM_EVENTS, fedText = null, usdSeries = null, geoNews = null } = {}) {
  const inputs = inputStatus({ events, fedText, usdSeries, geoNews });
  const eng = engineStatus(inputs);
  const fmt = v => (v == null ? '—' : esc(v));
  return `
  <section class="nx-card nx-news">
    <div class="nx-dh"><span class="nx-h">FX News Intelligence</span><span class="nx-badge">SIMULASI</span></div>
    <div class="nx-engine ${eng.label === 'SIAP' ? 'buy' : 'wait'}"><b>${esc(eng.label)}</b><small>${esc(eng.detail)}</small></div>
    <div class="nx-sect">Status input</div>
    ${inputs.map(i => `<div class="nx-inrow"><span>${esc(i.key)}</span><b class="${tagOf(i.state)}">${esc(i.state)}</b></div>`).join('')}
    <div class="nx-sect" style="margin-top:12px">Event</div>
    ${events.map(e => `<div class="nx-ev">
      <div class="nx-evh"><span>${esc(e.name)}</span><span class="nx-imp ${e.impact}">${esc(e.impact.toUpperCase())}</span></div>
      <div class="nx-evv"><span>Actual <b>${fmt(e.actual)}</b></span><span>Forecast <b>${fmt(e.forecast)}</b></span><span>Previous <b>${fmt(e.previous)}</b></span></div>
    </div>`).join('')}
    <div class="nx-mut" style="margin-top:10px">Data SIMULASI hanya untuk tampilan. Tidak dipakai untuk analisis atau backtest.</div>
  </section>`;
}
