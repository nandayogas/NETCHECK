# NdaxTrade (fitur di dalam NETCHECK)

## Dua APK
| APK | Sumber | Isi |
|---|---|---|
| NETCHECK (utama) | `npm run build` / workflow **Build APK** yang sudah ada | Seluruh NETCHECK + menu **NdaxTrade** di tab Tools |
| NdaxTrade Dev | `npx vite build --mode ndaxdev` / workflow **Build NdaxTrade Dev APK** | Hanya aplikasi pengaturan, tanpa Firebase |

Jika APK utama ingin dinamai "NdaxTrade", ubah `appName` di `capacitor.config.json`. Ini hanya mengganti nama, tidak mengubah kode.

## Backend konfigurasi (sekali)
```
cd worker-ndaxtrade
npx wrangler kv namespace create NDAX_CFG   # salin id ke wrangler.toml
npx wrangler secret put DEV_TOKEN           # token untuk NdaxTrade Dev
npx wrangler deploy
```
Lalu isi URL Worker di `src/ndax/config.js` (`NDAX_API`).

## Alur
- NdaxTrade Dev menyimpan konfigurasi ke Worker (`PUT /api/config`, dilindungi token).
- APK utama mengambil konfigurasi (`GET /api/config`) setiap 30 detik. Perubahan berlaku tanpa build ulang.
- Harga dan candle diambil langsung dari Binance publik. Tidak ada data dummy.

## Yang dapat diatur di NdaxTrade Dev
- Market: simbol, base URL, interval refresh harga/analisis, jumlah candle.
- Sinyal: threshold BUY/SELL, sensitivitas, pengali SL (ATR), rasio TP, timeframe utama.
- Timeframe M1–D1: aktif/nonaktif, interval, bobot.
- 9 metode lain: aktif, bobot, dan parameternya (periode EMA, RSI, MACD, pivot S/R, volume, filter ATR, struktur BOS/CHoCH, liquidity).
- Fibonacci: aktif, bobot, lookback, daftar level, zona golden (min/max), dan skor tiap kondisi.

## Catatan
- Sinyal berasal dari aturan teknikal dan tidak menjamin hasil. Ini bukan nasihat keuangan.
- Analisis berjalan saat halaman NdaxTrade terbuka. Android dapat menghentikan WebView di latar belakang.
- Binance dapat dibatasi di beberapa wilayah. Ganti `baseUrl` di Dev bila perlu.
