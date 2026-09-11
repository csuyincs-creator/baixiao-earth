import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// appv2.js / appv2.css / assets/ live in `public/` and are served verbatim.
// `assetsDir: 'build'` keeps Vite's emitted assets from colliding with
// public/assets (the earth textures).
export default defineConfig({
  server: {
    port: 5173,
    host: true,
    open: false
  },
  build: {
    outDir: 'dist',
    assetsDir: 'build',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        articles: resolve(__dirname, 'articles.html')
      }
    }
  }
});
