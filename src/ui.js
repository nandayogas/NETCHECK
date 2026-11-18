// Komponen UI NETCHECK: ikon, logo, header, drawer, bottom nav, dan kartu tool.
// Hanya presentasi. Logika pengukuran ada di main.js dan modules/.

const svg = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const I = {
  menu: svg('<path d="M4 7h16M4 12h10M4 17h16"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  x: svg('<path d="M7 7l10 10M17 7L7 17"/>'),
  signal: svg('<path d="M4 19v-3M9 19v-7M14 19v-11M19 19V5"/>'),
  home: svg('<path d="M3 11l9-7 9 7v8a1 1 0 0 1-1 1h-5v-5h-6v5H4a1 1 0 0 1-1-1z"/>'),
  grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  wifi: svg('<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.5a9.5 9.5 0 0 1 13 0"/><path d="M8.7 16a5 5 0 0 1 6.6 0"/><circle cx="12" cy="19.3" r="1.1"/>'),
  speed: svg('<path d="M3.5 16a8.5 8.5 0 1 1 17 0"/><path d="M12 16l3.5-4"/>'),
  ip: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.3 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.3-3.5-8.5s1-6 3.5-8.5z"/>'),
  scan: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 12l5.5-3.5"/>'),
  shield: svg('<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.3"/>'),
  pulse: svg('<path d="M2 12h4.5l2.5-6 5 12 2.5-6H22"/>'),
  device: svg('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.5"/><path d="M11 18h2"/>'),
  monitor: svg('<path d="M3 17l5.5-5.5 4 4L21 7"/><path d="M15.5 7H21v5.5"/>'),
  diag: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.6 2.6L16 9.5"/>'),
  chat: svg('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z"/>'),
  mail: svg('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>'),
  cloud: svg('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5 3.75 3.75 0 0 1 17.5 18z"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  play: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>'),
  music: svg('<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>'),
  game: svg('<rect x="3" y="8" width="18" height="10" rx="4"/><path d="M8 11v4M6 13h4M16 12v.1M18 14v.1"/>'),
  camera: svg('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  cart: svg('<path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/>'),
  bolt: svg('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'),
  download: svg('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>'),
  server: svg('<rect x="4" y="4" width="16" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="16" height="6.5" rx="1.8"/><path d="M8 7.2v.1M8 16.8v.1"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  book: svg('<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>'),
  user: svg('<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8L3.5 9.7l5.9-.9z"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>'),
};

// Ikon sosial media (gaya garis yang sama)
const SOC_ICON = {
  instagram: svg('<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><path d="M16.8 7.2v.1"/>'),
  tiktok: svg('<path d="M14 4v10.2a3.7 3.7 0 1 1-3.7-3.7"/><path d="M14 4c.3 2.3 1.9 3.9 4.3 4.1"/>'),
  youtube: svg('<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="M10.2 9.6v4.8l4-2.4z"/>'),
  facebook: svg('<path d="M14 21v-8h2.6l.4-3H14V8.4c0-.9.3-1.4 1.5-1.4H17V4.2C16.7 4.1 15.9 4 15 4c-2.2 0-3.7 1.3-3.7 3.7V10H9v3h2.3v8z"/>'),
  x: svg('<path d="M5 4.5l14 15M19 4.5l-14 15"/>'),
  telegram: svg('<path d="M21 4L3 11l6 2.2L11 20l3.2-4.3L18.5 19z"/><path d="M9 13.2L21 4"/>'),
  whatsapp: svg('<path d="M4 20l1.3-4.2A8 8 0 1 1 8.3 18.8z"/><path d="M9.2 8.5c.2 2.8 2.5 5.1 5.4 5.5l1.2-1.4-2-1-.9.7a4 4 0 0 1-1.7-1.7l.7-.9-1-2z"/>'),
  website: I.ip,
};

// [nama, awalan URL bila pengguna hanya mengetik username/nomor]
export const SOCIALS = {
  instagram: ['Instagram', 'https://instagram.com/'],
  tiktok: ['TikTok', 'https://tiktok.com/@'],
  youtube: ['YouTube', ''],
  facebook: ['Facebook', ''],
  x: ['X (Twitter)', 'https://x.com/'],
  telegram: ['Telegram', 'https://t.me/'],
  whatsapp: ['WhatsApp (nomor, mis. 62812...)', 'https://wa.me/'],
  website: ['Website', ''],
};

export function socialUrl(k, v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/^https:\/\//i.test(v)) return v;
  const pre = SOCIALS[k] && SOCIALS[k][1];
  if (!pre) return '';
  const id = k === 'whatsapp' ? v.replace(/\D/g, '') : v.replace(/^@/, '').replace(/[^\w.\-]/g, '');
  return id ? pre + id : '';
}

export function socialHtml(social) {
  return Object.keys(SOCIALS).map(k => {
    const u = socialUrl(k, social && social[k]);
    return u ? `<a class="soc" href="${escHtml(u)}" target="_blank" rel="noopener noreferrer" aria-label="${escHtml(SOCIALS[k][0])}">${SOC_ICON[k]}</a>` : '';
  }).join('');
}

// Tebak ikon dari judul tool (kata kunci Indonesia/Inggris). Urutan = prioritas.
const ICON_RULES = [
  ['wifi', /wi-?fi|hotspot|sinyal|signal|router|modem/],
  ['game', /game|gim|esport|mobile legend|\bml\b|\bff\b|pubg|valorant/],
  ['speed', /speed|kecepatan|cepat|bandwidth|turbo|boost/],
  ['pulse', /ping|latensi|latency/],
  ['ip', /\bip\b|dns|domain|web|situs|internet|vpn|proxy|global/],
  ['monitor', /monitor|grafik|chart|statistik|trafik|traffic|analitik|analytics|laporan/],
  ['device', /\bhp\b|ponsel|phone|perangkat|device|android|ios|gadget/],
  ['scan', /scan|radar|deteksi|pindai/],
  ['shield', /aman|security|keamanan|firewall|proteksi|virus|privasi|privacy/],
  ['lock', /kunci|lock|sandi|password|login|enkripsi/],
  ['chat', /chat|pesan|\bwa\b|whatsapp|telegram|sms|komentar|forum|support|bantuan|kontak|\bcs\b/],
  ['mail', /mail|surat/],
  ['cloud', /cloud|awan|cuaca|weather|backup|storage|penyimpanan/],
  ['play', /video|youtube|\btv\b|film|movie|stream|live|tonton/],
  ['music', /musik|music|lagu|radio|audio|spotify/],
  ['camera', /foto|kamera|camera|gambar|galeri|cctv/],
  ['cart', /toko|shop|belanja|beli|store|jual|voucher|paket|promo|harga|produk/],
  ['bolt', /listrik|power|energi|token|pulsa|kuota/],
  ['download', /download|unduh|unggah|upload|file|apk/],
  ['server', /server|hosting|vps|database|basis data/],
  ['search', /cari|search|temukan|lookup|whois/],
  ['info', /info|tentang|about|faq/],
  ['book', /panduan|tutorial|belajar|artikel|berita|news|blog|buku/],
  ['user', /akun|user|profil|profile|member|pelanggan|pengguna/],
  ['star', /favorit|bintang|rating|premium|vip|bonus|hadiah/],
  ['link', /link|tautan|url/],
  ['clock', /jam|waktu|riwayat|history|jadwal|timer|tanggal/],
  ['diag', /cek|check|tes|test|diagnos|status|periksa/],
];
export const iconFor = name => {
  const n = String(name || '').toLowerCase();
  const hit = ICON_RULES.find(([, re]) => re.test(n));
  return hit ? hit[0] : 'grid';
};

// Logo NETCHECK: dua garis diagonal sebagai tanda, wordmark di sebelahnya
export const logo = (size = 32) => `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
  <path d="M7 31L15 9l6 13 12-13" fill="none" stroke="#087CFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M21 22l12-13" fill="none" stroke="#00BFFF" stroke-width="4.5" stroke-linecap="round"/>
</svg>`;

// Judul dari admin; 'NETCHECK' tetap tampil dua warna seperti semula
export const wordmarkInner = t => (!t || t === 'NETCHECK') ? 'NET<b>CHECK</b>' : escHtml(t);
const wordmark = () => `<span class="wm">${wordmarkInner('NETCHECK')}</span>`;

// Semua tool. Kunci = nama route (atau nama fitur di panel admin untuk fitur yang ada).
export const TOOL_DEFS = {
  ping: { name: 'Ping Test', icon: I.pulse },
  ndaxtrade: { name: 'NdaxTrade', icon: I.signal },
  diag: { name: 'Cek Jaringan', icon: I.diag },
  speed: { name: 'Speed Test', icon: I.speed },
  ip: { name: 'IP Checker', icon: I.ip },
  monitor: { name: 'Monitor', icon: I.monitor },
  device: { name: 'Perangkat', icon: I.device },
  wifi: { name: 'WiFi Analyzer', icon: I.wifi },
  scan: { name: 'Network Scanner', icon: I.scan },
  security: { name: 'Security Check', icon: I.shield },
  ai: { name: 'AI Assistant', icon: I.chat },
};

export const DRAWER_ITEMS = [
  ['home', 'Beranda', I.home],
  ['tools', 'Semua Tools', I.grid],
  ['history', 'Riwayat', I.clock],
  ['more', 'Fitur Lainnya', I.plus],
  ['settings', 'Pengaturan', I.gear],
  ['about', 'Tentang Aplikasi', I.info],
];

export const NAV_ITEMS = [
  ['home', 'Home', I.home],
  ['tools', 'Tools', I.grid],
  ['history', 'History', I.clock],
  ['settings', 'Settings', I.gear],
];

// Kerangka aplikasi: header, drawer, area konten, dan bottom nav. Dibuat sekali.
export function shell() {
  return `
  <header class="topbar">
    <button class="icon-btn" id="menu" aria-label="Buka menu">${I.menu}</button>
    <div class="brand">${logo(28)}${wordmark()}</div>
    <span class="pill" id="pill"><i class="dot"></i><span id="pilltxt">ONLINE</span></span>
  </header>
  <div class="drawer-overlay" id="ov"></div>
  <aside class="drawer" id="drawer" aria-hidden="true">
    <div class="drawer-head">${logo(28)}${wordmark()}<button class="icon-btn" id="close" aria-label="Tutup menu">${I.close}</button></div>
    <nav class="drawer-nav">
      ${DRAWER_ITEMS.map(([r, l, i]) => `<button class="drawer-item" data-go="${r}" data-route="${r}">${i}<span>${l}</span></button>`).join('')}
    </nav>
    <div class="drawer-social" id="dsocial"></div>
  </aside>
  <section id="content"></section>
  <nav class="bottom-nav" aria-label="Navigasi utama">
    ${NAV_ITEMS.map(([r, l, i]) => `<button data-go="${r}" data-route="${r}">${i}<span>${l}</span></button>`).join('')}
  </nav>`;
}

// Kartu tool dalam grid. `soon` = belum tersedia, tampil nonaktif.
export function tile(key, soon = false) {
  const d = TOOL_DEFS[key];
  return `<button class="tile${soon ? ' soon' : ''}" ${soon ? 'disabled aria-disabled="true"' : `data-go="${key}"`}>
    ${soon ? '<em>Segera</em>' : ''}
    <span class="t-ic">${d.icon}</span><b>${d.name}</b>
  </button>`;
}

// Ikon yang bisa dipilih admin untuk tool tambahan
export const ICON_KEYS = Object.keys(I).filter(k => !['menu', 'close', 'back', 'chevron', 'check', 'x', 'signal', 'home', 'gear', 'plus'].includes(k));

const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Kartu tool tambahan dari panel admin
export function customTile(t) {
  const icon = I[t.icon] || I[iconFor(t.name)];
  return `<button class="tile" data-go="t/${escHtml(t.id)}"><span class="t-ic">${icon}</span><b>${escHtml(t.name)}</b></button>`;
}
