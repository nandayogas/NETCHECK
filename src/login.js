// Gerbang login: menutupi aplikasi sampai pengguna login Google. Sesi tersimpan, jadi
// cukup login sekali selama sesi masih valid.
import './auth.css';
import { onUser, loginGoogle, logout } from './auth.js';

export function initGate() {
  const g = document.createElement('div');
  g.id = 'gate';
  g.className = 'gate';
  g.innerHTML = `<div class="gate-card">
    <div class="gate-logo">NETCHECK</div>
    <p class="mute">Login dengan akun Google untuk melanjutkan.</p>
    <button class="btn" id="gate-btn" disabled>Memeriksa login…</button>
    <small id="gate-err" class="mute"></small></div>`;
  document.body.appendChild(g);
  const btn = g.querySelector('#gate-btn');
  const err = g.querySelector('#gate-err');

  btn.onclick = async () => {
    btn.disabled = true; err.textContent = '';
    try { await loginGoogle(); }
    catch (e) {
      const msg = (e && (e.code || e.message)) || '';
      if (!/popup-closed|cancel|dibatalkan/i.test(msg)) err.textContent = 'Login gagal: ' + (e.message || msg);
    } finally { btn.disabled = false; }
  };

  onUser(u => {
    g.hidden = !!u;
    btn.textContent = u === undefined ? 'Memeriksa login…' : 'Login dengan Google';
    btn.disabled = u === undefined;
  });

  document.addEventListener('click', e => {
    if (e.target.closest('[data-logout]')) logout().catch(() => {});
  });
}
