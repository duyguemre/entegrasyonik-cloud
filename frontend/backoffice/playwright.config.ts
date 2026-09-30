// Backoffice duman testleri. Backend YOK: uygulama dev sunucusunda sahte /admin-api ile çalışır (src/api/mock).
// Bulutta: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test -c backoffice/playwright.config.ts --update-snapshots=missing
// Görsel tabanlar Windows'ta üretilir (*-win32.png); *-linux.png git-ignored.
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.BO_E2E_PORT) || 3150
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  workers: process.env.CI ? undefined : 3,
  reporter: [['list']],
  timeout: 45_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' } },
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', launchOptions },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/giris`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'light' } },
    { name: 'chromium-desktop-dark', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
    { name: 'chromium-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, colorScheme: 'light', hasTouch: true } },
  ],
})
