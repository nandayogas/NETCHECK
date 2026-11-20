# NdaxTrade (fitur di dalam NETCHECK)

Fitur NdaxTrade di APK utama membaca konfigurasi dari Worker (`GET /api/ndax/config`) setiap 30 detik. Perubahan berlaku tanpa build ulang.

- Menu **NdaxTrade** ada di tab Tools.
- Harga dan candle diambil langsung dari Binance publik. Tidak ada data dummy.
- Konfigurasi diatur dari aplikasi **NdaxTrade Dev**, yang sekarang berada di repo **NETCHECK-Developer** (folder `ndaxtrade/`).
- `src/ndax/config.js` berisi `NDAX_API` (URL Worker) dan nilai default. Jika Worker diganti, ubah juga URL di sini.

## Metode tambahan
Metode tambahan dibuat di NdaxTrade Dev dan dibaca dari konfigurasi yang sama. Tipe yang didukung dibatasi ke daftar `CUSTOM_TYPES` di `src/ndax/config.js`, karena setiap tipe harus punya padanan di generator MQL5 (`src/ea/mql.js`).

## Catatan
- Sinyal berasal dari aturan teknikal dan tidak menjamin hasil. Ini bukan nasihat keuangan.
- Analisis berjalan saat halaman NdaxTrade terbuka. Android dapat menghentikan WebView di latar belakang.
- Binance dapat dibatasi di beberapa wilayah. Ganti `baseUrl` di konfigurasi bila perlu.
