// fe-r4d — Şerit D inceleme görüntüleri (YALNIZ `FE_R4D_REVIEW=1` ile; günlük koşuda atlanır).
//   FE_R4D_REVIEW=1 npx playwright test e2e/specs/fe-r4d-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop
// Çıktı: docs/fe-r4-review/d/sonra/<sahne>-<genişlik>-<tema>.png (1440 açık+koyu, 390 açık; D1 ayrıca 800 tablet).
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, waitForWorkplaceReady } from '../fixtures/nav'
import { HIDDEN_DEFINITION_SCREENS, menuFixtureWithLegacyDefinitions, openHiddenDefinitionScreen } from '../fixtures/definitionsMenu'
import { menuFixtureWithPricingRules, historyOk, rulesState, suggestionsOpen } from '../fixtures/pricingRules'
import { settleAnimations } from '../fixtures/settle'

const OUT = 'docs/fe-r4-review/d/sonra'
const FRAMES = [
  { w: 1440, h: 900, scheme: 'light' as const },
  { w: 1440, h: 900, scheme: 'dark' as const },
  { w: 390, h: 844, scheme: 'light' as const },
]

test.skip(process.env.FE_R4D_REVIEW !== '1', 'inceleme görüntüleri yalnız FE_R4D_REVIEW=1 ile')

async function shot(page: Page, name: string) {
  await page.addStyleTag({ content: '[data-help-tour-offer]{display:none!important}' })
  await page.evaluate(() => document.fonts.ready)
  await settleAnimations(page)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

for (const f of FRAMES) {
  const tag = `${f.w}-${f.scheme}`
  test(`D5 tanım ekranı satır eylemleri ${tag}`, async ({ page }) => {
    await page.setViewportSize({ width: f.w, height: f.h })
    await page.emulateMedia({ colorScheme: f.scheme })
    await installApiMocks(page, { MenuService: menuFixtureWithLegacyDefinitions })
    await gotoAuthed(page)
    await openHiddenDefinitionScreen(page, HIDDEN_DEFINITION_SCREENS.BrandDefinitionView)
    const root = page.locator('.legacy-definition-root').filter({ has: page.getByRole('heading', { level: 1, name: 'Marka Tanımları' }) })
    await root.getByRole('button', { name: 'Düzenle' }).first().click()
    const dlg = page.getByRole('dialog', { name: 'Satırı düzenle' })
    await expect(dlg).toBeVisible()
    await dlg.locator('[data-legacy-field="email"] input').fill('gecersiz')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(dlg).toContainText('E-posta biçimi geçersiz')
    await shot(page, `d5-duzenle-${tag}`)
    await dlg.getByRole('button', { name: 'Vazgeç' }).click()
    await root.getByRole('button', { name: 'Sil' }).first().click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await shot(page, `d5-sil-${tag}`)
  })

  test(`D1 fiyat geçmişi ızgarası ${tag}`, async ({ page }) => {
    await page.setViewportSize({ width: f.w, height: f.h })
    await page.emulateMedia({ colorScheme: f.scheme })
    await installApiMocks(page, { MenuService: menuFixtureWithPricingRules, 'PricingService/getRules': rulesState(), 'PricingService/listSuggestions': suggestionsOpen(), 'PricingService/getPriceHistory': historyOk() })
    await page.goto('/catalog/pricing-rules?tab=history')
    await waitForWorkplaceReady(page)
    await expect(page.getByTestId('history-grid').locator('tbody tr')).toHaveCount(2)
    await shot(page, `d1-gecmis-${tag}`)
  })
}

test('D1 tablet: taşan ızgara odakta (klavyeyle kaydırılabilir bölge)', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1024 })
  await installApiMocks(page, { MenuService: menuFixtureWithPricingRules, 'PricingService/getRules': rulesState(), 'PricingService/listSuggestions': suggestionsOpen(), 'PricingService/getPriceHistory': historyOk() })
  await page.goto('/catalog/pricing-rules?tab=history')
  await waitForWorkplaceReady(page)
  const grid = page.getByTestId('history-grid')
  await expect(grid).toHaveAttribute('tabindex', '0')
  await grid.focus()
  await page.keyboard.press('ArrowRight')
  await shot(page, 'd1-gecmis-800-light-odak')
})
