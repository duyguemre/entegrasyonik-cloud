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
})
