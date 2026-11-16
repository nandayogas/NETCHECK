// Security Check: tiga pemeriksaan nyata lewat server Cloudflare. Tidak ada angka atau status buatan.
import * as net from './modules/net.js';
import { I } from './ui.js';
import { addHist } from './history.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function securityPg(el) {
  el.innerHTML = `<h2>Security Check</h2>
  <div class="panel shield-card"><div class="shield-ic" id="sh">${I.shield}</div><h3 id="sv">Belum diperiksa</h3>
    <p class="mute small" id="ss">Memeriksa sambungan HTTPS, DNS terenkripsi, dan kestabilan koneksi.</p></div>
  <div class="panel" id="sl"><span class="mute small">Hasil pemeriksaan tampil di sini.</span></div>
  <button class="btn" id="go">Periksa sekarang</button>
  <pre class="mute">Pemeriksaan ini tidak membaca jenis enkripsi WiFi (WPA2/WPA3) maupun perangkat lain di jaringan.</pre>`;
  $('#go').onclick = async e => {
    e.target.disabled = true; $('#sv').textContent = 'Memeriksa…';
    const r = [];
    const add = (n, ok, d) => { r.push({ n, ok, d }); $('#sl').innerHTML = r.map(x => `<div class="row"><span>${esc(x.n)}<br><small class="mute">${esc(x.d)}</small></span><span class="badge ${x.ok ? 'ok' : 'bad'}">${x.ok ? 'Lolos' : 'Perlu dicek'}</span></div>`).join(''); };
    try { const i = await net.ipInfo(); add('Koneksi HTTPS ke server', true, 'Tersambung, IP publik ' + i.clientIp); } catch (x) { add('Koneksi HTTPS ke server', false, x.message); }
    try { const d = await net.dns('example.com'); add('DNS terenkripsi (DoH)', d.answers.length > 0, d.answers.length ? 'example.com → ' + d.answers[0].data : 'Tidak ada jawaban DNS'); } catch (x) { add('DNS terenkripsi (DoH)', false, x.message); }
    try { const p = await net.ping(5); add('Kestabilan koneksi', p.loss === 0 && p.jitter < 30, `Jitter ${p.jitter.toFixed(1)} ms, loss ${p.loss.toFixed(0)}%`); } catch (x) { add('Kestabilan koneksi', false, x.message); }
    const ok = r.filter(x => x.ok).length, all = ok === r.length;
    $('#sv').textContent = all ? 'Aman' : 'Perlu perhatian';
    $('#ss').textContent = `${ok} dari ${r.length} pemeriksaan lolos.`;
    $('#sh').classList.toggle('bad', !all);
    addHist({ k: 'sec', ok, n: r.length });
    e.target.disabled = false;
  };
}
