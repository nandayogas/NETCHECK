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
import { REGISTRY, SLOT_STYLE } from './more.js';
import './locate.css';

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
  area.innerHTML = `<div class="lc-card lc-map-card" style="--i:0">
    <h3>Lokasi: ${esc(g.device_name)}</h3>
    <p class="lc-status-line" id="lc-status"><span class="lc-live ${st.online ? 'on' : ''}"></span>${esc(st.text)}</p>
    <p class="lc-meta" id="lc-acc">${esc(accText(g))}</p>
    <p class="lc-meta">Izin berlaku sampai ${esc(fmt(g.expires_at))}. Peta diperbarui tiap 15 detik.</p>
    <div class="lc-map-wrap"><div id="lc-map"></div></div>
    <button class="lc-btn block" id="lc-ring">Bunyikan HP ini</button>
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
  if (!auth || !auth.currentUser) { box.innerHTML = '<p class="lc-empty">Login dulu untuk memakai fitur ini.</p>'; return; }
  stopView();
  box.innerHTML = loadingHtml();
  try {
    await ensureDevice();
    const [{ devices }, { grants }] = await Promise.all([
      call('/api/locate/devices', null, 'GET'),
      call('/api/locate/mine', null, 'GET')
    ]);
    const others = (devices || []).filter(d => d.device_id !== deviceId);
    box.innerHTML = `
      <div class="lc-card" style="--i:0">
        <h3>Izin aktif</h3>
        ${(grants || []).length
          ? grants.map(g => `<div class="lc-item">
              <span class="lc-ph">${PHONE_ICON}</span>
              <div class="lc-info"><div class="lc-name">${esc(g.device_name)}</div>
                <div class="lc-meta lc-live ${statusOf(g).online ? 'on' : ''}">${esc(statusOf(g).text)}</div>
                <div class="lc-meta">berlaku sampai ${esc(fmt(g.expires_at))}</div></div>
              <div class="lc-actions"><button class="lc-btn lc-small" data-view="${esc(g.id)}">Lihat peta</button><button class="lc-btn ghost lc-small" data-revoke="${esc(g.id)}">Cabut izin</button></div></div>`).join('')
          : '<p class="lc-empty">Tidak ada izin aktif.</p>'}
      </div>
      <div id="lc-view"></div>
      <div class="lc-card" style="--i:1">
        <h3>HP yang dicari</h3>
        ${others.length
          ? `<div class="lc-field"><span>Durasi izin</span><select id="lc-hours" class="lc-select"><option value="1">1 jam</option><option value="6">6 jam</option><option value="24" selected>24 jam</option></select></div>`
            + others.map(d => `<div class="lc-item">
                <span class="lc-ph">${PHONE_ICON}</span>
                <div class="lc-info"><div class="lc-name">${esc(d.name || 'HP')}</div><div class="lc-meta">Siap dicari</div></div>
                <div class="lc-actions"><button class="lc-btn" data-grant="${esc(d.device_id)}">Izinkan</button></div></div>`).join('')
          : '<p class="lc-empty">Belum ada HP lain. HP itu harus pernah dibuka dan login ke akun ini.</p>'}
      </div>
      <p class="lc-note">Izin bisa dicabut kapan saja. Lokasi HP hanya bisa dilihat oleh Anda sebagai pemilik akun.</p>`;

    box.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openView(el, b.dataset.view));
    box.querySelectorAll('[data-grant]').forEach(b => b.onclick = async () => {
      const hours = Number((box.querySelector('#lc-hours') || {}).value) || 24;
      if (!confirm(`Izinkan lokasi HP ini dicari selama ${hours} jam? Hanya Anda sebagai pemilik akun yang bisa melihatnya.`)) return;
      try {
        await call('/api/locate/grant', { deviceId: b.dataset.grant, hours });
        await showSuccess(el, 'Izin diberikan', `Lokasi bisa dicari selama ${hours} jam`);
      } catch (e) { alert(e.message); }
      render(el);
    });
    box.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
      try { await call(`/api/locate/${b.dataset.revoke}/revoke`, {}); } catch (e) { alert(e.message); }
      render(el);
    });
  } catch (e) {
    box.innerHTML = `<p class="lc-empty">${esc(e.message)}</p>`;
  }
}

/* ---------- Tampilan (UI saja, tidak mengubah logika) ---------- */
const PHONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>';

function radarHtml(size) {
  return `<div class="lc-radar" style="${size ? `width:${size}px;height:${size}px` : ''}"><span class="lc-sweep"></span><span class="lc-pin"></span></div>`;
}

function loadingHtml() {
  return `<div class="lc-card lc-loading" style="--i:0">${radarHtml(96)}<p>Memuat<span class="lc-dots"></span></p></div>`;
}

// Animasi sukses singkat di atas kartu, lalu hilang. Tidak menahan logika lain lebih dari ~1,2 detik.
function showSuccess(el, title, sub) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'lc-success';
    ov.innerHTML = `<div class="lc-check"><svg viewBox="0 0 48 48"><path d="M13 25l8 8 14-16"/></svg></div><b>${esc(title)}</b><small>${esc(sub)}</small>`;
    document.body.appendChild(ov);
    setTimeout(() => ov.classList.add('out'), 900);
    setTimeout(() => { ov.remove(); resolve(); }, 1200);
  });
}

// Efek ripple saat tombol ditekan (delegasi, satu listener per halaman)
function attachRipple(root) {
  root.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('.lc-btn');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'lc-ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 650);
  });
}

function locatePg(el) {
  el.innerHTML = `<div class="lc-page">
    <h2 class="page-title">Cari HP saya</h2>
    <div class="lc-hero">
      <div class="lc-hero-txt">
        <span class="lc-kicker">Lokasi perangkat</span>
        <p>Temukan HP Anda yang hilang. Hanya Anda sebagai pemilik akun yang bisa melihat lokasinya.</p>
      </div>
      ${radarHtml()}
      <svg class="lc-phone" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" stroke-width="1" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>
    </div>
    <div id="lc"></div>
  </div>`;
  attachRipple(el.querySelector('.lc-page'));
  render(el);
}

REGISTRY[SLOT] = locatePg;

// Ikon slot: pin lokasi cyan di tengah dua lingkaran radar
SLOT_STYLE[SLOT] = {
  cls: 'locate-tile',
  icon: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="#00E5FF" stroke-width="1.2" opacity=".45"/>
    <circle cx="12" cy="12" r="5" stroke="#00E5FF" stroke-width="1.2" opacity=".7"/>
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" stroke="#00E5FF" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="2.4" fill="#00E5FF"/></svg>`
};

// Saat login berubah, daftarkan HP ini; pelacakan jalan saat izin aktif.
onUser(u => { if (u) { setupPush(); registerDevice(); } });
startTracking();
