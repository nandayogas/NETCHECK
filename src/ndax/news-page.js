// Halaman FX NEWS INTELLIGENCE sebagai tile di Tools. Angka berita adalah contoh (lihat news.js).
// Harga XAUUSD diperbarui setiap 5 detik. Grafik M15 diperbarui setiap 60 detik. Semua berhenti saat halaman ditutup.
import { newsPanelHtml } from './news.js';
import { fetchPrice, fetchKlines } from './binance.js';
import { createChart, CrosshairMode } from 'lightweight-charts';
import './ndax.css';

const SYM = 'XAUUSDT', IV = '15m', LIMIT = 120, BASE = 'https://api.binance.com';

export function newsPg(el) {
  el.innerHTML = '<div class="nxm-page" id="nxm-root"></div>';
  const root = el.querySelector('#nxm-root');
  const alive = () => root.isConnected;
  const chartEl = document.createElement('div');
  chartEl.className = 'nxm-chart';
  let chart = null, series = null, price = null, link = 'connecting', tPrice = null, tChart = null, ro = null;

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
    clearTimeout(tPrice); clearTimeout(tChart);
    if (ro) ro.disconnect();
    if (chart) chart.remove();
    chart = null; series = null; ro = null;
  };

  const draw = () => {
    if (!alive()) return;
    root.innerHTML = newsPanelHtml({ price, link });
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

  draw();
  tickPrice();
  tickChart();
  return cleanup;
}
