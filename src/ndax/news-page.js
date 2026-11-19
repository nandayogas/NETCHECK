// Halaman FX NEWS INTELLIGENCE sebagai tile di Tools. Angka berita adalah contoh (lihat news.js).
// Harga XAUUSD diperbarui setiap 5 detik. Grafik M15 diperbarui setiap 60 detik. Semua berhenti saat halaman ditutup.
import { newsPanelHtml } from './news.js';
import { fetchPrice, fetchKlines } from './binance.js';
import { mergeConfig, loadRemoteConfig } from './config.js';
import { analyzeAll } from './analyzer.js';
import { createChart, CrosshairMode } from 'lightweight-charts';
import './ndax.css';

const SYM = 'XAUUSDT', IV = '15m', LIMIT = 120, BASE = 'https://api.binance.com', AN_MS = 30000;

export function newsPg(el) {
  el.innerHTML = '<div class="nxm-page" id="nxm-root"></div>';
  const root = el.querySelector('#nxm-root');
  const alive = () => root.isConnected;
  const chartEl = document.createElement('div');
  chartEl.className = 'nxm-chart';
  let chart = null, series = null, price = null, link = 'connecting', tPrice = null, tChart = null, tAn = null, ro = null;
  let cfg = mergeConfig(null), analysis = null, updated = null;

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
    clearTimeout(tPrice); clearTimeout(tChart); clearTimeout(tAn);
    if (ro) ro.disconnect();
    if (chart) chart.remove();
    chart = null; series = null; ro = null;
  };

  const draw = () => {
    if (!alive()) return;
    root.innerHTML = newsPanelHtml({ price, link, analysis, updated });
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

  draw();
  tickPrice();
  tickChart();
  tickAnalysis();
  return cleanup;
}
