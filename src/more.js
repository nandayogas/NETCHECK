// Fitur Lainnya: slot bawaan (REGISTRY) dan tool dari ZIP yang diupload admin (Firestore `tools`).
import { getApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { I } from '../ui.js';

export const REGISTRY = {};
// Tampilan khusus per slot: { icon: svg, cls: kelas tambahan }. Diisi oleh modul fitur.
export const SLOT_STYLE = {};

const DEFAULT_ICON = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2f9bff" stroke-width="1.6" stroke-dasharray="3 3"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>';

// Ikon yang bisa dipilih admin/developer lewat config slot (field `icon`). Isinya harus sama dengan SLOT_ICON_INNER di panel developer.
const PRESET_INNER = {
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5 12a10 10 0 0 1 14 0"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  camera: '<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>'
};
const ICON_PRESETS = Object.fromEntries(Object.entries(PRESET_INNER).map(([k, v]) =>
  [k, `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${v}</svg>`]));

let dyn = [];        // tool aktif dari Firestore
let last = null;     // argumen renderMore terakhir, dipakai untuk menggambar ulang saat daftar berubah
let started = false;

function startDyn() {
  if (started) return;
  started = true;
  try {
    const db = getFirestore(getApp());
    onSnapshot(query(collection(db, 'tools'), where('enabled', '==', true)), sn => {
      dyn = sn.docs.map(x => ({ id: x.id, ...x.data() }));
      if (last && last.view === 'list' && last.el.isConnected) renderMore(last.el, last.slots, last.esc);
    }, () => { started = false; });
  } catch { started = false; }
}

export function renderMore(el, slots, esc) {
  last = { el, slots, esc, view: 'list' };
  startDyn();
  const list = slots.filter(s => s.visible);
  const slotHtml = list.map(s => {
    const ready = typeof REGISTRY[s.id] === 'function';
    const st = SLOT_STYLE[s.id] || {};
    return `<button class="tile ${ready ? '' : 'off'} ${st.cls || ''}" data-slot="${esc(s.id)}" ${ready ? '' : 'disabled aria-disabled="true"'}>
          ${ICON_PRESETS[s.icon] || st.icon || DEFAULT_ICON}
          <b>${esc(s.name)}</b><small>${esc(s.desc)}</small><div style="margin-top:8px"><span class="badge">${ready ? 'Tersedia' : 'Belum Tersedia'}</span></div></button>`;
  }).join('');
  const dynHtml = dyn.map(t => `<button class="tile" data-dyn="${esc(t.id)}"><span class="dyn-ic">${I[t.icon] || I.grid}</span><b>${esc(t.name)}</b><small>Tool dari admin</small></button>`).join('');
  el.innerHTML = `<h2>Fitur Lainnya</h2>` + (slotHtml || dynHtml
    ? `<div class="grid">${slotHtml}${dynHtml}</div>`
    : `<p class="mute">Belum ada slot yang ditampilkan.</p>`);
  el.querySelectorAll('[data-slot]:not([disabled])').forEach(b => b.onclick = () => REGISTRY[b.dataset.slot](el));
  el.querySelectorAll('[data-dyn]').forEach(b => b.onclick = () => {
    const t = dyn.find(x => x.id === b.dataset.dyn);
    if (t) openDyn(el, t, esc);
  });
}

// Tool dari admin dijalankan di iframe tanpa akses ke login, penyimpanan, atau data NETCHECK
function openDyn(el, t, esc) {
  if (last) last.view = 'tool';
  el.innerHTML = `<iframe class="tool-full" title="${esc(t.name)}" sandbox="allow-scripts" srcdoc="${esc(t.html)}"></iframe>`;
}
