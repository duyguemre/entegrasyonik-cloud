// Aşama 0 / R13 — ÜRETİM DERLEMESİ duman testi (`vite preview` + headless Chromium).
// Neden ayrı: `playwright.config.ts` `vite dev`'e karşı koşar ve chunk/manualChunks/modulepreload
// yolunu (üretim derlemesi) TEST ETMEZ; chunk bölme değişiklikleri yalnızca burada yakalanır.
// Kullanım: `npm run test:preview-smoke` (önce `vite build` çalıştırır). Backend YOK; `/api/**` mock'lu.
import { defineConfig, devices } from '@playwright/test'

// MOB-01 (e2e/preview/pwa.spec.ts): Chromium'da service worker'ın kendi ağ istekleri `context.route`'a yalnız bu bayrakla
// gelir (çevrimdışı ekranı testi). Duman testi SW'yi engellediği için etkilenmez.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= '1'

const PORT = Number(process.env.E2E_PREVIEW_PORT) || 4400
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e/preview',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
})
