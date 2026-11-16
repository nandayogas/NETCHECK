Claude

Update · JS
// Cek pembaruan: baca version.json publik, bandingkan dengan versi aplikasi, lalu arahkan ke link download.
// Alamat version.json di repo GitHub (repo harus publik, branch main).
export const UPDATE_JSON_URL = 'https://raw.githubusercontent.com/nandayogas/NETCHECK/main/version.json';
 
const num = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
 
export async function checkUpdate(current) {
  if (/USERNAME|NAMA-REPO/.test(UPDATE_JSON_URL)) return; // belum diatur
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 6000);
    const r = await fetch(UPDATE_JSON_URL + '?t=' + Date.now(), { cache: 'no-store', signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return;
    const u = await r.json();
    if (!u || !u.version || !/^https:\/\//.test(u.url || '') || !newer(u.version, current)) return;
    const d = document.createElement('div');
    d.className = 'upd-ov'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<div class="upd"><h3>Pembaruan tersedia</h3>
      <p class="mute small">Versi ${esc(current)} → <b>${esc(u.version)}</b></p>
      ${u.notes ? `<p>${esc(u.notes)}</p>` : ''}
      <div class="upd-act"><button class="btn" id="upd-go">Perbarui</button>${u.wajib ? '' : '<button class="btn ghost" id="upd-no">Nanti</button>'}</div></div>`;
    document.body.appendChild(d);
    d.querySelector('#upd-go').onclick = () => { window.location.href = u.url; };
    const no = d.querySelector('#upd-no'); if (no) no.onclick = () => d.remove();
  } catch { /* offline atau file belum ada: abaikan */ }
}
 
Claude selesai menulis balasan
