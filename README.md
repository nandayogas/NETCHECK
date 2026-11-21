# NETCHECK

## 1. Firebase
1. Buat project di console.firebase.google.com, tambahkan Web app, salin config ke `src/firebase.js`.
2. Aktifkan Authentication > Email/Password, buat satu user admin.
3. Aktifkan Cloud Firestore, tempel isi `firestore.rules` di tab Rules.
4. Buat dokumen `admins/<UID user admin>` (isi field bebas, mis. `role: "admin"`). Dokumen `config/app` dibuat otomatis saat admin menyimpan.

## 2. Build APK (butuh Node 18+, JDK 17, Android Studio/SDK)
```
npm install
npm run build
npx cap add android
```
Buka `android/app/src/main/AndroidManifest.xml`, pastikan ada di atas `<application>`:
```
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE"/>
```
Lalu:
```
npm run apk      # hasil: android/app/build/outputs/apk/debug/app-debug.apk
```
Rilis: buka `android/` di Android Studio > Build > Generate Signed Bundle/APK.

## 3. Admin (di luar aplikasi)
Admin TIDAK ikut di APK. `npm run build` hanya membangun aplikasi ke `dist/`; admin dibangun terpisah ke `dist-admin/`.
```
npm install -g firebase-tools
firebase login
firebase use --add            # pilih project Firebase Anda (sekali saja)
npm run deploy:admin
```
Admin dibuka di `https://NAMA-PROJECT.web.app/admin.html`. Login memakai akun Email/Password yang UID-nya ada di koleksi `admins`. Untuk mencoba lokal: `npm run dev`, buka `http://localhost:5173/admin.html`.

## 4. Menambah fitur di "Fitur Lainnya"
Buat modul baru, daftarkan di `REGISTRY` pada `src/modules/more.js` dengan kunci id slot (mis. `slot1`). Admin lalu mengganti nama/deskripsi slot.

## 5. Tanpa komputer (hanya HP) — GitHub Actions
1. Buat akun github.com, buat repository baru, upload isi folder proyek (termasuk folder `.github`).
2. Edit `src/firebase.js` langsung di GitHub (ikon pensil), isi config Firebase, lalu Commit.
3. Tab **Actions** > **Build APK** > **Run workflow**. Tunggu ±5-10 menit, buka run yang selesai, unduh artifact `netcheck-apk` (zip berisi `app-debug.apk`).
4. Admin: **Settings > Pages > Source: GitHub Actions**, lalu Actions > **Deploy Admin** > Run workflow. Alamat: `https://USERNAME.github.io/NAMA-REPO/admin.html`.
5. Firebase Console > Authentication > Settings > **Authorized domains** > tambahkan `USERNAME.github.io`.

## 6. Login Google & Live Streaming
- **Login Google:** di Firebase Console > Authentication > Sign-in method, aktifkan **Google**. Tambahkan aplikasi Android (package `com.netcheck.app`), unduh `google-services.json` dan letakkan di root repo. Tambahkan SHA-1 keystore debug (lihat langkah di bawah) di pengaturan aplikasi Android.
- **SHA-1 tetap:** di komputer, jalankan `keytool -genkey -v -keystore netcheck-debug.keystore -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"`, lalu `keytool -list -v -keystore netcheck-debug.keystore -storepass android` untuk melihat SHA-1. Commit `netcheck-debug.keystore` ke repo.
- **Live Streaming:** ada di slot 1 "Fitur Lainnya". Ubah nama slot 1 menjadi "Live Streaming" di panel admin.
- **Aturan Firestore:** tempel ulang `firestore.rules` di tab Rules (aturan lama tetap, ditambah blok `live`).
- Sinyal WebRTC memakai STUN Google. Koneksi antarjaringan (mis. 4G ke WiFi) bisa gagal di beberapa operator tanpa server TURN.

## 7. NETCHECK EA BUILDER (Tools > EA Builder)
Membuat Expert Advisor MT5 (XAUUSD, BUY/SELL otomatis) dari mesin analisis NetCheck.
- **Strategi:** timeframe, bobot, ambang sinyal, dan metode dibaca dari konfigurasi NetCheck/NdaxTrade (`src/ndax/`), tidak diubah.
- **Risiko:** lot tetap atau % risiko, SL (ATR), TP (RR), trailing stop, maksimal posisi, jeda entri, spread.
- **Backtest:** memakai `analyzeAll()` yang sama pada data Binance (XAUUSDT sebagai proxy emas). Timeframe lebih kecil dari timeframe utama tidak ikut backtest.
- **AI Strategy Generator:** optimasi ambang/SL/RR lewat backtest, dengan data uji terpisah (70/30).
- **Kode & EX5:** unduh `.mq5` dan skrip `compile_*.bat`. EX5 hanya bisa dibuat MetaEditor (Windows/Winlator); opsional isi URL layanan compile HTTPS (POST `{filename, source}` -> EX5 biner atau `{ex5: base64, log}`).
- Kode ada di `src/ea/` (`mql.js` generator, `engine.js` backtest, `view.js` dashboard). Dependensi baru: `@capacitor/filesystem` dan `@capacitor/share` (untuk menyimpan/membagikan file di Android). Jalankan `npm install` lagi.

## 8. Mode Trailing Reverse (EA Builder > Strategi > Trailing Reverse)
Meniru pola order stop-and-reverse: selalu 1 posisi + 1 pending stop berlawanan yang menempel dekat harga dan ikut bergerak.
- **Awal:** EA memasang BUY STOP di atas dan SELL STOP di bawah harga (jarak `Jarak pending`, default 3 pip). Yang kena duluan jadi posisi pertama, yang lain dibatalkan.
- **Setelah posisi terbuka:** pending berlawanan dipasang tepat di belakang harga dan ikut searah profit (BUY STOP hanya turun, SELL STOP hanya naik). Pending kena = posisi lama ditutup dan posisi baru berbalik arah.
- **SL:** SL awal 15 pip. Begitu profit mencapai `Mulai ikut saat profit` (default 10 pip), SL ikut harga dengan jarak `Jarak SL dari harga` (default 5 pip), minimal `Kunci minimal di atas entri` di atas entri, dan tidak pernah mundur.
- **Lot tetap.** Tanpa analisa NetCheck dan tidak bergantung timeframe chart (logika per tick).
- **Pengaman:** filter spread, maksimal balik arah per jam, batas rugi harian (% saldo). Akun hedging: posisi lama ditutup EA saat posisi balik terbuka; akun netting: volume pending balik = 2 x lot.
- **Satuan pip:** XAUUSD 2 digit, 1 pip = 10 points = 0,10 USD (ubah `1 pip = berapa points` bila broker berbeda).
- **Backtest di aplikasi:** candle M1 dipecah menjadi tick buatan (random walk yang menyentuh high dan low tiap candle). Ini perkiraan kasar, sangat peka terhadap spread, slippage, dan jeda eksekusi. Uji di MT5 Strategy Tester (Every tick based on real ticks) dan akun demo sebelum memakai uang asli.
- Kode: `src/ea/trev.js` (default, generator MQL5, simulator).

## 9. Instrumen: Emas atau Bitcoin
Di EA Builder > Strategi > Instrumen & platform ada pilihan **Emas (XAUUSD)** dan **Bitcoin (BTCUSD)**. Satu pilihan itu mengatur simbol, data backtest Binance (BTCUSDT futures atau spot), ukuran kontrak, spread backtest, slippage, batas spread (points), dan nilai awal Trailing Reverse (1 pip = 1 USD untuk BTC).
- Semua angka hanyalah titik awal dan bisa diubah. Ukuran kontrak, digit harga, dan spread berbeda antar broker, jadi cek spesifikasi BTCUSD di MT5 dan sesuaikan `Kontrak`, `1 pip = berapa points`, dan `Spread`.
- Jarak pending Trailing Reverse sebaiknya minimal 2 sampai 3 kali spread normal broker.
- Mode swing, scalping, fast, dan straddle memakai ATR dan nilai tick broker, jadi otomatis ikut skala harga BTC.

## 10. Jarak pending otomatis (ATR) di Trailing Reverse
Jarak pending bisa mengikuti volatilitas: jarak = pengali x ATR (M1, periode 14), dijepit antara jarak minimum dan maksimum, lalu tidak kurang dari pengali x spread saat ini. Market liar membuat pending melebar sehingga flip palsu berkurang; market tenang membuatnya rapat. Pending yang sudah terpasang hanya bergeser mendekati harga, jarak baru berlaku untuk pending berikutnya. SL awal (minimal 2x jarak pending) dan SL ikut harga (minimal sama dengan jarak pending) menyesuaikan otomatis. Dimatikan lewat `Jarak pending mengikuti ATR M1` (EA kembali memakai jarak tetap).

## 11. Saran dan "Cari strategi terbaik" di Trailing Reverse
Tab Backtest mode Trailing Reverse punya dua tambahan:
- **Saran dari hasil backtest:** analisis otomatis berbasis aturan sederhana (expectancy, rata-rata menang vs kalah, balik arah per jam, jarak pending dibanding spread, drawdown). Ini bukan model AI.
- **Cari strategi terbaik:** grid search 24 kombinasi (pengali ATR, jarak minimum, batas balik arah per jam). Dipilih di 70% data pertama, 3 terbaik diuji di 30% data terakhir. Bila tidak ada kombinasi yang untung di data uji, aplikasi menyatakannya apa adanya. Tombol Terapkan menyalin kombinasi ke tab Risiko.


## 12. Mode Trailing Stop (EA Builder > Strategi > Trailing Stop)
Versi tanpa balik arah dari Trailing Reverse: satu posisi, tanpa pending berlawanan yang ikut mengejar harga.
- **Awal:** sama seperti Trailing Reverse. EA memasang BUY STOP di atas dan SELL STOP di bawah harga (jarak tetap atau otomatis mengikuti ATR M1). Yang kena duluan jadi posisi, sisi lawan dibatalkan.
- **Setelah posisi terbuka:** tidak ada pending berlawanan. SL awal dipasang, dan SL ikut harga setelah profit mencapai `Mulai ikut saat profit` dengan jarak `Jarak SL dari harga`, sama seperti Trailing Reverse.
- **Tutup dan pasang ulang:** posisi tutup saat SL kena (atau ditutup manual / batas rugi harian). Setelah itu EA memasang lagi BUY STOP dan SELL STOP.
- **Pengaturan:** memakai tab Risiko dan Backtest yang sama dengan Trailing Reverse (`s.rev`). Mode ini memaksa `reverse = false` di `revParams()` (`src/ea/trev.js`), jadi kotak "Pending kena = balik arah" dan "Maks balik arah per jam" disembunyikan. Mengubah jarak atau SL di salah satu mode juga mengubah mode lainnya.
- **Magic number:** sama dengan Trailing Reverse. Jangan jalankan keduanya di satu akun dan simbol yang sama bersamaan, atau ubah magic number salah satunya.
- **Kode:** generator MQL5 dan simulator memakai `buildTrailRev()` dan `simulateTrev()` yang sama dengan Trailing Reverse. Komentar order EA: `NETCHECK-TSTOP`.
- **Backtest:** perkiraan kasar dari candle M1, sama seperti Trailing Reverse. Uji di MT5 Strategy Tester (Every tick based on real ticks) dan akun demo.
