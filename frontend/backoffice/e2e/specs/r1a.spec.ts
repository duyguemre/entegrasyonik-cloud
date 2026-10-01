// BO-R1a: yönlendiren genel bakış (K51) — dört soru sırayla, durum başlığı + önerilen ilk adım, tek tıkla süzgeçli eylem,
// "her şey yolunda", okunamayan kontrol, uç yok (geri düşüş), katlanır teknik ayrıntı. Sahte /admin-api; görsel taban YOK.
import { expect, test, type Page } from '@playwright/test'
import { expectNoA11yViolations, settle, signInFully } from '../support/session'

type Mock = { setCalm(v: boolean): void; setAttentionMissing(v: boolean): void; setAttentionDegraded(s: string[]): void }
async function arm(page: Page, fn: (m: Mock) => void) {
  await page.waitForFunction(() => 'setCalm' in ((window as unknown as { __boMock?: object }).__boMock ?? {}))
  await page.evaluate(`(${fn.toString()})(window.__boMock)`)
  await page.getByRole('button', { name: 'Yenile', exact: true }).click()
  await settle(page)
}

/** Mobilde listeler 2 maddeyle açılır; gerekiyorsa "N madde daha göster". */
export async function expandAll(page: Page, testId: string) {
  const more = page.getByTestId(testId).getByRole('button', { name: /madde daha göster/ })
  if (await more.count()) await more.click()
}

test.describe('BO-R1a genel bakış', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('sorun var: hüküm + rozet, dört soru sırayla, önerilen ilk adım sistem kritiği; axe 0', async ({ page }) => {
    await settle(page)
    const head = page.getByTestId('status-header')
    await expect(head.getByTestId('status-verdict')).toContainText('şimdi müdahale istiyor')
    await expect(head.getByTestId('health-badge')).toContainText('Müdahale gerekli')
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Sistemde müdahale gereken var mı?',
      'Kullanım büyük resimde nasıl?',
      'Müşterilerimde müdahale gereken var mı?',
      'Genel kullanım nasıl?',
      /^Teknik ayrıntılar/,
    ])
    await expect(page.getByTestId('action-card')).toContainText('N11 devre kesicisi açık')
    await expect(page.getByTestId('triage-sistem').getByTestId('triage-answer')).toContainText('Evet')
    await expectNoA11yViolations(page)
  })

  test('tek tık eylem: devre kesici → dayanıklılık sekmesi; tek müşterili ödeme sorunu → abonelik detayı', async ({ page }) => {
    await settle(page)
    await page.getByTestId('action-card-go').click()
    await expect(page).toHaveURL(/\/entegrasyonlar\?.*sekme=dayaniklilik/)
    await page.goBack()
    await settle(page)
    const customers = page.getByTestId('triage-musteriler')
    await expandAll(page, 'triage-musteriler')
    await customers.getByRole('link', { name: 'Ödeme sorunlu aboneliklere git' }).click()
    await expect(page).toHaveURL(/\/abonelikler\/105$/)
  })

  test('her şey yolunda: sakin hüküm, iki dikkat listesi "Hayır" + denetlenenler; axe 0', async ({ page }) => {
    await settle(page)
    await arm(page, (m) => m.setCalm(true))
    await expect(page.getByTestId('status-verdict')).toHaveText('Her şey yolunda')
    await expect(page.getByTestId('health-badge')).toContainText('Sağlıklı')
    await expect(page.getByTestId('attention-ok')).toHaveCount(2)
    await expect(page.getByTestId('triage-musteriler').getByTestId('triage-answer')).toHaveText('Hayır')
    await expect(page.getByTestId('triage-sistem')).toContainText('Denetlenen')
    await expectNoA11yViolations(page)
  })

  test('okunamayan kontrol: "liste eksik olabilir" notu, hüküm asla "Her şey yolunda" değil', async ({ page }) => {
    await settle(page)
    await arm(page, (m) => {
      m.setCalm(true)
      m.setAttentionDegraded(['circuits'])
    })
    await expect(page.getByTestId('attention-degraded')).toContainText('Devre kesiciler')
    await expect(page.getByTestId('status-verdict')).not.toHaveText('Her şey yolunda')
    await expect(page.getByTestId('health-badge')).toContainText('Kısmi bozulma')
  })

  test('uç yok (eski backend): sistem maddeleri getHealth\'ten, müşteri bölümü "henüz bağlı değil"', async ({ page }) => {
    await settle(page)
    await arm(page, (m) => m.setAttentionMissing(true))
    await expect(page.getByTestId('attention-unsupported')).toContainText('Müşteri denetimleri henüz bağlı değil')
    await expandAll(page, 'triage-sistem')
    await expect(page.getByTestId('triage-sistem').getByRole('link', { name: 'Ölü mektuplara git' })).toBeVisible()
  })

  test('teknik ayrıntı katlanır, açılınca yüklenir ve ?ayrinti=teknik ile paylaşılır', async ({ page }) => {
    await settle(page)
    await expect(page.getByRole('heading', { name: 'Bağımlılıklar ve podlar', exact: true })).toHaveCount(0)
    await page.getByTestId('detail-toggle').click()
    await expect(page).toHaveURL(/ayrinti=teknik/)
    await expect(page.getByRole('heading', { name: 'Bağımlılıklar ve podlar', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Bağımlılıklar ve podlar', exact: true })).toBeVisible()
    await expect(page.getByTestId('detail-toggle')).toHaveAttribute('aria-expanded', 'true')
  })
})
