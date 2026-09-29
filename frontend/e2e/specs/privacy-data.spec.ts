// ADR-0015 B4-P0 — N4 "Veri ve gizlilik (KVKK)" (YENİ ekran, Karar 5.6: spec ekranla aynı commit'te).
// Sözleşme: docs/API_TENANT_SURFACE.md §5 — `TenantDataService/exportTenantData` (owner) + `GET
// tenant-data/export/download?token=` (owner, tek kullanımlık). Sentetik fixture (Protokol 7: PII yok).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { userContextFixture } from '../fixtures/apiData'
import { AXE_TAGS, B4_SCREENS, menuFixtureWithB4, openB4Screen } from '../fixtures/b4Screens'

const ROOT = B4_SCREENS.PrivacyDataView.root
const TOKEN = 'e2e-sentetik-indirme-belirteci'
const EXPORT_OK = { success: true, jobId: 'export_7_1790000000000', key: 'exports/7/export_7_1790000000000.zip', downloadToken: TOKEN, expiresAt: '2026-09-30T10:15:00.000Z' }

async function mocks(page: any, overrides: Record<string, MockValue> = {}) {
  await installApiMocks(page, { MenuService: menuFixtureWithB4(), ...overrides })
}

function zipRoute(counter: { calls: number; tokens: string[] }, secondStatus = 410): MockValue {
  return async (route: any, headers: Record<string, string>) => {
    counter.calls += 1
    counter.tokens.push(new URL(route.request().url()).searchParams.get('token') ?? '')
    if (counter.calls > 1) {
      return route.fulfill({ status: secondStatus, contentType: 'application/json', headers, body: JSON.stringify({ error: 'gone' }) })
    }
    // Gerçek backend CORS'ta yalnızca X-Request-Id'yi açar → Content-Disposition okunamaz, FE güvenli yedek ada düşer.
    return route.fulfill({
      status: 200,
      contentType: 'application/zip',
      headers: { ...headers, 'Content-Disposition': 'attachment; filename="entegrasyonik-veri-disa-aktarma-7-20260929.zip"', 'Cache-Control': 'no-store' },
      body: Buffer.from('PK\u0005\u0006' + '\u0000'.repeat(18), 'binary'),
    })
  }
}

test.describe('ADR-0015 B4-P0 — N4 Veri ve gizlilik (KVKK)', () => {
  test('smoke: derin bağlantı; dışa aktarma bölümü, kapsam bilgileri ve yasal bağlantılar render olur', async ({ page }) => {
    await mocks(page)
    await openB4Screen(page, 'PrivacyDataView')
    const root = page.locator(ROOT)

    await expect(root.getByRole('heading', { level: 1, name: 'Veri ve gizlilik' })).toBeVisible()
    await expect(root.getByText('Parolalar ve pazaryeri API anahtarları gibi gizli bilgiler arşive eklenmez.')).toBeVisible()
    await expect(root.getByRole('button', { name: 'Dışa aktarma dosyası hazırla' })).toBeVisible()
    const kvkk = root.getByRole('link', { name: /KVKK Aydınlatma Metni/ })
    await expect(kvkk).toHaveAttribute('href', /\/yasal\/kvkk-aydinlatma$/)
    await expect(kvkk).toHaveAttribute('target', '_blank')
    await expect(kvkk).toHaveAttribute('rel', /noopener/)
    await expect(page).toHaveURL(/\/account\/privacy$/)
  })

  test('boş/ilk durum (sahip olmayan kullanıcı): dışa aktarma düğmesi YOK, yalnızca bilgi notu', async ({ page }) => {
    let called = false
    await mocks(page, {
      userContext: { ...userContextFixture, owner: false, roleCode: 'ADMIN' },
      'TenantDataService/exportTenantData': async (route: any, headers: Record<string, string>) => {
        called = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(EXPORT_OK) })
      },
    })
    await openB4Screen(page, 'PrivacyDataView')
    const root = page.locator(ROOT)

    await expect(root.getByText('Veri dışa aktarma yalnızca mağaza sahibi tarafından yapılabilir.', { exact: false })).toBeVisible()
    await expect(root.getByRole('button', { name: 'Dışa aktarma dosyası hazırla' })).toHaveCount(0)
    await expect(root.getByRole('link', { name: /KVKK Aydınlatma Metni/ })).toBeVisible()
    expect(called).toBe(false)
  })

  test('hata durumu: hazırlama 500 → insan-okunur mesaj, ham hata sızmaz; 403 → sahiplik mesajı', async ({ page }) => {
    let calls = 0
    await mocks(page, {
      'TenantDataService/exportTenantData': async (route: any, headers: Record<string, string>) => {
        calls += 1
        const status = calls === 1 ? 500 : 403
        return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify({ error: calls === 1 ? 'R2 PutObject stack' : 'Forbidden' }) })
      },
    })
    await openB4Screen(page, 'PrivacyDataView')
    const root = page.locator(ROOT)
    const prepare = root.getByRole('button', { name: 'Dışa aktarma dosyası hazırla' })

    await prepare.click()
    await expect(root.getByRole('alert')).toHaveText('Dışa aktarma dosyası hazırlanamadı — birkaç dakika sonra tekrar deneyin.')
    await expect(root).not.toContainText('R2')
    await prepare.click()
    await expect(root.getByRole('alert')).toHaveText('Bu işlem yalnızca mağaza sahibi tarafından yapılabilir — mağaza sahibi hesabıyla giriş yapın.')
    await expect(root).not.toContainText('Forbidden')
  })

  test('etkileşim: hazırla → indir (token sorguda, dosya iner) → ikinci kullanım yok; gövde {}', async ({ page }) => {
    let exportBody: any
    const counter = { calls: 0, tokens: [] as string[] }
    await mocks(page, {
      'TenantDataService/exportTenantData': async (route: any, headers: Record<string, string>) => {
        exportBody = route.request().postDataJSON()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(EXPORT_OK) })
      },
      'tenant-data/export/download': zipRoute(counter),
    })
    await openB4Screen(page, 'PrivacyDataView')
    const root = page.locator(ROOT)

    await root.getByRole('button', { name: 'Dışa aktarma dosyası hazırla' }).click()
    await expect(root.getByText('Arşiviniz hazır')).toBeVisible()
    // Son geçerlilik tek biçimlendiriciden (format.ts, tr-TR) gelir.
    await expect(root.getByText(/30\.09\.2026 \d{2}:\d{2} tarihine kadar geçerlidir/)).toBeVisible()
    expect(exportBody).toEqual({})
    // Token URL'ye/adres çubuğuna YAZILMAZ.
    expect(page.url()).not.toContain(TOKEN)

    const downloadPromise = page.waitForEvent('download')
    await root.getByRole('button', { name: 'Arşivi indir' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^entegrasyonik-veri-disa-aktarma(-7-20260929)?\.zip$/)
    await expect(root.getByText('Arşiv indirildi')).toBeVisible()
    expect(counter.tokens).toEqual([TOKEN])
    await expect(root.getByRole('button', { name: 'Arşivi indir' })).toHaveCount(0)
    await expect(root.getByRole('button', { name: 'Yeni dışa aktarma hazırla' })).toBeVisible()
  })

  test('hata: indirme 410 (zaten kullanılmış) → yeniden hazırlama yönlendirmesi', async ({ page }) => {
    await mocks(page, {
      'TenantDataService/exportTenantData': EXPORT_OK,
      'tenant-data/export/download': mockError(410, { error: 'Bu dışa aktarma zaten indirildi.' }),
    })
    await openB4Screen(page, 'PrivacyDataView')
    const root = page.locator(ROOT)

    await root.getByRole('button', { name: 'Dışa aktarma dosyası hazırla' }).click()
    await root.getByRole('button', { name: 'Arşivi indir' }).click()
    await expect(root.getByRole('alert')).toHaveText('Bu arşiv daha önce indirildi veya artık mevcut değil — yeni bir dışa aktarma hazırlayın.')
    await expect(root.getByRole('button', { name: 'Dışa aktarma dosyası hazırla' })).toBeVisible()
  })

  test('menü: ekran kullanıcının menü ağacında YOKSA derin bağlantı panoya döner (olumsuz)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithB4(['AccountSecurityView']) })
    await page.goto(`/${B4_SCREENS.PrivacyDataView.slug}`)
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 })
    await expect(page.locator(ROOT)).toHaveCount(0)
  })

  test('ekran görüntüsü tabanı (veri ve gizlilik — arşiv hazır)', async ({ page }) => {
    await mocks(page, { 'TenantDataService/exportTenantData': EXPORT_OK })
    await openB4Screen(page, 'PrivacyDataView')
    await page.locator(ROOT).getByRole('button', { name: 'Dışa aktarma dosyası hazırla' }).click()
    await expect(page.locator(ROOT).getByText('Arşiviniz hazır')).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('privacy-data.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA — 0 ihlal (ilk durum ve arşiv hazır durumu)', async ({ page }) => {
    await mocks(page, { 'TenantDataService/exportTenantData': EXPORT_OK })
    await openB4Screen(page, 'PrivacyDataView')
    const first = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(first.violations, JSON.stringify(first.violations, null, 2)).toEqual([])

    await page.locator(ROOT).getByRole('button', { name: 'Dışa aktarma dosyası hazırla' }).click()
    await expect(page.locator(ROOT).getByText('Arşiviniz hazır')).toBeVisible()
    const ready = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(ready.violations, JSON.stringify(ready.violations, null, 2)).toEqual([])
  })

  // --- C1.6 — Mağaza silme talebi (`TenantDataService/requestDeletion`, owner) -----------------------------
  // Sözleşme (salt-okunur): tenant-data-service.ts:27 → `{ order, status, deletionScheduledAt }`; hatalar 400/401/404/409.
  // 401 bu uçta YANLIŞ PAROLA'dır (oturum değil): genel "/login" yönlendirmesi tetiklenmemeli.
})

const STORE = 'E2E Test Mağazası'
const DELETION_OK = { order: 7, status: 'DELETION_PENDING', deletionScheduledAt: '2026-10-29T10:15:00.000Z' }

async function openDeletionDialog(page: any) {
  const root = page.locator(ROOT)
  await root.getByRole('button', { name: 'Silme talebi oluştur' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Kimliğinizi doğrulayın' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function fillVerify(dialog: any, password: string, name: string) {
  await dialog.getByLabel('Parola').fill(password)
  await dialog.getByLabel('Mağaza adı').fill(name)
}

test.describe('C1.6 — Mağaza silme talebi (owner)', () => {
  test('smoke: sahip için "Mağazayı sil" bölümü, nötr açıklama ve yasal bağlantı render olur', async ({ page }) => {
    await mocks(page)
    await openB4Screen(page, 'PrivacyDataView')
    const root = page.locator(ROOT)

    await expect(root.getByRole('heading', { level: 2, name: 'Mağazayı sil' })).toBeVisible()
    await expect(root.getByText('Talep sonrası mağaza 30 gün askıda kalır.')).toBeVisible()
    await expect(root.getByText('Bu süre içinde geri alma yalnızca destek ekibi üzerinden yapılabilir.')).toBeVisible()
    const info = root.getByRole('link', { name: /Ayrıntılı bilgi/ })
    await expect(info).toHaveAttribute('href', /\/yasal\/kvkk-aydinlatma$/)
    await expect(info).toHaveAttribute('target', '_blank')
    await expect(root.getByRole('button', { name: 'Silme talebi oluştur' })).toBeVisible()
  })

  test('rol: sahip olmayan (ADMIN) kullanıcıda silme bölümü YOK, istek atılmaz', async ({ page }) => {
    let called = false
    await mocks(page, {
      userContext: { ...userContextFixture, owner: false, roleCode: 'ADMIN' },
      'TenantDataService/requestDeletion': async (route: any, headers: Record<string, string>) => {
        called = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(DELETION_OK) })
      },
    })
    await openB4Screen(page, 'PrivacyDataView')
    const root = page.locator(ROOT)

    await expect(root.getByRole('heading', { level: 1, name: 'Veri ve gizlilik' })).toBeVisible()
    await expect(root.getByRole('heading', { name: 'Mağazayı sil' })).toHaveCount(0)
    await expect(root.getByRole('button', { name: 'Silme talebi oluştur' })).toHaveCount(0)
    expect(called).toBe(false)
  })

  test('etkileşim: ad eşleşmeden "Sil" etkin değil → son onay (odak Vazgeç) → istek gövdesi → askı durumu', async ({ page }) => {
    let body: any
    await mocks(page, {
      'TenantDataService/requestDeletion': async (route: any, headers: Record<string, string>) => {
        body = route.request().postDataJSON()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(DELETION_OK) })
      },
    })
    await openB4Screen(page, 'PrivacyDataView')
    const dialog = await openDeletionDialog(page)
    const next = dialog.getByRole('button', { name: 'Sil', exact: true })

    await expect(dialog.getByText(STORE, { exact: true })).toBeVisible()
    await expect(next).toBeDisabled()
    await fillVerify(dialog, 'e2e-sentetik-parola', 'e2e test mağazası')
    await expect(next).toBeDisabled() // büyük/küçük harf dahil AYNEN
    await dialog.getByLabel('Mağaza adı').fill(STORE)
    await expect(next).toBeEnabled()
    await next.click()

    const confirm = page.getByRole('dialog').filter({ hasText: 'silme talebi oluşturulsun mu?' })
    await expect(confirm.getByRole('heading', { name: `'${STORE}' için silme talebi oluşturulsun mu?` })).toBeVisible()
    await expect(confirm.getByRole('button', { name: 'Vazgeç' })).toBeFocused()
    expect(body).toBeUndefined()
    await confirm.getByRole('button', { name: 'Silme talebi oluştur' }).click()

    const root = page.locator(ROOT)
    await expect(root.getByText('Silme talebi alındı')).toBeVisible()
    await expect(root.getByText(/29\.10\.2026 \d{2}:\d{2} tarihine kadar askıda kalacak/)).toBeVisible()
    expect(body).toEqual({ password: 'e2e-sentetik-parola', confirmTenantName: STORE })
    await expect(root.getByRole('button', { name: 'Silme talebi oluştur' })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('vazgeç: son onayda Vazgeç → istek atılmaz, alanlar temizlenir', async ({ page }) => {
    let called = false
    await mocks(page, {
      'TenantDataService/requestDeletion': async (route: any, headers: Record<string, string>) => {
        called = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(DELETION_OK) })
      },
    })
    await openB4Screen(page, 'PrivacyDataView')
    let dialog = await openDeletionDialog(page)
    await fillVerify(dialog, 'e2e-sentetik-parola', STORE)
    await dialog.getByRole('button', { name: 'Sil', exact: true }).click()
    await page.getByRole('dialog').filter({ hasText: 'silme talebi oluşturulsun mu?' }).getByRole('button', { name: 'Vazgeç' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(called).toBe(false)

    dialog = await openDeletionDialog(page)
    await expect(dialog.getByLabel('Parola')).toHaveValue('')
    await expect(dialog.getByLabel('Mağaza adı')).toHaveValue('')
  })

  test('hata: yanlış parola 401 → alan hatası "Parola doğrulanamadı.", oturum DÜŞMEZ (girişe yönlenmez)', async ({ page }) => {
    let calls = 0
    await mocks(page, {
      'TenantDataService/requestDeletion': async (route: any, headers: Record<string, string>) => {
        calls += 1
        return route.fulfill({ status: 401, contentType: 'application/json', headers, body: JSON.stringify({ error: 'Parola doğrulanamadı.' }) })
      },
    })
    await openB4Screen(page, 'PrivacyDataView')
    const dialog = await openDeletionDialog(page)
    await fillVerify(dialog, 'yanlis-sentetik-parola', STORE)
    await dialog.getByRole('button', { name: 'Sil', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Silme talebi oluştur' }).click()

    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Parola doğrulanamadı.')).toBeVisible()
    await expect(dialog.getByLabel('Parola')).toHaveValue('')
    await expect(dialog.getByLabel('Mağaza adı')).toHaveValue(STORE)
    await page.waitForTimeout(1200) // genel 401 yakalayıcısı dinamik import + push yapar; tetiklenmediğini doğrula
    await expect(page).toHaveURL(/\/account\/privacy$/)
    await expect(page.locator(ROOT)).toBeVisible()
    expect(calls).toBe(1)
  })

  test('hata: 400 mağaza adı → ad alanı hatası; 500 → insan-okunur uyarı, ham hata sızmaz', async ({ page }) => {
    let calls = 0
    await mocks(page, {
      'TenantDataService/requestDeletion': async (route: any, headers: Record<string, string>) => {
        calls += 1
        if (calls === 1) return route.fulfill({ status: 400, contentType: 'application/json', headers, body: JSON.stringify({ error: 'Mağaza adı doğrulanamadı.' }) })
        return route.fulfill({ status: 500, contentType: 'application/json', headers, body: JSON.stringify({ error: 'MongoServerError stack' }) })
      },
    })
    await openB4Screen(page, 'PrivacyDataView')
    const dialog = await openDeletionDialog(page)
    await fillVerify(dialog, 'e2e-sentetik-parola', STORE)
    await dialog.getByRole('button', { name: 'Sil', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Silme talebi oluştur' }).click()
    await expect(dialog.getByText('Mağaza adı doğrulanamadı — adı büyük/küçük harf dahil aynen yazın.')).toBeVisible()

    await dialog.getByRole('button', { name: 'Sil', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Silme talebi oluştur' }).click()
    const root = page.locator(ROOT)
    await expect(root.getByRole('alert')).toHaveText('Silme talebi oluşturulamadı — birkaç dakika sonra tekrar deneyin.')
    await expect(page.locator('body')).not.toContainText('MongoServerError')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('ekran görüntüsü tabanı (silme — doğrulama diyaloğu)', async ({ page }) => {
    await mocks(page)
    await openB4Screen(page, 'PrivacyDataView')
    const dialog = await openDeletionDialog(page)
    await fillVerify(dialog, 'e2e-sentetik-parola', STORE)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('privacy-deletion-verify.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA — 0 ihlal (bölüm, doğrulama diyaloğu, son onay, askı durumu)', async ({ page }) => {
    await mocks(page, { 'TenantDataService/requestDeletion': DELETION_OK })
    await openB4Screen(page, 'PrivacyDataView')
    const section = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(section.violations, JSON.stringify(section.violations, null, 2)).toEqual([])

    const dialog = await openDeletionDialog(page)
    await fillVerify(dialog, 'e2e-sentetik-parola', STORE)
    await page.waitForTimeout(400) // açılış geçişi bitsin (opaklık animasyonu kontrastı yanıltır)
    const verify = await new AxeBuilder({ page }).include('.v-overlay--active .v-overlay__content').withTags(AXE_TAGS).analyze()
    expect(verify.violations, JSON.stringify(verify.violations, null, 2)).toEqual([])

    await dialog.getByRole('button', { name: 'Sil', exact: true }).click()
    await expect(page.getByRole('dialog').filter({ hasText: 'silme talebi oluşturulsun mu?' })).toBeVisible()
    await page.waitForTimeout(400)
    const confirm = await new AxeBuilder({ page }).include('.v-overlay--active .v-overlay__content').withTags(AXE_TAGS).analyze()
    expect(confirm.violations, JSON.stringify(confirm.violations, null, 2)).toEqual([])

    await page.getByRole('dialog').getByRole('button', { name: 'Silme talebi oluştur' }).click()
    await expect(page.locator(ROOT).getByText('Silme talebi alındı')).toBeVisible()
    const done = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(done.violations, JSON.stringify(done.violations, null, 2)).toEqual([])
  })
})
