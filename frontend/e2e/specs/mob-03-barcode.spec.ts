// MOB-03 — barkodla ürün/sipariş bulma (yalnız arama). Sahte medya: `getUserMedia` yerine EAN-13 / Code-128
// yerine geçen barkod çizilmiş bir tuvalin `captureStream()`'i verilir (gerçek kamera yok).
//   • JS okuyucu yolu (Linux Chromium'da yerel BarcodeDetector yok): kamera akışından EAN-13 okunur → ürün araması
//     (searchText) → tek sonuç → ürün açılır
//   • yerel yol: sahte BarcodeDetector → JS okuyucu parçası HİÇ indirilmez (lazy-load kanıtı)
//   • izin reddi: dürüst durum + elle giriş → sipariş araması (globalSearch); birden çok sonuçta liste filtreli kalır
//   • tek sipariş eşleşmesi → sipariş detayı açılır
//   • masaüstünde düğme yok; axe (WCAG 2.1 AA) diyalogda
// İnceleme (MOB3_REVIEW=1): ekran görüntüleri → MOB3_OUT (varsayılan docs/fe-mob2-review/<genişlik>).
//   MOB3_REVIEW=1 MOB3_WIDTHS=390,430 npx playwright test e2e/specs/mob-03-barcode.spec.ts -c playwright.cloud.config.ts --project=chromium-mobile
import { mkdirSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildOrder, buildProduct, productsDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { menuFixtureWithProductUpdate } from '../fixtures/productUpdate'
import { ean13CheckDigit, ean13Modules } from '../fixtures/ean13'

const REVIEW = process.env.MOB3_REVIEW === '1'
const WIDTHS = (process.env.MOB3_WIDTHS || '390').split(',').map(Number)
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const CODE12 = '869123456789'
const EAN = CODE12 + ean13CheckDigit(CODE12)
const scanned = buildProduct({ _id: 'product-e2e-scan', title: 'Barkodlu Ürün', barcode: EAN, stockcode: 'SK-SCAN' })

type Camera = { mode: 'barcode'; modules: number[] } | { mode: 'denied' } | { mode: 'native'; code: string }

/** Kamera taklidi: tuvale barkod çizip captureStream verir ya da izin reddi fırlatır; `native` → sahte BarcodeDetector. */
async function fakeCamera(page: Page, cam: Camera) {
  await page.addInitScript((c: Camera) => {
    const md = navigator.mediaDevices
    if (!md) return
    if (c.mode === 'native') {
      class FakeDetector {
        static async getSupportedFormats() { return ['ean_13', 'code_128', 'qr_code'] }
        async detect() { return [{ rawValue: c.code, format: 'ean_13' }] }
      }
      ;(window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = FakeDetector
    } else {
      delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector
    }
    md.getUserMedia = async () => {
      if (c.mode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError')
      const canvas = document.createElement('canvas')
      canvas.width = 1280
      canvas.height = 720
      const ctx = canvas.getContext('2d')!
      const draw = () => {
        ctx.fillStyle = '#8a8f96'
        ctx.fillRect(0, 0, 1280, 720)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(240, 230, 800, 260)
        if (c.mode === 'barcode') {
          const mw = 6
          const x0 = 640 - (c.modules.length * mw) / 2
          ctx.fillStyle = '#000000'
          c.modules.forEach((m, i) => { if (m) ctx.fillRect(x0 + i * mw, 260, mw, 200) })
        }
      }
      draw()
      setInterval(draw, 100)
      return canvas.captureStream(15)
    }
  }, cam)
}

async function setup(page: Page, overrides: Record<string, unknown>) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('ek.help.v1.tour', 'dismissed')
      localStorage.setItem('ek-pwa-install-dismissed', '1')
    } catch { /* depolama kapalı */ }
  })
  await installApiMocks(page, { MenuService: menuFixtureWithProductUpdate, ...overrides })
  await gotoAuthed(page)
}

const dialogOf = (page: Page, title: string) => page.locator('.v-overlay--active:not(.v-snackbar)').filter({ hasText: title }).first()

async function axe(page: Page) {
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).include('.v-overlay--active:not(.v-snackbar)').withTags(AXE_TAGS).analyze()
  return r.violations.map((v) => `${v.id}: ${v.nodes.length}`)
}

for (const width of WIDTHS) {
  test.describe(`MOB-03 barkod @${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const out = `${process.env.MOB3_OUT || 'docs/fe-mob2-review'}/${width}`

    test('ürün: JS okuyucu kamera akışından EAN-13 okur → aynı arama → tek sonuçta ürün açılır', async ({ page }) => {
      test.setTimeout(90_000)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await fakeCamera(page, { mode: 'barcode', modules: ean13Modules(EAN) })
      const searches: string[] = []
      const zxingRequests: string[] = []
      page.on('request', (r) => { if (/zxing/i.test(r.url())) zxingRequests.push(r.url()) })
      await setup(page, {
        'ProductService/getProducts': async (route: Route, headers: Record<string, string>) => {
          const text = route.request().postDataJSON()?.searchProductForm?.data?.searchText
          if (text) searches.push(text)
          const body = text === EAN ? { products: [scanned], totalNumberOfRecords: 1, fromTo: '1-1 / 1' } : productsDoluFixture
          return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })
        },
        'ProductService/retrieveProduct': { product: scanned },
      })
      await openScreen(page, 'ProductListView')
      const btn = page.getByRole('button', { name: 'Barkod okutarak ürün ara' })
      await expect(btn).toBeVisible()
      const box = await btn.boundingBox()
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44)
      if (REVIEW) {
        mkdirSync(out, { recursive: true })
        await page.screenshot({ path: `${out}/urun-listesi-barkod-dugmesi.png` })
      }
      expect(zxingRequests).toEqual([]) // açılışta JS okuyucu yüklenmez

      await btn.click()
      const dialog = dialogOf(page, 'Barkodla ürün bul')
      await expect(dialog).toBeVisible()
      // okununca diyalog kapanır, arama yapılır, tek sonuç → ürün sekmesi açılır
      await expect.poll(() => searches, { timeout: 20_000 }).toContain(EAN)
      expect(zxingRequests.length).toBeGreaterThan(0) // yalnız gerektiğinde, ayrı parça olarak indi
      await expect(dialog).toBeHidden()
      await expect(page.locator(`.productUpdateView${scanned._id}`)).toBeVisible({ timeout: 20_000 })
      if (REVIEW) await page.screenshot({ path: `${out}/urun-barkod-bulundu.png` })
    })

    test('tarama ekranı (durum + elle giriş) ve axe; yerel BarcodeDetector varsa JS okuyucu indirilmez', async ({ page }) => {
      test.setTimeout(60_000)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      // Yerel okuyucu her karede aynı kodu döndürür; ürün araması bilinmeyen kod → liste (açılmaz)
      await fakeCamera(page, { mode: 'native', code: '1234567' })
      const zxingRequests: string[] = []
      page.on('request', (r) => { if (/zxing/i.test(r.url())) zxingRequests.push(r.url()) })
      const searches: string[] = []
      await setup(page, {
        'ProductService/getProducts': async (route: Route, headers: Record<string, string>) => {
          const text = route.request().postDataJSON()?.searchProductForm?.data?.searchText
          if (text) searches.push(text)
          return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(productsDoluFixture) })
        },
      })
      await openScreen(page, 'ProductListView')
      await page.getByRole('button', { name: 'Barkod okutarak ürün ara' }).click()
      await expect.poll(() => searches, { timeout: 15_000 }).toContain('1234567')
      expect(zxingRequests).toEqual([])
      // birden çok sonuç → liste filtreli kalır, ürün açılmaz
      await expect(page.locator('.productListView')).toBeVisible()
      await expect(page.locator('[class*="productUpdateView"]')).toHaveCount(0)

      // Tarama ekranının kendisi (izin bekleniyor gibi): kamera hiç yanıt vermez
      await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(() => {}) })
      await page.getByRole('button', { name: 'Barkod okutarak ürün ara' }).click()
      const dialog = dialogOf(page, 'Barkodla ürün bul')
      await expect(dialog.getByText('Kamera açılıyor…')).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: 'Barkod ya da stok kodu' })).toBeVisible()
      expect(await axe(page)).toEqual([])
      if (REVIEW) await page.screenshot({ path: `${out}/urun-barkod-tarama.png` })
    })

    test('sipariş: kamera izni reddi → dürüst durum + elle giriş → genel arama; tek sonuçta detay açılır', async ({ page }) => {
      test.setTimeout(60_000)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await fakeCamera(page, { mode: 'denied' })
      const searches: string[] = []
      const one = buildOrder({ _id: 'order-e2e-scan', orderNumber: 'TY-778899' })
      await setup(page, {
        'OrderService/getOrders': async (route: Route, headers: Record<string, string>) => {
          const q = route.request().postDataJSON()?.searchOrderForm?.filter?.globalSearch
          if (q) searches.push(q)
          const body = q === 'TY-778899' ? { orders: [one], totalNumberOfRecords: 1 } : { orders: [buildOrder(), buildOrder({ _id: 'order-e2e-0002', orderNumber: 'E2E-100002' })], totalNumberOfRecords: 2 }
          return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })
        },
      })
      await openScreen(page, 'OrderListView')
      await page.locator('.orderListView tbody tr').first().waitFor()
      await page.getByRole('button', { name: 'Barkod okutarak sipariş ara' }).click()
      const dialog = dialogOf(page, 'Barkodla sipariş bul')
      await expect(dialog.getByText('Kamera izni verilmedi')).toBeVisible()
      await expect(dialog.getByText(/elle yazın/)).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Yeniden dene' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Ara' })).toBeDisabled()
      expect(await axe(page)).toEqual([])
      if (REVIEW) {
        mkdirSync(out, { recursive: true })
        await page.screenshot({ path: `${out}/siparis-barkod-izin-yok.png` })
      }

      await dialog.getByRole('textbox', { name: 'Sipariş no ya da kargo takip no' }).fill('  TY-778899 ')
      await dialog.getByRole('button', { name: 'Ara' }).click()
      await expect.poll(() => searches).toContain('TY-778899')
      await expect(dialog).toBeHidden()
      await expect(page.locator('.ek-detail-sheet, .orderDetail, [role="dialog"]').filter({ hasText: 'TY-778899' }).first()).toBeVisible({ timeout: 15_000 })
      if (REVIEW) await page.screenshot({ path: `${out}/siparis-barkod-detay.png` })
    })
  })
}

test.describe('MOB-03 masaüstü', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })
  test('fare/masaüstünde barkod düğmesi yok (arama kutusu aynı işi yapar)', async ({ page }) => {
    await setup(page, {})
    await openScreen(page, 'ProductListView')
    await expect(page.locator('.productListView')).toBeVisible()
    await expect(page.getByRole('button', { name: /Barkod okutarak/ })).toHaveCount(0)
    await openScreen(page, 'OrderListView')
    await page.locator('.orderListView tbody tr').first().waitFor()
    await expect(page.getByRole('button', { name: /Barkod okutarak/ })).toHaveCount(0)
  })
})
