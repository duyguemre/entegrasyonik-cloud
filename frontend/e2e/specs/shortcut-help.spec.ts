// fe-a14 — klavye kısayolları diyaloğu (premium). YENİ spec (ADR-0015 Karar 5.1: yeni iddialar yeni spec dosyasına).
// Kayıt defterinden türetme (tüm kısayollar görünür), arama + vurgu, Esc önce aramayı temizler, ok tuşlarıyla kategori,
// platform sembolleri (algılama + elle geçiş + hatırlama), 390px çip şeridi, axe WCAG 2.1 AA = 0, görsel taban.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed } from '../fixtures/nav'
import { SHORTCUT_CATALOG } from '../../src/navigation/shortcutCatalog'
import { SHORTCUT_CATEGORIES } from '../../src/navigation/shortcuts'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const width = (page: Page) => page.viewportSize()?.width ?? 0

async function fakeMac(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel', configurable: true })
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => ({ platform: 'macOS', mobile: false, brands: [] }), configurable: true })
  })
}

async function open(page: Page) {
  await installApiMocks(page)
  await gotoAuthed(page)
  await page.locator('.workplace-area').focus()
  await page.keyboard.press('Shift+?')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Klavye kısayolları' })).toBeVisible()
  return dialog
}

async function settled(page: Page) {
  await expect
    .poll(() => page.locator('.v-overlay--active').evaluateAll((els) => els.flatMap((el) => el.getAnimations({ subtree: true })).filter((a) => a.playState === 'running').length), { timeout: 10000 })
    .toBe(0)
}

test.describe('Klavye kısayolları diyaloğu (fe-a14)', () => {
  test('kayıttaki TÜM kısayollar kategorilerde; açan kısayol başlıkta; arama kutusu odakta', async ({ page }) => {
    const dialog = await open(page)
    const search = dialog.getByRole('searchbox', { name: 'Kısayol ara' })
    if (width(page) >= 768) await expect(search).toBeFocused()
    await expect(dialog.locator('.ek-dialog__desc')).toContainText('Soru işareti')
    for (const s of SHORTCUT_CATALOG) {
      await expect(dialog.locator(`[data-shortcut="${s.id}"]`), s.id).toHaveCount(1)
    }
    const tabs = dialog.getByRole('tab')
    await expect(tabs).toHaveCount(SHORTCUT_CATEGORIES.length + 1)
    await expect(tabs.first()).toContainText(String(SHORTCUT_CATALOG.length))
    await expect(dialog.locator('.ek-sc__tip')).toHaveCount(3)
  })

  test('arama süzer ve vurgular; tuşla arama kapağı vurgular; Esc önce aramayı temizler, sonra kapatır', async ({ page }) => {
    const dialog = await open(page)
    const search = dialog.getByRole('searchbox', { name: 'Kısayol ara' })
    await search.fill('şerit')
    await expect(dialog.locator('[data-shortcut="stripClose"]')).toBeVisible()
    await expect(dialog.locator('[data-shortcut="search"]')).toHaveCount(0)
    await expect(dialog.locator('mark').first()).toBeVisible()
    await expect(dialog.getByRole('status')).toContainText('kısayol bulundu')
    await search.fill('alt r')
    await expect(dialog.locator('[data-shortcut]')).toHaveCount(1)
    await expect(dialog.locator('[data-shortcut="pageRefresh"] .ek-keycap.is-match')).toHaveCount(2)
    await search.fill('zzqx')
    await expect(dialog.getByText('için kısayol bulunamadı')).toBeVisible()
    await search.focus()
    await page.keyboard.press('Escape')
    await expect(search).toHaveValue('')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('ok tuşlarıyla kategori gezinme (dolaşan tabindex, otomatik seçim)', async ({ page }) => {
    const dialog = await open(page)
    const all = dialog.getByRole('tab', { name: /Tümü/ })
    await all.focus()
    const next = width(page) < 720 ? 'ArrowRight' : 'ArrowDown'
    await page.keyboard.press(next)
    const nav = dialog.getByRole('tab', { name: /Gezinme/ })
    await expect(nav).toBeFocused()
    await expect(nav).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.locator('[data-shortcut="searchMove"]')).toBeVisible()
    await expect(dialog.locator('[data-shortcut="tabNext"]')).toHaveCount(0)
    await page.keyboard.press('End')
    await expect(dialog.getByRole('tab', { name: /Yardım/ })).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.locator('[data-shortcut="shortcutHelp"]')).toBeVisible()
  })

  test("macOS algılanır (⌘ ⌥ ⇧); elle Windows/Linux'a geçiş hatırlanır", async ({ page }) => {
    await fakeMac(page)
    const dialog = await open(page)
    const row = dialog.locator('[data-shortcut="search"] .ek-keycap')
    await expect(dialog.getByRole('radio', { name: 'macOS' })).toHaveAttribute('aria-checked', 'true')
    await expect(row.first()).toHaveText('⌘')
    await expect(dialog.locator('[data-shortcut="search"]')).toContainText('Command K')
    await dialog.getByRole('radio', { name: 'Windows / Linux' }).click()
    await expect(row.first()).toHaveText('Ctrl')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.locator('.workplace-area').focus()
    await page.keyboard.press('Shift+?')
    await expect(page.getByRole('dialog').getByRole('radio', { name: 'Windows / Linux' })).toHaveAttribute('aria-checked', 'true')
  })

  test('dar ekranda kategori seçici yatay çip şeridi; tek sütun satır', async ({ page }) => {
    test.skip(width(page) >= 720, 'yalnız dar ekran')
    const dialog = await open(page)
    const tablist = dialog.getByRole('tablist')
    await expect(tablist).toHaveAttribute('aria-orientation', 'horizontal')
    const [a, b] = await Promise.all([dialog.getByRole('tab').nth(0).boundingBox(), dialog.getByRole('tab').nth(1).boundingBox()])
    expect(Math.abs((a?.y ?? 0) - (b?.y ?? 1))).toBeLessThan(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('axe WCAG 2.1 AA = 0 (liste + arama durumu) ve görsel taban', async ({ page }) => {
    const dialog = await open(page)
    await settled(page)
    let results = await new AxeBuilder({ page }).withTags(AA).include('.v-overlay--active').analyze()
    expect(results.violations).toEqual([])
    await dialog.getByRole('searchbox', { name: 'Kısayol ara' }).fill('sekme')
    results = await new AxeBuilder({ page }).withTags(AA).include('.v-overlay--active').analyze()
    expect(results.violations).toEqual([])
    await dialog.getByRole('searchbox', { name: 'Kısayol ara' }).fill('')
    await dialog.getByRole('radio', { name: 'Windows / Linux' }).click()
    await page.mouse.move(0, 0)
    await expect(dialog.locator('.ek-dialog').first()).toHaveScreenshot('shortcut-help-dialog.png', { animations: 'disabled', caret: 'hide' })
  })
})
