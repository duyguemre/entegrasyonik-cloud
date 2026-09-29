// ADR-0018 Karar 2 "Konsol" + Karar 4 "Aşama B" — Entegrasyon uyum ekranı (YENİ ekran, ADR-0015 Karar 5.6:
// spec ekranla aynı commit'te). Sözleşme: `IntegrationComplianceService` list/summary/getDetail/transition
// (backend HAZIR, salt okunur). Sentetik fixture (Protokol 7: PII yok), backend/Redis/Mongo YOK.
// Kapsam: smoke + boş + hata + etkileşimler (filtre ve transition istek gövdesi doğrulaması) + 3 viewport
// ekran görüntüsü + axe AA = 0 + rol (platformAdmin olmayan: menüde yok / erişemez).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { userContextFixture } from '../fixtures/apiData'
import { openDrawer, waitForWorkplaceReady } from '../fixtures/nav'
import {
  AXE_TAGS, COMPLIANCE_MENU_ICON, COMPLIANCE_ROOT, COMPLIANCE_SLUG, LIST_FIXTURE, SUMMARY_CLEAN_FIXTURE, SUMMARY_FIXTURE, SUMMARY_NO_PROBE_FIXTURE,
  TRENDYOL_ENUM_DETAIL, TRENDYOL_ENUM_KEY, detailFor, menuFixtureWithCompliance, openComplianceScreen,
} from '../fixtures/complianceConsole'

type Calls = Record<string, any[]>

function json(route: any, headers: Record<string, string>, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
}

/** Uyum RPC'lerini gövde kaydederek karşılar; `overrides` ile tek bir uç değiştirilebilir. */
async function mocks(page: Page, opts: { admin?: boolean; menu?: boolean; overrides?: Record<string, MockValue> } = {}): Promise<Calls> {
  const calls: Calls = { list: [], summary: [], getDetail: [], transition: [] }
  const record = (op: keyof Calls, handler: (body: any) => { status: number; body: unknown }) =>
    async (route: any, headers: Record<string, string>) => {
      const body = route.request().postDataJSON?.() ?? {}
      calls[op].push(body)
      const res = handler(body)
      return json(route, headers, res.status, res.body)
    }
  await installApiMocks(page, {
    MenuService: menuFixtureWithCompliance(opts.menu ?? true),
    userContext: { ...userContextFixture, isGlobalAdmin: opts.admin ?? true },
    'IntegrationComplianceService/list': record('list', () => ({ status: 200, body: LIST_FIXTURE })),
    'IntegrationComplianceService/summary': record('summary', () => ({ status: 200, body: SUMMARY_FIXTURE })),
    'IntegrationComplianceService/getDetail': record('getDetail', (b) => {
      const d = detailFor(b.id)
      return d ? { status: 200, body: d } : { status: 404, body: { error: 'Bulgu bulunamadı.' } }
    }),
    'IntegrationComplianceService/transition': record('transition', (b) => {
      const status = { triage: 'triaged', accept: 'accepted', wontfix: 'wontfix', false_positive: 'false_positive', fixed: 'fixed' }[b.action as string]
      const closed = ['fixed', 'wontfix', 'false_positive'].includes(status as string)
      return {
        status: 200,
        body: {
          ...TRENDYOL_ENUM_DETAIL, status, decidedBy: 'e2e-admin', decidedAt: '2026-09-29T10:00:00.000Z',
          ...(b.reason ? { notes: b.reason } : {}), ...(b.fixRef ? { fixRef: b.fixRef } : {}),
          ...(b.fixedInAdapterVersion ? { fixedInAdapterVersion: b.fixedInAdapterVersion } : {}),
          ...(closed ? { closedAt: '2026-09-29T10:00:00.000Z' } : {}),
        },
      }
    }),
    ...(opts.overrides ?? {}),
  })
  return calls
}

const root = (page: Page) => page.locator(COMPLIANCE_ROOT)

async function openTrendyolEnumDetail(page: Page) {
  await root(page).getByRole('button', { name: 'trendyol.orders.list@v2#content[].status detayını aç' }).click()
  const sheet = page.getByRole('dialog').filter({ hasText: 'Trendyol · Bilinmeyen değer' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('AT_COLLECTION_POINT')).toBeVisible()
  return sheet
}

test.describe('ADR-0018 — Entegrasyon uyum konsolu', () => {
  test('smoke: başlık, özet kartları, tek probe bandı ve şiddete göre sıralı bulgular', async ({ page }) => {
    const calls = await mocks(page)
    await openComplianceScreen(page)
    const view = root(page)

    await expect(view.getByRole('heading', { level: 1, name: 'Entegrasyon uyum' })).toBeVisible()
    await expect(view.getByRole('heading', { level: 2, name: 'Entegrasyon özeti' })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/${COMPLIANCE_SLUG}$`))

    // Özet kartları: 6 entegrasyon; açık bulgu şiddete göre gruplu; bulgusuz olanlar dürüstçe "Açık bulgu yok".
    const cards = view.locator('.compliance-summary__card')
    await expect(cards).toHaveCount(6)
    const trendyolCard = cards.filter({ hasText: 'Trendyol' })
    await expect(trendyolCard.getByText('2.4.0')).toBeVisible()
    await expect(trendyolCard.getByText('Yüksek 1')).toBeVisible()
    await expect(trendyolCard.getByText('Düşük 1')).toBeVisible()
    await expect(cards.filter({ hasText: 'Ideasoft' }).getByText('Açık bulgu yok')).toBeVisible()
    await expect(cards.filter({ hasText: 'N11' }).getByText('Kayıt yok')).toBeVisible()

    // Son probe: TEK platform-düzeyi değer, kart başına tekrarlanmaz + kapsam notu.
    const probe = view.locator('.compliance-summary__probe')
    await expect(probe).toHaveCount(1)
    await expect(probe.getByText('Başarılı')).toBeVisible()
    await expect(probe.getByText('6 probe işlendi · 0 başarısız')).toBeVisible()
    await expect(probe.getByText('tek bir platform turu', { exact: false })).toBeVisible()

    // Tablo: 6 satır, kritik en üstte (backend lastSeenAt sırası şiddet içinde korunur).
    const rows = view.locator('tbody tr')
    await expect(rows).toHaveCount(6)
    await expect(rows.first()).toContainText('/auth/token')
    await expect(rows.first()).toContainText('Kritik')
    await expect(rows.nth(1)).toContainText('trendyol.orders.list@v2#content[].status')

    // İlk yükleme filtresiz: gövde boş.
    expect(calls.list[0]).toEqual({})
    expect(calls.summary.length).toBeGreaterThan(0)
  })

  test('boş durum: "Şu an bilinen bir uyum sorunu yok" + izleme notu; özet yine görünür', async ({ page }) => {
    await mocks(page, { overrides: { 'IntegrationComplianceService/list': [], 'IntegrationComplianceService/summary': SUMMARY_NO_PROBE_FIXTURE } })
    await openComplianceScreen(page)
    const view = root(page)

    await expect(view.getByText('Şu an bilinen bir uyum sorunu yok', { exact: true })).toBeVisible()
    await expect(view.getByText('İzleme aktif', { exact: false })).toBeVisible()
    await expect(view.getByText('izlenmeyen uçlardaki değişiklikleri kapsamaz', { exact: false })).toBeVisible()
    await expect(view.locator('.compliance-summary__card')).toHaveCount(6)
    await expect(view.getByText('Henüz kayıtlı bir probe turu yok.')).toBeVisible()
    await expect(view.locator('tbody tr')).toHaveCount(0)
  })

  test('hata durumu: liste 500 → insan-okunur hata, ham hata sızmaz; tekrar dene yeniden ister', async ({ page }) => {
    let listAttempts = 0
    await mocks(page, {
      overrides: {
        'IntegrationComplianceService/list': async (route: any, headers: Record<string, string>) => {
          listAttempts += 1
          return json(route, headers, 500, { message: 'INTERNAL stack at FindingService' })
        },
      },
    })
    await openComplianceScreen(page)
    const view = root(page)

    await expect(view.getByText('Uyum bulguları yüklenemedi — bağlantınızı kontrol edip tekrar deneyin.')).toBeVisible()
    await expect(view).not.toContainText('500')
    await expect(view).not.toContainText('INTERNAL')
    await expect(view).not.toContainText('FindingService')
    // Özet ayrı uçtan geldiği için yine görünür.
    await expect(view.locator('.compliance-summary__card')).toHaveCount(6)
    const before = listAttempts
    await view.getByRole('button', { name: /Tekrar dene/ }).click()
    await expect.poll(() => listAttempts).toBeGreaterThan(before)
  })

  test('filtreler sunucuya gider: şiddet seçimi ve özet kartı tıklaması list() gövdesine yazılır', async ({ page }) => {
    const calls = await mocks(page)
    await openComplianceScreen(page)
    const view = root(page)
    await expect(view.locator('tbody tr')).toHaveCount(6)

    await view.locator('.v-select').filter({ hasText: 'Şiddet' }).click()
    await page.getByRole('option', { name: 'Kritik' }).click()
    await expect.poll(() => calls.list.at(-1)).toEqual({ severity: 'critical' })

    await view.locator('.compliance-summary__card').filter({ hasText: 'Trendyol' }).click()
    await expect.poll(() => calls.list.at(-1)).toEqual({ severity: 'critical', integrationCode: 'trendyol' })
    await expect(view.locator('.compliance-summary__card').filter({ hasText: 'Trendyol' })).toHaveAttribute('aria-pressed', 'true')
    await expect(view.getByText('Entegrasyon: Trendyol')).toBeVisible()
  })

  test('detay: redakte kanıt, etkilenen tenant SAYISI (kimlik yok), öneri', async ({ page }) => {
    const calls = await mocks(page)
    await openComplianceScreen(page)
    const sheet = await openTrendyolEnumDetail(page)

    expect(calls.getDetail.at(-1)).toEqual({ id: TRENDYOL_ENUM_KEY })
    await expect(sheet.getByText('Kanıt redakte edilmiştir', { exact: false })).toBeVisible()
    await expect(sheet.getByText('content[].status', { exact: true })).toBeVisible()
    await expect(sheet.locator('.compliance-sheet__impact-value')).toHaveText('2')
    // PII yok: sentetik tenant kimlikleri render EDİLMEZ.
    await expect(sheet).not.toContainText('90101')
    await expect(sheet).not.toContainText('90102')
    await expect(sheet.getByText('Sipariş durum eşleyicisine yeni durum kodu eklenmeli', { exact: false })).toBeVisible()
    // Mevcut durum 'new' → tüm 5 eylem sunulur.
    await expect(sheet.getByRole('radio')).toHaveCount(5)
  })

  test('transition "fixed": fixRef zorunlu (FE ön doğrulama, istek YOK) → onay → istek gövdesi doğru', async ({ page }) => {
    const calls = await mocks(page)
    await openComplianceScreen(page)
    const sheet = await openTrendyolEnumDetail(page)

    await sheet.getByRole('radio', { name: /Düzeltildi/ }).check()
    await sheet.getByRole('button', { name: 'Kararı uygula' }).click()
    await expect(sheet.getByText('Düzeltme referansı zorunlu — commit veya PR referansını girin.')).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(calls.transition).toHaveLength(0)

    await sheet.getByLabel('Düzeltme referansı (commit/PR) *').fill('PR-301')
    await sheet.getByLabel('Düzeltildiği adaptör sürümü (isteğe bağlı)').fill('2.4.1')
    await sheet.getByLabel('Gerekçe (isteğe bağlı)').fill('Yeni durum kodu eşleyiciye eklendi.')
    await sheet.getByRole('button', { name: 'Kararı uygula' }).click()

    const confirm = page.getByRole('alertdialog')
    await expect(confirm.getByText('Bulgu “Düzeltildi” olarak işaretlensin mi?')).toBeVisible()
    await expect(confirm.getByText('Bulgu kapanır.', { exact: false })).toBeVisible()
    await confirm.getByRole('button', { name: 'Kararı uygula' }).click()

    await expect.poll(() => calls.transition.length).toBe(1)
    expect(calls.transition[0]).toEqual({
      id: TRENDYOL_ENUM_KEY, action: 'fixed', reason: 'Yeni durum kodu eşleyiciye eklendi.', fixRef: 'PR-301', fixedInAdapterVersion: '2.4.1',
    })
    // Yanıt çekmeceye ve satıra yansır; özet yeniden çekilir.
    await expect(sheet.locator('.ek-detail-sheet__identity').getByText('Düzeltildi')).toBeVisible()
    await expect(sheet.getByText('PR-301')).toBeVisible()
    await expect(root(page).locator('tbody tr').filter({ hasText: 'trendyol.orders.list@v2' })).toContainText('Düzeltildi')
  })

  test('transition "accept": gerekçe opsiyonel — gövde yalnız id + action', async ({ page }) => {
    const calls = await mocks(page)
    await openComplianceScreen(page)
    const sheet = await openTrendyolEnumDetail(page)

    await sheet.getByRole('radio', { name: /Kabul et/ }).check()
    await expect(sheet.getByLabel('Düzeltme referansı (commit/PR) *')).toHaveCount(0)
    await sheet.getByRole('button', { name: 'Kararı uygula' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Kararı uygula' }).click()

    await expect.poll(() => calls.transition.length).toBe(1)
    expect(calls.transition[0]).toEqual({ id: TRENDYOL_ENUM_KEY, action: 'accept' })
  })

  test('transition hatası: sunucu iletisi insan-okunur gösterilir, çekmece açık kalır', async ({ page }) => {
    await mocks(page, { overrides: { 'IntegrationComplianceService/transition': mockError(400, { error: 'Bulgu bulunamadı.' }) } })
    await openComplianceScreen(page)
    const sheet = await openTrendyolEnumDetail(page)

    await sheet.getByRole('radio', { name: /Triyaja al/ }).check()
    await sheet.getByRole('button', { name: 'Kararı uygula' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Kararı uygula' }).click()
    await expect(sheet.getByRole('alert').filter({ hasText: 'Bulgu bulunamadı.' })).toBeVisible()
    await expect(sheet).not.toContainText('400')
  })

  test('rol (olumlu): platformAdmin menüde "Entegrasyon Uyum" girişini görür', async ({ page }) => {
    await mocks(page)
    await page.goto('/')
    await waitForWorkplaceReady(page)
    await openDrawer(page)
    const drawer = page.locator('.v-navigation-drawer.soft-nav')
    const group = drawer.locator('.v-list-group').filter({ has: page.locator('.v-list-group__header .mdi-shield-account-outline') })
    await group.locator('.v-list-group__header').click()
    await expect(group.getByText('Entegrasyon Uyum', { exact: true })).toBeVisible()
  })

  test('rol (olumsuz): platformAdmin OLMAYAN — menüde yok, derin bağlantı açılmaz, uyum RPC çağrılmaz', async ({ page }) => {
    const calls = await mocks(page, { admin: false, menu: false })
    await page.goto(`/${COMPLIANCE_SLUG}`)
    await waitForWorkplaceReady(page)
    await expect(page.locator(`${COMPLIANCE_ROOT}:not(.hide-tab-component)`)).toHaveCount(0)
    await expect(page).not.toHaveURL(new RegExp(`/${COMPLIANCE_SLUG}$`))

    await openDrawer(page)
    const drawer = page.locator('.v-navigation-drawer.soft-nav')
    await expect(drawer.locator(`.${COMPLIANCE_MENU_ICON}`)).toHaveCount(0)
    await expect(drawer.getByText('Entegrasyon Uyum', { exact: true })).toHaveCount(0)
    expect(calls.list.length + calls.summary.length + calls.getDetail.length + calls.transition.length).toBe(0)
  })

  test('rol (savunma derinliği): menü girişi olsa bile platformAdmin olmayana ekran içeriği ve RPC yok', async ({ page }) => {
    const calls = await mocks(page, { admin: false, menu: true })
    await openComplianceScreen(page)
    await expect(root(page).getByText('Bu ekran yalnız platform yöneticileri içindir.', { exact: true })).toBeVisible()
    await expect(root(page).locator('.compliance-summary')).toHaveCount(0)
    expect(calls.list.length + calls.summary.length).toBe(0)
  })

  test('ekran görüntüsü tabanı (liste)', async ({ page }) => {
    await mocks(page)
    await openComplianceScreen(page)
    await expect(root(page).locator('tbody tr')).toHaveCount(6)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('admin-integration-compliance.png', { fullPage: false })
  })

  test('ekran görüntüsü tabanı (boş durum)', async ({ page }) => {
    await mocks(page, { overrides: { 'IntegrationComplianceService/list': [], 'IntegrationComplianceService/summary': SUMMARY_CLEAN_FIXTURE } })
    await openComplianceScreen(page)
    await expect(root(page).getByText('Şu an bilinen bir uyum sorunu yok', { exact: true })).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('admin-integration-compliance-empty.png', { fullPage: false })
  })

  test('ekran görüntüsü tabanı (detay çekmecesi)', async ({ page }) => {
    await mocks(page)
    await openComplianceScreen(page)
    await openTrendyolEnumDetail(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('admin-integration-compliance-detail.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA — liste (özet + tablo)', async ({ page }, testInfo) => {
    await mocks(page)
    await openComplianceScreen(page)
    await expect(root(page).locator('tbody tr')).toHaveCount(6)
    await page.waitForTimeout(600)
    const scoped = await new AxeBuilder({ page }).include(COMPLIANCE_ROOT).withTags(AXE_TAGS).analyze()
    await testInfo.attach('axe-ComplianceView-liste.json', { body: JSON.stringify(scoped.violations, null, 2), contentType: 'application/json' })
    // Bilinen DS düzeyi borç (admin-integration-config-list.spec.ts ile AYNI not): `EkDataTable` (salt-oku,
    // bu görevin DIŞI) `role="table"` div'i içine literal `<table>` yerleştiriyor.
    const knownDsIssues = new Set(['aria-required-children'])
    const own = scoped.violations.filter((v) => !knownDsIssues.has(v.id))
    expect(own, JSON.stringify(own, null, 2)).toEqual([])
  })

  test('axe: WCAG 2.1 AA — boş durum', async ({ page }) => {
    await mocks(page, { overrides: { 'IntegrationComplianceService/list': [] } })
    await openComplianceScreen(page)
    await expect(root(page).getByText('Şu an bilinen bir uyum sorunu yok', { exact: true })).toBeVisible()
    await page.waitForTimeout(600)
    const scoped = await new AxeBuilder({ page }).include(COMPLIANCE_ROOT).withTags(AXE_TAGS).analyze()
    expect(scoped.violations, JSON.stringify(scoped.violations, null, 2)).toEqual([])
  })

  test('axe: WCAG 2.1 AA — detay çekmecesi (karar formu, fixed alanları açık)', async ({ page }) => {
    await mocks(page)
    await openComplianceScreen(page)
    const sheet = await openTrendyolEnumDetail(page)
    await sheet.getByRole('radio', { name: /Düzeltildi/ }).check()
    await page.waitForTimeout(600)
    const scoped = await new AxeBuilder({ page }).include('.ek-detail-sheet').withTags(AXE_TAGS).analyze()
    expect(scoped.violations, JSON.stringify(scoped.violations, null, 2)).toEqual([])
  })
})
