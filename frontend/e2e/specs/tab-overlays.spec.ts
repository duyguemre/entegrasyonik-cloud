// DS-v2 Aşama 6b — Standart 7: sekme sınırında kalan örtüler (çalışma alanı çoklu görevi).
// İki sekmede ayrı diyalog açık; sekmeler arası geçiş; diğer sekmede işlem; Esc yalnız odaktaki sekmeyi kapatır;
// örtü sekme şeridini / üst barı / sol menüyü ÖRTMEZ; gizli sekmedeki diyalog durumunu korur.
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, openScreen } from '../fixtures/nav'

test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, 'Masaüstü tablo satırındaki göz düğmesiyle açılır')

const tab = (page: Page, name: RegExp) => page.locator('.workplace-tabs [role="tab"]').filter({ hasText: name }).first()
const orderSheet = (page: Page) => page.getByRole('dialog').filter({ hasText: 'E2E-100001' })
const claimSheet = (page: Page) => page.getByRole('dialog').filter({ hasText: 'CLM-E2E-0001' })

async function openBoth(page: Page) {
  await installApiMocks(page)
  await gotoAuthed(page)
  await openScreen(page, 'ClaimListView')
  await openScreen(page, 'OrderListView')
  await page.locator('.orderListView tbody tr').first().getByRole('button', { name: 'Sipariş detayını görüntüle' }).click()
  await expect(orderSheet(page)).toBeVisible()
}

test.describe('Aşama 6b — Standart 7: sekme içi örtüler', () => {
  test('diyalog yalnız sekmenin içerik alanını örter; şerit, üst bar ve sol menü açık kalır', async ({ page }) => {
    await openBoth(page)
    const area = (await page.locator('.workplace-area').boundingBox())!
    const overlay = (await page.locator('.ek-tab-host .v-overlay--active').first().boundingBox())!
    expect(overlay.y).toBeGreaterThanOrEqual(area.y - 1)
    expect(overlay.x).toBeGreaterThanOrEqual(area.x - 1)
    expect(overlay.x + overlay.width).toBeLessThanOrEqual(area.x + area.width + 1)
    // Şerit ve üst bar tıklanabilir (örtünün altında kalmaz).
    await expect(tab(page, /İade/)).toBeVisible()
    const stripHit = await tab(page, /İade/).evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return !!hit && el.contains(hit)
    })
    expect(stripHit).toBe(true)
    const searchHit = await page.locator('.ek-search input').first().evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + 10, r.y + r.height / 2)
      return !!hit && (el === hit || el.contains(hit) || hit.contains(el))
    })
    expect(searchHit).toBe(true)
  })

  test('iki sekmede ayrı diyalog: geçişte gizlenir, dönünce aynı durumda; diğer sekmede işlem yapılır', async ({ page }) => {
    await openBoth(page)
    await tab(page, /İade/).click()
    await expect(orderSheet(page)).toBeHidden()
    // Diğer sekmede işlem: iade detayı açılır.
    await page.locator('.claimListView tbody tr').first().getByRole('button', { name: 'Talep detayını görüntüle' }).click()
    await expect(claimSheet(page)).toBeVisible()
    // Siparişe dön: sipariş diyaloğu aynı durumda görünür, iade diyaloğu gizli.
    await tab(page, /Sipariş/).click()
    await expect(orderSheet(page)).toBeVisible()
    await expect(claimSheet(page)).toBeHidden()
    // Odak geri dönen sekmenin açık diyaloğunda.
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.ek-detail-sheet'))).toBe(true)
    // Esc yalnız odaktaki (sipariş) diyaloğu kapatır; iade sekmesindeki açık kalır.
    await page.keyboard.press('Escape')
    await expect(orderSheet(page)).toBeHidden()
    await tab(page, /İade/).click()
    await expect(claimSheet(page)).toBeVisible()
  })

  test('sekme kısayolu diyalog açıkken de çalışır (Ctrl+←/→), diyalog kendi sekmesinde kalır', async ({ page }) => {
    await openBoth(page)
    await page.locator('.ek-detail-sheet').first().click({ position: { x: 20, y: 20 } })
    await page.keyboard.press('Control+ArrowLeft')
    await expect(page.locator('.claimListView')).toBeVisible()
    await expect(orderSheet(page)).toBeHidden()
    await page.keyboard.press('Control+ArrowRight')
    await expect(orderSheet(page)).toBeVisible()
  })
})
