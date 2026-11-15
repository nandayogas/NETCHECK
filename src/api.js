// Klien untuk API Cloudflare Worker (netcheck-api). Tidak memakai Firebase sama sekali,
// jadi aplikasi pengguna tidak perlu SDK Firebase.

// Isi dengan URL Worker dari `wrangler deploy`, tanpa garis miring di akhir.
export const API = 'https://netcheck-api.nandayoga711.workers.dev';
export const apiConfigured = !API.includes('GANTI');

export const DEFAULTS = {
  title: 'NETCHECK',
  announcement: '',
  accent: '#087CFF',
  features: { ping: true, diag: true, speed: true, ip: true, monitor: true, device: true, wifi: true, scan: true, security: true },
  tools: [],
  titleRainbow: false,
  drawerBg: '',
  social: {},
  slots: Array.from({ length: 6 }, (_, i) => ({ id: 'slot' + (i + 1), visible: true, name: 'Fitur ' + (i + 1), desc: '' }))
};

const merge = d => ({ ...DEFAULTS, ...d, features: { ...DEFAULTS.features, ...(d && d.features) }, slots: (d && d.slots) || DEFAULTS.slots, social: { ...(d && d.social) } });

// Alamat gambar dari config: path relatif Worker (/...), https, atau data URL gambar. Selain itu ditolak.
export const assetUrl = u => {
  u = String(u || '');
  if (u.startsWith('/') && !u.startsWith('//')) return API + u;
  return /^(https:\/\/|data:image\/)/.test(u) ? u : '';
};

export async function fetchConfig() {
  const r = await fetch(`${API}/api/config`, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return merge(await r.json());
}

// state: 'server' | 'error' | 'unconfigured'
// Mengambil config saat mulai lalu tiap `every` ms. Mengembalikan fungsi untuk berhenti.
export function watchConfig(onConfig, onState, every = 60000) {
  if (!apiConfigured) { onState('unconfigured'); onConfig(DEFAULTS); return () => {}; }
  const load = async () => {
    try { const c = await fetchConfig(); onState('server'); onConfig(c); }
    catch { onState('error'); }
  };
  load();
  const id = setInterval(load, every);
  return () => clearInterval(id);
}
