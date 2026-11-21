// Saran AI untuk EA Builder.
// "AI" di sini adalah analisis berbasis aturan (rule-based). Ia membaca pengaturan EA dan hasil
// backtest yang benar-benar dijalankan dari data historis. Tidak ada prediksi, dan tidak ada angka
// yang dikarang: tanpa hasil backtest, panel hanya menampilkan rekomendasi parameter awal.
// Semua fungsi di sini murni (tanpa DOM dan tanpa jaringan) agar bisa diuji.

// Titik awal untuk tiap level. Hanya parameter risiko dan keluar yang diubah; logika sinyal tidak disentuh.
export const LEVELS = {
  conservative: {
    label: 'Conservative',
    desc: 'Risiko kecil, TP lebih lebar, satu posisi. Cocok untuk uji awal dan akun kecil.',
    params: { lotMode: 'risk', riskPct: 0.5, maxLot: 0.1, slAtr: 1.5, rr: 2.0, maxPos: 1, trail: { atrMult: 1.0, startRR: 1.0 } },
  },
  balanced: {
    label: 'Balanced',
    desc: 'Keseimbangan antara profit dan drawdown. Titik awal yang paling umum.',
    params: { lotMode: 'risk', riskPct: 1.0, maxLot: 0.5, slAtr: 1.2, rr: 1.5, maxPos: 2, trail: { atrMult: 0.6, startRR: 0.5 } },
  },
  aggressive: {
    label: 'Aggressive',
    desc: 'Risiko lebih besar dan lebih banyak posisi. Drawdown biasanya lebih dalam.',
    params: { lotMode: 'risk', riskPct: 2.0, maxLot: 1.0, slAtr: 1.0, rr: 1.5, maxPos: 3, trail: { atrMult: 0.4, startRR: 0.3 } },
  },
};

const MODE_NOTES = {
  swing: 'Swing: entri jarang, mengikuti sinyal kuat dari analisa multi-timeframe.',
  scalp: 'Scalping: entri sering dengan SL ketat. Biaya spread sangat berpengaruh.',
  fast: 'Fast Signal: sinyal cepat dan selektif, biasanya satu posisi.',
  straddle: 'Stop Order: BUY STOP dan SELL STOP dipasang sekaligus. Belum ada simulator di aplikasi.',
  trev: 'Trailing Reverse: pending ikut harga dan membalik arah. Belum ada saran AI penuh untuk mode ini.',
  trailstop: 'Trailing Stop: pending ikut harga tanpa balik arah. Belum ada saran AI penuh untuk mode ini.',
};

// Mode yang memakai simulator analisa, sehingga saran dan hasil backtest bisa dihitung.
export const SUPPORTED = mode => ['swing', 'scalp', 'fast'].includes(mode);

// Analisis strategi dari pengaturan yang dipilih (tidak butuh backtest).
export function analyzeStrategy(S) {
  const notes = [];
  const active = Object.entries(S.tfs || {}).filter(([, v]) => v.on).map(([k]) => k);
  notes.push({ level: 'info', text: MODE_NOTES[S.mode] || '' });
  notes.push({ level: 'info', text: `Timeframe aktif: ${active.join(', ') || 'tidak ada'} (utama ${S.primaryTf}).` });
  if (active.length === 1) notes.push({ level: 'warn', text: 'Hanya satu timeframe aktif. Sinyal lebih rentan terhadap noise.' });
  if (active.length >= 5) notes.push({ level: 'warn', text: 'Terlalu banyak timeframe aktif. Sinyal bisa saling berbenturan dan jumlah trade menurun.' });
  if (S.rr < 1) notes.push({ level: 'warn', text: `RR ${S.rr} di bawah 1: strategi butuh win rate di atas 50% hanya untuk impas.` });
  else if (S.rr >= 2) notes.push({ level: 'info', text: `RR ${S.rr}: TP lebih jauh, win rate yang dibutuhkan lebih rendah.` });
  if (S.slAtr < 0.8) notes.push({ level: 'warn', text: `SL ${S.slAtr}×ATR sangat rapat dan mudah kena noise.` });
  if (S.maxPos > 1) notes.push({ level: 'info', text: `Maks ${S.maxPos} posisi: risiko bertambah saat sinyal searah beruntun.` });
  if (!S.newsText || !S.newsText.trim()) notes.push({ level: 'info', text: 'Filter berita belum diisi. Entri pada saat rilis berita penting tidak diblokir.' });
  return notes;
}

// Rekomendasi parameter untuk satu level. Mengembalikan parameter yang bisa langsung diterapkan.
export function recommend(S, level) {
  const L = LEVELS[level];
  if (!L) throw new Error(`Level tidak dikenal: ${level}`);
  const p = L.params;
  return {
    level,
    label: L.label,
    desc: L.desc,
    params: { ...p, trail: { ...(S.trail || {}), ...p.trail } },
    // Multi-timeframe tidak diubah otomatis; ditampilkan sebagai informasi di panel.
    tfNote: `Timeframe tidak diubah otomatis. Aktif sekarang: ${Object.entries(S.tfs || {}).filter(([, v]) => v.on).map(([k]) => k).join(', ') || 'tidak ada'}.`,
  };
}

// Ringkasan angka nyata dari hasil backtest. Tidak ada estimasi di sini.
export function actualStats(r) {
  return {
    n: r.n, net: r.net, netPct: r.netPct, winRate: r.winRate, pf: r.pf, maxDD: r.maxDD,
    avgWin: r.avgWin, avgLoss: r.avgLoss, expectancy: r.expectancy,
  };
}

// Analisis hasil backtest berdasarkan aturan. Hanya membaca angka yang sudah dihitung simulator.
export function analyzeResult(r, S) {
  if (!r || !r.n) {
    return { verdict: 'none', confidence: 'none', stats: null, findings: [], next: ['Jalankan backtest untuk mendapatkan analisis hasil.'] };
  }
  const f = [];
  const pct = x => `${Number(x).toFixed(1)}%`;
  const reasons = (r.trades || []).reduce((acc, t) => { acc[t.why] = (acc[t.why] || 0) + 1; return acc; }, {});
  const slShare = r.n ? (reasons.SL || 0) / r.n * 100 : 0;

  const confidence = r.n < 30 ? 'rendah' : r.n < 100 ? 'sedang' : 'cukup';
  if (r.n < 30) f.push({ level: 'warn', text: `Hanya ${r.n} trade. Sampel ini terlalu kecil untuk dinilai.` });

  if (r.pf < 1) f.push({ level: 'bad', text: `Profit factor ${Number(r.pf).toFixed(2)} di bawah 1: total rugi lebih besar dari total profit.` });
  else if (r.pf < 1.3) f.push({ level: 'warn', text: `Profit factor ${Number(r.pf).toFixed(2)} tipis. Biaya spread bisa menghapus keuntungannya.` });
  else f.push({ level: 'good', text: `Profit factor ${Number(r.pf).toFixed(2)} cukup sehat pada periode ini.` });

  if (r.maxDD > 20) f.push({ level: 'bad', text: `Drawdown maksimum ${pct(r.maxDD)} tinggi. Kurangi risiko per trade atau jumlah posisi.` });
  else if (r.maxDD > 12) f.push({ level: 'warn', text: `Drawdown maksimum ${pct(r.maxDD)} cukup dalam untuk akun kecil.` });

  if (r.winRate < 40 && r.avgWin >= 2 * r.avgLoss && r.avgLoss > 0) {
    f.push({ level: 'info', text: 'Win rate rendah, tapi rata-rata menang jauh lebih besar. Hasil bergantung pada beberapa trade besar.' });
  }
  if (r.winRate > 55 && r.avgLoss > r.avgWin) {
    f.push({ level: 'warn', text: 'Win rate tinggi tetapi rata-rata rugi lebih besar dari rata-rata menang. Pertimbangkan SL lebih rapat atau RR lebih besar.' });
  }
  if (slShare > 70) f.push({ level: 'warn', text: `${slShare.toFixed(0)}% trade kena SL. Entri mungkin terlalu awal atau SL terlalu rapat.` });
  if (r.expectancy < 0) f.push({ level: 'bad', text: `Rata-rata hasil per trade negatif (${Number(r.expectancy).toFixed(2)} USD).` });

  const passes = r.n >= 30 && r.pf >= 1.3 && r.maxDD <= 15 && r.net > 0;
  const verdict = passes ? 'candidate' : r.net > 0 ? 'mixed' : 'weak';

  const next = [];
  if (verdict === 'weak' || r.maxDD > 20) next.push('Jalankan "Cari strategi terbaik" untuk mencoba kombinasi ambang, SL, dan RR. Pilih hasil yang memperhitungkan drawdown.');
  if (r.n < 30) next.push('Perpanjang bar uji agar sampel lebih besar.');
  if (passes) next.push('Uji ulang pada periode data yang berbeda sebelum dipakai. Satu periode belum membuktikan konsistensi.');
  if (verdict === 'mixed') next.push('Profit ada, tapi belum memenuhi syarat kandidat. Turunkan risiko atau coba level Conservative.');
  next.push('Hasil ini adalah simulasi dari data historis. Tidak menjamin hasil di akun live.');

  return { verdict, confidence, stats: actualStats(r), findings: f, next, reasons };
}

// Parser filter berita. Satu jendela per baris: "YYYY-MM-DD HH:mm - YYYY-MM-DD HH:mm" (WIB, UTC+7).
// Jendela berita diisi manual karena aplikasi tidak memakai kalender berita eksternal.
export function parseNewsWindows(text) {
  const windows = [], errors = [];
  String(text || '').split('\n').map(l => l.trim()).filter(Boolean).forEach((line, i) => {
    const m = line.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*[-–]\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);
    if (!m) { errors.push(`Baris ${i + 1} tidak sesuai format "YYYY-MM-DD HH:mm - YYYY-MM-DD HH:mm"`); return; }
    const a = Date.parse(`${m[1]}T${m[2]}:00+07:00`), b = Date.parse(`${m[3]}T${m[4]}:00+07:00`);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) { errors.push(`Baris ${i + 1}: waktu selesai harus setelah waktu mulai`); return; }
    windows.push([a, b]);
  });
  return { windows, errors };
}

// Apakah waktu t (ms) berada di salah satu jendela berita.
export const inNewsWindow = (t, windows) => !!windows && windows.length > 0 && windows.some(([a, b]) => t >= a && t <= b);
