// MOB-01 / DESK-00 — üretim derlemesinde PWA ve CSP doğrulaması (`vite preview`, backend YOK, `/api/**` mock'lu).
//  1) Kurulabilirlik: Chromium `Page.getInstallabilityErrors` boş (Lighthouse 12'de PWA kategorisi kalktı; aynı denetim).
//  2) Kiracı verisi önbellekte KALMAZ: oturumlu kabuk + ekranlar gezildikten sonra Cache Storage'da /api/ veya başka origin yok.
//  3) Çevrimdışı: gezinme dürüst "İnternet bağlantısı yok" ekranına düşer (axe temiz).
//  4) Zorunlu CSP (Electron kabuğunun eklediği politika, `unsafe-eval` yok) altında uygulama ihlalsiz açılır.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'

test.use({ serviceWorkers: 'allow' })

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS politika modülü (Electron main ile aynı dosya)
const policy = require('../../electron/policy.js')

async function waitForController(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true }))
    }
  })
}

async function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const out: string[] = []
    for (const name of await caches.keys()) {
      const c = await caches.open(name)
      for (const req of await c.keys()) out.push(req.url)
    }
    return out
  })
}

test('manifest + SW: Chromium kurulabilirlik hatası yok', async ({ page }) => {
  await installApiMocks(page)
  await page.goto('/')
  await waitForController(page)
  const cdp = await page.context().newCDPSession(page)
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  // `in-incognito`: Playwright bağlamları gizli pencere — uygulamayla ilgisiz düzenek kısıtı.
  expect(installabilityErrors.filter((e) => e.errorId !== 'in-incognito')).toEqual([])
  const manifest = await cdp.send('Page.getAppManifest')
  expect(manifest.errors).toEqual([])
})

test('API yanıtları ve başka origin önbelleğe alınmaz; yalnız kabuk + /assets/', async ({ page, baseURL }) => {
  await installApiMocks(page)
  await page.goto('/')
  await waitForController(page)
  await page.reload() // artık SW denetiminde: tüm istekler SW'den geçer
  await expect(page.locator('.workplace-tabs')).toBeVisible({ timeout: 20000 })
  for (const path of ['/orders', '/products']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
  }
  const urls = await cachedUrls(page)
  expect(urls.length).toBeGreaterThan(0)
  const origin = new URL(baseURL!).origin
  for (const u of urls) {
    const url = new URL(u)
    expect(url.origin, u).toBe(origin)
    expect(url.pathname.startsWith('/api/'), u).toBe(false)
    expect(url.search, u).toBe('')
    expect(url.pathname === '/' || url.pathname === '/index.html', u).toBe(false)
  }
})

test('çevrimdışı: dürüst bağlantı yok ekranı, erişilebilir', async ({ page, context }) => {
  await installApiMocks(page)
  await page.goto('/')
  await waitForController(page)
  // Ağ kesintisi: SW'nin kendi ağ istekleri de düşer. Chromium'da SW istekleri `context.route`'a yalnız
  // PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 ile gelir (playwright.preview.config.ts ayarlar).
  await context.route('**/*', (route) => route.abort('internetdisconnected'))
  await context.setOffline(true)
  await page.goto('/orders').catch(() => {})
  await expect(page.getByRole('heading', { name: 'İnternet bağlantısı yok' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tekrar dene' })).toBeVisible()
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations.map((v) => v.id)).toEqual([])
})

test('Electron CSP (unsafe-eval yok) altında uygulama ihlalsiz açılır', async ({ page, baseURL }) => {
  // Önizleme 127.0.0.1:<port>, mock API 127.0.0.1:5001 → üretim politikasına yalnız bu iki köken eklenir.
  const csp = policy
    .buildCsp(false)
    .replace('https://*.entegrasyonik.com', 'http://127.0.0.1:5001')
  const violations: string[] = []
  await page.exposeFunction('__cspViolation', (v: string) => violations.push(v))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __cspViolation: (v: string) => void }).__cspViolation(`${e.violatedDirective} ${e.blockedURI}`),
    )
  })
  await page.route(`${new URL(baseURL!).origin}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const res = await route.fetch()
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } })
  })
  await installApiMocks(page)
  await page.goto('/')
  await expect(page.locator('.workplace-tabs')).toBeVisible({ timeout: 20000 })
  await page.goto('/orders')
  await page.waitForLoadState('networkidle')
  expect(violations).toEqual([])
})
