import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, configRef, configured, DEFAULTS } from './firebase.js';

const root = document.getElementById('admin');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FEATS = { ping: 'Cek Ping', diag: 'Cek Jaringan', speed: 'Speed Test', ip: 'IP & DNS', monitor: 'Monitor', device: 'Perangkat' };

function login(msg = '') {
  root.innerHTML = `<h1>NETCHECK Admin</h1><div class="panel"><input id="e" type="email" placeholder="Email"><input id="p" type="password" placeholder="Kata sandi"><button class="btn" id="go">Masuk</button><pre>${esc(msg)}</pre></div>`;
  document.getElementById('go').onclick = async () => {
    try { await signInWithEmailAndPassword(auth, document.getElementById('e').value, document.getElementById('p').value); }
    catch (e) { login('Login gagal: ' + e.code); }
  };
}

async function editor() {
  const snap = await getDoc(configRef);
  const d = snap.exists() ? snap.data() : {};
  const c = { ...DEFAULTS, ...d, features: { ...DEFAULTS.features, ...d.features }, slots: d.slots || DEFAULTS.slots };
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
    try { await setDoc(configRef, out); $('o').textContent = 'Tersimpan. Aplikasi pengguna diperbarui otomatis.'; }
    catch (e) { $('o').textContent = 'Gagal menyimpan: ' + e.code; }
  };
}

if (!configured) root.innerHTML = '<h1>NETCHECK Admin</h1><div class="panel">Isi konfigurasi Firebase di src/firebase.js terlebih dahulu.</div>';
else onAuthStateChanged(auth, async u => {
  if (!u) return login();
  const a = await getDoc(doc(db, 'admins', u.uid)).catch(() => null);
  if (a && a.exists()) editor(); else { await signOut(auth); login('Akun ini bukan admin (dokumen admins/{uid} tidak ada).'); }
});
