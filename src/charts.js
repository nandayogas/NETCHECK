// Grafik SVG ringan tanpa library. Semua nilai berasal dari hasil pengukuran nyata.
export const spark = v => {
  v = v.filter(x => x != null);
  if (v.length < 2) return '<div class="chart-empty">Belum ada data. Jalankan pengukuran dulu.</div>';
  const w = 320, h = 90, mx = Math.max(...v), mn = Math.min(...v), r = mx - mn || 1;
  const d = v.map((y, i) => (i ? 'L' : 'M') + (i * w / (v.length - 1)).toFixed(1) + ' ' + (h - 8 - ((y - mn) / r) * (h - 18)).toFixed(1)).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Grafik pengukuran"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00BFFF" stop-opacity=".4"/><stop offset="1" stop-color="#00BFFF" stop-opacity="0"/></linearGradient></defs><path d="${d}L${w} ${h}L0 ${h}Z" fill="url(#sg)"/><path d="${d}" fill="none" stroke="#00D5FF" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg><div class="chart-axis"><span>${mn.toFixed(0)}</span><span>${mx.toFixed(0)}</span></div>`;
};
export const gauge = (val, max, unit, txt) => {
  const L = 251.3, f = Math.min(1, (val || 0) / max);
  return `<svg class="gauge" viewBox="0 0 200 120" role="img" aria-label="Penunjuk kecepatan"><defs><linearGradient id="gg"><stop offset="0" stop-color="#00E5FF"/><stop offset="1" stop-color="#7B5CFF"/></linearGradient></defs><path d="M20 105A80 80 0 0 1 180 105" fill="none" stroke="rgba(145,168,199,.15)" stroke-width="14" stroke-linecap="round"/><path d="M20 105A80 80 0 0 1 180 105" fill="none" stroke="url(#gg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${(L * (1 - f)).toFixed(1)}" style="transition:stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)"/><text x="100" y="88" text-anchor="middle" class="g-val">${txt != null ? txt : val == null ? '—' : val.toFixed(1)}</text><text x="100" y="108" text-anchor="middle" class="g-unit">${unit}</text></svg>`;
};
