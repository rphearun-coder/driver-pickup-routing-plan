import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { generateDevHttpsCertificate } from './dev-https-cert.js';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    // HTTPS is required for navigator.geolocation to work at all when testing over a LAN
    // address (e.g. https://192.168.x.x:5173 on a phone) — browsers block it outright on
    // any non-HTTPS, non-localhost origin. See dev-https-cert.js for why this isn't just
    // @vitejs/plugin-basic-ssl. Your phone's browser will still show a one-time
    // "connection not private" warning for the self-signed cert — tap through it once.
    https: generateDevHttpsCertificate(),
  },
});
