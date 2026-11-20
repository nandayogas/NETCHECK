// Mode TRAILING REVERSE (stop-and-reverse), meniru pola order di video referensi:
//  - Selalu 1 posisi + 1 pending stop berlawanan yang menempel dekat harga dan ikut bergerak searah profit.
//  - Pending kena = posisi lama ditutup, posisi baru berbalik arah.
//  - Awal: BUY STOP di atas dan SELL STOP di bawah harga (opsi "a", tanpa analisa). Yang kena duluan jadi posisi pertama.
//  - Setelah posisi terbuka, SL ikut harga (trailing) begitu profit mencapai N pip.
// Tidak memakai mesin analisis NetCheck dan tidak bergantung pada timeframe chart: logikanya jalan per tick.
// Lot selalu tetap.

export const REV_DEFAULTS = {
  pipPoints: 10,          // 1 pip = 10 points (XAUUSD 2 digit: 1 pip = 0,10 USD)
  distPips: 3,            // jarak pending dari harga
  stepPips: 1,            // pending / SL baru digeser bila selisih >= ini (hemat request ke server)
  slPips: 15,             // SL awal posisi
  trailOn: true,          // SL ikut harga
  trailStartPips: 10,     // SL mulai ikut saat profit >= ini
  trailDistPips: 5,       // jarak SL dari harga setelah ikut
  trailBufPips: 1,        // SL minimal di atas/bawah harga entri (kunci profit kecil)
  reverse: true,          // pending kena = balik arah
  maxFlipsHour: 30,       // batas balik arah per jam (0 = tanpa batas)
  dailyLossPct: 5,        // batas rugi harian % saldo awal hari (0 = mati)
};

const b = v => (v ? 'true' : 'false');
const n = v => String(Number(v));
const safeName = s => (String(s || 'NetCheckTrev').replace(/[^A-Za-z0-9_]/g, '') || 'NetCheckTrev').slice(0, 40);

export function buildTrailRev(s) {
  const r = { ...REV_DEFAULTS, ...(s.rev || {}) };
  const name = safeName(s.name);
  return `//+------------------------------------------------------------------+
//| ${name}.mq5
//| Dibuat oleh NETCHECK EA BUILDER · Mode: TRAILING REVERSE (stop-and-reverse)
//| Instrumen: ${s.symbol} · MetaTrader 5 (kompatibel Winlator)
//| Cara kerja: BUY STOP + SELL STOP dipasang dekat harga. Yang kena jadi posisi,
//| lalu pending berlawanan ikut harga di belakangnya. Pending kena = balik arah.
//| SL posisi ikut harga setelah profit mencapai InpTrailStartPips.
//| PERINGATAN: trading berisiko tinggi. Uji di akun demo / Strategy Tester dulu.
//| Akun hedging: posisi lama ditutup EA saat posisi balik terbuka.
//| Akun netting: volume pending balik = 2 x lot agar posisi benar-benar berbalik.
//+------------------------------------------------------------------+
#property copyright "NETCHECK"
#property version   "1.00"
#property description "Trailing Reverse: BUY STOP / SELL STOP menempel harga, balik arah saat kena"
#include <Trade/Trade.mqh>

//--- Umum
input string InpSymbol      = "";                 // Simbol (kosong = simbol chart)
input long   InpMagic       = ${n(s.magic)};      // Magic number
input string InpComment     = "NETCHECK-TREV";    // Komentar order
input double InpLot         = ${n(s.lot)};        // Lot tetap
input int    InpSlippage    = ${n(s.slippage)};   // Slippage (points)
input int    InpMaxSpread   = ${n(s.maxSpread)};  // Spread maksimum (points), 0 = tanpa batas

//--- Satuan pip
input int    InpPipPoints   = ${n(r.pipPoints)};  // 1 pip = berapa points (XAUUSD 2 digit: 10 = 0,10 USD)

//--- Pending (BUY STOP / SELL STOP)
input double InpDistPips    = ${n(r.distPips)};   // Jarak pending dari harga (pips)
input double InpStepPips    = ${n(r.stepPips)};   // Geser pending/SL hanya bila selisih >= ini (pips)
input bool   InpReverse     = ${b(r.reverse)};    // Pending kena = balik arah (false = hanya keluar lewat SL, lalu pasang ulang)

//--- Stop loss
input double InpSlPips         = ${n(r.slPips)};          // SL awal posisi (pips)
input bool   InpTrailOn        = ${b(r.trailOn)};         // SL ikut harga
input double InpTrailStartPips = ${n(r.trailStartPips)};  // SL mulai ikut saat profit >= (pips)
input double InpTrailDistPips  = ${n(r.trailDistPips)};   // Jarak SL dari harga setelah ikut (pips)
input double InpTrailBufPips   = ${n(r.trailBufPips)};    // SL minimal di atas/bawah harga entri (pips)

//--- Pengaman
input int    InpMaxFlipsHour = ${n(r.maxFlipsHour)};      // Maks balik arah per jam (0 = tanpa batas)
input double InpDailyLossPct = ${n(r.dailyLossPct)};      // Batas rugi harian % saldo awal hari (0 = mati)

CTrade   trade;
string   g_sym;
double   g_pt = 0, g_pip = 0;
int      g_digits = 2;
bool     g_hedge = true;
bool     g_hadPos = false;
int      g_lastDir = 0;
int      g_flips = 0;
long     g_hourKey = -1, g_dayKey = -1;
double   g_dayBal = 0;
bool     g_halt = false;

double Pips(const double p) { return p * g_pip; }
double Nrm(const double price) { return NormalizeDouble(price, g_digits); }

double NormVol(double v)
{
   double mn = SymbolInfoDouble(g_sym, SYMBOL_VOLUME_MIN);
   double mx = SymbolInfoDouble(g_sym, SYMBOL_VOLUME_MAX);
   double st = SymbolInfoDouble(g_sym, SYMBOL_VOLUME_STEP);
   if(st > 0) v = MathFloor(v / st + 1e-9) * st;
   v = MathMax(mn, MathMin(mx, v));
   int vd = 0;
   for(double t = st; t > 0 && t < 1.0 - 1e-9 && vd < 8; t *= 10.0) vd++;
   return NormalizeDouble(v, vd);
}

// Jarak minimum dari harga untuk pending / SL menurut broker (stops level & freeze level).
double MinDist()
{
   double lv = (double)SymbolInfoInteger(g_sym, SYMBOL_TRADE_STOPS_LEVEL);
   double fr = (double)SymbolInfoInteger(g_sym, SYMBOL_TRADE_FREEZE_LEVEL);
   return (MathMax(lv, fr) + 1.0) * g_pt;
}

int OnInit()
{
   g_sym = (InpSymbol == "") ? _Symbol : InpSymbol;
   if(!SymbolSelect(g_sym, true)) { Print("Simbol tidak ditemukan: ", g_sym); return INIT_FAILED; }
   g_pt = SymbolInfoDouble(g_sym, SYMBOL_POINT);
   g_digits = (int)SymbolInfoInteger(g_sym, SYMBOL_DIGITS);
   g_pip = InpPipPoints * g_pt;
   g_hedge = ((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE) == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippage);
   trade.SetTypeFillingBySymbol(g_sym);
   if(InpPipPoints <= 0 || InpLot <= 0) { Print("InpPipPoints dan InpLot harus > 0"); return INIT_PARAMETERS_INCORRECT; }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) Print("Peringatan: Algo Trading belum aktif di terminal.");
   Print("Trailing Reverse aktif di ", g_sym, " · 1 pip = ", DoubleToString(g_pip, g_digits), " · akun ", g_hedge ? "hedging" : "netting");
   return INIT_SUCCEEDED;
}

// Hitung posisi milik EA. Data posisi TERBARU dikembalikan lewat parameter.
int ScanPositions(int &dir, ulong &tkt, double &open, double &sl)
{
   int cnt = 0; long newest = -1;
   dir = 0; tkt = 0; open = 0; sl = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != g_sym || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      cnt++;
      long tm = PositionGetInteger(POSITION_TIME_MSC);
      if(tm >= newest)
      {
         newest = tm; tkt = t;
         dir  = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1 : -1;
         open = PositionGetDouble(POSITION_PRICE_OPEN);
         sl   = PositionGetDouble(POSITION_SL);
      }
   }
   return cnt;
}

void CloseOthers(const ulong keep)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0 || t == keep) continue;
      if(PositionGetString(POSITION_SYMBOL) != g_sym || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      trade.PositionClose(t);
   }
}

void CloseAll() { CloseOthers(0); }

ulong FindPending(const ENUM_ORDER_TYPE type, double &price)
{
   price = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != g_sym || OrderGetInteger(ORDER_MAGIC) != InpMagic) continue;
      if((ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE) != type) continue;
      price = OrderGetDouble(ORDER_PRICE_OPEN);
      return t;
   }
   return 0;
}

void DeletePending(const ENUM_ORDER_TYPE type)
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != g_sym || OrderGetInteger(ORDER_MAGIC) != InpMagic) continue;
      if((ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE) != type) continue;
      trade.OrderDelete(t);
   }
}

void DeleteAllPending()
{
   DeletePending(ORDER_TYPE_BUY_STOP);
   DeletePending(ORDER_TYPE_SELL_STOP);
}

void OnDeinit(const int reason)
{
   if(reason == REASON_REMOVE) DeleteAllPending();
}

// Pasang satu pending, atau geser bila sudah ada. Pending hanya bergerak MENDEKATI harga:
// BUY STOP hanya turun, SELL STOP hanya naik. SL awal posisi ikut dipasang di pending.
void KeepPending(const bool isBuy, const double vol)
{
   double bid = SymbolInfoDouble(g_sym, SYMBOL_BID), ask = SymbolInfoDouble(g_sym, SYMBOL_ASK);
   if(bid <= 0 || ask <= 0) return;
   double d = MathMax(Pips(InpDistPips), MinDist());
   double step = Pips(InpStepPips);
   double cur = 0;
   ulong t = FindPending(isBuy ? ORDER_TYPE_BUY_STOP : ORDER_TYPE_SELL_STOP, cur);
   double want = Nrm(isBuy ? ask + d : bid - d);
   double sl = Nrm(isBuy ? want - Pips(InpSlPips) : want + Pips(InpSlPips));
   if(t == 0)
   {
      if(isBuy) trade.BuyStop(vol, want, g_sym, sl, 0.0, ORDER_TIME_GTC, 0, InpComment);
      else      trade.SellStop(vol, want, g_sym, sl, 0.0, ORDER_TIME_GTC, 0, InpComment);
      return;
   }
   bool closer = isBuy ? (want <= cur - step) : (want >= cur + step);
   if(closer) trade.OrderModify(t, want, sl, 0.0, ORDER_TIME_GTC, 0);
}

// SL awal (bila belum ada) dan SL ikut harga setelah profit >= InpTrailStartPips. SL hanya bergerak searah profit.
void ManagePosition(const int dir, const ulong tkt, const double open, const double sl)
{
   double bid = SymbolInfoDouble(g_sym, SYMBOL_BID), ask = SymbolInfoDouble(g_sym, SYMBOL_ASK);
   if(bid <= 0 || ask <= 0) return;
   double step = Pips(InpStepPips), md = MinDist();
   if(dir > 0)
   {
      double cand = (sl > 0) ? sl : open - Pips(InpSlPips);
      if(InpTrailOn && bid - open >= Pips(InpTrailStartPips))
         cand = MathMax(cand, MathMax(open + Pips(InpTrailBufPips), bid - Pips(InpTrailDistPips)));
      cand = Nrm(cand);
      bool need = (sl <= 0) || (cand >= sl + step);
      if(need && cand <= bid - md) trade.PositionModify(tkt, cand, 0.0);
   }
   else
   {
      double cand = (sl > 0) ? sl : open + Pips(InpSlPips);
      if(InpTrailOn && open - ask >= Pips(InpTrailStartPips))
         cand = MathMin(cand, MathMin(open - Pips(InpTrailBufPips), ask + Pips(InpTrailDistPips)));
      cand = Nrm(cand);
      bool need = (sl <= 0) || (cand <= sl - step);
      if(need && cand >= ask + md) trade.PositionModify(tkt, cand, 0.0);
   }
}

void OnTick()
{
   datetime now = TimeCurrent();
   long dk = (long)(now / 86400), hk = (long)(now / 3600);
   if(dk != g_dayKey) { g_dayKey = dk; g_dayBal = AccountInfoDouble(ACCOUNT_BALANCE); g_halt = false; }
   if(hk != g_hourKey) { g_hourKey = hk; g_flips = 0; }
   if(g_halt) return;

   if(InpDailyLossPct > 0 && AccountInfoDouble(ACCOUNT_EQUITY) <= g_dayBal * (1.0 - InpDailyLossPct / 100.0))
   {
      CloseAll(); DeleteAllPending(); g_halt = true;
      Print("Batas rugi harian tercapai. EA berhenti sampai hari berikutnya.");
      return;
   }

   int dir; ulong tkt; double open, sl;
   int cnt = ScanPositions(dir, tkt, open, sl);
   if(cnt > 1) { CloseOthers(tkt); cnt = 1; }   // akun hedging: sisakan posisi terbaru (hasil balik arah)
   bool havePos = (cnt > 0);
   if(havePos != g_hadPos) { DeleteAllPending(); g_hadPos = havePos; }   // ganti fase: bersihkan pending lama

   long spr = SymbolInfoInteger(g_sym, SYMBOL_SPREAD);
   bool spreadOk = (InpMaxSpread <= 0 || spr <= InpMaxSpread);
   bool limitHit = (InpMaxFlipsHour > 0 && g_flips >= InpMaxFlipsHour);

   if(havePos)
   {
      if(dir != g_lastDir) { if(g_lastDir != 0) g_flips++; g_lastDir = dir; }
      ManagePosition(dir, tkt, open, sl);
      DeletePending(dir > 0 ? ORDER_TYPE_BUY_STOP : ORDER_TYPE_SELL_STOP);   // pending searah posisi tidak dipakai
      if(InpReverse && !limitHit && spreadOk)
         KeepPending(dir < 0, NormVol((g_hedge ? 1.0 : 2.0) * InpLot));      // pending berlawanan = balik arah
      else
         DeleteAllPending();
   }
   else
   {
      g_lastDir = 0;
      if(!spreadOk || limitHit) { DeleteAllPending(); return; }
      double v = NormVol(InpLot);
      KeepPending(true, v);
      KeepPending(false, v);
   }
}
//+------------------------------------------------------------------+
`;
}

// ---------- Backtest ----------
// Data candle M1 tidak menyimpan urutan harga di dalam candle. Zigzag mulus O -> L -> H -> C terlalu menguntungkan
// strategi stop-and-reverse (tidak ada pantulan kecil yang memicu balik arah palsu), jadi tiap candle dipecah menjadi
// jalur tick buatan: random walk (jembatan Brownian) dari Open ke Close yang dipetakan agar tepat menyentuh High dan Low.
// Jalur dibangkitkan dari nomor bar, jadi hasil sama setiap dijalankan. Tetap perkiraan kasar, bukan data tick asli.
// Harga candle dianggap harga BID; ASK = BID + spread. BUY masuk di ASK dan keluar di BID, SELL sebaliknya.
const CONTRACT = 100;   // XAUUSD: 1 lot = 100 oz
const TICKS = 120;      // jumlah tick buatan per candle M1

function microPath(k, seed) {
  const { o, h, l, c } = k;
  if (h - l < 1e-9) return [o, c];
  let st = seed >>> 0;
  const rnd = () => {
    st = (st + 0x6D2B79F5) >>> 0;
    let x = st;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const w = [0];
  for (let i = 1; i <= TICKS; i++) w.push(w[i - 1] + (rnd() - 0.5));
  const sc = (h - l) / 3;
  const x = w.map((v, i) => o + (c - o) * i / TICKS + (v - w[TICKS] * i / TICKS) * sc);
  const lo = Math.min(o, c), hi = Math.max(o, c);
  let rmin = Math.min(...x), rmax = Math.max(...x);
  const f = p => {
    if (p <= lo) return rmin < lo ? l + (p - rmin) * (lo - l) / (lo - rmin) : lo;
    if (p >= hi) return rmax > hi ? hi + (p - hi) * (h - hi) / (rmax - hi) : hi;
    return p;
  };
  return x.map(f);
}

export function simulateTrev(bars, s) {
  const r = { ...REV_DEFAULTS, ...(s.rev || {}) };
  const pip = r.pipPoints * 0.01;          // asumsi 1 point = 0,01 USD (XAUUSD 2 digit)
  const sp = s.bt.spread, lots = s.lot;
  const dist = r.distPips * pip, step = r.stepPips * pip, slD = r.slPips * pip;
  const tStart = r.trailStartPips * pip, tDist = r.trailDistPips * pip, tBuf = r.trailBufPips * pip;
  const PX = 0.02;                         // resolusi jalur harga (USD)
  let bal = s.bt.balance, peak = bal, maxDD = 0;
  let pos = null, buy = null, sell = null, flips = 0, hourKey = -1, dayKey = -1, dayBal = bal, halt = false;
  let flipTotal = 0, lastT = 0;
  const trades = [], curve = [{ t: bars[0] && bars[0].t, v: bal }];

  const closeAt = (price, t, why) => {
    const pnl = (pos.dir > 0 ? price - pos.entry : pos.entry - price) * lots * CONTRACT;
    bal += pnl;
    trades.push({ dir: pos.dir, entry: pos.entry, exit: price, lots, pnl, t0: pos.t0, t1: t, why });
    pos = null;
  };
  const open = (dir, price, t, bid, ask, revOn) => {
    pos = { dir, entry: price, t0: t, sl: dir > 0 ? price - slD : price + slD, rev: null };
    if (revOn) pos.rev = dir > 0 ? bid - dist : ask + dist;
  };

  const tick = (bid, t) => {
    const ask = bid + sp;
    const hk = Math.floor(t / 3.6e6), dk = Math.floor(t / 864e5);
    if (dk !== dayKey) { dayKey = dk; dayBal = bal; halt = false; }
    if (hk !== hourKey) { hourKey = hk; flips = 0; }
    if (halt) return;
    const eq = bal + (pos ? (pos.dir > 0 ? bid - pos.entry : pos.entry - ask) * lots * CONTRACT : 0);
    if (r.dailyLossPct > 0 && eq <= dayBal * (1 - r.dailyLossPct / 100)) {
      if (pos) closeAt(pos.dir > 0 ? bid : ask, t, 'Batas harian');
      buy = sell = null; halt = true; return;
    }
    const limitHit = r.maxFlipsHour > 0 && flips >= r.maxFlipsHour;
    const revOn = r.reverse && !limitHit;

    if (!pos) {
      if (limitHit) { buy = sell = null; return; }
      if (buy == null) { buy = ask + dist; sell = bid - dist; }
      if (ask >= buy) { open(1, ask, t, bid, ask, revOn); buy = sell = null; return; }
      if (bid <= sell) { open(-1, bid, t, bid, ask, revOn); buy = sell = null; return; }
      if (ask + dist <= buy - step) buy = ask + dist;
      if (bid - dist >= sell + step) sell = bid - dist;
      return;
    }

    if (pos.dir > 0) {
      if (bid <= pos.sl) { closeAt(bid, t, 'SL'); return; }
      if (revOn && pos.rev != null && bid <= pos.rev) {
        closeAt(bid, t, 'Balik'); flips++; flipTotal++;
        open(-1, bid, t, bid, ask, revOn); return;
      }
      if (r.trailOn && bid - pos.entry >= tStart) {
        const cand = Math.max(pos.entry + tBuf, bid - tDist);
        if (cand >= pos.sl + step) pos.sl = cand;
      }
      if (!revOn) pos.rev = null;
      else { const want = bid - dist; if (pos.rev == null || want >= pos.rev + step) pos.rev = want; }
    } else {
      if (ask >= pos.sl) { closeAt(ask, t, 'SL'); return; }
      if (revOn && pos.rev != null && ask >= pos.rev) {
        closeAt(ask, t, 'Balik'); flips++; flipTotal++;
        open(1, ask, t, bid, ask, revOn); return;
      }
      if (r.trailOn && pos.entry - ask >= tStart) {
        const cand = Math.min(pos.entry - tBuf, ask + tDist);
        if (cand <= pos.sl - step) pos.sl = cand;
      }
      if (!revOn) pos.rev = null;
      else { const want = ask + dist; if (pos.rev == null || want <= pos.rev - step) pos.rev = want; }
    }
  };

  for (let bi = 0; bi < bars.length; bi++) {
    const k = bars[bi];
    for (const px of microPath(k, bi * 2654435761 + 12345)) tick(px, k.t);
    lastT = k.t;
    const ask = k.c + sp;
    const eq = bal + (pos ? (pos.dir > 0 ? k.c - pos.entry : pos.entry - ask) * lots * CONTRACT : 0);
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak > 0 ? (peak - eq) / peak * 100 : 0);
    curve.push({ t: k.t, v: eq });
  }
  const last = bars[bars.length - 1];
  if (pos && last) closeAt(pos.dir > 0 ? last.c : last.c + sp, last.t, 'Akhir');

  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0);
  const gp = wins.reduce((a, t) => a + t.pnl, 0), gl = -losses.reduce((a, t) => a + t.pnl, 0);
  const hours = bars.length ? Math.max(1, bars.length / 60) : 1;
  return {
    trades, curve, balance: bal, net: bal - s.bt.balance, netPct: (bal / s.bt.balance - 1) * 100,
    n: trades.length, winRate: trades.length ? wins.length / trades.length * 100 : 0,
    pf: gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0), maxDD,
    avgWin: wins.length ? gp / wins.length : 0, avgLoss: losses.length ? -gl / losses.length : 0,
    expectancy: trades.length ? (bal - s.bt.balance) / trades.length : 0,
    flips: flipTotal, flipsPerHour: flipTotal / hours, halted: halt, endT: lastT,
  };
}
