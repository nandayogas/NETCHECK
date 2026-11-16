import { gauge } from './charts.js';
// WiFi Analyzer: membaca info WiFi lewat plugin native "WifiInfo" (hanya di aplikasi Android).
import { Capacitor, registerPlugin } from '@capacitor/core';
import * as net from './modules/net.js';

const WifiInfo = registerPlugin('WifiInfo');
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const errTxt = e => (e && (e.message || e.errorMessage)) || String(e);
const show = (id, on) => { const e = $(id); if (e) e.style.display = on ? '' : 'none'; };

// Kualitas sinyal dari RSSI (dBm)
const quality = rssi => rssi >= -55 ? 'Sangat kuat' : rssi >= -67 ? 'Kuat' : rssi >= -75 ? 'Sedang' : 'Lemah';
const row = (label, value) => `<div class="row"><span class="mute">${label}</span><span>${value}</span></div>`;

export function wifiPg(el) {
  if (!Capacitor.isNativePlatform()) {
    el.innerHTML = `<h2>WiFi Analyzer</h2><div class="panel"><p class="mute">Fitur ini hanya bisa dipakai di aplikasi Android. Di browser, info WiFi tidak bisa dibaca.</p></div>`;
    return;
  }

  el.innerHTML = `<h2>WiFi Analyzer</h2>
  <div class="panel">
    <div id="perm" class="mute">Memeriksa izin…</div>
    <button class="btn ghost" id="perm-btn" style="display:none">Beri izin lokasi</button>
  </div>
  <h2>Koneksi saat ini</h2>
  <div class="panel" id="conn">Memuat…</div>
  <button class="btn ghost" id="reload">Muat ulang</button>
  <h2>Latensi</h2>
  <div class="panel"><button class="btn ghost" id="lat">Tes latensi (10 kali)</button><pre id="latout" class="mute">Belum diukur.</pre></div>
  <h2>Jaringan sekitar</h2>
  <div class="panel"><button class="btn" id="scan">Pindai jaringan</button><div id="nets" class="mute" style="margin-top:8px">Belum dipindai.</div></div>`;

  async function refresh() {
    try {
      const s = await WifiInfo.status();
      const p = $('#perm');
      if (p) p.textContent = s.locationGranted
        ? (s.locationOn ? 'Izin lokasi: aktif' : 'Izin lokasi aktif, tapi GPS/lokasi di HP belum menyala. Nama WiFi tidak akan terbaca.')
        : 'Izin lokasi belum diberikan. Nama WiFi dan daftar jaringan tidak bisa dibaca tanpa izin ini.';
      show('#perm-btn', !s.locationGranted);

      const c = $('#conn'); if (!c) return;
      if (!s.wifiEnabled) { c.innerHTML = '<span class="mute">WiFi sedang nonaktif.</span>'; return; }
      if (!s.connected) { c.innerHTML = '<span class="mute">Tidak terhubung ke WiFi.</span>'; return; }

      const ssidOk = s.locationGranted && s.ssid && !/unknown/i.test(s.ssid);
      c.innerHTML = [gauge(s.rssi + 100, 70, 'dBm', String(s.rssi)),
        row('Nama WiFi', ssidOk ? esc(s.ssid) : '<span class="mute">perlu izin lokasi</span>'),
        row('Alamat IP', esc(s.ip || '—')),
        row('Sinyal', `${s.rssi} dBm · ${quality(s.rssi)}`),
        row('Band & channel', `${esc(s.band)} · channel ${s.channel}`),
        row('Kecepatan link', `${s.linkSpeed} Mbps`),
        row('BSSID (router)', ssidOk && s.bssid ? esc(s.bssid) : '<span class="mute">—</span>'),
      ].join('');
    } catch (e) {
      const c = $('#conn'); if (c) c.textContent = 'Gagal membaca info WiFi: ' + errTxt(e);
    }
  }

  $('#perm-btn').onclick = async () => {
    try { await WifiInfo.requestLocation(); } catch (e) { alert('Gagal meminta izin: ' + errTxt(e)); }
    refresh();
  };
  $('#reload').onclick = refresh;

  $('#lat').onclick = async e => {
    e.target.disabled = true; $('#latout').textContent = 'Mengukur…';
    try {
      const r = await net.ping(10);
      $('#latout').textContent = `Rata-rata ${r.avg.toFixed(0)} ms · jitter ${r.jitter.toFixed(1)} ms · loss ${r.loss.toFixed(0)}%`;
    } catch (err) { $('#latout').textContent = 'Gagal: ' + errTxt(err); }
    e.target.disabled = false;
  };

  $('#scan').onclick = async e => {
    e.target.disabled = true; $('#nets').textContent = 'Memindai… (±3 detik)';
    try {
      const r = await WifiInfo.scan();
      const list = (r.networks || []).slice().sort((a, b) => b.rssi - a.rssi);
      $('#nets').innerHTML = list.length
        ? list.map(n => `<div class="row"><span>${esc(n.ssid)}<br><small class="mute">Ch ${n.channel} · ${esc(n.band)}</small></span><span>${n.rssi} dBm</span></div>`).join('')
        : 'Tidak ada jaringan terdeteksi.';
    } catch (err) { $('#nets').textContent = 'Gagal memindai: ' + errTxt(err); }
    e.target.disabled = false;
  };

  refresh();
}
