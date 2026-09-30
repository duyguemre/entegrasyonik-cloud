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
    // Genel bakışın açılış istekleri bitsin: yoksa bunlardan biri 401 alıp tıklamadan önce girişe döndürür (doğru davranış, yarış).
    await settle(page)
    if (info.project.name === 'chromium-mobile') await page.getByRole('button', { name: 'Menüyü aç' }).click()
    await page.evaluate(() => (window as unknown as { __boMock: { expireSession(): void } }).__boMock.expireSession())
    const nav = page.getByRole('navigation', { name: 'Yönetim ekranları' })
    await nav.getByRole('button', { name: 'Müşteriler', exact: true }).click()
    await nav.getByRole('button', { name: 'Müşteri listesi', exact: true }).click()
    await expect(page).toHaveURL(/\/giris\?r=/)
    await expect(page.getByText('Oturumunuz sona erdi')).toBeVisible()
  })
})

test.describe('kabuk ve ekranlar', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  // [menü yolu (grup → ekran), adres, h1]
  for (const [menu, path, heading] of [
    [['Genel bakış'], '/genel-bakis', 'Genel bakış'],
    [['Müşteriler', 'Müşteri listesi'], '/musteriler', 'Müşteri listesi'],
    [['Loglar ve sorunlar'], '/loglar', 'Log kontrol merkezi'],
    [['Denetim'], '/denetim', 'Denetim kayıtları'],
  ] as const) {
    test(`${heading}: menüden açılır, axe 0, görsel taban`, async ({ page }, info) => {
      if (info.project.name === 'chromium-mobile') await page.getByRole('button', { name: 'Menüyü aç' }).click()
      const nav = page.getByRole('navigation', { name: 'Yönetim ekranları' })
      for (const label of menu) await nav.getByRole('button', { name: new RegExp(`^${label}(\\s|$)`) }).click()
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      await settle(page)
      await expectNoA11yViolations(page)
      if (info.project.name !== 'chromium-mobile') {
        await expect(page).toHaveScreenshot(`${path.slice(1)}.png`, { fullPage: true, mask: [page.locator('.ek-num, time, .bo-page__lede .bo-muted, [data-testid="stepup-indicator"]')] })
      }
    })
  }

  test('planlanan ekranlar kalıcı yollarında "yakında" durumuyla açılır (menüde tüm gruplar)', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium-mobile')
    const nav = page.getByRole('navigation', { name: 'Yönetim ekranları' })
    for (const [menu, heading, path] of [
      // bo-p2 sonrası hâlâ planlı olanlar (Abonelik, Motor, Altyapı, Yöneticiler, Platform ayarları hazır).
      [['Müşteriler', 'Yaşam döngüsü'], 'Yaşam döngüsü', '/musteriler/yasam-dongusu'],
      [['Destek talepleri'], 'Destek talepleri', '/musteriler/destek'],
      [['Sistem ayarları', 'Bildirimler ve duyurular'], 'Bildirimler ve duyurular', '/sistem/duyurular'],
    ] as const) {
      for (const label of menu) {
        const btn = nav.getByRole('button', { name: new RegExp(`^${label}(\\s|$)`) })
        // Açık grubun başlığına yeniden tıklamak onu kapatır: yalnız kapalıysa aç.
        if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click()
      }
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      await expect(page.getByRole('heading', { level: 2, name: `${heading} ekranı hazırlanıyor` })).toBeVisible()
    }
    await expectNoA11yViolations(page)
  })

  test('komut paleti: Ctrl+K → ekran arama ve müşteri numarasıyla hızlı geçiş (yalnız klavye)', async ({ page }) => {
    await settle(page)
    await page.keyboard.press('Control+k')
    const input = page.getByRole('combobox', { name: /Ekran, müşteri numarası/ })
    await expect(input).toBeFocused()
    await input.fill('kuyruk')
    await expect(page.getByRole('option').first()).toContainText('Motor ve kuyruklar')
    await expectNoA11yViolations(page, '.bo-cmdk')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/motor$/)
    await page.keyboard.press('Control+k')
    await input.fill('102')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/musteriler\/102$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Örnek · Poyraz Outdoor' })).toBeVisible()
  })

  test('adım-yükseltmesi göstergesi: girişte doğrulandı; süre dolunca kilitli → "Şimdi doğrula"', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium-mobile')
    const indicator = page.getByTestId('stepup-indicator')
    await expect(indicator).toContainText('Doğrulandı')
    await page.evaluate(() => (window as unknown as { __boMock: { expireReauth(): void } }).__boMock.expireReauth())
    await page.reload()
    await expect(indicator).toContainText('Hassas işlemler kilitli')
    await indicator.click()
    await page.getByRole('button', { name: 'Şimdi doğrula' }).click()
    const reauth = page.getByRole('dialog', { name: 'Kimliğinizi yeniden doğrulayın' })
    await reauth.getByLabel('Parola').fill(ACCOUNT.password)
    await reauth.getByLabel('Doğrulama kodu').fill('135790')
    await reauth.getByRole('button', { name: 'Doğrula ve devam et' }).click()
    await expect(indicator).toContainText('Doğrulandı')
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
    const dialog = page.getByRole('dialog', { name: 'Müşterinin gözünden açılsın mı?' })
    await expect(dialog.getByText('Geri alınabilir', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Onayladığınızda parola ve doğrulama kodu istenecek', { exact: false })).toBeVisible()
    const start = dialog.getByRole('button', { name: 'Gerekçeyle aç' })
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
    await expect(page.getByRole('button', { name: 'Denetim kaydını aç' })).toBeVisible()
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
