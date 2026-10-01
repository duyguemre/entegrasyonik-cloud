// MOB-06 — backoffice PWA, üretim derlemesinde (`vite preview`, backend YOK; `/admin-api/**` burada karşılanır).
//  1) Kurulabilirlik: Chromium `Page.getInstallabilityErrors` boş; manifest hatasız ve ayrı kimlik ("Entegrasyonik Yönetim").
//  2) /admin-api yanıtları önbelleğe ALINMAZ: oturumlu gezinmeden sonra Cache Storage'da yalnız kabuk + /assets/ (bo-* önbellekleri).
//  3) Çevrimdışı: gezinme dürüst "İnternet bağlantısı yok" ekranına düşer (axe temiz, iki tema).
//  4) Güncelleme: yeni SW beklerken "Yeni sürüm hazır" → Yenile → yeni sürüm denetimde (kendiliğinden geçiş yok).
//  5) Android kurulum kartı: telefon genişliğinde, oturum açıkken; "Ekle" ertelenmiş istemi çağırır; kapatılınca bir daha yok.
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST_SW = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'service-worker.js')

const ME = { sub: 'adm_1', email: 'yonetici@ornek.test', name: 'Örnek Yönetici', mfa: true, authTime: new Date().toISOString() }

/** Oturum açık yönetici; diğer tüm işlemler 503 (ekranlar kendi hata durumlarını çizer — veri yok, önbelleğe alınacak bir şey de). */
async function mockAdminApi(target: Page | BrowserContext) {
  await target.route(/\/admin-api\//, (route) => {
    if (route.request().url().endsWith('/BackofficeAuthService/me')) return route.fulfill({ json: ME, headers: { 'cache-control': 'no-store' } })
    return route.fulfill({ status: 503, json: { error: 'Örnek: arka uç yok', code: 'UNAVAILABLE' } })
  })
  await target.route(/\/(health|ready)$/, (route) => route.fulfill({ status: 503, json: { status: 'fail' } }))
}

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
    const out: Array<{ cache: string; url: string }> = []
    for (const name of await caches.keys()) {
      const c = await caches.open(name)
      for (const req of await c.keys()) out.push({ cache: name, url: req.url })
    }
    return out
  })
}

async function spaGo(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, '', p)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  await page.waitForLoadState('networkidle')
}

test('manifest + SW: kurulabilirlik hatası yok; ayrı kimlik', async ({ page }) => {
  await mockAdminApi(page)
  await page.goto('/genel-bakis')
  await waitForController(page)
  const cdp = await page.context().newCDPSession(page)
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  // `in-incognito`: Playwright bağlamları gizli pencere — uygulamayla ilgisiz düzenek kısıtı.
  expect(installabilityErrors.filter((e) => e.errorId !== 'in-incognito')).toEqual([])
  const manifest = await cdp.send('Page.getAppManifest')
  expect(manifest.errors).toEqual([])
  expect(manifest.data).toContain('"name": "Entegrasyonik Yönetim"')
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope)
  expect(scope).toBe(new URL('/', page.url()).href)
})

test('/admin-api yanıtları ve başka origin önbelleğe alınmaz; yalnız kabuk + /assets/', async ({ page, baseURL }) => {
  await mockAdminApi(page)
  await page.goto('/genel-bakis')
  await waitForController(page)
  await page.reload() // artık SW denetiminde: tüm istekler SW'den geçer
  await expect(page.getByRole('heading', { level: 1, name: 'Genel bakış' })).toBeVisible({ timeout: 20_000 })
  for (const path of ['/musteriler', '/musteriler/102', '/loglar', '/denetim', '/sistem/bayraklar']) await spaGo(page, path)
  const entries = await cachedUrls(page)
  expect(entries.length).toBeGreaterThan(0)
  const origin = new URL(baseURL!).origin
  for (const { cache, url: u } of entries) {
    const url = new URL(u)
    expect(cache.startsWith('bo-'), cache).toBe(true)
    expect(url.origin, u).toBe(origin)
    expect(url.pathname.startsWith('/admin-api/'), u).toBe(false)
    expect(url.pathname.startsWith('/api/'), u).toBe(false)
    expect(['/health', '/ready'].includes(url.pathname), u).toBe(false)
    expect(url.search, u).toBe('')
    expect(url.pathname === '/' || url.pathname.endsWith('.html') && url.pathname !== '/offline.html', u).toBe(false)
  }
  // Ekran verisi (ör. müşteri adı, yönetici e-postası) hiçbir önbellek yanıtında yok.
  const bodies = await page.evaluate(async () => {
    let all = ''
    for (const name of await caches.keys()) {
      const c = await caches.open(name)
      for (const req of await c.keys()) {
        const res = await c.match(req)
        if (res && /json|html|text\/plain/.test(res.headers.get('content-type') ?? '')) all += await res.text()
      }
    }
    return all
  })
  expect(bodies).not.toContain('yonetici@ornek.test')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`çevrimdışı: dürüst bağlantı yok ekranı, erişilebilir (${scheme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: scheme })
    const page = await context.newPage()
    await mockAdminApi(page)
    await page.goto('/genel-bakis')
    await waitForController(page)
    await context.route('**/*', (route) => route.abort('internetdisconnected'))
    await context.setOffline(true)
    await page.goto('/musteriler/102').catch(() => {})
    await expect(page.getByRole('heading', { name: 'İnternet bağlantısı yok' })).toBeVisible()
    await expect(page.getByText('Entegrasyonik Yönetim')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tekrar dene' })).toBeVisible()
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(axe.violations.map((v) => v.id)).toEqual([])
    if (process.env.BO_REVIEW) await page.screenshot({ path: `docs/bo-mob-review/60-cevrimdisi-${scheme}-390.png` })
    await context.close()
  })
}

test('güncelleme: yeni sürüm beklerken bildirim; Yenile ile etkinleşir (kendiliğinden değil)', async ({ page }) => {
  await mockAdminApi(page)
  await page.goto('/genel-bakis')
  await waitForController(page)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Genel bakış' })).toBeVisible({ timeout: 20_000 })
  // Yeni derlemeyi taklit et: dist'teki SW'nin sürüm karması AYNI UZUNLUKTA başka bir değerle değişir (önizleme sunucusu
  // dosya boyunu başlangıçta okur) → güncelleme bulunur → waiting. Test sonunda özgün dosya geri yazılır.
  const original = readFileSync(DIST_SW, 'utf8')
  const current = /const VERSION = '([^']+)'/.exec(original)![1]
  const next = current.replace(/./g, (c) => (c === 'f' ? '0' : 'f'))
  try {
    writeFileSync(DIST_SW, original.replace(`const VERSION = '${current}'`, `const VERSION = '${next}'`))
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update())
    await expect(page.getByText('Yeni sürüm hazır')).toBeVisible({ timeout: 15_000 })
    // Kendiliğinden geçiş yok: yeni sürüm bekliyor, eski denetleyici sürüyor.
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.waiting !== null)).toBe(true)
    expect(await page.evaluate(() => caches.keys())).toContain(`bo-shell-${current}`)
    if (process.env.BO_REVIEW) {
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'docs/bo-mob-review/61-guncelleme-light-390.png' })
    }
    await Promise.all([page.waitForEvent('load'), page.locator('.ek-toast', { hasText: 'Yeni sürüm hazır' }).getByRole('button', { name: 'Yenile' }).click()])
    await waitForController(page)
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain(`bo-shell-${next}`)
    expect(await page.evaluate(() => caches.keys())).not.toContain(`bo-shell-${current}`)
  } finally {
    writeFileSync(DIST_SW, original)
  }
})

test('Android kurulum kartı: telefonda, oturum açıkken; Ekle istemi çağırır; kapatılınca bir daha yok', async ({ page }) => {
  await mockAdminApi(page)
  await page.goto('/genel-bakis')
  await expect(page.getByRole('heading', { level: 1, name: 'Genel bakış' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('pwa-install')).toHaveCount(0)
  // Chromium kurulum ölçütleri headless'ta istemi kendiliğinden tetiklemez: aynı şekle sahip olay gönderilir.
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>
    ;(window as unknown as { __prompted: number }).__prompted = 0
    e.prompt = async () => { (window as unknown as { __prompted: number }).__prompted++ }
    e.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(e)
  })
  const card = page.getByTestId('pwa-install')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Yönetim panelini ana ekranınıza ekleyin')
  const axe = await new AxeBuilder({ page }).include('[data-testid="pwa-install"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations.map((v) => v.id)).toEqual([])
  if (process.env.BO_REVIEW) await page.screenshot({ path: 'docs/bo-mob-review/62-kurulum-karti-light-390.png' })
  await page.getByTestId('pwa-install-add').click()
  expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1)
  // Kullanıcı istemi reddetti → kart kapanır ve bayrak yazılır; yenilemeden sonra da yok.
  await expect(card).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('bo-pwa-install-dismissed'))).toBe('1')
})
