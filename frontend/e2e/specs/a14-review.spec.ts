// Faz 3 fe-a14 — klavye kısayolları diyaloğu ÖNCE/SONRA inceleme görüntüleri. İddia yok; günlük koşuda ATLANIR.
//   A14_REVIEW=1 A14_REVIEW_WIDTH=1440|390 A14_REVIEW_OUT=docs/a14-review/after \
//     npx playwright test e2e/specs/a14-review.spec.ts --project=chromium-desktop
// Dosya adı: `<konu>-<win|mac>-<genişlik>.png`. Platform `navigator.platform`/`userAgentData` taklidiyle seçilir
// (diyalog kendisi algılar — manuel anahtar ayrıca vitrinde). Veri sentetik fixture (PII yok).
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed } from '../fixtures/nav'

const ENABLED = process.env.A14_REVIEW === '1'
const WIDTH = Number(process.env.A14_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A14_REVIEW_OUT || 'docs/a14-review/after'
const file = (name: string) => `${OUT}/${name}-${WIDTH}.png`

async function fakePlatform(page: Page, platform: 'win' | 'mac') {
  await page.addInitScript((p) => {
    const value = p === 'mac' ? 'MacIntel' : 'Win32'
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => value, configurable: true })
    Object.defineProperty(Navigator.prototype, 'userAgentData', {
      get: () => ({ platform: p === 'mac' ? 'macOS' : 'Windows', mobile: false, brands: [] }),
      configurable: true,
    })
  }, platform)
}

async function openDialog(page: Page) {
  await installApiMocks(page)
  await gotoAuthed(page)
  await page.locator('.workplace-area').focus()
  await page.keyboard.press('Shift+?')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: 'Klavye kısayolları' }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  return dialog
}

test.describe('fe-a14 inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnız A14_REVIEW=1 ile (belge görseli, taban değil)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  for (const platform of ['win', 'mac'] as const) {
    test(`diyalog — ${platform}`, async ({ page }) => {
      await fakePlatform(page, platform)
      const dialog = await openDialog(page)
      await page.screenshot({ path: file(`dialog-${platform}`) })
      // Yakın çekim: diyaloğun kendisi (tuş kapakları okunur ölçekte).
      await dialog.locator('.ek-dialog').first().screenshot({ path: file(`closeup-${platform}`) })
    })
  }

  test.describe('yakın çekim (2x)', () => {
    test.use({ deviceScaleFactor: 2 })
    for (const platform of ['win', 'mac'] as const) {
      test(`tuş kapakları — ${platform}`, async ({ page }) => {
        await fakePlatform(page, platform)
        const dialog = await openDialog(page)
        const tips = dialog.locator('.ek-sc__tips')
        if (await tips.count()) await tips.screenshot({ path: file(`keycaps-tips-${platform}`) })
        // Satırlar: kabuk + bileşen kısayolları (takma ad, "/" ve "veya" ayırıcıları).
        const ids = ['search', 'headerToggle', 'sheetRedo', 'stripMove']
        for (const id of ids) {
          const row = dialog.locator(`[data-shortcut="${id}"]`)
          if (!(await row.count())) continue
          await row.scrollIntoViewIfNeeded()
          await row.screenshot({ path: file(`keycaps-${id}-${platform}`) })
        }
        const legacy = dialog.locator('.ek-shortcuts__row')
        if (await legacy.count()) await legacy.first().screenshot({ path: file(`keycaps-${platform}`) })
      })
    }
  })

  test('arama — eşleşme vurgusu', async ({ page }) => {
    await fakePlatform(page, 'win')
    const dialog = await openDialog(page)
    const search = dialog.getByRole('searchbox')
    if (!(await search.count())) test.skip(true, 'ÖNCE: arama yok')
    await search.fill('sekme')
    await page.waitForTimeout(300)
    await page.screenshot({ path: file('search-win') })
    // Tuşla arama: eşleşen tuş kapakları vurgulanır.
    await search.fill('alt')
    await page.waitForTimeout(300)
    await page.screenshot({ path: file('search-keys-win') })
  })

  test('kategori — liste ve tablo', async ({ page }) => {
    await fakePlatform(page, 'mac')
    const dialog = await openDialog(page)
    const cat = dialog.getByRole('tab', { name: /Liste ve tablo/ })
    if (!(await cat.count())) test.skip(true, 'ÖNCE: kategori yok')
    await cat.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: file('category-mac') })
  })
})
