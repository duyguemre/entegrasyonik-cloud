// P2 — Admin paneli / Sistem Yönetimi (AdminSystemManagementView: platform sağlığı, kuyruklar,
// önbellek, Redis, operasyonel içgörüler + export detay / önbellek diyalogları). ADR-0011 Bağlam:
// "AdminSystemManagementView 41 hex" — literal sayısı en yüksek dosya. platformAdmin-only (ADR-0001).
// Menü kaydı için sentetik 'adminPanel' grubu — bkz. admin-clients.spec.ts / nav.ts `menuFixtureWithAdmin`.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { adminSystemHealthBosFixture, adminSystemHealthDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithAdmin, openScreen } from '../fixtures/nav'

function withAdminMenu(overrides: Record<string, any> = {}) {
  return { MenuService: menuFixtureWithAdmin, ...overrides }
}

// ECharts (canvas) varsayılan giriş animasyonu ~1 sn sürer; ekran görüntüsü/canvas sayımı bunun
// bitiminden SONRA alınır (Playwright `animations: 'disabled'` yalnızca CSS animasyonlarını durdurur).
async function waitForCharts(page: Page, expected: number) {
  await expect(page.locator('.adminSystemManagementView canvas')).toHaveCount(expected, { timeout: 10000 })
  await page.waitForTimeout(1600)
}

async function scrollAreaTo(page: Page, where: 'top' | 'bottom') {
  await page.locator('.adminSystemManagementView .scroll-area').evaluate((el, w) => {
    el.scrollTop = w === 'bottom' ? el.scrollHeight : 0
  }, where)
  await page.waitForTimeout(200)
}

test.describe('P2 — Admin / Sistem Yönetimi (AdminSystemManagementView)', () => {
  test('smoke: başlık, trafik özetleri, kuyruk/önbellek/Redis kartları ve 5 grafik render olur', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')

    await expect(page.locator('.adminSystemManagementView')).toBeVisible()
    await expect(page.getByText('Sistem Durum Özeti')).toBeVisible()
    // Aşama 3: bölüm başlıkları cümle düzeninde (heading rolü).
    await expect(page.getByRole('heading', { name: 'Export operasyonları' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Import operasyonları' })).toBeVisible()
    await expect(page.getByText('TAMAMLANDI').first()).toBeVisible()
    await expect(page.getByText('e2e-pod-a1')).toBeVisible()
    await expect(page.getByText('Kuyruk Analizi')).toBeVisible()
    await expect(page.getByText('Başarılı Erişim (Hit)')).toBeVisible()
    await expect(page.getByText('Redis Veri Sağlığı İzleyici')).toBeVisible()
    // 93784 sn → `formatUptime` = "26h 3m" (gizli biçimlendirme kuralı sabitlenir).
    await expect(page.getByText('26h 3m')).toBeVisible()
    await waitForCharts(page, 5)
  })

  test('boş durum: veri yoksa "Aktif işlemci bulunamadı" ve sıfırlanmış sayaçlar gösterilir', async ({ page }) => {
    await installApiMocks(page, withAdminMenu({ 'AdminService/getSystemHealth': adminSystemHealthBosFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')

    await expect(page.getByText('Aktif işlemci bulunamadı')).toBeVisible()
    // Redis çalışma süresi '0' → `formatUptime` "0m 0s".
    await expect(page.getByText('0m 0s')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('undefined')
  })

  test('hata durumu: 500 alındığında da aynı sıfırlanmış görünüme düşülür, ham hata sızmaz (gizli davranış — bkz. BACKLOG.md)', async ({ page }) => {
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): `restApi.post` HİÇBİR ZAMAN
    // reddetmiyor; `loadData` yalnızca `try/finally` kullanıyor (catch YOK), `res?.success` falsy
    // olunca `healthData` başlangıç sıfırlarında kalıyor — operatör "sistem gerçekten boş" ile
    // "sağlık verisi alınamadı" durumunu AYIRT EDEMİYOR; bu, bir SAĞLIK EKRANI için özellikle
    // riskli (hata = "her şey sıfır" görünür).
    await installApiMocks(page, withAdminMenu({ 'AdminService/getSystemHealth': mockError(500) }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')

    await expect(page.getByText('Aktif işlemci bulunamadı')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: export bilgi düğmesi detay analiz diyaloğunu açar; tablo ↔ grafik görünümü değişir', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')

    await page.locator('button[title="Detaylı Analiz"]').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Export Trafiği Detaylı Analiz' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('E2E Örnek Ticaret A.Ş.')
    await expect(dialog).toContainText('Ürün Gönderimi')
    await expect(dialog).toContainText('Sıradaki:')

    await dialog.locator('button:has(.mdi-chart-box-outline)').click()
    await expect(dialog.getByText('GÜNLÜK İTEM TRAFİĞİ')).toBeVisible()
  })

  test('etkileşim: önbellek kartına tıklayınca önbellek dökümü diyaloğu açılır', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')

    await page.getByText('Toplam Anahtar').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Önbellek Anahtar Dağılımı' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Modül / Prefix')
    await expect(dialog).toContainText('client')
  })

  test('etkileşim: zaman aralığı değişince sağlık verisi yeni aralıkla yeniden istenir', async ({ page }) => {
    const frames: string[] = []
    await installApiMocks(page, withAdminMenu({
      'AdminService/getSystemHealth': async (route: any, headers: Record<string, string>) => {
        frames.push(route.request().postDataJSON()?.timeFrame)
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(adminSystemHealthDoluFixture) })
      },
    }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')
    await expect.poll(() => frames.length).toBeGreaterThan(0)
    expect(frames[0]).toBe('DAY')

    await page.locator('.timeframe-select-inline').click()
    await page.getByRole('option', { name: 'Bu Hafta' }).click()
    await expect.poll(() => frames.includes('WEEK')).toBe(true)
  })

  test('ekran görüntüsü tabanı (sistem yönetimi — üst)', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')
    await waitForCharts(page, 5)
    await scrollAreaTo(page, 'top')
    await expect(page).toHaveScreenshot('admin-system-top.png', { fullPage: false })
  })

  test('ekran görüntüsü tabanı (sistem yönetimi — alt: altyapı/önbellek/Redis)', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')
    await waitForCharts(page, 5)
    await scrollAreaTo(page, 'bottom')
    await expect(page.getByText('Redis Veri Sağlığı İzleyici')).toBeVisible()
    await expect(page).toHaveScreenshot('admin-system-bottom.png', { fullPage: false })
  })

  test('ekran görüntüsü tabanı (export detay analiz diyaloğu)', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')
    await waitForCharts(page, 5)
    await page.locator('button[title="Detaylı Analiz"]').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Export Trafiği Detaylı Analiz' })
    await expect(dialog).toContainText('E2E Örnek Ticaret A.Ş.')
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('admin-system-export-detail.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — sistem yönetimi', async ({ page }, testInfo) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')
    await waitForCharts(page, 5)
    // Geçiş animasyonu (sekme/diyalog opaklık geçişi) bitmeden ölçülürse yarı saydam renkler yanlış kontrast
    // sonucu üretir — ölçüm ÖNCESİ oturmasını bekle.
    await page.waitForTimeout(600)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-AdminSystemManagementView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] AdminSystemManagementView (tüm sayfa, kabuk dahil): ${results.violations.length} WCAG 2.1 AA ihlali — ${results.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
    const scoped = await new AxeBuilder({ page }).include('.adminSystemManagementView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    console.log(`[axe] AdminSystemManagementView (yalnız ekran): ${scoped.violations.length} ihlal — ${scoped.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
  })

  test('axe: WCAG 2.1 AA taraması — export detay analiz diyaloğu', async ({ page }, testInfo) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminSystemManagementView')
    await page.locator('button[title="Detaylı Analiz"]').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Export Trafiği Detaylı Analiz' })
    await expect(dialog).toContainText('E2E Örnek Ticaret A.Ş.')
    // Geçiş animasyonu (sekme/diyalog opaklık geçişi) bitmeden ölçülürse yarı saydam renkler yanlış kontrast
    // sonucu üretir — ölçüm ÖNCESİ oturmasını bekle.
    await page.waitForTimeout(600)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-AdminExportDetail-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] AdminExportDetail (tüm sayfa, kabuk dahil): ${results.violations.length} WCAG 2.1 AA ihlali — ${results.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
    const scoped = await new AxeBuilder({ page }).include('.v-overlay--active .v-overlay__content').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    console.log(`[axe] AdminExportDetail (yalnız diyalog): ${scoped.violations.length} ihlal — ${scoped.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
  })
})
