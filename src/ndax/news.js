// FX NEWS INTELLIGENCE. Hanya menampilkan data real yang tersedia.
// Kalender dan berita belum terhubung, jadi bagian itu kosong sampai sumbernya ada.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Status input berita. Hanya REAL bila sumbernya benar-benar terhubung.
export function inputStatus({ events = [], fedText = null, usdSeries = null, geoNews = null, analysis = null } = {}) {
  return [
    { key: 'Kalender ekonomi (Actual, Forecast, Previous)', state: events.length ? 'REAL' : 'BELUM TERHUBUNG' },
    { key: 'Teks pernyataan The Fed', state: fedText ? 'REAL' : 'BELUM TERHUBUNG' },
    { key: 'Seri USD (DXY atau EURUSD)', state: usdSeries ? 'REAL' : 'BELUM TERHUBUNG' },
    { key: 'Berita geopolitik', state: geoNews ? 'REAL' : 'BELUM TERHUBUNG' },
    { key: 'Data teknikal XAUUSD', state: analysis ? 'REAL' : 'MENUNGGU DATA' },
  ];
}

// Arah berita hanya SIAP bila semua input berita REAL. Sebelum itu, arah berasal dari teknikal saja.
export function engineStatus(inputs) {
  return inputs.slice(0, 4).every(i => i.state === 'REAL')
    ? { label: 'SIAP', detail: 'Semua input berita tersedia.' }
    : { label: 'TEKNIKAL SAJA', detail: 'Berita belum terhubung. Arah hanya dari analisis teknikal.' };
}

const wibShort = t => new Date(t ?? Date.now()).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const px = v => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dirTone = d => (d === 'BULLISH' || d === 'BUY' ? 'buy' : d === 'BEARISH' || d === 'SELL' ? 'sell' : 'wait');

export function newsPanelHtml({ price = null, link = 'connecting', analysis = null, updated = null, events = [] } = {}) {
  const inputs = inputStatus({ events, analysis });
  const eng = engineStatus(inputs);
  const pill = { live: ['live', 'LIVE'], connecting: ['connecting', 'MENGHUBUNGKAN'], error: ['error', 'OFFLINE'] }[link] || ['error', 'OFFLINE'];
  const prim = analysis ? analysis.tfs[analysis.primaryTf] : null;
  const reasons = prim
    ? [...prim.methods].sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)).slice(0, 4)
    : [];
  return `
  <section class="nxm">
    <div class="nxm-banner">ANALISIS TEKNIKAL REAL · KALENDER BERITA BELUM TERHUBUNG</div>

    <header class="nxm-hd">
      <div class="nxm-title"><b>FX NEWS INTELLIGENCE</b><small>Smart News · Deep Analysis</small></div>
      <span class="nxm-pill ${pill[0]}">${pill[1]}</span>
    </header>

    <div class="nxm-info">
      <div><small>Waktu WIB</small><b>${esc(wibShort())}</b></div>
      <div><small>USD Impact</small><b class="wait">Belum ada</b></div>
      <div><small>XAUUSD</small><b>${px(price)}</b></div>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Economic Calendar</div>
      ${events.length ? '' : '<div class="nxm-empty">Belum ada sumber kalender terhubung. Data CPI, NFP, FOMC, PCE, GDP, dan PMI akan muncul setelah sumbernya dihubungkan.</div>'}
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Latest Analysis <span class="nxm-tag low">TEKNIKAL</span></div>
      ${analysis ? `
        <div class="nxm-ring" style="background:conic-gradient(#22c55e ${analysis.bull}%, #ff4d5f 0)"><div><b>${analysis.bull}%</b><small>Bullish</small><em>${analysis.bear}% Bearish</em></div></div>
        <div class="nxm-dir ${dirTone(analysis.dir)}">${esc(analysis.dir)} · sinyal ${esc(analysis.signal)}</div>
        <div class="nxm-sub">Timeframe utama ${esc(analysis.primaryTf)} · kekuatan ${analysis.strength}%</div>
        <ul class="nxm-why">${reasons.map(m => `<li><b class="${m.score >= 0 ? 'buy' : 'sell'}">${m.score >= 0 ? '+' : ''}${m.score.toFixed(2)}</b> ${esc(m.label)}: ${esc(m.note)}</li>`).join('')}</ul>`
        : '<div class="nxm-empty">Menunggu data candle XAUUSD dari Binance.</div>'}
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Grafik XAUUSD · M15</div>
      <div id="nxm-slot" class="nxm-slot"></div>
    </div>

    <div class="nxm-grid2">
      <div class="nxm-card"><small>Dampak USD</small><b class="wait">Menunggu berita</b></div>
      <div class="nxm-card"><small>Dampak XAUUSD</small><b class="${analysis ? dirTone(analysis.dir) : 'wait'}">${analysis ? esc(analysis.dir) : '—'}</b></div>
      <div class="nxm-card"><small>Kekuatan sinyal</small><b>${analysis ? analysis.strength + '%' : '—'}</b><div class="nxm-meter"><i style="width:${analysis ? analysis.strength : 0}%"></i></div></div>
      <div class="nxm-card"><small>Status mesin</small><b class="wait">${esc(eng.label)}</b></div>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Advanced Analysis Engine</div>
      <div class="nxm-li"><span>Analisis teknikal</span><b class="${analysis ? 'buy' : 'wait'}">${analysis ? 'AKTIF' : 'MENUNGGU'}</b></div>
      <div class="nxm-li"><span>Volatilitas dan momentum</span><b class="${analysis ? 'buy' : 'wait'}">${analysis ? 'AKTIF' : 'MENUNGGU'}</b></div>
      <div class="nxm-li"><span>Fundamental dan kalender</span><b class="wait">BELUM TERHUBUNG</b></div>
      <div class="nxm-li"><span>Sentimen Fed</span><b class="wait">BELUM TERHUBUNG</b></div>
      <div class="nxm-li"><span>Korelasi USD</span><b class="wait">BELUM TERHUBUNG</b></div>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Informasi</div>
      <div class="nxm-li"><span>Berita</span><b>Belum ada</b></div>
      <div class="nxm-li"><span>Sumber berita</span><b>Belum terhubung</b></div>
      <div class="nxm-li"><span>Update analisis</span><b>${updated ? esc(wibShort(updated)) : '—'}</b></div>
      <button class="nxm-notif" disabled>Notifikasi belum aktif</button>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Status input</div>
      ${inputs.map(i => `<div class="nxm-li"><span>${esc(i.key)}</span><b class="${i.state === 'REAL' ? 'buy' : 'wait'}">${esc(i.state)}</b></div>`).join('')}
    </div>

    <div class="nxm-foot">FX NEWS INTELLIGENCE v1.0</div>
  </section>`;
}
