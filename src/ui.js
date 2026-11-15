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
};

// Logo NETCHECK: dua garis diagonal sebagai tanda, wordmark di sebelahnya
export const logo = (size = 32) => `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
  <path d="M7 31L15 9l6 13 12-13" fill="none" stroke="#087CFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M21 22l12-13" fill="none" stroke="#00BFFF" stroke-width="4.5" stroke-linecap="round"/>
</svg>`;

const wordmark = () => `<span class="wm">NET<b>CHECK</b></span>`;

// Semua tool. Kunci = nama route (atau nama fitur di panel admin untuk fitur yang ada).
export const TOOL_DEFS = {
  ping: { name: 'Ping Test', icon: I.pulse },
  diag: { name: 'Cek Jaringan', icon: I.diag },
  speed: { name: 'Speed Test', icon: I.speed },
  ip: { name: 'IP Checker', icon: I.ip },
  monitor: { name: 'Monitor', icon: I.monitor },
  device: { name: 'Perangkat', icon: I.device },
  wifi: { name: 'WiFi Analyzer', icon: I.wifi },
  scan: { name: 'Network Scanner', icon: I.scan },
  security: { name: 'Security Check', icon: I.shield },
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
