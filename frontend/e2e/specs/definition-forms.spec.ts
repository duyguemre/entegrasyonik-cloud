// DS-v2 Aşama 2 (diyalog/menü/form) — marka DETAY paneli (sağdan açılan yan panel) karakterizasyonu:
// satır içi ad düzenleme (updateBrand gövdesi), onaylı silme (deleteBrand gövdesi; vazgeç istek atmaz),
// kanal eşlemesi (Eşle → önerilen → Kaydet → saveIntegrationBrand gövdesi).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { brandsDoluFixture } from '../fixtures/apiData'
import { menuFixture, gotoAuthed, openDrawer, expectScreenOpen } from '../fixtures/nav'

const menuWithBrand = menuFixture.map((group: any) =>
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

const json = (route: any, headers: Record<string, string>, data: any) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) })

async function openBrandPanel(page: Page, overrides: Record<string, any> = {}) {
  await installApiMocks(page, { MenuService: menuWithBrand, BrandService: brandsDoluFixture, ...overrides })
  await gotoAuthed(page)
  await openDrawer(page)
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  const group = drawer.locator('.v-list-group').filter({ has: page.locator('.v-list-group__header .mdi-tag-outline') })
  const subItem = group.locator('.sub-item-soft').nth(1)
  if (!(await subItem.isVisible().catch(() => false))) await group.locator('.v-list-group__header').click()
  await subItem.click()
  await expectScreenOpen(page, '.brandDefinition')
  // Listedeki ilk markanın adı detay panelini açar.
  await page.getByRole('button', { name: /^E2E Marka Bir ayrıntısını aç/ }).click()
  const panel = page.getByLabel('Marka ayrıntısı')
  await expect(panel.getByRole('heading', { name: 'E2E Marka Bir' })).toBeVisible()
  return panel
}

test.describe('DS-v2 A2 — marka detay paneli (karakterizasyon)', () => {
  test('marka adı güncelleme: kalem → alan → Enter → BrandService/updateBrand gövdesi; Esc vazgeçer', async ({ page }) => {
    let body: any = null
    const panel = await openBrandPanel(page, {
      'BrandService/updateBrand': async (route: any, headers: Record<string, string>) => {
        body = route.request().postDataJSON()
        return json(route, headers, { result: true })
      },
    })
    await panel.getByRole('button', { name: 'Marka adını düzenle' }).click()
    const field = panel.getByLabel('Marka Adı', { exact: false }).first()
    await expect(field).toBeFocused()
    // Esc vazgeçer, istek yok.
    await field.fill('Başka Ad')
    await field.press('Escape')
    await expect(panel.getByRole('heading', { name: 'E2E Marka Bir' })).toBeVisible()
    expect(body).toBeNull()

    await panel.getByRole('button', { name: 'Marka adını düzenle' }).click()
    const field2 = panel.getByLabel('Marka Adı', { exact: false }).first()
    // Boş ad uyarısı satır içinde.
    await field2.fill('')
    await expect(panel.getByText('Marka adı boş olamaz.')).toBeVisible()
    await field2.fill('E2E Marka Yeni')
    await field2.press('Enter')
    await expect.poll(() => body).not.toBeNull()
    expect(body).toEqual({ brandId: 'brand-e2e-1', title: 'E2E Marka Yeni' })
  })

  test('marka silme (⋯ menüsü): tehlikeli onay → BrandService/deleteBrand gövdesi; vazgeç istek atmaz', async ({ page }, testInfo) => {
    let body: any = null
    let calls = 0
    const panel = await openBrandPanel(page, {
      'BrandService/deleteBrand': async (route: any, headers: Record<string, string>) => {
        calls++
        body = route.request().postDataJSON()
        return json(route, headers, { acknowledged: true, deletedCount: 1 })
      },
    })
    const openConfirm = async () => {
      await panel.getByRole('button', { name: 'Marka işlemleri' }).click()
      await page.getByRole('menuitem', { name: 'Markayı sil' }).click()
    }
    await openConfirm()
    const dialog = page.getByRole('dialog').filter({ hasText: 'E2E Marka Bir' }).filter({ has: page.getByRole('button', { name: /Vazgeç|İptal/i }) })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /Vazgeç|İptal/i }).click()
    await expect(dialog).toBeHidden()
    expect(calls).toBe(0)

    await openConfirm()
    await expect(dialog).toBeVisible()
    if (testInfo.project.name === 'chromium-desktop') {
      const axe = await new AxeBuilder({ page }).include('.v-overlay--active .v-overlay__content').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(axe.violations.map((v) => v.id)).toEqual([])
    }
    await dialog.getByRole('button', { name: /SİL|Sil/ }).click()
    await expect.poll(() => body).not.toBeNull()
    expect(body).toEqual({ _id: 'brand-e2e-1' })
    // Panel kapanır.
    await expect(page.getByLabel('Marka ayrıntısı')).toHaveCount(0)
  })

  test('marka silme (liste satır eylemi) de aynı onayı açar', async ({ page }) => {
    let calls = 0
    await openBrandPanel(page, {
      'BrandService/deleteBrand': async (route: any, headers: Record<string, string>) => { calls++; return json(route, headers, { acknowledged: true }) },
    })
    await page.getByLabel('Marka ayrıntısı').getByRole('button', { name: 'Paneli kapat' }).click()
    await page.getByRole('button', { name: 'E2E Marka Bir markasını sil' }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'E2E Marka Bir' }).filter({ has: page.getByRole('button', { name: /Vazgeç|İptal/i }) })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /Vazgeç|İptal/i }).click()
    expect(calls).toBe(0)
  })

  test('kanal eşlemesi: bağlı tüm kanallar satır satır; Eşle → yerel adla önden arama → Önerilen → Kaydet → saveIntegrationBrand gövdesi', async ({ page }) => {
    let body: any = null
    let searchBody: any = null
    const panel = await openBrandPanel(page, {
      'IntegrationService/retrieveBrandsFromIntegration': async (route: any, headers: Record<string, string>) => {
        searchBody = route.request().postDataJSON()
        return json(route, headers, [{ id: 'tr-9', title: 'Başka Marka' }, { id: 'tr-1', title: 'E2E Marka Bir' }])
      },
      'BrandService/saveIntegrationBrand': async (route: any, headers: Record<string, string>) => {
        body = route.request().postDataJSON()
        return json(route, headers, { result: true })
      },
    })
    // Bağlı 4 kanalın hepsi satırda (hiçbiri eşli değil).
    for (const ch of ['Trendyol', 'Hepsiburada', 'Ideasoft', 'Bizimhesap']) {
      await expect(panel.getByRole('button', { name: `${ch} markasını eşle` })).toBeVisible()
    }
    await panel.getByRole('button', { name: 'Trendyol markasını eşle' }).click()
    // Alan yerel marka adıyla önden aranır; en iyi eşleşme "Önerilen" olarak sunulur.
    await expect.poll(() => searchBody).not.toBeNull()
    expect(searchBody).toEqual({ integrationCode: 'trendyol', searchText: 'E2E Marka Bir' })
    const suggest = panel.getByRole('button', { name: /Önerilen Trendyol markasını seç: E2E Marka Bir/ })
    await expect(suggest).toBeVisible()
    const save = panel.getByRole('button', { name: /Kaydet/ })
    await expect(save).toBeDisabled()
    await suggest.click()
    await expect(save).toBeEnabled()
    await save.click()
    await expect.poll(() => body).not.toBeNull()
    expect(body).toEqual({ brandId: 'brand-e2e-1', integrationCode: 'trendyol', integrationBrand: { id: 'tr-1', title: 'E2E Marka Bir' } })
    // Başarı geri bildirimi (satır ✓ + "Değiştir" gerçek backend'de görünür; sahte BrandService listesi eşlemeyi geri döndürmez).
    await expect(page.getByText('Platform marka eşlemesi kaydedildi')).toBeVisible()
  })

  test('kanal eşlemesi hatası: kayıt başarısızsa satır içi aksiyonlu mesaj, satır açık kalır', async ({ page }) => {
    const panel = await openBrandPanel(page, {
      'IntegrationService/retrieveBrandsFromIntegration': [{ id: 'tr-1', title: 'E2E Marka Bir' }],
      'BrandService/saveIntegrationBrand': async (route: any, headers: Record<string, string>) => json(route, headers, { result: false }),
    })
    await panel.getByRole('button', { name: 'Trendyol markasını eşle' }).click()
    await panel.getByRole('button', { name: /Önerilen Trendyol markasını seç/ }).click()
    await panel.getByRole('button', { name: /Kaydet/ }).click()
    await expect(panel.getByRole('alert')).toContainText('Eşleme kaydedilemedi')
    await expect(panel.getByRole('button', { name: /Kaydet/ })).toBeVisible()
  })
})
