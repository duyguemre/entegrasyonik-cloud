// MOB-06 — backoffice ÜRETİM DERLEMESİ PWA testleri (`vite preview`; sahte /admin-api üretim paketinde YOK → `/admin-api/**`
// Playwright ile karşılanır). Desen: uygulamanın playwright.preview.config.ts'i.
// Kullanım (frontend/): npm run build:backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test -c backoffice/playwright.preview.config.ts
import { defineConfig, devices } from '@playwright/test'

// Çevrimdışı testi: Chromium'da SW'nin kendi ağ istekleri `context.route`'a yalnız bu bayrakla gelir.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= '1'

const PORT = Number(process.env.BO_PREVIEW_PORT) || 4410
const baseURL = `http://127.0.0.1:${PORT}`
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}

export default defineConfig({
  testDir: './e2e/preview',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  use: { baseURL, trace: 'retain-on-failure', serviceWorkers: 'allow', launchOptions },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `${baseURL}/giris`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
})
