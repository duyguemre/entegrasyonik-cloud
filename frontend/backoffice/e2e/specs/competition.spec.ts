// PRC-CFG: Rekabet ayarları (sahte API). Durum → Karar → Eylem → Ayrıntı; plan tablosu taslak/yayın; müşteri istisnaları; durumlar; axe.
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNT, expectNoA11yViolations, settle, signInFully } from '../support/session'

type Mock = { expireReauth(): void; failOps(prefix: string | null): void; seedCompetitionPilot(o?: { tenants?: string[]; budget?: number; daysAgo?: number }): void }
const call = (page: Page, src: string) => page.evaluate(`(${src})(window.__boMock)`)
const REASON = 'Pilot müşteri için kapsam genişletildi'

/** Sahte API her tam yüklemede sıfırlanır: kurgudan sonra uygulama İÇİNDEN (menüden) git. */
async function openFromMenu(page: Page) {
  if (page.viewportSize()!.width < 768) await page.getByRole('button', { name: 'Menüyü aç' }).click()
  const nav = page.getByRole('navigation', { name: 'Yönetim ekranları' })
  const group = nav.getByRole('button', { name: /^Sistem ayarları(\s|$)/ })
  if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click()
  await nav.getByRole('button', { name: /^Rekabet ayarları/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Rekabet ayarları' })).toBeVisible()
  await settle(page)
}

async function reauth(page: Page) {
  const dlg = page.getByRole('dialog', { name: 'Kimliğinizi yeniden doğrulayın' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('Parola').fill(ACCOUNT.password)
  await dlg.getByLabel('Doğrulama kodu').fill('135790')
  await dlg.getByRole('button', { name: 'Doğrula ve devam et' }).click()
}

test.describe('rekabet ayarları', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('açılır: durum, plan tablosu, istisnalar, ayrıntı; h1 + axe 0; genel panelde çift görünmez', async ({ page }) => {
    await page.goto('/sistem/rekabet')
    await expect(page.getByRole('heading', { level: 1, name: 'Rekabet ayarları' })).toBeVisible()
    await settle(page)
    const status = page.getByTestId('competition-status')
    await expect(status.getByTestId('competition-flag-state')).toContainText('Kapalı')
    await expect(status).toContainText('Buybox okuması çalışmıyor')
    await expect(status.getByTestId('competition-override-count')).toHaveText('2')
    await expect(status).toContainText('yerelde doğrulanana kadar özellik kapalı')
    await expect(status.getByTestId('competition-attention')).toContainText('2 tenant istisnası var ama özellik kapalı')

    // BO2-70: Durum üstte sabit; plan / istisna / fiyat kuralı / geçmiş sekmelerde (varsayılan: Planlar).
    await expect(page.getByRole('tab', { name: /Plan varsayılanları/ })).toHaveAttribute('aria-selected', 'true')
    const plans = page.getByTestId('competition-plans')
    await expect(plans.getByRole('row')).toHaveCount(4) // başlık + 3 plan
    await expect(plans.getByTestId('plan-starter-skuCap').locator('input')).toHaveValue('100')
    await expect(plans.getByTestId('plan-starter-refreshMin').locator('input')).toHaveValue('360')
    await expect(plans.locator('[data-plan="starter"]')).toContainText('günde 4')
    await expect(plans.getByTestId('plan-growth-priority')).toContainText('Değişen önce')
    await expect(plans).toContainText('~15 sn')
    await expect(plans).toContainText('Trendyol buybox çağrı bütçesi')

    await page.getByRole('tab', { name: /Müşteri istisnaları/ }).click()
    const ovr = page.getByTestId('competition-overrides')
    await expect(ovr.locator('tbody tr')).toHaveCount(2)
    await expect(ovr.locator('[data-tid="101"]')).toContainText('SKU tavanı: 2.500 SKU')
    await page.getByRole('tab', { name: /Geçmiş ve denetim/ }).click()
    await expect(page.getByTestId('competition-audit-note')).toContainText('subscription.competition_override')
    await expect(page.getByRole('heading', { level: 2, name: 'Yayın geçmişi' })).toBeVisible()
    await expectNoA11yViolations(page)

    // Çift görünmez: genel Platform ayarları ekranında rekabet grubu yok.
    await page.goto('/sistem/bayraklar')
    await settle(page)
    await expect(page.getByText('pricing.buybox')).toHaveCount(0)
  })

  test('pilot açık: dikkat uyarıları (bütçe düşük, gölge mod uzun süredir açık) ve pilot listesi', async ({ page }) => {
    await call(page, '(m) => m.seedCompetitionPilot({ tenants: ["101", "102"], budget: 10, daysAgo: 30 })')
    await openFromMenu(page)
    const status = page.getByTestId('competition-status')
    await expect(status.getByTestId('competition-flag-state')).toContainText('Açık')
    await expect(status).toContainText('Pilot: #101, #102')
    const att = status.getByTestId('competition-attention')
    await expect(att).toContainText('Trendyol bütçesi çok düşük: dakikada 10 istek')
    await expect(att).toContainText('Bildirim gölge modu 30 gündür açık')
    await expect(status.getByRole('link', { name: 'Bayrağı Platform ayarlarında değiştir' })).toHaveAttribute('href', '/sistem/bayraklar?sekme=bayraklar')
    await expectNoA11yViolations(page)
  })

  test('plan tablosu: geçersiz değer alanda ve kaydı engeller; geçerli değer → taslak → fark → gerekçe + step-up → yayın', async ({ page }) => {
    await page.goto('/sistem/rekabet')
    await settle(page)
    await call(page, '(m) => m.expireReauth()')
    const plans = page.getByTestId('competition-plans')
    const save = plans.getByTestId('competition-save')
    await expect(save).toBeDisabled()

    const sku = plans.getByTestId('plan-enterprise-skuCap').locator('input')
    await sku.fill('60000')
    await expect(plans.getByTestId('plans-errors')).toContainText('Kurumsal · SKU tavanı: 0–50.000 arasında olmalı')
    await expect(save).toBeDisabled()
    await sku.fill('8000')
    await expect(plans.getByTestId('plans-errors')).toHaveCount(0)
    await plans.getByTestId('plan-starter-refreshMin').locator('input').fill('720')
    await expect(plans.locator('[data-plan="starter"]')).toContainText('günde 2')
    await expect(plans).toContainText('2 değişiklik bekliyor')
    await save.click()

    const dlg = page.getByRole('dialog', { name: 'Değişiklikler yayınlansın mı?' })
    const table = dlg.getByRole('table')
    await expect(table).toContainText('pricing.buybox.plan.enterprise.skuCap')
    await expect(table).toContainText('pricing.buybox.plan.starter.refreshMin')
    await expect(dlg).toContainText('Etkilenecek aktif müşteri')
    await dlg.getByLabel('Gerekçe').fill(REASON)
    await dlg.getByRole('button', { name: 'Yayınla' }).click()
    await reauth(page)
    await expect(page.getByText(/yayınlandı; değerler/)).toBeVisible()
    await expect(plans.getByTestId('plan-enterprise-skuCap').locator('input')).toHaveValue('8000')
    await expect(plans).toContainText('Değişiklik yok')
    // Ayrıntı: yeni sürüm yayın geçmişinde gerekçesiyle görünür.
    await page.getByRole('tab', { name: /Geçmiş ve denetim/ }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Yayın geçmişi' })).toBeVisible()
    await expect(page.getByText(REASON)).toBeVisible()
  })

  test('istisna ekle: numara → mevcut etkin ayar + plan değeri → alanlar → gerekçe (step-up yok) → önce/sonra', async ({ page }) => {
    await page.goto('/sistem/rekabet')
    await settle(page)
    await call(page, '(m) => m.expireReauth()') // istisna ucu step-up istemez
    await page.getByRole('tab', { name: /Müşteri istisnaları/ }).click()
    await page.getByTestId('override-add').click()
    const dlg = page.getByRole('dialog', { name: 'Müşteri istisnası ekle' })
    await expect(dlg).toBeVisible()
    await expect(dlg.getByRole('button', { name: 'İstisnayı kaydet' })).toBeDisabled()

    await dlg.getByTestId('override-tid').locator('input').fill('99999')
    await dlg.getByTestId('override-lookup').click()
    await expect(dlg.getByTestId('override-lookup-error')).toContainText('Bu numarada abonelik bulunamadı — numarayı müşteri listesinden kontrol edin.')

    await dlg.getByTestId('override-tid').locator('input').fill('103')
    await dlg.getByTestId('override-lookup').click()
    const current = dlg.getByTestId('override-current')
    await expect(current).toContainText('SKU tavanı')
    await expect(current.locator('tbody tr').first()).toContainText('100 SKU') // başlangıç planı
    await expect(dlg).toContainText('Plan: Başlangıç')
    await expect(dlg.getByRole('button', { name: 'İstisnayı kaydet' })).toBeDisabled() // alan boş
    await expect(dlg.getByTestId('override-preview')).toContainText('Henüz bir istisna değeri girilmedi')

    await dlg.getByTestId('override-refreshMin').locator('input').fill('5')
    await expect(dlg).toContainText('Tazeleme aralığı: 15–1.440 arasında olmalı')
    await expect(dlg.getByRole('button', { name: 'İstisnayı kaydet' })).toBeDisabled()
    await dlg.getByTestId('override-refreshMin').locator('input').fill('60')
    await dlg.getByTestId('override-skuCap').locator('input').fill('300')
    await dlg.getByTestId('override-note').locator('input').fill('Deneme müşterisi: kapsam genişletildi')
    await expect(dlg.getByTestId('override-preview')).toContainText('300 SKU · 60 dk · 30 dk · Değişen önce')

    await dlg.getByLabel('Gerekçe').fill('kısa')
    await expect(dlg.getByRole('button', { name: 'İstisnayı kaydet' })).toBeDisabled()
    await dlg.getByLabel('Gerekçe').fill(REASON)
    await dlg.getByRole('button', { name: 'İstisnayı kaydet' }).click()
    await expect(page.getByRole('dialog', { name: 'Kimliğinizi yeniden doğrulayın' })).toHaveCount(0)
    await expect(dlg).toBeHidden()

    const result = page.getByTestId('override-result')
    await expect(result).toContainText('istisna kaydedildi')
    await expect(result).toContainText('SKU tavanı')
    await expect(result.getByRole('row', { name: /SKU tavanı/ })).toContainText('plan değeri')
    await expect(result.getByRole('row', { name: /SKU tavanı/ })).toContainText('300 SKU')
    const row = page.getByTestId('competition-overrides').locator('[data-tid="103"]')
    await expect(row).toContainText('Tazeleme aralığı: 60 dk')
    await expect(row).toContainText('Deneme müşterisi')
    await expect(page.getByTestId('competition-status').getByTestId('competition-override-count')).toHaveText('3')
    await expectNoA11yViolations(page)
  })

  test('istisnayı düzenle ve kaldır: satırdan açılır, mevcut değerler dolu; kaldırınca plan değerine döner', async ({ page }) => {
    await page.goto('/sistem/rekabet?sekme=istisnalar')
    await settle(page)
    await page.getByTestId('competition-overrides').locator('[data-tid="101"]').getByTestId('override-edit').click()
    const dlg = page.getByRole('dialog', { name: 'Müşteri istisnasını düzenle' })
    await expect(dlg.getByTestId('override-skuCap').locator('input')).toHaveValue('2500')
    await expect(dlg.getByTestId('override-current')).toContainText('İstisna')
    await expect(dlg.getByTestId('override-note').locator('input')).toHaveValue(/katalog büyük/)
    await dlg.getByTestId('override-clear').click()
    await expect(dlg.getByTestId('override-preview')).toContainText('istisna kaldırılır')
    await dlg.getByLabel('Gerekçe').fill(REASON)
    await dlg.getByRole('button', { name: 'İstisnayı kaldır' }).last().click()
    await expect(dlg).toBeHidden()
    await expect(page.getByTestId('override-result')).toContainText('istisna kaldırıldı, plan değerleri geçerli')
    await expect(page.getByTestId('competition-overrides').locator('[data-tid="101"]')).toHaveCount(0)
    await expect(page.getByTestId('competition-status').getByTestId('competition-override-count')).toHaveText('1')
  })

  test('abonelik detayından bağlantı: diyalog o müşteriyle ve mevcut ayarıyla açılır', async ({ page }) => {
    await page.goto('/abonelikler/103')
    await settle(page)
    await page.getByTestId('competition-link').click()
    await expect(page).toHaveURL(/\/sistem\/rekabet\?sekme=istisnalar$/) // tid sorgusu tüketildi; sonuç şeridi istisnalar sekmesinde
    const dlg = page.getByRole('dialog', { name: 'Müşteri istisnası ekle' })
    await expect(dlg.getByTestId('override-tid').locator('input')).toHaveValue('103')
    await expect(dlg.getByTestId('override-current')).toBeVisible()
    await expect(dlg).toContainText('Plan: Başlangıç')
    await page.keyboard.press('Escape')
    await expect(dlg).toBeHidden()
  })

  test('hata: istisna listesi okunamıyor → bölüm içinde anlaşılır hata + Tekrar dene; plan tablosu çalışır', async ({ page }) => {
    await page.goto('/genel-bakis')
    await settle(page)
    await call(page, `(m) => m.failOps('BackofficeBillingService/getCompetitionSettings')`)
    await openFromMenu(page)
    await page.getByRole('tab', { name: /Müşteri istisnaları/ }).click()
    const ovr = page.getByTestId('competition-overrides')
    await expect(ovr).toContainText('Müşteri istisnaları yüklenemedi')
    await expect(ovr.getByRole('button', { name: 'İstisna ekle' })).toBeDisabled()
    await page.getByRole('tab', { name: /Plan varsayılanları/ }).click()
    await expect(page.getByTestId('competition-plans').getByTestId('plan-starter-skuCap')).toBeVisible()
    await page.getByRole('tab', { name: /Müşteri istisnaları/ }).click()
    await expect(ovr).not.toContainText('INTERNAL')
    await call(page, `(m) => m.failOps(null)`)
    await ovr.getByRole('button', { name: /Tekrar dene/ }).click()
    await expect(ovr.locator('tbody tr')).toHaveCount(2)
  })

  test('mobil: sayfa yatay taşmaz (tablolar kendi kaplarında kayar)', async ({ page }, info) => {
    test.skip(!info.project.name.includes('mobile'), 'yalnız mobil proje')
    await page.goto('/sistem/rekabet')
    await settle(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await expect(page.getByTestId('competition-plans').getByRole('region', { name: 'Plan varsayılanları tablosu' })).toBeVisible()
  })
})
