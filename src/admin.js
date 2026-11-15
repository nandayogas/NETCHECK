import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, configured } from './firebase.js';
import { API, apiConfigured, fetchConfig } from './api.js';

const root = document.getElementById('admin');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FEATS = { ping: 'Cek Ping', diag: 'Cek Jaringan', speed: 'Speed Test', ip: 'IP & DNS', monitor: 'Monitor', device: 'Perangkat' };

// Header otorisasi berisi ID token Firebase; Worker memverifikasinya dan memeriksa tabel admins.
async function authHeaders() {
  const token = await auth.currentUser.getIdToken();
  return { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
}

async function checkAdmin() {
  const r = await fetch(`${API}/api/me`, { headers: await authHeaders(), cache: 'no-store' });
  return r.ok && (await r.json()).admin === true;
}

async function saveConfig(data) {
  const r = await fetch(`${API}/api/config`, { method: 'PUT', headers: await authHeaders(), body: JSON.stringify(data) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}

function login(msg = '') {
  root.innerHTML = `<h1>NETCHECK Admin</h1><div class="panel"><input id="e" type="email" placeholder="Email"><input id="p" type="password" placeholder="Kata sandi"><button class="btn" id="go">Masuk</button><pre>${esc(msg)}</pre></div>`;
  document.getElementById('go').onclick = async () => {
    try { await signInWithEmailAndPassword(auth, document.getElementById('e').value, document.getElementById('p').value); }
    catch (e) { login('Login gagal: ' + e.code); }
  };
}

async function editor() {
  let c;
  try { c = await fetchConfig(); }
  catch (e) { root.innerHTML = `<h1>NETCHECK Admin</h1><div class="panel">Gagal memuat konfigurasi: ${esc(e.message)}</div>`; return; }

  root.innerHTML = `<h1>Pengaturan</h1><button class="btn ghost" id="out">Keluar</button>
  <h2>Tampilan & dashboard</h2><div class="panel"><label>Judul dashboard</label><input id="title" value="${esc(c.title)}">
  <label>Warna aksen</label><input id="accent" type="color" value="${esc(c.accent)}"><label>Pengumuman (kosong = tidak tampil)</label><textarea id="ann" rows="3">${esc(c.announcement)}</textarea></div>
  <h2>Fitur aktif</h2><div class="panel">${Object.entries(FEATS).map(([k, v]) => `<label class="row"><span>${v}</span><input type="checkbox" data-f="${k}" ${c.features[k] !== false ? 'checked' : ''} style="width:auto"></label>`).join('')}</div>
  <h2>Slot Fitur Lainnya</h2>${c.slots.map((s, i) => `<div class="panel" data-i="${i}"><label class="row"><span>${esc(s.id)} tampil</span><input type="checkbox" class="v" ${s.visible ? 'checked' : ''} style="width:auto"></label>
  <input class="n" value="${esc(s.name)}" placeholder="Nama"><input class="d" value="${esc(s.desc)}" placeholder="Deskripsi"></div>`).join('')}
  <button class="btn" id="save">Simpan perubahan</button><pre id="o"></pre>`;
  document.getElementById('out').onclick = () => signOut(auth);
  document.getElementById('save').onclick = async () => {
    const $ = s => document.getElementById(s);
    const out = {
      title: $('title').value.trim() || 'NETCHECK', accent: $('accent').value, announcement: $('ann').value.trim(),
      features: Object.fromEntries([...root.querySelectorAll('[data-f]')].map(x => [x.dataset.f, x.checked])),
      slots: [...root.querySelectorAll('[data-i]')].map(p => ({ id: c.slots[+p.dataset.i].id, visible: p.querySelector('.v').checked, name: p.querySelector('.n').value, desc: p.querySelector('.d').value }))
    };
    try { await saveConfig(out); $('o').textContent = 'Tersimpan. Aplikasi pengguna diperbarui dalam ±1 menit.'; }
    catch (e) { $('o').textContent = 'Gagal menyimpan: ' + e.message; }
  };
}

if (!configured) root.innerHTML = '<h1>NETCHECK Admin</h1><div class="panel">Isi konfigurasi Firebase di src/firebase.js terlebih dahulu.</div>';
else if (!apiConfigured) root.innerHTML = '<h1>NETCHECK Admin</h1><div class="panel">Isi URL Worker di src/api.js terlebih dahulu.</div>';
else onAuthStateChanged(auth, async u => {
  if (!u) return login();
  const ok = await checkAdmin().catch(() => false);
  if (ok) editor(); else { await signOut(auth); login('Akun ini bukan admin (UID belum terdaftar di tabel admins).'); }
});
