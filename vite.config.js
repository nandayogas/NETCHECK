import { defineConfig } from 'vite';
import { resolve } from 'path';
import { renameSync, existsSync } from 'fs';
// `vite build`                  -> dist          (NETCHECK + fitur NdaxTrade, untuk APK utama; TANPA admin)
// `vite build --mode admin`     -> dist-admin    (panel admin, untuk hosting web)
// `vite build --mode ndaxdev`   -> dist-ndaxdev  (aplikasi NdaxTrade Dev, APK terpisah)
export default defineConfig(({ mode }) => {
  const admin = mode === 'admin';
  const ndaxdev = mode === 'ndaxdev';
  const entry = ndaxdev ? 'ndaxdev.html' : admin ? 'admin.html' : 'index.html';
  const outDir = ndaxdev ? 'dist-ndaxdev' : admin ? 'dist-admin' : 'dist';
  return {
    base: './',
    build: {
      outDir,
      rollupOptions: { input: resolve(__dirname, entry) }
    },
    plugins: ndaxdev ? [{
      // Capacitor butuh index.html di webDir. Vite menghasilkan ndaxdev.html, jadi di-rename.
      name: 'ndaxdev-index-html',
      closeBundle() {
        const from = resolve(__dirname, outDir, 'ndaxdev.html');
        const to = resolve(__dirname, outDir, 'index.html');
        if (existsSync(from)) renameSync(from, to);
      }
    }] : []
  };
});
