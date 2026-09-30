import { expect, test } from '@playwright/test'
import { ACCOUNT, expectNoA11yViolations, settle, signIn, signInFully } from '../support/session'

test.describe('giriş', () => {
  test('parola → TOTP → genel bakış; korunan rota girişe yönlendirir ve geri döner', async ({ page }) => {
    await page.goto('/denetim')
    await expect(page).toHaveURL(/\/giris\?r=(%2F|\/)denetim$/)
    await expectNoA11yViolations(page)
    await page.getByLabel('E-posta').fill(ACCOUNT.email)
    await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
    await page.getByRole('button', { name: 'Devam et' }).click()
    await expect(page.getByRole('heading', { name: 'İki adımlı doğrulama' })).toBeVisible()
    await expectNoA11yViolations(page)
    await page.getByLabel('Doğrulama kodu').fill('000000')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Doğrulama kodu geçersiz')
    await page.getByLabel('Doğrulama kodu').fill('123456')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/\/denetim$/)
  })

  test('kurtarma kodu ile giriş', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: 'Kurtarma kodu kullan' }).click()
    await page.getByLabel('Kurtarma kodu').fill('k7m2-q9xd')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/\/genel-bakis$/)
  })

  test('ilk giriş: QR + elle anahtar → kurulum → 10 kurtarma kodu → onay → kabuk', async ({ page }) => {
    await signIn(page, ACCOUNT.firstLogin)
    await expect(page.getByRole('img', { name: 'Doğrulayıcı uygulama için QR kodu' })).toBeVisible()
    await expect(page.getByTestId('totp-secret')).toHaveText(/[A-Z2-7 ]{16,}/)
    await expectNoA11yViolations(page)
    await page.getByLabel('Uygulamadaki 6 haneli kod').fill('246810')
    await page.getByRole('button', { name: 'Kurulumu tamamla' }).click()
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10)
    const next = page.getByRole('button', { name: 'Yönetim paneline geç' })
    await expect(next).toBeDisabled()
    await page.getByLabel('Kodları güvenli bir yere kaydettim').check()
    await next.click()
    await expect(page).toHaveURL(/\/genel-bakis$/)
  })

  test('çıkış → giriş ekranı; oturum düşerse (401) giriş ekranına bildirimle döner', async ({ page }, info) => {
    await signInFully(page)
    if (info.project.name === 'chromium-mobile') await page.getByRole('button', { name: 'Menüyü aç' }).click()
    await page.evaluate(() => (window as unknown as { __boMock: { expireSession(): void } }).__boMock.expireSession())
    await page.getByRole('navigation', { name: 'Yönetim ekranları' }).getByRole('button', { name: 'Müşteriler' }).click()
    await expect(page).toHaveURL(/\/giris\?r=/)
    await expect(page.getByText('Oturumunuz sona erdi')).toBeVisible()
  })
})

test.describe('kabuk ve ekranlar', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  for (const [label, path, heading] of [
    ['Genel bakış', '/genel-bakis', 'Genel bakış'],
    ['Müşteriler', '/musteriler', 'Müşteriler'],
    ['Log kontrol merkezi', '/loglar', 'Log kontrol merkezi'],
    ['Denetim kayıtları', '/denetim', 'Denetim kayıtları'],
  ] as const) {
    test(`${label}: menüden açılır, axe 0, görsel taban`, async ({ page }, info) => {
      if (info.project.name === 'chromium-mobile') await page.getByRole('button', { name: 'Menüyü aç' }).click()
      await page.getByRole('navigation', { name: 'Yönetim ekranları' }).getByRole('button', { name: label }).click()
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      await settle(page)
      await expectNoA11yViolations(page)
      if (info.project.name !== 'chromium-mobile') {
        await expect(page).toHaveScreenshot(`${path.slice(1)}.png`, { fullPage: true, mask: [page.locator('.ek-num, time, .bo-page__lede .bo-muted')] })
      }
    })
  }

  test('planlanan ekranlar gezilebilir (menüde tüm gruplar)', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium-mobile')
    const nav = page.getByRole('navigation', { name: 'Yönetim ekranları' })
    for (const label of ['Üyelik ve abonelikler', 'Motor ve kuyruklar', 'Redis ve MongoDB', 'Bildirimler ve duyurular', 'Yöneticiler ve güvenlik']) {
      await nav.getByRole('button', { name: label }).click()
      await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible()
    }
  })

  test('müşteri → geçici erişim: gerekçe + step-up → yeni sekme (noopener), URL loglanmaz', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __opened: unknown[] }).__opened = []
      window.open = ((...args: unknown[]) => {
        ;(window as unknown as { __opened: unknown[] }).__opened.push(args)
        return null
      }) as typeof window.open
    })
    const logs: string[] = []
    page.on('console', (m) => logs.push(m.text()))
    await page.goto('/musteriler')
    await page.getByRole('link', { name: /Poyraz Outdoor/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Örnek · Poyraz Outdoor' })).toBeVisible()
    await page.evaluate(() => (window as unknown as { __boMock: { expireReauth(): void } }).__boMock.expireReauth())

    await page.getByTestId('impersonate').click()
    const dialog = page.getByRole('dialog', { name: 'Hesaba geçici erişim' })
    const start = dialog.getByRole('button', { name: 'Gerekçeyle başlat' })
    await dialog.getByLabel('Gerekçe').fill('kısa')
    await expect(start).toBeDisabled()
    await dialog.getByLabel('Gerekçe').fill('Destek talebi: eşleme ekranı hatası')
    await start.click()

    const reauth = page.getByRole('dialog', { name: 'Kimliğinizi yeniden doğrulayın' })
    await expect(reauth).toBeVisible()
    // Alttaki diyalog perdenin arkasında: axe yalnız üstteki (etkin) diyaloğu denetler.
    await expectNoA11yViolations(page, '.v-overlay--active:last-of-type .v-overlay__content')
    await reauth.getByLabel('Parola').fill(ACCOUNT.password)
    await reauth.getByLabel('Doğrulama kodu').fill('135790')
    await reauth.getByRole('button', { name: 'Doğrula ve devam et' }).click()

    await expect(page.getByText('Müşteri hesabı yeni sekmede açıldı')).toBeVisible()
    const opened = await page.evaluate(() => (window as unknown as { __opened: unknown[][] }).__opened)
    expect(opened).toHaveLength(1)
    expect(opened[0][0]).toMatch(/\/impersonate#t=[0-9a-f]{32}$/)
    expect(opened[0][1]).toBe('_blank')
    expect(opened[0][2]).toBe('noopener,noreferrer')
    expect(logs.join('\n')).not.toContain('impersonate#t=')
  })

  test('log merkezi: kategori filtresi, sorun detayı (trend + örnek), istek zinciri', async ({ page }) => {
    await page.goto('/loglar')
    await settle(page)
    const cat = page.locator('[data-category="integration"]')
    await cat.click()
    await expect(cat).toHaveAttribute('aria-pressed', 'true')
    await settle(page)
    // Filtre değişimi listeyi yeniden yükler: tıklama yeni listeye düşene dek yeniden dene.
    await expect(async () => {
      await page.locator('.bo-issue').first().click()
      await expect(page).toHaveURL(/fp=/, { timeout: 1000 })
    }).toPass()
    const drawer = page.getByRole('dialog').locator('.bo-drawer')
    await expect(drawer.getByRole('img', { name: /eğilimi/ })).toBeVisible()
    await drawer.getByRole('button', { name: 'İzi aç' }).first().click()
    const trace = page.getByRole('dialog', { name: 'İstek zinciri' })
    await expect(trace.locator('.bo-trace__item').first()).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('denetim: satır açılınca önce/sonra tablosu', async ({ page }) => {
    await page.goto('/denetim')
    await settle(page)
    await page.getByRole('button', { name: 'Ayrıntı: backoffice.write' }).first().click()
    const diff = page.locator('.bo-diff').first()
    await expect(diff.getByText('PASSIVE')).toBeVisible()
    await expect(diff.getByText('ACTIVE')).toBeVisible()
  })

  test('tema: menüden Koyu → html[data-theme=dark], yenilemede korunur; ilk kare doğru tema', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium-mobile')
    await page.getByTestId('theme-menu').click()
    await page.locator('[data-theme-option="dark"]').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.evaluate(() => {
      document.addEventListener('DOMContentLoaded', () => ((window as unknown as { __t: string }).__t = document.documentElement.dataset.theme ?? ''))
    })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByTestId('theme-menu').click()
    await page.locator('[data-theme-option="light"]').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('klavye: "İçeriğe geç" bağlantısı ilk sekme durağı', async ({ page }) => {
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'İçeriğe geç' })).toBeFocused()
  })
})

test('ilk kare: ?theme=dark ile DOMContentLoaded anında html[data-theme=dark]', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => ((window as unknown as { __first: string }).__first = document.documentElement.dataset.theme ?? ''))
  })
  await page.goto('/giris?theme=dark')
  expect(await page.evaluate(() => (window as unknown as { __first: string }).__first)).toBe('dark')
})
