// Fitur Lainnya: hanya kerangka. Untuk mengaktifkan fitur nanti, daftarkan handler
// di REGISTRY dengan kunci = id slot (mis. 'slot1'). Slot tanpa handler tetap "Belum Tersedia".
export const REGISTRY = {};

export function renderMore(el, slots, esc) {
  const list = slots.filter(s => s.visible);
  el.innerHTML = `<h2>Fitur Lainnya</h2>` + (list.length
    ? `<div class="grid">${list.map(s => {
        const ready = typeof REGISTRY[s.id] === 'function';
        return `<button class="tile ${ready ? '' : 'off'}" data-slot="${esc(s.id)}" ${ready ? '' : 'disabled aria-disabled="true"'}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2f9bff" stroke-width="1.6" stroke-dasharray="3 3"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>
          <b>${esc(s.name)}</b><small>${esc(s.desc)}</small><div style="margin-top:8px"><span class="badge">${ready ? 'Tersedia' : 'Belum Tersedia'}</span></div></button>`;
      }).join('')}</div>`
    : `<p class="mute">Belum ada slot yang ditampilkan.</p>`);
  el.querySelectorAll('[data-slot]:not([disabled])').forEach(b => b.onclick = () => REGISTRY[b.dataset.slot](el));
}
