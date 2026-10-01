// BO-R1b (K51): genel bakış dışındaki TÜM sayfalarda "Durum → Karar → Eylem → Ayrıntı" + NEXT_TASKS NT-01..NT-10.
// Sahte /admin-api; görsel taban YOK (axe 0 iki temada — proje başına).
import { expect, test, type Page } from '@playwright/test'
import { expectNoA11yViolations, settle, signIn, signInFully } from '../support/session'

/** Hüküm bloğu olan sayfalar (yol, beklenen ilk h1). */
const PAGES: Array<[string, string]> = [
  ['/musteriler', 'Müşteri listesi'],
  ['/musteriler/102', ''],
  ['/abonelikler', 'Abonelikler'],
  ['/abonelikler/102', ''],
  ['/motor', 'Motor ve kuyruklar'],
  ['/entegrasyonlar', 'Entegrasyonlar'],
  ['/altyapi', 'Redis ve MongoDB'],
  ['/altyapi/onbellek', 'Önbellek'],
  ['/loglar', 'Log kontrol merkezi'],
  ['/denetim', 'Denetim kayıtları'],
  ['/yoneticiler', 'Yöneticiler'],
  ['/sistem/bayraklar', 'Platform ayarları'],
  ['/sistem/otopilot', 'Otopilot'],
  ['/sistem/duyurular', 'Duyurular'],
  ['/bildirimler/teslimler', 'Teslim günlüğü'],
  ['/bildirimler/musteri-gecmisi', 'Müşteri bildirim geçmişi'],
  ['/bildirimler/katalog', 'Olay kataloğu'],
  ['/bildirimler/uyarilar', 'Platform uyarıları'],
]

async function expectVerdict(page: Page) {
  const head = page.getByTestId('page-verdict')
  await expect(head).toBeVisible()
  await expect(head.getByTestId('status-verdict')).not.toBeEmpty()
  await expect(head.getByTestId('health-badge')).toBeVisible()
  // Durum, Ayrıntı'dan ÖNCE gelir (hiyerarşi).
  const order = await page.evaluate(() => {
    const v = document.querySelector('[data-testid="page-verdict"]')
    const d = document.querySelector('[data-testid="details-label"]')
    return !!v && !!d && !!(v.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(order).toBe(true)
}

test.describe('BO-R1b sayfa hükümleri', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  for (const [path, title] of PAGES) {
    test(`${path}: hüküm başlığın altında, ayrıntıdan önce; maddeler bağlantılı; axe 0`, async ({ page }) => {
      await page.goto(path)
      await settle(page)
      if (title) await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expectVerdict(page)
      // Her dikkat maddesinin eylemi bir bağlantıdır (bağlantısız uyarı yok — CONSOLE_IDENTITY ilke 1).
      const items = page.getByTestId('verdict-attention').locator('ol > li')
      const n = await items.count()
      for (let i = 0; i < n; i++) await expect(items.nth(i).getByTestId('attention-action')).toHaveAttribute('href', /.+/)
      await expectNoA11yViolations(page)
    })
  }

  test('motor: DLQ maddesi ölü mektup sekmesini açar; okunamayan kaynak "okunamadı" der, sağlıklı demez', async ({ page }) => {
    await page.goto('/motor')
    await settle(page)
    await page.getByTestId('verdict-attention').getByRole('link', { name: 'Ölü mektupları aç' }).click()
    await expect(page).toHaveURL(/sekme=basarisiz.*kaynak=dlq/)
    await expect(page.getByRole('radio', { name: 'Ölü mektup' })).toHaveAttribute('aria-checked', 'true')
    await page.evaluate(`window.__boMock.failOps('BackofficeEngineService/')`)
    await page.getByRole('button', { name: 'Yenile', exact: true }).first().click()
    await expect(page.getByTestId('page-updated')).toContainText('Yenilenemedi')
    await expect(page.getByTestId('health-badge')).not.toHaveText('Sağlıklı')
  })
})

test.describe('BO-R1b NEXT_TASKS', () => {
  test('NT-02: üretimde yıkıcı işlem hedef kimliğini yazdırır', async ({ page }) => {
    await page.goto('/giris?env=production')
    await signIn(page)
    await page.getByLabel('Doğrulama kodu').fill('123456')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/\/genel-bakis/)
    await page.goto('/motor?sekme=basarisiz&gorunum=ayrinti&env=production')
    await settle(page)
    await page.getByRole('button', { name: /sil/i }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Gerekçe').fill('Test: yinelenen iş, müşteri onayıyla siliniyor')
    const typed = dialog.getByTestId('danger-confirm-text').locator('input')
    await expect(typed).toBeVisible()
    const confirm = dialog.getByRole('button', { name: 'Sil', exact: true })
    await expect(confirm).toBeDisabled()
    const label = await dialog.getByTestId('danger-confirm-text').locator('label').first().textContent()
    const id = /Onay için (\S+) yazın/.exec(label ?? '')?.[1] ?? ''
    await typed.fill(id)
    await expect(confirm).toBeEnabled()
  })

  test('NT-02: örnek veri ortamında hedef kimliği istenmez', async ({ page }) => {
    await signInFully(page)
    await page.goto('/motor?sekme=basarisiz&gorunum=ayrinti')
    await settle(page)
    await page.getByRole('button', { name: /sil/i }).first().click()
    await expect(page.getByRole('dialog').getByTestId('danger-confirm-text')).toHaveCount(0)
  })

  test('NT-01: palette "Bu ekranda" grubu; müşteri detayında destek oturumu', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium-mobile', 'fiziksel klavye senaryosu')
    await signInFully(page)
    await page.goto('/motor')
    await settle(page)
    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Komut paleti' })
    await expect(palette.getByText('Bu ekranda')).toBeVisible()
    await palette.getByRole('option', { name: 'Ölü mektuplara geç' }).click()
    await expect(page).toHaveURL(/kaynak=dlq/)
    await page.goto('/musteriler/102')
    await settle(page)
    await page.keyboard.press('Control+k')
    await expect(palette.getByRole('option', { name: 'Destek oturumu aç' })).toBeVisible()
  })

  test('NT-03: görünüm bağlantısı düğmesi; süzgeçli bağlantı aynı görünümü açar', async ({ page }) => {
    await signInFully(page)
    await page.goto('/bildirimler/uyarilar?durum=all')
    await settle(page)
    await expect(page.getByTestId('copy-view-link')).toBeVisible()
    await expect(page).toHaveURL(/durum=all/)
    await page.goto('/motor?sekme=basarisiz&kaynak=dlq')
    await settle(page)
    await expect(page.getByRole('radio', { name: 'Ölü mektup' })).toHaveAttribute('aria-checked', 'true')
  })

  test('NT-10: j/k satır odağı, Enter birincil bağlantıyı açar', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium-mobile', 'fiziksel klavye senaryosu')
    await signInFully(page)
    await page.goto('/musteriler')
    await settle(page)
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    await page.keyboard.press('j')
    await page.keyboard.press('j')
    const marked = page.locator('[data-kb-row]')
    await expect(marked).toHaveCount(1)
    await page.keyboard.press('k')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/musteriler\/\d+/)
  })

  test('NT-07: panel yenilemesi yeşil tik yerine "Güncellendi" der', async ({ page }) => {
    await signInFully(page)
    await page.goto('/motor')
    await settle(page)
    await page.getByRole('button', { name: /Kuyruk durumu|Yenile/ }).last().click()
    await expect(page.locator('.ek-refresh.is-quiet .mdi-check')).toHaveCount(0)
  })
})
