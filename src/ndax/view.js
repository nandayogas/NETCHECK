// Halaman NdaxTrade di dalam NETCHECK. Dipanggil dari route `ndaxtrade`.
import { mergeConfig, TF_ORDER, loadRemoteConfig } from './config.js';
import { fetchKlines, fetchPrice } from './binance.js';
import { analyzeAll, fmtP } from './analyzer.js';
import './ndax.css';

const CACHE_KEY = 'ndax.cfg';
const SYM_KEY = 'ndax.sym';
// Pasar yang bisa dipilih di halaman. XAUUSDT = emas (Binance Futures), PAXGUSDT = token emas di spot.
const MARKETS = [
  { sym: 'BTCUSDT',  label: 'BTC' },
  { sym: 'XAUUSDT',  label: 'XAU/USD' },
  { sym: 'PAXGUSDT', label: 'XAU (PAXG)' },
];
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

export function ndaxPg(el) {
  const id = ++session;               // sesi baru membatalkan loop sesi lama
  let cfg = readCache();
  let sym = (() => { try { return localStorage.getItem(SYM_KEY); } catch { return null; } })() || cfg.market.symbol;
  const st = { price: null, link: 'connecting', err: '', result: null, updated: null, sel: null };

  el.innerHTML = '<div class="nx" id="nx"></div>';
  const root = el.querySelector('#nx');
  const alive = () => id === session && root.isConnected;

  const row = m => {
    const w = Math.abs(m.score) * 50, pos = m.score >= 0;
    return `<div class="nx-m">
      <div class="nx-mh"><span>${esc(m.label)}</span><span class="${pos ? 'buy' : 'sell'}">${pos ? '+' : ''}${m.score.toFixed(2)}</span></div>
      <div class="nx-bar"><i class="${pos ? 'pos' : 'neg'}" style="width:${w}%;${pos ? 'left:50%' : 'right:50%'}"></i></div>
      <div class="nx-note">${esc(m.note)}${m.weight === 0 ? ' · filter' : ''}</div>
    </div>`;
  };

  const view = () => {
    const r = st.result;
    const sel = st.sel || cfg.primaryTf;
    const t = r?.tfs[sel];
    const sig = r?.signal ?? 'WAIT';
    const d = dpOf(st.price ?? 1);
    const lv = (label, v, c = '') => `<div class="nx-lv"><small>${label}</small><b class="${c}">${money(v, d)}</b></div>`;
    const tfBtn = k => {
      const x = r?.tfs[k];
      return `<button class="nx-tf${sel === k ? ' on' : ''}" data-tf="${k}">
        <b>${k}</b><span class="${tone(x?.signal)}">${x?.signal ?? '—'}</span>
        <small>${x ? Math.round((1 + x.score) / 2 * 100) + '%' : ''}</small></button>`;
    };
    const fibHtml = t?.fib
      ? `<div class="nx-sect">Fibonacci ${sel}</div><div class="nx-fib">${t.fib.levels.map(l =>
          `<span>${(l.ratio * 100).toFixed(1)}%<b>${money(l.price, d)}</b></span>`).join('')}</div>`
      : '';
    return `
    <header class="nx-top">
      <div>
        <div class="nx-sym">${esc(sym)} · NdaxTrade</div>
        <div class="nx-price">${money(st.price, d)}</div>
      </div>
      <span class="nx-pill ${st.link}">${LINK[st.link]}</span>
    </header>

    <div class="nx-mk">${MARKETS.map(m =>
      `<button class="nx-chip${sym === m.sym ? ' on' : ''}" data-sym="${m.sym}">${m.label}</button>`).join('')}</div>

    <section class="nx-card">
      <div class="nx-sigrow">
        <div class="nx-sig ${tone(sig)}">${sig}</div>
        <div>
          <div class="nx-dir ${tone(r?.dir)}">${r ? r.dir : 'MENUNGGU DATA'}</div>
          <div class="nx-mut">Kekuatan sinyal ${r ? r.strength : 0}%</div>
        </div>
      </div>
      <div class="nx-pct"><span class="buy">Bullish ${r ? r.bull : '—'}%</span><span class="sell">Bearish ${r ? r.bear : '—'}%</span></div>
      <div class="nx-meter"><div style="width:${r ? r.bull : 50}%"></div></div>
      <div class="nx-levels">
        ${lv('Entry', r?.levels.entry)}
        ${lv('Stop Loss', r?.levels.sl, 'sell')}
        ${lv('Take Profit', r?.levels.tp, 'buy')}
      </div>
    </section>

    <section class="nx-card">
      <div class="nx-sect">Timeframe</div>
      <div class="nx-tfgrid">${TF_ORDER.filter(k => cfg.timeframes[k]?.enabled).map(tfBtn).join('')}</div>
    </section>

    <section class="nx-card">
      <div class="nx-sect">Detail ${sel}${t ? ` · skor ${Math.round(t.score * 100)}` : ''}</div>
      ${t ? t.methods.map(row).join('') : '<div class="nx-mut">Menunggu data pasar…</div>'}
      ${fibHtml}
    </section>

    <footer class="nx-foot">Update ${st.updated ? new Date(st.updated).toLocaleTimeString('id-ID') : '—'}${st.err ? ' · ' + esc(st.err) : ''}</footer>`;
  };

  const draw = () => { if (alive()) root.innerHTML = view(); };
  root.addEventListener('click', e => {
    const m = e.target.closest('[data-sym]');
    if (m && m.dataset.sym !== sym) {
      sym = m.dataset.sym;
      try { localStorage.setItem(SYM_KEY, sym); } catch { /* abaikan */ }
      Object.assign(st, { price: null, link: 'connecting', err: '', result: null, updated: null });
      draw(); doPrice(); doAnalysis();
      return;
    }
    const b = e.target.closest('[data-tf]');
    if (b) { st.sel = b.dataset.tf; draw(); }
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
  }

  loop(doPrice, () => cfg.market.priceRefreshSec * 1000);
  loop(doAnalysis, () => cfg.market.analysisRefreshSec * 1000);

  draw();
}
