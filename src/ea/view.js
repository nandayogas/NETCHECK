// Dashboard NETCHECK EA BUILDER. Dipanggil dari route `eabuilder`.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { TF_ORDER, CUSTOM_TYPES } from '../ndax/config.js';
import { analyzeAll, LABELS, fmtP } from '../ndax/analyzer.js';
import { defaultsFromNetcheck, cfgFromCache, analysisCfg, fetchHistory, loadData, precompute, simulate, optimize, btTfs, DATA_SYMBOLS, ensureModes, switchMode, scalpPreset, fastPreset, gridSize, GRIDS } from './engine.js';

// Label per mode untuk tampilan (kunci sama dengan S.mode).
const MODE_NAME = { swing: 'Swing', scalp: 'Scalping', fast: 'Fast Signal Conservative', straddle: 'Stop Order Straddle' };
const MODE_GRID = { swing: 'Swing', scalp: 'scalping', fast: 'fast signal conservative' };
import { buildMql5, precheck, compileBat, fileBase } from './mql.js';
import './ea.css';

const KEY = 'ea.settings.v1';
let session = 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setP = (o, p, v) => { const ks = p.split('.'); const l = ks.pop(); ks.reduce((a, k) => a[k], o)[l] = v; };

function loadSettings() {
  const base = defaultsFromNetcheck();
  try {
    const sv = JSON.parse(localStorage.getItem(KEY));
    if (sv) {
      const m = { ...base, ...sv, trail: { ...base.trail, ...sv.trail }, bt: { ...base.bt, ...sv.bt }, tfs: { ...base.tfs }, session: { ...base.session, ...sv.session } };
      for (const k of TF_ORDER) m.tfs[k] = { ...base.tfs[k], ...(sv.tfs && sv.tfs[k]) };
      return ensureModes(m);
    }
  } catch { /* pakai default */ }
  return ensureModes(base);
}
const persist = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* penyimpanan penuh */ } };

// ---------- simpan / bagikan file (WebView Android tidak mendukung unduhan blob biasa) ----------
async function saveFile(name, content, mime) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  if (Capacitor.isNativePlatform()) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const { uri } = await Filesystem.writeFile({ path: name, data: btoa(bin), directory: Directory.Cache });
    await Share.share({ title: name, url: uri, dialogTitle: 'Simpan atau kirim ' + name });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const crlf = t => '\uFEFF' + t.replace(/\r?\n/g, '\r\n');   // BOM + CRLF agar MetaEditor membaca dengan benar

async function remoteCompile(url, base, source) {
  if (!/^https:\/\//i.test(url)) throw new Error('URL layanan compile harus diawali https://');
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: base + '.mq5', source }) });
  if (!r.ok) throw new Error('Layanan compile membalas HTTP ' + r.status);
  if ((r.headers.get('content-type') || '').includes('json')) {
    const j = await r.json();
    if (!j.ex5) throw new Error(j.log || 'Kompilasi gagal tanpa file EX5');
    const bin = atob(j.ex5);
    return { bytes: Uint8Array.from(bin, c => c.charCodeAt(0)), log: j.log || '' };
  }
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!bytes.length) throw new Error('File EX5 kosong');
  return { bytes, log: '' };
}

export function eaPg(el) {
  const id = ++session;
  const S = loadSettings();
  const st = { tab: 'strategi', busy: '', msg: '', err: '', live: null, loaded: null, series: null, bt: null, opt: null, ex5: null, compileLog: '' };
  el.innerHTML = '<div class="ea" id="ea"></div>';
  const root = el.querySelector('#ea');
  const alive = () => id === session && root.isConnected;

  const f = (label, p, o = {}) => {
    const v = getP(S, p);
    if (o.type === 'check') return `<label class="ea-sw"><span>${label}</span><input type="checkbox" data-p="${p}" ${v ? 'checked' : ''}><i></i></label>`;
    if (o.opts) return `<label class="ea-f"><span>${label}</span><select data-p="${p}" ${o.n ? 'data-n="1"' : ''}>${o.opts.map(([val, t]) => `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    if (o.type === 'text') return `<label class="ea-f"><span>${label}</span><input type="text" data-p="${p}" value="${esc(v)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} autocomplete="off" autocapitalize="off" spellcheck="false"></label>`;
    return `<label class="ea-f"><span>${label}</span><input type="number" inputmode="decimal" data-p="${p}" value="${v}" step="${o.step ?? 'any'}" ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''}></label>`;
  };

  // ---------- tab Strategi ----------
  const tabStrategi = () => {
    const cfg = cfgFromCache();
    const ms = Object.entries(cfg.methods).map(([k, m]) =>
      `<div class="ea-m ${m.enabled ? '' : 'off'}"><b>${esc(LABELS[k] || k)}</b><span>${m.enabled ? 'bobot ' + m.weight : 'nonaktif'}</span></div>`).join('');
    const cms = (cfg.customMethods || []).map(m =>
      `<div class="ea-m ${m.enabled ? '' : 'off'}"><b>${esc(m.name)}</b><span>${m.enabled ? 'bobot ' + m.weight : 'nonaktif'} · ${esc(CUSTOM_TYPES[m.type]?.label || m.type)}</span></div>`).join('');
    const dec = v => String(v).replace('.', ',');
    const sp = scalpPreset(S);
    const fp = fastPreset(S);
    const modeCard = `
    <section class="ea-card">
      <h3>Mode trading</h3>
      <div class="ea-modes" role="group" aria-label="Mode trading">
        <button type="button" data-mode="swing" class="${S.mode === 'swing' ? 'on' : ''}" aria-pressed="${S.mode === 'swing'}">Swing<small>Trade jarang, sinyal kuat</small></button>
        <button type="button" data-mode="scalp" class="${S.mode === 'scalp' ? 'on' : ''}" aria-pressed="${S.mode === 'scalp'}">Scalping<small>Trade sering, SL ketat</small></button>
        <button type="button" data-mode="fast" class="${S.mode === 'fast' ? 'on' : ''}" aria-pressed="${S.mode === 'fast'}">Fast Signal Conservative<small>Sinyal cepat, ambang ketat, 1 posisi</small></button>
        <button type="button" data-mode="straddle" class="${S.mode === 'straddle' ? 'on' : ''}" aria-pressed="${S.mode === 'straddle'}">Stop Order Straddle<small>BUY STOP + SELL STOP, SL ATR</small></button>
      </div>
      ${S.mode === 'scalp'
        ? `<p class="ea-hint">Preset scalping: timeframe utama ${sp.primaryTf}, SL ${dec(sp.slAtr)}×ATR, RR ${dec(sp.rr)}, jeda ${sp.cooldown} bar, maks ${sp.maxPos} posisi, spread maks ${sp.maxSpread} point, dan entri hanya di jam sesi (UTC). Pengaturan ini bisa diubah lagi di bawah dan di tab Risiko. Hasil scalping sangat peka terhadap spread dan slippage, jadi uji di akun demo dulu.</p>`
        : S.mode === 'fast'
          ? `<p class="ea-hint">Preset Fast Signal Conservative: timeframe utama ${fp.primaryTf}, ambang sinyal ${dec(fp.threshold)} (lebih ketat dari scalping), SL ${dec(fp.slAtr)}×ATR, RR ${dec(fp.rr)}, jeda ${fp.cooldown} bar, maks ${fp.maxPos} posisi, spread maks ${fp.maxSpread} point, dan entri hanya di jam sesi (UTC). Timeframe M30 dan H1 ikut sebagai konfirmasi. Pengaturan ini bisa diubah lagi di bawah dan di tab Risiko. Sinyal lebih jarang daripada scalping, tetapi tetap sensitif terhadap spread dan slippage, jadi uji di akun demo dulu.</p>`
          : S.mode === 'straddle'
          ? `<p class="ea-hint">Preset Stop Order Straddle: BUY STOP di atas dan SELL STOP di bawah harga, berjarak ${dec(S.stopOff)}×ATR, SL ${dec(S.slAtr)}×ATR, RR ${dec(S.rr)}, pending kedaluwarsa setelah ${S.expiry} bar, dan maks ${S.maxPos} siklus. Begitu satu sisi terisi, sisi lain dibatalkan. Mode ini belum punya backtest di aplikasi, jadi uji di MT5 Strategy Tester dan akun demo dulu.</p>`
          : `<p class="ea-hint">Mode swing memakai pengaturan NetCheck. Pengaturan scalping dan fast signal tersimpan terpisah dan tidak ikut berubah saat Anda kembali ke sini.</p>`}
    </section>`;
    const tfRows = TF_ORDER.map(k => `<div class="ea-tfrow">
        <label class="ea-sw"><span>${k}${S.primaryTf === k ? ' <em>UTAMA</em>' : ''}</span><input type="checkbox" data-p="tfs.${k}.on" ${S.tfs[k].on ? 'checked' : ''} ${S.primaryTf === k ? 'disabled' : ''}><i></i></label>
        <input type="number" inputmode="decimal" step="0.1" min="0" data-p="tfs.${k}.weight" value="${S.tfs[k].weight}" aria-label="Bobot ${k}"></div>`).join('');
    const lv = st.live;
    return `${modeCard}
    <section class="ea-card">
      <h3>Instrumen & platform</h3>
      <div class="ea-grid2">
        <div class="ea-f"><span>Platform</span><div class="ea-static">MetaTrader 5</div></div>
        ${f('Simbol di broker', 'symbol', { type: 'text', ph: 'XAUUSD' })}
        ${f('Data backtest', 'dataSym', { opts: DATA_SYMBOLS.map(d => [d.sym, d.label]) })}
        ${f('Timeframe utama', 'primaryTf', { opts: TF_ORDER.map(k => [k, k]) })}
        ${f('Arah trading', 'direction', { n: 1, opts: [[0, 'BUY & SELL (Full Auto)'], [1, 'BUY saja'], [2, 'SELL saja']] })}
      </div>
      <p class="ea-hint">Beberapa broker memakai akhiran (XAUUSDm, XAUUSD.). Kosongkan di EA untuk memakai simbol chart tempat EA dipasang.</p>
    </section>
    <section class="ea-card">
      <h3>Timeframe & bobot <small>dari NetCheck</small></h3>
      <div class="ea-tflist">${tfRows}</div>
      <div class="ea-grid2">
        ${f('Ambang skor BUY/SELL (0–1)', 'threshold', { step: 0.01, min: 0.01, max: 1 })}
        ${f('Sensitivitas', 'sensitivity', { step: 0.1, min: 0.1, max: 5 })}
      </div>
    </section>
    <section class="ea-card">
      <h3>Metode NetCheck yang diubah jadi aturan EA</h3>
      <div class="ea-ms">${ms}${cms}</div>
      <p class="ea-hint">Metode dan bobot dibaca dari konfigurasi NdaxTrade/NetCheck yang aktif di aplikasi. Metode tambahan yang dibuat di NdaxTrade Dev ikut ditampilkan dan dihitung di EA.</p>
      <button class="ea-btn ghost" data-act="sync">Sinkron ulang dari NetCheck</button>
    </section>
    <section class="ea-card">
      <h3>Sinyal NetCheck saat ini</h3>
      ${lv ? `<div class="ea-live ${lv.signal.toLowerCase()}"><b>${lv.signal}</b><span>skor ${(lv.score * 100).toFixed(0)} · ${lv.dir} · kekuatan ${lv.strength}%</span></div>
        <div class="ea-tfchips">${Object.entries(lv.tfs).map(([k, t]) => `<span class="${t.signal.toLowerCase()}">${k} ${t.signal}</span>`).join('')}</div>
        ${lv.levels.entry != null ? `<div class="ea-levels"><div><small>ENTRY</small><b>${fmtP(lv.levels.entry)}</b></div><div><small>SL</small><b class="sell">${fmtP(lv.levels.sl)}</b></div><div><small>TP</small><b class="buy">${fmtP(lv.levels.tp)}</b></div></div>` : ''}`
      : '<p class="ea-hint">Jalankan mesin NetCheck pada data pasar terbaru untuk melihat sinyal yang akan dipakai EA.</p>'}
      <button class="ea-btn" data-act="live" ${st.busy ? 'disabled' : ''}>${st.busy === 'live' ? 'Menganalisis…' : 'Baca sinyal sekarang'}</button>
    </section>`;
  };

  // ---------- tab Risiko ----------
  const tabRisiko = () => `${S.mode === 'straddle' ? `
    <section class="ea-card">
      <h3>Stop Order Straddle</h3>
      <div class="ea-grid2">
        ${f('Jarak pending (×ATR)', 'stopOff', { step: 0.1, min: 0 })}
        ${f('Kedaluwarsa (bar)', 'expiry', { step: 1, min: 1 })}
      </div>
    </section>` : ''}
    <section class="ea-card">
      <h3>Ukuran posisi</h3>
      <div class="ea-grid2">
        ${f('Mode lot', 'lotMode', { opts: [['risk', 'Risiko % equity'], ['fixed', 'Lot tetap']] })}
        ${f('Lot tetap', 'lot', { step: 0.01, min: 0.01 })}
        ${f('Risiko per trade (%)', 'riskPct', { step: 0.1, min: 0.1, max: 20 })}
        ${f('Lot maksimum', 'maxLot', { step: 0.01, min: 0.01 })}
      </div>
    </section>
    <section class="ea-card">
      <h3>Stop loss & take profit</h3>
      <div class="ea-grid2">
        ${f('SL = ATR ×', 'slAtr', { step: 0.1, min: 0.1 })}
        ${f('TP = rasio RR', 'rr', { step: 0.1, min: 0.2 })}
      </div>
      <p class="ea-hint">ATR dihitung pada timeframe utama (${S.primaryTf}), sama seperti level Entry/SL/TP di NdaxTrade.</p>
    </section>
    <section class="ea-card">
      <h3>Trailing stop</h3>
      ${f('Aktifkan trailing stop', 'trail.on', { type: 'check' })}
      <div class="ea-grid2">
        ${f('Jarak = ATR ×', 'trail.atrMult', { step: 0.1, min: 0.1 })}
        ${f('Mulai saat profit ≥ (× risiko)', 'trail.startRR', { step: 0.1, min: 0 })}
      </div>
    </section>
    <section class="ea-card">
      <h3>Kontrol posisi</h3>
      <div class="ea-grid2">
        ${f('Maksimal posisi terbuka', 'maxPos', { step: 1, min: 1, max: 50 })}
        ${f('Jeda antar entri (bar)', 'cooldown', { step: 1, min: 0 })}
        ${f('Spread maks (points)', 'maxSpread', { step: 1, min: 0 })}
        ${f('Slippage (points)', 'slippage', { step: 1, min: 0 })}
        ${f('Magic number', 'magic', { step: 1, min: 1 })}
      </div>
      ${f('Tutup posisi lawan saat sinyal berbalik', 'closeOpposite', { type: 'check' })}
    </section>
    <section class="ea-card">
      <h3>Sesi perdagangan <small>jam UTC</small></h3>
      ${f('Batasi entri baru ke jam tertentu', 'session.on', { type: 'check' })}
      <div class="ea-grid2">
        ${f('Mulai (jam UTC)', 'session.start', { step: 1, min: 0, max: 23 })}
        ${f('Selesai (jam UTC)', 'session.end', { step: 1, min: 0, max: 23 })}
      </div>
      <p class="ea-hint">Contoh: 07–20 UTC kira-kira mencakup sesi London dan New York. Posisi yang sudah terbuka tetap dikelola di luar sesi; filter hanya memblokir entri baru.</p>
    </section>`;

  // ---------- tab Backtest ----------
  const curveSvg = c => {
    if (!c || c.length < 2) return '';
    const step = Math.max(1, Math.floor(c.length / 220));
    const pts = c.filter((_, i) => i % step === 0 || i === c.length - 1);
    const lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v)), rg = hi - lo || 1;
    const d = pts.map((p, i) => `${(i / (pts.length - 1) * 300).toFixed(1)},${(96 - (p.v - lo) / rg * 88).toFixed(1)}`).join(' ');
    const up = pts.at(-1).v >= pts[0].v;
    return `<svg class="ea-curve" viewBox="0 0 300 100" preserveAspectRatio="none" role="img" aria-label="Kurva equity"><polyline points="${d}" fill="none" stroke="${up ? '#17c786' : '#ff4d5f'}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  };
  const stats = r => `
    <div class="ea-stats">
      <div><small>Profit bersih</small><b class="${r.net >= 0 ? 'buy' : 'sell'}">${r.net >= 0 ? '+' : ''}${num(r.net)} (${num(r.netPct, 1)}%)</b></div>
      <div><small>Jumlah trade</small><b>${r.n}</b></div>
      <div><small>Win rate</small><b>${num(r.winRate, 1)}%</b></div>
      <div><small>Profit factor</small><b>${r.pf === Infinity ? '∞' : num(r.pf)}</b></div>
      <div><small>Max drawdown</small><b class="sell">${num(r.maxDD, 1)}%</b></div>
      <div><small>Expectancy / trade</small><b>${num(r.expectancy)}</b></div>
      <div><small>Rata-rata menang</small><b class="buy">${num(r.avgWin)}</b></div>
      <div><small>Rata-rata kalah</small><b class="sell">${num(r.avgLoss)}</b></div>
    </div>`;
  const tabBacktest = () => {
    if (S.mode === 'straddle') return `<section class="ea-card"><h3>Backtest tidak tersedia</h3><p class="ea-hint">Mode Stop Order Straddle belum punya simulator di aplikasi. Uji di MT5 Strategy Tester (model Every tick based on real ticks) dengan pengaturan dari halaman ini.</p></section>`;
    const tfs = btTfs(S), skipped = TF_ORDER.filter(k => S.tfs[k].on && !tfs.includes(k));
    const b = st.bt;
    const o = st.opt;
    return `
    <section class="ea-card">
      <h3>Backtest data historis</h3>
      <div class="ea-grid2">
        ${f('Jumlah bar uji', 'bt.bars', { n: 1, opts: [[500, '500 bar'], [1000, '1.000 bar'], [2000, '2.000 bar'], [3000, '3.000 bar']] })}
        ${f('Saldo awal (USD)', 'bt.balance', { step: 100, min: 100 })}
        ${f('Spread (USD / oz)', 'bt.spread', { step: 0.05, min: 0 })}
      </div>
      <p class="ea-hint">Memakai mesin NetCheck yang sama (${tfs.join(', ') || '—'}) pada data ${esc(S.dataSym)}.${skipped.length ? ` Timeframe ${skipped.join(', ')} lebih kecil dari timeframe utama, jadi tidak ikut backtest (tetap dipakai EA live).` : ''}</p>
      <button class="ea-btn" data-act="bt" ${st.busy ? 'disabled' : ''}>${st.busy === 'bt' ? esc(st.msg || 'Memproses…') : 'Jalankan backtest'}</button>
      ${st.err ? `<div class="ea-err">${esc(st.err)}</div>` : ''}
    </section>
    ${b ? `<section class="ea-card">
      <h3>Hasil backtest</h3>
      ${curveSvg(b.curve)}
      ${stats(b)}
      <div class="ea-tl"><div class="ea-sect">10 trade terakhir</div>${b.trades.slice(-10).reverse().map(t => `<div class="ea-tr"><span class="${t.dir > 0 ? 'buy' : 'sell'}">${t.dir > 0 ? 'BUY' : 'SELL'}</span><span>${fmtP(t.entry)} → ${fmtP(t.exit)}</span><b class="${t.pnl >= 0 ? 'buy' : 'sell'}">${t.pnl >= 0 ? '+' : ''}${num(t.pnl)}</b></div>`).join('') || '<p class="ea-hint">Tidak ada trade pada periode ini.</p>'}</div>
      <p class="ea-hint">Eksekusi di open bar berikutnya, SL didahulukan bila SL dan TP tersentuh dalam satu bar. Hasil MT5 Strategy Tester (data broker, tick) akan berbeda; anggap ini penyaring awal, bukan jaminan.</p>
    </section>
    <section class="ea-card">
      <h3>AI Strategy Generator <small>mode ${MODE_GRID[S.mode] || MODE_GRID.swing}</small></h3>
      <p class="ea-hint">${S.mode === 'swing'
        ? `Mencoba ${gridSize('swing')} kombinasi ambang sinyal, SL, dan RR pada mesin NetCheck. Dipilih di 70% data pertama, lalu diuji di 30% data terakhir yang tidak dipakai memilih.`
        : `Mencoba ${gridSize(S.mode)} kombinasi ambang sinyal, SL, RR, dan jeda antar entri. Dipilih di 70% data pertama, lalu diuji di 30% data terakhir. Syarat minimal ${GRIDS[S.mode].minN} trade per kombinasi. Spread di bawah (${esc(S.bt.spread)}) harus sesuai spread broker Anda; kombinasi dengan jeda 0 bar sering tampak bagus di backtest tetapi rugi oleh biaya nyata.${S.mode === 'fast' ? ' Fast Signal Conservative hanya mencari ambang 0,35–0,6 supaya sinyal tetap jarang dan selektif.' : ''}`}</p>
      <button class="ea-btn" data-act="opt" ${st.busy ? 'disabled' : ''}>${st.busy === 'opt' ? 'Mengoptimasi…' : (S.mode === 'swing' ? 'Cari strategi terbaik' : `Cari strategi ${MODE_GRID[S.mode]} terbaik`)}</button>
      ${o ? (o.top.length ? o.top.map((r, i) => `<div class="ea-opt">
        <div class="ea-oh"><b>#${i + 1}</b><span>ambang ${r.threshold} · SL ${r.slAtr}×ATR · RR ${r.rr}${r.cooldown != null ? ` · jeda ${r.cooldown} bar` : ''}</span><button class="ea-btn sm" data-apply="${i}">Terapkan</button></div>
        <div class="ea-oc"><div><small>Latih</small><b class="${r.train.net >= 0 ? 'buy' : 'sell'}">${num(r.train.netPct, 1)}%</b><small>${r.train.n} trade · DD ${num(r.train.maxDD, 1)}%</small></div>
        <div><small>Uji (data baru)</small><b class="${r.test.net >= 0 ? 'buy' : 'sell'}">${num(r.test.netPct, 1)}%</b><small>${r.test.n} trade · DD ${num(r.test.maxDD, 1)}%</small></div></div>
        ${r.test.net < 0 ? '<div class="ea-warn">Rugi di data uji: kemungkinan overfitting.</div>' : ''}</div>`).join('') : `<div class="ea-warn">Tidak ada kombinasi dengan minimal ${o.minN} trade pada data latih. Perbanyak bar uji atau longgarkan ambang.</div>`) : ''}
    </section>` : ''}`;
  };

  // ---------- tab Kode ----------
  const tabKode = () => {
    const cfg = cfgFromCache();
    const src = buildMql5(S, analysisCfgForCode(cfg));
    const issues = precheck(src);
    const base = fileBase(S);
    st.src = src;
    return `
    <section class="ea-card">
      <h3>Kode MQL5</h3>
      ${f('Nama EA / file', 'name', { type: 'text' })}
      <div class="ea-check ${issues.length ? 'bad' : 'ok'}">${issues.length ? '✖ ' + issues.map(esc).join(' · ') : `✔ Pemeriksaan awal lolos · ${src.split('\n').length} baris`}</div>
      <pre class="ea-code" tabindex="0">${esc(src.split('\n').slice(0, 70).join('\n'))}\n… (${src.split('\n').length - 70} baris lagi)</pre>
      <div class="ea-row">
        <button class="ea-btn" data-act="dl-mq5">Unduh ${esc(base)}.mq5</button>
        <button class="ea-btn ghost" data-act="copy">Salin kode</button>
      </div>
    </section>
    <section class="ea-card">
      <h3>Compile ke EX5</h3>
      <p class="ea-hint">EX5 hanya bisa dibuat oleh MetaEditor (Windows). Di dalam APK tidak ada compiler, jadi pilih salah satu cara:</p>
      <div class="ea-way"><b>A. Di MT5 (Winlator)</b><p>Unduh .mq5, taruh di <code>MQL5/Experts</code>, buka di MetaEditor lalu tekan F7. Atau unduh skrip .bat di bawah dan jalankan di Winlator.</p>
        <button class="ea-btn ghost" data-act="dl-bat">Unduh compile_${esc(base)}.bat</button></div>
      <div class="ea-way"><b>B. Layanan compile (opsional)</b><p>Isi URL layanan HTTPS milik Anda yang menjalankan MetaEditor. Aplikasi mengirim <code>{filename, source}</code> dan menerima EX5 (biner, atau JSON <code>{ex5: base64, log}</code>).</p>
        ${f('URL layanan compile', 'compileUrl', { type: 'text', ph: 'https://…' })}
        <button class="ea-btn" data-act="compile" ${st.busy ? 'disabled' : ''}>${st.busy === 'compile' ? 'Mengompilasi…' : 'Compile sekarang'}</button>
        ${st.err ? `<div class="ea-err">${esc(st.err)}</div>` : ''}
        ${st.ex5 ? `<div class="ea-check ok">✔ EX5 siap (${st.ex5.length.toLocaleString('id-ID')} byte)</div><button class="ea-btn" data-act="dl-ex5">Unduh ${esc(base)}.ex5</button>` : ''}
        ${st.compileLog ? `<pre class="ea-code sm">${esc(st.compileLog)}</pre>` : ''}</div>
    </section>
    <section class="ea-card">
      <h3>Pasang di MT5 Winlator</h3>
      <ol class="ea-steps">
        <li>Di MT5: File → Open Data Folder → <code>MQL5/Experts</code>, salin file .mq5 (dan .ex5 bila ada).</li>
        <li>Tekan F4 untuk MetaEditor, buka file, tekan F7 sampai "0 errors".</li>
        <li>Di Navigator, segarkan Expert Advisors, seret EA ke chart <b>${esc(S.symbol)}</b>.</li>
        <li>Aktifkan <b>Algo Trading</b> dan centang "Allow Algo Trading" pada jendela EA.</li>
        <li>Uji dulu di Strategy Tester atau akun demo. Pastikan Winlator tidak dimatikan sistem agar EA tetap hidup.</li>
      </ol>
    </section>`;
  };
  const analysisCfgForCode = cfg => analysisCfg(S, cfg, TF_ORDER);

  // ---------- kerangka ----------
  const TABS = [['strategi', 'Strategi'], ['risiko', 'Risiko'], ['backtest', 'Backtest'], ['kode', 'Kode & EX5']];
  const render = () => {
    const scroll = root.querySelector('.ea-body')?.scrollTop;
    root.innerHTML = `
      <header class="ea-top">
        <div class="ea-brand"><span class="ea-logo">EA</span><div><b>NETCHECK EA BUILDER</b><small>MT5 · ${esc(S.symbol)} · ${MODE_NAME[S.mode] || 'Swing'} · Full Auto</small></div></div>
        <span class="ea-pill">MQL5</span>
      </header>
      <nav class="ea-tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="${st.tab === k ? 'on' : ''}" data-tab="${k}" aria-selected="${st.tab === k}">${t}</button>`).join('')}</nav>
      <div class="ea-body">${{ strategi: tabStrategi, risiko: tabRisiko, backtest: tabBacktest, kode: tabKode }[st.tab]()}</div>
      <footer class="ea-foot">Trading berisiko tinggi dan bukan nasihat keuangan. Uji di akun demo sebelum memakai uang asli.</footer>`;
  };

  const run = async (kind, fn) => {
    if (st.busy) return;
    st.busy = kind; st.err = ''; st.msg = ''; render();
    try { await fn(); } catch (e) { if (e.message !== 'dibatalkan') st.err = e.message || String(e); }
    if (!alive()) return;
    st.busy = ''; st.msg = ''; render();
  };
  const progress = m => { if (alive()) { st.msg = m; const b = root.querySelector('[data-act="bt"]'); if (b) b.textContent = m; } };

  const ensureSeries = async () => {
    if (st.series) return st.series;
    progress('Mengambil data historis…');
    st.loaded = await loadData(S, progress);
    st.series = await precompute(S, st.loaded, cfgFromCache(), progress, alive);
    return st.series;
  };

  root.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab],[data-act],[data-apply],[data-mode]');
    if (!t) return;
    if (t.dataset.tab) { st.tab = t.dataset.tab; st.err = ''; return render(); }
    if (t.dataset.mode) {
      if (st.busy) return;
      switchMode(S, t.dataset.mode); persist(S);
      st.series = null; st.loaded = null; st.bt = null; st.opt = null; st.ex5 = null; st.err = '';
      return render();
    }
    if (t.dataset.apply != null) {
      const r = st.opt.top[+t.dataset.apply];
      S.threshold = r.threshold; S.slAtr = r.slAtr; S.rr = r.rr;
      if (r.cooldown != null) S.cooldown = r.cooldown;
      persist(S);
      st.bt = simulate(st.series, S); st.tab = 'strategi'; return render();
    }
    const a = t.dataset.act;
    if (a === 'sync') { const d = defaultsFromNetcheck(); Object.assign(S, { tfs: d.tfs, primaryTf: d.primaryTf, threshold: d.threshold, sensitivity: d.sensitivity, slAtr: d.slAtr, rr: d.rr }); persist(S); st.series = null; st.bt = null; st.opt = null; return render(); }
    if (a === 'live') return run('live', async () => {
      const cfg = cfgFromCache(), ac = analysisCfg(S, cfg, TF_ORDER), data = {};
      for (const k of TF_ORDER) if (ac.timeframes[k].enabled) data[k] = await fetchHistory(S.dataSym, k, ac.market.candles);
      const r = analyzeAll(data, ac);
      if (!r) throw new Error('Data belum cukup untuk dianalisis');
      st.live = r;
    });
    if ((a === 'bt' || a === 'opt') && S.mode === 'straddle') { st.err = 'Backtest dan optimasi belum tersedia untuk Stop Order Straddle. Uji di MT5 Strategy Tester.'; return render(); }
    if (a === 'bt') return run('bt', async () => {
      const series = await ensureSeries();
      st.bt = simulate(series, S);
    });
    if (a === 'opt') return run('opt', async () => {
      const series = await ensureSeries();
      st.bt = simulate(series, S);
      await new Promise(r => setTimeout(r, 30));
      st.opt = optimize(series, S);
    });
    if (a === 'dl-mq5') return saveFile(fileBase(S) + '.mq5', crlf(st.src), 'text/plain').catch(x => { st.err = x.message; render(); });
    if (a === 'dl-bat') return saveFile('compile_' + fileBase(S) + '.bat', crlf(compileBat(fileBase(S))), 'text/plain').catch(x => { st.err = x.message; render(); });
    if (a === 'copy') { try { await navigator.clipboard.writeText(st.src); t.textContent = 'Tersalin ✔'; } catch { t.textContent = 'Gagal menyalin'; } return; }
    if (a === 'compile') return run('compile', async () => {
      if (precheck(st.src).length) throw new Error('Perbaiki kode dulu: pemeriksaan awal gagal');
      const r = await remoteCompile(S.compileUrl.trim(), fileBase(S), crlf(st.src));
      st.ex5 = r.bytes; st.compileLog = r.log;
    });
    if (a === 'dl-ex5' && st.ex5) return saveFile(fileBase(S) + '.ex5', st.ex5, 'application/octet-stream').catch(x => { st.err = x.message; render(); });
  });

  root.addEventListener('change', e => {
    const x = e.target.closest('[data-p]');
    if (!x) return;
    const p = x.dataset.p;
    let v;
    if (x.type === 'checkbox') v = x.checked;
    else if (x.type === 'number') {
      v = Number(x.value);
      if (!Number.isFinite(v)) { x.value = getP(S, p); return; }
      if (x.min !== '') v = Math.max(Number(x.min), v);
      if (x.max !== '') v = Math.min(Number(x.max), v);
    } else v = x.dataset.n ? Number(x.value) : x.value;
    setP(S, p, v);
    if (p === 'primaryTf') S.tfs[v].on = true;
    if (p === 'name') S.name = fileBase(S);
    if (/^(tfs|primaryTf|sensitivity|dataSym|bt\.bars)/.test(p)) { st.series = null; st.loaded = null; st.bt = null; st.opt = null; }
    st.ex5 = null; st.compileLog = '';
    persist(S);
    if (x.tagName === 'SELECT' || x.type === 'checkbox' || x.dataset.p === 'name') render();
  });

  render();
}
