import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import packageJson from './package.json';

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
  },
  plugins: [react(), vue()],
  test: {
    setupFiles: ['./src/test/setup.ts'],
    // Windows CI UI tests take ~9s on cold workers; retain every assertion.
    testTimeout: process.env.CI && process.platform === 'win32' ? 15_000 : 5_000,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false
  }
});
