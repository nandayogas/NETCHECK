// Versi tes: tanpa plugin login native. Login Google hanya lewat popup (browser).
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, GoogleAuthProvider,
  setPersistence, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth } from './firebase.js';

let user = undefined; // undefined = masih memeriksa sesi, null = belum login
const subs = new Set();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const toUser = u => u && { uid: u.uid, name: u.displayName || u.email || 'Pengguna', email: u.email || '', photo: u.photoURL || '' };
export const currentUser = () => user || null;
export const onUser = fn => { subs.add(fn); fn(user); return () => subs.delete(fn); };
const emit = () => subs.forEach(f => f(user));

if (auth) {
  setPersistence(auth, indexedDBLocalPersistence).catch(() => setPersistence(auth, browserLocalPersistence).catch(() => {}));
  onAuthStateChanged(auth, u => { user = toUser(u); emit(); });
} else {
  user = null;
}

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export async function loginGoogle() {
  if (!auth) throw new Error('Firebase belum dikonfigurasi');
  await signInWithPopup(auth, provider);
}

export async function logout() {
  if (auth) await fbSignOut(auth);
}

export function accountHtml() {
  const u = user;
  if (!u) return '';
  const pic = u.photo
    ? `<img class="avatar" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="avatar ph">${esc((u.name || '?')[0].toUpperCase())}</span>`;
  return `<h2>Akun</h2><div class="panel account">${pic}<div class="acc-txt"><b>${esc(u.name)}</b><small class="mute">${esc(u.email)}</small></div></div>
  <button class="btn ghost" data-logout>Keluar</button>`;
}
