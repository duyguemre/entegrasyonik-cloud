// Faz 3 T1b — Playwright altyapısı (ADR-0011 Karar 4 / Alternatif D2).
// Backend/Redis/Mongo YOK: tüm `/api/**` çağrıları e2e/fixtures/mockApi.ts ile mock'lanır.
// `vite dev` sunucusuna karşı çalışır (preview de kullanılabilir; dev seçildi çünkü ayrı bir
// `vite build` adımı gerektirmiyor ve HMR olmadan da testler deterministik çalışıyor).
import { defineConfig, devices } from '@playwright/test'

// [Orkestratör, 2026-09-28] Port artık `E2E_PORT` ortam değişkeniyle yapılandırılabilir. Paralel çalışan
// worktree'ler/oturumlar aynı 4300 portunu paylaşınca `reuseExistingServer` başkasının (eski kodlu) dev
// server'ını yeniden kullanıp yüzlerce SAHTE başarısızlık üretiyordu (bu oturumda 4+ kez yaşandı). Paralel
// çalışırken her oturum kendi portunu seçmeli: `E2E_PORT=4351 npm run test:e2e`. Varsayılan 4300 DEĞİŞMEDİ.
const PORT = Number(process.env.E2E_PORT) || 4300

// FR2-DARK — koyu projede koşan spec'ler (kabuk, pano, sipariş/ürün/müşteri listeleri, giriş, DS vitrini, dark-mode).
const DARK_SPECS = [
  /dark-mode\.spec\.ts$/,
  /design-system\.spec\.ts$/,
  /dashboard\.spec\.ts$/,
  /orders\.spec\.ts$/,
  /products\.spec\.ts$/,
  /customers\.spec\.ts$/,
  /login\.spec\.ts$/,
  /shell-dsv2\.spec\.ts$/,
]
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Orkestratör doğrulaması (2026-09-27): varsayılan (CPU sayısına göre, bu makinede 12) worker
  // sayısında ~%1-2 flaky sonuç gözlemlendi (ekran görüntüsü zamanlama + 1 görünürlük testi);
  // 4 worker'da 2 ardışık tam-temiz koşu doğrulandı. Kaynak çekişmesi — test tasarımı sorunu
  // DEĞİL (ADR-0011 Karar 4 flaky eşiği notuyla tutarlı, piksel karşılaştırması daraltılmadı).
  workers: process.env.CI ? undefined : 4,
  reporter: [['list']],
  timeout: 30_000,
  expect: {
    // ADR-0011 Maliyet/Ölçek Notu: ekran görüntüsü karşılaştırması küçük render farklarına
    // (anti-aliasing vb.) karşı toleranslı olmalı; piksel-özdeşlik omurga aşaması için hedeftir.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // `index.html` bir Service Worker (/service-worker.js) kaydediyor; bu, page.route() ile
    // mocklanan `/api/**` isteklerini araya girip bozabiliyor (bazı istekler net::ERR_FAILED
    // ile başarısız oldu — kanıt: bu görevin doğrulama koşusunda gözlemlendi). Playwright'ın
    // sayfa/uygulama kodunu DEĞİŞTİRMEDEN Service Worker'ı devre dışı bırakan resmi seçeneği.
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    // Günlük koşu: yalnızca Chromium, ADR-0011 Karar 4 gereği 3 viewport (mobil/tablet/masaüstü).
    {
      name: 'chromium-mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 800, height: 1024 } },
    },
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    // ADR-0026 Karar 3.7 / FR2-DARK: koyu tema (sistem tercihi koyu → varsayılan `system` tercihi koyu çözer).
    // Dark tabanlar YALNIZ masaüstü ve seçili P1 + DS vitrini spec'leri için (`*-chromium-desktop-dark-win32.png`).
    {
      name: 'chromium-desktop-dark',
      testMatch: DARK_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, colorScheme: 'dark' },
    },
    // Faz kapanış QA'sı için (ADR-0011 Karar 4 — günlük koşuda ÇALIŞTIRILMAZ):
    // { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    // { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
  ],
})
