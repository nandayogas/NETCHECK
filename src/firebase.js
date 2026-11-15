import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Hanya untuk login admin. Data config dan hasil cek lewat API Cloudflare (lihat api.js).
// Ganti dengan konfigurasi dari Firebase Console > Project settings > Web app.
const cfg = { apiKey: 'AIzaSyD5Mpd2HrRUH3VkJwhUKnYXD7XnyQDr4JI', authDomain: 'netcheck-3ce9c.firebaseapp.com', projectId: 'netcheck-3ce9c', appId: '1:837956250286:web:74ba915058471dd1cbdb3f' };
export const configured = !Object.values(cfg).some(v => String(v).startsWith('ISI'));

const app = configured ? initializeApp(cfg) : null;
export const auth = app && getAuth(app);
