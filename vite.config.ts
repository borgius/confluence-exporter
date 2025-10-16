import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        // Node.js built-ins
        'fs',
        'path',
        'url',
        'util',
        'stream',
        'crypto',
        'events',
        'buffer',
        'process',
        // Dependencies
        'dotenv',
      ],
    },
    outDir: 'dist',
    sourcemap: true,
    target: 'node18',
    minify: false,
  },
  resolve: {
    alias: {
      '@/cleanupRules': resolve(__dirname, './src/transform/cleanupRules'),
      '@/cleanup': resolve(__dirname, './src/services/markdownCleanupService'),
    },
  },
  // Optimize dependencies for Node.js
  optimizeDeps: {
    disabled: true,
  },
  ssr: {
    noExternal: true,
  },
});
