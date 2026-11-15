// Gerbang login: email + password. Pengguna baru bisa daftar dari layar yang sama.
import './auth.css';
import { onUser, loginEmail, daftarEmail, logout } from './auth.js';

const PESAN = {
  'auth/invalid-credential': 'Email atau password salah.',
  'auth/invalid-login-credentials': 'Email atau password salah.',
  'auth/user-not-found': 'Email atau password salah.',
  'auth/wrong-password': 'Email atau password salah.',
  'auth/email-already-in-use': 'Email ini sudah terdaftar. Silakan masuk.',
  'auth/weak-password': 'Password minimal 6 karakter.',
  'auth/invalid-email': 'Format email tidak valid.',
  'auth/network-request-failed': 'Tidak ada koneksi internet.',
  'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
};

export function initGate() {
  let mode = 'masuk'; // 'masuk' | 'daftar'
  const g = document.createElement('div');
  g.id = 'gate';
  g.className = 'gate';
  g.innerHTML = `<div class="gate-card">
    <div class="gate-logo">NETCHECK</div>
    <p class="mute" id="gate-sub"></p>
    <div id="gate-nama-wrap" hidden><input id="gate-nama" placeholder="Nama" autocomplete="name" maxlength="40"></div>
    <input id="gate-email" type="email" placeholder="Email" autocomplete="email" autocapitalize="none">
    <input id="gate-pass" type="password" placeholder="Password (min. 6 karakter)" autocomplete="current-password">
    <button class="btn" id="gate-btn" disabled>Memeriksa login…</button>
    <button class="link" id="gate-toggle"></button>
    <small id="gate-err" class="mute"></small></div>`;
  document.body.appendChild(g);

  const $ = id => g.querySelector('#' + id);
  const btn = $('gate-btn'), err = $('gate-err');

  const render = () => {
    const daftar = mode === 'daftar';
    $('gate-sub').textContent = daftar ? 'Buat akun baru untuk memakai NETCHECK.' : 'Masuk dengan email dan password Anda.';
    $('gate-nama-wrap').hidden = !daftar;
    $('gate-pass').autocomplete = daftar ? 'new-password' : 'current-password';
    btn.textContent = daftar ? 'Daftar' : 'Masuk';
    $('gate-toggle').textContent = daftar ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar';
    err.textContent = '';
  };
  render();

  $('gate-toggle').onclick = () => { mode = mode === 'daftar' ? 'masuk' : 'daftar'; render(); };

  btn.onclick = async () => {
    const email = $('gate-email').value.trim();
    const pass = $('gate-pass').value;
    const nama = $('gate-nama').value.trim();
    err.textContent = '';
    if (!email || !pass) { err.textContent = 'Email dan password wajib diisi.'; return; }
    if (mode === 'daftar' && !nama) { err.textContent = 'Nama wajib diisi.'; return; }
    btn.disabled = true;
    try {
      if (mode === 'daftar') await daftarEmail(nama, email, pass);
      else await loginEmail(email, pass);
      $('gate-pass').value = '';
    } catch (e) {
      const code = (e && e.code) || '';
      err.textContent = PESAN[code] || ('Gagal: ' + ((e && e.message) || code));
    } finally { btn.disabled = false; }
  };

  onUser(u => {
    g.hidden = !!u;
    if (u === undefined) { btn.textContent = 'Memeriksa login…'; btn.disabled = true; }
    else if (!u) { render(); btn.disabled = false; }
  });

  document.addEventListener('click', e => {
    if (e.target.closest('[data-logout]')) logout().catch(() => {});
  });
}
