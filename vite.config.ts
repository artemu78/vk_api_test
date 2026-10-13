import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

const base = '/vk_api_test/';
export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    scope: base,
    includeAssets: ['icons/*.png'],
    manifest: {
      id: base,
      name: 'VK API Probe',
      short_name: 'VK Probe',
      lang: 'ru',
      description: 'Проверка доступности VK с текущего устройства и сети',
      start_url: base,
      scope: base,
      theme_color: '#111827',
      background_color: '#111827',
      display: 'standalone',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
      cleanupOutdatedCaches: true,
      navigateFallback: `${base}index.html`,
      navigateFallbackAllowlist: [/^\/vk_api_test\/(?:index\.html)?$/],
      // No runtime caching: cross-origin VK requests pass straight to the network.
      runtimeCaching: []
    }
  })]
});
