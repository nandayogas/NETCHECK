// FX NEWS INTELLIGENCE: tampilan mengikuti sketsa. SEMUA ANGKA DI SINI CONTOH (SIMULASI).
// Tidak dipakai untuk analisis, backtest, atau arah BULLISH/BEARISH. Ganti dengan data real saat sumber terhubung.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SIM_EVENTS = [
  { name: 'CPI YoY', time: '19:30', impact: 'high', forecast: '3.1%', actual: null, previous: '3.2%' },
  { name: 'NFP', time: '20:30', impact: 'high', forecast: '180K', actual: null, previous: '190K' },
  { name: 'FOMC Speech', time: '22:00', impact: 'high', forecast: '—', actual: null, previous: '—' },
  { name: 'PCE YoY', time: '19:30', impact: 'high', forecast: '2.8%', actual: null, previous: '2.9%' },
  { name: 'GDP QoQ', time: '19:30', impact: 'medium', forecast: '2.1%', actual: null, previous: '2.0%' },
  { name: 'PMI Manufaktur', time: '21:45', impact: 'medium', forecast: '52.0', actual: null, previous: '51.5' },
];
const SIM_ANALYSIS = { bull: 82, usd: 'Bearish', gold: 'Bullish', reasons: ['Actual < Forecast', 'Dampak ke USD: Bearish', 'Reaksi pasar: Positif untuk XAUUSD'] };

// Status input: dibaca dari sumber yang benar-benar terhubung.
export function inputStatus({ events = [], fedText = null, usdSeries = null, geoNews = null } = {}) {
  const calendarReal = events.some(e => !e.simulated && e.actual != null);
  return [
    { key: 'Kalender ekonomi (Actual, Forecast, Previous)', state: calendarReal ? 'REAL' : 'BELUM TERHUBUNG' },
    { key: 'Teks pernyataan The Fed', state: fedText ? 'REAL' : 'BELUM TERHUBUNG' },
    { key: 'Seri USD (DXY atau EURUSD)', state: usdSeries ? 'REAL' : 'BELUM TERHUBUNG' },
    { key: 'Berita geopolitik', state: geoNews ? 'REAL' : 'BELUM TERHUBUNG' },
    { key: 'Volatilitas dan momentum XAUUSD', state: 'MENUNGGU CANDLE' },
  ];
}

export function engineStatus(inputs) {
  return inputs.every(i => i.state === 'REAL')
    ? { label: 'SIAP', detail: 'Semua input real tersedia.' }
    : { label: 'WAITING FOR CONFIRMATION', detail: 'Input real belum lengkap. Angka di bawah hanya contoh.' };
}

const wib = () => new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const px = v => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const impact = i => `<span class="nxn-tag ${i}">${i.toUpperCase()}</span>`;

export function newsPanelHtml({ price = null, link = 'connecting', events = SIM_EVENTS, fedText = null, usdSeries = null, geoNews = null } = {}) {
  const inputs = inputStatus({ events, fedText, usdSeries, geoNews });
  const eng = engineStatus(inputs);
  const a = SIM_ANALYSIS;
  const linkLabel = { live: 'LIVE', connecting: 'MENGHUBUNGKAN', error: 'OFFLINE' }[link] || 'OFFLINE';
  return `
  <section class="nxn">
    <div class="nxn-banner">CONTOH TAMPILAN · DATA SIMULASI · BUKAN ANALISIS</div>
    <div class="nxn-hd">
      <div class="nxn-title"><b>FX NEWS INTELLIGENCE</b><small>Smart News · Deep Analysis · Real Impact</small></div>
      <span class="nx-pill ${link === 'live' ? 'live' : link}">${linkLabel}</span>
    </div>

    <div class="nxn-strip">
      <div class="nxn-cell">Waktu WIB<b>${esc(wib())}</b></div>
      <div class="nxn-cell">USD Impact<b class="sell">High</b></div>
      <div class="nxn-cell">XAUUSD (live)<b>${px(price)}</b></div>
    </div>

    <div class="nxn-card">
      <div class="nx-h" style="margin-bottom:8px">Economic Calendar</div>
      <div style="overflow-x:auto">
      <table class="nxn-tbl">
        <thead><tr><th>Waktu</th><th>Berita</th><th>Forecast</th><th>Actual</th><th>Previous</th><th>Dampak</th></tr></thead>
        <tbody>${events.map(e => `<tr><td>${esc(e.time)}</td><td>${esc(e.name)}</td><td>${esc(e.forecast)}</td><td>${esc(e.actual ?? '—')}</td><td>${esc(e.previous)}</td><td>${impact(e.impact)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="nxn-card">
      <div class="nxn-dh"><span class="nx-h">Latest Analysis</span><span class="nx-mut">CONTOH</span></div>
      <div class="nxn-ana">
        <div class="nxn-ring" style="background:conic-gradient(#17c786 ${a.bull}%, #1b2536 0)"><div><b>${a.bull}%</b><small>Bullish</small></div></div>
        <div class="nxn-why">
          <div class="nxn-dir buy">↗ XAUUSD contoh: BULLISH</div>
          <ul>${a.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        </div>
      </div>
    </div>

    <div class="nxn-grid2">
      <div class="nxn-card"><div class="nx-mut">Dampak terhadap USD</div><b class="sell">${a.usd}</b></div>
      <div class="nxn-card"><div class="nx-mut">Dampak terhadap XAUUSD</div><b class="buy">${a.gold}</b></div>
      <div class="nxn-card"><div class="nx-mut">Kekuatan sinyal (contoh)</div><b>${a.bull}%</b><div class="nx-meter"><div style="width:${a.bull}%"></div></div></div>
      <div class="nxn-card"><div class="nx-mut">Status mesin</div><b class="wait">${esc(eng.label)}</b></div>
    </div>

    <div class="nxn-card">
      <div class="nx-h" style="margin-bottom:8px">Advanced Analysis Engine</div>
      ${['Analisis fundamental dan dampak berita', 'Analisis historis dan korelasi USD', 'Analisis sentimen dan volatilitas', 'Prediksi arah market']
        .map(t => `<div class="nxn-li">✔ ${esc(t)}</div>`).join('')}
    </div>

    <div class="nxn-card">
      <div class="nx-h" style="margin-bottom:8px">Informasi tambahan</div>
      <div class="nxn-li">Berita: CPI AS (contoh)</div>
      <div class="nxn-li">Sumber: Economicium (belum terhubung)</div>
      <div class="nxn-li">Terakhir update: ${esc(wib())}</div>
      <button class="nxn-notif" disabled>Notifikasi belum aktif</button>
    </div>

    <div class="nxn-status">${inputs.map(i => `<div class="nxn-inrow"><span>${esc(i.key)}</span><b class="${i.state === 'REAL' ? 'buy' : 'wait'}">${esc(i.state)}</b></div>`).join('')}</div>
    <div class="nx-mut" style="text-align:center">Data sumber terpercaya dan analisis real-time: menunggu sumber terhubung. FX NEWS INTELLIGENCE v1.0</div>
  </section>`;
}
