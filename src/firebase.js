import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';

// Ganti dengan konfigurasi dari Firebase Console > Project settings > Web app.
const cfg = { apiKey: 'AIzaSyD5Mpd2HrRUH3VkJwhUKnYXD7XnyQDr4JI', authDomain: 'netcheck-3ce9c.firebaseapp.com', projectId: 'netcheck-3ce9c', appId: '1:837956250286:web:74ba915058471dd1cbdb3f' };
export const configured = !Object.values(cfg).some(v => String(v).startsWith('ISI'));

const app = configured ? initializeApp(cfg) : null;
export const auth = app && getAuth(app);
export const db = app && getFirestore(app);
export const configRef = db && doc(db, 'config', 'app');

export const DEFAULTS = {
  title: 'NETCHECK',
  announcement: '',
  accent: '#2f9bff',
  features: { ping: true, diag: true, speed: true, ip: true, monitor: true, device: true },
  slots: Array.from({ length: 6 }, (_, i) => ({ id: 'slot' + (i + 1), visible: true, name: 'Fitur ' + (i + 1), desc: '' }))
};

// state: 'server' | 'cache' | 'error' | 'unconfigured'
export function watchConfig(onConfig, onState) {
  if (!configured) { onState('unconfigured'); onConfig(DEFAULTS); return () => {}; }
  return onSnapshot(configRef, { includeMetadataChanges: true }, snap => {
    onState(snap.metadata.fromCache ? 'cache' : 'server');
    const d = snap.exists() ? snap.data() : {};
    onConfig({ ...DEFAULTS, ...d, features: { ...DEFAULTS.features, ...d.features } });
  }, () => onState('error'));
}
