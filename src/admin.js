import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, configured } from './firebase.js';
import { API, apiConfigured, fetchConfig, assetUrl } from './api.js';
import { I, ICON_KEYS, iconFor, SOCIALS, wordmarkInner } from './ui.js';
import { mountZipTools } from './admin-tools.js';

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

// Perkecil gambar dari galeri supaya ringan sebelum diupload
function compressImage(file, maxW = 720, maxH = 1440, q = 0.8) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(u);
      const k = Math.min(1, maxW / img.width, maxH / img.height);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => (b ? res(b) : rej(new Error('Gagal memproses gambar'))), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('File bukan gambar yang valid')); };
    img.src = u;
  });
}
const toDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Gagal membaca gambar')); r.readAsDataURL(blob); });
const canLoad = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = src; });

// Upload background menu. Coba lewat /api/upload dan pastikan gambarnya benar-benar tampil;
// kalau tidak bisa, simpan versi kecil langsung di config (tanpa mengubah Worker/database).
async function setDrawerBg(file) {
  collect();
  $('o').textContent = 'Memproses gambar…';
  try {
    let url = '';
    try {
      const u = await uploadFile(new File([await compressImage(file)], 'menu-bg.jpg', { type: 'image/jpeg' }));
      if (await canLoad(assetUrl(u))) url = u;
    } catch { /* lanjut ke cadangan */ }
    if (!url) {
      url = await toDataUrl(await compressImage(file, 480, 960, 0.6));
      if (url.length > 150000) throw new Error('Gambar terlalu besar, pilih gambar lain.');
    }
    S.drawerBg = url;
    render('Background menu diganti. Tekan Simpan perubahan untuk menerapkan.');
  } catch (e) { render('Gagal: ' + e.message); }
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
  S.titleRainbow = $('rb').checked;
  S.social = Object.fromEntries(Object.keys(SOCIALS).map(k => [k, $('soc-' + k).value.trim()]));
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
    <label class="row"><span>Efek pelangi pada judul</span><input type="checkbox" id="rb" ${S.titleRainbow ? 'checked' : ''} style="width:auto"></label>
    <div class="title-prev"><span class="wm${S.titleRainbow ? ' rainbow' : ''}" id="tprev">${wordmarkInner(S.title)}</span></div>
    <label>Warna aksen</label><input id="accent" type="color" value="${esc(S.accent)}">
    <label>Pengumuman (kosong = tidak tampil)</label><textarea id="ann" rows="3">${esc(S.announcement)}</textarea>
  </div>

  <h2>Background menu hamburger</h2>
  <div class="panel">
    <div class="bg-prev" id="bgprev" style="${assetUrl(S.drawerBg) ? `background-image:url('${esc(assetUrl(S.drawerBg))}')` : ''}">${assetUrl(S.drawerBg) ? '' : 'Belum ada background'}</div>
    <input id="bg-file" type="file" accept="image/*">
    <button class="btn ghost" id="bg-del" ${S.drawerBg ? '' : 'disabled'}>Hapus background</button>
  </div>

  <h2>Sosial media</h2>
  <div class="panel">${Object.entries(SOCIALS).map(([k, [n]]) => `<label>${esc(n)}</label><input id="soc-${k}" value="${esc((S.social || {})[k] || '')}" placeholder="username atau https://..." autocapitalize="none">`).join('')}
    <small class="mute">Tampil sebagai ikon di menu hamburger dan halaman Tentang. Kosong = tidak tampil.</small>
  </div>

  <h2>Tool bawaan</h2>
  <div class="panel">${Object.entries(FEATS).map(([k, v]) => `<label class="row"><span>${v}</span><input type="checkbox" data-f="${k}" ${S.features[k] !== false ? 'checked' : ''} style="width:auto"></label>`).join('')}</div>

  <h2>Tool tambahan</h2>
  <div class="panel">${S.tools.length ? S.tools.map((t, i) => `
    <div class="row" data-tool="${i}">
      <label class="tool-name"><input type="checkbox" class="tv" ${t.enabled !== false ? 'checked' : ''} style="width:auto"><span class="icon-prev" style="width:32px;height:32px;margin:0">${I[t.icon] || I.grid}</span><span>${esc(t.name)}</span><small class="mute">${t.kind === 'url' ? 'tautan' : 'halaman HTML'}</small></label>
      <button class="btn ghost small-btn" data-del="${i}">Hapus</button>
    </div>`).join('') : '<p class="mute">Belum ada tool tambahan.</p>'}
  </div>

  <div class="panel">
    <h3>Tambah tool</h3>
    <input id="nt-name" placeholder="Nama tool">
    <div class="icon-row"><span class="icon-prev" id="nt-prev">${I.grid}</span><select id="nt-icon">${ICON_KEYS.map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
    <small class="mute">Ikon dipilih otomatis dari judul. Anda tetap bisa menggantinya manual.</small>
    <select id="nt-kind"><option value="html">Upload file HTML</option><option value="url">Tautan (URL)</option></select>
    <div id="nt-html"><input id="nt-file" type="file" accept=".html,text/html"></div>
    <div id="nt-url" hidden><input id="nt-link" placeholder="https://..."></div>
    <button class="btn" id="nt-add">Tambah tool</button>
  </div>

  <h2>Tool dari ZIP</h2>
  <div id="zt-root"></div>

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

  // Judul: pratinjau langsung
  const prevTitle = () => { const w = $('tprev'); w.innerHTML = wordmarkInner($('title').value.trim() || 'NETCHECK'); w.classList.toggle('rainbow', $('rb').checked); };
  $('title').oninput = prevTitle; $('rb').onchange = prevTitle;

  // Background menu dari galeri
  $('bg-file').onchange = () => { const f = $('bg-file').files[0]; if (f) setDrawerBg(f); };
  $('bg-del').onclick = () => { collect(); S.drawerBg = ''; render('Background dihapus. Tekan Simpan perubahan untuk menerapkan.'); };

  // Ikon tool otomatis berganti saat mengetik judul (berhenti kalau ikon dipilih manual)
  let manual = false;
  const setIcon = k => { $('nt-icon').value = k; $('nt-prev').innerHTML = I[k] || I.grid; };
  $('nt-name').oninput = () => { if (!manual) setIcon(iconFor($('nt-name').value)); };
  $('nt-icon').onchange = () => { manual = true; setIcon($('nt-icon').value); };
  $('save').onclick = async () => {
    collect();
    try { await saveConfig(); render('Tersimpan. Aplikasi pengguna diperbarui dalam ±1 menit.'); }
    catch (e) { render('Gagal menyimpan: ' + e.message); }
  };
  mountZipTools($('zt-root'));
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
