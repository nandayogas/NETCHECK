// Profil instrumen EA Builder. Satu pilihan (Emas / BTC) mengatur simbol, data Binance, ukuran kontrak,
// satuan pip, spread backtest, dan nilai awal Trailing Reverse. Semua nilai masih bisa diubah manual.
// Catatan BTC: kontrak, digit, dan spread berbeda antar broker. Angka di bawah hanya titik awal, cek spesifikasi simbol di MT5.
export const INSTRUMENTS = {
  xau: {
    label: 'Emas (XAUUSD)', symbol: 'XAUUSD', dataSym: 'XAUUSDT', name: 'NetCheckXAU',
    contract: 100, unit: 'oz',          // 1 lot = 100 oz, jadi 1 USD gerak harga = 100 USD per lot
    pointUsd: 0.01,                     // 1 point = 0,01 USD (2 digit)
    spread: 0.25, spreadScale: 1, slippage: 30,
    pipNote: 'XAUUSD 2 digit: 1 pip = 10 points = 0,10 USD',
    rev: { pipPoints: 10, distPips: 3, stepPips: 1, slPips: 15, trailStartPips: 10, trailDistPips: 5, trailBufPips: 1 },
  },
  btc: {
    label: 'Bitcoin (BTCUSD)', symbol: 'BTCUSD', dataSym: 'BTCUSDT', name: 'NetCheckBTC',
    contract: 1, unit: 'BTC',           // umumnya 1 lot = 1 BTC (cek broker)
    pointUsd: 0.01,                     // 2 digit; bila broker 1 digit atau 0 digit, ubah "1 pip = berapa points"
    spread: 15, spreadScale: 60, slippage: 500,
    pipNote: 'BTCUSD 2 digit: 1 pip = 100 points = 1 USD',
    rev: { pipPoints: 100, distPips: 40, stepPips: 10, slPips: 150, trailStartPips: 100, trailDistPips: 50, trailBufPips: 10 },
  },
};
export const instOf = s => INSTRUMENTS[s && s.inst] || INSTRUMENTS.xau;
