// BO2-P3 (bo-r2b): Otopilot tam sayfa geniş yerleşim — sohbet sayfa genişliğini kullanır, ≥ 1600 px yardımcı sütun
// ("Ne sorabilirsiniz" tek dokunuşla gönderir), sayfa ve sohbet içinde yatay kaydırma yok (dar kapta tablo kart satır).
import { expect, test, type Page } from '@playwright/test'
import { signInFully } from '../support/session'

const composer = (page: Page) => page.getByRole('textbox', { name: "Otopilot'a mesaj" })

async function openPage(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { __BO_CHAT_MOCK__: unknown }).__BO_CHAT_MOCK__ = { config: 'enabled', speed: 0 }
  })
  await signInFully(page)
  await page.goto('/otopilot')
  await expect(composer(page)).toBeVisible()
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw).toBeLessThanOrEqual(cw)
}

test.describe('Otopilot tam sayfa (BO2-P3)', () => {
  test('geniş sohbet + yardımcı sütun; öneri tek dokunuşla gönderir; sayfa kaymaz, tablo kendi içinde de yatay kaymaz', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1280, 'geniş masaüstü')
    await openPage(page)
    const chat = page.locator('.ek-chat.is-page')
    await expect(chat).toHaveClass(/is-wide/)
    // 1440: yardımcı sütun yok, sohbet sayfa genişliğini alır (önceki 760 px okunur sınır kalktı).
    await expect(page.getByTestId('otopilot-rail')).toBeHidden()
    expect((await chat.boundingBox())!.width).toBeGreaterThan(1000)
    await page.setViewportSize({ width: 1680, height: 960 })
    const rail = page.getByTestId('otopilot-rail')
    await expect(rail.getByRole('heading', { name: 'Ne sorabilirsiniz' })).toBeVisible()
    await expect(page.getByTestId('otopilot-status')).toHaveText('Etkin')

    await rail.getByTestId('otopilot-prompt').first().click()
    await expect(chat.locator('.ek-chat-msg.is-user').first()).toContainText('müdahale')

    await composer(page).fill('Onay bekleyen siparişleri göster')
    await composer(page).press('Enter')
    const grid = chat.locator('.ek-chat-grid').first()
    await expect(grid).toBeVisible()
    const [gs, gc] = await grid.evaluate((el) => [el.scrollWidth, el.clientWidth])
    expect(gs).toBeLessThanOrEqual(gc)
    // Sohbet görünür alanı doldurur; sayfa dikeyde de kaymaz (yalnız konuşma kayar).
    const [sh, ch] = await page.evaluate(() => [document.documentElement.scrollHeight, document.documentElement.clientHeight])
    expect(sh).toBeLessThanOrEqual(ch + 1)
    await noHorizontalScroll(page)
  })

  test('dar ekran: yardımcı sütun yok, tablo etiketli kart satırlara iner (yatay kaydırma yok), oluşturucu görünür', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'telefon')
    await openPage(page)
    await expect(page.getByTestId('otopilot-rail')).toBeHidden()
    await composer(page).fill('Onay bekleyen siparişleri göster')
    await composer(page).press('Enter')
    const grid = page.locator('.ek-chat.is-page .ek-chat-grid').first()
    await expect(grid).toBeVisible()
    await expect(grid.locator('thead')).toHaveCSS('position', 'absolute')
    const [gs, gc] = await grid.evaluate((el) => [el.scrollWidth, el.clientWidth])
    expect(gs).toBeLessThanOrEqual(gc)
    await expect(grid.locator('tbody td').first()).toHaveAttribute('data-label', /.+/)
    await expect(composer(page)).toBeInViewport()
    await noHorizontalScroll(page)
  })
})
