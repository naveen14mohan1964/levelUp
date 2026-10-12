import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // dev only: the always-on app (PM2) uses 4000
    strictPort: true, // fail loudly instead of silently moving to another port
    host: true, // reachable from your phone on the same Wi-Fi
    proxy: { '/api': 'http://localhost:4001', '/uploads': 'http://localhost:4001' },
  },
});
