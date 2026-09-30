// DS-v2 Aşama 2 (diyalog/menü/form) — tanım ekranları (marka) düzenleme/silme gövdelerinin
// karakterizasyonu. Göçten ÖNCE yazıldı (eski düzende yeşil); `BrandSyncComponent` DS düzenine
// (EkFormGrid, EkDialog tehlikeli onay) taşındıktan SONRA da yeşil olmalıdır.
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
  // Listedeki ilk markanın ayar (⚙) düğmesi eşitleme/düzenleme panelini açar.
  await page.locator('.brandDefinition .mdi-cog').first().click()
  const panel = page.locator('.brandDefinition .brandListComponentView').last()
  await expect(panel.getByLabel('Marka Adı', { exact: false }).first()).toBeVisible()
  return panel
}

test.describe('DS-v2 A2 — marka tanımı paneli (karakterizasyon)', () => {
  test('marka adı güncelleme: BrandService/updateBrand gövdesi', async ({ page }) => {
    let body: any = null
    const panel = await openBrandPanel(page, {
      'BrandService/updateBrand': async (route: any, headers: Record<string, string>) => {
        body = route.request().postDataJSON()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ result: true }) })
      },
    })
    const field = panel.getByLabel('Marka Adı', { exact: false }).first()
    await field.fill('E2E Marka Yeni')
    // Eski düzende odak kaybıyla yardım metni kaybolup düğme kayıyordu (tıklama boşa düşüyordu):
    // önce alandan çıkılır, sonra Kaydet'e basılır — iki düzende de aynı kullanıcı adımı.
    await field.blur()
    await panel.getByRole('button', { name: /Kaydet/ }).first().click()
    await expect.poll(() => body).not.toBeNull()
    expect(body).toEqual({ brandId: 'brand-e2e-1', title: 'E2E Marka Yeni' })
  })

  test('marka silme: tehlikeli onay → BrandService/deleteBrand gövdesi; vazgeç istek atmaz', async ({ page }, testInfo) => {
    let body: any = null
    let calls = 0
    const panel = await openBrandPanel(page, {
      'BrandService/deleteBrand': async (route: any, headers: Record<string, string>) => {
        calls++
        body = route.request().postDataJSON()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ acknowledged: true, deletedCount: 1 }) })
      },
    })
    await panel.locator('button:has(.mdi-delete-outline), button:has(.mdi-trash-can-outline)').first().click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'E2E Marka Bir' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /Vazgeç|İptal/i }).click()
    await expect(dialog).toBeHidden()
    expect(calls).toBe(0)

    await panel.locator('button:has(.mdi-delete-outline), button:has(.mdi-trash-can-outline)').first().click()
    await expect(dialog).toBeVisible()
    if (testInfo.project.name === 'chromium-desktop') {
      // [Test ortamı sağlamlaştırması — Windows'ta kırmızı, Linux'ta yeşil] `toBeVisible` opaklığa bakmaz; yavaş
      // makinede axe açılış geçişinin (fade/scale) ortasında çalışıp yarı saydam metni `color-contrast` ihlali
      // sayıyordu (geçiş yapay olarak 3 sn'ye uzatılınca Linux'ta da aynı ihlal üretildi). Tarama, kaplamanın
      // CSS geçişleri bittikten sonra yapılır — iddia aynı: 0 ihlal.
      await expect.poll(() => page.locator('.v-overlay--active .v-overlay__content').first().evaluate(
        (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
      ), { timeout: 10000 }).toBe(0)
      const axe = await new AxeBuilder({ page }).include('.v-overlay--active .v-overlay__content').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(axe.violations.map((v) => v.id)).toEqual([])
    }
    await dialog.getByRole('button', { name: /SİL|Sil/ }).click()
    await expect.poll(() => body).not.toBeNull()
    expect(body).toEqual({ _id: 'brand-e2e-1' })
  })
})
