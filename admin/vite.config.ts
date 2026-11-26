import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

// The built dashboard is served by the API at /admin/ (and /api/admin/ behind the VPS nginx), so asset
// paths are relative. In development the API runs in Docker and is reached through the /api proxy.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../public/admin',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
});
