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
    strictPort: false,
    proxy: {
      // Proxy /xmds.php requests to avoid CORS
      '/xmds.php': {
        target: 'http://localhost',
        changeOrigin: true,
        configure: (proxy, options) => {
          // This will be overridden at runtime based on config
          // For now, requests will fail until we add dynamic proxy
        }
      }
    }
  }
});
