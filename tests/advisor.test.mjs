// Tes Saran AI (src/ea/advisor.js) dan filter berita di simulator (src/ea/engine.js).
// Jalankan dari folder proyek: node --test tests/advisor.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, recommend, analyzeResult, analyzeStrategy, parseNewsWindows, inNewsWindow } from '../src/ea/advisor.js';
import { simulate, ensureModes } from '../src/ea/engine.js';
import { INSTRUMENTS } from '../src/ea/instruments.js';

const TFS = {
  M1: { on: false, weight: 0.5 }, M5: { on: true, weight: 0.7 }, M15: { on: true, weight: 1 },
  M30: { on: false, weight: 1.2 }, H1: { on: false, weight: 1.5 }, H4: { on: false, weight: 1.8 }, D1: { on: false, weight: 2 },
};
function settings(extra = {}) {
  return ensureModes({
    inst: 'xau', symbol: 'XAUUSD', contract: 100, dataSym: 'XAUUSDT', primaryTf: 'M5', tfs: TFS, direction: 0,
    magic: 1, threshold: 0.3, sensitivity: 1, lotMode: 'fixed', lot: 0.01, riskPct: 1, maxLot: 1, slAtr: 0.8, rr: 1.2,
    trail: { on: true, atrMult: 0.6, startRR: 0.5 }, maxPos: 2, cooldown: 1, closeOpposite: true, maxSpread: 20,
    slippage: 30, mode: 'scalp', bt: { bars: 1000, balance: 1000, spread: 0.25 }, be: { on: false, start: 1, buffer: 2 },
    rev: { ...INSTRUMENTS.xau.rev }, newsText: '', ...extra,
  });
}

// Data sintetis dengan sinyal yang berganti arah, supaya ada cukup entri untuk diuji.
function series(n = 2000, t0 = Date.UTC(2026, 0, 1)) {
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let p = 2300; const out = [];
  for (let i = 0; i < n; i++) {
    const o = p, c = o + (rnd() - 0.5) * 2.4;
    const h = Math.max(o, c) + rnd(), l = Math.min(o, c) - rnd();
    out.push({ t: t0 + i * 3e5, o, h, l, c, score: Math.sin(i / 37) * 0.6 + (rnd() - 0.5) * 0.4, atr: 1.5 + rnd() });
    p = c;
  }
  return out;
}

test('parseNewsWindows membaca format WIB dan melaporkan baris salah', () => {
  const ok = parseNewsWindows('2026-12-05 19:30 - 2026-12-05 21:00');
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.windows.length, 1);
  assert.equal(ok.windows[0][0], Date.parse('2026-12-05T19:30:00+07:00'));
  assert.equal(ok.windows[0][1], Date.parse('2026-12-05T21:00:00+07:00'));

  const bad = parseNewsWindows('bukan tanggal\n2026-12-05 21:00 - 2026-12-05 19:00');
  assert.equal(bad.windows.length, 0);
  assert.equal(bad.errors.length, 2);
  assert.match(bad.errors[0], /Baris 1/);
  assert.match(bad.errors[1], /setelah/);
});

test('inNewsWindow: batas awal dan akhir termasuk, di luar tidak', () => {
  const w = [[100, 200]];
  assert.equal(inNewsWindow(100, w), true);
  assert.equal(inNewsWindow(200, w), true);
  assert.equal(inNewsWindow(99, w), false);
  assert.equal(inNewsWindow(201, w), false);
  assert.equal(inNewsWindow(150, undefined), false);
  assert.equal(inNewsWindow(150, []), false);
});

test('rekomendasi tetap dalam rentang yang ditampilkan di desain', () => {
  const S = settings();
  for (const level of Object.keys(LEVELS)) {
    const p = recommend(S, level).params;
    assert.ok(p.slAtr >= 1 && p.slAtr <= 1.5, `${level} SL`);
    const tp = p.slAtr * p.rr;
    assert.ok(tp >= 1.5 && tp <= 3.0, `${level} TP ${tp}`);
  }
  // Risiko naik dari Conservative ke Aggressive
  assert.ok(recommend(S, 'conservative').params.riskPct < recommend(S, 'balanced').params.riskPct);
  assert.ok(recommend(S, 'balanced').params.riskPct < recommend(S, 'aggressive').params.riskPct);
});

test('rekomendasi tidak mengubah pengaturan asli', () => {
  const S = settings();
  const before = JSON.stringify(S);
  recommend(S, 'aggressive');
  assert.equal(JSON.stringify(S), before);
});

test('analisis hasil: tanpa trade tidak memberi temuan', () => {
  const a = analyzeResult({ n: 0, trades: [] }, settings());
  assert.equal(a.verdict, 'none');
  assert.equal(a.findings.length, 0);
});

test('analisis hasil: profit factor di bawah 1 dinilai lemah', () => {
  const r = { n: 120, net: -50, netPct: -5, winRate: 40, pf: 0.8, maxDD: 18, avgWin: 4, avgLoss: 5, expectancy: -0.4, trades: [] };
  const a = analyzeResult(r, settings());
  assert.equal(a.verdict, 'weak');
  assert.ok(a.findings.some(x => x.level === 'bad' && /Profit factor/.test(x.text)));
});

test('analisis hasil: sampel kecil diberi peringatan dan keyakinan rendah', () => {
  const r = { n: 12, net: 30, netPct: 3, winRate: 60, pf: 2.1, maxDD: 4, avgWin: 6, avgLoss: 3, expectancy: 2.5, trades: [] };
  const a = analyzeResult(r, settings());
  assert.equal(a.confidence, 'rendah');
  assert.ok(a.findings.some(x => /terlalu kecil/.test(x.text)));
  assert.notEqual(a.verdict, 'candidate');
});

test('analisis hasil: hasil yang memenuhi syarat ditandai kandidat, dengan catatan batasan', () => {
  const r = { n: 150, net: 200, netPct: 20, winRate: 55, pf: 1.6, maxDD: 9, avgWin: 5, avgLoss: 4, expectancy: 1.3, trades: [] };
  const a = analyzeResult(r, settings());
  assert.equal(a.verdict, 'candidate');
  assert.ok(a.next.some(x => /periode data yang berbeda/.test(x)));
  assert.ok(a.next.some(x => /tidak menjamin/i.test(x)));
});

test('analisis strategi memberi peringatan RR di bawah 1 dan filter berita kosong', () => {
  const notes = analyzeStrategy(settings({ rr: 0.8 }));
  assert.ok(notes.some(x => x.level === 'warn' && /RR 0\.8/.test(x.text)));
  assert.ok(notes.some(x => /Filter berita belum diisi/.test(x.text)));
});

test('filter berita: entri baru diblokir di dalam jendela', () => {
  const data = series(2000);
  const S = settings();
  const base = simulate(data, S);
  assert.ok(base.n > 0, 'data uji harus menghasilkan trade');

  // Jendela penuh: tidak boleh ada entri sama sekali
  const all = simulate(data, { ...S, news: [[data[0].t, data[data.length - 1].t]] });
  assert.equal(all.n, 0);

  // Jendela di tengah: tidak ada trade yang dibuka di dalam jendela
  const a = data[800].t, b = data[1200].t;
  const part = simulate(data, { ...S, news: [[a, b]] });
  assert.ok(part.n <= base.n);
  for (const tr of part.trades) assert.ok(!(tr.t0 >= a && tr.t0 <= b), `entri ${tr.t0} masuk jendela berita`);
});

test('tanpa filter berita hasil simulasi sama seperti sebelumnya', () => {
  const data = series(1500);
  const S = settings();
  const r1 = simulate(data, S);
  const r2 = simulate(data, { ...S, news: [] });
  assert.equal(r1.n, r2.n);
  assert.equal(r1.net, r2.net);
});
