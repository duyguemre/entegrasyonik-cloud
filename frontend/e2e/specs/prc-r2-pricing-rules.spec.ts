// PRC-R2 (cloud/prc-r2) — Fiyat kuralları ekranı: açma (taslak sorumluluk metni + çift motor onayı), öneriler (tek/toplu onay, önce → sonra
// önizleme, kısmi sonuç), kurallar (boş form K4, K1 hatası, rakip alanı yok K6), fiyat geçmişi, platform kapalı, 403. Sahte API (backend yok).
// İnceleme görüntüleri: PRC_REVIEW=1 PRC_OUT=docs/prc-r2-review/<genişlik> (günlük koşuda görüntü yazılmaz).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page, Route } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { waitForWorkplaceReady } from '../fixtures/nav'
import {
  applyPartial, historyOk, menuFixtureWithPricingRules, rulesState, rulesStateOff, rulesStatePlatformOff, suggestionsBlocked, suggestionsEmpty, suggestionsOpen,
} from '../fixtures/pricingRules'

test.describe.configure({ timeout: 120_000 })

if (process.env.PRC_WIDTH) {
  const w = Number(process.env.PRC_WIDTH)
  test.use({ viewport: { width: w, height: w <= 480 ? 844 : 800 } })
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const REVIEW = process.env.PRC_REVIEW === '1'
const OUT = process.env.PRC_OUT || 'docs/prc-r2-review/1280'
const ROOT = '.prView'
const json = (route: Route, headers: Record<string, string>, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })

async function shot(page: Page, name: string) {
  if (!REVIEW) return
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
}

async function seriousAxe(page: Page, include: string) {
  // fe-r4d D1: renk geçişi (150–300ms token hareketi) sürerken ölçülen ara renk (~#7891e1) sahte kontrast ihlali
  // üretiyordu (mobil/tablet, yük altında). Axe yerleşmiş son durumu ölçer: süren CSS geçiş/animasyonları beklenir
  // (sonsuz animasyonlar — iskelet/yükleniyor — beklenmez).
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  const r = await new AxeBuilder({ page }).include(include).withTags(AXE_TAGS).analyze()
  return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
}

type Calls = Record<string, any[]>
function capture(calls: Calls, op: string, response: unknown | ((body: any) => unknown)) {
  return async (route: Route, h: Record<string, string>) => {
    const body = route.request().postDataJSON()
    ;(calls[op] ??= []).push(body)
    return json(route, h, typeof response === 'function' ? (response as (b: any) => unknown)(body) : response)
  }
}

async function open(page: Page, overrides: Record<string, any>, query = '') {
  await installApiMocks(page, { MenuService: menuFixtureWithPricingRules, ...overrides })
  await page.goto(`/catalog/pricing-rules${query}`)
  await waitForWorkplaceReady(page)
  const root = page.locator(`${ROOT}:not(.hide-tab-component)`)
  await expect(root).toBeVisible({ timeout: 30_000 })
  await page.addStyleTag({ content: '[data-help-tour-offer]{display:none!important}' })
  return root
}

test.describe('PRC-R2 — açma (K3, K17, K19)', () => {
  test('kapalı: bant "aç" der; metin TASLAK etiketli; iki onay olmadan açılmaz; açınca sürüm + çift motor onayı gönderilir', async ({ page }) => {
    const calls: Calls = {}
    const view = await open(page, {
      'PricingService/getRules': rulesStateOff(),
      'PricingService/listSuggestions': suggestionsEmpty(),
      'PricingService/setPricingSettings': capture(calls, 'settings', rulesState()),
    })
    await expect(view.getByTestId('pricing-banner')).toHaveAttribute('data-state', 'needs_enable')
    await expect(view.getByTestId('pricing-banner')).toContainText('Fiyat kuralları kapalı')
    await shot(page, '01-kapali')
    expect(await seriousAxe(page, ROOT)).toEqual([])

    await view.getByTestId('enable-pricing').click()
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByTestId('consent-draft')).toContainText('Taslak')
    await expect(dlg.getByTestId('consent-text')).toContainText('sorumluluğu size aittir')
    const submit = dlg.getByRole('button', { name: 'Aç', exact: true })
    await expect(submit).toBeDisabled()
    await dlg.getByTestId('consent-accept').locator('input').check()
    await expect(submit).toBeDisabled()
    await dlg.getByTestId('dual-engine-ack').locator('input').check()
    await shot(page, '02-acma-sorumluluk-metni')
    expect(await seriousAxe(page, '.v-overlay--active')).toEqual([])
    await submit.click()
    await expect.poll(() => calls.settings?.length ?? 0).toBe(1)
    expect(calls.settings[0]).toEqual({ enabled: true, consentVersion: '2026-10-01-draft', dualEngineAcknowledged: true })
    await expect(view.getByTestId('pricing-banner')).toHaveAttribute('data-state', 'active')
  })

  test('platform kapalı: bant bilgi verir, açma ve kural ekleme yok', async ({ page }) => {
    const view = await open(page, { 'PricingService/getRules': rulesStatePlatformOff(), 'PricingService/listSuggestions': suggestionsEmpty() })
    await expect(view.getByTestId('pricing-banner')).toHaveAttribute('data-state', 'platform_off')
    await expect(view.getByTestId('enable-pricing')).toHaveCount(0)
    await view.getByRole('tab', { name: /Kurallar/ }).click()
    await expect(view.getByTestId('add-rule')).toBeDisabled()
    await shot(page, '09-platform-kapali')
  })

  test('403: yetki yok durumu (ham hata yok)', async ({ page }) => {
    const view = await open(page, { 'PricingService/getRules': mockError(403, { error: 'Forbidden' }), 'PricingService/listSuggestions': suggestionsEmpty() })
    await expect(view).toContainText('Bu işlem için yetkiniz yok')
    await shot(page, '10-yetkisiz')
  })
})

test.describe('PRC-R2 — öneriler ve İNSAN ONAYI', () => {
  test('liste: önce/sonra, buybox (sıra · zaman), kâr, taban/tavan, son 10 gün; uyarı çipleri', async ({ page }) => {
    const view = await open(page, { 'PricingService/getRules': rulesState(), 'PricingService/listSuggestions': suggestionsOpen() })
    const grid = view.getByTestId('suggestions-grid')
    await expect(grid.locator('tbody tr')).toHaveCount(3)
    await expect(grid.locator('tbody tr').nth(0)).toContainText('SK-E2E-SIYAH')
    await expect(grid.locator('tbody tr').nth(0)).toContainText('218,90')
    await expect(grid.locator('tbody tr').nth(0)).toContainText('3. sıra')
    await expect(grid.locator('tbody tr').nth(1)).toContainText('Üstü çizili fiyat gösteriliyor')
    await expect(view).not.toContainText(/indirim/i)
    await shot(page, '03-oneriler')
    expect(await seriousAxe(page, ROOT)).toEqual([])
  })

  test('toplu onay: pencere önce → sonra önizler; onaylayınca yalnız seçilen kimlikler gider; kısmi sonuç ve uygulanmayanlar nedenleriyle', async ({ page }) => {
    const calls: Calls = {}
    let applied = false
    const view = await open(page, {
      'PricingService/getRules': rulesState(),
      'PricingService/listSuggestions': async (route: Route, h: Record<string, string>) => json(route, h, applied ? { ...suggestionsOpen(), items: suggestionsOpen().items.slice(1) } : suggestionsOpen()),
      'PricingService/applySuggestions': capture(calls, 'apply', () => { applied = true; return applyPartial }),
    })
    const grid = view.getByTestId('suggestions-grid')
    await expect(grid.locator('tbody tr')).toHaveCount(3)
    await grid.locator('tbody tr').nth(0).locator('input[type=checkbox]').check()
    await grid.locator('tbody tr').nth(1).locator('input[type=checkbox]').check()
    await expect(view.getByTestId('apply-selected')).toContainText('Seçilenleri onayla (2)')
    expect(calls.apply).toBeUndefined() // otomatik uygulama yok: seçmek hiçbir şey göndermez
    await view.getByTestId('apply-selected').click()
    const dlg = page.getByRole('alertdialog')
    await expect(dlg).toContainText('2 fiyat güncellensin mi?')
    await expect(dlg).toContainText('Liste (üstü çizili) fiyat değişmez')
    const preview = dlg.getByTestId('apply-preview')
    await expect(preview.locator('tbody tr')).toHaveCount(2)
    await expect(preview.locator('tbody tr').nth(0)).toContainText('249,90')
    await expect(preview.locator('tbody tr').nth(0)).toContainText('218,90')
    await shot(page, '04-onay-onizleme')
    expect(await seriousAxe(page, '.v-overlay--active')).toEqual([])
    await dlg.getByRole('button', { name: '2 fiyatı güncelle' }).click()
    await expect.poll(() => calls.apply?.length ?? 0).toBe(1)
    expect(calls.apply[0]).toEqual({ suggestionIds: ['660000000000000000000001', '660000000000000000000002'] })
    await expect(view.getByTestId('apply-rejected')).toContainText('Güncel veriyle hedef fiyat değişti')
    await expect(page.getByText('1 fiyat güncellendi, 1 öneri denetimden geçmedi.')).toBeVisible()
    await shot(page, '05-kismi-sonuc')
  })

  test('engellenen öneriler nedeniyle görünür; onay seçeneği yok', async ({ page }) => {
    const view = await open(page, {
      'PricingService/getRules': rulesState(),
      'PricingService/listSuggestions': async (route: Route, h: Record<string, string>) => json(route, h, route.request().postDataJSON()?.status === 'blocked' ? suggestionsBlocked() : suggestionsOpen()),
    })
    await view.getByTestId('suggestion-status').click()
    await page.getByRole('option', { name: 'Engellenen' }).click()
    const grid = view.getByTestId('suggestions-grid')
    await expect(grid.locator('tbody tr')).toHaveCount(1)
    await expect(grid).toContainText('Hedef fiyat tabanın altında kalıyor.')
    await expect(view.getByTestId('apply-selected')).toHaveCount(0)
    await shot(page, '06-engellenen')
  })
})

test.describe('PRC-R2 — kurallar (K1, K4, K6) ve geçmiş', () => {
  test('kurallar: özet kartları, duraklatılmış kural uyarısı; bildirim bağlantısı kuralı vurgular', async ({ page }) => {
    const view = await open(page, { 'PricingService/getRules': rulesState(), 'PricingService/listSuggestions': suggestionsOpen() }, '?rule=650000000000000000000002')
    await expect(view.getByTestId('rules-panel')).toBeVisible()
    await expect(view.locator('[data-rule="650000000000000000000002"]')).toHaveClass(/pr-rule--focus/)
    await expect(view.getByTestId('rule-paused')).toContainText('Entegrasyonik dışında değişti')
    await shot(page, '07-kurallar')
    expect(await seriousAxe(page, ROOT)).toEqual([])
  })

  test('yeni kural: form BOŞ gelir (K4); fark 0 → K1 hatası ve istek gitmez; doğru değerle gövde yalnız şema alanları (K6)', async ({ page }) => {
    const calls: Calls = {}
    const view = await open(page, {
      'PricingService/getRules': rulesState(), 'PricingService/listSuggestions': suggestionsOpen(),
      'PricingService/saveRule': capture(calls, 'save', (b: any) => ({ ...b, id: '650000000000000000000003', type: 'competition', version: 1, scope: { productIds: [], barcodes: [] }, pausedReason: null, pausedAt: null, updatedAt: null, suggestions: { open: 0, blocked: 0 } })),
    }, '?tab=rules')
    await view.getByTestId('add-rule').click()
    const dlg = page.getByRole('dialog')
    for (const id of ['f-delta-amount', 'f-delta-percent', 'f-floor', 'f-ceiling', 'f-step', 'f-max-changes', 'f-cooldown', 'f-max-increase']) {
      await expect(dlg.getByTestId(id).locator('input')).toHaveValue('')
    }
    await dlg.getByTestId('f-name').locator('input').fill('Test kuralı')
    await dlg.getByTestId('f-mode').click()
    await page.getByRole('option', { name: 'Buybox fiyatının altında kal' }).click()
    await dlg.getByTestId('f-delta-amount').locator('input').fill('0')
    await dlg.getByTestId('f-floor').locator('input').fill('10')
    await dlg.getByTestId('f-ceiling').locator('input').fill('300')
    await dlg.getByTestId('f-step').locator('input').fill('0.01')
    await dlg.getByTestId('f-max-changes').locator('input').fill('6')
    await dlg.getByTestId('f-cooldown').locator('input').fill('30')
    await dlg.getByTestId('f-max-increase').locator('input').fill('5')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(dlg).toContainText('Buybox fiyatına eşitleme yapılmaz.')
    await shot(page, '08-kural-formu-k1')
    expect(calls.save).toBeUndefined()
    await dlg.getByTestId('f-delta-amount').locator('input').fill('1.5')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect.poll(() => calls.save?.length ?? 0).toBe(1)
    expect(calls.save[0]).toEqual({
      name: 'Test kuralı', enabled: false, integrationCode: 'trendyol',
      competition: { mode: 'below', deltaAmount: 1.5, deltaPercent: null, floorMarginPercent: 10, ceiling: 300, step: 0.01, maxChangesPerDay: 6, cooldownMin: 30, maxIncreasePercentPerDay: 5, excludeIfOutOfStock: false },
    })
  })

  test('fiyat geçmişi: onaylı öneri ve dış değişiklik ayrı etiketli', async ({ page }) => {
    const view = await open(page, { 'PricingService/getRules': rulesState(), 'PricingService/listSuggestions': suggestionsOpen(), 'PricingService/getPriceHistory': historyOk() }, '?tab=history')
    const grid = view.getByTestId('history-grid')
    await expect(grid.locator('tbody tr')).toHaveCount(2)
    await expect(grid.locator('tbody tr').nth(0)).toContainText('Onaylı öneri')
    await expect(grid.locator('tbody tr').nth(1)).toContainText('Entegrasyonik dışında')
    await shot(page, '11-fiyat-gecmisi')
    expect(await seriousAxe(page, ROOT)).toEqual([])
  })
})

test.describe('PRC-R2 — fe-r4d D1: kaydırılabilir ızgara klavyeyle erişilir', () => {
  test('taşan geçmiş ızgarası odaklanabilir bölge (adlı) olur ve ok tuşuyla kayar; taşmayan ızgara sekme durağı eklemez', async ({ page }, testInfo) => {
    const view = await open(page, { 'PricingService/getRules': rulesState(), 'PricingService/listSuggestions': suggestionsOpen(), 'PricingService/getPriceHistory': historyOk() }, '?tab=history')
    const grid = view.getByTestId('history-grid')
    await expect(grid.locator('tbody tr')).toHaveCount(2)
    const overflows = await grid.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
    if (!overflows) {
      await expect(grid).not.toHaveAttribute('tabindex', /.*/)
      return
    }
    await expect(grid).toHaveAttribute('tabindex', '0')
    await expect(grid).toHaveAttribute('role', 'region')
    await expect(grid).toHaveAccessibleName(/kaydırılabilir/)
    await grid.focus()
    const before = await grid.evaluate((el) => el.scrollLeft + el.scrollTop)
    await page.keyboard.press(testInfo.project.name === 'chromium-mobile' ? 'ArrowDown' : 'ArrowRight')
    await expect.poll(() => grid.evaluate((el) => el.scrollLeft + el.scrollTop)).toBeGreaterThan(before)
  })
})
