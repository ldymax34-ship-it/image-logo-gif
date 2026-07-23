import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), vue()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gifMedia: fileURLToPath(new URL('./gif-media.html', import.meta.url))
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false
  }
});
