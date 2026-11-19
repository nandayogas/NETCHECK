// Halaman FX NEWS INTELLIGENCE sebagai tile di Tools.
// Harga XAUUSD diperbarui setiap 5 detik. Grafik M15 setiap 60 detik. Analisis setiap 30 detik.
// Kalender ekonomi dibaca dari Worker (/api/news/calendar) setiap 15 menit. Semua berhenti saat halaman ditutup.
import { newsPanelHtml } from './news.js';
import { fetchPrice, fetchKlines } from './binance.js';
import { mergeConfig, loadRemoteConfig, NDAX_API } from './config.js';
import { analyzeAll } from './analyzer.js';
import { createChart, CrosshairMode } from 'lightweight-charts';
import './ndax.css';

const SYM = 'XAUUSDT', IV = '15m', LIMIT = 120, BASE = 'https://api.binance.com', AN_MS = 30000, CAL_MS = 15 * 60 * 1000;
const WIB = 'Asia/Jakarta';
const dayKey = d => d.toLocaleDateString('en-CA', { timeZone: WIB });

// Ubah data feed ke format tampilan. Hanya hari ini dan besok (WIB) yang diambil, diurutkan menurut waktu.
function mapCal(raw) {
  const now = new Date();
  const today = dayKey(now);
  return raw.map(x => {
    const d = new Date(x.date);
    if (isNaN(d)) return null;
    const k = dayKey(d);
    if (k < today) return null; // hari ini dan seterusnya
    const imp = String(x.impact || '').toLowerCase();
    return {
      t: d.getTime(),
      day: k === today ? 'Hari ini' : d.toLocaleDateString('id-ID', { timeZone: WIB, weekday: 'short', day: '2-digit', month: 'short' }),
      today: k === today,
      time: d.toLocaleTimeString('en-GB', { timeZone: WIB, hour: '2-digit', minute: '2-digit' }),
      country: x.country,
      title: x.title,
      impact: ['high', 'medium', 'low'].includes(imp) ? imp : 'none',
      forecast: x.forecast,
      previous: x.previous,
      actual: x.actual,
    };
  }).filter(Boolean).sort((a, b) => a.t - b.t).slice(0, 150);
}

export function newsPg(el) {
  el.innerHTML = '<div class="nxm-page" id="nxm-root"></div>';
  const root = el.querySelector('#nxm-root');
  const alive = () => root.isConnected;
  const chartEl = document.createElement('div');
  chartEl.className = 'nxm-chart';
  let chart = null, series = null, price = null, link = 'connecting', tPrice = null, tChart = null, tAn = null, tCal = null, ro = null;
  let cfg = mergeConfig(null), analysis = null, updated = null;
  let events = [], calOk = null;

  const ensureChart = () => {
    if (chart) return;
    chart = createChart(chartEl, {
      height: 220,
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
    ro = new ResizeObserver(() => { if (chart) chart.applyOptions({ width: chartEl.clientWidth }); });
    ro.observe(chartEl);
  };

  const cleanup = () => {
    clearTimeout(tPrice); clearTimeout(tChart); clearTimeout(tAn); clearTimeout(tCal);
    if (ro) ro.disconnect();
    if (chart) chart.remove();
    chart = null; series = null; ro = null;
  };

  const draw = () => {
    if (!alive()) return;
    root.innerHTML = newsPanelHtml({ price, link, analysis, updated, events, calOk });
    const slot = root.querySelector('#nxm-slot');
    if (slot) slot.appendChild(chartEl);
  };

  const tickPrice = async () => {
    if (!alive()) return cleanup();
    try { price = await fetchPrice(BASE, SYM); link = 'live'; }
    catch { link = 'error'; }
    draw();
    tPrice = setTimeout(tickPrice, 5000);
  };

  const tickChart = async () => {
    if (!alive()) return cleanup();
    try {
      ensureChart();
      const list = await fetchKlines(BASE, SYM, IV, LIMIT);
      if (series) series.setData(list.map(c => ({ time: Math.floor(c.t / 1000), open: c.o, high: c.h, low: c.l, close: c.c })));
    } catch { /* grafik kosong bila gagal */ }
    tChart = setTimeout(tickChart, 60000);
  };

  // Analisis teknikal XAUUSD memakai mesin NdaxTrade yang sama dengan halaman utama.
  const tickAnalysis = async () => {
    if (!alive()) return cleanup();
    try {
      const remote = await loadRemoteConfig();
      if (remote) cfg = remote;
      const data = {};
      await Promise.all(Object.entries(cfg.timeframes).filter(([, t]) => t.enabled).map(async ([tf, t]) => {
        try { data[tf] = await fetchKlines(BASE, SYM, t.interval, cfg.market.candles); } catch { /* lewati timeframe ini */ }
      }));
      const r = analyzeAll(data, cfg);
      if (r) { analysis = r; updated = Date.now(); }
    } catch { /* coba lagi pada putaran berikutnya */ }
    draw();
    tAn = setTimeout(tickAnalysis, AN_MS);
  };

  // Kalender dari Worker. Jika gagal, data terakhir yang berhasil tetap ditampilkan dengan peringatan.
  const tickCal = async () => {
    if (!alive()) return cleanup();
    try {
      const r = await fetch(`${NDAX_API}/api/news/calendar`, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      events = mapCal(Array.isArray(j.events) ? j.events : []);
      calOk = true;
    } catch { calOk = false; }
    draw();
    tCal = setTimeout(tickCal, CAL_MS);
  };

  draw();
  tickPrice();
  tickChart();
  tickAnalysis();
  tickCal();
  return cleanup;
}
