// PRC-R0/R1 (cloud/prc-r1) — maliyet alanı, buybox rozeti/filtresi/URL, "Rekabet ve kâr" bölümü. Sahte API (backend yok).
// İnceleme görüntüleri: PRC_REVIEW=1 PRC_OUT=docs/prc-r1-review/<genişlik> (günlük koşuda görüntü yazılmaz).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page, Route } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { brandsDoluFixture, categoriesDoluFixture, choicesDoluFixture } from '../fixtures/apiData'
import { expectScreenOpen, gotoAuthed, openScreen, waitForWorkplaceReady } from '../fixtures/nav'
import { menuFixtureWithProductUpdate } from '../fixtures/productUpdate'
import {
  bbRow, coverage, historyEmpty, historyOk, listBuyboxOk, listProducts, marginItem, prcProduct, previewOk, setCostsOk,
} from '../fixtures/pricing'

// Bulut dev sunucusu soğuk derlemede yavaş: genel süre payı (iddialar aynı).
test.describe.configure({ timeout: 120_000 })

if (process.env.PRC_WIDTH) {
  const w = Number(process.env.PRC_WIDTH)
  test.use({ viewport: { width: w, height: w <= 480 ? 844 : 800 } })
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const REVIEW = process.env.PRC_REVIEW === '1'
const OUT = process.env.PRC_OUT || 'docs/prc-r1-review/1280'
const json = (route: Route, headers: Record<string, string>, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })

async function shot(page: Page, name: string) {
  if (!REVIEW) return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: '[data-help-tour-offer]{display:none!important}' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
}

async function seriousAxe(page: Page, include: string) {
  const r = await new AxeBuilder({ page }).include(include).withTags(AXE_TAGS).analyze()
  return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
}

// ── Ürün listesi ────────────────────────────────────────────────────────────────────────────────────────────────
function listMocks(extra: Record<string, any> = {}, bodies?: { buybox: any[]; products: any[] }) {
  return {
    'ProductService/getProducts': (route: Route, h: Record<string, string>) => { bodies?.products.push(route.request().postDataJSON()); return json(route, h, listProducts) },
    'PricingService/listCosts': coverage(60),
    'PricingService/listBuybox': (route: Route, h: Record<string, string>) => { bodies?.buybox.push(route.request().postDataJSON()); return json(route, h, listBuyboxOk()) },
    ...extra,
  }
}

test.describe('PRC-R1 — ürün listesi: rozet, filtre, kapsam', () => {
  test('rozetler tek çağrıyla gelir; kayıp uyarı, kazanım olumlu, okunmamış ürün rozetsiz; kapsam göstergesi + ipucu', async ({ page }) => {
    const bodies = { buybox: [] as any[], products: [] as any[] }
    await installApiMocks(page, listMocks({}, bodies))
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    await expectScreenOpen(page, '.productListView')
    const view = page.locator('.productListView')
    const rows = view.locator('tbody tr')
    await expect(rows.nth(0)).toContainText('Buybox kaybedildi')
    await expect(rows.nth(1)).toContainText('Buybox sizde')
    await expect(rows.nth(2)).not.toContainText('Buybox')
    // sayfadaki TÜM ürünler için TEK çağrı (≤100 kimlik, limit 200)
    await expect.poll(() => bodies.buybox.length).toBe(1)
    expect(bodies.buybox[0]).toEqual({ productIds: ['product-e2e-0001', 'product-e2e-0002', 'product-e2e-0003'], limit: 200 })
    // kapsam: sakin gösterge + ipucu (%100 değil)
    const chip = view.getByTestId('cost-coverage')
    await expect(chip).toContainText('Maliyet kapsamı %60')
    await expect(chip).toContainText('Maliyeti girilmemiş ürünlerde kâr hesaplanmaz')
    await page.waitForTimeout(300)
    await shot(page, 'urun-listesi-rozet-kapsam')
    expect(await seriousAxe(page, '.productListView')).toEqual([])
  })

  test('özellik kapalı: rozet yok, filtre yok, kapsam %100 ise ipucu yok', async ({ page }) => {
    await installApiMocks(page, listMocks({ 'PricingService/listBuybox': { ...listBuyboxOk(false) }, 'PricingService/listCosts': coverage(100) }))
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    const view = page.locator('.productListView')
    await expect(view.getByText('E2E Test Ürünü', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(view).not.toContainText('Buybox')
    await expect(view.getByTestId('cost-coverage')).toContainText('%100')
    await expect(view.getByTestId('cost-coverage')).not.toContainText('kâr hesaplanmaz')
  })

  test('kapsam çağrısı hata verirse liste çalışır, gösterge sakin hata + yeniden dene', async ({ page }) => {
    await installApiMocks(page, listMocks({ 'PricingService/listCosts': mockError(500) }))
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    const view = page.locator('.productListView')
    await expect(view.getByText('E2E Test Ürünü', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(view.getByTestId('cost-coverage')).toContainText('Maliyet kapsamı alınamadı')
    await expect(view.getByRole('button', { name: 'Yeniden dene' })).toBeVisible()
    await expect(view).not.toContainText('500')
  })

  test('yetkisiz (403): kapsam göstergesi gizlenir, rozet çizilmez, liste açık', async ({ page }) => {
    await installApiMocks(page, listMocks({ 'PricingService/listCosts': mockError(403), 'PricingService/listBuybox': mockError(403) }))
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    const view = page.locator('.productListView')
    await expect(view.getByText('E2E Test Ürünü', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(view.getByTestId('cost-coverage')).toHaveCount(0)
    await expect(view).not.toContainText('Buybox')
  })

  test('buybox filtresi: Kaybedilen seçilince getProducts buyboxStatus ile gider; çip görünür', async ({ page }) => {
    const bodies = { buybox: [] as any[], products: [] as any[] }
    await installApiMocks(page, listMocks({}, bodies))
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    const view = page.locator('.productListView')
    await expect(view.getByText('E2E Test Ürünü', { exact: true })).toBeVisible({ timeout: 20_000 })
    await view.getByRole('button', { name: /Filtreler/ }).click()
    await view.getByTestId('buybox-filter').click()
    await page.getByRole('option', { name: 'Kaybedilen' }).click()
    await view.getByRole('button', { name: 'Sorgula' }).click()
    await expect.poll(() => bodies.products.at(-1)?.searchProductForm?.data?.buyboxStatus).toBe('losing')
    await expect(view.getByRole('group', { name: 'Aktif filtreler' })).toContainText('Kaybedilen')
    await shot(page, 'urun-listesi-buybox-filtre')
  })

  test('URL: /products?buybox=losing&barcode=… (bildirim eylemi) filtreyi açar', async ({ page }) => {
    const bodies = { buybox: [] as any[], products: [] as any[] }
    await installApiMocks(page, listMocks({}, bodies))
    await page.goto('/products?buybox=losing&barcode=8690000000001')
    await waitForWorkplaceReady(page)
    await expect(page.locator('.productListView')).toBeVisible()
    await expect(page.locator('.productListView').getByRole('group', { name: 'Aktif filtreler' })).toContainText('Kaybedilen')
    await expect.poll(() => bodies.products.some((b) => b?.searchProductForm?.data?.buyboxStatus === 'losing' && b?.searchProductForm?.data?.barcode === '8690000000001')).toBe(true)
  })

  test('URL: bilinmeyen buybox değeri yok sayılır (filtre açılmaz)', async ({ page }) => {
    const bodies = { buybox: [] as any[], products: [] as any[] }
    await installApiMocks(page, listMocks({}, bodies))
    await page.goto('/products?buybox=hack')
    await waitForWorkplaceReady(page)
    await expect(page.locator('.productListView')).toBeVisible()
    await expect.poll(() => bodies.products.length).toBeGreaterThan(0)
    expect(bodies.products.every((b) => !b?.searchProductForm?.data?.buyboxStatus)).toBe(true)
  })
})

// ── Ürün düzenleme ──────────────────────────────────────────────────────────────────────────────────────────────
async function openUpdate(page: Page, extra: Record<string, any> = {}, product: any = prcProduct) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithProductUpdate,
    ChoiceService: choicesDoluFixture,
    BrandService: brandsDoluFixture,
    CategoryService: categoriesDoluFixture,
    'ProductService/retrieveProduct': { product },
    'ProductService/getProducts': { ...listProducts, products: [{ ...listProducts.products[0], _id: product._id, title: product.title }] },
    'PricingService/listBuybox': { ...listBuyboxOk(), items: [bbRow({ productId: product._id }), bbRow({ variantId: 'var-prc-2', productId: product._id, barcode: '8690000000102', status: 'winning', nextRefreshAt: '2026-10-01T15:40:00.000Z' })] },
    'PricingService/previewMargin': previewOk(),
    'PricingService/getBuyboxHistory': historyOk,
    ...extra,
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
  const root = page.locator(`.productUpdateView${product._id}`)
  await expect(root.getByText('Varyant Bilgileri')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Şimdi değil' }).click({ timeout: 3000 }).catch(() => undefined)
  await root.getByText('Varyant Bilgileri').click()
  await expect(root.getByText('SK-E2E-SIYAH', { exact: true }).first()).toBeVisible()
  return root
}

test.describe('PRC-R0 — varyant satırında maliyet', () => {
  test('sütun açılıştaki değerle dolar; boş maliyet "—" (0 değil)', async ({ page }) => {
    const root = await openUpdate(page)
    const grid = root.getByRole('grid', { name: 'Varyantlar' })
    await expect(grid.getByRole('columnheader', { name: /Maliyet \(KDV hariç\)/ })).toBeVisible()
    const cost = grid.locator('[data-cell="costPrice"]')
    await expect(cost.nth(0)).toContainText('₺80,00')
    await expect(cost.nth(1)).toHaveText('—')
    await expect(cost.nth(1)).not.toContainText('₺0')
  })

  test('kaydetmede yalnız DEĞİŞEN maliyet ayrı çağrıyla gider; başarı bildirilir', async ({ page }) => {
    const posted: { update: any[]; costs: any[] } = { update: [], costs: [] }
    const root = await openUpdate(page, {
      'ProductService/updateProduct': (route: Route, h: Record<string, string>) => {
        const body = route.request().postDataJSON()
        posted.update.push(body)
        // sunucu maliyeti genel kayıtta süzer: yanıttaki varyantlar ESKİ maliyeti taşır
        return json(route, h, { product: { ...prcProduct, variants: prcProduct.variants.map((v: any) => ({ ...v })) } })
      },
      'PricingService/setVariantCosts': (route: Route, h: Record<string, string>) => { posted.costs.push(route.request().postDataJSON()); return json(route, h, setCostsOk(1)) },
    })
    const cell = root.getByRole('grid', { name: 'Varyantlar' }).locator('[data-cell="costPrice"]').nth(1)
    await cell.dblclick()
    const input = root.getByRole('grid', { name: 'Varyantlar' }).getByRole('textbox', { name: /^Maliyet/ })
    await input.fill('125,5')
    await input.press('Enter')
    await expect(cell).toContainText('₺125,50')
    await root.getByRole('button', { name: 'Güncelle' }).first().click()
    await expect.poll(() => posted.costs.length).toBe(1)
    expect(posted.costs[0]).toEqual({ items: [{ variantId: 'var-prc-2', costPrice: 125.5 }] })
    expect(posted.update).toHaveLength(1)
    await expect(page.getByText('Maliyetler kaydedildi')).toBeVisible()
    await expect(cell).toContainText('₺125,50')
    await shot(page, 'urun-duzenle-maliyet-kaydedildi')
  })

  test('değişiklik yoksa setVariantCosts çağrılmaz', async ({ page }) => {
    let costCalls = 0
    const root = await openUpdate(page, {
      'ProductService/updateProduct': (route: Route, h: Record<string, string>) => json(route, h, { product: prcProduct }),
      'PricingService/setVariantCosts': (route: Route, h: Record<string, string>) => { costCalls++; return json(route, h, setCostsOk(0)) },
    })
    await root.getByRole('button', { name: 'Güncelle' }).first().click()
    await expect(page.getByText('Ürün Güncellendi')).toBeVisible()
    expect(costCalls).toBe(0)
  })

  test('ürün kaydı başarılı ama maliyet kaydı başarısız: AYRI, açık hata; girilen maliyet formda kalır', async ({ page }) => {
    const root = await openUpdate(page, {
      'ProductService/updateProduct': (route: Route, h: Record<string, string>) => json(route, h, { product: { ...prcProduct, variants: prcProduct.variants.map((v: any) => ({ ...v })) } }),
      'PricingService/setVariantCosts': mockError(500, { error: 'E11000 duplicate key' }),
    })
    const cell = root.getByRole('grid', { name: 'Varyantlar' }).locator('[data-cell="costPrice"]').nth(1)
    await cell.dblclick()
    const input = root.getByRole('grid', { name: 'Varyantlar' }).getByRole('textbox', { name: /^Maliyet/ })
    await input.fill('99')
    await input.press('Enter')
    await root.getByRole('button', { name: 'Güncelle' }).first().click()
    await expect(page.getByText('Ürün Güncellendi')).toBeVisible()
    const err = page.getByText('Ürün kaydedildi, ancak maliyetler kaydedilemedi')
    await expect(err).toBeVisible()
    await expect(page.locator('body')).not.toContainText('E11000')
    await expect(cell).toContainText('₺99,00')
    await shot(page, 'urun-duzenle-maliyet-hatasi')
  })
})

test.describe('PRC-R1 — Rekabet ve kâr bölümü', () => {
  test('hazır: durum, fiyatlar, fark, kâr, başa baş, komisyon kaynağı, zamanlar, grafik, kanal desteği', async ({ page }) => {
    const root = await openUpdate(page)
    const panel = root.getByTestId('competition-panel')
    await expect(panel.getByRole('heading', { name: 'Rekabet ve kâr' })).toBeVisible()
    // varsayılan varyant: kaybedilen
    await expect(panel).toContainText('Buybox kaybedildi')
    await expect(panel).toContainText('3. sıra')
    await expect(panel).toContainText('₺219,90') // buybox fiyatı
    await expect(panel).toContainText('₺249,90') // fiyatım
    await expect(panel).toContainText('+₺30,00') // fark
    await expect(panel).toContainText('₺78,35') // mevcut fiyatta kâr
    await expect(panel).toContainText('₺59,35') // buybox fiyatında kâr
    await expect(panel).toContainText('₺160,00') // başa baş
    await expect(panel).toContainText('gerçekleşen') // komisyon kaynağı
    await expect(panel.getByTestId('next-refresh')).not.toHaveText('')
    await expect(panel.getByTestId('chart-empty')).toHaveCount(0)
    await expect(panel.locator('svg[role="img"]')).toBeVisible()
    // diğer kanallar: "Desteklenmiyor" (asla "yakında")
    for (const name of ['Hepsiburada', 'N11', 'Pazarama']) {
      await expect(panel.locator('li[data-channel-level="not_supported"]').filter({ hasText: name })).toContainText('Desteklenmiyor')
    }
    await expect(panel).not.toContainText(/yakında/i)
    await panel.scrollIntoViewIfNeeded()
    await shot(page, 'rekabet-ve-kar-hazir')
    expect(await seriousAxe(page, '[data-testid="competition-panel"]')).toEqual([])
  })

  test('buybox fiyatı başa baş fiyatın altında: belirgin uyarı', async ({ page }) => {
    const root = await openUpdate(page, { 'PricingService/previewMargin': previewOk([marginItem({ buyboxBelowFloor: true, breakEvenPrice: 230 })]) })
    const panel = root.getByTestId('competition-panel')
    await expect(panel.getByText("Buybox'a ulaşmak başa baş fiyatın altında")).toBeVisible()
    await expect(panel.getByRole('alert')).toContainText('₺230,00')
    await panel.scrollIntoViewIfNeeded()
    await shot(page, 'rekabet-ve-kar-taban-alti')
  })

  test('maliyet yok: kâr "—" (0 değil), "Maliyet girin" yönlendirmesi, öneri/kural kapalı uyarısı', async ({ page }) => {
    const root = await openUpdate(page)
    const panel = root.getByTestId('competition-panel')
    await panel.locator('.cp__select .v-field').click()
    await page.getByRole('option', { name: /SK-E2E-BEYAZ/ }).click()
    await expect(panel).toContainText('Öneri ve kurallar kapalı')
    await expect(panel).toContainText('maliyet')
    await expect(panel.getByTestId('cost-hint')).toContainText('Maliyet girilmediği için kâr hesaplanamıyor')
    const dd = panel.locator('dd').filter({ hasText: '—' })
    expect(await dd.count()).toBeGreaterThanOrEqual(3)
    await expect(panel.locator('.cp__cell').filter({ hasText: 'Mevcut fiyatta kâr' })).toHaveText(/—/)
    await expect(panel.locator('.cp__cell').filter({ hasText: 'Buybox fiyatında kâr' })).not.toContainText('₺')
    await panel.getByTestId('cost-link').click()
    await shot(page, 'rekabet-ve-kar-maliyet-yok')
  })

  test('bayat veri etiketlenir; tazeleme gecikmesi dürüst yazılır', async ({ page }) => {
    const root = await openUpdate(page, {
      'PricingService/previewMargin': previewOk([marginItem({ buybox: { status: 'losing', order: 3, price: 219.9, hasMultipleSeller: true, observedAt: '2026-09-30T09:40:00.000Z', ageMinutes: 1500, fresh: false } })]),
      'PricingService/listBuybox': { ...listBuyboxOk(), items: [bbRow({ productId: 'product-prc-1', checkedAt: '2026-09-30T09:40:00.000Z', nextRefreshAt: '2026-09-30T15:40:00.000Z', overdue: true, fresh: false })] },
    })
    const panel = root.getByTestId('competition-panel')
    await expect(panel.getByTestId('stale-label')).toContainText('Bayat veri')
    await expect(panel.getByTestId('next-refresh')).toContainText('Yoğunluk nedeniyle gecikti')
  })

  test('tazeleme kapalı / özellik kapalı: bilgi bandı + "Tazeleme kapalı"', async ({ page }) => {
    const root = await openUpdate(page, { 'PricingService/listBuybox': { ...listBuyboxOk(false), items: [bbRow({ productId: 'product-prc-1', nextRefreshAt: null })] } })
    const panel = root.getByTestId('competition-panel')
    await expect(panel).toContainText('Buybox izleme bu hesapta kapalı')
    await expect(panel.getByTestId('next-refresh')).toHaveText('Tazeleme kapalı')
  })

  test('grafik: geçmiş yoksa boş durum', async ({ page }) => {
    const root = await openUpdate(page, { 'PricingService/getBuyboxHistory': historyEmpty })
    await expect(root.getByTestId('competition-panel').getByTestId('chart-empty')).toContainText('fiyat geçmişi yok')
    await root.getByTestId('competition-panel').scrollIntoViewIfNeeded()
    await shot(page, 'rekabet-ve-kar-grafik-bos')
  })

  test('grafik: geçmiş hatası kâr bölümünü bozmaz; yeniden dene sunar', async ({ page }) => {
    const root = await openUpdate(page, { 'PricingService/getBuyboxHistory': mockError(500) })
    const panel = root.getByTestId('competition-panel')
    await expect(panel).toContainText('Fiyat geçmişi yüklenemedi')
    await expect(panel.getByRole('button', { name: 'Yeniden dene' })).toBeVisible()
    await expect(panel).toContainText('₺78,35')
  })

  test('hata: yeniden dene; ham hata yok', async ({ page }) => {
    const root = await openUpdate(page, { 'PricingService/previewMargin': mockError(500, { error: 'MongoServerError' }) })
    const panel = root.getByTestId('competition-panel')
    await expect(panel).toContainText('Rekabet bilgisi yüklenemedi')
    await expect(panel.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(panel).not.toContainText('Mongo')
    await panel.scrollIntoViewIfNeeded()
    await shot(page, 'rekabet-ve-kar-hata')
  })

  test('yetkisiz (403): yetki mesajı, veri yok', async ({ page }) => {
    const root = await openUpdate(page, { 'PricingService/previewMargin': mockError(403) })
    const panel = root.getByTestId('competition-panel')
    await expect(panel).toContainText('Bu bölümü görme yetkiniz yok')
    await panel.scrollIntoViewIfNeeded()
    await shot(page, 'rekabet-ve-kar-yetkisiz')
  })
})
