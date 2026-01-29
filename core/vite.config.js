import { defineConfig } from 'vite';

export default defineConfig({
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
