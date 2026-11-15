import { Network } from '@capacitor/network';
import { Device } from '@capacitor/device';
import { watchConfig, DEFAULTS, API, assetUrl } from './api.js';
import * as net from './modules/net.js';
import { renderMore } from './modules/more.js';
import { I, logo, shell, tile, customTile, wordmarkInner, socialHtml } from './ui.js';
import { wifiPg } from './wifi.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const APP_VERSION = '1.0.0';
let cfg = DEFAULTS, server = 'unconfigured', netStatus = { connected: navigator.onLine, connectionType: 'unknown' };
let m = { ping: null, down: null, up: null }; // hanya hasil pengukuran nyata
let timer = null;
let ip = { v: null, t: 0 };

const SERVER_TXT = { server: ['Server terhubung', 'ok'], error: ['Server tidak terjangkau', 'bad'], unconfigured: ['API belum dikonfigurasi', 'bad'] };
const TYPE = { wifi: 'WiFi', cellular: 'Data seluler', none: 'Tidak terhubung', unknown: 'Tidak diketahui' };

// Route yang punya halaman sendiri dan bisa dimatikan dari panel admin
const FEATURE_ROUTES = ['ping', 'diag', 'speed', 'ip', 'monitor', 'device', 'wifi'];
const enabled = k => cfg.features[k] !== false;

// [kunci tool, segera hadir?]. Tool "segera" hanya tampilan, belum punya fungsi.
const HOME_TOOLS = [['wifi'], ['speed'], ['ip'], ['scan', true], ['security', true], ['ping']];
const ALL_TOOLS = [['ping'], ['diag'], ['speed'], ['ip'], ['monitor'], ['device'], ['wifi'], ['scan', true], ['security', true]];
const toolsHtml = list => list
  .filter(([k, soon]) => soon || enabled(k))
  .map(([k, soon]) => tile(k, !!soon)).join('');

// Tool tambahan dari panel admin (yang diaktifkan)
const customTools = () => (cfg.tools || []).filter(t => t.enabled !== false);
const customHtml = () => customTools().map(t => customTile(t)).join('');

// Kerangka aplikasi dibuat sekali: header, drawer, konten, bottom nav
app.innerHTML = shell();

// Judul (+ efek pelangi), background menu hamburger, dan sosial media mengikuti config admin
function applyChrome() {
  const t = cfg.title || 'NETCHECK';
  document.querySelectorAll('.wm').forEach(w => { w.innerHTML = wordmarkInner(t); w.classList.toggle('rainbow', !!cfg.titleRainbow); });
  document.title = t;
  const bg = assetUrl(cfg.drawerBg).replace(/["\\\n\r]/g, '');
  const d = $('#drawer');
  d.classList.toggle('has-bg', !!bg);
  d.style.backgroundImage = bg ? `linear-gradient(rgba(5,13,28,.6),rgba(5,13,28,.9)), url("${bg}")` : '';
  $('#dsocial').innerHTML = socialHtml(cfg.social);
}
applyChrome();

const setDrawer = open => {
  $('#drawer').classList.toggle('open', open);
  $('#drawer').setAttribute('aria-hidden', String(!open));
  $('#ov').classList.toggle('show', open);
};
$('#menu').onclick = () => setDrawer(true);
$('#close').onclick = () => setDrawer(false);
$('#ov').onclick = () => setDrawer(false);

// Semua tombol/kartu dengan data-go pindah halaman lewat hash
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g && !g.disabled) location.hash = g.dataset.go;
});

const markNav = p => document.querySelectorAll('[data-route]').forEach(b => b.classList.toggle('active', b.dataset.route === p));

async function route(animate = true) {
  clearInterval(timer);
  setDrawer(false);
  const p = location.hash.slice(1) || 'home';
  if (FEATURE_ROUTES.includes(p) && !enabled(p)) return (location.hash = '');
  document.documentElement.style.setProperty('--accent', cfg.accent || '#087CFF');

  let R = {
    home, tools, history, settings, about, more: morePg, wifi: wifiPg,
    ping: pingPg, diag: diagPg, speed: speedPg, ip: ipPg, monitor: monitorPg, device: devicePg,
  }[p];
  if (!R && p.startsWith('t/')) {
    const tool = customTools().find(t => t.id === p.slice(2));
    if (!tool) return (location.hash = '');
    R = el => toolPg(el, tool);
  }
  R = R || home;

  $('#content').innerHTML = (p !== 'home' ? `<button class="back" id="back">${I.back}<span>Kembali</span></button>` : '')
    + `<section class="view${animate ? '' : ' still'}" id="v"></section>`;
  const b = $('#back'); if (b) b.onclick = () => (location.hash = '');
  markNav(p);
  R($('#v'));
}

function home(el) {
  const [st, cls] = SERVER_TXT[server];
  const on = netStatus.connected;
  el.innerHTML = `
  ${cfg.announcement ? `<div class="notice">${esc(cfg.announcement)}</div>` : ''}
  <section class="status ${on ? 'on' : 'off'}">
    <div class="st-top"><span class="st-label">${I.signal}NETWORK STATUS</span><span>${TYPE[netStatus.connectionType] || netStatus.connectionType}</span></div>
    <div class="st-main"><strong>${on ? 'Connected' : 'Disconnected'}</strong><span class="check">${on ? I.check : I.x}</span></div>
    <small>${on ? 'Network running normally' : 'Tidak ada koneksi internet'}</small>
    <div class="metrics">
      <div><span>Ping</span><b>${m.ping == null ? '—' : m.ping.toFixed(0) + ' ms'}</b></div>
      <div><span>Download</span><b>${m.down == null ? '—' : m.down.toFixed(1) + ' Mbps'}</b></div>
      <div><span>Upload</span><b>${m.up == null ? '—' : m.up.toFixed(1) + ' Mbps'}</b></div>
    </div>
  </section>
  <div class="row-actions"><button class="btn" id="measure">Ukur sekarang</button><span class="badge ${cls}">${st}</span></div>
  <div id="ipline" class="mute small">${ip.v ? 'IP publik: ' + esc(ip.v) : ''}</div>
  <div class="sec-head"><h2>Network Tools</h2><button class="link" data-go="tools">Lihat Semua${I.chevron}</button></div>
  <div class="tools-grid">${toolsHtml(HOME_TOOLS)}${customHtml()}</div>
  <button class="more-card" data-go="more"><span class="more-ic">${I.grid}</span><span class="more-txt"><b>More Features</b><small>Fitur lainnya segera hadir...</small></span><span class="more-go">${I.chevron}</span></button>`;

  if (Date.now() - ip.t > 60000) {
    ip.t = Date.now();
    net.ipInfo().then(i => { ip.v = i.clientIp; const e = $('#ipline'); if (e) e.textContent = 'IP publik: ' + ip.v; }).catch(() => { ip.t = 0; });
  }
  $('#measure').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Mengukur…';
    try { m.ping = (await net.ping(5)).avg; m.down = await net.download(); m.up = await net.upload(); }
    catch (err) { alert('Pengukuran gagal: ' + err.message); }
    if (location.hash === '' || location.hash === '#home') home(el);
  };
}

function tools(el) {
  el.innerHTML = `<h2 class="page-title">Semua Tools</h2><div class="tools-grid">${toolsHtml(ALL_TOOLS)}${customHtml()}</div>`;
}

// Tool tambahan: "url" membuka tautan di luar aplikasi, "html" dijalankan di sandbox
function toolPg(el, tool) {
  el.innerHTML = `<h2 class="page-title">${esc(tool.name)}</h2>` + (tool.kind === 'url'
    ? `<div class="panel"><p class="mute">Halaman ini dibuka di luar aplikasi.</p><a class="btn" href="${esc(tool.url)}" target="_blank" rel="noopener">Buka</a></div>`
    : `<div class="panel"><pre id="o">Memuat…</pre><iframe class="tool-frame" id="tf" title="${esc(tool.name)}" sandbox="allow-scripts allow-forms" hidden></iframe></div>`);
  if (tool.kind === 'html') {
    fetch(`${API}${tool.url}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(t => {
        const f = $('#tf'); if (!f) return;
        f.srcdoc = t; f.hidden = false;
        const o = $('#o'); if (o) o.hidden = true;
      })
      .catch(err => { const o = $('#o'); if (o) o.textContent = 'Gagal memuat tool: ' + err.message; });
  }
}

function history(el) {
  const has = [m.ping, m.down, m.up].some(v => v != null);
  el.innerHTML = `<h2 class="page-title">Riwayat</h2>` + (has
    ? `<div class="panel">
        <div class="row"><span class="mute">Ping</span><span>${m.ping == null ? '—' : m.ping.toFixed(0) + ' ms'}</span></div>
        <div class="row"><span class="mute">Download</span><span>${m.down == null ? '—' : m.down.toFixed(1) + ' Mbps'}</span></div>
        <div class="row"><span class="mute">Upload</span><span>${m.up == null ? '—' : m.up.toFixed(1) + ' Mbps'}</span></div>
        <small class="mute">Hasil sesi ini. Riwayat hilang saat aplikasi ditutup.</small>
      </div>`
    : `<div class="empty">${I.clock}<p>Belum ada riwayat</p><small class="mute">Hasil pengukuran akan muncul di sini selama aplikasi dibuka.</small></div>`);
}

function settings(el) {
  const rows = [
    ['Status server', SERVER_TXT[server][0]],
    ['Status jaringan', netStatus.connected ? 'Online' : 'Offline'],
    ['Jenis koneksi', TYPE[netStatus.connectionType] || netStatus.connectionType],
    ['Versi aplikasi', APP_VERSION],
  ];
  el.innerHTML = `<h2 class="page-title">Pengaturan</h2><div class="panel">${rows.map(r => `<div class="row"><span class="mute">${r[0]}</span><span>${esc(r[1])}</span></div>`).join('')}</div>`;
}

function about(el) {
  el.innerHTML = `<div class="about">
    <div class="about-logo">${logo(56)}</div>
    <h2 class="page-title">${esc(cfg.title)}</h2>
    <p class="mute">Versi ${APP_VERSION}</p>
    <div class="panel"><p>Aplikasi cek jaringan untuk melihat ping, kecepatan, IP, dan DNS. Pengukuran memakai server Cloudflare speed test.</p></div>
    <div class="about-social">${socialHtml(cfg.social)}</div>
  </div>`;
}

function pingPg(el) {
  let sent = 0, fail = 0, vals = [], busy = false, running = false;
  el.innerHTML = `<h2>Cek Ping</h2><div class="panel"><button class="btn" id="go">Mulai</button>
  <div class="stats"><div><span>Saat ini</span><strong id="cur">—</strong></div><div><span>Rata-rata</span><strong id="avg">—</strong></div><div><span>Packet loss</span><strong id="loss">—</strong></div></div>
  <div class="bars" id="bars"></div>
  <pre id="o">Ping otomatis tiap 1 detik sampai Anda menekan Berhenti. Yang diukur adalah waktu respons HTTPS ke server Cloudflare, bukan ICMP.</pre></div>`;
  const draw = () => {
    if (!$('#cur')) return;
    const ok = vals.filter(v => v != null);
    const last = vals.at(-1);
    $('#cur').textContent = last != null ? last.toFixed(0) + ' ms' : 'gagal';
    $('#loss').textContent = ((fail / sent) * 100).toFixed(0) + '%';
    if (ok.length) {
      const avg = ok.reduce((a, c) => a + c) / ok.length;
      const jit = ok.length > 1 ? ok.slice(1).reduce((a, v, i) => a + Math.abs(v - ok[i]), 0) / (ok.length - 1) : 0;
      m.ping = avg;
      $('#avg').textContent = avg.toFixed(0) + ' ms';
      $('#o').textContent = `Dikirim: ${sent} | Gagal: ${fail}\nMin ${Math.min(...ok).toFixed(0)} ms / Maks ${Math.max(...ok).toFixed(0)} ms\nJitter ${jit.toFixed(1)} ms`;
    }
    const shown = vals.slice(-40), mx = Math.max(100, ...shown.filter(Boolean));
    $('#bars').innerHTML = shown.map(v => `<i style="height:${v ? (v / mx) * 100 : 2}%;${v ? '' : 'background:var(--bad)'}"></i>`).join('');
  };
  const tick = async () => {
    if (busy || !running) return;
    busy = true; sent++;
    try { vals.push((await net.ping(1)).avg); } catch { fail++; vals.push(null); }
    if (vals.length > 300) vals.shift();
    busy = false; draw();
  };
  $('#go').onclick = e => {
    if (running) { running = false; clearInterval(timer); e.target.textContent = 'Mulai'; return; }
    sent = 0; fail = 0; vals = []; running = true; e.target.textContent = 'Berhenti';
    tick(); timer = setInterval(tick, 1000);
  };
}

function diagPg(el) {
  el.innerHTML = `<h2>Cek Jaringan</h2><div class="panel"><button class="btn" id="go">Jalankan diagnostik</button><div id="o"></div></div>`;
  $('#go').onclick = async e => {
    e.target.disabled = true;
    const draw = o => ($('#o').innerHTML = o.map(x => `<div class="row"><span>${esc(x.name)}</span><span class="badge ${x.ok ? 'ok' : 'bad'}">${x.ok ? 'OK' : 'Gagal'}</span></div><div class="mute" style="font-size:12px">${esc(x.d)}</div>`).join(''));
    await net.diagnose(draw); e.target.disabled = false;
  };
}

function speedPg(el) {
  el.innerHTML = `<h2>Speed Test</h2><div class="panel"><button class="btn" id="go">Mulai tes</button>
  <div class="stats"><div><span>Download</span><strong id="d">—</strong></div><div><span>Upload</span><strong id="u">—</strong></div><div><span>Ping</span><strong id="p">—</strong></div></div>
  <pre id="o">Tes memakai ±14 MB data. Hati-hati pada kuota seluler.</pre></div>`;
  $('#go').onclick = async e => {
    e.target.disabled = true; $('#o').textContent = 'Mengukur…';
    try { m.ping = (await net.ping(5)).avg; $('#p').textContent = m.ping.toFixed(0) + ' ms';
      m.down = await net.download(); $('#d').textContent = m.down.toFixed(1) + ' Mbps';
      m.up = await net.upload(); $('#u').textContent = m.up.toFixed(1) + ' Mbps'; $('#o').textContent = 'Selesai.';
    } catch (err) { $('#o').textContent = 'Gagal: ' + err.message; }
    e.target.disabled = false;
  };
}

function ipPg(el) {
  el.innerHTML = `<h2>IP Address</h2><div class="panel" id="ipbox">Memuat…</div>
  <h2>DNS Lookup</h2><div class="panel"><input id="host" placeholder="contoh: example.com" autocapitalize="none"><button class="btn" id="go">Cari (A)</button><pre id="o"></pre></div>`;
  net.ipInfo().then(i => { $('#ipbox').innerHTML = [['IP publik', i.clientIp], ['Operator', i.asOrganization], ['ASN', i.asn], ['Negara', i.country], ['Kota', i.city], ['Wilayah', i.region]].filter(r => r[1]).map(r => `<div class="row"><span class="mute">${r[0]}</span><span>${esc(r[1])}</span></div>`).join(''); })
    .catch(err => ($('#ipbox').textContent = 'Gagal: ' + err.message));
  $('#go').onclick = async () => {
    const h = $('#host').value.trim(); if (!h) return ($('#o').textContent = 'Masukkan nama domain.');
    $('#o').textContent = 'Mencari…';
    try { const r = await net.dns(h); $('#o').textContent = r.answers.length ? r.answers.map(a => `${a.data} (TTL ${a.ttl})`).join('\n') : `Tidak ada rekaman A (status ${r.status}).`; }
    catch (err) { $('#o').textContent = 'Gagal: ' + err.message; }
  };
}

function monitorPg(el) {
  const hist = [];
  el.innerHTML = `<h2>Monitor Koneksi</h2><div class="panel"><button class="btn" id="go">Mulai</button><button class="btn ghost" id="stop">Berhenti</button><div class="bars" id="bars"></div><pre id="o">Ping tiap 3 detik.</pre></div>`;
  const tick = async () => {
    try { hist.push((await net.ping(1)).avg); } catch { hist.push(null); }
    if (hist.length > 30) hist.shift();
    const mx = Math.max(100, ...hist.filter(Boolean));
    const b = $('#bars'); if (!b) return;
    b.innerHTML = hist.map(v => `<i style="height:${v ? (v / mx) * 100 : 2}%;${v ? '' : 'background:var(--bad)'}"></i>`).join('');
    const ok = hist.filter(Boolean); $('#o').textContent = `Terakhir: ${hist.at(-1) ? hist.at(-1).toFixed(0) + ' ms' : 'gagal'}\nRata-rata: ${ok.length ? (ok.reduce((a, c) => a + c) / ok.length).toFixed(0) : '—'} ms | Gagal: ${hist.length - ok.length}/${hist.length}`;
  };
  $('#go').onclick = () => { clearInterval(timer); tick(); timer = setInterval(tick, 3000); };
  $('#stop').onclick = () => clearInterval(timer);
}

async function devicePg(el) {
  el.innerHTML = `<h2>Informasi Perangkat</h2><div class="panel" id="b">Memuat…</div>`;
  const [i, n] = await Promise.all([Device.getInfo(), Network.getStatus()]);
  const rows = [['Model', `${i.manufacturer || ''} ${i.model}`], ['Platform', i.platform], ['Sistem operasi', `${i.operatingSystem} ${i.osVersion}`],
    ['Jenis koneksi', TYPE[n.connectionType] || n.connectionType], ['Status konektivitas', n.connected ? 'Terhubung' : 'Tidak terhubung']];
  $('#b').innerHTML = rows.map(r => `<div class="row"><span class="mute">${r[0]}</span><span>${esc(r[1])}</span></div>`).join('');
}

function morePg(el) { renderMore(el, cfg.slots, esc); }

// Header: pill ONLINE/OFFLINE, plus overlay offline seperti sebelumnya
function setOffline() {
  $('#offline').hidden = netStatus.connected;
  $('#pill').classList.toggle('off', !netStatus.connected);
  $('#pilltxt').textContent = netStatus.connected ? 'ONLINE' : 'OFFLINE';
}
const onHome = () => !location.hash || location.hash === '#home';
let pending = false;
const refresh = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; route(false); }, 200); };
Network.getStatus().then(s => { netStatus = s; setOffline(); });
Network.addListener('networkStatusChange', s => {
  const changed = s.connected !== netStatus.connected || s.connectionType !== netStatus.connectionType;
  netStatus = s; setOffline();
  if (changed && onHome()) refresh();
});
setOffline();
let lastCfg = '';
watchConfig(c => {
  const j = JSON.stringify(c);
  if (j === lastCfg) return;
  lastCfg = j; cfg = c;
  applyChrome();
  const p = location.hash.slice(1);
  if (onHome() || cfg.features[p] === false || p === 'more') refresh();
}, s => { if (s === server) return; server = s; if (onHome()) refresh(); });
window.addEventListener('hashchange', () => route());
route();
