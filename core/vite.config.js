import { defineConfig } from 'vite';

export default defineConfig({
  base: '/player/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
        setup: './setup.html'
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
