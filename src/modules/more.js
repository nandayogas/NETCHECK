// Fitur Lainnya: slot bawaan (REGISTRY) dan tool dari ZIP yang diupload admin (Firestore `tools`).
import { getApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { I } from '../ui.js';

export const REGISTRY = {};
// Tampilan khusus per slot: { icon: svg, cls: kelas tambahan }. Diisi oleh modul fitur.
export const SLOT_STYLE = {};

const DEFAULT_ICON = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2f9bff" stroke-width="1.6" stroke-dasharray="3 3"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>';

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
          ${st.icon || DEFAULT_ICON}
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
  el.innerHTML = `<h2 class="page-title">${esc(t.name)}</h2>
    <div class="panel"><iframe class="dyn-frame" title="${esc(t.name)}" sandbox="allow-scripts" srcdoc="${esc(t.html)}"></iframe></div>`;
}
