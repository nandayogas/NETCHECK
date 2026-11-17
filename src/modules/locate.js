// Cari HP saya: pemilik akun (login di HP lain) bisa melihat lokasi HP-nya sendiri yang hilang selama waktu terbatas.
// Hanya pemilik akun yang bisa melihat lokasi. Developer tidak punya akses.
// Didaftarkan ke slot "Fitur Lainnya" (slot2). Lokasi dikirim saat aplikasi di HP yang dicari sedang terbuka.
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { API } from '../api.js';
import { auth } from '../firebase.js';
import { onUser } from '../auth.js';
import { REGISTRY } from './more.js';

const SLOT = 'slot2';
const PING_EVERY = 45000;     // kirim lokasi tiap 45 detik saat izin aktif
const VIEW_EVERY = 15000;     // perbarui marker di peta pemilik tiap 15 detik
const ONLINE_WITHIN = 120000; // dianggap online jika lokasi terbaru tidak lebih dari 2 menit
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

const NATIVE = Capacitor.isNativePlatform();

let deviceId = '', deviceName = '', fcmToken = '', pushReady = false, pingTimer = null;
let lastRingPlayed = 0;

/* ---------- Panggilan ke Worker (memakai token login Firebase) ---------- */
async function call(path, body, method = 'POST') {
  const u = auth && auth.currentUser;
  if (!u) throw new Error('Login dulu untuk memakai fitur ini.');
  const token = await u.getIdToken();
  const r = await fetch(API + path, {
    method, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}

/* ---------- Identitas HP ---------- */
async function ensureDevice() {
  if (deviceId) return;
  const id = await Device.getId();
  const info = await Device.getInfo();
  deviceId = id.identifier;
  deviceName = `${info.manufacturer || ''} ${info.model || ''}`.trim() || 'HP';
}

async function registerDevice() {
  if (!auth || !auth.currentUser) return;
  try {
    await ensureDevice();
    await call('/api/locate/device', { deviceId, name: deviceName, fcm: fcmToken });
  } catch {}
}

/* ---------- Notifikasi dan bunyi (perintah dari pemilik akun) ---------- */
async function setupPush() {
  if (!NATIVE || pushReady) return;
  try {
    const p = await PushNotifications.requestPermissions();
    if (p.receive !== 'granted') return;
    pushReady = true;
    await PushNotifications.createChannel({ id: 'locate', name: 'Cari HP', description: 'Perintah bunyi dari akun pemilik', importance: 5, sound: 'default', visibility: 1, vibration: true });
    PushNotifications.addListener('registration', t => { fcmToken = t.value; registerDevice(); });
    PushNotifications.addListener('pushNotificationReceived', n => { if ((n.data || {}).type === 'ring') ring(); });
    await PushNotifications.register();
  } catch {}
}

function ring() {
  const now = Date.now();
  if (now - lastRingPlayed < 10000) return;   // jangan berbunyi berulang dalam 10 detik
  lastRingPlayed = now;
  try { if (navigator.vibrate) navigator.vibrate([600, 300, 600, 300, 600]); } catch {}
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 12; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i % 2 ? 880 : 660;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.6, t0 + i * 0.5);
      o.start(t0 + i * 0.5); o.stop(t0 + i * 0.5 + 0.4);
    }
  } catch {}
}

/* ---------- Pengiriman lokasi dari HP yang dicari ---------- */
function banner(expiresAt) {
  let b = document.getElementById('locate-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'locate-banner';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#7a1f1f;color:#fff;font:600 13px system-ui,sans-serif;padding:8px 12px;text-align:center';
    document.body.appendChild(b);
  }
  b.textContent = `Lokasi HP ini sedang dicari atas permintaan pemilik akun, sampai ${fmt(expiresAt)}.`;
}
function hideBanner() {
  const b = document.getElementById('locate-banner');
  if (b) b.remove();
}

async function trackTick() {
  if (!auth || !auth.currentUser) return;
  try {
    await registerDevice();
    await ensureDevice();
    const { grants } = await call('/api/locate/mine', null, 'GET');
    const mine = (grants || []).find(g => g.device_id === deviceId);
    if (!mine) { hideBanner(); return; }

    banner(mine.expires_at);
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
    await call(`/api/locate/${mine.id}/ping`, {
      lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy
    });
  } catch {}
}

function startTracking() {
  if (pingTimer) return;
  trackTick();
  pingTimer = setInterval(trackTick, PING_EVERY);
}

/* ---------- Peta lokasi HP milik sendiri (pemilik) ---------- */
let leafletPromise = null;
let viewL = null, viewMap = null, viewMarker = null, viewCircle = null, viewTimer = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS;
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET_JS;
      js.onload = () => resolve(window.L);
      js.onerror = () => { leafletPromise = null; reject(new Error('Peta tidak bisa dimuat. Periksa koneksi internet.')); };
      document.head.appendChild(js);
    });
  }
  return leafletPromise;
}

function stopView() {
  if (viewTimer) { clearInterval(viewTimer); viewTimer = null; }
  if (viewMap) { viewMap.remove(); viewMap = null; }
  viewMarker = null; viewCircle = null; viewL = null;
}

// Status dihitung dari waktu pembaruan terakhir. Baterai tidak dikirim server, jadi tidak ditampilkan.
function statusOf(g) {
  if (!g.updated_at) return { online: false, text: 'Belum ada lokasi yang terkirim' };
  const online = Date.now() - g.updated_at < ONLINE_WITHIN;
  return { online, text: `${online ? 'Online' : 'Offline (lokasi terakhir)'} · diperbarui ${fmt(g.updated_at)}` };
}

function accText(g) {
  return g.acc ? `Akurasi GPS ±${Math.round(g.acc)} m` : 'Akurasi GPS belum tersedia';
}

function placeMarker(g) {
  if (!viewMap || !viewL || g.lat == null || g.lng == null) return;
  const ll = [g.lat, g.lng];
  if (!viewMarker) {
    viewCircle = viewL.circle(ll, { radius: g.acc || 0, color: '#38BDF8', weight: 1, fillOpacity: 0.12 }).addTo(viewMap);
    viewMarker = viewL.circleMarker(ll, { radius: 9, color: '#fff', weight: 2, fillColor: '#EF4444', fillOpacity: 1 }).addTo(viewMap);
    viewMap.setView(ll, 16);
  } else {
    viewMarker.setLatLng(ll);
    viewCircle.setLatLng(ll).setRadius(g.acc || 0);
    viewMap.panTo(ll);
  }
}

// Ambil data terbaru dari /api/locate/mine (hanya izin milik akun ini) lalu perbarui peta.
async function refreshView(el, grantId) {
  if (!document.getElementById('lc-map')) { stopView(); return; }
  try {
    const { grants } = await call('/api/locate/mine', null, 'GET');
    const g = (grants || []).find(x => x.id === grantId);
    const area = el.querySelector('#lc-view');
    if (!g) {
      stopView();
      if (area) area.innerHTML = '<p class="mute">Izin ini sudah berakhir atau dicabut.</p>';
      return;
    }
    const st = statusOf(g);
    const s = document.getElementById('lc-status'); if (s) s.textContent = st.text;
    const a = document.getElementById('lc-acc'); if (a) a.textContent = accText(g);
    placeMarker(g);
  } catch {}
}

async function openView(el, grantId) {
  stopView();
  const area = el.querySelector('#lc-view');
  if (!area) return;
  let g;
  try {
    const { grants } = await call('/api/locate/mine', null, 'GET');
    g = (grants || []).find(x => x.id === grantId);
  } catch (e) { area.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  if (!g) { area.innerHTML = '<p class="mute">Izin ini sudah berakhir atau dicabut.</p>'; return; }

  const st = statusOf(g);
  area.innerHTML = `<div class="panel">
    <h3>Lokasi: ${esc(g.device_name)}</h3>
    <p class="mute" id="lc-status">${esc(st.text)}</p>
    <p class="mute" id="lc-acc">${esc(accText(g))}</p>
    <p class="mute">Izin berlaku sampai ${esc(fmt(g.expires_at))}. Peta diperbarui tiap 15 detik.</p>
    <div id="lc-map" style="height:320px;border-radius:12px;overflow:hidden"></div>
    <button class="btn" id="lc-ring" style="margin-top:10px">Bunyikan HP ini</button>
  </div>`;

  const ringBtn = document.getElementById('lc-ring');
  if (ringBtn) ringBtn.onclick = async () => {
    ringBtn.disabled = true;
    try { await call(`/api/locate/${grantId}/ring`, {}); alert('Perintah bunyi dikirim.'); }
    catch (e) { alert(e.message); }
    setTimeout(() => { ringBtn.disabled = false; }, 10000);
  };

  try {
    const L = await loadLeaflet();
    const mapEl = document.getElementById('lc-map');
    if (!mapEl) return;
    viewL = L;
    viewMap = L.map(mapEl).setView([-6.2, 106.8], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(viewMap);
    placeMarker(g);
    viewTimer = setInterval(() => refreshView(el, grantId), VIEW_EVERY);
  } catch (e) {
    area.insertAdjacentHTML('beforeend', `<p class="mute">${esc(e.message)}</p>`);
  }
}

/* ---------- Layar Cari HP saya (pemilik) ---------- */
async function render(el) {
  const box = el.querySelector('#lc');
  if (!auth || !auth.currentUser) { box.innerHTML = '<p>Login dulu untuk memakai fitur ini.</p>'; return; }
  stopView();
  try {
    await ensureDevice();
    const [{ devices }, { grants }] = await Promise.all([
      call('/api/locate/devices', null, 'GET'),
      call('/api/locate/mine', null, 'GET')
    ]);
    const others = (devices || []).filter(d => d.device_id !== deviceId);
    box.innerHTML = `
      <h3>Izin aktif</h3>
      ${(grants || []).length
        ? grants.map(g => `<div class="row"><span>${esc(g.device_name)}<br><small class="mute">${esc(statusOf(g).text)}<br>berlaku sampai ${esc(fmt(g.expires_at))}</small></span>
            <span><button class="btn" data-view="${esc(g.id)}">Lihat peta</button> <button class="btn ghost" data-revoke="${esc(g.id)}">Cabut izin</button></span></div>`).join('')
        : '<p class="mute">Tidak ada izin aktif.</p>'}
      <div id="lc-view"></div>
      <h3>HP yang dicari</h3>
      ${others.length
        ? `<label class="mute">Durasi izin <select id="lc-hours"><option value="1">1 jam</option><option value="6">6 jam</option><option value="24" selected>24 jam</option></select></label>`
          + others.map(d => `<div class="row"><span>${esc(d.name || 'HP')}</span><button class="btn" data-grant="${esc(d.device_id)}">Izinkan</button></div>`).join('')
        : '<p class="mute">Belum ada HP lain. HP itu harus pernah dibuka dan login ke akun ini.</p>'}
      <p class="mute">Izin bisa dicabut kapan saja. Lokasi HP hanya bisa dilihat oleh Anda sebagai pemilik akun.</p>`;

    box.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openView(el, b.dataset.view));
    box.querySelectorAll('[data-grant]').forEach(b => b.onclick = async () => {
      const hours = Number((box.querySelector('#lc-hours') || {}).value) || 24;
      if (!confirm(`Izinkan lokasi HP ini dicari selama ${hours} jam? Hanya Anda sebagai pemilik akun yang bisa melihatnya.`)) return;
      try { await call('/api/locate/grant', { deviceId: b.dataset.grant, hours }); } catch (e) { alert(e.message); }
      render(el);
    });
    box.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
      try { await call(`/api/locate/${b.dataset.revoke}/revoke`, {}); } catch (e) { alert(e.message); }
      render(el);
    });
  } catch (e) {
    box.innerHTML = `<p>${esc(e.message)}</p>`;
  }
}

function locatePg(el) {
  el.innerHTML = `<h2 class="page-title">Cari HP saya</h2><div class="panel" id="lc"><p class="mute">Memuat...</p></div>`;
  render(el);
}

REGISTRY[SLOT] = locatePg;

// Saat login berubah, daftarkan HP ini; pelacakan jalan saat izin aktif.
onUser(u => { if (u) { setupPush(); registerDevice(); } });
startTracking();
