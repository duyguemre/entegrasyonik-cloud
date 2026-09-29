// ADR-0014 S0 — Playwright (smoke + 3 viewport ekran görüntüsü + axe). Desen: frontend/playwright.config.ts.
// Sunucu: `scripts/serve-e2e.mjs` = E2E derlemesi + `_headers` uygulayan statik sunucu (CSP gerçekten zorlanır).
import { defineConfig, devices } from '@playwright/test'

// Paralel worktree/oturumlarda port çakışmasın: `E2E_PORT=4381 npm run test:e2e` (site'a özel varsayılan 4381).
const PORT = Number(process.env.E2E_PORT) || 4381
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? undefined : 4,
  reporter: [['list']],
  timeout: 30_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: `node scripts/serve-e2e.mjs`,
    url: baseURL,
    // Başka bir oturumun eski derlemesini yeniden kullanıp sahte sonuç üretmesin.
    reuseExistingServer: false,
    timeout: 120_000,
    env: { E2E_PORT: String(PORT), ASTRO_TELEMETRY_DISABLED: '1' },
  },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'chromium-tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 800, height: 1024 } } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
})
