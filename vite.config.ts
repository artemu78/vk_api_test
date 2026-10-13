import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'VK API Probe',
        short_name: 'VK Probe',
        description: 'Проверка доступности VK с текущего устройства и сети',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone'
      }
    })
  ]
});
