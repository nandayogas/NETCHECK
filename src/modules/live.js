// Live Streaming (WebRTC). Didaftarkan ke slot "Fitur Lainnya" (slot1) lewat REGISTRY.
// Sinyal sementara disimpan di Firestore koleksi `live`. Tidak memakai Storage, tidak ada rekaman.
// Data sesi dihapus saat siaran berakhir. Mesh: penyiar membuat satu koneksi per penonton.
import { getApp } from 'firebase/app';
import { getFirestore, doc, collection, setDoc, updateDoc, deleteDoc, getDocs, addDoc,
  onSnapshot, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { currentUser } from '../auth.js';
import { REGISTRY, SLOT_STYLE } from './more.js';
import '../live.css';

const SLOT = 'slot1';
const RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const BEAT = 20000;   // detak jantung tiap 20 detik
const STALE = 60000;  // tanpa detak selama 60 detik = dianggap mati

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
let db = null;
const fs = () => (db || (db = getFirestore(getApp())));
const fresh = d => { const t = d && d.lastSeen && d.lastSeen.toMillis && d.lastSeen.toMillis(); return !t || Date.now() - t < STALE; };

let session = null; // { type: 'host' | 'watch', stop() }
let listUnsub = null;
const stopList = () => { if (listUnsub) listUnsub(); listUnsub = null; };
async function stopSession() { const s = session; session = null; if (s) await s.stop().catch(() => {}); }

// Hapus semua subkoleksi sinyal (bc, vw) lalu dokumen viewer
async function clearViewer(vref) {
  for (const sub of ['bc', 'vw']) {
    const snap = await getDocs(collection(vref, sub));
    await Promise.all(snap.docs.map(x => deleteDoc(x.ref)));
  }
  await deleteDoc(vref);
}
async function cleanupRoom(hid) {
  const vs = await getDocs(collection(fs(), 'live', hid, 'viewers'));
  for (const v of vs.docs) await clearViewer(v.ref);
  const cs = await getDocs(collection(fs(), 'live', hid, 'comments'));
  await Promise.all(cs.docs.map(x => deleteDoc(x.ref)));
  await deleteDoc(doc(fs(), 'live', hid));
}

// ---------- PENYIAR ----------
async function startHost(title) {
  const me = currentUser();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
    audio: true,
  });
  const ref = doc(fs(), 'live', me.uid);
  try {
    await cleanupRoom(me.uid); // sisa sesi lama (mis. aplikasi ditutup paksa)
    await setDoc(ref, { hostUid: me.uid, hostName: me.name, hostPhoto: me.photo || '', title,
      startedAt: serverTimestamp(), lastSeen: serverTimestamp() });
  } catch (e) { stream.getTracks().forEach(t => t.stop()); throw e; }

  const peers = new Map();
  const s = { type: 'host', stream, title, count: 0, setCount: null, stop: null };
  const beat = setInterval(() => updateDoc(ref, { lastSeen: serverTimestamp() }).catch(() => {}), BEAT);

  const closePeer = vid => {
    const p = peers.get(vid);
    if (!p) return;
    if (p.unsub) p.unsub();
    p.pc.close();
    peers.delete(vid);
  };

  const answer = async (vid, offer) => {
    if (peers.has(vid)) return;
    const pc = new RTCPeerConnection(RTC);
    const vref = doc(ref, 'viewers', vid);
    const p = { pc, unsub: null };
    peers.set(vid, p);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.onicecandidate = e => { if (e.candidate) addDoc(collection(vref, 'bc'), e.candidate.toJSON()).catch(() => {}); };
    try {
      await pc.setRemoteDescription(offer);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await updateDoc(vref, { answer: { type: ans.type, sdp: ans.sdp } });
      p.unsub = onSnapshot(collection(vref, 'vw'), sn => sn.docChanges().forEach(c => {
        if (c.type === 'added') pc.addIceCandidate(c.doc.data()).catch(() => {});
      }));
    } catch { closePeer(vid); }
  };

  const vUnsub = onSnapshot(collection(ref, 'viewers'), sn => {
    sn.docChanges().forEach(c => {
      const d = c.doc.data();
      if (c.type === 'added' && d.offer) answer(c.doc.id, d.offer);
      if (c.type === 'removed') closePeer(c.doc.id);
    });
    s.count = sn.docs.filter(x => fresh(x.data())).length;
    if (s.setCount) s.setCount(s.count);
  }, () => {});

  s.stop = async () => {
    clearInterval(beat);
    if (s.commentsUnsub) s.commentsUnsub();
    vUnsub();
    [...peers.keys()].forEach(closePeer);
    stream.getTracks().forEach(t => t.stop());
    await cleanupRoom(me.uid);
  };
  return s;
}

// ---------- PENONTON ----------
async function startWatch(hid, hostData) {
  const me = currentUser();
  const hostRef = doc(fs(), 'live', hid);
  const vref = doc(hostRef, 'viewers', me.uid);
  const pc = new RTCPeerConnection(RTC);
  const pending = [];
  let remoteSet = false, settingRemote = false;
  const s = { type: 'watch', hid, host: hostData, remote: null, ended: false, stopped: false,
    count: 0, setCount: null, onTrack: null, onEnd: null, stop: null, hostSeen: Date.now() };

  const addIce = c => { if (remoteSet) pc.addIceCandidate(c).catch(() => {}); else pending.push(c); };
  pc.ontrack = e => { s.remote = e.streams[0]; const v = $('live-v'); if (v) v.srcObject = s.remote; if (s.onTrack) s.onTrack(); };
  pc.onicecandidate = e => { if (e.candidate) addDoc(collection(vref, 'vw'), e.candidate.toJSON()).catch(() => {}); };
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await clearViewer(vref).catch(() => {});
  await setDoc(vref, { name: me.name, photo: me.photo || '', joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp(), offer: { type: offer.type, sdp: offer.sdp } });

  const endNow = () => { if (s.ended) return; s.ended = true; if (s.onEnd) s.onEnd(); s.stop(); };
  const unsubs = [];
  unsubs.push(onSnapshot(vref, sn => {
    const a = sn.data() && sn.data().answer;
    if (a && !settingRemote) {
      settingRemote = true;
      pc.setRemoteDescription(a).then(() => {
        remoteSet = true;
        pending.splice(0).forEach(c => pc.addIceCandidate(c).catch(() => {}));
      }).catch(() => {});
    }
  }));
  unsubs.push(onSnapshot(collection(vref, 'bc'), sn => sn.docChanges().forEach(c => {
    if (c.type === 'added') addIce(c.doc.data());
  })));
  unsubs.push(onSnapshot(hostRef, sn => {
    if (!sn.exists() || !fresh(sn.data())) return endNow();
    s.host = sn.data();
    s.hostSeen = Date.now();
  }, () => {}));
  unsubs.push(onSnapshot(collection(hostRef, 'viewers'), sn => {
    s.count = sn.docs.filter(x => fresh(x.data())).length;
    if (s.setCount) s.setCount(s.count);
  }, () => {}));

  const beat = setInterval(() => updateDoc(vref, { lastSeen: serverTimestamp() }).catch(() => {}), BEAT);
  const watchdog = setInterval(() => { if (Date.now() - s.hostSeen > STALE) endNow(); }, 15000);

  s.stop = async () => {
    if (s.stopped) return;
    s.stopped = true;
    if (s.commentsUnsub) s.commentsUnsub();
    clearInterval(beat); clearInterval(watchdog);
    unsubs.forEach(u => u());
    pc.close();
    s.remote = null;
    await clearViewer(vref).catch(() => {});
  };
  return s;
}

// ---------- KOMENTAR ----------
const COMMENT_MAX = 200;
function commentsHtml() {
  return `<h2>Komentar</h2><div class="panel">
    <div id="live-comments" class="live-comments"><span class="mute">Memuat komentar…</span></div>
    <div class="live-send"><input id="live-msg" maxlength="${COMMENT_MAX}" placeholder="Tulis komentar…" autocomplete="off"><button class="btn" id="live-send">Kirim</button></div>
  </div>`;
}

// Komentar disimpan di live/{hid}/comments dan dihapus saat siaran berakhir
function attachComments(s, hid) {
  if (s.commentsUnsub) s.commentsUnsub();
  const q = query(collection(fs(), 'live', hid, 'comments'), orderBy('createdAt', 'desc'), limit(50));
  s.commentsUnsub = onSnapshot(q, sn => {
    const box = $('live-comments');
    if (!box) return;
    const items = sn.docs.map(x => x.data()).reverse();
    box.innerHTML = items.length
      ? items.map(c => `<div class="cmt"><b>${esc(c.name)}</b> <span>${esc(c.text)}</span></div>`).join('')
      : `<span class="mute">Belum ada komentar.</span>`;
    box.scrollTop = box.scrollHeight;
  }, () => { const box = $('live-comments'); if (box) box.textContent = 'Gagal memuat komentar.'; });
  $('live-send').onclick = () => postComment(hid);
  $('live-msg').onkeydown = e => { if (e.key === 'Enter') postComment(hid); };
}

async function postComment(hid) {
  const inp = $('live-msg');
  const t = (inp.value || '').trim().slice(0, COMMENT_MAX);
  if (!t) return;
  const me = currentUser();
  inp.value = '';
  try {
    await addDoc(collection(fs(), 'live', hid, 'comments'),
      { uid: me.uid, name: me.name, text: t, createdAt: serverTimestamp() });
  } catch (e) {
    inp.value = t;
    alert('Gagal mengirim komentar: ' + (e.message || e));
  }
}

// ---------- UI ----------
function liveHome(el) {
  if (!currentUser()) { el.innerHTML = `<h2>Live Streaming</h2><div class="panel"><p class="mute">Silakan login terlebih dahulu.</p></div>`; return; }
  if (session && session.type === 'host') return showHost(el);
  if (session && session.type === 'watch') return showWatch(el);
  stopList();
  el.innerHTML = `<h2>Live Streaming</h2>
    <div class="panel"><button class="btn" id="live-new">Mulai siaran</button>
    <small class="mute">Kamera dan mikrofon dipakai langsung. Siaran tidak direkam dan berakhir saat Anda menghentikannya.</small></div>
    <h2>Sedang LIVE</h2><div class="panel" id="live-list"><span class="mute">Memuat…</span></div>`;
  $('live-new').onclick = () => showSetup(el);

  listUnsub = onSnapshot(collection(fs(), 'live'), sn => {
    const box = $('live-list');
    if (!box) return;
    const items = sn.docs.filter(x => fresh(x.data()));
    const map = new Map(items.map(x => [x.id, x.data()]));
    box.innerHTML = items.length ? items.map(x => {
      const d = x.data();
      return `<button class="live-row" data-id="${esc(x.id)}">
        <img class="live-av" src="${esc(d.hostPhoto)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">
        <span class="lr-txt"><b>${esc(d.title || 'Siaran')}</b><small class="mute">${esc(d.hostName || '')}</small></span>
        <span class="live-badge">LIVE</span></button>`;
    }).join('') : `<span class="mute">Belum ada siaran.</span>`;
    box.querySelectorAll('[data-id]').forEach(b => b.onclick = async () => {
      const id = b.dataset.id;
      if (id === currentUser().uid) return alert('Ini siaran Anda. Buka "Akhiri siaran" untuk menghentikannya.');
      stopList();
      try { session = await startWatch(id, map.get(id)); showWatch(el); }
      catch (e) { alert('Gagal masuk siaran: ' + (e.message || e)); }
    });
  }, () => { const box = $('live-list'); if (box) box.textContent = 'Gagal memuat daftar siaran.'; });
}

function showSetup(el) {
  stopList();
  el.innerHTML = `<h2>Mulai Siaran</h2><div class="panel">
    <label class="mute" for="live-title">Judul siaran</label>
    <input id="live-title" maxlength="60" placeholder="Contoh: Tes WiFi kantor">
    <button class="btn" id="live-go">Mulai siaran</button>
    <button class="btn ghost" id="live-cancel">Batal</button>
    <pre id="live-err" class="mute"></pre></div>`;
  $('live-cancel').onclick = () => liveHome(el);
  $('live-go').onclick = async () => {
    const btn = $('live-go');
    btn.disabled = true; $('live-err').textContent = 'Menyiapkan kamera…';
    try {
      session = await startHost($('live-title').value.trim() || 'Siaran langsung');
      showHost(el);
    } catch (e) {
      btn.disabled = false;
      $('live-err').textContent = 'Gagal memulai: ' + (e.message || e);
    }
  };
}

function showHost(el) {
  const s = session;
  stopList();
  el.innerHTML = `<h2>Anda sedang LIVE</h2><div class="panel">
    <video id="live-v" class="live-video" autoplay playsinline muted></video>
    <div class="row"><span class="mute">Judul</span><span>${esc(s.title)}</span></div>
    <div class="row"><span class="mute">Penonton</span><span id="live-count">${s.count}</span></div>
    <button class="btn ghost" id="live-end">Akhiri siaran</button></div>${commentsHtml()}`;
  const v = $('live-v');
  v.muted = true;
  v.srcObject = s.stream;
  attachComments(s, currentUser().uid);
  s.setCount = n => { const c = $('live-count'); if (c) c.textContent = n; };
  $('live-end').onclick = async () => {
    $('live-end').disabled = true;
    await stopSession();
    liveHome(el);
  };
}

function showWatch(el) {
  const s = session;
  stopList();
  const h = s.host || {};
  el.innerHTML = `<h2>${esc(h.title || 'Siaran')}</h2><div class="panel">
    <video id="live-v" class="live-video" autoplay playsinline></video>
    <div class="row"><span class="mute">Penyiar</span><span>${esc(h.hostName || '')}</span></div>
    <div class="row"><span class="mute">Penonton</span><span id="live-count">${s.count}</span></div>
    <small id="live-status" class="mute">${s.ended ? 'Siaran telah berakhir.' : 'Menghubungkan…'}</small>
    <button class="btn ghost" id="live-leave">${s.ended ? 'Kembali' : 'Keluar siaran'}</button></div>${commentsHtml()}`;
  if (s.remote) $('live-v').srcObject = s.remote;
  attachComments(s, s.hid);
  s.setCount = n => { const c = $('live-count'); if (c) c.textContent = n; };
  s.onTrack = () => { const t = $('live-status'); if (t) t.textContent = 'Tersambung'; };
  s.onEnd = () => {
    const t = $('live-status'); if (t) t.textContent = 'Siaran telah berakhir.';
    const b = $('live-leave'); if (b) b.textContent = 'Kembali';
  };
  $('live-leave').onclick = async () => { await stopSession(); liveHome(el); };
}

// Pindah halaman di luar "Fitur Lainnya" menghentikan siaran dan menonton
window.addEventListener('hashchange', () => {
  if (location.hash !== '#more') { stopList(); stopSession(); }
});

REGISTRY[SLOT] = liveHome;

// Ikon siaran: lingkaran pusat dengan gelombang di kiri-kanan, gradien merah ke oranye
SLOT_STYLE[SLOT] = {
  cls: 'live-tile',
  icon: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" class="live-ic">
    <defs><linearGradient id="nc-live-g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff4d6d"/><stop offset="1" stop-color="#ff8a00"/></linearGradient></defs>
    <path d="M5.2 5.2Q1.2 12 5.2 18.8M18.8 5.2Q22.8 12 18.8 18.8" stroke="url(#nc-live-g)" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
    <path d="M8.4 8.4Q6 12 8.4 15.6M15.6 8.4Q18 12 15.6 15.6" stroke="url(#nc-live-g)" stroke-width="2" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="2.8" fill="url(#nc-live-g)"/>
  </svg>`,
};
