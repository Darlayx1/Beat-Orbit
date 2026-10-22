import { defineConfig } from '@playwright/test';
const basePath = process.env.VITE_BASE_PATH || '/';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173' + basePath;
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    channel: process.env.CI ? 'chromium' : 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
  },
  projects: [
    { name: 'desktop-chrome', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-landscape-chrome', use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: process.env.CI ? 'npm run preview -- --port 4173 --strictPort' : 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
