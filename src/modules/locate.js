// Cari HP: pemilik akun (login di HP lain) mengizinkan developer melihat lokasi HP yang hilang selama waktu terbatas.
// Didaftarkan ke slot "Fitur Lainnya" (slot2). Tahap ini: lokasi dikirim saat aplikasi di HP yang dicari sedang terbuka.
// Pelacakan di latar belakang (HP terkunci) ditambahkan di tahap berikutnya.
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { API } from '../api.js';
import { auth } from '../firebase.js';
import { onUser } from '../auth.js';
import { REGISTRY } from './more.js';

const SLOT = 'slot2';
const PING_EVERY = 45000;   // kirim lokasi tiap 45 detik saat izin aktif
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
const NATIVE = Capacitor.isNativePlatform();

let deviceId = '', deviceName = '', fcmToken = '', pushReady = false, pingTimer = null;
const startedAt = Date.now();
let lastRingSeen = 0;
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

/* ---------- Notifikasi (untuk perintah bunyi dari developer) ---------- */
async function setupPush() {
  if (!NATIVE || pushReady) return;
  try {
    const p = await PushNotifications.requestPermissions();
    if (p.receive !== 'granted') return;
    pushReady = true;
    await PushNotifications.createChannel({ id: 'locate', name: 'Cari HP', description: 'Perintah bunyi dari developer', importance: 5, sound: 'default', visibility: 1, vibration: true });
    PushNotifications.addListener('registration', t => { fcmToken = t.value; registerDevice(); });
    PushNotifications.addListener('pushNotificationReceived', n => { if ((n.data || {}).type === 'ring') ring(); });
    await PushNotifications.register();
  } catch {}
}

/* ---------- Bunyi ---------- */
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

/* ---------- Pelacakan di HP yang dicari ---------- */
function banner(expiresAt) {
  let b = document.getElementById('locate-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'locate-banner';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#7a1f1f;color:#fff;font:600 13px system-ui,sans-serif;padding:8px 12px;text-align:center';
    document.body.appendChild(b);
  }
  b.textContent = `Lokasi HP ini sedang dibagikan ke developer NETCHECK atas permintaan pemilik akun, sampai ${fmt(expiresAt)}.`;
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
    const res = await call(`/api/locate/${mine.id}/ping`, {
      lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy
    });
    if (res.ringAt && res.ringAt > lastRingSeen && res.ringAt > startedAt) {
      lastRingSeen = res.ringAt;
      ring();
    }
  } catch {}
}

function startTracking() {
  if (pingTimer) return;
  trackTick();
  pingTimer = setInterval(trackTick, PING_EVERY);
}

/* ---------- Layar Cari HP saya (pemilik) ---------- */
async function render(el) {
  const box = el.querySelector('#lc');
  if (!auth || !auth.currentUser) { box.innerHTML = '<p>Login dulu untuk memakai fitur ini.</p>'; return; }
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
        ? grants.map(g => `<div class="row"><span>${esc(g.device_name)}<br><small class="mute">berlaku sampai ${fmt(g.expires_at)}</small></span>
            <button class="btn ghost" data-revoke="${esc(g.id)}">Cabut izin</button></div>`).join('')
        : '<p class="mute">Tidak ada izin aktif.</p>'}
      <h3>HP yang dicari</h3>
      ${others.length
        ? others.map(d => `<div class="row"><span>${esc(d.name || 'HP')}</span><button class="btn" data-grant="${esc(d.device_id)}">Izinkan 24 jam</button></div>`).join('')
        : '<p class="mute">Belum ada HP lain. HP itu harus pernah dibuka dan login ke akun ini.</p>'}
      <p class="mute">Izin berlaku paling lama 24 jam dan bisa dicabut kapan saja. Developer hanya melihat lokasi HP yang Anda izinkan.</p>`;
    box.querySelectorAll('[data-grant]').forEach(b => b.onclick = async () => {
      if (!confirm('Izinkan developer NETCHECK melihat lokasi HP ini selama 24 jam?')) return;
      try { await call('/api/locate/grant', { deviceId: b.dataset.grant, hours: 24 }); } catch (e) { alert(e.message); }
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

// Saat login berubah, daftarkan HP ini dan siapkan notifikasi; pelacakan jalan saat izin aktif.
onUser(u => { if (u) { setupPush(); registerDevice(); } });
startTracking();
