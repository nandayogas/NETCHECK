// Tes pemeriksa statis kode MQL5 (src/ea/lint.js) terhadap kode yang dihasilkan generator.
// Jalankan dari folder proyek: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintMql5 } from '../src/ea/lint.js';
import { buildMql5 } from '../src/ea/mql.js';
import { buildTrailRev } from '../src/ea/trev.js';
import { ensureModes, analysisCfg, cfgFromCache, MODES } from '../src/ea/engine.js';
import { INSTRUMENTS } from '../src/ea/instruments.js';

const TFS = {
  M1: { on: false, weight: 0.5 }, M5: { on: true, weight: 0.7 }, M15: { on: true, weight: 1 },
  M30: { on: false, weight: 1.2 }, H1: { on: false, weight: 1.5 }, H4: { on: false, weight: 1.8 }, D1: { on: false, weight: 2 },
};

// Pengaturan dasar yang sama dengan yang dipakai aplikasi saat pertama dibuka.
function baseSettings(mode) {
  return ensureModes({
    inst: 'xau', symbol: 'XAUUSD', contract: 100, dataSym: 'XAUUSDT', primaryTf: 'M5', tfs: TFS, direction: 0,
    magic: 1, threshold: 0.3, sensitivity: 1, lotMode: 'fixed', lot: 0.01, riskPct: 1, maxLot: 1, slAtr: 0.8, rr: 1.2,
    trail: { on: true, atrMult: 0.6, startRR: 0.5 }, maxPos: 2, cooldown: 1, closeOpposite: true, maxSpread: 20,
    slippage: 30, mode, name: 'Test', bt: { bars: 1000, balance: 1000, spread: 0.25 }, rev: { ...INSTRUMENTS.xau.rev },
  });
}

// Kode lengkap untuk satu mode, sama seperti yang dibuat tab Kode.
function generate(mode) {
  const S = baseSettings(mode);
  if (mode === 'trev' || mode === 'trailstop') return buildTrailRev(S);
  return buildMql5(S, analysisCfg(S, cfgFromCache()));
}

const errors = issues => issues.filter(x => x.level === 'error');

test('kode dari semua mode lolos tanpa error', () => {
  for (const mode of [...MODES, 'trailstop']) {
    const issues = errors(lintMql5(generate(mode)));
    assert.deepEqual(issues, [], `mode ${mode}`);
  }
});

test('variabel Inp yang tidak dideklarasikan tertangkap', () => {
  const src = generate('trev').replace(/input double InpLot\b[^\n]*\n/, '');
  const issues = errors(lintMql5(src));
  assert.ok(issues.some(x => /"InpLot" dipakai tapi tidak dideklarasikan/.test(x.msg)), JSON.stringify(issues));
});

test('fungsi yang didefinisikan dua kali tertangkap', () => {
  const src = generate('trev') + '\nvoid Pips() { }\n';
  const issues = errors(lintMql5(src));
  assert.ok(issues.some(x => /Fungsi Pips didefinisikan dua kali/.test(x.msg)), JSON.stringify(issues));
});

test('baris input tanpa titik koma tertangkap', () => {
  const src = generate('trev').replace(/(input int\s+InpSlippage\s*=\s*[^;]+);/, '$1');
  const issues = errors(lintMql5(src));
  assert.ok(issues.some(x => /Baris input tidak diakhiri/.test(x.msg)), JSON.stringify(issues));
});

test('string yang tidak ditutup tertangkap', () => {
  const src = generate('trev').replace('"Jarak pending: "', '"Jarak pending: ');
  const issues = errors(lintMql5(src));
  assert.ok(issues.some(x => /tidak ditutup/.test(x.msg)), JSON.stringify(issues));
});

test('kurung tidak seimbang tertangkap', () => {
  const src = generate('trev') + '\nvoid Rusak() { if (true) { }\n';
  const issues = errors(lintMql5(src));
  assert.ok(issues.some(x => /Kurung/.test(x.msg)), JSON.stringify(issues));
});

test('OnTick yang hilang tertangkap', () => {
  const src = generate('trev').replace(/void OnTick\(\)/, 'void OnTikk()');
  const issues = errors(lintMql5(src));
  assert.ok(issues.some(x => /OnTick/.test(x.msg)), JSON.stringify(issues));
});

test('CTrade tanpa include tertangkap', () => {
  const src = generate('trev').replace(/#include <Trade\/Trade\.mqh>/, '');
  const issues = errors(lintMql5(src));
  assert.ok(issues.some(x => /CTrade tanpa #include/.test(x.msg)), JSON.stringify(issues));
});

test('komentar dan isi string tidak dianggap pemakaian variabel', () => {
  const src = '#include <Trade/Trade.mqh>\n// InpTidakAda dan g_hantu hanya di komentar\nint OnInit() { Print("InpTidakAda"); return 0; }\nvoid OnTick() { }\n';
  const issues = errors(lintMql5(src));
  assert.deepEqual(issues, []);
});
