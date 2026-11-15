import { defineConfig } from 'vite';
import { resolve } from 'path';
// `vite build`              -> dist        (aplikasi, untuk APK; TANPA admin)
// `vite build --mode admin` -> dist-admin  (panel admin, untuk hosting web)
export default defineConfig(({ mode }) => {
  const admin = mode === 'admin';
  return {
    base: './',
    build: {
      outDir: admin ? 'dist-admin' : 'dist',
      rollupOptions: { input: resolve(__dirname, admin ? 'admin.html' : 'index.html') }
    }
  };
});
