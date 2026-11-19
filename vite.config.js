import { defineConfig } from 'vite';
import { resolve } from 'path';
// `vite build`                  -> dist          (NETCHECK + fitur NdaxTrade, untuk APK utama; TANPA admin)
// `vite build --mode admin`     -> dist-admin    (panel admin, untuk hosting web)
export default defineConfig(({ mode }) => {
  const admin = mode === 'admin';
  const entry = admin ? 'admin.html' : 'index.html';
  const outDir = admin ? 'dist-admin' : 'dist';
  return {
    base: './',
    build: {
      outDir,
      rollupOptions: { input: resolve(__dirname, entry) }
    }
  };
});
