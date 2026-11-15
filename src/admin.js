import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, configured } from './firebase.js';
import { API, apiConfigured, fetchConfig } from './api.js';
import { ICON_KEYS } from './ui.js';

const root = document.getElementById('admin');
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FEATS = {
  ping: 'Cek Ping', diag: 'Cek Jaringan', speed: 'Speed Test', ip: 'IP & DNS', monitor: 'Monitor', device: 'Perangkat',
  wifi: 'WiFi Analyzer (segera)', scan: 'Network Scanner (segera)', security: 'Security Check (segera)',
};

let S = null; // config yang sedang diedit; disimpan penuh saat tekan Simpan

// Header otorisasi berisi ID token Firebase; Worker memverifikasinya dan memeriksa tabel admins.
async function authHeaders(json = true) {
  const token = await auth.currentUser.getIdToken();
  const h = { authorization: 'Bearer ' + token };
  if (json) h['content-type'] = 'application/json';
  return h;
}

async function checkAdmin() {
  const r = await fetch(`${API}/api/me`, { headers: await authHeaders(), cache: 'no-store' });
  return r.ok && (await r.json()).admin === true;
}

async function saveConfig() {
  const r = await fetch(`${API}/api/config`, { method: 'PUT', headers: await authHeaders(), body: JSON.stringify(S) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`${API}/api/upload`, { method: 'POST', headers: await authHeaders(false), body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j.url;
}

function login(msg = '') {
  root.innerHTML = `<h1>NETCHECK Admin</h1><div class="panel"><input id="e" type="email" placeholder="Email"><input id="p" type="password" placeholder="Kata sandi"><button class="btn" id="go">Masuk</button><pre>${esc(msg)}</pre></div>`;
  $('go').onclick = async () => {
    try { await signInWithEmailAndPassword(auth, $('e').value, $('p').value); }
    catch (e) { login('Login gagal: ' + e.code); }
  };
}

// Salin nilai dari form ke S, supaya tidak hilang saat halaman digambar ulang
function collect() {
  if (!$('title')) return;
  S.title = $('title').value.trim() || 'NETCHECK';
  S.accent = $('accent').value;
  S.announcement = $('ann').value.trim();
  S.features = Object.fromEntries([...root.querySelectorAll('[data-f]')].map(x => [x.dataset.f, x.checked]));
  S.slots = [...root.querySelectorAll('[data-slot]')].map(p => ({
    id: S.slots[+p.dataset.slot].id,
    visible: p.querySelector('.v').checked,
    name: p.querySelector('.n').value,
    desc: p.querySelector('.d').value,
  }));
  S.tools = [...root.querySelectorAll('[data-tool]')].map(row => ({
    ...S.tools[+row.dataset.tool],
    enabled: row.querySelector('.tv').checked,
  }));
}

function render(msg = '') {
  root.innerHTML = `
  <h1>Pengaturan</h1>
  <div class="row-actions"><span></span><button class="btn ghost" id="out">Keluar</button></div>

  <h2>Tampilan & dashboard</h2>
  <div class="panel">
    <label>Judul dashboard</label><input id="title" value="${esc(S.title)}">
    <label>Warna aksen</label><input id="accent" type="color" value="${esc(S.accent)}">
    <label>Pengumuman (kosong = tidak tampil)</label><textarea id="ann" rows="3">${esc(S.announcement)}</textarea>
  </div>

  <h2>Tool bawaan</h2>
  <div class="panel">${Object.entries(FEATS).map(([k, v]) => `<label class="row"><span>${v}</span><input type="checkbox" data-f="${k}" ${S.features[k] !== false ? 'checked' : ''} style="width:auto"></label>`).join('')}</div>

  <h2>Tool tambahan</h2>
  <div class="panel">${S.tools.length ? S.tools.map((t, i) => `
    <div class="row" data-tool="${i}">
      <label class="tool-name"><input type="checkbox" class="tv" ${t.enabled !== false ? 'checked' : ''} style="width:auto"><span>${esc(t.name)}</span><small class="mute">${t.kind === 'url' ? 'tautan' : 'halaman HTML'}</small></label>
      <button class="btn ghost small-btn" data-del="${i}">Hapus</button>
    </div>`).join('') : '<p class="mute">Belum ada tool tambahan.</p>'}
  </div>

  <div class="panel">
    <h3>Tambah tool</h3>
    <input id="nt-name" placeholder="Nama tool">
    <select id="nt-icon">${ICON_KEYS.map(k => `<option value="${k}">${k}</option>`).join('')}</select>
    <select id="nt-kind"><option value="html">Upload file HTML</option><option value="url">Tautan (URL)</option></select>
    <div id="nt-html"><input id="nt-file" type="file" accept=".html,text/html"></div>
    <div id="nt-url" hidden><input id="nt-link" placeholder="https://..."></div>
    <button class="btn" id="nt-add">Tambah tool</button>
  </div>

  <h2>Slot Fitur Lainnya</h2>
  ${S.slots.map((s, i) => `<div class="panel" data-slot="${i}"><label class="row"><span>${esc(s.id)} tampil</span><input type="checkbox" class="v" ${s.visible ? 'checked' : ''} style="width:auto"></label>
  <input class="n" value="${esc(s.name)}" placeholder="Nama"><input class="d" value="${esc(s.desc)}" placeholder="Deskripsi"></div>`).join('')}

  <button class="btn" id="save">Simpan perubahan</button>
  <pre id="o">${esc(msg)}</pre>`;
  bind();
}

function bind() {
  $('out').onclick = () => signOut(auth);
  $('nt-kind').onchange = () => {
    const k = $('nt-kind').value;
    $('nt-html').hidden = k !== 'html';
    $('nt-url').hidden = k !== 'url';
  };
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    collect();
    S.tools.splice(+b.dataset.del, 1);
    render('Tool dihapus. Tekan Simpan perubahan untuk menerapkan.');
  });
  $('nt-add').onclick = addTool;
  $('save').onclick = async () => {
    collect();
    try { await saveConfig(); render('Tersimpan. Aplikasi pengguna diperbarui dalam ±1 menit.'); }
    catch (e) { render('Gagal menyimpan: ' + e.message); }
  };
}

async function addTool() {
  collect();
  const name = $('nt-name').value.trim();
  const icon = $('nt-icon').value;
  const kind = $('nt-kind').value;
  if (!name) return render('Isi nama tool dulu.');

  let url;
  try {
    if (kind === 'url') {
      url = $('nt-link').value.trim();
      if (!/^https:\/\//.test(url)) return render('Tautan harus diawali https://');
    } else {
      const f = $('nt-file').files[0];
      if (!f) return render('Pilih file HTML dulu.');
      $('o').textContent = 'Mengupload…';
      url = await uploadFile(f);
    }
  } catch (e) {
    return render('Gagal menambah tool: ' + e.message);
  }

  S.tools.push({ id: Date.now().toString(36), name, icon, kind, url, enabled: true });
  render('Tool ditambahkan. Tekan Simpan perubahan untuk menerapkan.');
}

async function editor() {
  try { S = await fetchConfig(); }
  catch (e) { root.innerHTML = `<h1>NETCHECK Admin</h1><div class="panel">Gagal memuat konfigurasi: ${esc(e.message)}</div>`; return; }
  S.tools = Array.isArray(S.tools) ? S.tools : [];
  render();
}

if (!configured) root.innerHTML = '<h1>NETCHECK Admin</h1><div class="panel">Isi konfigurasi Firebase di src/firebase.js terlebih dahulu.</div>';
else if (!apiConfigured) root.innerHTML = '<h1>NETCHECK Admin</h1><div class="panel">Isi URL Worker di src/api.js terlebih dahulu.</div>';
else onAuthStateChanged(auth, async u => {
  if (!u) return login();
  const ok = await checkAdmin().catch(() => false);
  if (ok) editor(); else { await signOut(auth); login('Akun ini bukan admin (UID belum terdaftar di tabel admins).'); }
});
