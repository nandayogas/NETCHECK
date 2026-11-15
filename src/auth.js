// Login dan daftar pakai email + password (Firebase Authentication). Tanpa plugin native dan tanpa Google.
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  signOut as fbSignOut, setPersistence, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth } from './firebase.js';

let user = undefined; // undefined = masih memeriksa sesi, null = belum login
const subs = new Set();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const toUser = u => u && { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0] || 'Pengguna', email: u.email || '', photo: u.photoURL || '' };
export const currentUser = () => user || null;
export const onUser = fn => { subs.add(fn); fn(user); return () => subs.delete(fn); };
const emit = () => subs.forEach(f => f(user));

if (auth) {
  setPersistence(auth, indexedDBLocalPersistence).catch(() => setPersistence(auth, browserLocalPersistence).catch(() => {}));
  onAuthStateChanged(auth, u => { user = toUser(u); emit(); });
} else {
  user = null;
}

export async function loginEmail(email, password) {
  if (!auth) throw new Error('Firebase belum dikonfigurasi');
  await signInWithEmailAndPassword(auth, email, password);
}

export async function daftarEmail(nama, email, password) {
  if (!auth) throw new Error('Firebase belum dikonfigurasi');
  const c = await createUserWithEmailAndPassword(auth, email, password);
  if (nama) await updateProfile(c.user, { displayName: nama });
  user = toUser(auth.currentUser); // displayName baru tersimpan setelah update profil
  emit();
}

export async function logout() {
  if (auth) await fbSignOut(auth);
}

// Kartu akun untuk halaman Pengaturan
export function accountHtml() {
  const u = user;
  if (!u) return '';
  const pic = `<span class="avatar ph">${esc((u.name || '?')[0].toUpperCase())}</span>`;
  return `<h2>Akun</h2><div class="panel account">${pic}<div class="acc-txt"><b>${esc(u.name)}</b><small class="mute">${esc(u.email)}</small></div></div>
  <button class="btn ghost" data-logout>Keluar</button>`;
}
