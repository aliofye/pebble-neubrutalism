import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built output is served by ../serve.js at /app/ (same route the legacy
// shell used). Base './' keeps asset paths relative so the server can mount
// the dist dir anywhere.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../app-dist',
    emptyOutDir: true,
  },
  server: {
    port: 8138,
    proxy: {
      '/api': 'http://localhost:8137',
    },
  },
});
