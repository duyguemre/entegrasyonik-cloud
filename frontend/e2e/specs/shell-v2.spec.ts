// ADR-0015 Aşama A3 — kabuk v2 (kalıcı/daraltılabilir kenar menü + komut paleti). YENİ spec
// dosyası (Karar 5.1 "yeni iddialar yeni spec dosyalarına yazılır; mevcutlar değiştirilmez").
// `shell.spec.ts`'in davranış sözleşmesine DOKUNMAZ — yalnızca A3'te eklenen YENİ davranışları
// (Ctrl+K, ray daraltma persist'i, klavye ile menü gezinimi) doğrular. 3 viewport (chromium
// mobile/tablet/desktop projeleri, `playwright.config.ts`) üzerinde koşar; viewport'a özgü
// davranışlar (`ray` yalnızca masaüstü/tablette anlamlıdır) o viewport'ta atlanır.
import { test, expect } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, openDrawer } from '../fixtures/nav'

const SIDEBAR_STORAGE_KEY = 'ek.ui.v1.sidebar'

test.describe('P1 — Kabuk v2 (ADR-0015 A3: ray/komut paleti/klavye)', () => {
  test('komut paleti: Ctrl+K açar, yazınca filtreler, Enter ile ekrana gider, Esc kapatır', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    await page.keyboard.press('Control+k')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const input = dialog.locator('input.ek-cmdk__input')
    await expect(input).toBeFocused()

    await input.fill('sipariş')
    await expect(dialog.getByText('Sipariş', { exact: false })).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(page.locator('.orderListView')).toBeVisible()

    // Esc kapatır (davranış iddiası, komut paleti tekrar açılıp bu sefer Esc ile kapatılır).
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('komut paleti: eşleşme yoksa "bulunamadı" gösterir, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    await page.keyboard.press('Control+k')
    const dialog = page.getByRole('dialog')
    await dialog.locator('input.ek-cmdk__input').fill('zzz-eslesmeyen-sorgu-xyz')
    await expect(dialog.getByText('Eşleşen ekran bulunamadı.')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('TypeError')
  })

  test('masaüstünde ray (daraltılmış) tercihi kalıcıdır (yeniden yüklemede korunur)', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, 'Ray daraltma yalnızca masaüstünde kullanıcı tercihidir (ADR Karar 2.2).')
    await installApiMocks(page)
    await gotoAuthed(page)

    // Varsayılan: tam (248px) kalıcı menü açık.
    await expect(page.locator('.v-navigation-drawer.soft-nav')).toBeVisible()

    await page.locator('.collapse-btn').click()
    await expect(page.locator('.v-navigation-drawer.soft-rail')).toBeVisible()
    await expect(page.locator('.v-navigation-drawer.soft-nav')).toHaveCount(0)

    const stored = await page.evaluate((key) => localStorage.getItem(key), SIDEBAR_STORAGE_KEY)
    expect(stored).toBe('rail')

    await gotoAuthed(page)
    await expect(page.locator('.v-navigation-drawer.soft-rail')).toBeVisible()

    // Genişlet düğmesiyle geri dönülebilir ve tercih güncellenir.
    await page.locator('.rail-logo-btn').click()
    await expect(page.locator('.v-navigation-drawer.soft-nav')).toBeVisible()
    const storedAfterExpand = await page.evaluate((key) => localStorage.getItem(key), SIDEBAR_STORAGE_KEY)
    expect(storedAfterExpand).toBe('expanded')
  })

  test('klavye ile menü gezinimi: bir menü öğesi Enter ile etkinleştirilebilir', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openDrawer(page)

    const drawer = page.locator('.v-navigation-drawer.soft-nav')
    const ordersItem = drawer.locator('.soft-item').filter({ has: page.locator('.mdi-cart-outline') }).first()
    await ordersItem.focus()
    await page.keyboard.press('Enter')

    await expect(page.locator('.orderListView')).toBeVisible()
  })

  test('axe: komut paleti WCAG 2.1 AA (yalnızca kaydediliyor, bu görevde düzeltilmiyor)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()

    const AxeBuilder = (await import('@axe-core/playwright')).default
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-komut-paleti-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] Komut paleti: ${results.violations.length} WCAG 2.1 AA ihlali (bkz. ek).`)
  })
})
