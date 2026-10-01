// ADR-0015 B4-P1c — N10 "Denetim günlüğü" (YENİ ekran, Protokol 13 §5.6 / Karar 5.6: spec ekranla aynı commit'te).
// Sözleşme: docs/API_TENANT_SURFACE.md §4 — AuditService/getAuditLogs (admin; owner dahil), ad çözümü UserService/getUsers.
// Sentetik fixture (Protokol 7: PII yok). `B4P1C_REVIEW=1` ile inceleme görsellerini
// frontend/docs/design-system-review/ altına yazar (belge görseli; Playwright tabanı DEĞİLDİR).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { expectProblemState } from '../fixtures/problemState'
import { suppressTourOffer } from '../fixtures/appDialog'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { AXE_TAGS, B4P1C_SCREENS, auditLogsFixture, auditUsersFixture, menuFixtureWithB4P1c, openB4P1cScreen } from '../fixtures/b4p1cScreens'

const ROOT = B4P1C_SCREENS.AuditLogView.root
const OP = 'AuditService/getAuditLogs'
const DAY = 24 * 60 * 60 * 1000

async function mocks(page: any, overrides: Record<string, MockValue> = {}) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithB4P1c(),
    [OP]: auditLogsFixture(),
    'UserService/getUsers': auditUsersFixture,
    ...overrides,
  })
}

function recorder(bodies: any[], response: (body: any) => unknown = () => auditLogsFixture()) {
  return async (route: any, headers: Record<string, string>) => {
    const body = route.request().postDataJSON()
    bodies.push(body)
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(response(body)) })
  }
}

/** Dar görünümde (<768px) filtre paneli kapalı başlar — etkileşimden önce açılır. */
async function openFilters(page: any) {
  const toggle = page.locator(ROOT).getByRole('button', { name: /^Filtreler/ })
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
}

const grid = (page: any) => page.locator(ROOT).getByRole('table', { name: 'Denetim kayıtları tablosu' })

test.describe('ADR-0015 B4-P1c — N10 Denetim günlüğü', () => {
  // Sağ alttaki (mobilde tam genişlik) tur teklifi kartı sayfalama/çip/çekmece öğelerini örter → kullanıcı gibi önce kapatılmış sayılır.
  test.beforeEach(async ({ page }) => { await suppressTourOffer(page) })

  test('smoke: varsayılan son 30 gün isteği, okunur olay adları, kullanıcı adı çözümü, sonuç çipleri; ip/tid yok', async ({ page }) => {
    const bodies: any[] = []
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await mocks(page, { [OP]: recorder(bodies) })
    await openB4P1cScreen(page, 'AuditLogView')
    const root = page.locator(ROOT)

    await expect(root.getByRole('heading', { level: 1, name: 'Denetim günlüğü' })).toBeVisible()
    await expect(grid(page).locator('tbody tr')).toHaveCount(8)
    expect(bodies[0]).toMatchObject({ page: 1, limit: 25 })
    expect(Object.keys(bodies[0]).sort()).toEqual(['from', 'limit', 'page', 'to'])
    const span = Date.parse(bodies[0].to) - Date.parse(bodies[0].from)
    expect(span).toBeGreaterThan(30 * DAY)
    expect(span).toBeLessThan(31 * DAY)

    const first = grid(page).locator('tbody tr').first()
    await expect(first).toContainText('Kanal stok politikası değiştirildi')
    await expect(first).toContainText('Deniz Yılmaz')
    await expect(first).toContainText('Başarılı')
    await expect(first).toContainText('Entegrasyon: trendyol')
    await expect(grid(page)).toContainText('Parola değiştirildi')
    await expect(grid(page)).toContainText('Başarısız')
    await expect(grid(page)).toContainText('Sistem') // userId null
    await expect(grid(page)).toContainText('Bilinmeyen kullanıcı') // listede olmayan kimlik
    await expect(grid(page)).toContainText('future.unknown_event') // bilinmeyen olay → ham ad
    await expect(root).not.toContainText('tid')
    await expect(root.getByRole('navigation', { name: 'Denetim kayıtları sayfalama' })).toContainText('8 kayıt')
    await expect(page).toHaveURL(/\/settings\/audit-log$/)
    expect(errors).toEqual([])
  })

  test('boş durum: kayıt yoksa açıklayıcı boş durum (filtreli/filtresiz ayrı)', async ({ page }) => {
    await mocks(page, { [OP]: auditLogsFixture({ logs: [], totalNumberOfRecords: 0, totalNumberOfPages: 1 }) })
    await openB4P1cScreen(page, 'AuditLogView')
    const root = page.locator(ROOT)
    await expect(root.getByText('Bu aralıkta kayıt yok')).toBeVisible()
    await openFilters(page)

    await root.locator('.ek-audit-view__result .v-field').click()
    await page.getByRole('option', { name: 'Hata' }).click()
    await root.getByRole('button', { name: 'Sorgula' }).click()
    await expect(root.getByText('Bu filtrelerle kayıt yok')).toBeVisible()
    await expect(root.getByRole('button', { name: 'Filtreleri temizle' })).toBeVisible()
  })

  test('hata durumu: 500 → insan-okunur hata + Tekrar dene; 403 → yetki mesajı (ham hata yok)', async ({ page }) => {
    let calls = 0
    await mocks(page, {
      [OP]: async (route: any, headers: Record<string, string>) => {
        calls += 1
        return calls === 1
          ? route.fulfill({ status: 500, contentType: 'application/json', headers, body: JSON.stringify({ error: 'MongoServerError: maxTimeMS' }) })
          : route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(auditLogsFixture()) })
      },
    })
    await openB4P1cScreen(page, 'AuditLogView')
    const root = page.locator(ROOT)
    await expectProblemState(root, 'Denetim kayıtları yüklenemedi — bağlantınızı kontrol edip tekrar deneyin.')
    await expect(root).not.toContainText('Mongo')
    await root.getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(grid(page).locator('tbody tr')).toHaveCount(8)

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mocks(page, { [OP]: mockError(403, { error: 'Forbidden' }) })
    await openB4P1cScreen(page, 'AuditLogView')
    await expect(page.locator(ROOT).getByText('Bu ekran için yetkiniz yok')).toBeVisible()
    await expect(page.locator(ROOT)).not.toContainText('Forbidden')
  })

  test('etkileşim: filtre gövdesi (tarih, olay grubu, kullanıcı, sonuç) + aktif çipler + çip kaldırma', async ({ page }) => {
    const bodies: any[] = []
    await mocks(page, { [OP]: recorder(bodies) })
    await openB4P1cScreen(page, 'AuditLogView')
    const root = page.locator(ROOT)
    await expect(grid(page).locator('tbody tr')).toHaveCount(8)
    await openFilters(page)

    await root.getByLabel('Başlangıç tarihi').fill('01.09.2026')
    await root.getByLabel('Bitiş tarihi').fill('15.09.2026')
    await root.locator('.ek-audit-view__event input').fill('Kullanıcı yön')
    await page.locator('.v-overlay--active .v-list-item').filter({ hasText: 'Kullanıcı yönetimi (tümü)' }).click()
    await root.locator('.ek-audit-view__user input').fill('Ece')
    await page.getByRole('option', { name: 'Ece Kaya' }).click()
    await root.locator('.ek-audit-view__result .v-field').click()
    await page.getByRole('option', { name: 'Başarısız' }).click()
    await root.getByRole('button', { name: 'Sorgula' }).click()

    await expect.poll(() => bodies.length).toBe(2)
    const body = bodies[1]
    expect(body).toMatchObject({ page: 1, limit: 25, eventPrefix: 'user.', userId: 'u-e2e-staff', result: 'fail' })
    expect(body.event).toBeUndefined()
    const from = new Date(body.from)
    const to = new Date(body.to)
    expect([from.getDate(), from.getMonth() + 1, from.getHours()]).toEqual([1, 9, 0])
    expect([to.getDate(), to.getMonth() + 1, to.getHours()]).toEqual([15, 9, 23])

    const chips = root.getByRole('group', { name: 'Aktif filtreler' })
    await expect(chips).toContainText('01.09.2026 – 15.09.2026')
    await expect(chips).toContainText('Kullanıcı yönetimi')
    await expect(chips).toContainText('Ece Kaya')
    await expect(chips).toContainText('Başarısız')

    // Dar ekranda çipler "+N filtre daha göster" altında toplanır (ilk çip dışında) — önce açılır.
    const moreChips = chips.getByRole('button', { name: /filtre daha göster/ })
    if (await moreChips.count()) await moreChips.click()
    await chips.getByRole('button', { name: 'Kullanıcı filtresini kaldır' }).click()
    await expect.poll(() => bodies.length).toBe(3)
    expect(bodies[2].userId).toBeUndefined()
    expect(bodies[2]).toMatchObject({ eventPrefix: 'user.', result: 'fail' })

    await chips.getByRole('button', { name: 'Tümünü temizle' }).click()
    await expect.poll(() => bodies.length).toBe(4)
    expect(Object.keys(bodies[3]).sort()).toEqual(['from', 'limit', 'page', 'to'])
    await expect(chips).toHaveCount(0)
  })

  test('400 istemcide önlenir: geçersiz tarih / ters sıra / 366 günü aşan aralık gönderilmez', async ({ page }) => {
    const bodies: any[] = []
    await mocks(page, { [OP]: recorder(bodies) })
    await openB4P1cScreen(page, 'AuditLogView')
    const root = page.locator(ROOT)
    await expect.poll(() => bodies.length).toBe(1)
    await openFilters(page)

    await root.getByLabel('Başlangıç tarihi').fill('31.02.2026')
    await root.getByRole('button', { name: 'Sorgula' }).click()
    await expect(root.getByText('GG.AA.YYYY biçiminde geçerli bir tarih girin.')).toBeVisible()

    await root.getByLabel('Başlangıç tarihi').fill('20.09.2026')
    await root.getByLabel('Bitiş tarihi').fill('10.09.2026')
    await root.getByRole('button', { name: 'Sorgula' }).click()
    await expect(root.getByText('Bitiş tarihi başlangıçtan önce olamaz.')).toBeVisible()

    await root.getByLabel('Başlangıç tarihi').fill('01.01.2025')
    await root.getByLabel('Bitiş tarihi').fill('29.09.2026')
    await root.getByRole('button', { name: 'Sorgula' }).click()
    await expect(root.getByText('Tarih aralığı en fazla 366 gün olabilir.')).toBeVisible()
    await expect(root.getByRole('alert').filter({ hasText: 'Filtrelerde düzeltilmesi gereken alanlar var' })).toBeVisible()
    await page.waitForTimeout(300)
    expect(bodies.length).toBe(1)
  })

  test('etkileşim: sayfalama (sayfa + limit ≤100) ve hazır aralık', async ({ page }) => {
    const bodies: any[] = []
    await mocks(page, { [OP]: recorder(bodies, (b) => auditLogsFixture({ page: b.page, limit: b.limit, totalNumberOfRecords: 240, totalNumberOfPages: Math.ceil(240 / b.limit) })) })
    await openB4P1cScreen(page, 'AuditLogView')
    const pager = page.locator(ROOT).getByRole('navigation', { name: 'Denetim kayıtları sayfalama' })
    await expect(pager).toContainText('240 kayıt')

    await pager.getByRole('button', { name: 'Sayfa 2' }).click()
    await expect.poll(() => bodies.at(-1)?.page).toBe(2)

    await pager.getByRole('combobox', { name: 'Sayfa başına kayıt' }).selectOption('100')
    await expect.poll(() => bodies.at(-1)?.limit).toBe(100)
    expect(bodies.at(-1).page).toBe(1)
    expect(bodies.every((b) => b.limit <= 100)).toBe(true)

    await openFilters(page)
    await page.locator(ROOT).getByRole('button', { name: 'Son 7 gün' }).click()
    await expect.poll(() => bodies.length).toBeGreaterThan(3)
    const last = bodies.at(-1)
    const span = Date.parse(last.to) - Date.parse(last.from)
    expect(span).toBeGreaterThan(7 * DAY)
    expect(span).toBeLessThan(8 * DAY)
  })

  test('etkileşim: satır → detay yan sayfası (meta yalnız ilkel alanlar, okunur etiketler)', async ({ page }) => {
    await mocks(page)
    await openB4P1cScreen(page, 'AuditLogView')
    await grid(page).getByRole('button', { name: 'Kullanıcı rolü değiştirildi kaydının ayrıntılarını aç' }).click()
    // Tur teklifi de role=dialog olduğundan yan sayfa kayıt adıyla daraltılır.
    const sheet = page.getByRole('dialog').filter({ hasText: 'user.role_change' })
    await expect(sheet).toContainText('Kullanıcı rolü değiştirildi')
    await expect(sheet).toContainText('user.role_change')
    await expect(sheet).toContainText('Deniz Yılmaz')
    await expect(sheet).toContainText('Rol')
    await expect(sheet).toContainText('STAFF')
    await expect(sheet).not.toContainText('ip')
    await sheet.getByRole('button', { name: 'Kapat' }).click()
    await expect(sheet).toHaveCount(0)

    await grid(page).locator('tbody tr').filter({ hasText: 'Oturum açıldı' }).click()
    await expect(page.getByRole('dialog').filter({ hasText: 'Bu kayıt için ek ayrıntı yok.' })).toBeVisible()
  })

  test('rol (olumsuz): ekran menüde yoksa menüde görünmez ve derin bağlantı panoya döner', async ({ page }) => {
    let called = false
    await installApiMocks(page, {
      MenuService: menuFixtureWithB4P1c(['IntegrationHealthView']),
      [OP]: async (route: any, headers: Record<string, string>) => {
        called = true
        return route.fulfill({ status: 403, contentType: 'application/json', headers, body: '{"error":"Forbidden"}' })
      },
    })
    await page.goto(`/${B4P1C_SCREENS.AuditLogView.slug}`)
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 })
    await expect(page.locator(ROOT)).toHaveCount(0)
    await expect(page.locator('.mdi-clipboard-text-clock-outline')).toHaveCount(0)
    expect(called).toBe(false)
  })

  test('ekran görüntüsü tabanı (denetim günlüğü)', async ({ page }) => {
    await mocks(page)
    await openB4P1cScreen(page, 'AuditLogView')
    await expect(grid(page).locator('tbody tr')).toHaveCount(8)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('audit-log.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA — 0 ihlal (liste, doğrulama hatası, detay yan sayfası)', async ({ page }) => {
    await mocks(page)
    await openB4P1cScreen(page, 'AuditLogView')
    await expect(grid(page).locator('tbody tr')).toHaveCount(8)
    const list = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(list.violations, JSON.stringify(list.violations, null, 2)).toEqual([])

    await openFilters(page)
    await page.locator(ROOT).getByLabel('Başlangıç tarihi').fill('99.99.2026')
    await page.locator(ROOT).getByRole('button', { name: 'Sorgula' }).click()
    await expect(page.locator(ROOT).getByText('GG.AA.YYYY biçiminde geçerli bir tarih girin.')).toBeVisible()
    const invalid = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(invalid.violations, JSON.stringify(invalid.violations, null, 2)).toEqual([])

    // Açık filtre paneli + hata uyarısı 1280x800'de tablo alanını 0 yüksekliğe sıkıştırır (satır sayfalamanın altında kalır);
    // kullanıcı gibi paneli kapatıp satıra geçilir.
    await page.locator(ROOT).getByRole('button', { name: /^Filtreler/ }).click()
    await grid(page).getByRole('button', { name: 'Oturum açıldı kaydının ayrıntılarını aç' }).click()
    await expect(page.getByRole('dialog').filter({ hasText: 'Oturum açıldı' })).toBeVisible()
    await page.waitForTimeout(500) // açılış geçişi (fade) bitsin — yarı saydam kare kontrastı yanlış ölçer
    const sheet = await new AxeBuilder({ page }).include('.ek-detail-sheet').withTags(AXE_TAGS).analyze()
    expect(sheet.violations, JSON.stringify(sheet.violations, null, 2)).toEqual([])
  })
})

test.describe('inceleme görselleri (N10)', () => {
  test.skip(!process.env.B4P1C_REVIEW, 'yalnızca B4P1C_REVIEW=1 ile')
  test('1440 ve 390 genişlikte', async ({ page }) => {
    test.setTimeout(90_000)
    const dir = 'docs/design-system-review'
    const vw = Number(process.env.B4P1C_REVIEW_WIDTH ?? 1440)
    await page.setViewportSize({ width: vw, height: vw >= 1440 ? 900 : 844 })
    await mocks(page, {
      [OP]: auditLogsFixture({ totalNumberOfRecords: 57, totalNumberOfPages: 3 }),
    })
    await openB4P1cScreen(page, 'AuditLogView')
    await expect(grid(page).locator('tbody tr')).toHaveCount(8)
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${dir}/b4p1c-denetim-${vw}-ilk-ekran.png` })
    // Filtre uygulanmış (aktif çipler) görünüm
    await openFilters(page)
    await page.locator(ROOT).locator('.ek-audit-view__result .v-field').click()
    await page.getByRole('option', { name: 'Başarılı' }).click()
    await page.locator(ROOT).getByRole('button', { name: 'Sorgula' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${dir}/b4p1c-denetim-${vw}-filtreli.png` })
    await grid(page).getByRole('button', { name: 'Kullanıcı rolü değiştirildi kaydının ayrıntılarını aç' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${dir}/b4p1c-denetim-${vw}-detay.png` })
  })
})
