// Halaman FX NEWS INTELLIGENCE sebagai tile di Tools. Angka berita adalah contoh (lihat news.js).
// Harga XAUUSD diambil dari Binance Futures, diperbarui setiap 5 detik, dan berhenti saat halaman ditutup.
import { newsPanelHtml } from './news.js';
import { fetchPrice } from './binance.js';
import './ndax.css';

export function newsPg(el) {
  el.innerHTML = '<div class="nx" id="nxn-root"></div>';
  const root = el.querySelector('#nxn-root');
  let price = null, link = 'connecting', timer = null;
  const alive = () => root.isConnected;
  const draw = () => { if (alive()) root.innerHTML = newsPanelHtml({ price, link }); };
  const tick = async () => {
    if (!alive()) return;
    try { price = await fetchPrice('https://api.binance.com', 'XAUUSDT'); link = 'live'; }
    catch { link = 'error'; }
    draw();
    if (alive()) timer = setTimeout(tick, 5000);
  };
  draw();
  tick();
  return () => clearTimeout(timer);
}
