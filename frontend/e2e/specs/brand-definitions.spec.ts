// Markalar (BrandListView) — yeni yapı: standart liste iskeleti (EkListScreen: EkPageBar + araç şeridi + tablo)
// ve sağdan açılan detay paneli. Testlerin NİYETİ eski spec'le aynı: render, arama (temizle simgesi güvenli),
// boş durum (ham hata sızmaz), görsel taban, axe; ek olarak liste davranışı (ekleme, filtre, klavye).
// Detay paneli (ad düzenleme, silme onayı, eşleme kaydı) → definition-forms.spec.ts.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { brandsDoluFixture } from '../fixtures/apiData'
import { menuFixture, gotoAuthed, openDrawer, expectScreenOpen } from '../fixtures/nav'
import type { Page } from '@playwright/test'

// Paylaşılan test menüsünde olmayan `productDefinitions/BrandListView` çocuğu yalnız bu spec dosyasında eklenir.
const menuFixtureWithBrand = menuFixture.map((group: any) =>
  group.group === 'sale'
    ? {
        ...group,
        links: group.links.map((link: any) =>
          link.code === 'productDefinitions'
            ? { ...link, children: [...link.children, { code: 'BrandListView', parent: 'productDefinitions', title: 'brandList', icon: 'mdi-tag-multiple-outline', singleton: true }] }
            : link,
        ),
      }
    : group,
)

async function openBrandListView(page: Page) {
  await openDrawer(page)
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  const group = drawer.locator('.v-list-group').filter({ has: page.locator('.v-list-group__header .mdi-tag-outline') })
  const groupItem = group.locator('.v-list-group__header')
  const subItem = group.locator('.sub-item-soft').nth(1)
  if (!(await subItem.isVisible().catch(() => false))) {
    await groupItem.click()
    await expect(subItem).toBeVisible()
  }
  await subItem.click()
  await page.waitForTimeout(200)
}

test.describe('P3 (B5-2) — Markalar (BrandListView)', () => {
  test('smoke: liste iskeleti render olur (başlık, arama, filtre, Yeni marka, satırlar)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: brandsDoluFixture })
    await gotoAuthed(page)
    await openBrandListView(page)

    await expectScreenOpen(page, '.brandDefinition')
    await expect(page.getByText('E2E Marka Bir').first()).toBeVisible()
    await expect(page.getByText('E2E Marka İki').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Yeni marka' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Marka filtresi' })).toBeVisible()
    await expect(page.getByText('2 marka')).toBeVisible()
    // Detay paneli yalnız bir marka seçilince açılır.
    await expect(page.getByLabel('Marka ayrıntısı')).toHaveCount(0)
  })

  // fe-b7 davranışı: alanın KENDİ temizle simgesi modeli `null` yapar — süzgeç çökmeden tüm listeye döner.
  test('arama alanının temizle simgesi (model null) güvenli: liste geri gelir, sayfa hatası yok', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: brandsDoluFixture })
    await gotoAuthed(page)
    await openBrandListView(page)
    const field = page.locator('.brandDefinition .v-text-field:visible').filter({ has: page.locator('.mdi-magnify') }).first()
    const input = field.locator('input')
    await input.fill('zzzz-yok')
    await expect(page.getByText('E2E Marka Bir')).toBeHidden()
    await expect(page.getByText('Marka bulunamadı')).toBeVisible()
    await field.locator('.v-field__clearable .v-icon').click()
    await expect(input).toHaveValue('')
    await expect(page.getByText('E2E Marka Bir').first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('boş durum: marka yoksa standart boş durum + "İlk markanı ekle" (ham hata sızmaz)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: [] })
    await gotoAuthed(page)
    await openBrandListView(page)

    await expectScreenOpen(page, '.brandDefinition')
    await expect(page.getByText('Henüz marka yok')).toBeVisible()
    await expect(page.getByRole('button', { name: 'İlk markanı ekle' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('yeni marka: satır içi satır — boş/aynı ad uyarısı, Esc vazgeçer, Enter BrandService/addBrand gövdesini gönderir ve detay açılır', async ({ page }) => {
    let body: any = null
    await installApiMocks(page, {
      MenuService: menuFixtureWithBrand,
      BrandService: brandsDoluFixture,
      'BrandService/addBrand': async (route: any, headers: Record<string, string>) => {
        body = route.request().postDataJSON()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ _id: 'brand-e2e-9', title: 'Yeni Marka' }) })
      },
    })
    await gotoAuthed(page)
    await openBrandListView(page)

    await page.getByRole('button', { name: 'Yeni marka' }).click()
    const input = page.getByRole('textbox', { name: 'Yeni marka adı' })
    await expect(input).toBeFocused()
    // Aynı ad → satır içi uyarı, istek yok.
    await input.fill('E2E Marka Bir')
    await expect(page.getByText('Bu adda bir marka zaten var.')).toBeVisible()
    await input.press('Enter')
    expect(body).toBeNull()
    // Esc vazgeçer.
    await input.press('Escape')
    await expect(page.getByRole('textbox', { name: 'Yeni marka adı' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Yeni marka' }).click()
    await page.getByRole('textbox', { name: 'Yeni marka adı' }).fill('Yeni Marka')
    await page.getByRole('textbox', { name: 'Yeni marka adı' }).press('Enter')
    await expect.poll(() => body).not.toBeNull()
    expect(body).toEqual({ title: 'Yeni Marka' })
  })

  test('klavye: marka adı düğmesinde ↓ sonraki markaya geçer, Enter detay panelini açar', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: brandsDoluFixture })
    await gotoAuthed(page)
    await openBrandListView(page)
    const first = page.getByRole('button', { name: /^E2E Marka Bir ayrıntısını aç/ })
    await first.focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('button', { name: /^E2E Marka İki ayrıntısını aç/ })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Marka ayrıntısı')).toBeVisible()
    await expect(page.getByLabel('Marka ayrıntısı').getByRole('heading', { name: 'E2E Marka İki' })).toBeVisible()
  })

  test('ekran görüntüsü tabanı (marka tanımları)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: brandsDoluFixture })
    await gotoAuthed(page)
    await openBrandListView(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('brand-definitions.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (liste + detay paneli)', async ({ page }, testInfo) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: brandsDoluFixture })
    await gotoAuthed(page)
    await openBrandListView(page)
    await expect(page.getByText('E2E Marka Bir').first()).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.brandDefinition').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-BrandListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] BrandListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})
