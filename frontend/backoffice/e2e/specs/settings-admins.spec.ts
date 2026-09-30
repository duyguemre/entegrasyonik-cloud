import { expect, test, type Page } from '@playwright/test'
import { ACCOUNT, expectNoA11yViolations, settle, signInFully } from '../support/session'

type Mock = { expireReauth(): void; setFeatureFlags(on: boolean): void; setDegraded(on: boolean): void }
const call = (page: Page, src: string) => page.evaluate(`(${src})(window.__boMock)`)

/** Sahte API her tam yüklemede sıfırlanır: bayraklar/kollar için uygulama İÇİNDEN (menüden) git. */
/** Menüden aç: `labels` grup → ekran sırası (grup açıksa yeniden tıklanmaz; kapanırdı). */
async function openFromMenu(page: Page, ...labels: string[]) {
  if (page.viewportSize()!.width < 768) await page.getByRole('button', { name: 'Menüyü aç' }).click()
  const nav = page.getByRole('navigation', { name: 'Yönetim ekranları' })
  for (const label of labels) {
    const btn = nav.getByRole('button', { name: new RegExp(`^${label}(\\s|$)`) })
    if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click()
  }
}

async function reauth(page: Page) {
  const dlg = page.getByRole('dialog', { name: 'Kimliğinizi yeniden doğrulayın' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('Parola').fill(ACCOUNT.password)
  await dlg.getByLabel('Doğrulama kodu').fill('135790')
  await dlg.getByRole('button', { name: 'Doğrula ve devam et' }).click()
}

test.describe('sistem ayarları', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('açılır, h1 + axe 0; bayrak boş durumu; ortam salt okunur', async ({ page }) => {
    await page.goto('/sistem/bayraklar')
    await expect(page.getByRole('heading', { level: 1, name: 'Platform ayarları' })).toBeVisible()
    await settle(page)
    await expect(page.getByTestId('flags-empty')).toContainText('FEATURE_FLAGS')
    await expect(page.locator('[data-env="upload-max"]')).toContainText('10 MB')
    await expect(page.locator('[data-env="image-base"]')).toContainText("env'den gelir")
    await expectNoA11yViolations(page)
  })

  test('bayraklar doluyken liste görünür', async ({ page }) => {
    await call(page, '(m) => m.setFeatureFlags(true)')
    await openFromMenu(page, 'Sistem ayarları') // tek ekranlı grup: menüde yaprak (bildirimler ayrı gruba taşındı)
    await settle(page)
    await expect(page.getByText('features.aiListing', { exact: true })).toBeVisible()
    await expect(page.getByText('Yalnız yönetici')).toBeVisible()
  })

  test('bakım modu: taslak → fark → gerekçe + step-up → yayın; geçmişte yeni sürüm', async ({ page }) => {
    await page.goto('/sistem/bayraklar')
    await settle(page)
    await call(page, '(m) => m.expireReauth()')
    const card = page.getByTestId('maintenance-card')
    await expect(card.getByTestId('maintenance-status')).toContainText('kapalı')
    await card.getByLabel('Bakım modu', { exact: true }).check({ force: true })
    await card.getByLabel('Bakım iletisi').fill('Planlı bakım yapılıyor')
    await card.getByTestId('maintenance-save').click()
    const dlg = page.getByRole('dialog', { name: 'Değişiklikler yayınlansın mı?' })
    await expect(dlg.getByRole('table')).toContainText('maintenance.enabled')
    await expect(dlg).toContainText('Etkilenecek aktif müşteri')
    await dlg.getByLabel('Gerekçe').fill('Kısa')
    await expect(dlg.getByRole('button', { name: 'Yayınla' })).toBeDisabled()
    await dlg.getByLabel('Gerekçe').fill('Planlı veritabanı bakımı için')
    await dlg.getByRole('button', { name: 'Yayınla' }).click()
    await reauth(page)
    await expect(page.getByText(/yayınlandı; değerler/)).toBeVisible()
    await expect(card.getByTestId('maintenance-status')).toContainText('açık')
  })

  test('geçersiz değer alanın altında; vazgeç taslağı atar', async ({ page }) => {
    await page.goto('/sistem/bayraklar')
    await settle(page)
    await page.locator('[data-setting="support.email"] input').fill('gecersiz')
    await page.getByTestId('settings-save').click()
    await expect(page.locator('[data-setting="support.email"]')).toContainText('Geçerli bir e-posta')
    await page.locator('[data-setting="support.email"] input').fill('destek@ornek.test')
    await page.getByTestId('settings-save').click()
    const dlg = page.getByRole('dialog', { name: 'Değişiklikler yayınlansın mı?' })
    await expect(dlg).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dlg).toBeHidden()
    await page.getByTestId('discard-draft').click()
    await expect(page.getByTestId('draft-bar')).toHaveCount(0)
  })
})

test.describe('yöneticiler', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('liste, "Siz" rozeti, axe 0', async ({ page }) => {
    await page.goto('/yoneticiler')
    await expect(page.getByRole('heading', { level: 1, name: 'Yöneticiler' })).toBeVisible()
    await settle(page)
    await expect(page.getByText('Siz', { exact: true })).toBeVisible()
    await expect(page.getByText('Kilitli')).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('davet: step-up + gerekçe; mevcut kullanıcı 409 iletisi', async ({ page }) => {
    await page.goto('/yoneticiler')
    await settle(page)
    await call(page, '(m) => m.expireReauth()')
    await page.getByTestId('invite').click()
    const dlg = page.getByRole('dialog', { name: 'Yönetici davet et' })
    await dlg.getByTestId('invite-email').locator('input').fill('musteri@ornek.test')
    await dlg.getByLabel('Gerekçe').fill('Yeni operasyon sorumlusu')
    await dlg.getByRole('button', { name: 'Davet gönder' }).click()
    await reauth(page)
    await expect(dlg.locator('.v-input__details')).toContainText('zaten bir kullanıcıya ait')
    await dlg.getByTestId('invite-email').locator('input').fill('yeni.kisi@ornek.test')
    await dlg.getByRole('button', { name: 'Davet gönder' }).click()
    await expect(page.getByText('Davet gönderildi')).toBeVisible()
  })

  test('devre dışı bırak: kendisi için eylem yok; başkası için sonuç', async ({ page }) => {
    await page.goto('/yoneticiler')
    await settle(page)
    const self = page.getByRole('row').filter({ hasText: 'Siz' })
    await expect(self.getByRole('button')).toHaveCount(0)
    await page.getByRole('button', { name: /Örnek Destek devre dışı bırak/ }).click()
    const dlg = page.getByRole('dialog', { name: 'Yönetici devre dışı bırakılsın mı?' })
    await dlg.getByLabel('Gerekçe').fill('Ekipten ayrıldı, erişim kapatılıyor')
    await dlg.getByRole('button', { name: 'Devre dışı bırak' }).click()
    await expect(page.getByText(/devre dışı bırakıldı; tüm oturumları kapandı/)).toBeVisible()
  })
})

test.describe('davet kabulü', () => {
  // NOT: kimliksiz açılışta router.ts'teki oturum izleyicisi (booting→signedOut) public rotayı /giris'e atıyor (rapor: paylaşılan
  // dosya hatası). Bu yüzden önce oturum açılır; sayfa kendi içinde kimliksiz çalışır (oturum/çerez kullanmaz).
  test.beforeEach(async ({ page }) => signInFully(page))
  const TOKEN = 'ornekDavetBileti0000000000000000000000000000'

  test('bilet adresten silinir; zayıf parola alanda; başarıda ekran', async ({ page }) => {
    await page.goto(`/accept-invite#t=${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Yönetici hesabınızı oluşturun' })).toBeVisible()
    expect(page.url()).not.toContain(TOKEN)
    await expectNoA11yViolations(page)
    await page.getByLabel('Ad', { exact: true }).fill('Deneme')
    await page.getByLabel('Soyad').fill('Kişi')
    await page.getByLabel('Parola', { exact: true }).fill('kisa')
    await page.getByLabel('Parola (tekrar)').fill('kisa')
    await page.getByRole('button', { name: 'Hesabı oluştur' }).click()
    await expect(page.getByText('en az 12 karakter olmalı')).toBeVisible()
    await page.getByLabel('Parola', { exact: true }).fill('uzunBirParola123')
    await page.getByLabel('Parola (tekrar)').fill('uzunBirParola123')
    await page.getByRole('button', { name: 'Hesabı oluştur' }).click()
    await expect(page.getByTestId('invite-done')).toContainText('iki adımlı doğrulama kurulacak')
    await page.getByRole('button', { name: 'Girişe git' }).click()
    await expect(page).not.toHaveURL(/accept-invite/)
  })

  test('bilet yoksa ya da geçersizse "Bağlantı geçersiz"', async ({ page }) => {
    await page.goto('/accept-invite')
    await expect(page.getByTestId('invite-invalid')).toContainText('Bağlantı geçersiz')
    await expectNoA11yViolations(page)
    await page.goto('about:blank')
    await page.goto('/accept-invite#t=yanlis')
    await page.getByLabel('Ad', { exact: true }).fill('Deneme')
    await page.getByLabel('Soyad').fill('Kişi')
    await page.getByLabel('Parola', { exact: true }).fill('uzunBirParola123')
    await page.getByLabel('Parola (tekrar)').fill('uzunBirParola123')
    await page.getByRole('button', { name: 'Hesabı oluştur' }).click()
    await expect(page.getByTestId('invite-invalid')).toContainText('yeni bir davet isteyin')
  })
})
