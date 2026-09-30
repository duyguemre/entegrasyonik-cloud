// Faz 3 B2 — ürün resim galerisi + varyanta resim atama: davranış sözleşmesi (backend ImageApi sözleşmesi DEĞİŞMEDİ;
// istek gövdeleri burada sabitlenir). Veri sentetik (fixtures/productImages.ts). Görsel taban YOK (inceleme kareleri
// b2-review.spec.ts); axe WCAG 2.1 AA = 0 iddia edilir.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { menuFixtureWithProductUpdate } from '../fixtures/productUpdate'
import { galleryChoices, galleryProduct, routeImages, TINY_PNG } from '../fixtures/productImages'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
test.setTimeout(90_000)

type Calls = Record<string, any[]>

async function openGallery(page: Page, extra: Record<string, any> = {}) {
  const calls: Calls = { sortImages: [], deleteImage: [], deleteImageSelected: [], upload: [], getImages: [] }
  const product = galleryProduct()
  const record = (name: string, body: any) => async (route: any, headers: any) => {
    calls[name].push(route.request().postDataJSON?.() ?? route.request().postData())
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) })
  }
  await routeImages(page)
  await installApiMocks(page, {
    MenuService: menuFixtureWithProductUpdate,
    ChoiceService: [...galleryChoices, ...choicesDoluFixture],
    'ProductService/retrieveProduct': { product },
    getImages: record('getImages', { _id: product._id, images: product.images }),
    sortImages: record('sortImages', true),
    deleteImage: record('deleteImage', true),
    deleteImageSelected: record('deleteImageSelected', true),
    ...extra,
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
  const root = page.locator(`.productUpdateView${product._id}`)
  await expect(root.getByText('Ürün Tanımı').first()).toBeVisible({ timeout: 45_000 })
  await root.getByText('Ürün Tanımı').first().click()
  await root.getByText('Resim Galerisi').first().click()
  const panel = page.locator('.v-overlay--active').filter({ hasText: 'Ürün Resim Galerisi' }).first()
  await expect(panel.locator('.pig-tile[data-id]')).toHaveCount(6)
  return { panel, calls }
}

const order = (panel: any) => panel.locator('.pig-tile[data-id]').evaluateAll((els: Element[]) => els.map((e) => (e as HTMLElement).dataset.id))

test.describe('B2 — ürün resim galerisi', () => {
  test('ilk görsel kapak (2×2) ve rozetli; kalite ve kullanım rozetleri görünür', async ({ page }) => {
    const { panel } = await openGallery(page)
    const cover = panel.locator('.pig-tile[data-id]').first()
    await expect(cover).toHaveClass(/is-cover/)
    await expect(cover.getByText('Kapak')).toBeVisible()
    await expect(panel.getByLabel('Düşük çözünürlük')).toHaveCount(1)
    await expect(panel.getByLabel('3 varyantta kullanılıyor').first()).toBeAttached()
    await expect(panel.getByRole('tab', { name: /Varyantlar · 3 eksik/ })).toBeVisible()
  })

  test('klavye: tutamakta Boşluk → ← ← → Boşluk görseli kapak yapar ve sortImages gönderir', async ({ page }) => {
    const { panel, calls } = await openGallery(page)
    const handle = panel.getByRole('button', { name: 'Görsel 3 sırasını değiştir' })
    await handle.focus()
    await page.keyboard.press('Space')
    await expect(handle).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    expect(calls.sortImages).toHaveLength(0) // bırakılana dek kaydedilmez
    await page.keyboard.press('Space')
    await expect.poll(() => calls.sortImages.length).toBe(1)
    expect(calls.sortImages[0]).toEqual({ sortedImageIds: ['img-e2e-3', 'img-e2e-1', 'img-e2e-2', 'img-e2e-4', 'img-e2e-5', 'img-e2e-6'], tempProductId: 'temp-e2e-gallery' })
    expect((await order(panel))[0]).toBe('img-e2e-3')
    // Odak taşınan görselin tutamağında kalır.
    await expect(panel.getByRole('button', { name: 'Görsel 1 sırasını değiştir' })).toBeFocused()
  })

  test('klavye: Esc taşımayı iptal eder, istek gitmez', async ({ page }) => {
    const { panel, calls } = await openGallery(page)
    await panel.getByRole('button', { name: 'Görsel 2 sırasını değiştir' }).focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Escape')
    expect(await order(panel)).toEqual(['img-e2e-1', 'img-e2e-2', 'img-e2e-3', 'img-e2e-4', 'img-e2e-5', 'img-e2e-6'])
    expect(calls.sortImages).toHaveLength(0)
    await expect(panel).toBeVisible() // Esc galeriyi kapatmadı
  })

  test('⋯ menüsü: Kapak yap', async ({ page }) => {
    const { panel, calls } = await openGallery(page)
    await panel.getByRole('button', { name: 'Görsel 4 işlemleri' }).click()
    await page.getByRole('menuitem', { name: 'Kapak yap' }).click()
    await expect.poll(() => calls.sortImages.length).toBe(1)
    expect(calls.sortImages[0].sortedImageIds[0]).toBe('img-e2e-4')
  })

  test('sil: Geri al → istek gitmez; süre dolunca deleteImage gider', async ({ page }) => {
    const { panel, calls } = await openGallery(page)
    await panel.getByRole('button', { name: 'Görsel 2 işlemleri' }).click()
    await page.getByRole('menuitem', { name: 'Sil' }).click()
    await expect(panel.locator('.pig-tile[data-id]')).toHaveCount(5)
    await page.getByRole('button', { name: 'Geri al' }).click()
    await expect(panel.locator('.pig-tile[data-id]')).toHaveCount(6)

    await panel.getByRole('button', { name: 'Görsel 6 işlemleri' }).click()
    await page.getByRole('menuitem', { name: 'Sil' }).click()
    await expect(panel.locator('.pig-tile[data-id]')).toHaveCount(5)
    await expect.poll(() => calls.deleteImage.length, { timeout: 12_000 }).toBe(1)
    expect(calls.deleteImage[0]).toEqual({ imageId: 'img-e2e-6', tempProductId: 'temp-e2e-gallery' })
  })

  test('yükleme: kart başına hata + Tekrar dene; başarıda galeri yenilenir', async ({ page }) => {
    let n = 0
    const { panel, calls } = await openGallery(page, {
      upload: async (route: any, headers: any) => {
        n++
        if (n === 1) return route.fulfill({ status: 500, headers, contentType: 'application/json', body: '{"error":"x"}' })
        return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ result: [] }) })
      },
    })
    const before = calls.getImages.length
    await panel.locator('input[type="file"]').setInputFiles([{ name: 'arka.png', mimeType: 'image/png', buffer: TINY_PNG }])
    await expect(panel.getByText('Yüklenemedi')).toBeVisible()
    await panel.getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(panel.getByText('Yüklenemedi')).toHaveCount(0)
    await expect.poll(() => calls.getImages.length).toBeGreaterThan(before)
    expect(n).toBe(2)
  })

  test('desteklenmeyen dosya türü reddedilir, istek gitmez', async ({ page }) => {
    let n = 0
    const { panel } = await openGallery(page, { upload: async (route: any, headers: any) => { n++; return route.fulfill({ status: 200, headers, body: '{}' }) } })
    await panel.locator('input[type="file"]').setInputFiles([{ name: 'belge.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') }])
    await expect(panel.getByText('1 dosya eklenmedi')).toBeVisible()
    expect(n).toBe(0)
  })

  test('önizleme: ←/→ gezinir, Esc yalnız önizlemeyi kapatır', async ({ page }) => {
    const { panel } = await openGallery(page)
    await panel.getByRole('button', { name: 'Görsel 1 (kapak) — büyük önizleme' }).click()
    const lb = page.locator('.ilb')
    await expect(lb.getByRole('heading', { name: /Görsel\s+1 \/ 6/ })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(lb.getByRole('heading', { name: /Görsel\s+2 \/ 6/ })).toBeVisible()
    await expect(lb.getByText('Kırmızı · S')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(lb).toHaveCount(0)
    await expect(panel).toBeVisible()
  })

  test('varyant ataması: Renk=Beyaz grubuna görsel seç → 3 varyanta uygulanır, eksik uyarısı kalkar', async ({ page }) => {
    const { panel } = await openGallery(page)
    await panel.getByRole('tab', { name: /Varyantlar/ }).click()
    await expect(panel.getByText('3 varyantın görseli yok')).toBeVisible()
    const row = panel.locator('.via__row').filter({ hasText: 'Beyaz' })
    await row.getByRole('button', { name: 'Görsel seç' }).click()
    await row.getByRole('button', { name: /^Görsel 5/ }).click()
    await row.getByRole('button', { name: '3 varyanta uygula' }).click()
    await expect(panel.getByText('Tüm varyantların görseli var')).toBeVisible()
    await expect(page.locator('.ek-toast').getByText(/Beyaz — 3 varyantın görselleri güncellendi/)).toBeVisible()
    await expect(panel.getByRole('tab', { name: 'Varyantlar' })).toBeVisible()
  })

  test('seçili görselleri seçenek değerine ata (toplu çubuk)', async ({ page }) => {
    const { panel } = await openGallery(page)
    await panel.getByLabel('Görsel 6 seç').check({ force: true })
    await panel.getByRole('button', { name: 'Varyantlara ata' }).click()
    await panel.getByRole('button', { name: 'Beyaz', exact: true }).click()
    await expect(panel.getByText(/1 görsel → 3 varyanta eklenecek/)).toBeVisible()
    await panel.getByRole('button', { name: 'Ata', exact: true }).click()
    await expect(panel.getByLabel('3 varyantta kullanılıyor')).toHaveCount(5)
  })

  test('axe WCAG 2.1 AA: galeri ve varyant sekmesi 0 ihlal', async ({ page }) => {
    const { panel } = await openGallery(page)
    await page.waitForTimeout(400)
    const a = await new AxeBuilder({ page }).include('.productImagesComponent').withTags(AXE_TAGS).analyze()
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    await panel.getByRole('tab', { name: /Varyantlar/ }).click()
    await panel.locator('.via__row').first().getByRole('button', { name: 'Düzenle' }).click()
    await page.waitForTimeout(300)
    const b = await new AxeBuilder({ page }).include('.productImagesComponent').withTags(AXE_TAGS).analyze()
    expect(b.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
})
