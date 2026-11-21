// Pemeriksaan statis untuk kode MQL5 hasil generator. Bukan pengganti MetaEditor, tetapi menangkap
// kesalahan umum sebelum file dikirim ke MT5 atau layanan compile:
//   - variabel Inp*/g_* atau objek trade dipakai tapi tidak dideklarasikan
//   - fungsi yang didefinisikan dua kali
//   - baris input yang tidak diakhiri titik koma
//   - string yang tidak ditutup, kurung yang tidak seimbang
//   - OnInit / OnTick hilang (OnDeinit hanya peringatan)
// Hasilnya daftar { level: 'error' | 'warn', line, msg }. Level error menghentikan compile dari aplikasi.

const TYPES = 'void|bool|char|uchar|short|ushort|int|uint|long|ulong|float|double|datetime|color|string';
const NOT_TYPE = 'return|else|case|delete|new|input|static|const|extern|sinput';

// Buang komentar dan isi string (diganti spasi, nomor baris tetap sama) dan catat string yang tidak ditutup.
function stripCode(src) {
  const issues = [];
  const blank = s => s.replace(/[^\n]/g, ' ');
  let out = '', line = 1, i = 0;
  while (i < src.length) {
    const ch = src[i], two = src.substr(i, 2);
    if (two === '//') {
      const e = src.indexOf('\n', i), end = e < 0 ? src.length : e;
      out += blank(src.slice(i, end)); i = end; continue;
    }
    if (two === '/*') {
      const e = src.indexOf('*/', i + 2), end = e < 0 ? src.length : e + 2;
      const seg = src.slice(i, end);
      line += (seg.match(/\n/g) || []).length;
      out += blank(seg); i = end; continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      const closed = src[j] === ch;
      if (!closed) issues.push({ level: 'error', line, msg: 'Teks (string) tidak ditutup dengan tanda kutip' });
      out += ch + blank(src.slice(i + 1, j)) + (closed ? ch : '');
      i = closed ? j + 1 : j; continue;
    }
    if (ch === '\n') line++;
    out += ch; i++;
  }
  return { code: out, issues };
}

export function lintMql5(src) {
  const { code, issues: stringIssues } = stripCode(src);
  const out = [...stringIssues];
  const lines = code.split('\n');
  const err = (line, msg) => out.push({ level: 'error', line, msg });
  const warn = (line, msg) => out.push({ level: 'warn', line, msg });

  // 1) Kurung seimbang (di kode tanpa komentar dan string)
  const stack = [], pairs = { ')': '(', ']': '[', '}': '{' };
  lines.forEach((ln, idx) => {
    for (const ch of ln) {
      if ('([{'.includes(ch)) stack.push([ch, idx + 1]);
      else if (')]}'.includes(ch)) {
        const t = stack.pop();
        if (!t || t[0] !== pairs[ch]) { err(idx + 1, `Kurung "${ch}" tidak seimbang`); return; }
      }
    }
  });
  if (stack.length) err(stack.at(-1)[1], `Kurung "${stack.at(-1)[0]}" belum ditutup`);

  // 2) Deklarasi: variabel global/input dan fungsi
  const declared = new Set(), funcs = new Map();
  const funcRe = new RegExp(`^(?:${TYPES}|CTrade|CPositionInfo)\\s+([A-Za-z_]\\w*)\\s*\\(`);
  const classRe = /^\s*(?:class|struct|enum)\s+([A-Za-z_]\w*)/;
  // Satu baris bisa berisi beberapa pernyataan (dipisah ";") dan beberapa nama (dipisah ","):
  // "input bool A = true; input double B = 1.2;" atau "datetime g_a = 0, g_b = 0;".
  const declStmt = new RegExp(`^\\s*(?:(?:input|sinput|static|const|extern)\\s+)*(?!(?:${NOT_TYPE})\\b)[A-Za-z_]\\w*\\s+([A-Za-z_][\\s\\S]*)$`);
  const declaredNames = ln => {
    const names = [];
    for (const stmt of ln.split(';')) {
      const m = stmt.match(declStmt);
      if (!m) continue;
      let depth = 0, cur = '';
      const parts = [];
      for (const ch of m[1]) {
        if ('([{'.includes(ch)) depth++;
        if (')]}'.includes(ch)) depth--;
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
      }
      parts.push(cur);
      for (const p of parts) { const nm = p.trim().match(/^([A-Za-z_]\w*)/); if (nm) names.push(nm[1]); }
    }
    return names;
  };
  lines.forEach((ln, idx) => {
    const L = idx + 1;
    const f = ln.match(funcRe);
    if (f) {
      if (funcs.has(f[1])) err(L, `Fungsi ${f[1]} didefinisikan dua kali (pertama di baris ${funcs.get(f[1])})`);
      else funcs.set(f[1], L);
      declared.add(f[1]);
    }
    const c = ln.match(classRe);
    if (c) declared.add(c[1]);
    for (const nm of declaredNames(ln)) declared.add(nm);
  });

  // 3) Input harus diakhiri titik koma
  lines.forEach((ln, idx) => {
    if (/^\s*input\s/.test(ln) && !ln.trimEnd().endsWith(';')) err(idx + 1, 'Baris input tidak diakhiri ";"');
  });

  // 4) Pemakaian variabel: Inp*, g_*, dan objek trade harus dideklarasikan
  const reported = new Set();
  lines.forEach((ln, idx) => {
    const L = idx + 1;
    if (/^\s*#/.test(ln)) return;
    const names = [...ln.matchAll(/\b(Inp[A-Z]\w*|g_\w+)\b/g)].map(m => m[1]);
    if (/\btrade\.\w+/.test(ln)) names.push('trade');
    for (const nm of names) {
      if (declared.has(nm) || reported.has(nm)) continue;
      reported.add(nm);
      err(L, `"${nm}" dipakai tapi tidak dideklarasikan`);
    }
  });
  if (/\bCTrade\b/.test(code) && !/#include\s*<Trade\/Trade\.mqh>/.test(src)) err(1, 'Memakai CTrade tanpa #include <Trade/Trade.mqh>');

  // 5) Entry point
  if (!funcs.has('OnInit')) err(1, 'Tidak ada fungsi OnInit');
  if (!funcs.has('OnTick')) err(1, 'Tidak ada fungsi OnTick');
  if (!funcs.has('OnDeinit')) warn(1, 'Tidak ada fungsi OnDeinit (opsional, tapi disarankan untuk membersihkan objek)');

  return out.sort((a, b) => a.line - b.line);
}

// Ringkasan untuk ditampilkan di aplikasi: error dan peringatan dalam bentuk teks.
export function lintSummary(issues) {
  return {
    errors: issues.filter(x => x.level === 'error').map(x => `baris ${x.line}: ${x.msg}`),
    warnings: issues.filter(x => x.level === 'warn').map(x => `baris ${x.line}: ${x.msg}`),
  };
}
