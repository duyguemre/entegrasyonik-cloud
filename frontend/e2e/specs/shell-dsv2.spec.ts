// DS-v2 Aşama 2 — kabuk göçü. YENİ spec (ADR-0015 Karar 5.1: yeni iddialar yeni spec dosyasına).
// Kısayol kaydı (navigation/shortcuts.ts), birleşik akıllı arama klavyesi, sekme sağ tık menüsü,
// sol menü (sarılan etiketler, ray tooltip'i) ve kabuk bölgelerinde axe WCAG 2.1 AA = 0.
// `SHELL_REVIEW_CAPTURE=1` → inceleme görselleri docs/design-system-review/a2-shell-*.png
// (belge görseli; Playwright tabanı DEĞİLDİR).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { appDialogs } from '../fixtures/appDialog'
import { gotoAuthed, openDrawer, openScreen, waitForPlatformListStable } from '../fixtures/nav'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const TAB = '.workplace-tabs [role="tab"]'

const searchMock = {
  'SmartService/unifiedSearch': {
    orders: [
      { _id: 'o-1', orderNumber: 'E2E-100001', integrationCode: 'trendyol', billingAddress: { firstName: 'Ayşe', lastName: 'K.' }, dates: { orderDate: '2026-09-28T10:00:00.000Z' } },
      { _id: 'o-2', orderNumber: 'E2E-100002', integrationCode: 'hepsiburada', billingAddress: { firstName: 'Mert', lastName: 'D.' } },
    ],
    products: [{ _id: 'p-1', title: 'Pamuklu tişört E2E-100', brand: 'Örnek', price: 349.9, stock: 12 }],
    customers: [],
    claims: [],
  },
}

const width = (page: Page) => page.viewportSize()?.width ?? 0
const isDesktop = (page: Page) => width(page) >= 1024

/**
 * Kabuk bölgeleri (üst bar, sol menü, sekme şeridi, açık katmanlar). Ekran içerikleri (çalışma
 * alanı ve onların kendi tooltip/overlay'leri) kendi spec'lerinde taranır — burada kapsam DIŞI.
 */
function shellAxe(page: Page) {
  return new AxeBuilder({ page })
    .withTags(AA)
    .include('.ek-shell-bar')
    .include('.v-navigation-drawer')
    .include('.workplace-tabs')
    .include('.v-overlay--active')
    .exclude('.workplace-area')
}

async function tabTop(page: Page) {
  return (await page.locator('.workplace-tabs').boundingBox())?.y ?? -1
}

test.describe('DS-v2 kabuk — kısayollar', () => {
  test('Ctrl+B sol menüyü daraltır/genişletir (masaüstü ray, tablet/mobil katman)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    const nav = page.locator('.v-navigation-drawer.soft-nav')
    const rail = page.locator('.v-navigation-drawer.soft-rail')

    await page.keyboard.press('Control+b')
    if (isDesktop(page)) {
      await expect(rail).toBeVisible()
      await expect(nav).toHaveCount(0)
      await page.keyboard.press('Control+b')
      await expect(nav).toBeVisible()
    } else {
      await expect(nav).toBeVisible()
      await expect(async () => expect((await nav.boundingBox())?.x ?? -999).toBeGreaterThan(-10)).toPass()
    }
  })

  test('Ctrl+←/→ sekmeler arası, Alt+1…9 n. sekme, Alt+W etkin sekmeyi kapatır', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await openScreen(page, 'ClaimListView')
    await expect(page.locator(TAB)).toHaveCount(3)
    await page.locator('.workplace-area').focus()

    await page.keyboard.press('Control+ArrowLeft')
    await expect(page.getByRole('tab', { name: 'Siparişler' })).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/\/orders$/)

    await page.keyboard.press('Control+ArrowRight')
    await expect(page.getByRole('tab', { name: 'İadeler' })).toHaveAttribute('aria-selected', 'true')

    await page.keyboard.press('Alt+1')
    await expect(page.getByRole('tab', { name: 'Anasayfa' })).toHaveAttribute('aria-selected', 'true')

    await page.keyboard.press('Alt+3')
    await expect(page.getByRole('tab', { name: 'İadeler' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Alt+w')
    await expect(page.locator(TAB)).toHaveCount(2)
    // Sabit (pano) sekmesi Alt+W ile kapanmaz.
    await page.keyboard.press('Alt+1')
    await page.keyboard.press('Alt+w')
    await expect(page.locator(TAB)).toHaveCount(2)
  })

  test('metin alanında Ctrl+← kelime atlar, sekme değiştirmez', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await page.keyboard.press('Control+k')
    const input = page.getByRole('combobox', { name: 'Akıllı arama' })
    await input.fill('iki kelime')
    await page.keyboard.press('Control+ArrowLeft')
    await expect(page.getByRole('tab', { name: 'Siparişler' })).toHaveAttribute('aria-selected', 'true')
  })

  test('Alt+U üst bölümü daraltır, Ctrl+Shift+F odak modu, Ctrl+K daraltılmışken aramayı gösterir', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    const shown = await tabTop(page)
    expect(shown).toBeGreaterThan(40)

    await page.keyboard.press('Alt+u')
    await expect.poll(() => tabTop(page)).toBeLessThan(4)
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('combobox', { name: 'Akıllı arama' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect.poll(() => tabTop(page)).toBeLessThan(4)
    await page.keyboard.press('Alt+u')
    await expect.poll(() => tabTop(page)).toBeGreaterThan(40)

    await page.keyboard.press('Control+Shift+F')
    await expect(page.locator('.v-navigation-drawer.soft-nav, .v-navigation-drawer.soft-rail')).toHaveCount(0)
    await expect.poll(() => tabTop(page)).toBeLessThan(4)
    await page.getByRole('button', { name: /Odak modundan çık/ }).click()
    await expect.poll(() => tabTop(page)).toBeGreaterThan(40)
  })

  test('? kısayol listesini açar; liste kayıttan gelir; Esc kapatır', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await page.locator('.workplace-area').focus()
    await page.keyboard.press('Shift+?')
    const dialog = appDialogs(page) // tur teklifi kartı da role=dialog; yalnız gerçek diyalog
    await expect(dialog.getByRole('heading', { name: 'Klavye kısayolları' })).toBeVisible()
    for (const text of ['Akıllı aramaya git', 'Sonraki sekme', 'Etkin sekmeyi kapat', 'Sol menüyü daralt', 'Üst bölümü daralt', 'Odak modu']) {
      await expect(dialog.getByText(text, { exact: false })).toBeVisible()
    }
    const results = await new AxeBuilder({ page }).withTags(AA).include('.v-overlay--active').analyze()
    expect(results.violations).toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})

test.describe('DS-v2 kabuk — akıllı arama', () => {
  test('gruplu sonuç + sayaç, eşleşme vurgusu, anahtar alan çipleri, ↑↓ Enter ile kayıt açılır', async ({ page }) => {
    await installApiMocks(page, searchMock)
    await gotoAuthed(page)
    await page.keyboard.press('Control+k')
    const input = page.getByRole('combobox', { name: 'Akıllı arama' })
    await input.fill('E2E-1000')

    const listbox = page.getByRole('listbox', { name: 'Akıllı arama sonuçları' })
    const orders = listbox.getByRole('group', { name: /Siparişler/ })
    await expect(orders).toContainText('2 sonuç')
    await expect(listbox.getByRole('group', { name: /Ürünler/ })).toContainText('1 sonuç')
    await expect(orders.locator('mark').first()).toHaveText('E2E-1000')
    await expect(orders.getByRole('option').first()).toContainText('Müşteri')
    await expect(orders.getByRole('option').first()).toContainText('Trendyol')

    // İlk seçenek etkin; ↓ ikinci siparişe geçer (aria-activedescendant).
    await expect(orders.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(orders.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
    const secondId = await orders.getByRole('option').nth(1).getAttribute('id')
    await expect(input).toHaveAttribute('aria-activedescendant', secondId!)

    const axe = await shellAxe(page).analyze()
    expect(axe.violations).toEqual([])

    await page.keyboard.press('Enter')
    await expect(page.locator('.orderListView')).toBeVisible()
    expect(page.url()).not.toContain('E2E-100002')
    expect(page.url()).not.toContain('globalSearch')
  })

  test('boş sorguda "Son açılanlar" gösterilir, Enter o ekrana döner', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await page.keyboard.press('Alt+1')
    await page.keyboard.press('Control+k')
    const recent = page.getByRole('group', { name: /Son açılanlar/ })
    await expect(recent).toBeVisible()
    await expect(recent.getByRole('option').nth(1)).toContainText('Siparişler')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('tab', { name: 'Siparişler' })).toHaveAttribute('aria-selected', 'true')
  })
})

test.describe('DS-v2 kabuk — sekme menüsü ve sol menü', () => {
  test('sağ tık: Kapat / Diğerlerini kapat / Sağdakileri kapat; pano sekmesi kapatılamaz', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await openScreen(page, 'ClaimListView')
    await openScreen(page, 'CustomerListView')
    await expect(page.locator(TAB)).toHaveCount(4)

    await page.getByRole('tab', { name: 'Siparişler' }).click({ button: 'right' })
    const menu = page.getByRole('menu', { name: 'Sekme işlemleri' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /^Kapat/ })).toBeFocused()
    const axe = await shellAxe(page).analyze()
    expect(axe.violations).toEqual([])
    await menu.getByRole('menuitem', { name: 'Sağdakileri kapat' }).click()
    await expect(page.locator(TAB)).toHaveCount(2)
    await expect(page.getByRole('tab', { name: 'Siparişler' })).toHaveAttribute('aria-selected', 'true')

    await openScreen(page, 'ClaimListView')
    // Klavye: sekmeye odaklan + Shift+F10.
    await page.getByRole('tab', { name: 'İadeler' }).focus()
    await page.keyboard.press('Shift+F10')
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Diğerlerini kapat' }).click()
    await expect(page.locator(TAB)).toHaveCount(2)
    await expect(page.getByRole('tab', { name: 'Anasayfa' })).toHaveCount(1)

    await page.getByRole('tab', { name: 'Anasayfa' }).click({ button: 'right' })
    await expect(menu.getByRole('menuitem', { name: /^Kapat/ })).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')
  })

  test('sol menü: etiketler kesilmez, etkin öğe işaretli, rayda ad tooltip\'te', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'MarketplaceView')
    await openDrawer(page)
    const nav = page.locator('.v-navigation-drawer.soft-nav')
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
    const clipped = await nav.locator('.ek-side__label').evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent),
    )
    expect(clipped).toEqual([])
    const axe = await shellAxe(page).analyze()
    expect(axe.violations).toEqual([])

    test.skip(!isDesktop(page), 'Ray yalnızca masaüstünde kullanıcı tercihi')
    await page.keyboard.press('Control+b')
    const rail = page.locator('.v-navigation-drawer.soft-rail')
    // Rayda düğme kabı 214px genişliğinde ama yalnız 64px'lik şerit görünür; merkeze değil ikonun üstüne gelinir.
    await rail.locator('button[aria-label="Siparişler"]').hover({ position: { x: 20, y: 18 } })
    await expect(page.getByRole('tooltip').filter({ hasText: 'Siparişler' })).toBeVisible()
    const railAxe = await shellAxe(page).analyze()
    expect(railAxe.violations).toEqual([])
    await page.keyboard.press('Control+b')
  })

  // Silindi: "üst bar çalışma alanı anahtarı (Genel ↔ seçili kayıt)" testi — Aşama 5'te anahtar kaldırıldı (EkAppHeader/ApplicationBar);
  // kayıt sekmeleri artık doğrudan sekme şeridinde (kayıt sekmesi açma davranışı ürün/sekme spec'lerinde kapsanır).

  test('axe: kabuk (üst bar, sol menü, sekme şeridi) WCAG 2.1 AA ihlali 0', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    const results = await shellAxe(page).analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('DS-v2 kabuk — inceleme görselleri', () => {
  test.skip(!process.env.SHELL_REVIEW_CAPTURE, 'yalnızca SHELL_REVIEW_CAPTURE=1 ile')
  test('1440 ve 390', async ({ page }) => {
    test.setTimeout(120_000)
    const dir = 'docs/design-system-review'
    const vw = Number(process.env.SHELL_REVIEW_WIDTH ?? 1440)
    const tag = vw >= 1440 ? '1440' : '390'
    await page.setViewportSize({ width: vw, height: vw >= 1440 ? 900 : 844 })
    await installApiMocks(page, searchMock)
    await gotoAuthed(page)
    await waitForPlatformListStable(page)
    await openScreen(page, 'OrderListView')
    await openScreen(page, 'MarketplaceView')
    await page.keyboard.press('Alt+1')
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${dir}/a2-shell-${tag}-kabuk.png` })

    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Akıllı arama' }).fill('E2E-1000')
    await expect(page.getByRole('group', { name: /Siparişler/ })).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${dir}/a2-shell-${tag}-arama.png` })
    await page.keyboard.press('Escape')

    await page.getByRole('tab', { name: 'Siparişler' }).click({ button: 'right' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${dir}/a2-shell-${tag}-sekme-menusu.png` })
    await page.keyboard.press('Escape')

    await page.locator('.workplace-area').focus()
    await page.keyboard.press('Shift+?')
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/a2-shell-${tag}-kisayollar.png` })
    await page.keyboard.press('Escape')

    if (vw >= 1440) {
      await page.keyboard.press('Control+b')
      await page.waitForTimeout(400)
      await page.locator('.v-navigation-drawer.soft-rail button[aria-label="Siparişler"]').hover()
      await expect(page.getByRole('tooltip').filter({ hasText: 'Siparişler' })).toBeVisible()
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${dir}/a2-shell-${tag}-ray.png` })
      await page.keyboard.press('Control+b')
      await page.keyboard.press('Alt+u')
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${dir}/a2-shell-${tag}-ust-daraltilmis.png` })
      await page.keyboard.press('Alt+u')
    } else {
      await page.keyboard.press('Control+b')
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${dir}/a2-shell-${tag}-menu.png` })
    }
  })
})
