// NdaxTrade Dev: aplikasi pengaturan. Hanya mengubah konfigurasi di backend.
import { mergeConfig, loadRemoteConfig, saveRemoteConfig, NDAX_API } from './config.js';
import './ndax.css';

const app = document.getElementById('app');
let cfg = mergeConfig(null);
let token = localStorage.getItem('ndax.dev.token') || '';
let msg = '';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const label = k => k.replace(/_/g, ' ');

// Field generik: tipe ditentukan dari nilai saat ini.
function input(path, key, val) {
  const name = [...path, key].join('|');
  const lb = `<span>${esc(label(key))}</span>`;
  if (typeof val === 'boolean')
    return `<label class="sw"><input type="checkbox" data-p="${name}" data-t="bool" ${val ? 'checked' : ''}/>${lb}</label>`;
  if (Array.isArray(val))
    return `<label class="fld">${lb}<input data-p="${name}" data-t="list" value="${esc(val.join(','))}"/></label>`;
  if (typeof val === 'number')
    return `<label class="fld">${lb}<input type="number" step="any" data-p="${name}" data-t="num" value="${val}"/></label>`;
  return `<label class="fld">${lb}<input data-p="${name}" data-t="str" value="${esc(val)}"/></label>`;
}

function group(title, obj, path) {
  const rows = Object.entries(obj).map(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? `<div class="sub">${esc(label(k))}</div><div class="grid">${Object.entries(v).map(([kk, vv]) => input([...path, k], kk, vv)).join('')}</div>`
      : input(path, k, v)
  ).join('');
  return `<section class="nx-card"><div class="nx-sect">${esc(title)}</div>${rows}</section>`;
}

function render() {
  const noApi = NDAX_API.includes('GANTI');
  const { fibonacci, ...otherMethods } = cfg.methods;
  app.innerHTML = `<div class="nxdev-wrap">
  <header>
    <div class="nx-sym">NdaxTrade Dev</div>
    <div class="nx-mut">Perubahan disimpan ke server dan diterapkan ke NdaxTrade dalam ±30 detik, tanpa build ulang.</div>
  </header>
  ${noApi ? '<div class="warn">NDAX_API belum diisi di src/ndax/config.js</div>' : ''}
  ${token ? '' : `<section class="nx-card"><div class="nx-sect">Token Dev</div>
    <input id="tok" class="inp" type="password" placeholder="Token Dev"/>
    <button class="btn" id="saveTok">Simpan token</button></section>`}
  <form id="form" style="display:flex;flex-direction:column;gap:12px">
    ${group('Market', cfg.market, ['market'])}
    <section class="nx-card"><div class="nx-sect">Sinyal & Timeframe</div>
      ${input([], 'primaryTf', cfg.primaryTf)}
      ${Object.entries(cfg.signal).map(([k, v]) => input(['signal'], k, v)).join('')}
      <div class="sub">Timeframe</div>
      <div class="grid">${Object.entries(cfg.timeframes).map(([k, v]) =>
        `<div>${Object.entries(v).map(([kk, vv]) => input(['timeframes', k], kk, vv)).join('')}</div>`).join('')}</div>
    </section>
    ${group('Metode (EMA, RSI, MACD, S/R, Price Action, Volume, ATR, BOS/CHoCH, Liquidity)', otherMethods, ['methods'])}
    ${group('Fibonacci', { fibonacci }, ['methods'])}
  </form>
  <div class="actions">
    <button class="btn ghost" id="reset">Reset default</button>
    <button class="btn" id="save">Simpan & terapkan</button>
  </div>
  <div class="msg nx-mut">${esc(msg)}</div>
  </div>`;
}

// Baca form ke objek konfigurasi baru.
function collect() {
  const next = structuredClone(cfg);
  document.querySelectorAll('#form [data-p]').forEach(el => {
    const ks = el.dataset.p.split('|');
    let o = next;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    const k = ks.at(-1), t = el.dataset.t;
    if (t === 'bool') o[k] = el.checked;
    else if (t === 'num') { const v = parseFloat(el.value); o[k] = Number.isFinite(v) ? v : 0; }
    else if (t === 'list') o[k] = el.value.split(',').map(s => s.trim()).filter(Boolean).map(s => (isNaN(+s) ? s : +s));
    else o[k] = el.value.trim();
  });
  return next;
}

app.addEventListener('click', async e => {
  const id = e.target.id;
  if (id === 'saveTok') {
    token = document.getElementById('tok').value.trim();
    localStorage.setItem('ndax.dev.token', token);
    msg = 'Token tersimpan.';
    render();
  } else if (id === 'reset') {
    cfg = mergeConfig(null);
    msg = 'Default dimuat (belum disimpan).';
    render();
  } else if (id === 'save') {
    try {
      cfg = collect();
      await saveRemoteConfig(cfg, token);
      msg = `Tersimpan ${new Date().toLocaleTimeString('id-ID')}. Diterapkan ke NdaxTrade otomatis.`;
    } catch (err) {
      msg = 'Gagal menyimpan: ' + err.message;
    }
    render();
  }
});

render();
loadRemoteConfig().then(r => { if (r) { cfg = r; render(); } });
