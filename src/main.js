import { Network } from '@capacitor/network';
import { Device } from '@capacitor/device';
import { watchConfig, DEFAULTS } from './firebase.js';
import * as net from './modules/net.js';
import { renderMore } from './modules/more.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
let cfg = DEFAULTS, server = 'unconfigured', netStatus = { connected: navigator.onLine, connectionType: 'unknown' };
let m = { ping: null, down: null, up: null }; // hanya hasil pengukuran nyata
let timer = null;
let ip = { v: null, t: 0 };

const TOOLS = [
  ['ping', 'Cek Ping', 'Ukur latensi'], ['diag', 'Cek Jaringan', 'Diagnostik koneksi'],
  ['speed', 'Speed Test', 'Tes kecepatan'], ['ip', 'IP & DNS', 'Informasi IP dan DNS'],
  ['monitor', 'Monitor', 'Pantau koneksi'], ['device', 'Perangkat', 'Informasi perangkat']
];
const SERVER_TXT = { server: ['Server terhubung', 'ok'], cache: ['Server tidak terjangkau (data cache)', 'bad'], error: ['Server error / izin ditolak', 'bad'], unconfigured: ['Firebase belum dikonfigurasi', 'bad'] };
const TYPE = { wifi: 'WiFi', cellular: 'Data seluler', none: 'Tidak terhubung', unknown: 'Tidak diketahui' };

const page = (body, back = true) => (back ? `<button class="btn ghost" id="back">Kembali</button>` : '') + `<section class="view">${body}</section>`;
const view = () => document.getElementById('v');

async function route(animate = true) {
  clearInterval(timer);
  const p = location.hash.slice(1) || 'home';
  if (p !== 'home' && TOOLS.some(t => t[0] === p) && cfg.features[p] === false) return (location.hash = '');
  document.documentElement.style.setProperty('--accent', cfg.accent || '#2f9bff');
  const R = { home, ping: pingPg, diag: diagPg, speed: speedPg, ip: ipPg, monitor: monitorPg, device: devicePg, more: morePg }[p] || home;
  app.innerHTML = page('<div id="v"></div>', p !== 'home');
  if (animate === false) app.querySelector('.view').style.animation = 'none';
  const b = $('#back'); if (b) b.onclick = () => (location.hash = '');
  R(view());
}

function home(el) {
  const [st, cls] = SERVER_TXT[server];
  const tools = TOOLS.filter(t => cfg.features[t[0]] !== false);
  el.innerHTML = `<h1>${esc(cfg.title)}</h1>
  ${cfg.announcement ? `<div class="notice">${esc(cfg.announcement)}</div>` : ''}
  <div class="panel"><span class="badge ${netStatus.connected ? 'ok' : 'bad'}">${netStatus.connected ? 'Terhubung' : 'Offline'}</span>
    <div class="big">${netStatus.connected ? 'ONLINE' : 'OFFLINE'}</div>
    <div class="mute">${TYPE[netStatus.connectionType] || netStatus.connectionType}</div>
    <div class="stats"><div><span>Ping</span><strong>${m.ping == null ? '—' : m.ping.toFixed(0) + ' ms'}</strong></div>
    <div><span>Download</span><strong>${m.down == null ? '—' : m.down.toFixed(1) + ' Mbps'}</strong></div>
    <div><span>Upload</span><strong>${m.up == null ? '—' : m.up.toFixed(1) + ' Mbps'}</strong></div></div>
    <p><button class="btn" id="measure">Ukur sekarang</button></p>
    <span class="badge ${cls}">${st}</span><div id="ipline" class="mute" style="margin-top:8px;min-height:1.4em">${ip.v ? 'IP publik: ' + esc(ip.v) : ''}</div></div>
  <h2>Tools jaringan</h2><div class="grid">${tools.map(t => `<button class="tile" data-go="${t[0]}"><b>${t[1]}</b><small>${t[2]}</small></button>`).join('')}
  <button class="tile" data-go="more"><b>Fitur Lainnya</b><small>Slot pengembangan</small></button></div>`;
  el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => (location.hash = b.dataset.go));
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

function setOffline() { $('#offline').hidden = netStatus.connected; }
const onHome = () => !location.hash || location.hash === '#home';
let pending = false;
const refresh = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; route(false); }, 200); };
Network.getStatus().then(s => { netStatus = s; setOffline(); });
Network.addListener('networkStatusChange', s => {
  const changed = s.connected !== netStatus.connected || s.connectionType !== netStatus.connectionType;
  netStatus = s; setOffline();
  if (changed && onHome()) refresh();
});
let lastCfg = '';
watchConfig(c => {
  const j = JSON.stringify(c);
  if (j === lastCfg) return;
  lastCfg = j; cfg = c;
  const p = location.hash.slice(1);
  if (onHome() || cfg.features[p] === false || p === 'more') refresh();
}, s => { if (s === server) return; server = s; if (onHome()) refresh(); });
window.addEventListener('hashchange', () => route());
route();
