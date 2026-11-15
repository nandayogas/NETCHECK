// Tool dari ZIP (khusus admin): upload .zip berisi HTML/CSS/JS/gambar, diperiksa, diuji di kotak
// terisolasi, lalu disimpan ke koleksi Firestore `tools`. Judul diambil dari <title>, ikon bisa diubah.
import JSZip from 'jszip';
import { getApp } from 'firebase/app';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { I, ICON_KEYS, iconFor } from './ui.js';

const MAX_ZIP = 1024 * 1024;   // 1 MB
const MAX_HTML = 900 * 1024;   // batas dokumen Firestore 1 MB, dibulatkan ke bawah
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isRemote = s => /^(https?:)?\/\//i.test(s) || /^(data|mailto|blob):/i.test(s);
let db = null, unsub = null;
const fs = () => db || (db = getFirestore(getApp()));

// Gabungkan CSS dan JS dari zip ke dalam satu halaman. Gambar dijadikan data URL.
async function bundle(zip, indexFile) {
  const base = indexFile.name.slice(0, indexFile.name.length - 'index.html'.length);
  const get = rel => {
    const clean = rel.split('?')[0].split('#')[0].replace(/^\.?\//, '');
    if (clean.includes('..')) return null;
    return zip.file(base + clean);
  };
  const warn = [];
  const dom = new DOMParser().parseFromString(await indexFile.async('string'), 'text/html');

  for (const el of [...dom.querySelectorAll('link[rel~="stylesheet"][href]')]) {
    const h = el.getAttribute('href');
    if (isRemote(h)) continue;
    const f = get(h);
    if (!f) { warn.push('CSS hilang: ' + h); el.remove(); continue; }
    const st = dom.createElement('style');
    st.textContent = await f.async('string');
    el.replaceWith(st);
  }
  for (const el of [...dom.querySelectorAll('script[src]')]) {
    const s = el.getAttribute('src');
    if (isRemote(s)) continue;
    const f = get(s);
    if (!f) { warn.push('JS hilang: ' + s); el.remove(); continue; }
    el.removeAttribute('src');
    el.textContent = await f.async('string');
  }
  for (const el of [...dom.querySelectorAll('img[src]')]) {
    const s = el.getAttribute('src');
    if (isRemote(s)) continue;
    const f = get(s);
    if (!f) { warn.push('Gambar hilang: ' + s); continue; }
    const ext = s.split('.').pop().toLowerCase();
    el.setAttribute('src', `data:${MIME[ext] || 'application/octet-stream'};base64,${await f.async('base64')}`);
  }
  return {
    html: '<!doctype html>\n' + dom.documentElement.outerHTML,
    warn,
    title: (dom.querySelector('title') ? dom.querySelector('title').textContent : '').trim(),
  };
}

// Uji: halaman dijalankan di iframe terisolasi. Lulus jika tidak ada error JavaScript
// dan halaman punya isi (body tidak kosong) dalam 8 detik.
function testTool(html) {
  return new Promise(resolve => {
    const probe = `<script>(function(){var p=function(o){parent.postMessage({ncTool:o},'*')};` +
      `addEventListener('error',function(e){p({err:String(e.message)})});` +
      `addEventListener('unhandledrejection',function(e){p({err:String(e.reason)})});` +
      `addEventListener('load',function(){setTimeout(function(){p({ok:(document.body?document.body.innerHTML.length:0)})},1200)});})();</script>`;
    const withProbe = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + probe) : probe + html;

    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.style.cssText = 'position:fixed;width:360px;height:640px;left:-9999px;top:0;border:0';
    let done = false, timer = null;
    const finish = r => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
      frame.remove();
      resolve(r);
    };
    const onMsg = e => {
      if (e.source !== frame.contentWindow || !e.data || !e.data.ncTool) return;
      const d = e.data.ncTool;
      if (d.err) return finish({ ok: false, reason: d.err });
      if (d.ok !== undefined) return finish(d.ok > 0 ? { ok: true } : { ok: false, reason: 'halaman kosong, tidak ada tampilan' });
    };
    window.addEventListener('message', onMsg);
    timer = setTimeout(() => finish({ ok: false, reason: 'waktu habis (lebih dari 8 detik)' }), 8000);
    document.body.appendChild(frame);
    frame.srcdoc = withProbe;
  });
}

// Panel di halaman admin. Dipanggil ulang setiap halaman admin digambar ulang.
export function mountZipTools(root) {
  if (!root) return;
  if (unsub) unsub();
  let list = [];
  let state = { msg: '', busy: false };

  const setMsg = m => { state.msg = m; const el = root.querySelector('#zt-log'); if (el) el.textContent = m; };

  const draw = () => {
    root.innerHTML = `
      <div class="panel">
        <h3>Upload tool (.zip)</h3>
        <small class="mute">Zip berisi index.html, boleh disertai .css, .js, dan gambar. Judul diambil dari tag &lt;title&gt;. Tool hanya tampil jika lulus uji otomatis.</small>
        <input id="zt-file" type="file" accept=".zip,application/zip">
        <button class="btn" id="zt-up" ${state.busy ? 'disabled' : ''}>Periksa, uji, lalu pasang</button>
        <pre id="zt-log" class="mute">${esc(state.msg)}</pre>
      </div>
      <div class="panel">
        ${list.length ? list.map(t => `
          <div class="zt-item" data-id="${esc(t.id)}" style="border-bottom:1px solid rgba(255,255,255,.1);padding:10px 0;display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;align-items:center;gap:10px"><span class="icon-prev" style="width:32px;height:32px;margin:0">${I[t.icon] || I.grid}</span><b>${esc(t.name)}</b></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" class="zt-on" ${t.enabled ? 'checked' : ''} style="width:auto"> Tampil</label>
              <select class="zt-icon">${ICON_KEYS.map(k => `<option value="${k}" ${k === t.icon ? 'selected' : ''}>${k}</option>`).join('')}</select>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input class="zt-name" value="${esc(t.name)}" maxlength="40" style="flex:1;min-width:120px">
              <button class="btn ghost small-btn zt-del">Hapus</button>
            </div>
          </div>`).join('') : '<p class="mute">Belum ada tool dari ZIP.</p>'}
      </div>`;
    bind();
  };

  const bind = () => {
    root.querySelector('#zt-up').onclick = () => {
      const f = root.querySelector('#zt-file').files[0];
      if (!f) return setMsg('Pilih file .zip dulu.');
      run(f);
    };
    root.querySelectorAll('.zt-item').forEach(row => {
      const id = row.dataset.id;
      const ref = doc(fs(), 'tools', id);
      row.querySelector('.zt-on').onchange = e => updateDoc(ref, { enabled: e.target.checked }).catch(err => setMsg('Gagal: ' + err.message));
      row.querySelector('.zt-icon').onchange = e => updateDoc(ref, { icon: e.target.value }).catch(err => setMsg('Gagal: ' + err.message));
      row.querySelector('.zt-name').onchange = e => {
        const name = e.target.value.trim();
        if (!name) { setMsg('Nama tidak boleh kosong.'); return draw(); }
        updateDoc(ref, { name }).catch(err => setMsg('Gagal: ' + err.message));
      };
      row.querySelector('.zt-del').onclick = () => {
        if (!confirm('Hapus tool ini dari aplikasi?')) return;
        deleteDoc(ref).catch(err => setMsg('Gagal: ' + err.message));
      };
    });
  };

  const run = async file => {
    state.busy = true;
    setMsg('Memeriksa zip…');
    draw();
    try {
      if (file.size > MAX_ZIP) throw new Error('Zip lebih dari 1 MB.');
      const zip = await JSZip.loadAsync(file);
      const index = Object.values(zip.files).find(f => !f.dir && /(^|\/)index\.html$/i.test(f.name));
      if (!index) throw new Error('index.html tidak ditemukan di dalam zip.');

      setMsg('Menggabungkan file…');
      const b = await bundle(zip, index);
      if (b.html.length > MAX_HTML) throw new Error('Hasil gabungan terlalu besar (lebih dari 900 KB). Kecilkan gambar atau file.');

      setMsg('Menguji tool…');
      const r = await testTool(b.html);
      if (!r.ok) throw new Error('Uji gagal: ' + r.reason + '. Tool tidak dipasang.');

      const name = (b.title || file.name.replace(/\.zip$/i, '')).slice(0, 40);
      await addDoc(collection(fs(), 'tools'), {
        name, icon: iconFor(name), html: b.html, enabled: true, size: b.html.length, createdAt: serverTimestamp(),
      });
      const w = b.warn.length ? ' Peringatan: ' + b.warn.join('; ') + '.' : '';
      state.msg = `"${name}" lulus uji dan dipasang.${w}`;
    } catch (e) {
      state.msg = 'Gagal: ' + (e.message || e);
    } finally {
      state.busy = false;
      draw();
    }
  };

  unsub = onSnapshot(collection(fs(), 'tools'), sn => {
    list = sn.docs.map(x => ({ id: x.id, ...x.data() }));
    draw();
  }, err => { root.innerHTML = '<p class="mute">Gagal memuat daftar tool: ' + esc(err.message) + '</p>'; });
  draw();
}
