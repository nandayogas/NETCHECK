// Halaman NdaxTrade di dalam NETCHECK. Dipanggil dari route `ndaxtrade`.
import { mergeConfig, TF_ORDER, loadRemoteConfig } from './config.js';
import { fetchKlines, fetchPrice, openStream, toCandle } from './binance.js';
import { analyzeAll, fmtP } from './analyzer.js';
import { createChart, CrosshairMode } from 'lightweight-charts';
import './ndax.css';

const CACHE_KEY = 'ndax.cfg';
const SYM_KEY = 'ndax.sym';
// Pasar yang bisa dipilih di halaman. XAUUSDT = emas (Binance Futures), PAXGUSDT = token emas di spot.
const MARKETS = [
  { sym: 'BTCUSDT',  label: 'BTC' },
  { sym: 'XAUUSDT',  label: 'XAU/USD' },
  { sym: 'PAXGUSDT', label: 'XAU (PAXG)' },
];
// Dipakai bila timeframe tidak ada di konfigurasi.
const INTERVAL = { M1: '1m', M5: '5m', M15: '15m', M30: '30m', H1: '1h', H4: '4h', D1: '1d' };
let session = 0;

const readCache = () => {
  try { return mergeConfig(JSON.parse(localStorage.getItem(CACHE_KEY))); }
  catch { return mergeConfig(null); }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dpOf = v => (v >= 1000 ? 2 : v >= 1 ? 4 : 6);
const money = (v, d) => (v == null || !Number.isFinite(v) ? '—' :
  v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const tone = s => (s === 'BUY' || s === 'BULLISH' ? 'buy' : s === 'SELL' || s === 'BEARISH' ? 'sell' : 'wait');
const LINK = { connecting: 'MENGHUBUNGKAN', live: 'LIVE', error: 'OFFLINE' };
// lightweight-charts memakai waktu dalam detik.
const candleOf = c => ({ time: Math.floor(c.t / 1000), open: c.o, high: c.h, low: c.l, close: c.c });

export function ndaxPg(el) {
  const id = ++session;               // sesi baru membatalkan loop sesi lama
  let cfg = readCache();
  let sym = (() => { try { return localStorage.getItem(SYM_KEY); } catch { return null; } })() || cfg.market.symbol;
  const st = { price: null, link: 'connecting', err: '', result: null, updated: null, sel: null, more: false };

  let streams = [];                   // fungsi penutup untuk stream WebSocket
  let chart = null, series = null, levelLines = [];
  const chartEl = document.createElement('div');   // dibuat sekali, dipasang ulang setiap render
  chartEl.className = 'nx-chart';

  el.innerHTML = '<div class="nx" id="nx"></div>';
  const root = el.querySelector('#nx');
  const alive = () => id === session && root.isConnected;
  const chartTf = () => st.sel || cfg.primaryTf;
  const intervalOf = tf => cfg.timeframes[tf]?.interval || INTERVAL[tf] || '1h';

  const row = m => {
    const w = Math.abs(m.score) * 50, pos = m.score >= 0;
    return `<div class="nx-m">
      <div class="nx-mh"><span>${esc(m.label)}</span><span class="${pos ? 'buy' : 'sell'}">${pos ? '+' : ''}${m.score.toFixed(2)}</span></div>
      <div class="nx-bar"><i class="${pos ? 'pos' : 'neg'}" style="width:${w}%;${pos ? 'left:50%' : 'right:50%'}"></i></div>
      <div class="nx-note">${esc(m.note)}${m.weight === 0 ? ' · filter' : ''}</div>
      ${m.levels ? `<div class="nx-ml ${m.levels.dir === 'BUY' ? 'buy' : 'sell'}">${m.levels.dir} · Entry ${money(m.levels.entry, dpOf(st.price ?? 1))} · SL ${money(m.levels.sl, dpOf(st.price ?? 1))} · TP ${money(m.levels.tp, dpOf(st.price ?? 1))} · RR 1 : ${m.levels.rr.toFixed(2)}</div>` : ''}
    </div>`;
  };

  const view = () => {
    const r = st.result;
    const sel = st.sel || cfg.primaryTf;
    const t = r?.tfs[sel];
    const sig = r?.signal ?? 'WAIT';
    const d = dpOf(st.price ?? 1);
    const valid = sig !== 'WAIT';
    // Setup utama = arah sinyal. Setup berlawanan dihitung dengan rumus yang sama. Saat WAIT tidak ada level.
    const dirMain = valid ? sig : (r && r.score >= 0 ? 'BUY' : 'SELL');
    const dirOpp = dirMain === 'BUY' ? 'SELL' : 'BUY';
    const prim = r?.tfs[r.primaryTf];
    const lvMain = valid ? r.levels : null;
    const lvOpp = valid && prim?.atr ? (() => {
      const sg = prim.sig || cfg.signal;
      const s = dirOpp === 'BUY' ? 1 : -1, risk = prim.atr * sg.atrSlMult;
      return { entry: prim.price, sl: prim.price - s * risk, tp: prim.price + s * risk * sg.rr, rr: sg.rr };
    })() : null;
    const confMain = r ? (dirMain === 'BUY' ? r.bull : r.bear) : null;
    const confOpp = confMain != null ? 100 - confMain : null;

    const setup = (kind, dir, lv, conf, badge) => {
      const isBuy = dir === 'BUY';
      const dd = dpOf(lv?.entry ?? st.price ?? 1);
      const c = v => money(v, dd);
      return `<section class="nx-setup ${kind}">
        <div class="nx-sh"><span class="nx-rk">${kind === 'low' ? '✔ LOW RISK' : '⚠ HIGH RISK'}</span><span class="nx-badge">${badge}</span></div>
        <div class="nx-dirbig">${isBuy ? '↗' : '↓'} ${dir}</div>
        <div class="nx-lvs">
          <div><small>ENTRY</small><b>${c(lv?.entry)}</b></div>
          <div><small>SL</small><b class="sell">${c(lv?.sl)}</b></div>
          <div><small>TP</small><b class="buy">${c(lv?.tp)}</b></div>
        </div>
        <div class="nx-rrline"><span>Risk Reward : ${lv?.rr != null ? '1 : ' + lv.rr.toFixed(2) : '—'}</span><span class="nx-conf">Confidence ${conf != null ? conf + '%' : '—'}</span></div>
      </section>`;
    };

    const ms = t?.methods ?? [];
    const stat = m => (m.score > 0.05 ? ['Bullish', 'buy'] : m.score < -0.05 ? ['Bearish', 'sell'] : ['Neutral', 'neu']);
    const nBull = ms.filter(m => m.score > 0.05).length;
    const nBear = ms.filter(m => m.score < -0.05).length;
    const nNeu = ms.length - nBull - nBear;

    const tfBtn = k => {
      const x = r?.tfs[k];
      return `<button class="nx-tf${sel === k ? ' on' : ''}" data-tf="${k}">
        <b>${k}</b><span class="${tone(x?.signal)}">${x?.signal ?? '—'}</span>
        <small>${x ? Math.round((1 + x.score) / 2 * 100) + '%' : ''}</small></button>`;
    };
    const chip = m => { const [label, c] = stat(m); return `<div class="nx-mc ${c}"><i></i><div><b>${esc(m.label)}</b><span>${label}</span></div></div>`; };
    const fibHtml = t?.fib
      ? `<div class="nx-sect">Fibonacci ${sel}</div><div class="nx-fib">${t.fib.levels.map(l =>
          `<span>${(l.ratio * 100).toFixed(1)}%<b>${money(l.price, d)}</b></span>`).join('')}</div>`
      : '';

    return `
    <header class="nx-top">
      <div class="nx-brand"><span class="nx-logo">◆</span><div><b>NDAXTRADE</b><small>Smart Market Analysis</small></div></div>
      <span class="nx-pill ${st.link}">${LINK[st.link]}</span>
    </header>

    <section class="nx-card nx-hero">
      <div class="nx-sym">${esc(sym)} · NdaxTrade</div>
      <div class="nx-price">${money(st.price, d)}</div>
      <div class="nx-mk">${MARKETS.map(m =>
        `<button class="nx-chip${sym === m.sym ? ' on' : ''}" data-sym="${m.sym}">${m.label}</button>`).join('')}</div>
    </section>

    <div id="nxslot"></div>

    <section class="nx-card">
      <div class="nx-sect">Timeframe</div>
      <div class="nx-tfgrid">${TF_ORDER.filter(k => cfg.timeframes[k]?.enabled).map(tfBtn).join('')}</div>
    </section>

    <div class="nx-setups">
      ${setup('low', dirMain, lvMain, confMain, !valid ? 'MENUNGGU' : r.strength >= 50 ? 'HIGH CONFLUENCE' : 'CONFLUENCE SEDANG')}
      ${setup('high', dirOpp, lvOpp, confOpp, 'SPECULATIVE')}
    </div>
    ${valid ? '' : '<div class="nx-mut nx-wait">Belum ada sinyal valid. Level Entry, SL, dan TP akan muncul saat sinyal BUY atau SELL.</div>'}

    <section class="nx-card">
      <div class="nx-dh"><span class="nx-h">Analysis Summary</span><span class="nx-mut">Last Update ${st.updated ? new Date(st.updated).toLocaleTimeString('id-ID') : '—'}</span></div>
      <div class="nx-tiles">
        <div class="nx-tile buy"><small>Bullish Methods</small><b>${nBull} / ${ms.length || '—'}</b></div>
        <div class="nx-tile neu"><small>Neutral Methods</small><b>${nNeu} / ${ms.length || '—'}</b></div>
        <div class="nx-tile sell"><small>Bearish Methods</small><b>${nBear} / ${ms.length || '—'}</b></div>
      </div>
      <div class="nx-pct" style="margin-top:12px"><span class="buy">Bullish ${r ? r.bull : '—'}%</span><span class="sell">Bearish ${r ? r.bear : '—'}%</span></div>
      <div class="nx-meter"><div style="width:${r ? r.bull : 50}%"></div></div>
      <div class="nx-mut" style="margin-top:6px">${r ? r.dir : 'MENUNGGU DATA'} · kekuatan ${r ? r.strength : 0}% · ${sel}${t ? ` · skor ${Math.round(t.score * 100)}` : ''}</div>
    </section>

    <section class="nx-card">
      <div class="nx-dh"><span class="nx-h">Detail Analisis Metode</span>
        <button class="nx-toggle" data-act="more">${st.more ? 'Tutup' : 'Lihat Detail'}</button></div>
      <div class="nx-mcs">${ms.slice(0, 4).map(chip).join('')}${ms.length > 4 && !st.more
        ? `<button class="nx-mc nx-more" data-act="more"><b>+${ms.length - 4}</b><span>lainnya</span></button>` : ''}</div>
      ${st.more ? `<div class="nx-full">${ms.length ? ms.map(row).join('') : '<div class="nx-mut">Menunggu data pasar…</div>'}${fibHtml}</div>` : ''}
    </section>

    <footer class="nx-foot">Update ${st.updated ? new Date(st.updated).toLocaleTimeString('id-ID') : '—'}${st.err ? ' · ' + esc(st.err) : ''}</footer>`;
  };

  // ---------- grafik ----------
  const ensureChart = () => {
    if (chart) return;
    chart = createChart(chartEl, {
      height: 230,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#7e8ba1' },
      grid: { vertLines: { color: '#1b2536' }, horzLines: { color: '#1b2536' } },
      rightPriceScale: { borderColor: '#222e42' },
      timeScale: { borderColor: '#222e42', timeVisible: true },
      crosshair: { mode: CrosshairMode.Normal },
    });
    series = chart.addCandlestickSeries({
      upColor: '#17c786', downColor: '#ff4d5f', borderVisible: false,
      wickUpColor: '#17c786', wickDownColor: '#ff4d5f',
    });
    new ResizeObserver(() => { if (chart) chart.applyOptions({ width: chartEl.clientWidth }); }).observe(chartEl);
  };

  const mountChart = () => {
    const slot = root.querySelector('#nxslot');
    if (slot && chartEl.parentNode !== slot) slot.appendChild(chartEl);
  };

  const clearLevels = () => {
    if (series) levelLines.forEach(l => series.removePriceLine(l));
    levelLines = [];
  };

  // Garis Entry/SL/TP dihitung dari timeframe utama, jadi hanya digambar saat grafik menampilkan timeframe itu.
  const drawLevels = () => {
    clearLevels();
    const r = st.result;
    if (!series || !r || !r.levels || r.levels.entry == null || chartTf() !== r.primaryTf) return;
    const add = (price, color, title) => levelLines.push(series.createPriceLine({
      price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title,
    }));
    add(r.levels.entry, '#4f8cff', 'Entry');
    add(r.levels.sl, '#ff4d5f', 'SL');
    add(r.levels.tp, '#17c786', 'TP');
  };

  async function loadChart() {
    const s = sym, tf = chartTf();
    ensureChart();
    try {
      const list = await fetchKlines(cfg.market.baseUrl, s, intervalOf(tf), cfg.market.candles);
      if (s !== sym || tf !== chartTf() || !alive()) return;
      series.setData(list.map(candleOf));
      drawLevels();
    } catch (e) {
      if (s === sym) st.err = 'Grafik: ' + e.message;
      draw();
    }
  }

  // Harga di header diperbarui langsung tanpa membangun ulang seluruh halaman.
  const updatePrice = () => {
    const pe = root.querySelector('.nx-price');
    if (pe) pe.textContent = money(st.price, dpOf(st.price ?? 1));
    const pill = root.querySelector('.nx-pill');
    if (pill) { pill.className = `nx-pill ${st.link}`; pill.textContent = LINK[st.link]; }
  };

  const stopAll = () => {
    streams.forEach(close => close());
    streams = [];
    if (chart) { chart.remove(); chart = null; series = null; levelLines = []; }
  };

  // Stream realtime: trade untuk harga, kline untuk candle yang sedang berjalan.
  function startStreams() {
    streams.forEach(close => close());
    streams = [];
    const s = sym, tf = chartTf(), iv = intervalOf(tf);
    streams.push(openStream(s, 'trade', m => {
      if (!alive()) return stopAll();
      if (s !== sym || m.p == null) return;
      st.price = +m.p; st.link = 'live'; st.err = '';
      updatePrice();
    }, () => {}));
    streams.push(openStream(s, `kline_${iv}`, m => {
      if (!alive()) return stopAll();
      if (s !== sym || tf !== chartTf() || !series || !m.k) return;
      series.update(candleOf(toCandle(m.k)));
    }, () => {}));
  }

  const draw = () => {
    if (!alive()) return;
    root.innerHTML = view();
    mountChart();
  };

  root.addEventListener('click', e => {
    const m = e.target.closest('[data-sym]');
    if (m && m.dataset.sym !== sym) {
      sym = m.dataset.sym;
      try { localStorage.setItem(SYM_KEY, sym); } catch { /* abaikan */ }
      Object.assign(st, { price: null, link: 'connecting', err: '', result: null, updated: null });
      clearLevels();
      draw(); doPrice(); doAnalysis(); startStreams(); loadChart();
      return;
    }
    if (e.target.closest('[data-act="more"]')) { st.more = !st.more; draw(); return; }
    const b = e.target.closest('[data-tf]');
    if (b) {
      st.sel = b.dataset.tf;
      clearLevels();
      draw(); startStreams(); loadChart();
    }
  });

  const loop = (fn, ms) => {
    const run = async () => {
      if (!alive()) return;
      try { await fn(); } catch { /* iterasi berikutnya */ }
      if (alive()) setTimeout(run, ms());
    };
    run();
  };

  loop(async () => {
    const r = await loadRemoteConfig();
    if (r) { cfg = r; localStorage.setItem(CACHE_KEY, JSON.stringify(r)); }
  }, () => 30000);

  async function doPrice() {
    const mine = sym;
    try {
      const v = await fetchPrice(cfg.market.baseUrl, mine);
      if (mine !== sym) return;
      st.price = v; st.link = 'live'; st.err = '';
    } catch (e) {
      if (mine !== sym) return;
      st.link = 'error'; st.err = e.message;
    }
    draw();
  }

  async function doAnalysis() {
    const mine = sym;
    const data = {}, errs = [];
    await Promise.all(Object.entries(cfg.timeframes).filter(([, t]) => t.enabled).map(async ([tf, t]) => {
      try { data[tf] = await fetchKlines(cfg.market.baseUrl, mine, t.interval, cfg.market.candles); }
      catch (e) { errs.push(`${tf}: ${e.message}`); }
    }));
    if (mine !== sym) return;
    const r = analyzeAll(data, cfg);
    if (r) { st.result = r; st.updated = Date.now(); }
    st.err = errs.join(' · ');
    draw();
    drawLevels();
  }

  loop(doPrice, () => cfg.market.priceRefreshSec * 1000);
  loop(doAnalysis, () => cfg.market.analysisRefreshSec * 1000);

  draw();
  startStreams();
  loadChart();
}
