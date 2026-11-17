import { Network } from '@capacitor/network';
import { Device } from '@capacitor/device';
import { watchConfig, DEFAULTS, API, assetUrl } from './api.js';
import * as net from './modules/net.js';
import { renderMore } from './modules/more.js';
import { I, logo, shell, tile, customTile, wordmarkInner, socialHtml } from './ui.js';
import { wifiPg } from './wifi.js';
import { accountHtml } from './auth.js';
import { initGate } from './login.js';
import './modules/live.js';
import './modules/locate.js';
import { checkUpdate, checkConfigUpdate } from './update.js';
import { gauge, spark } from './charts.js';
import { hist, addHist, clearHist } from './history.js';
import { securityPg } from './security.js';
import { initBg, bgSettingsHtml, bindBgSettings } from './bg.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const APP_VERSION = '1.2.4';
let cfg = DEFAULTS, server = 'unconfigured', netStatus = { connected: navigator.onLine, connectionType: 'unknown' };
let m = { ping: null, down: null, up: null }; // hanya hasil pengukuran nyata
let timer = null;
let ip = { v: null, t: 0 };
let hf = 'all'; // filter riwayat
const trend = []; // ping tiap pengukuran Home (sesi ini)

const SERVER_TXT = { server: ['Server terhubung', 'ok'], error: ['Server tidak terjangkau', 'bad'], unconfigured: ['API belum dikonfigurasi', 'bad'] };
const TYPE = { wifi: 'WiFi', cellular: 'Data seluler', none: 'Tidak terhubung', unknown: 'Tidak diketahui' };

// Route yang punya halaman sendiri dan bisa dimatikan dari panel admin
const FEATURE_ROUTES = ['ping', 'diag', 'speed', 'ip', 'monitor', 'device', 'wifi', 'security'];
const enabled = k => cfg.features[k] !== false;

// [kunci tool, segera hadir?]. Tool "segera" hanya tampilan, belum punya fungsi.
const HOME_TOOLS = [['wifi'], ['speed'], ['ip'], ['scan', true], ['security'], ['ping']];
const ALL_TOOLS = [['ping'], ['diag'], ['speed'], ['ip'], ['monitor'], ['device'], ['wifi'], ['scan', true], ['security'], ['ai', true]];
const toolsHtml = list => list
  .filter(([k, soon]) => soon || enabled(k))
  .map(([k, soon]) => tile(k, !!soon)).join('');

// Tool tambahan dari panel admin (yang diaktifkan)
const customTools = () => (cfg.tools || []).filter(t => t.enabled !== false);
const customHtml = () => customTools().map(t => customTile(t)).join('');

// Kerangka aplikasi dibuat sekali: header, drawer, konten, bottom nav
app.innerHTML = shell();
initBg();
initGate();

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
    home, tools, history, settings, about, more: morePg, wifi: wifiPg, security: securityPg,
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
  ${annActive(cfg) ? `<div class="notice ${esc(cfg.announcementLevel || 'info')}">${esc(cfg.announcement)}</div>` : ''}
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
  ${healthHtml(on)}
  <div class="panel trend"><span class="mute small">Latency (ms) tiap pengukuran</span>${spark(trend)}</div>
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
    try { m.ping = (await net.ping(5)).avg; trend.push(m.ping); m.down = await net.download(); m.up = await net.upload(); addHist({ k: 'speed', ping: m.ping, down: m.down, up: m.up }); }
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

function healthHtml(on) {
  // Dihitung hanya dari pemeriksaan yang benar-benar ada datanya
  const c = [['Perangkat online', on], ['Server terhubung', server === 'server']];
  if (m.ping != null) c.push(['Ping di bawah 100 ms', m.ping < 100]);
  if (m.down != null) c.push(['Download minimal 5 Mbps', m.down >= 5]);
  const pct = Math.round(c.filter(x => x[1]).length / c.length * 100);
  return `<div class="panel health"><div class="ring" style="--p:${pct}"><b>${pct}%</b></div><div><b>System Health</b>${c.map(([t, ok]) => `<div class="hrow ${ok ? 'ok' : 'bad'}">${ok ? I.check : I.x}<span>${t}</span></div>`).join('')}</div></div>`;
}

function history(el) {
  const L = hist().filter(h => hf === 'all' || h.k === hf);
  const line = h => h.k === 'speed' ? ['Speed Test', `${h.down.toFixed(1)} / ${h.up.toFixed(1)} Mbps · ${h.ping.toFixed(0)} ms`, I.speed]
    : h.k === 'ping' ? ['Ping Test', `${h.avg.toFixed(0)} ms · loss ${h.loss.toFixed(0)}%`, I.pulse]
    : ['Security Check', `${h.ok}/${h.n} lolos`, I.shield];
  const tabs = [['all', 'Semua'], ['speed', 'Speed Test'], ['ping', 'Ping Test'], ['sec', 'Security']];
  el.innerHTML = `<div class="sec-head"><h2 class="page-title" style="margin:0">Riwayat Pengujian</h2>${hist().length ? '<button class="link" id="hclr">Hapus semua</button>' : ''}</div>
  <div class="tabs">${tabs.map(([k, l]) => `<button class="tab${hf === k ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>` + (L.length
    ? L.map(h => { const [t, d, ic] = line(h); return `<div class="panel hist-item"><span class="t-ic">${ic}</span><div><b>${t}</b><div class="mute small">${esc(d)}</div></div><small class="mute">${new Date(h.t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>`; }).join('')
    : `<div class="empty">${I.clock}<p>Belum ada riwayat</p><small class="mute">Hasil Speed Test, Ping, dan Security Check tersimpan di perangkat ini.</small></div>`);
  el.querySelectorAll('.tab').forEach(b => { b.onclick = () => { hf = b.dataset.f; history(el); }; });
  const c = $('#hclr'); if (c) c.onclick = () => { clearHist(); history(el); };
}

function settings(el) {
  const rows = [
    ['Status server', SERVER_TXT[server][0]],
    ['Status jaringan', netStatus.connected ? 'Online' : 'Offline'],
    ['Jenis koneksi', TYPE[netStatus.connectionType] || netStatus.connectionType],
    ['Versi aplikasi', APP_VERSION],
  ];
  el.innerHTML = `<h2 class="page-title">Pengaturan</h2>${accountHtml()}<div class="panel">${rows.map(r => `<div class="row"><span class="mute">${r[0]}</span><span>${esc(r[1])}</span></div>`).join('')}</div>${bgSettingsHtml()}`;
  bindBgSettings(el);
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
  <div class="stats"><div><span>Rata-rata</span><strong id="avg">—</strong></div><div><span>Min</span><strong id="min">—</strong></div><div><span>Maks</span><strong id="max">—</strong></div></div>
  <div class="row"><span>Packet loss</span><strong id="loss">—</strong></div>
  <div class="chart" id="bars"></div>
  <pre id="o">Ping otomatis tiap 1 detik sampai Anda menekan Berhenti. Yang diukur adalah waktu respons HTTPS ke server Cloudflare, bukan ICMP.</pre></div>`;
  const draw = () => {
    if (!$('#avg')) return;
    const ok = vals.filter(v => v != null);
    const last = vals.at(-1);
    $('#loss').textContent = ((fail / sent) * 100).toFixed(0) + '%';
    if (ok.length) {
      const avg = ok.reduce((a, c) => a + c) / ok.length;
      const jit = ok.length > 1 ? ok.slice(1).reduce((a, v, i) => a + Math.abs(v - ok[i]), 0) / (ok.length - 1) : 0;
      m.ping = avg;
      $('#avg').textContent = avg.toFixed(0) + ' ms'; $('#min').textContent = Math.min(...ok).toFixed(0) + ' ms'; $('#max').textContent = Math.max(...ok).toFixed(0) + ' ms';
      $('#o').textContent = `Dikirim: ${sent} | Gagal: ${fail}\nMin ${Math.min(...ok).toFixed(0)} ms / Maks ${Math.max(...ok).toFixed(0)} ms\nJitter ${jit.toFixed(1)} ms`;
    }
    const shown = vals.slice(-40), mx = Math.max(100, ...shown.filter(Boolean));
    $('#bars').innerHTML = spark(shown);
  };
  const tick = async () => {
    if (busy || !running) return;
    busy = true; sent++;
    try { vals.push((await net.ping(1)).avg); } catch { fail++; vals.push(null); }
    if (vals.length > 300) vals.shift();
    busy = false; draw();
  };
  $('#go').onclick = e => {
    if (running) { running = false; clearInterval(timer); e.target.textContent = 'Mulai'; if (sent && m.ping != null) addHist({ k: 'ping', avg: m.ping, loss: (fail / sent) * 100 }); return; }
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
  el.innerHTML = `<h2>Speed Test</h2><div class="panel"><div id="gg">${gauge(null, 100, 'Mbps')}</div><button class="btn" id="go">Mulai tes</button>
  <div class="stats"><div><span>Download</span><strong id="d">—</strong></div><div><span>Upload</span><strong id="u">—</strong></div><div><span>Ping</span><strong id="p">—</strong></div></div>
  <pre id="o">Tes memakai ±14 MB data. Hati-hati pada kuota seluler.</pre></div>`;
  $('#go').onclick = async e => {
    e.target.disabled = true; $('#o').textContent = 'Mengukur…';
    try { m.ping = (await net.ping(5)).avg; $('#p').textContent = m.ping.toFixed(0) + ' ms';
      m.down = await net.download(); $('#d').textContent = m.down.toFixed(1) + ' Mbps'; $('#gg').innerHTML = gauge(m.down, Math.max(100, Math.ceil(m.down / 100) * 100), 'Mbps');
      m.up = await net.upload(); $('#u').textContent = m.up.toFixed(1) + ' Mbps'; $('#o').textContent = 'Selesai.'; addHist({ k: 'speed', ping: m.ping, down: m.down, up: m.up });
    } catch (err) { $('#o').textContent = 'Gagal: ' + err.message; }
    e.target.disabled = false;
  };
}

function ipPg(el) {
  el.innerHTML = `<h2>IP Checker</h2><div class="panel ipcard"><svg class="globe" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="#00BFFF" stroke-width="2"/><ellipse cx="60" cy="60" rx="22" ry="52" fill="none" stroke="#087CFF" stroke-width="1.5"/><path d="M8 60h104M16 36h88M16 84h88" fill="none" stroke="#087CFF" stroke-width="1.5"/></svg><span class="mute small">IP Publik</span><div class="ipbig"><b id="ipbig">Memuat…</b><button class="icon-btn" id="cp" aria-label="Salin IP">${I.link}</button></div></div><div class="panel" id="ipbox">Memuat…</div>
  <h2>DNS Lookup</h2><div class="panel"><input id="host" placeholder="contoh: example.com" autocapitalize="none"><button class="btn" id="go">Cari (A)</button><pre id="o"></pre></div>`;
  net.ipInfo().then(i => { $('#ipbig').textContent = i.clientIp; $('#cp').onclick = () => navigator.clipboard && navigator.clipboard.writeText(i.clientIp).then(() => ($('#cp').style.color = 'var(--online)')).catch(() => {});
    $('#ipbox').innerHTML = [['IP publik', i.clientIp], ['Operator', i.asOrganization], ['ASN', i.asn], ['Negara', i.country], ['Kota', i.city], ['Wilayah', i.region], ['Versi IP', String(i.clientIp).includes(':') ? 'IPv6' : 'IPv4']].filter(r => r[1]).map(r => `<div class="row"><span class="mute">${r[0]}</span><span>${esc(r[1])}</span></div>`).join(''); })
    .catch(err => ($('#ipbox').textContent = 'Gagal: ' + err.message));
  $('#go').onclick = async () => {
    const h = $('#host').value.trim(); if (!h) return ($('#o').textContent = 'Masukkan nama domain.');
    $('#o').textContent = 'Mencari…';
    try { const r = await net.dns(h); $('#o').textContent = r.answers.length ? r.answers.map(a => `${a.data} (TTL ${a.ttl})`).join('\n') : `Tidak ada rekaman A (status ${r.status}).`; }
    catch (err) { $('#o').textContent = 'Gagal: ' + err.message; }
  };
}

function monitorPg(el) {
  const samples = [];
  el.innerHTML = `<h2>Monitor Koneksi</h2><div class="panel"><button class="btn" id="go">Mulai</button><button class="btn ghost" id="stop">Berhenti</button><div class="chart" id="bars"></div><pre id="o">Ping tiap 3 detik.</pre></div>`;
  const tick = async () => {
    try { samples.push((await net.ping(1)).avg); } catch { samples.push(null); }
    if (samples.length > 30) samples.shift();
    const mx = Math.max(100, ...samples.filter(Boolean));
    const b = $('#bars'); if (!b) return;
    b.innerHTML = spark(samples);
    const ok = samples.filter(Boolean); $('#o').textContent = `Terakhir: ${samples.at(-1) ? samples.at(-1).toFixed(0) + ' ms' : 'gagal'}\nRata-rata: ${ok.length ? (ok.reduce((a, c) => a + c) / ok.length).toFixed(0) : '—'} ms | Gagal: ${samples.length - ok.length}/${samples.length}`;
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
// Mode maintenance dari panel dev: tutup seluruh aplikasi sampai dimatikan lagi
const inRange = (s, e) => { const now = Date.now(); const st = s ? Date.parse(s) : NaN; const en = e ? Date.parse(e) : NaN; return !isNaN(st) && now >= st && (isNaN(en) || now < en); };
const maintActive = c => !!c.maintenance || inRange(c.maintenanceSchedule && c.maintenanceSchedule.start, c.maintenanceSchedule && c.maintenanceSchedule.end);
const annActive = c => !!c.announcement && (!c.announcementUntil || Date.now() < Date.parse(c.announcementUntil));
function setMaintenance(on, msg) {
  let el = $('#maint');
  if (!on) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'maint';
    el.className = 'maint-ov';
    el.setAttribute('role', 'alertdialog');
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="maint-card"><h2>Sedang Maintenance</h2><p>${esc(msg || 'Aplikasi sedang dalam perawatan. Silakan coba lagi beberapa saat lagi.')}</p></div>`;
}
// Cek jadwal tiap 30 detik, supaya maintenance terjadwal aktif tanpa menunggu config berubah
setInterval(() => setMaintenance(maintActive(cfg), cfg.maintenanceSchedule && cfg.maintenanceSchedule.message), 30000);

let lastCfg = '';
watchConfig(c => {
  const j = JSON.stringify(c);
  if (j === lastCfg) return;
  lastCfg = j; cfg = c;
  applyChrome();
  setMaintenance(maintActive(cfg), cfg.maintenanceSchedule && cfg.maintenanceSchedule.message);
  checkConfigUpdate(APP_VERSION, cfg.update);
  const p = location.hash.slice(1);
  if (onHome() || cfg.features[p] === false || p === 'more') refresh();
}, s => { if (s === server) return; server = s; if (onHome()) refresh(); });
window.addEventListener('hashchange', () => route());
route();
checkUpdate(APP_VERSION);
