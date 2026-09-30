// C2.4 (F-19) — kişisel kayıtlı görünümler (sipariş + iade). Ortak katman: EkListScreen `saved-views`
// → EkFilterPanel `#head-actions` → EkSavedViews → composables/useSavedViews.ts.
// Kanıtlanan: kaydet → yenile → uygula adresi (ADR-0012 Karar 2) ve sorguyu doğru kurar; serbest metin
// (globalSearch) ve kayıtsız alanlar (kanal) SAKLANMAZ; anahtar kullanıcı + mağaza kapsamlı; depolama
// yoksa özellik gizlenir; ekran başına 20 sınırı; silme + Geri al; axe = 0 (3 viewport).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { claimsDoluFixture, ordersDoluFixture, userContextFixture } from '../fixtures/apiData'
import { openScreen, gotoAuthed, waitForWorkplaceReady } from '../fixtures/nav'

const STORAGE_KEY = `ek.views.v1.${userContextFixture._id}.default`
const SEARCH_TEXT = 'Ayşe Yılmaz 0555'

function recordBodies(path: string, fixture: any, sink: any[]) {
  return {
    [path]: async (route: any, headers: Record<string, string>) => {
      sink.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(fixture) })
    },
  }
}

const views = (page: Page, root: string) => page.locator(root).getByRole('button', { name: /^Kayıtlı görünümler/ })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Kayıtlı görünümler' })
const applyButton = (page: Page, name: string) => panel(page).locator('[data-view-apply]').filter({ hasText: name })
const activeFilters = (page: Page, root: string) => page.locator(root).getByRole('group', { name: 'Aktif filtreler' })

async function saveCurrentAs(page: Page, root: string, name: string) {
  await views(page, root).click()
  await panel(page).getByLabel('Görünüm adı').fill(name)
  await panel(page).getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText(`“${name}” görünümü kaydedildi.`)).toBeVisible()
}

test.describe('C2.4 — Kayıtlı görünümler', () => {
  test('sipariş: kaydet → yenile → uygula adresi ve sorguyu doğru kurar; arama metni saklanmaz', async ({ page }) => {
    const bodies: any[] = []
    await installApiMocks(page, recordBodies('OrderService/getOrders', ordersDoluFixture, bodies))
    await page.goto('/orders?internalStatuses=AWAITING_APPROVAL,APPROVED&allocationStates=OVERSOLD')
    await waitForWorkplaceReady(page)
    const root = '.orderListView'
    await expect(activeFilters(page, root).getByText('Satıcı Onayı Bekliyor, Sipariş Onaylandı')).toBeVisible()

    // Serbest metin (PII olabilir) ARAMA: filtreye girer ama görünüme ASLA girmez.
    await page.locator(root).getByRole('textbox', { name: 'Sipariş No, Müşteri Adı veya Telefon Ara' }).fill(SEARCH_TEXT)
    await expect(activeFilters(page, root).getByText(SEARCH_TEXT)).toBeVisible()

    await saveCurrentAs(page, root, 'Onay kuyruğu')
    await page.keyboard.press('Escape')
    // Kaydedilen görünüm mevcut filtrelerle aynı → tetikleyici onun adını gösterir.
    await expect(views(page, root)).toContainText('Onay kuyruğu')

    const stored = await page.evaluate((k) => ({ raw: window.localStorage.getItem(k), keys: Object.keys(window.localStorage) }), STORAGE_KEY)
    expect(stored.raw).not.toBeNull()
    const file = JSON.parse(stored.raw!)
    expect(file.views).toHaveLength(1)
    expect(file.views[0]).toMatchObject({ name: 'Onay kuyruğu', screenKey: 'OrderListView', params: { internalStatuses: 'APPROVED,AWAITING_APPROVAL', allocationStates: 'OVERSOLD' } })
    expect(Object.keys(file.views[0].params).sort()).toEqual(['allocationStates', 'internalStatuses'])
    expect(stored.raw).not.toContain('Ayşe')
    expect(stored.raw).not.toContain('globalSearch')
    // Anahtarda e-posta/kullanıcı adı yok (yalnız kimlik).
    expect(stored.keys.some((k) => k.includes(userContextFixture.username))).toBe(false)

    // Yenile: sekme oturum kaydı temizlenip filtresiz adres açılır — görünüm yerel depodan gelir.
    await page.evaluate(() => window.sessionStorage.clear())
    await page.goto('/orders')
    await waitForWorkplaceReady(page)
    await expect(page.locator(root).getByText('E2E-100002')).toBeVisible()
    await expect(activeFilters(page, root)).toHaveCount(0)

    bodies.length = 0
    await views(page, root).click()
    await applyButton(page, 'Onay kuyruğu').click()

    await expect(page).toHaveURL(/\/orders\?/)
    const url = new URL(page.url())
    expect(url.pathname).toBe('/orders')
    expect(url.searchParams.get('internalStatuses')).toBe('APPROVED,AWAITING_APPROVAL')
    expect(url.searchParams.get('allocationStates')).toBe('OVERSOLD')
    expect([...url.searchParams.keys()].sort()).toEqual(['allocationStates', 'internalStatuses'])

    await expect(activeFilters(page, root).getByText('Sipariş Onaylandı, Satıcı Onayı Bekliyor')).toBeVisible()
    await expect.poll(() => bodies.length).toBeGreaterThan(0)
    const filter = bodies.at(-1).searchOrderForm.filter
    expect([...filter.internalStatuses].sort()).toEqual(['APPROVED', 'AWAITING_APPROVAL'])
    expect(filter.allocationStates).toEqual(['OVERSOLD'])
    expect(filter.globalSearch).toBe('')
    await expect(views(page, root)).toContainText('Onay kuyruğu')

    // Adres gerçekten kanonik: yeniden yüklenince aynı filtre açılır (ADR-0012 derin bağlantı).
    await page.evaluate(() => window.sessionStorage.clear())
    await page.reload()
    await waitForWorkplaceReady(page)
    await expect(activeFilters(page, root).getByText(/Satıcı Onayı Bekliyor/)).toBeVisible()
  })

  test('iade: kaydet → sil → Geri al; kanal (kayıtsız alan) saklanmaz, uygulanınca temizlenir', async ({ page }) => {
    const bodies: any[] = []
    await installApiMocks(page, recordBodies('ClaimService/getClaims', claimsDoluFixture, bodies))
    await page.goto('/claims?internalStatuses=UNDER_REVIEW')
    await waitForWorkplaceReady(page)
    const root = '.claimListView'
    await expect(activeFilters(page, root)).toBeVisible()

    await saveCurrentAs(page, root, 'İncelemede')
    const raw = await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)
    expect(JSON.parse(raw!).views[0]).toMatchObject({ screenKey: 'ClaimListView', params: { internalStatuses: 'UNDER_REVIEW' } })
    expect(raw).not.toContain('integrationCodes')

    // Sil → Geri al
    await panel(page).getByRole('button', { name: 'İncelemede görünümünü sil' }).click()
    await expect(panel(page).getByText('Henüz kayıtlı görünüm yok')).toBeVisible()
    await page.getByRole('button', { name: 'Geri al' }).click()
    await expect(applyButton(page, 'İncelemede')).toBeVisible()
    await page.keyboard.press('Escape')

    // Filtreyi temizle → görünümü uygula: durum geri gelir, adres kurulur.
    await activeFilters(page, root).getByRole('button', { name: 'Tümünü temizle' }).click()
    await expect(activeFilters(page, root)).toHaveCount(0)
    bodies.length = 0
    await views(page, root).click()
    await applyButton(page, 'İncelemede').click()
    await expect(page).toHaveURL(/\/claims\?internalStatuses=UNDER_REVIEW$/)
    await expect.poll(() => bodies.length).toBeGreaterThan(0)
    expect(bodies.at(-1).searchClaimForm.filter.internalStatuses).toEqual(['UNDER_REVIEW'])
    expect(bodies.at(-1).searchClaimForm.filter.integrationCodes).toEqual([])
  })

  test('filtre yokken kaydetme kapalı; ekran başına 20 görünüm sınırı', async ({ page }) => {
    const seeded = Array.from({ length: 20 }, (_, i) => ({
      id: `seed-${i}`, name: `Görünüm ${i + 1}`, screenKey: 'OrderListView', params: { internalStatuses: 'APPROVED' }, createdAt: '2026-09-30T00:00:00.000Z',
    }))
    await page.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v) } catch { /* yok */ } }, [STORAGE_KEY, JSON.stringify({ v: 1, views: seeded })])
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    const root = '.orderListView'

    await views(page, root).click()
    await expect(panel(page).getByText('20 / 20')).toBeVisible()
    await expect(panel(page).getByLabel('Görünüm adı')).toBeDisabled()
    await expect(panel(page).getByRole('button', { name: 'Kaydet' })).toBeDisabled()
    await page.keyboard.press('Escape')

    await page.goto('/orders?internalStatuses=SHIPPED')
    await waitForWorkplaceReady(page)
    await expect(activeFilters(page, root)).toBeVisible()
    await views(page, root).click()
    await panel(page).getByLabel('Görünüm adı').fill('Yirmi birinci')
    await panel(page).getByRole('button', { name: 'Kaydet' }).click()
    await expect(panel(page).getByText('En fazla 20 görünüm kaydedilebilir; önce birini silin.')).toBeVisible()
  })

  test('yerel depolama kullanılamıyorsa özellik gizlenir, liste çalışır', async ({ page }) => {
    // Görünüm anahtarlarına yazım reddedilir (kota/engelli site verisi). NOT: tüm yerel depolamayı
    // engellemek uygulamanın açılışını durduruyor (i18n `lang` yazımı korumasız — bu işin kapsamı dışı).
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key: string, value: string) {
        if (this === window.localStorage && key.includes('ek.views')) throw new DOMException('kota', 'QuotaExceededError')
        return original.call(this, key, value)
      }
    })
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await expect(page.locator('.orderListView').getByText('E2E-100002')).toBeVisible()
    await expect(views(page, '.orderListView')).toHaveCount(0)
  })

  test('erişilebilirlik: görünümler paneli açıkken axe = 0; klavye ile açılır ve uygulanır', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await page.goto('/orders?internalStatuses=APPROVED')
    await waitForWorkplaceReady(page)
    const root = '.orderListView'
    await saveCurrentAs(page, root, 'Onaylananlar')
    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()

    await views(page, root).focus()
    await page.keyboard.press('Enter')
    await expect(panel(page)).toBeVisible()
    // Açılışta odak ilk görünümde.
    await expect(applyButton(page, 'Onaylananlar')).toBeFocused()

    const results = await new AxeBuilder({ page }).include(root).include('.ek-views').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-kayitli-gorunumler.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])

    await page.keyboard.press('Enter')
    await expect(panel(page)).toBeHidden()
    await expect(page).toHaveURL(/\/orders\?internalStatuses=APPROVED$/)
  })

  // İnceleme görselleri: DS_REVIEW_CAPTURE=1 npx playwright test e2e/specs/saved-views.spec.ts -g inceleme --project=chromium-desktop
  test('inceleme görselleri (1440/800/390)', async ({ page }) => {
    test.skip(!process.env.DS_REVIEW_CAPTURE, 'yalnızca DS_REVIEW_CAPTURE=1 ile')
    test.setTimeout(120_000)
    const seeded = [
      { id: 's1', name: 'Onay kuyruğu', screenKey: 'OrderListView', params: { internalStatuses: 'AWAITING_APPROVAL,UNAPPROVED' }, createdAt: '2026-09-30T00:00:00.000Z' },
      { id: 's2', name: 'Stok sorunlu siparişler', screenKey: 'OrderListView', params: { allocationStates: 'OVERSOLD,UNMAPPED' }, createdAt: '2026-09-30T00:00:00.000Z' },
      { id: 's3', name: 'Kargoya hazır', screenKey: 'OrderListView', params: { internalStatuses: 'APPROVED', allocationStates: 'RESERVED' }, createdAt: '2026-09-30T00:00:00.000Z' },
    ]
    await page.addInitScript(([k, v]) => { try { if (!window.localStorage.getItem(k)) window.localStorage.setItem(k, v) } catch { /* yok */ } }, [STORAGE_KEY, JSON.stringify({ v: 1, views: seeded })])
    await installApiMocks(page)
    for (const [w, h] of [[1440, 900], [800, 1024], [390, 844]] as const) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/orders?internalStatuses=APPROVED&allocationStates=RESERVED')
      await waitForWorkplaceReady(page)
      await expect(page.locator('.orderListView').getByText('E2E-100002')).toBeVisible()
      await expect(views(page, '.orderListView')).toContainText('Kargoya hazır')
      await page.waitForTimeout(400)
      await page.screenshot({ path: `docs/design-system-review/c24-orders-active-view-${w}.png` })
      await views(page, '.orderListView').click()
      await expect(panel(page)).toBeVisible()
      await page.waitForTimeout(400)
      await page.screenshot({ path: `docs/design-system-review/c24-orders-views-panel-${w}.png` })
      await page.keyboard.press('Escape')
    }
    // Boş durum + kaydetme formu (iade ekranı, görünüm yok).
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/claims?internalStatuses=UNDER_REVIEW')
    await waitForWorkplaceReady(page)
    await views(page, '.claimListView').click()
    await panel(page).getByLabel('Görünüm adı').fill('İncelemedeki iadeler')
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'docs/design-system-review/c24-claims-empty-save-1440.png' })
  })
})
