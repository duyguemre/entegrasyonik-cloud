// C2.2 — kabukta abonelik durum bandı (F-16 FE kısmı; ADR-0008 §3 durum makinesi + risk notu).
// Kapsam: her durum (ton + metin) · bant yok durumları · hata → bant yok ve ekran çalışır · "Aboneliği yönet"
// etkileşimi (abonelik ekranında bant gizli, dönüşte yeniden okunur) · deneme küçült/genişlet · üst bölüm
// daraltma + odak modu uyumu · 15 dk yoklama · 3 viewport ekran görüntüsü · axe WCAG 2.1 AA = 0.
// Zaman sabit (page.clock) — deneme "kalan gün" metni ve tarihler deterministik.
// İnceleme görselleri: C22_REVIEW=1 C22_REVIEW_WIDTH=1440|390 → frontend/docs/design-system-review/c22-*.png
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { buildSubscription, subscriptionNoneFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const NOW = new Date('2026-09-30T09:00:00.000Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()
const REVIEW = !!process.env.C22_REVIEW
const REVIEW_WIDTH = Number(process.env.C22_REVIEW_WIDTH) || 0
if (REVIEW_WIDTH) test.use({ viewport: { width: REVIEW_WIDTH, height: REVIEW_WIDTH < 500 ? 844 : 900 } })

function sub(status: string, fields: Record<string, any> = {}, access = { read: true, write: true, engine: true }) {
  return buildSubscription({
    subscription: { planCode: 'growth', planVersion: 1, status, currentPeriodStart: '2026-09-01T00:00:00.000Z', cancelAtPeriodEnd: false, billingExempt: false, ...fields },
    status,
    access,
    reason: undefined,
  })
}

const READ_ONLY = { read: true, write: false, engine: false }

const FIXTURES = {
  trialing: sub('trialing', { trialEndsAt: day(2) }),
  past_due: sub('past_due', { currentPeriodEnd: '2026-10-01T00:00:00.000Z', graceUntil: '2026-10-07T00:00:00.000Z' }),
  suspended: sub('suspended', {}, READ_ONLY),
  canceled: sub('canceled', { cancelAtPeriodEnd: true, currentPeriodEnd: '2026-10-15T00:00:00.000Z' }),
  expired: sub('expired', {}, { read: false, write: false, engine: false }),
}

/** Yanıtı sayan mock: kaç kez çağrıldığını doğrulamak için. */
function counting(counter: { n: number }, body: any): MockValue {
  return async (route: any, headers: any) => {
    counter.n++
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) })
  }
}

async function boot(page: Page, subscription: MockValue) {
  await page.clock.setFixedTime(NOW)
  await installApiMocks(page, { 'BillingService/getMySubscription': subscription })
  await gotoAuthed(page)
}

const banner = (page: Page) => page.getByTestId('subscription-banner')

async function capture(page: Page, name: string) {
  if (!REVIEW) return
  const width = page.viewportSize()?.width ?? 0
  await page.screenshot({ path: `docs/design-system-review/c22-${name}-${width}.png` })
}

/** Bant sekme şeridinin üstünde, çakışmadan (geçiş animasyonları yerleşene kadar beklenir). */
async function expectNoOverlap(page: Page) {
  await expect(async () => {
    const b = await banner(page).boundingBox()
    const tabs = await page.locator('.ek-shell__tabs').boundingBox()
    expect(b && tabs).toBeTruthy()
    expect(Math.round(tabs!.y)).toBeGreaterThanOrEqual(Math.round(b!.y + b!.height) - 1)
    expect(Math.round(tabs!.y)).toBeLessThanOrEqual(Math.round(b!.y + b!.height) + 1)
  }).toPass({ timeout: 5000 })
}

test.describe('C2.2 — kabukta abonelik durum bandı', () => {
  const CASES: Array<{ key: keyof typeof FIXTURES; tone: string; title: string; text: RegExp }> = [
    { key: 'trialing', tone: 'info', title: 'Deneme Sürümü', text: /Deneme sürenizin bitmesine 2 gün kaldı \(02\.10\.2026\)/ },
    { key: 'past_due', tone: 'warning', title: 'Ödeme Bekliyor', text: /07\.10\.2026 tarihine kadar ödeme tamamlanmazsa hesap askıya alınır ve stok senkronu durur/ },
    { key: 'suspended', tone: 'danger', title: 'Askıya Alındı', text: /Stok senkronu durdu — kanallarda aşırı satış riski\. Ödemeyi tamamlayın\./ },
    { key: 'canceled', tone: 'info', title: 'İptal Edildi', text: /15\.10\.2026 tarihine kadar tüm özellikler açık/ },
    { key: 'expired', tone: 'danger', title: 'Sona Erdi', text: /stok senkronu ve düzenleme kapalı/ },
  ]

  for (const c of CASES) {
    test(`${c.key}: ${c.tone} tonlu bant, başlık + metin, kapatılamaz, sekmelerle çakışmaz, axe = 0`, async ({ page }) => {
      await boot(page, FIXTURES[c.key])
      const b = banner(page)
      await expect(b).toBeVisible()
      await expect(b).toHaveAttribute('data-tone', c.tone)
      await expect(b).toHaveAttribute('aria-label', 'Abonelik durumu')
      await expect(b.getByRole('status')).toContainText(c.title)
      await expect(b.getByRole('status')).toContainText(c.text)
      await expect(b.getByRole('button', { name: 'Aboneliği yönet' })).toBeVisible()
      // Kritik bant kapatılamaz; yalnız deneme bandı küçültülebilir.
      await expect(b.getByRole('button', { name: /Kapat/ })).toHaveCount(0)
      await expect(b.getByRole('button', { name: 'Bildirimi küçült' })).toHaveCount(c.key === 'trialing' ? 1 : 0)
      await expect(b).not.toContainText(c.key) // ham durum kodu sızmaz
      await expectNoOverlap(page)

      const axe = await new AxeBuilder({ page }).include('[data-testid="subscription-banner"]').withTags(AXE_TAGS).analyze()
      expect(axe.violations).toEqual([])
      await capture(page, c.key)
    })
  }

  test('bant yok: active, abonelik yok, legacy (billingExempt), denemenin bitmesine > 3 gün', async ({ page }) => {
    test.setTimeout(90_000) // 4 ayrı açılış
    for (const body of [
      buildSubscription(),
      subscriptionNoneFixture,
      sub('suspended', { billingExempt: true }, READ_ONLY),
      sub('trialing', { trialEndsAt: day(6) }),
    ]) {
      await boot(page, body)
      await expect(page.getByText('İŞLETME PERFORMANSI')).toBeVisible()
      await expect(banner(page)).toHaveCount(0)
      // Bant yokken sekme şeridi doğrudan üst barın altında (ofset 0).
      const offset = await page.locator('.ek-shell').evaluate((el) => getComputedStyle(el).getPropertyValue('--ek-shell-banner-h').trim())
      expect(['', '0px']).toContain(offset)
    }
  })

  test('hata: getMySubscription 500 → bant yok, ham hata sızmaz, ekran çalışır', async ({ page }) => {
    await boot(page, mockError(500))
    await expect(banner(page)).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('E2E sentetik hata')
    await openScreen(page, 'OrderListView')
    await expect(page.locator('.workplace-tabs')).toContainText(/Sipariş/i)
  })

  test('etkileşim: "Aboneliği yönet" abonelik ekranını açar; orada bant gizli, dönüşte durum yeniden okunur', async ({ page }) => {
    const calls = { n: 0 }
    await boot(page, counting(calls, FIXTURES.past_due))
    await expect(banner(page)).toBeVisible()
    const before = calls.n

    await banner(page).getByRole('button', { name: 'Aboneliği yönet' }).click()
    await expect(page.locator('.subscriptionView')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Abonelik ve Planlar' })).toBeVisible()
    await expect(banner(page)).toHaveCount(0) // ekranın kendi durum bölümü var — çift bant yok
    await expect(page.locator('.subscriptionView').getByText('Ödeme Bekliyor')).toBeVisible()

    await page.locator('.workplace-tabs').getByRole('tab').first().click()
    await expect(banner(page)).toBeVisible()
    await expect.poll(() => calls.n).toBeGreaterThan(before + 1) // ekranın kendi çağrısı + dönüşte bant
  })

  test('deneme bandı küçültülür (tek satır) ve geri genişletilir; kritik bant küçültülemez', async ({ page }) => {
    await boot(page, FIXTURES.trialing)
    const b = banner(page)
    const full = (await b.boundingBox())!.height
    const toggle = b.getByRole('button', { name: 'Bildirimi küçült' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await toggle.click()

    await expect(b).toHaveClass(/is-compact/)
    await expect(b.getByRole('status')).toContainText('Deneme bitiyor: 2 gün kaldı (02.10.2026)')
    const compact = (await b.boundingBox())!.height
    expect(compact).toBeLessThan(full)
    await expectNoOverlap(page)
    await page.mouse.move(600, 500) // ipucu kapansın (görsel)
    await capture(page, 'trialing-kucuk')

    const expand = b.getByRole('button', { name: 'Bildirimi genişlet' })
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expand.click()
    await expect(b).not.toHaveClass(/is-compact/)
    await expect(b.getByRole('status')).toContainText('Kesintisiz devam etmek için bir plan seçin')
  })

  test('üst bölüm daraltılınca bant kalır; odak modunda tek satıra iner ama gizlenmez', async ({ page }) => {
    await boot(page, FIXTURES.suspended)
    const b = banner(page)
    await expect(b).toBeVisible()
    const top = (await b.boundingBox())!.y

    await page.keyboard.press('Alt+U')
    await expect.poll(async () => (await b.boundingBox())!.y).toBeLessThan(top)
    await expect(b).toBeVisible()
    await expectNoOverlap(page)
    await capture(page, 'suspended-ust-daraltilmis')
    await page.keyboard.press('Alt+U')

    await page.keyboard.press('Control+Shift+F')
    await expect(b).toHaveClass(/is-compact/)
    await expect(b.getByRole('status')).toContainText('Askıda · stok senkronu durdu')
    await expectNoOverlap(page)
    await capture(page, 'suspended-odak')
  })

  test('yoklama: durum 15 dakikada bir yeniden okunur; iyileşince bant kalkar', async ({ page }) => {
    let body: any = FIXTURES.past_due
    await page.clock.install({ time: NOW })
    await installApiMocks(page, {
      'BillingService/getMySubscription': async (route: any, headers: any) => {
        await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) })
      },
    })
    await gotoAuthed(page)
    await expect(banner(page)).toBeVisible()

    body = buildSubscription() // ödeme alındı → active
    await page.clock.fastForward('14:00')
    await expect(banner(page)).toBeVisible()
    await page.clock.fastForward('01:30')
    await expect(banner(page)).toHaveCount(0)
  })

  test('ekran görüntüsü: bant + sekme şeridi (3 viewport)', async ({ page }) => {
    await boot(page, FIXTURES.past_due)
    await expect(banner(page)).toBeVisible()
    await capture(page, 'past_due-kabuk')
    await expect(banner(page)).toHaveScreenshot('subscription-banner-past-due.png')
  })
})
