// Latar NETCHECK: partikel, gelombang digital, cahaya neon, dan background gambar/video sendiri.
// Modul ini hanya tampilan. Tidak menyentuh data, API, atau fitur lain.

const PREF_KEY = 'nc-bg-prefs';
const DB_NAME = 'netcheck-bg';
const STORE = 'media';
const MAX_BYTES = 80 * 1024 * 1024; // batas aman agar tidak membebani memori Android
const INTENSITY = { low: { n: 28, speed: 0.45 }, med: { n: 56, speed: 0.85 }, high: { n: 100, speed: 1.35 } };
const DEFAULT_PREFS = { anim: true, intensity: 'med', opacity: 70, blur: 0, storage: 'device' };
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let prefs = loadPrefs();
let currentBlob = null;   // berkas latar aktif (gambar atau video)
let currentUrl = null;
let currentKind = null;   // 'image' | 'video' | null
let canvas = null, ctx = null, raf = 0, W = 0, H = 0, dpr = 1, parts = [], t0 = performance.now();
let layers = null;

function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch { return { ...DEFAULT_PREFS }; }
}
function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
}

/* ---------- Penyimpanan berkas (IndexedDB) ---------- */
function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) return reject(new Error('IndexedDB tidak tersedia'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbRun(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
const dbPut = blob => dbRun('readwrite', s => s.put(blob, 'current'));
const dbGet = () => dbRun('readonly', s => s.get('current'));
const dbDel = () => dbRun('readwrite', s => s.delete('current'));

/* ---------- Lapisan latar ---------- */
function mountLayers() {
  if (layers) return layers;
  const glow = document.createElement('div');
  glow.id = 'nc-glow';
  glow.innerHTML = '<i></i><i></i><i></i>';
  const media = document.createElement('div');
  media.id = 'nc-media';
  const cv = document.createElement('canvas');
  cv.id = 'nc-canvas';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv, media, glow);
  canvas = cv;
  ctx = cv.getContext('2d');
  layers = { glow, media, cv };
  return layers;
}

function resize() {
  if (!canvas) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2); // batasi resolusi agar hemat baterai di Android
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedParticles();
}

function seedParticles() {
  const n = INTENSITY[prefs.intensity]?.n ?? INTENSITY.med.n;
  parts = Array.from({ length: n }, () => newParticle(true));
}
function newParticle(anywhere) {
  const palette = ['#00E5FF', '#2F9BFF', '#7C3AED', '#FF2E88'];
  return {
    x: Math.random() * W,
    y: anywhere ? Math.random() * H : H + Math.random() * 40,
    r: 0.6 + Math.random() * 1.8,
    vy: 0.15 + Math.random() * 0.35,
    ph: Math.random() * Math.PI * 2,
    c: palette[(Math.random() * palette.length) | 0],
  };
}

// Satu bingkai: gelombang digital, partikel naik, dan garis pindai neon
function draw(now) {
  const sp = (INTENSITY[prefs.intensity]?.speed ?? 0.85);
  const t = (now - t0) / 1000 * sp;
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';

  // Gelombang digital
  const waves = [['#00E5FF', 0.22, 0.62, 26], ['#7C3AED', 0.16, 0.74, 34], ['#FF2E88', 0.10, 0.84, 42]];
  waves.forEach(([col, a, base, amp], i) => {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = H * base + Math.sin(x / 70 + t * (1 + i * 0.3)) * amp + Math.sin(x / 23 - t * 1.7) * (amp * 0.25);
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = 1.4; ctx.stroke();
  });

  // Partikel
  ctx.globalAlpha = 1;
  for (const p of parts) {
    p.y -= p.vy * sp;
    p.x += Math.sin(t + p.ph) * 0.25;
    if (p.y < -6) Object.assign(p, newParticle(false));
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.c;
    ctx.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + p.ph));
    ctx.fill();
  }

  // Garis pindai
  const sy = ((t * 60) % (H + 200)) - 100;
  const g = ctx.createLinearGradient(0, sy - 40, 0, sy + 40);
  g.addColorStop(0, 'rgba(0,229,255,0)'); g.addColorStop(0.5, 'rgba(0,229,255,0.12)'); g.addColorStop(1, 'rgba(0,229,255,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, sy - 40, W, 80);
  ctx.globalCompositeOperation = 'source-over';
  raf = requestAnimationFrame(draw);
}

function stillFrame() {
  if (!ctx) return;
  // Satu bingkai diam untuk mode animasi dimatikan
  cancelAnimationFrame(raf);
  ctx.clearRect(0, 0, W, H);
}

function applyMotion() {
  const on = prefs.anim && !reduceMotion;
  document.documentElement.classList.toggle('nc-still', !on);
  if (!canvas) return;
  canvas.style.display = on ? '' : 'none';
  cancelAnimationFrame(raf);
  if (on && !document.hidden) raf = requestAnimationFrame(draw);
  else stillFrame();
  const v = layers?.media.querySelector('video');
  if (v) (on ? v.play().catch(() => {}) : v.pause());
}

function applyVisual() {
  if (!layers) return;
  layers.media.style.setProperty('--nc-op', (prefs.opacity / 100).toFixed(2));
  layers.media.style.setProperty('--nc-blur', prefs.blur + 'px');
  seedParticles();
}

function renderMedia() {
  if (!layers) return;
  layers.media.innerHTML = '';
  if (!currentUrl) { layers.media.dataset.kind = ''; return; }
  const el = currentKind === 'video' ? document.createElement('video') : document.createElement('img');
  el.src = currentUrl;
  if (currentKind === 'video') { el.muted = true; el.loop = true; el.playsInline = true; el.autoplay = prefs.anim && !reduceMotion; el.setAttribute('playsinline', ''); }
  else el.alt = '';
  el.setAttribute('draggable', 'false');
  layers.media.appendChild(el);
  layers.media.dataset.kind = currentKind;
  applyMotion();
  refreshPreview();
}

function setCurrent(blob) {
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentBlob = blob || null;
  currentUrl = blob ? URL.createObjectURL(blob) : null;
  currentKind = blob ? (blob.type.startsWith('video/') ? 'video' : 'image') : null;
  renderMedia();
}

/* ---------- API publik ---------- */
export async function initBg() {
  mountLayers();
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => applyMotion());
  applyVisual();
  applyMotion();
  if (prefs.storage === 'device') {
    try {
      const saved = await dbGet();
      if (saved) setCurrent(saved);
    } catch { /* penyimpanan tidak tersedia: latar bawaan tetap jalan */ }
  }
}

async function acceptFile(file) {
  if (!file) return 'Tidak ada berkas dipilih.';
  if (!/^(image|video)\//.test(file.type)) return 'Pilih berkas gambar atau video.';
  if (file.size > MAX_BYTES) return 'Berkas terlalu besar (maks 80 MB).';
  setCurrent(file);
  if (prefs.storage === 'device') {
    try { await dbPut(file); return 'Latar disimpan di perangkat ini.'; }
    catch { return 'Latar dipakai, tapi gagal disimpan permanen di perangkat.'; }
  }
  try { await dbDel(); } catch {}
  return 'Latar hanya dipakai untuk sesi ini.';
}

/* ---------- Settings: bagian "Tampilan & Latar" ---------- */
export function bgSettingsHtml() {
  return `<div class="nc-set" id="nc-set">
    <h2>Tampilan &amp; Latar</h2>
    <div class="panel nc-panel">
      <label class="nc-row"><span>Animasi latar<small class="mute">Partikel, gelombang, dan video</small></span>
        <input type="checkbox" class="nc-switch" id="bg-anim" ${prefs.anim ? 'checked' : ''}></label>
      <label class="nc-row"><span>Intensitas animasi</span>
        <select id="bg-int"><option value="low" ${prefs.intensity === 'low' ? 'selected' : ''}>Rendah</option><option value="med" ${prefs.intensity === 'med' ? 'selected' : ''}>Sedang</option><option value="high" ${prefs.intensity === 'high' ? 'selected' : ''}>Tinggi</option></select></label>
      <label class="nc-row nc-col"><span>Transparansi latar <b id="bg-op-v">${prefs.opacity}%</b></span>
        <input type="range" id="bg-op" min="10" max="100" step="5" value="${prefs.opacity}"></label>
      <label class="nc-row nc-col"><span>Blur latar <b id="bg-bl-v">${prefs.blur}px</b></span>
        <input type="range" id="bg-bl" min="0" max="20" step="1" value="${prefs.blur}"></label>
      <label class="nc-row"><span>Penyimpanan<small class="mute">Di perangkat tetap ada setelah aplikasi ditutup</small></span>
        <select id="bg-store"><option value="device" ${prefs.storage === 'device' ? 'selected' : ''}>Simpan di perangkat</option><option value="session" ${prefs.storage === 'session' ? 'selected' : ''}>Hanya sesi ini</option></select></label>
    </div>
    <div class="panel nc-panel">
      <div class="nc-preview" id="bg-preview"></div>
      <div class="nc-actions">
        <label class="btn nc-file">Pilih gambar/video<input type="file" id="bg-file" accept="image/*,video/*" hidden></label>
        <button class="btn ghost" id="bg-del" ${currentUrl ? '' : 'disabled'}>Hapus latar</button>
      </div>
      <small class="mute" id="bg-status">Gambar atau video, maks 80 MB. Video diputar tanpa suara.</small>
    </div>
  </div>`;
}

function refreshPreview() {
  const box = document.getElementById('bg-preview');
  if (!box) return;
  box.innerHTML = '';
  if (!currentUrl) { box.textContent = 'Belum ada latar'; box.classList.add('empty'); }
  else {
    box.classList.remove('empty');
    const el = currentKind === 'video' ? document.createElement('video') : document.createElement('img');
    el.src = currentUrl;
    if (currentKind === 'video') { el.muted = true; el.loop = true; el.autoplay = prefs.anim && !reduceMotion; el.playsInline = true; }
    else el.alt = 'Pratinjau latar';
    box.appendChild(el);
  }
  const del = document.getElementById('bg-del');
  if (del) del.disabled = !currentUrl;
}

export function bindBgSettings(root) {
  const $ = id => root.querySelector('#' + id);
  refreshPreview();
  $('bg-anim').onchange = e => { prefs.anim = e.target.checked; savePrefs(); applyMotion(); };
  $('bg-int').onchange = e => { prefs.intensity = e.target.value; savePrefs(); seedParticles(); };
  $('bg-op').oninput = e => { prefs.opacity = +e.target.value; $('bg-op-v').textContent = prefs.opacity + '%'; savePrefs(); applyVisual(); };
  $('bg-bl').oninput = e => { prefs.blur = +e.target.value; $('bg-bl-v').textContent = prefs.blur + 'px'; savePrefs(); applyVisual(); };
  $('bg-store').onchange = async e => {
    prefs.storage = e.target.value; savePrefs();
    const st = $('bg-status');
    try {
      if (prefs.storage === 'device' && currentBlob) { await dbPut(currentBlob); st.textContent = 'Latar akan disimpan di perangkat.'; }
      else if (prefs.storage === 'session') { await dbDel(); st.textContent = 'Latar hanya dipakai untuk sesi ini.'; }
    } catch { st.textContent = 'Penyimpanan di perangkat tidak tersedia.'; }
  };
  $('bg-file').onchange = async e => {
    const msg = await acceptFile(e.target.files[0]);
    $('bg-status').textContent = msg;
    e.target.value = '';
    $('bg-del').disabled = !currentUrl;
  };
  $('bg-del').onclick = async () => {
    setCurrent(null);
    try { await dbDel(); } catch {}
    $('bg-status').textContent = 'Latar dihapus. Latar bawaan kembali.';
  };
}
