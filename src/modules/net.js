// Semua pengukuran memakai server Cloudflare speed test; tidak ada data simulasi.
const CF = 'https://speed.cloudflare.com';
const nc = () => ({ cache: 'no-store' });

export async function ping(count = 5) {
  const t = []; let fail = 0;
  for (let i = 0; i < count; i++) {
    const s = performance.now();
    try { await fetch(`${CF}/__down?bytes=0&r=${Date.now()}${i}`, nc()); t.push(performance.now() - s); } catch { fail++; }
  }
  if (!t.length) throw new Error('Semua permintaan ping gagal');
  const avg = t.reduce((a, b) => a + b) / t.length;
  const jitter = t.length > 1 ? t.slice(1).reduce((a, v, i) => a + Math.abs(v - t[i]), 0) / (t.length - 1) : 0;
  return { min: Math.min(...t), max: Math.max(...t), avg, jitter, loss: (fail / count) * 100 };
}

export async function download(bytes = 10e6) {
  const s = performance.now();
  const r = await fetch(`${CF}/__down?bytes=${bytes}&r=${Date.now()}`, nc());
  const reader = r.body.getReader(); let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; got += value.length; }
  return (got * 8) / ((performance.now() - s) / 1000) / 1e6;
}

export async function upload(bytes = 4e6) {
  const body = new Blob([new Uint8Array(bytes)]);
  const s = performance.now();
  await fetch(`${CF}/__up`, { method: 'POST', body, ...nc() });
  return (bytes * 8) / ((performance.now() - s) / 1000) / 1e6;
}

export async function ipInfo() {
  const r = await fetch(`${CF}/meta`, nc());
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export async function dns(name, type = 'A') {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return { status: j.Status, answers: (j.Answer || []).map(a => ({ data: a.data, ttl: a.TTL })) };
}

export async function diagnose(log) {
  const out = [];
  const step = async (name, fn) => {
    try { const d = await fn(); out.push({ name, ok: true, d }); } catch (e) { out.push({ name, ok: false, d: e.message }); }
    log(out);
  };
  await step('Koneksi perangkat', async () => { if (!navigator.onLine) throw new Error('Perangkat offline'); return 'Online'; });
  await step('Ping server', async () => { const p = await ping(3); return `${p.avg.toFixed(0)} ms, loss ${p.loss.toFixed(0)}%`; });
  await step('Resolusi DNS', async () => { const r = await dns('example.com'); if (!r.answers.length) throw new Error('Tidak ada jawaban DNS'); return r.answers[0].data; });
  await step('Akses HTTPS', async () => { const i = await ipInfo(); return 'IP ' + i.clientIp; });
  return out;
}
