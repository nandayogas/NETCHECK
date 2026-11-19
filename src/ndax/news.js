// FX NEWS INTELLIGENCE: tampilan mobile. SEMUA ANGKA BERITA DI SINI CONTOH (SIMULASI).
// Tidak dipakai untuk analisis, backtest, atau arah BULLISH/BEARISH.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SIM_EVENTS = [
  { name: 'CPI YoY', time: '19:30', impact: 'high', forecast: '3.1%', actual: null, previous: '3.2%' },
  { name: 'NFP', time: '20:30', impact: 'high', forecast: '180K', actual: null, previous: '190K' },
  { name: 'FOMC Speech', time: '22:00', impact: 'high', forecast: '—', actual: null, previous: '—' },
  { name: 'PCE YoY', time: '19:30', impact: 'high', forecast: '2.8%', actual: null, previous: '2.9%' },
  { name: 'GDP QoQ', time: '19:30', impact: 'medium', forecast: '2.1%', actual: null, previous: '2.0%' },
  { name: 'PMI Manufaktur', time: '21:45', impact: 'medium', forecast: '52.0', actual: null, previous: '51.5' },
];
const SIM_ANALYSIS = { bull: 82, dir: 'BULLISH', usd: 'Bearish', gold: 'Bullish', reasons: ['Actual < Forecast', 'Dampak ke USD: Bearish', 'Reaksi pasar: positif untuk XAUUSD'] };

// Status input: dibaca dari sumber yang benar-benar terhubung.
export function inputStatus({ events = [], fedText = null, usdSeries = null, geoNews = null } = {}) {
  const calendarReal = events.some(e => !e.simulated && e.actual != null);
  return [
    { key: 'Kalender (Actual, Forecast, Previous)', state: calendarReal ? 'REAL' : 'BELUM TERHUBUNG' },
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

const wibShort = () => new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const px = v => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function newsPanelHtml({ price = null, link = 'connecting', events = SIM_EVENTS, fedText = null, usdSeries = null, geoNews = null } = {}) {
  const inputs = inputStatus({ events, fedText, usdSeries, geoNews });
  const eng = engineStatus(inputs);
  const a = SIM_ANALYSIS;
  const pill = { live: ['live', 'LIVE'], connecting: ['connecting', 'MENGHUBUNGKAN'], error: ['error', 'OFFLINE'] }[link] || ['error', 'OFFLINE'];
  return `
  <section class="nxm">
    <div class="nxm-banner">CONTOH TAMPILAN · DATA SIMULASI · BUKAN ANALISIS</div>

    <header class="nxm-hd">
      <div class="nxm-title"><b>FX NEWS INTELLIGENCE</b><small>Smart News · Deep Analysis</small></div>
      <span class="nxm-pill ${pill[0]}">${pill[1]}</span>
    </header>

    <div class="nxm-info">
      <div><small>Waktu WIB</small><b>${esc(wibShort())}</b></div>
      <div><small>USD Impact</small><b class="sell">High</b></div>
      <div><small>XAUUSD</small><b>${px(price)}</b></div>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Economic Calendar</div>
      <div class="nxm-scroll">
        <table class="nxm-tbl">
          <thead><tr><th>Waktu</th><th>Berita</th><th>Fcst</th><th>Actual</th><th>Prev</th><th>Dampak</th></tr></thead>
          <tbody>${events.map(e => `<tr><td>${esc(e.time)}</td><td>${esc(e.name)}</td><td>${esc(e.forecast)}</td><td>${esc(e.actual ?? '—')}</td><td>${esc(e.previous)}</td><td><span class="nxm-tag ${e.impact}">${esc(e.impact.toUpperCase())}</span></td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="nxm-hint">Geser tabel ke kiri atau kanan untuk melihat semua kolom</div>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Latest Analysis <span class="nxm-tag low">CONTOH</span></div>
      <div class="nxm-ring" style="background:conic-gradient(#22c55e ${a.bull}%, #1b2536 0)"><div><b>${a.bull}%</b><small>Bullish</small></div></div>
      <div class="nxm-dir">↗ XAUUSD: ${a.dir}</div>
      <ul class="nxm-why">${a.reasons.map(r => `<li>✔ ${esc(r)}</li>`).join('')}</ul>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Grafik XAUUSD · M15</div>
      <div id="nxm-slot" class="nxm-slot"></div>
    </div>

    <div class="nxm-grid2">
      <div class="nxm-card"><small>Dampak USD</small><b class="sell">${a.usd}</b></div>
      <div class="nxm-card"><small>Dampak XAUUSD</small><b class="buy">${a.gold}</b></div>
      <div class="nxm-card"><small>Kekuatan sinyal</small><b>${a.bull}%</b><div class="nxm-meter"><i style="width:${a.bull}%"></i></div></div>
      <div class="nxm-card"><small>Status mesin</small><b class="wait">${esc(eng.label)}</b></div>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Advanced Analysis Engine</div>
      <div class="nxm-chips">
        <div class="nxm-chip">Fundamental</div>
        <div class="nxm-chip">Historis</div>
        <div class="nxm-chip">Korelasi USD</div>
        <div class="nxm-chip">Sentimen</div>
        <div class="nxm-chip">Volatilitas</div>
        <div class="nxm-chip">Prediksi arah</div>
      </div>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Informasi</div>
      <div class="nxm-li"><span>Berita</span><b>CPI AS (contoh)</b></div>
      <div class="nxm-li"><span>Sumber</span><b>Economicium (belum terhubung)</b></div>
      <div class="nxm-li"><span>Update terakhir</span><b>${esc(wibShort())}</b></div>
      <button class="nxm-notif" disabled>Notifikasi belum aktif</button>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Status input</div>
      ${inputs.map(i => `<div class="nxm-li"><span>${esc(i.key)}</span><b class="${i.state === 'REAL' ? 'buy' : 'wait'}">${esc(i.state)}</b></div>`).join('')}
    </div>

    <div class="nxm-foot">FX NEWS INTELLIGENCE v1.0 · data real-time menunggu sumber terhubung</div>
  </section>`;
}
