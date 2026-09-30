// B7 (cloud/fe-b7) — Kategoriler / Markalar sayfaları: davranış + erişilebilirlik. Veri: e2e/fixtures/b7Catalog.ts
// (backend yanıt şekilleri). İstek gövdeleri mevcut uç noktalarla AYNI (sözleşme değişmedi).
import { test, expect, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { menuFixture, gotoAuthed, openDrawer, expectScreenOpen } from '../fixtures/nav'
import { b7Brands, b7Categories, b7CategoryMappings, b7CatId } from '../fixtures/b7Catalog'

const menu = menuFixture.map((group: any) =>
  group.group === 'sale'
    ? {
        ...group,
        links: group.links.map((link: any) =>
          link.code === 'productDefinitions'
            ? {
                ...link,
                children: [
                  ...link.children,
                  { code: 'CategoryListView', parent: 'productDefinitions', title: 'categoryList', icon: 'mdi-shape-outline', singleton: true },
                  { code: 'BrandListView', parent: 'productDefinitions', title: 'brandList', icon: 'mdi-tag-multiple-outline', singleton: true },
                ],
              }
            : link,
        ),
      }
    : group,
)

type Capture = { body: any }
const capture = (c: Capture, response: unknown) => async (route: Route, headers: Record<string, string>) => {
  c.body = route.request().postDataJSON()
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(response) })
}

async function open(page: Page, which: 'Kategoriler' | 'Markalar', extra: Record<string, unknown> = {}) {
  await installApiMocks(page, { MenuService: menu, CategoryService: b7Categories(), AttributeMappingService: b7CategoryMappings(), BrandService: b7Brands(), ...extra })
  await gotoAuthed(page)
  await openDrawer(page)
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  const item = drawer.getByText(which, { exact: true })
  if (!(await item.isVisible().catch(() => false))) {
    await drawer.locator('.v-list-group__header').filter({ has: page.locator('.mdi-tag-outline') }).first().click()
    await page.waitForTimeout(350)
  }
  await item.click()
  await expectScreenOpen(page, which === 'Kategoriler' ? '.categoryListView' : '.brandDefinition')
}

const row = (page: Page, name: string | RegExp) => page.getByRole('treeitem', { name: typeof name === 'string' ? new RegExp(`^${name}(,|$)`) : name })

test.describe('B7 — Kategoriler', () => {
  test('ağaç: ARIA yapısı, klavye (↓ → ← Enter), grup tıklaması açar, yaprak eşleme özeti ad içinde', async ({ page }) => {
    await open(page, 'Kategoriler')
    const tree = page.getByRole('tree', { name: 'Kategori ağacı' })
    await expect(tree).toBeVisible()
    const giyim = row(page, 'Giyim')
    await expect(giyim).toHaveAttribute('aria-level', '1')
    await expect(giyim).toHaveAttribute('aria-expanded', 'false')
    await expect(giyim).toHaveAttribute('tabindex', '0')
    // Eksik yaprak sayısı + eşleme özeti erişilebilir adda (renk tek başına anlam taşımaz).
    await expect(giyim).toHaveAccessibleName(/12 yaprak kategoride eşleme eksik/)
    await expect(row(page, 'Kozmetik')).toHaveAccessibleName('Kozmetik, Tüm platformlarda eşli')

    await giyim.focus()
    await page.keyboard.press('ArrowRight')
    await expect(giyim).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(row(page, 'Kadın')).toBeFocused()
    await expect(row(page, 'Kadın')).toHaveAttribute('aria-level', '2')
    await page.keyboard.press('ArrowLeft')
    await expect(giyim).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(giyim).toHaveAttribute('aria-expanded', 'false')

    // Grup satırına tıklama: seçer + açar (geniş kapta detay açılır).
    await giyim.click()
    await expect(giyim).toHaveAttribute('aria-expanded', 'true')
    await expect(giyim).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Giyim', level: 2 })).toBeVisible()

    await row(page, 'Kadın').click()
    await row(page, 'Üst Giyim').click()
    await row(page, 'Tişört').first().focus()
    await page.keyboard.press('Enter')
    const detail = page.getByRole('region', { name: 'Tişört ayrıntıları' })
    await expect(detail.getByRole('heading', { name: 'Tişört', level: 2 })).toBeVisible()
    await expect(detail.getByRole('navigation', { name: 'Kategori yolu' })).toContainText('Giyim›Kadın›Üst Giyim')
    await expect(detail.locator('.cat-detail__map.is-on')).toHaveCount(3)
    // Mevcut düzenleme/eşleme paneli aynen
    await expect(detail.getByText('Tişört Kategorisini Düzenle')).toBeVisible()
    await expect(detail.locator('.ek-category-sync').getByText('Platform Kategori Eşleştirme')).toBeVisible()
  })

  test('arama: Türkçe karakter şart değil, eşleşme vurgulanır, atalar kendiliğinden açılır; temizleyince eski durum', async ({ page }) => {
    await open(page, 'Kategoriler')
    const search = page.getByRole('searchbox', { name: 'Kategorilerde ara' })
    await search.fill('tisort')
    await expect(page.locator('.categoryListView mark')).toHaveCount(2)
    await expect(page.locator('.categoryListView mark').first()).toHaveText('Tişört')
    await expect(row(page, 'Giyim')).toHaveAttribute('aria-expanded', 'true')
    await expect(row(page, 'Ayakkabı')).toHaveCount(0)
    await expect(page.locator('.cat-pane__meta')).toContainText('2 eşleşme')
    // ↓ arama kutusundan ağaca
    await search.press('ArrowDown')
    await expect(page.getByRole('treeitem').first()).toBeFocused()

    await search.fill('zzz')
    await expect(page.getByText('“zzz” ile eşleşen kategori yok')).toBeVisible()
    await page.getByRole('button', { name: 'Aramayı temizle' }).click()
    await expect(row(page, 'Ayakkabı')).toBeVisible()
    await expect(row(page, 'Giyim')).toHaveAttribute('aria-expanded', 'false')
  })

  test('"Eşlemesi eksik" süzgeci: yalnız eksik yapraklar ve ataları; tam eşli yaprak gizlenir', async ({ page }) => {
    await open(page, 'Kategoriler')
    await page.getByRole('radio', { name: /Eşlemesi eksik/ }).click()
    await expect(row(page, 'Kozmetik')).toHaveCount(0)
    await expect(row(page, 'Kazak')).toBeVisible()
    await expect(row(page, 'Elbise')).toHaveCount(0)
    // Radyo grubu: odak seçili öğede; ok tuşu seçimi taşır.
    await expect(page.getByRole('radio', { name: /Eşlemesi eksik/ })).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('radio', { name: 'Tümü' })).toBeFocused()
    await expect(page.getByRole('radio', { name: 'Tümü' })).toHaveAttribute('aria-checked', 'true')
    await expect(row(page, 'Kozmetik')).toBeVisible()
  })

  test('satır içi yeniden adlandırma (F2) → CategoryService/updateCategory gövdesi; Esc vazgeçer', async ({ page }) => {
    const c: Capture = { body: null }
    await open(page, 'Kategoriler', { 'CategoryService/updateCategory': capture(c, { result: true }) })
    const koz = row(page, 'Kozmetik')
    await koz.focus()
    await page.keyboard.press('F2')
    const input = page.getByRole('textbox', { name: 'Kozmetik için yeni ad' })
    await expect(input).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(koz).toBeFocused()

    await page.keyboard.press('F2')
    await page.getByRole('textbox', { name: 'Kozmetik için yeni ad' }).fill('K')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toContainText('2–160')
    await page.getByRole('textbox', { name: 'Kozmetik için yeni ad' }).fill('Kozmetik & Bakım')
    await page.keyboard.press('Enter')
    await expect.poll(() => c.body).toEqual({ categoryId: b7CatId('Kozmetik'), title: 'Kozmetik & Bakım' })
  })

  test('alt kategori ekleme (⋯ menüsü) ve ana kategori ekleme (başlık eylemi) → CategoryService/addCategory gövdesi', async ({ page }) => {
    const c: Capture = { body: null }
    await open(page, 'Kategoriler', { 'CategoryService/addCategory': capture(c, { _id: 'b7-new' }) })
    const ayak = row(page, 'Ayakkabı')
    await ayak.hover()
    await ayak.getByRole('button', { name: 'Ayakkabı işlemleri' }).click()
    await page.getByRole('menuitem', { name: /Alt kategori ekle/ }).click()
    const input = page.getByRole('textbox', { name: 'Ayakkabı altına yeni kategori' })
    await expect(input).toBeFocused()
    await input.fill('Terlik')
    await page.keyboard.press('Enter')
    await expect.poll(() => c.body).toEqual({ parentCategoryId: b7CatId('Ayakkabı'), title: 'Terlik' })

    c.body = null
    await page.getByRole('button', { name: 'Kategori ekle' }).click()
    const top = page.getByRole('textbox', { name: 'Yeni kategori adı' })
    await expect(top).toBeFocused()
    await top.fill('Spor & Outdoor')
    await page.getByRole('button', { name: 'Kaydet' }).first().click()
    await expect.poll(() => c.body).toEqual({ parentCategoryId: 'b7-cat-root', title: 'Spor & Outdoor' })
  })

  test('sıra değiştirme Alt+↓ → changeOrderCategory; "Bir üst seviyeye çıkar" → moveCategory gövdesi', async ({ page }) => {
    const order: Capture = { body: null }
    const move: Capture = { body: null }
    await open(page, 'Kategoriler', {
      'CategoryService/changeOrderCategory': capture(order, { result: { fromResp: { acknowledged: true }, toResp: { acknowledged: true } } }),
      'CategoryService/moveCategory': capture(move, { result: { acknowledged: true } }),
    })
    await row(page, 'Ayakkabı').focus()
    await page.keyboard.press('Alt+ArrowDown')
    await expect.poll(() => order.body).toEqual({ fromCategoryId: b7CatId('Ayakkabı'), toCategoryId: b7CatId('Aksesuar') })

    await row(page, 'Ayakkabı').click()
    const bot = row(page, 'Bot')
    await bot.hover()
    await bot.getByRole('button', { name: 'Bot işlemleri' }).click()
    await page.getByRole('menuitem', { name: /Bir üst seviyeye çıkar/ }).click()
    await expect.poll(() => move.body).toEqual({ moveCategoryId: b7CatId('Ayakkabı/Bot'), moveInCategoryId: 'b7-cat-root' })
  })

  test('yükleme hatası: EkProblemState + Tekrar dene aynı isteği yineler', async ({ page }) => {
    // Kabuk da kategori deposunu yükleyebildiği için sayaç değil anahtar: hata görünene kadar tüm istekler 500.
    let failing = true
    await open(page, 'Kategoriler', {
      CategoryService: (route: Route, headers: Record<string, string>) =>
        failing
          ? route.fulfill({ status: 500, contentType: 'application/json', headers, body: JSON.stringify({ error: 'x' }) })
          : route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(b7Categories()) }),
    })
    await expect(page.getByText('Kategoriler yüklenemedi')).toBeVisible()
    failing = false
    await page.locator('.categoryListView').getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(row(page, 'Giyim')).toBeVisible()
    await expect(page.getByText('Kategoriler yüklenemedi')).toHaveCount(0)
  })

  test('derin/büyük ağaç: > 300 görünür satırda sanallaştırma (DOM\'da sınırlı satır), End son düğüme gider', async ({ page }) => {
    const big = [
      { _id: 'root', parentId: 0, title: 'Kategoriler', isMain: true },
      ...Array.from({ length: 8 }, (_, g) => ({
        _id: `g${g}`, parentId: 'root', title: `Grup ${g + 1}`, level: 0,
        children: Array.from({ length: 80 }, (_, i) => ({ _id: `g${g}-${i}`, parentId: `g${g}`, title: `Alt kategori ${g + 1}.${i + 1}`, level: 1, children: [] })),
      })),
    ]
    await open(page, 'Kategoriler', { CategoryService: big, AttributeMappingService: [] })
    await expect(row(page, 'Grup 1')).toBeVisible()
    await page.getByRole('button', { name: 'Tümünü aç' }).click()
    await expect(page.locator('.cat-tree__virtual')).toBeVisible()
    const rendered = await page.getByRole('treeitem').count()
    expect(rendered).toBeGreaterThan(5)
    expect(rendered).toBeLessThan(120) // 648 satırdan yalnız görünür pencere
    await page.getByRole('treeitem').first().focus()
    await page.keyboard.press('End')
    await expect(row(page, 'Alt kategori 8.80')).toBeFocused()
    await page.keyboard.press('Home')
    await expect(row(page, 'Grup 1')).toBeFocused()
  })

  test('axe: WCAG 2.1 AA = 0 ihlal (genel bakış + seçili yaprak)', async ({ page }) => {
    await open(page, 'Kategoriler')
    await expect(row(page, 'Giyim')).toBeVisible()
    const scan = async () =>
      (await new AxeBuilder({ page }).include('.categoryListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      )
    expect(await scan()).toEqual([])
    await row(page, 'Kozmetik').click()
    await expect(page.getByRole('heading', { name: 'Kozmetik', level: 2 })).toBeVisible()
    await page.waitForTimeout(400)
    expect(await scan()).toEqual([])
  })
})

test.describe('B7 — Markalar', () => {
  test('listbox: ızgara ↔ liste, ok tuşları, arama vurgusu, seçimde mevcut panel', async ({ page }) => {
    await open(page, 'Markalar')
    const list = page.getByRole('listbox', { name: 'Markalar' })
    await expect(list.getByRole('option')).toHaveCount(24)
    await expect(page.getByRole('option', { name: /^Açelya Tekstil, Tüm platformlarda eşli$/ })).toBeVisible()
    await expect(page.getByRole('option', { name: /^Beyaz Kuğu/ })).toHaveAccessibleName(/1\/4 platformda eşli/)
    // Baş harf avatarı (logo alanı yok)
    await expect(page.locator('[data-brand-title="Ege Pamuk"] .brand-col__avatar')).toHaveText('EP')

    await page.getByRole('radio', { name: 'Liste görünümü' }).click()
    await expect(page.locator('.brand-col.is-list')).toBeVisible()
    await page.getByRole('option').first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('option').nth(1)).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByRole('option').last()).toBeFocused()

    await page.getByRole('searchbox', { name: 'Markalarda ara' }).fill('ça')
    await expect(list.getByRole('option')).toHaveCount(1)
    await expect(page.locator('.brandDefinition mark')).toHaveText('Ça')

    await page.getByRole('option', { name: /^Şahin Çanta/ }).press('Enter')
    await expect(page.getByRole('heading', { name: 'Şahin Çanta', level: 2 })).toBeVisible()
    await expect(page.getByText('Şahin Çanta Markasını Düzenle')).toBeVisible()
    await expect(page.locator('.ek-brand-sync').getByText('Platform Marka Eşleştirme')).toBeVisible()
  })

  test('"Eşlemesi eksik" süzgeci ve marka ekleme → BrandService/addBrand gövdesi', async ({ page }) => {
    const c: Capture = { body: null }
    await open(page, 'Markalar', { 'BrandService/addBrand': capture(c, { _id: 'b7-brand-new' }) })
    await page.getByRole('radio', { name: /Eşlemesi eksik/ }).click()
    await expect(page.getByRole('option', { name: /^Açelya Tekstil/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Marka ekle' }).click()
    const input = page.getByRole('textbox', { name: 'Yeni marka adı' })
    await expect(input).toBeFocused()
    await input.fill('Yeni Marka')
    await page.keyboard.press('Enter')
    await expect.poll(() => c.body).toEqual({ title: 'Yeni Marka' })
  })

  test('boş durum ve axe (WCAG 2.1 AA = 0)', async ({ page }) => {
    await open(page, 'Markalar')
    await expect(page.getByRole('option').first()).toBeVisible()
    const scan = async () =>
      (await new AxeBuilder({ page }).include('.brandDefinition').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      )
    expect(await scan()).toEqual([])
    await page.getByRole('option', { name: /^Ege Pamuk/ }).click()
    await expect(page.getByRole('heading', { name: 'Ege Pamuk', level: 2 })).toBeVisible()
    await page.waitForTimeout(400)
    expect(await scan()).toEqual([])
  })
})

test.describe('B7 — 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  for (const which of ['Kategoriler', 'Markalar'] as const) {
    test(`${which}: yatay kaydırma yok (liste ve detay)`, async ({ page }) => {
      await open(page, which)
      const noOverflow = () =>
        page.evaluate(() => {
          const els = [document.scrollingElement!, ...document.querySelectorAll<HTMLElement>('.cat-page, .brand-page, .cat-split')]
          return els.every((el) => el.scrollWidth <= el.clientWidth + 1)
        })
      expect(await noOverflow()).toBe(true)
      if (which === 'Kategoriler') {
        await row(page, 'Giyim').click()
        await expect(row(page, 'Giyim')).toHaveAttribute('aria-expanded', 'true')
        await row(page, 'Kadın').click()
        await row(page, 'Üst Giyim').click()
        await row(page, 'Tişört').first().click()
        await expect(page.getByRole('button', { name: 'Tüm kategoriler' })).toBeVisible()
      } else {
        await page.getByRole('option').first().click()
        await expect(page.getByRole('button', { name: 'Tüm markalar' })).toBeVisible()
      }
      expect(await noOverflow()).toBe(true)
    })
  }
})
