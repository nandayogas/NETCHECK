// FX NEWS INTELLIGENCE. Hanya menampilkan data real yang tersedia.
// Kalender berasal dari Worker (feed Fair Economy). Berita dan sumber fundamental lain belum terhubung.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const IMP = { high: ['#ff4d5f', 'HIGH'], medium: ['#f5b942', 'MED'], low: ['#7e8ba1', 'LOW'], none: ['#4b5870', '—'] };

// Daftar event kalender. Data yang kosong ditampilkan sebagai "—", tidak diisi angka.
export function calendarHtml(events = []) {
  if (!events.length) return '<div class="nxm-empty">Tidak ada event untuk hari ini dan besok. Kalender diperbarui otomatis setiap 15 menit.</div>';
  return events.map(e => {
    const [c, t] = IMP[e.impact] || IMP.none;
    return `<div class="nxm-li" style="gap:8px">
      <span style="min-width:64px"><b>${esc(e.time)}</b><br><small>${esc(e.day)} · ${esc(e.country)}</small></span>
      <span style="flex:1"><b style="color:${c}">${t}</b> ${esc(e.title)}<br><small>F ${esc(e.forecast || '—')} · P ${esc(e.previous || '—')} · A ${esc(e.actual || '—')}</small></span>
    </div>`;
  }).join('');
}

// Dampak USD dari event USD hari ini yang berdampak tinggi. Tidak memberi arah, hanya jumlah event.
export function usdImpact(events = []) {
  const n = events.filter(e => e.country === 'USD' && e.day === 'Hari ini' && e.impact === 'high').length;
  return n ? { label: `${n} event high impact hari ini`, hasHigh: true } : { label: 'Tidak ada event high impact hari ini', hasHigh: false };
}

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

export function newsPanelHtml({ price = null, link = 'connecting', analysis = null, updated = null, events = [], usd = null, calOk = null } = {}) {
  const inputs = inputStatus({ events, analysis });
  const usdInfo = usd || usdImpact(events);
  const calWarn = calOk === false ? '<div class="nxm-empty">Feed kalender gagal dimuat. Menampilkan data terakhir yang berhasil.</div>' : '';
  const eng = engineStatus(inputs);
  const pill = { live: ['live', 'LIVE'], connecting: ['connecting', 'MENGHUBUNGKAN'], error: ['error', 'OFFLINE'] }[link] || ['error', 'OFFLINE'];
  const prim = analysis ? analysis.tfs[analysis.primaryTf] : null;
  const reasons = prim
    ? [...prim.methods].sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)).slice(0, 4)
    : [];
  return `
  <section class="nxm">
    <div class="nxm-banner">ANALISIS TEKNIKAL REAL · ${events.length ? 'KALENDER EKONOMI REAL' : 'KALENDER BERITA BELUM TERHUBUNG'}</div>

    <header class="nxm-hd">
      <div class="nxm-title"><b>FX NEWS INTELLIGENCE</b><small>Smart News · Deep Analysis</small></div>
      <span class="nxm-pill ${pill[0]}">${pill[1]}</span>
    </header>

    <div class="nxm-info">
      <div><small>Waktu WIB</small><b>${esc(wibShort())}</b></div>
      <div><small>USD Impact</small><b class="${usdInfo.hasHigh ? 'sell' : 'wait'}">${esc(usdInfo.label)}</b></div>
      <div><small>XAUUSD</small><b>${px(price)}</b></div>
    </div>

    <div class="nxm-card">
      <div class="nxm-h">Economic Calendar <span class="nxm-tag low">HARI INI & BESOK · WIB</span></div>
      ${calWarn}${calendarHtml(events)}
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
      <div class="nxm-card"><small>Dampak USD</small><b class="${usdInfo.hasHigh ? 'sell' : 'wait'}">${esc(usdInfo.label)}</b></div>
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
