// FR2 (cloud/fe-r2b) — kanal rozeti (K13) + ürün listesi kanal durumu / galeri: davranış + WCAG 2.1 AA (axe, rozet metin kontrastı dahil).
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { buildProduct } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const up = (status: string, onSale?: boolean) => ({ upload: { TRANSFER: { status }, ...(onSale === undefined ? {} : { onSale }) } })

const products = [
  buildProduct({
    _id: 'p-cb-1', title: 'Rozet test ürünü', images: [{ url: 'https://img.e2e.invalid/a.svg', order: 0 }, { url: 'https://img.e2e.invalid/b.svg', order: 1 }],
    variants: [{ stockcode: 'CB-1', barcode: '8690000000901', order: 0, platforms: { trendyol: up('COMPLETED', true), hepsiburada: up('FAILED') } }],
    platformUploads: { ideasoft: { isReady: true } },
  }),
]

async function openList(page: Page, saved: any[] = []) {
  await page.route('https://img.e2e.invalid/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#ddd"/></svg>' }))
  await installApiMocks(page, {
    'ProductService/getProducts': { products, totalNumberOfRecords: 1, fromTo: '1-1 / 1', isFiltered: false },
    'IntegrationService/savePlatformUploadIsReadyForProduct': { modifiedCount: 1 },
  })
  page.on('request', (req) => { if (req.url().includes('savePlatformUploadIsReadyForProduct')) saved.push(req.postDataJSON()) })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await expect(page.locator('.productListView').getByText('Rozet test ürünü', { exact: true })).toBeVisible()
  const later = page.getByRole('button', { name: 'Şimdi değil' })
  if (await later.isVisible().catch(() => false)) await later.click()
}

test.describe('FR2 — kanal rozeti ve ürün listesi kanal durumu', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium-desktop', 'davranış/axe tek viewport'))

  test('vitrin: rozetler (uzun/kısa/kargo) ve rozetli seçim listeleri AA ihlalsiz', async ({ page }) => {
    await installApiMocks(page)
    await page.goto('/design-system')
    await expect(page.getByRole('heading', { level: 1, name: 'Tasarım sistemi' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const spec = page.locator('#rozet')
    await expect(spec.locator('.ek-chb').first()).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.ek-chb').withTags(AA).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })

  test('kanal hücresi: tek bakış durumu erişilebilir adda; panel anahtarı gönderime hazır işaretini kaydeder', async ({ page }) => {
    const saved: any[] = []
    await openList(page, saved)
    const cell = page.locator('.productListView .pcs').first()
    await expect(cell).toHaveAttribute('aria-label', /Trendyol: Yayında; Hepsiburada: Hatalı; Ideasoft: Gönderilmedi · gönderime hazır/)
    await expect(cell.locator('[data-channel-status="live"]')).toHaveCount(1)
    await expect(cell.locator('[data-channel-status="failed"]')).toHaveCount(1)
    await cell.click()
    const panel = page.locator('.pcs-panel')
    await expect(panel).toBeVisible()
    const hb = panel.getByRole('switch', { name: 'Hepsiburada için gönderime hazır' })
    await expect(hb).toHaveAttribute('aria-checked', 'false')
    await hb.click()
    await expect(hb).toHaveAttribute('aria-checked', 'true')
    expect(saved).toEqual([{ productId: 'p-cb-1', integrationCode: 'hepsiburada', isReady: true }])
    const results = await new AxeBuilder({ page }).include('.pcs-panel').include('.productListView .pcs').withTags(AA).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })

  test('galeri: görsele tıklayınca açılır, ←/→ gezinir, Esc kapatır; AA ihlalsiz', async ({ page }) => {
    await openList(page)
    await page.locator('.productListView button.pth').first().click()
    const gallery = page.locator('.pgd')
    await expect(gallery).toBeVisible()
    await expect(gallery).toContainText('Görsel 1 / 2')
    await page.keyboard.press('ArrowRight')
    await expect(gallery).toContainText('Görsel 2 / 2')
    await expect(gallery.getByRole('button', { name: 'Görsel 2' })).toHaveAttribute('aria-current', 'true')
    const results = await new AxeBuilder({ page }).include('.pgd').withTags(AA).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
    await page.keyboard.press('Escape')
    await expect(gallery).toBeHidden()
  })
})
