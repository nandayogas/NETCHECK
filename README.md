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
