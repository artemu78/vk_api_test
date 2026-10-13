import { defineConfig } from '@playwright/test';
// Keep local preview checks local even on machines with an HTTP proxy.
process.env.NO_PROXY = [process.env.NO_PROXY, 'localhost', '127.0.0.1'].filter(Boolean).join(',');
export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://localhost:4173', channel: 'chrome', viewport: { width: 390, height: 844 } },
  webServer: { command: 'npm run preview -- --host localhost --port 4173 --strictPort', url: 'http://localhost:4173/vk_api_test/', reuseExistingServer: false }
});
