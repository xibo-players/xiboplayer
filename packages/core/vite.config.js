import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  base: '/player/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
        setup: './setup.html'
      },
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist']
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false
  },
  plugins: [
    {
      name: 'copy-pdfjs-worker',
      closeBundle() {
        // Copy PDF.js worker to dist after build
        try {
          // Try local node_modules first, then parent (workspace root)
          let workerSrc = join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
          if (!existsSync(workerSrc)) {
            workerSrc = join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
          }

          const workerDest = join(__dirname, 'dist', 'pdf.worker.min.mjs');
          mkdirSync(dirname(workerDest), { recursive: true });
          copyFileSync(workerSrc, workerDest);
          console.log('✓ Copied PDF.js worker to dist/');
        } catch (error) {
          console.warn('⚠ Could not copy PDF.js worker:', error.message);
        }
      }
    }
  ]
});
