// ADR-0015 Aşama A3 — kabuk v2 (kalıcı/daraltılabilir kenar menü + komut paleti → DS-v2'de birleşik akıllı arama). YENİ spec
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
  // [DS-v2 Aşama 2] Komut paleti üst bardaki BİRLEŞİK akıllı aramaya katıldı (DESIGN_SYSTEM §8.1):
  // aynı davranış sözleşmesi (Ctrl+K odak, yazınca ekran filtresi, Enter ile git, Esc kapat, eşleşme
  // yoksa mesaj) artık `role=combobox` arama alanında doğrulanır.
  test('akıllı arama (komut paleti): Ctrl+K odaklar, yazınca filtreler, Enter ile ekrana gider, Esc kapatır', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    await page.keyboard.press('Control+k')
    const input = page.getByRole('combobox', { name: 'Akıllı arama' })
    await expect(input).toBeFocused()

    await input.fill('sipariş')
    const listbox = page.getByRole('listbox', { name: 'Akıllı arama sonuçları' })
    await expect(listbox.getByRole('option', { name: /Sipariş/ }).first()).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(listbox).toBeHidden()
    await expect(page.locator('.orderListView')).toBeVisible()

    // Esc kapatır ve odak aramadan çıkar.
    await page.keyboard.press('Control+k')
    await expect(input).toBeFocused()
    await input.fill('sip')
    await expect(listbox).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(listbox).toBeHidden()
    await expect(input).not.toBeFocused()
  })

  test('akıllı arama: eşleşme yoksa "sonuç yok" gösterir, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Akıllı arama' }).fill('zzz-eslesmeyen-sorgu-xyz')
    await expect(page.getByRole('status').filter({ hasText: 'için sonuç yok' })).toBeVisible()
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

  test('axe: akıllı arama açılırı WCAG 2.1 AA (yalnızca kaydediliyor; AA=0 iddiası shell-dsv2.spec.ts\'te)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Akıllı arama' }).fill('sip')
    await expect(page.getByRole('listbox', { name: 'Akıllı arama sonuçları' })).toBeVisible()

    const AxeBuilder = (await import('@axe-core/playwright')).default
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-akilli-arama-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] Akıllı arama: ${results.violations.length} WCAG 2.1 AA ihlali (bkz. ek).`)
  })
})
