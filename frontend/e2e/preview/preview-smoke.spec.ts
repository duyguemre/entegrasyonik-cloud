// Aşama 0 / R13 — üretim derlemesi (`vite preview`) duman testi.
// Kanıtlar: (1) login ve dashboard HATASIZ render olur, (2) hiçbir JS/CSS/font varlığı 4xx/5xx/iptal
// olmaz (chunk yükleme hatası yok), (3) konsolda hata/sayfa hatası yok. Uygulama kodu DEĞİŞTİRMEZ.
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'

interface Probe {
  consoleErrors: string[]
  pageErrors: string[]
  badResponses: string[]
  requestFailures: string[]
  assets: string[]
}

/** Ağ/konsol dinleyicilerini kurar. `/api/**` (mock'lu) yanıtlarının tarayıcı "Failed to load resource" gürültüsü hariçtir. */
function attachProbe(page: Page, allow: RegExp[] = []): Probe {
  const p: Probe = { consoleErrors: [], pageErrors: [], badResponses: [], requestFailures: [], assets: [] }
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const url = m.location().url || ''
    if (url.includes('/api/')) return // mock'lu 401/500 yanıtlarının tarayıcı günlüğü
    // index.html satır içi betiği SW kaydını dener; test `serviceWorkers:'block'` kullandığı için
    // register() undefined döner ve betik bu satırı basar — test düzeneğinin yapaylığı, uygulama hatası değil.
    if (m.text().startsWith('SW Kayıt Hatası')) return
    if (allow.some((re) => re.test(m.text()))) return
    p.consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => p.pageErrors.push(String(e)))
  page.on('response', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/assets/')) {
      p.assets.push(u.pathname.replace('/assets/', ''))
      if (r.status() >= 400) p.badResponses.push(`${r.status()} ${u.pathname}`)
    }
  })
  page.on('requestfailed', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/assets/') || u.pathname.endsWith('.js')) p.requestFailures.push(`${r.failure()?.errorText} ${u.pathname}`)
  })
  return p
}

function expectClean(p: Probe) {
  expect(p.pageErrors, 'sayfa (yakalanmamış) hataları').toEqual([])
  expect(p.consoleErrors, 'konsol hataları').toEqual([])
  expect(p.badResponses, '4xx/5xx varlık yanıtları').toEqual([])
  expect(p.requestFailures, 'başarısız (iptal/ağ) varlık istekleri').toEqual([])
}

test.describe('Üretim derlemesi duman testi (vite preview)', () => {
  test('login: form hatasız render olur, chunk yükleme hatası yok', async ({ page }) => {
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
    // Oturumsuz durum: uygulamanın kendi `console.error('Error get:', AxiosError 401)` çıktısı BEKLENEN davranıştır.
    const probe = attachProbe(page, [/status code 401/])
    await page.goto('/login')

    await expect(page.getByRole('tab', { name: 'Hesabım var' })).toBeVisible({ timeout: 20000 })
    await expect(page.getByLabel('E-posta')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Devam et' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForLoadState('networkidle')

    expectClean(probe)
    test.info().annotations.push({ type: 'login-assets', description: `${probe.assets.length}: ${probe.assets.join(', ')}` })
  })

  test('dashboard: oturumlu kabuk + dashboard hatasız render olur, chunk yükleme hatası yok', async ({ page }) => {
    await installApiMocks(page)
    const probe = attachProbe(page)
    await page.goto('/')

    await expect(page.locator('.workplace-tabs')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('İŞLETME PERFORMANSI')).toBeVisible({ timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForLoadState('networkidle')

    expectClean(probe)
    test.info().annotations.push({ type: 'dashboard-assets', description: `${probe.assets.length}: ${probe.assets.join(', ')}` })
  })

  test('tembel rota: Ürünler ekranı (ürün varyant ağacı chunk\'ları) hatasız açılır', async ({ page }) => {
    await installApiMocks(page)
    const probe = attachProbe(page)
    await page.goto('/')
    await expect(page.getByText('İŞLETME PERFORMANSI')).toBeVisible({ timeout: 20000 })

    await page.locator('.large-stat-card').first().click()
    await expect(page.getByText('E2E Test Ürünü')).toBeVisible({ timeout: 20000 })
    await page.waitForLoadState('networkidle')

    expectClean(probe)
  })
})
