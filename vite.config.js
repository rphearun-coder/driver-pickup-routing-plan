import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The docker-compose nginx proxy forwards requests with Host: driver-tracker.local —
    // Vite 5's dev-server host check rejects any Host it doesn't recognize by default.
    allowedHosts: ['driver-tracker.local'],
  },
});
