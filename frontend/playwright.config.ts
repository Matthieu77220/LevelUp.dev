import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 4,
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', channel: 'msedge' } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host localhost --port 5174 --strictPort',
    url: 'http://localhost:5174',
    env: { VITE_API_URL: '/api/v1' },
    reuseExistingServer: false,
  },
})
