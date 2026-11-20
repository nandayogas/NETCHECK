// Generator kode MQL5. Logika skor DISALIN dari mesin NetCheck (src/ndax/analyzer.js):
// EMA, RSI, MACD, S/R, Price Action, Volume, ATR, BOS/CHoCH, Liquidity Sweep, Fibonacci,
// digabung per timeframe lalu dibobot antar timeframe, sama seperti analyzeAll().
import { TF_ORDER } from '../ndax/config.js';
import { sigFor } from '../ndax/analyzer.js';
import { CUSTOM_TYPES } from '../ndax/config.js';

const PERIOD = { M1: 'PERIOD_M1', M5: 'PERIOD_M5', M15: 'PERIOD_M15', M30: 'PERIOD_M30', H1: 'PERIOD_H1', H4: 'PERIOD_H4', D1: 'PERIOD_D1' };
const b = v => (v ? 'true' : 'false');
const n = v => String(Number(v));
const safeName = s => (String(s || 'NetCheckEA').replace(/[^A-Za-z0-9_]/g, '') || 'NetCheckEA').slice(0, 40);
export const fileBase = s => safeName(s.name);

// ---- Metode tambahan (dari NdaxTrade Dev). Setiap tipe = blok MQL5 identik dengan customScore() di analyzer.js.
const cmInputs = list => list.map((cm, i) => {
  const N = `InpCM${i + 1}`;
  const spec = CUSTOM_TYPES[cm.type];
  const head = `input bool   ${N}_On = ${b(cm.enabled)};   input double ${N}_W = ${n(cm.weight)};   // ${cm.name.replace(/\*\//g, '')} (${spec.label})`;
  const ps = spec.params.map(q => `input ${q.int ? 'int   ' : 'double'} ${N}_${q.k} = ${n(cm.p[q.k])};`).join('  ');
  return `${head}\n${ps}`;
}).join('\n');

const cmCalc = (cm, i) => {
  const N = `InpCM${i + 1}`, W = `${N}_W`;
  let body;
  switch (cm.type) {
    case 'ema_cross': body = `      double ef[], es2[];
      CalcEma(closes, ${N}_fast, ef); CalcEma(closes, ${N}_slow, es2);
      if(Ok(ef[n]) && Ok(es2[n]) && last > 0)
         AddScore(Clamp((ef[n] - es2[n]) / last * 100.0 / ${N}_scale), ${W}, acc, ws);`; break;
    case 'roc': body = `      int pp = ${N}_period;
      if(n >= pp && r[n-pp].close > 0)
         AddScore(Clamp((last - r[n-pp].close) / r[n-pp].close * 100.0 / ${N}_scale), ${W}, acc, ws);`; break;
    case 'bollinger': body = `      int pp = ${N}_period;
      if(got >= pp)
      {
         double m = 0; for(int i = got - pp; i < got; i++) m += closes[i];
         m /= pp;
         double v2 = 0; for(int i = got - pp; i < got; i++) v2 += (closes[i] - m) * (closes[i] - m);
         double sd = MathSqrt(v2 / pp);
         if(sd > 0)
         {
            double lo = m - ${N}_mult * sd, hi = m + ${N}_mult * sd;
            AddScore(Clamp(((last - lo) / (hi - lo) - 0.5) * 2.0), ${W}, acc, ws);
         }
         else AddScore(0.0, ${W}, acc, ws);
      }`; break;
    case 'stoch': body = `      int pp = ${N}_period;
      if(got >= pp)
      {
         double hh = -DBL_MAX, ll = DBL_MAX;
         for(int i = got - pp; i < got; i++) { hh = MathMax(hh, r[i].high); ll = MathMin(ll, r[i].low); }
         double k = (hh > ll) ? (last - ll) / (hh - ll) * 100.0 : 50.0;
         double s = (k >= ${N}_ob) ? -0.3 : ((k <= ${N}_os) ? 0.3 : (k - 50.0) / 25.0);
         AddScore(Clamp(s), ${W}, acc, ws);
      }`; break;
    case 'donchian': body = `      int pp = ${N}_period;
      if(n >= pp)
      {
         double hi = -DBL_MAX, lo = DBL_MAX;
         for(int i = n - pp; i < n; i++) { hi = MathMax(hi, r[i].high); lo = MathMin(lo, r[i].low); }
         double s;
         if(last > hi) s = 1.0;
         else if(last < lo) s = -1.0;
         else { double pos = (hi > lo) ? (last - lo) / (hi - lo) : 0.5; s = (pos * 2.0 - 1.0) * 0.5; }
         AddScore(Clamp(s), ${W}, acc, ws);
      }`; break;
    default: body = '';
  }
  return `   // Metode tambahan #${i + 1}: ${cm.name.replace(/\*\//g, '')} (${cm.type})\n   if(${N}_On)\n   {\n${body}\n   }\n`;
};

const sessInputs = s => {
  const se = s.session || { on: false, start: 7, end: 20 };
  return `input bool   InpSessOn    = ${b(se.on)};   // Batasi entri baru ke jam tertentu (UTC)\ninput int    InpSessStart = ${n(se.start)};   // Jam mulai (UTC, 0-23)\ninput int    InpSessEnd   = ${n(se.end)};   // Jam selesai (UTC, 0-23; boleh melewati tengah malam)`;
};

export function buildMql5(s, cfg) {
  const M = cfg.methods;
  const customs = (cfg.customMethods || []).filter(cm => CUSTOM_TYPES[cm.type]);
  const name = safeName(s.name);
  const tfInputs = TF_ORDER.map(k => `input bool   InpTF_${k} = ${b(s.tfs[k].on)};   // Pakai timeframe ${k}\ninput double InpW_${k}  = ${n(s.tfs[k].weight)};   // Bobot ${k}`).join('\n');
  const sensArr = TF_ORDER.map(k => {
    const o = cfg.timeframes[k]?.sensitivity;
    return o == null || o === '' || !Number.isFinite(Number(o)) ? '-1' : n(o);
  }).join(',');

  return `//+------------------------------------------------------------------+
//| ${name}.mq5                                                       
//| Dibuat oleh NETCHECK EA BUILDER — strategi = mesin analisis NetCheck
//| Instrumen: ${s.symbol} · Mode: ${({ scalp: 'SCALPING', fast: 'FAST SIGNAL CONSERVATIVE' })[s.mode] || 'SWING'} · MetaTrader 5 (kompatibel Winlator)
//| PERINGATAN: trading berisiko. Uji di akun demo / Strategy Tester dulu.
//+------------------------------------------------------------------+
#property copyright "NETCHECK"
#property version   "1.00"
#property description "EA otomatis BUY/SELL berbasis mesin analisis NETCHECK"
#include <Trade/Trade.mqh>

enum ENUM_NC_DIR { NC_BOTH = 0, NC_BUY_ONLY = 1, NC_SELL_ONLY = 2 };
enum ENUM_NC_LOT { NC_LOT_FIXED = 0, NC_LOT_RISK = 1 };

//--- Umum
input string           InpSymbol      = "";                 // Simbol (kosong = simbol chart, mis. XAUUSD / XAUUSDm)
input ENUM_TIMEFRAMES  InpPrimaryTf   = ${PERIOD[s.primaryTf]};   // Timeframe utama (acuan ATR & waktu eksekusi)
input ENUM_NC_DIR      InpDirection   = ${['NC_BOTH', 'NC_BUY_ONLY', 'NC_SELL_ONLY'][s.direction]};          // Arah trading
input long             InpMagic       = ${n(s.magic)};     // Magic number
input string           InpComment     = "NETCHECK-EA";      // Komentar order
input int              InpCandles     = ${n(cfg.market.candles)};              // Jumlah candle analisis per timeframe
${sessInputs(s)}

//--- Sinyal NetCheck
input double InpThreshold   = ${n(s.threshold)};   // Skor minimum BUY/SELL (0-1)
input double InpSensitivity = ${n(s.sensitivity)};   // Pengali skor

//--- Timeframe & bobot
${tfInputs}

//--- Manajemen risiko & posisi
input ENUM_NC_LOT InpLotMode   = ${s.lotMode === 'risk' ? 'NC_LOT_RISK' : 'NC_LOT_FIXED'};   // Mode lot
input double InpLot        = ${n(s.lot)};      // Lot tetap
input double InpRiskPct    = ${n(s.riskPct)};      // Risiko per trade (% equity) bila mode risk
input double InpMaxLot     = ${n(s.maxLot)};      // Lot maksimum
input double InpSlAtrMult  = ${n(s.slAtr)};      // Jarak SL = ATR x nilai ini
input double InpRR         = ${n(s.rr)};      // Rasio TP : SL
input bool   InpUseTrail   = ${b(s.trail.on)};   // Aktifkan trailing stop
input double InpTrailAtr   = ${n(s.trail.atrMult)};      // Jarak trailing = ATR x nilai ini
input double InpTrailStart = ${n(s.trail.startRR)};      // Trailing mulai saat profit >= (x risiko awal)
input int    InpMaxPos     = ${n(s.maxPos)};        // Maksimal posisi terbuka
input int    InpCooldown   = ${n(s.cooldown)};        // Jeda minimal antar entri (jumlah bar timeframe utama)
input bool   InpCloseOpp   = ${b(s.closeOpposite)};   // Tutup posisi lawan saat sinyal berbalik
input int    InpMaxSpread  = ${n(s.maxSpread)};      // Spread maksimum (points), 0 = tanpa batas
input int    InpSlippage   = ${n(s.slippage)};       // Slippage (points)

//--- Parameter metode (default dari konfigurasi NetCheck)
input bool   InpEMA_On = ${b(M.ema.enabled)};     input double InpEMA_W = ${n(M.ema.weight)};
input bool   InpRSI_On = ${b(M.rsi.enabled)};     input double InpRSI_W = ${n(M.rsi.weight)};
input int    InpRSI_P  = ${n(M.rsi.period)};      input double InpRSI_OB = ${n(M.rsi.overbought)};  input double InpRSI_OS = ${n(M.rsi.oversold)};
input bool   InpMACD_On = ${b(M.macd.enabled)};   input double InpMACD_W = ${n(M.macd.weight)};
input int    InpMACD_F = ${n(M.macd.fast)};  input int InpMACD_S = ${n(M.macd.slow)};  input int InpMACD_G = ${n(M.macd.signal)};
input bool   InpSR_On = ${b(M.sr.enabled)};       input double InpSR_W = ${n(M.sr.weight)};
input int    InpSR_Piv = ${n(M.sr.pivot)};        input int InpSR_LB = ${n(M.sr.lookback)};
input bool   InpPA_On = ${b(M.price_action.enabled)};  input double InpPA_W = ${n(M.price_action.weight)};
input bool   InpVol_On = ${b(M.volume.enabled)};  input double InpVol_W = ${n(M.volume.weight)};  input int InpVol_P = ${n(M.volume.period)};
input bool   InpATR_On = ${b(M.atr.enabled)};     input int InpATR_P = ${n(M.atr.period)};
input double InpATR_MinPct = ${n(M.atr.minPct)};  input double InpATR_LowVol = ${n(M.atr.lowVolFactor)};
input bool   InpST_On = ${b(M.structure.enabled)};  input double InpST_W = ${n(M.structure.weight)};
input int    InpST_Piv = ${n(M.structure.pivot)};   input int InpST_LB = ${n(M.structure.lookback)};
input bool   InpLQ_On = ${b(M.liquidity.enabled)};  input double InpLQ_W = ${n(M.liquidity.weight)};  input int InpLQ_LB = ${n(M.liquidity.lookback)};
input bool   InpFIB_On = ${b(M.fibonacci.enabled)}; input double InpFIB_W = ${n(M.fibonacci.weight)};
input int    InpFIB_LB = ${n(M.fibonacci.lookback)};
input double InpFIB_GMin = ${n(M.fibonacci.goldenMin)};  input double InpFIB_GMax = ${n(M.fibonacci.goldenMax)};
input double InpFIB_Golden = ${n(M.fibonacci.scoreGolden)};  input double InpFIB_Shallow = ${n(M.fibonacci.scoreShallow)};
input double InpFIB_Deep = ${n(M.fibonacci.scoreDeep)};  input double InpFIB_Break = ${n(M.fibonacci.scoreBreakout)};

//--- Metode tambahan (dibuat di NdaxTrade Dev; tiap nomor = satu metode)
${cmInputs(customs) || '// (tidak ada metode tambahan)'}

#define EMA_N ${M.ema.periods.length}
int EMA_P[EMA_N] = {${M.ema.periods.join(',')}};
double TF_SENS[7] = {${sensArr}};            // -1 = pakai InpSensitivity
ENUM_TIMEFRAMES TF_LIST[7] = {${TF_ORDER.map(k => PERIOD[k]).join(',')}};
bool   g_tfOn[7];
double g_tfW[7];
const double NA = DBL_MAX;

CTrade   trade;
string   g_sym;
datetime g_lastBar = 0, g_lastEntry = 0;
double   g_atr = DBL_MAX;

bool   Ok(const double v) { return v != NA; }
double Sgn(const double x) { return x > 0 ? 1.0 : (x < 0 ? -1.0 : 0.0); }
double Clamp(const double x, const double a = -1.0, const double bb = 1.0) { return MathMax(a, MathMin(bb, x)); }
void   AddScore(const double sc, const double w, double &acc, double &ws) { acc += sc * w; ws += w; }

//--- Indikator (identik dengan src/ndax/indicators.js)
void CalcEma(const double &a[], const int len, double &out[])
{
   int cnt = ArraySize(a);
   ArrayResize(out, cnt); ArrayInitialize(out, NA);
   int start = -1;
   for(int i = 0; i < cnt; i++) if(Ok(a[i])) { start = i; break; }
   if(start < 0 || cnt - start < len) return;
   double k = 2.0 / (len + 1.0), prev = 0;
   for(int i = start; i < start + len; i++) prev += a[i];
   prev /= len;
   out[start + len - 1] = prev;
   for(int i = start + len; i < cnt; i++) { prev = a[i] * k + prev * (1.0 - k); out[i] = prev; }
}

void CalcRsi(const double &c[], const int p, double &out[])
{
   int cnt = ArraySize(c);
   ArrayResize(out, cnt); ArrayInitialize(out, NA);
   if(cnt <= p) return;
   double g = 0, l = 0;
   for(int i = 1; i <= p; i++) { double d = c[i] - c[i-1]; if(d >= 0) g += d; else l -= d; }
   double ag = g / p, al = l / p;
   out[p] = (al == 0) ? 100.0 : 100.0 - 100.0 / (1.0 + ag / al);
   for(int i = p + 1; i < cnt; i++)
   {
      double d = c[i] - c[i-1];
      ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
      al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
      out[i] = (al == 0) ? 100.0 : 100.0 - 100.0 / (1.0 + ag / al);
   }
}

void CalcAtr(const MqlRates &r[], const int p, double &out[])
{
   int cnt = ArraySize(r);
   ArrayResize(out, cnt); ArrayInitialize(out, NA);
   if(cnt <= p) return;
   double tr[]; ArrayResize(tr, cnt);
   tr[0] = r[0].high - r[0].low;
   for(int i = 1; i < cnt; i++)
      tr[i] = MathMax(r[i].high - r[i].low, MathMax(MathAbs(r[i].high - r[i-1].close), MathAbs(r[i].low - r[i-1].close)));
   double pv = 0;
   for(int i = 1; i <= p; i++) pv += tr[i];
   pv /= p; out[p] = pv;
   for(int i = p + 1; i < cnt; i++) { pv = (pv * (p - 1) + tr[i]) / p; out[i] = pv; }
}

// Swing high/low dalam "lookback" candle terakhir; L candle di kiri dan kanan.
void CalcPivots(const MqlRates &r[], const int lookback, const int L, double &hs[], double &ls[])
{
   int cnt = ArraySize(r);
   int st = MathMax(0, cnt - lookback);
   int len = cnt - st;
   ArrayResize(hs, 0); ArrayResize(ls, 0);
   for(int i = L; i < len - L; i++)
   {
      bool isH = true, isL = true;
      for(int j = i - L; j <= i + L; j++)
      {
         if(j == i) continue;
         if(r[st+j].high >= r[st+i].high) isH = false;
         if(r[st+j].low  <= r[st+i].low)  isL = false;
         if(!isH && !isL) break;
      }
      if(isH) { int k = ArraySize(hs); ArrayResize(hs, k + 1); hs[k] = r[st+i].high; }
      if(isL) { int k = ArraySize(ls); ArrayResize(ls, k + 1); ls[k] = r[st+i].low; }
   }
}

//--- Skor satu timeframe (-1..+1) = padanan analyzeTf()
double AnalyzeTf(const ENUM_TIMEFRAMES tf, const double sens, double &atrOut)
{
   atrOut = NA;
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int got = CopyRates(g_sym, tf, 1, InpCandles, r);   // mulai bar tertutup terakhir
   if(got < 60) return NA;
   int n = got - 1;
   double closes[], vols[];
   ArrayResize(closes, got); ArrayResize(vols, got);
   for(int i = 0; i < got; i++) { closes[i] = r[i].close; vols[i] = (double)r[i].tick_volume; }

   double atrA[]; CalcAtr(r, InpATR_P, atrA);
   double atrNow = atrA[n];
   atrOut = atrNow;
   double last = r[n].close;
   double atrPct = Ok(atrNow) ? atrNow / last * 100.0 : NA;
   double acc = 0, ws = 0;

   // EMA
   if(InpEMA_On)
   {
      double es[]; ArrayResize(es, EMA_N);
      bool all = true;
      for(int k = 0; k < EMA_N; k++) { double e[]; CalcEma(closes, EMA_P[k], e); es[k] = e[n]; if(!Ok(es[k])) all = false; }
      if(all)
      {
         double mean = 0;
         for(int k = 0; k < EMA_N; k++) mean += Sgn(last - es[k]);
         mean /= EMA_N;
         bool bull = true, bear = true;
         for(int k = 1; k < EMA_N; k++) { if(!(es[k-1] > es[k])) bull = false; if(!(es[k-1] < es[k])) bear = false; }
         AddScore(Clamp(mean * 0.7 + (bull ? 0.3 : (bear ? -0.3 : 0.0))), InpEMA_W, acc, ws);
      }
   }

   // RSI
   if(InpRSI_On)
   {
      double rs[]; CalcRsi(closes, InpRSI_P, rs);
      double rv = rs[n];
      if(Ok(rv))
      {
         double s = (rv >= InpRSI_OB) ? -0.3 : ((rv <= InpRSI_OS) ? 0.3 : (rv - 50.0) / 25.0);
         AddScore(Clamp(s), InpRSI_W, acc, ws);
      }
   }

   // MACD
   if(InpMACD_On)
   {
      double ef[], esl[], line[], sg[];
      CalcEma(closes, InpMACD_F, ef); CalcEma(closes, InpMACD_S, esl);
      ArrayResize(line, got);
      for(int i = 0; i < got; i++) line[i] = (Ok(ef[i]) && Ok(esl[i])) ? ef[i] - esl[i] : NA;
      CalcEma(line, InpMACD_G, sg);
      if(n >= 1 && Ok(line[n]) && Ok(sg[n]) && Ok(line[n-1]) && Ok(sg[n-1]))
      {
         double h = line[n] - sg[n], hp = line[n-1] - sg[n-1];
         bool grow = MathAbs(h) > MathAbs(hp);
         AddScore(Clamp(Sgn(h) * (grow ? 1.0 : 0.6)), InpMACD_W, acc, ws);
      }
   }

   // Support / Resistance
   if(InpSR_On)
   {
      double hs[], ls[]; CalcPivots(r, InpSR_LB, InpSR_Piv, hs, ls);
      double R = DBL_MAX, S = -DBL_MAX; bool hasR = false, hasS = false;
      for(int k = 0; k < ArraySize(hs); k++) if(hs[k] > last) { R = MathMin(R, hs[k]); hasR = true; }
      for(int k = 0; k < ArraySize(ls); k++) if(ls[k] < last) { S = MathMax(S, ls[k]); hasS = true; }
      if(hasR && hasS)
      {
         double a = Ok(atrNow) ? atrNow : 0;
         double s = ((last - S) / (R - S) * 2.0 - 1.0) * 0.6;
         if(R - last < 0.3 * a) s -= 0.4;
         if(last - S < 0.3 * a) s += 0.4;
         AddScore(Clamp(s), InpSR_W, acc, ws);
      }
   }

   // Price action
   if(InpPA_On)
   {
      MqlRates L = r[n];
      MqlRates P = r[n-1];
      double body = MathAbs(L.close - L.open);
      double range = L.high - L.low; if(range == 0) range = 1e-9;
      double upW = L.high - MathMax(L.close, L.open);
      double lowW = MathMin(L.close, L.open) - L.low;
      bool bullEng = P.close < P.open && L.close > L.open && L.close >= P.open && L.open <= P.close;
      bool bearEng = P.close > P.open && L.close < L.open && L.close <= P.open && L.open >= P.close;
      double pa;
      if(bullEng) pa = 1.0;
      else if(bearEng) pa = -1.0;
      else if(lowW > 2 * body && lowW / range > 0.6) pa = 0.6;
      else if(upW > 2 * body && upW / range > 0.6) pa = -0.6;
      else pa = Sgn(L.close - L.open) * 0.2;
      AddScore(Clamp(pa), InpPA_W, acc, ws);
   }

   // Volume (tick volume di MT5)
   if(InpVol_On)
   {
      double vs = NA;
      if(n >= InpVol_P - 1) { double sum = 0; for(int i = n - InpVol_P + 1; i <= n; i++) sum += vols[i]; vs = sum / InpVol_P; }
      double rel = (Ok(vs) && vs > 0) ? vols[n] / vs : 1.0;
      AddScore(Clamp(Sgn(last - r[n].open) * Clamp((rel - 1.0) * 0.8, 0.0, 1.0)), InpVol_W, acc, ws);
   }

   // ATR: filter volatilitas
   double volFactor = 1.0;
   if(InpATR_On && Ok(atrPct) && atrPct < InpATR_MinPct) volFactor = InpATR_LowVol;

   // BOS / CHoCH
   if(InpST_On)
   {
      double hs[], ls[]; CalcPivots(r, InpST_LB, InpST_Piv, hs, ls);
      int nh = ArraySize(hs), nl = ArraySize(ls);
      if(nh >= 2 && nl >= 2)
      {
         double h1 = hs[nh-1], h0 = hs[nh-2], l1 = ls[nl-1], l0 = ls[nl-2];
         bool up = (h1 > h0 && l1 > l0), down = (h1 < h0 && l1 < l0);
         double s;
         if(last > h1) s = up ? 1.0 : 0.8;
         else if(last < l1) s = down ? -1.0 : -0.8;
         else s = up ? 0.3 : (down ? -0.3 : 0.0);
         AddScore(Clamp(s), InpST_W, acc, ws);
      }
   }

   // Liquidity sweep
   if(InpLQ_On)
   {
      int from = MathMax(0, n - InpLQ_LB);
      double hi = -DBL_MAX, lo = DBL_MAX;
      for(int i = from; i < n; i++) { hi = MathMax(hi, r[i].high); lo = MathMin(lo, r[i].low); }
      double s = 0;
      if(r[n].high > hi && r[n].close < hi) s = -1.0;
      else if(r[n].low < lo && r[n].close > lo) s = 1.0;
      AddScore(s, InpLQ_W, acc, ws);
   }

   // Fibonacci
   if(InpFIB_On)
   {
      int st = MathMax(0, got - InpFIB_LB);
      double hi = -DBL_MAX, lo = DBL_MAX; int hiI = 0, loI = 0;
      for(int i = st; i < got; i++)
      {
         if(r[i].high > hi) { hi = r[i].high; hiI = i - st; }
         if(r[i].low  < lo) { lo = r[i].low;  loI = i - st; }
      }
      double range = hi - lo;
      if(range > 0)
      {
         bool up = loI < hiI;
         double retr = up ? (hi - last) / range : (last - lo) / range;
         double s;
         if(retr < 0) s = up ? InpFIB_Break : -InpFIB_Break;
         else if(retr >= InpFIB_GMin && retr <= InpFIB_GMax) s = up ? InpFIB_Golden : -InpFIB_Golden;
         else if(retr < InpFIB_GMin) s = up ? InpFIB_Shallow : -InpFIB_Shallow;
         else s = up ? -InpFIB_Deep : InpFIB_Deep;
         AddScore(Clamp(s), InpFIB_W, acc, ws);
      }
   }

${customs.map((cm, i) => cmCalc(cm, i)).join('\n')}
   double raw = (ws > 0) ? acc / ws : 0.0;
   return Clamp(raw * sens * volFactor);
}

// Gabungkan timeframe aktif menjadi satu skor (padanan analyzeAll()).
bool Evaluate(double &score)
{
   double num = 0, den = 0, atrP = NA;
   for(int k = 0; k < 7; k++)
   {
      if(!g_tfOn[k]) continue;
      double a;
      double sens = (TF_SENS[k] < 0) ? InpSensitivity : TF_SENS[k];
      double sc = AnalyzeTf(TF_LIST[k], sens, a);
      if(!Ok(sc)) continue;
      num += sc * g_tfW[k]; den += g_tfW[k];
      if(TF_LIST[k] == InpPrimaryTf) atrP = a;
   }
   g_atr = atrP;
   if(den <= 0) return false;
   score = num / den;
   return true;
}

//--- Sesi perdagangan (jam UTC)
bool InSession()
{
   if(!InpSessOn) return true;
   MqlDateTime dt;
   TimeGMT(dt);
   int h = dt.hour;
   if(InpSessStart <= InpSessEnd) return (h >= InpSessStart && h < InpSessEnd);
   return (h >= InpSessStart || h < InpSessEnd);
}

//--- Posisi
int CountPos()
{
   int c = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == g_sym && PositionGetInteger(POSITION_MAGIC) == InpMagic) c++;
   }
   return c;
}

void CloseDir(const int dir)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != g_sym || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      long type = PositionGetInteger(POSITION_TYPE);
      if((dir > 0 && type == POSITION_TYPE_BUY) || (dir < 0 && type == POSITION_TYPE_SELL)) trade.PositionClose(tk);
   }
}

double CalcLots(const double slDist)
{
   double minL = SymbolInfoDouble(g_sym, SYMBOL_VOLUME_MIN), maxL = SymbolInfoDouble(g_sym, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(g_sym, SYMBOL_VOLUME_STEP);
   double lots = InpLot;
   if(InpLotMode == NC_LOT_RISK)
   {
      double tv = SymbolInfoDouble(g_sym, SYMBOL_TRADE_TICK_VALUE), ts = SymbolInfoDouble(g_sym, SYMBOL_TRADE_TICK_SIZE);
      if(tv > 0 && ts > 0 && slDist > 0)
      {
         double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * InpRiskPct / 100.0;
         double lossPerLot = slDist / ts * tv;
         if(lossPerLot > 0) lots = riskMoney / lossPerLot;
      }
   }
   if(step > 0) lots = MathFloor(lots / step) * step;
   lots = MathMin(lots, InpMaxLot);
   lots = MathMax(minL, MathMin(maxL, lots));
   return NormalizeDouble(lots, 2);
}

void OpenTrade(const int dir)
{
   if(!Ok(g_atr) || g_atr <= 0) return;
   int digits = (int)SymbolInfoInteger(g_sym, SYMBOL_DIGITS);
   double pt = SymbolInfoDouble(g_sym, SYMBOL_POINT);
   double ask = SymbolInfoDouble(g_sym, SYMBOL_ASK), bid = SymbolInfoDouble(g_sym, SYMBOL_BID);
   double minDist = (double)SymbolInfoInteger(g_sym, SYMBOL_TRADE_STOPS_LEVEL) * pt;
   double risk = MathMax(g_atr * InpSlAtrMult, minDist + pt);
   double price = (dir > 0) ? ask : bid;
   double sl = (dir > 0) ? price - risk : price + risk;
   double tp = (dir > 0) ? price + risk * InpRR : price - risk * InpRR;
   sl = NormalizeDouble(sl, digits); tp = NormalizeDouble(tp, digits);
   double lots = CalcLots(risk);
   bool ok = (dir > 0) ? trade.Buy(lots, g_sym, 0, sl, tp, InpComment) : trade.Sell(lots, g_sym, 0, sl, tp, InpComment);
   if(ok) g_lastEntry = g_lastBar;
   else PrintFormat("NETCHECK EA: order gagal (%d) %s", trade.ResultRetcode(), trade.ResultRetcodeDescription());
}

void ManageTrailing()
{
   if(!InpUseTrail || !Ok(g_atr)) return;
   int digits = (int)SymbolInfoInteger(g_sym, SYMBOL_DIGITS);
   double pt = SymbolInfoDouble(g_sym, SYMBOL_POINT);
   double minDist = (double)SymbolInfoInteger(g_sym, SYMBOL_TRADE_STOPS_LEVEL) * pt;
   double bid = SymbolInfoDouble(g_sym, SYMBOL_BID), ask = SymbolInfoDouble(g_sym, SYMBOL_ASK);
   double dist = MathMax(g_atr * InpTrailAtr, minDist + pt);
   double startProfit = InpTrailStart * InpSlAtrMult * g_atr;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != g_sym || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      long type = PositionGetInteger(POSITION_TYPE);
      double op = PositionGetDouble(POSITION_PRICE_OPEN), sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
      if(type == POSITION_TYPE_BUY)
      {
         if(bid - op < startProfit) continue;
         double nsl = NormalizeDouble(bid - dist, digits);
         if((sl == 0 || nsl > sl + pt) && bid - nsl >= minDist) trade.PositionModify(tk, nsl, tp);
      }
      else
      {
         if(op - ask < startProfit) continue;
         double nsl = NormalizeDouble(ask + dist, digits);
         if((sl == 0 || nsl < sl - pt) && nsl - ask >= minDist) trade.PositionModify(tk, nsl, tp);
      }
   }
}

//--- Event handler
int OnInit()
{
   g_sym = (InpSymbol == "") ? _Symbol : InpSymbol;
   if(!SymbolSelect(g_sym, true)) { Print("NETCHECK EA: simbol tidak ditemukan: ", g_sym); return INIT_FAILED; }
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippage);
   trade.SetTypeFillingBySymbol(g_sym);
${TF_ORDER.map((k, i) => `   g_tfOn[${i}] = InpTF_${k}; g_tfW[${i}] = InpW_${k};`).join('\n')}
   PrintFormat("NETCHECK EA siap: %s, TF utama %s", g_sym, EnumToString(InpPrimaryTf));
   return INIT_SUCCEEDED;
}

void OnTick()
{
   ManageTrailing();
   datetime bt = iTime(g_sym, InpPrimaryTf, 0);
   if(bt == 0 || bt == g_lastBar) return;      // analisis sekali per bar baru
   g_lastBar = bt;

   double score;
   if(!Evaluate(score)) return;
   int sig = (score >= InpThreshold) ? 1 : ((score <= -InpThreshold) ? -1 : 0);
   if(sig == 0) return;
   if(InpDirection == NC_BUY_ONLY && sig < 0) return;
   if(InpDirection == NC_SELL_ONLY && sig > 0) return;

   if(InpCloseOpp) CloseDir(-sig);
   if(!InSession()) return;                   // di luar sesi: tidak ada entri baru
   if(CountPos() >= InpMaxPos) return;
   int secs = PeriodSeconds(InpPrimaryTf);
   if(g_lastEntry > 0 && secs > 0 && (bt - g_lastEntry) / secs < InpCooldown) return;
   if(InpMaxSpread > 0)
   {
      double sp = (SymbolInfoDouble(g_sym, SYMBOL_ASK) - SymbolInfoDouble(g_sym, SYMBOL_BID)) / SymbolInfoDouble(g_sym, SYMBOL_POINT);
      if(sp > InpMaxSpread) return;
   }
   OpenTrade(sig);
}
//+------------------------------------------------------------------+
`;
}

// Pemeriksaan ringan sebelum kompilasi (bukan pengganti MetaEditor).
export function precheck(src) {
  const issues = [];
  const stack = [], pairs = { ')': '(', ']': '[', '}': '{' };
  let i = 0, line = 1;
  while (i < src.length) {
    const ch = src[i], two = src.slice(i, i + 2);
    if (two === '//') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (ch === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') i++; i++; } i++; continue; }
    if (ch === '\n') line++;
    if ('([{'.includes(ch)) stack.push([ch, line]);
    else if (')]}'.includes(ch)) {
      const t = stack.pop();
      if (!t || t[0] !== pairs[ch]) { issues.push(`Kurung "${ch}" tidak seimbang di baris ${line}`); break; }
    }
    i++;
  }
  if (stack.length) issues.push(`Kurung "${stack.at(-1)[0]}" dari baris ${stack.at(-1)[1]} belum ditutup`);
  for (const f of ['int OnInit()', 'void OnTick()', '#include <Trade/Trade.mqh>']) if (!src.includes(f)) issues.push(`Tidak ada: ${f}`);
  return issues;
}

export const compileBat = base => `@echo off
rem Kompilasi ${base}.mq5 -> ${base}.ex5 memakai MetaEditor (jalan di Windows / Winlator).
rem Ubah MT5 di bawah bila MetaTrader 5 dipasang di folder lain.
set "MT5=C:\\Program Files\\MetaTrader 5"
set "SRC=%~dp0${base}.mq5"
"%MT5%\\MetaEditor64.exe" /compile:"%SRC%" /log
echo.
echo Selesai. Jika berhasil, file ${base}.ex5 ada di folder yang sama.
echo Log kompilasi: %~dp0${base}.log
pause
`;
