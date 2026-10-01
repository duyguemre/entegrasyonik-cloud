// bo-p2: Motor ve kuyruklar (B7) + müşteri yaşam döngüsü / destek girişi (B2, B3). Sahte /admin-api; görsel taban YOK (Windows'ta).
import { expect, test, type Page } from '@playwright/test'
import { expectNoA11yViolations, settle, signInFully } from '../support/session'

type Mock = { expireReauth(): void; setDegraded(v: boolean): void; setLiveReadonly(v: boolean): void }
const mock = (page: Page, fn: (m: Mock) => void) => page.evaluate(`(${fn.toString()})(window.__boMock)`)
const REASON = 'Destek kaydı #örnek: e2e gerekçesi'

async function stepUp(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Kimliğinizi yeniden doğrulayın' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Parola').fill('ornek-parola')
  await dialog.getByLabel('Doğrulama kodu').fill('222222')
  await dialog.getByRole('button', { name: 'Doğrula ve devam et' }).click()
}

test.describe('motor ve kuyruklar', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('menüden açılır; dört sekme; axe 0', async ({ page }, info) => {
    if (info.project.name === 'chromium-mobile') await page.getByRole('button', { name: 'Menüyü aç' }).click()
    await page.getByRole('navigation', { name: 'Yönetim ekranları' }).getByRole('button', { name: 'Motor ve kuyruklar' }).click()
    await expect(page).toHaveURL(/\/motor$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Motor ve kuyruklar' })).toBeVisible()
    await settle(page)
    await expect(page.getByRole('heading', { level: 2, name: 'order-sync-queue' })).toBeVisible()
    await expectNoA11yViolations(page)
    for (const [tab, heading] of [['Başarısız işler', 'Başarısız işler'], ['Durum makinesi', 'Katalog durum makinesi'], ['Zamanlanmış görevler', 'Zamanlanmış görevler']]) {
      await page.getByRole('tab', { name: new RegExp(tab) }).click()
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()
      await settle(page)
      await expectNoA11yViolations(page)
    }
  })

  test('Redis düşük: kuyruk kartı uyarı, başarısız iş listesi degraded + tekrar dene', async ({ page }) => {
    // Sahte API durumu sayfa yenilemesinde sıfırlanır: kol, SPA içi gezinmeden önce çekilir.
    await page.goto('/motor')
    await settle(page)
    await mock(page, (m) => m.setDegraded(true))
    await page.getByRole('tab', { name: /Başarısız işler/ }).click()
    await expect(page.getByRole('heading', { name: 'Kuyruk şu an kullanılamıyor' })).toBeVisible()
    await mock(page, (m) => m.setDegraded(false))
    await page.getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(page.getByTestId('group-open').first()).toBeVisible()
    await page.getByRole('radio', { name: 'Ayrıntılı' }).click()
    await expect(page.getByTestId('retry').first()).toBeVisible()
    await mock(page, (m) => m.setDegraded(true))
    await page.getByRole('tab', { name: 'Kuyruklar' }).click()
    await expect(page.getByText('Sayaçlar okunamıyor')).toBeVisible()
    await expect(page.getByText('Redis hazır değil', { exact: true })).toBeVisible()
  })

  test('başarısız işler: özet hata nedenine göre sayar; gruptan süzgeçli ayrıntılı görünüme geçilir; her satırda tür, durum, neden, zaman', async ({ page }) => {
    await page.goto('/motor?sekme=basarisiz')
    await settle(page)
    const summary = page.getByTestId('failed-summary')
    await expect(page.getByRole('radio', { name: 'Özet' })).toHaveAttribute('aria-checked', 'true')
    await expect(summary.getByText('Dış servis geçici olarak kullanılamıyor.')).toBeVisible()
    await expect(summary.getByText('Sipariş çekme').first()).toBeVisible()
    await summary.getByRole('button', { name: /UNAVAILABLE hatalı işlerini/ }).click()
    await expect(page).toHaveURL(/gorunum=ayrinti/)
    await expect(page).toHaveURL(/kod=UNAVAILABLE/)
    await settle(page)
    const first = page.locator('tbody tr').first()
    await expect(first).toContainText('Başarısız')
    await expect(first).toContainText('Dış servis geçici olarak kullanılamıyor.')
    await expect(first).toContainText('UNAVAILABLE')
    await expect(first).toContainText(/\d\/\d/)
    await expect(first).toContainText('Son hata')
    await expect(first).toContainText(/Sipariş|Kargo|İade/)
    await expectNoA11yViolations(page)
  })

  test('yeniden dene: gerekçe ≥10 + step-up → satır listeden çıkar; salt-okumada 423 iletisi', async ({ page }) => {
    await page.goto('/motor?sekme=basarisiz&gorunum=ayrinti')
    await settle(page)
    const firstId = await page.locator('tbody tr').first().locator('code').first().innerText()
    await mock(page, (m) => m.setLiveReadonly(true))
    await page.getByTestId('retry').first().click()
    const dialog = page.getByRole('dialog', { name: 'İş yeniden denensin mi?' })
    const confirm = dialog.getByRole('button', { name: 'Yeniden dene' })
    await dialog.getByLabel('Gerekçe').fill('kısa')
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Gerekçe').fill(REASON)
    await confirm.click()
    await expect(dialog.locator('.v-input__details')).toContainText('Canlı salt-okuma kipinde bu işlem kapalı')
    await mock(page, (m) => {
      m.setLiveReadonly(false)
      m.expireReauth()
    })
    await confirm.click()
    await stepUp(page)
    await expect(page.getByText(`${firstId} yeniden kuyruğa alındı.`)).toBeVisible()
    await expect(page.locator('tbody tr').first().locator('code').first()).not.toHaveText(firstId)
  })

  test('imleçli sayfalama: Daha fazla 25 → 37 → listenin sonu', async ({ page }) => {
    await page.goto('/motor?sekme=basarisiz&gorunum=ayrinti')
    await settle(page)
    await expect(page.getByText('25 kayıt gösteriliyor')).toBeVisible()
    await page.getByTestId('load-more').click()
    await expect(page.getByText('37 kayıt gösteriliyor · listenin sonu')).toBeVisible()
  })

  test('takılı kira serbest bırakma (step-up + gerekçe)', async ({ page }) => {
    await page.goto('/motor?sekme=durum')
    await settle(page)
    await expect(page.getByTestId('release')).toHaveCount(3)
    await page.getByTestId('release').first().click()
    const dialog = page.getByRole('dialog', { name: 'Kira serbest bırakılsın mı?' })
    await dialog.getByLabel('Gerekçe').fill(REASON)
    await dialog.getByRole('button', { name: 'Serbest bırak' }).click()
    await expect(page.getByText(/Kira serbest bırakıldı \(önceki sahip: /)).toBeVisible()
    await expect(page.getByTestId('release')).toHaveCount(2)
  })
})

test.describe('müşteri yaşam döngüsü ve destek girişi', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('yaşam döngüsü sekmesi; silme talebini geri al (step-up) → aktif', async ({ page }) => {
    await page.goto('/musteriler/111')
    await expect(page.getByText('Silme talebi bekliyor')).toBeVisible()
    await page.getByRole('tab', { name: 'Yaşam döngüsü' }).click()
    await expect(page.getByRole('list', { name: 'Kurulum adımları' })).toBeVisible()
    await settle(page)
    await expectNoA11yViolations(page)
    await mock(page, (m) => m.expireReauth())
    await page.getByTestId('cancel-deletion').click()
    const dialog = page.getByRole('dialog', { name: 'Silme talebi geri alınsın mı?' })
    await dialog.getByLabel('Gerekçe').fill(REASON)
    await dialog.getByRole('button', { name: 'Silmeyi geri al' }).click()
    await stepUp(page)
    await expect(page.getByText('Silme talebi geri alındı; mağaza aktif.')).toBeVisible()
    await expect(page.getByText('Silme talebi bekliyor')).toHaveCount(0)
  })

  test('müşterinin gözünden aç: yalnız aktif mağazada; yeni sekme noopener', async ({ page, context }) => {
    await page.goto('/musteriler/108')
    await expect(page.getByTestId('impersonate')).toBeDisabled()
    await expect(page.getByText(/Destek oturumu yalnız aktif mağazada açılabilir/)).toBeVisible()
    // Müşteri uygulaması bu testte yok: yeni sekmenin açılışı yerel yanıtla karşılanır.
    await context.route('http://localhost:3020/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>impersonate</title>' }))
    await page.goto('/musteriler/102')
    await page.getByTestId('impersonate').click()
    const dialog = page.getByRole('dialog', { name: 'Müşterinin gözünden açılsın mı?' })
    await expect(dialog.getByText(/60 saniye/)).toBeVisible()
    await expect(dialog.getByText(/oturum 30 dakika sürer ve uzatılamaz/)).toBeVisible()
    await dialog.getByLabel('Gerekçe').fill(REASON)
    const popup = context.waitForEvent('page')
    await dialog.getByRole('button', { name: 'Gerekçeyle aç' }).click()
    const tab = await popup
    expect(tab.url()).toMatch(/\/impersonate#t=/)
    expect(await tab.evaluate(() => window.opener)).toBeNull()
    await expect(page.getByText(/Destek oturumu 30 dakika sürer/)).toBeVisible()
    // Bilet geri sayımı sunucunun expiresInSeconds değerinden (60 sn) gelir.
    await expect(page.getByTestId('imp-ticket')).toContainText(/0[01]:\d\d içinde kullanılmazsa/)
  })

  test('K41: süren destek oturumu başlıkta yaklaşık kalan süreyle (başlangıç + 30 dk)', async ({ page }) => {
    await page.goto('/musteriler/101')
    await expect(page.getByTestId('imp-session-chip')).toContainText(/Destek oturumu açık · ~1\d:\d\d/)
    await page.goto('/musteriler/102')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('imp-session-chip')).toHaveCount(0)
  })
})
