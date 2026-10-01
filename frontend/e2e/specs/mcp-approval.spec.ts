// MCP-6 S2 — bant dışı işlem onayı `/approve/{id}` (MCP_UI_CONTRACT §3, §8). Mock senaryoları src/mocks/mcp.ts (§7).
// Kapsam: pending (önizleme, geri sayım, başlık odağı) → onayla = executed (+ Ekranda aç), reddet = rejected, süresi
// dolmuş/404, LIVE_READONLY, failed/unknown_outcome, QUOTA_EXCEEDED plan bağlantısı, geri sayım sıfırda süresi dolmuş,
// ekran okuyucu duyurusu yalnız son 60 sn'de bir kez, klavye, axe AA (light + dark), yatay taşma yok, görsel taban.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { AXE_TAGS, forceDarkTheme, installMcpMocks, openBarePage } from '../fixtures/mcp'
import { approvalView } from '../../src/mocks/mcp'

const ROOT = '.McpApprovalView'
const open = (page: Page, id = 'apr-e2e-1') => openBarePage(page, `/approve/${id}`, ROOT)

test.describe('MCP-6 S2 — işlem onayı sayfası', () => {
  test('pending: başlık odakta, önizleme (düz metin satırlar, sayı, pazaryeri notu), geri sayım, eylem düğmesi etiketi', async ({ page }) => {
    await installMcpMocks(page, ['approval-pending'])
    const root = await open(page)
    const h1 = root.getByRole('heading', { level: 1 })
    await expect(h1).toContainText('Örnek Asistan bir işlem öneriyor')
    await expect(h1).toBeFocused()
    const preview = root.getByTestId('mcp-action-preview')
    await expect(preview.getByRole('heading', { level: 2 })).toHaveText('12 sipariş “Onaylandı” durumuna geçecek')
    await expect(preview.getByText('Siparişleri onayla')).toBeVisible()
    await expect(preview.getByText('Bu işlem pazaryerine gönderilir.')).toBeVisible()
    await expect(preview.getByText('12 kayıt etkilenecek')).toBeVisible()
    await expect(preview.getByRole('listitem')).toHaveCount(5)
    await expect(root.getByTestId('mcp-approval-timer')).toContainText(/Onay isteği 0:[0-5]\d sonra geçersiz olacak/)
    await expect(root.getByTestId('mcp-approval-approve')).toHaveText('12 siparişi onayla')
    await expect(root.getByTestId('mcp-approval-reject')).toHaveText('Reddet')
    // 60 sn'lik istek → son dakikada açıldı: duyuru bir kez.
    await expect(root.getByTestId('mcp-approval-announce')).toHaveText('Onay isteğinin süresinin dolmasına bir dakikadan az kaldı.')
  })

  test('onayla → executed: sonuç özeti, geri dönüş notu, "Ekranda aç" yalnız kayıtlı ekrana; gövde {decision:"approve"}', async ({ page }) => {
    const calls = await installMcpMocks(page, ['approval-pending'])
    const root = await open(page)
    await root.getByTestId('mcp-approval-approve').click()
    const outcome = root.getByTestId('mcp-approval-outcome')
    await expect(outcome).toHaveAttribute('data-phase', 'executed')
    await expect(outcome.getByRole('heading', { level: 1, name: 'İşlem tamamlandı' })).toBeFocused()
    await expect(outcome).toContainText('12 sipariş onaylandı.')
    await expect(outcome).toContainText('Yapay zekâ uygulamanıza dönebilirsiniz; aynı isteği tekrarladığında sonucu görecek.')
    expect(calls.filter((c) => c.method === 'POST').map((c) => [c.path, c.body])).toEqual([['mcp/approvals/apr-e2e-1', { decision: 'approve' }]])
    await outcome.getByTestId('mcp-approval-open-in').click()
    await expect(page).toHaveURL(/\/orders(\?|$)/, { timeout: 15000 })
  })

  test('reddet → "Reddedildi"', async ({ page }) => {
    const calls = await installMcpMocks(page, ['approval-pending'])
    const root = await open(page)
    await root.getByTestId('mcp-approval-reject').click()
    await expect(root.getByTestId('mcp-approval-outcome')).toHaveAttribute('data-phase', 'rejected')
    await expect(root.getByRole('heading', { level: 1, name: 'Reddedildi' })).toBeVisible()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ decision: 'reject' })
  })

  test('süresi dolmuş ve 404 (başkasına ait) aynı ileti; düğme yok', async ({ page }) => {
    await installMcpMocks(page, ['approval-expired'])
    let root = await open(page)
    await expect(root.getByTestId('mcp-approval-outcome')).toContainText('Bu onay isteğinin süresi doldu veya size ait değil.')
    await expect(root.getByTestId('mcp-approval-approve')).toHaveCount(0)

    await installMcpMocks(page, [{ 'approval.get': { status: 404, body: { error: 'x', code: 'NOT_FOUND', requestId: 'req_e2e_404' } } }])
    root = await open(page, 'baskasinin')
    await expect(root.getByTestId('mcp-approval-outcome')).toHaveAttribute('data-phase', 'expired')
  })

  test('LIVE_READONLY (423): salt-okuma iletisi, önizleme bağlam için kalır, destek kodu yok sızıntı yok', async ({ page }) => {
    await installMcpMocks(page, ['approval-live-readonly'])
    const root = await open(page)
    await root.getByTestId('mcp-approval-approve').click()
    const outcome = root.getByTestId('mcp-approval-outcome')
    await expect(outcome).toHaveAttribute('data-phase', 'LIVE_READONLY')
    await expect(outcome).toContainText('Canlı veri salt-okuma modunda; bu işlem şu an yapılamaz.')
    await expect(outcome.getByTestId('mcp-action-preview')).toBeVisible()
    await expect(outcome).not.toContainText('423')
  })

  test('QUOTA_EXCEEDED: günlük sınır iletisi + plan bağlantısı; MAINTENANCE iletisi', async ({ page }) => {
    await installMcpMocks(page, ['approval-pending', { 'approval.decide': { status: 429, body: { error: 'x', code: 'QUOTA_EXCEEDED', requestId: 'req_q' } } }])
    let root = await open(page)
    await root.getByTestId('mcp-approval-approve').click()
    await expect(root.getByTestId('mcp-approval-outcome')).toContainText('Günlük işlem sınırınıza ulaştınız')
    await expect(root.getByTestId('mcp-approval-upgrade')).toBeVisible()

    await installMcpMocks(page, ['approval-pending', { 'approval.decide': { status: 503, body: { error: 'x', code: 'MAINTENANCE', requestId: 'req_m' } } }])
    root = await open(page)
    await root.getByTestId('mcp-approval-approve').click()
    await expect(root.getByTestId('mcp-approval-outcome')).toContainText('Sistem bakımda')
  })

  test('failed: kod → i18n ileti + destek kodu; unknown_outcome: "Sonuç belirsiz" + Ekranda aç', async ({ page }) => {
    await installMcpMocks(page, ['approval-failed'])
    let root = await open(page)
    let outcome = root.getByTestId('mcp-approval-outcome')
    await expect(outcome).toContainText('İşlem tamamlanamadı')
    await expect(outcome).toContainText('Çok fazla istek gönderildi')
    await expect(outcome).toContainText('Destek kodu: apr-e2e-1')

    await installMcpMocks(page, ['approval-unknown'])
    root = await open(page)
    outcome = root.getByTestId('mcp-approval-outcome')
    await expect(outcome).toContainText('Sonuç belirsiz, ekrandan kontrol edin.')
    await expect(outcome.getByTestId('mcp-approval-open-in')).toBeVisible()
  })

  test('geçici karar hatası: önizleme ve düğmeler kalır, satır içi ileti + destek kodu', async ({ page }) => {
    await installMcpMocks(page, ['approval-pending', { 'approval.decide': { status: 500, body: { error: 'stack at x', code: 'INTERNAL', requestId: 'req_e2e_500' } } }])
    const root = await open(page)
    await root.getByTestId('mcp-approval-approve').click()
    await expect(root.getByTestId('mcp-approval-error')).toContainText('Kararınız kaydedilemedi.')
    await expect(root.getByTestId('mcp-approval-error')).toContainText('Destek kodu: req_e2e_500')
    await expect(root).not.toContainText('stack')
    await expect(root.getByTestId('mcp-approval-approve')).toBeEnabled()
  })

  test('geri sayım sıfıra inince sayfa "süresi doldu" durumuna geçer (düğmeler kalkar)', async ({ page }) => {
    await page.clock.install()
    await installMcpMocks(page, [{ 'approval.get': () => ({ status: 200, body: approvalView({ expiresAt: new Date(Date.now() + 90_000).toISOString() }) }) }])
    const root = await open(page)
    await expect(root.getByTestId('mcp-approval-announce')).toHaveText('') // > 60 sn: duyuru yok
    await page.clock.runFor(35_000)
    await expect(root.getByTestId('mcp-approval-announce')).toHaveText('Onay isteğinin süresinin dolmasına bir dakikadan az kaldı.')
    await page.clock.runFor(60_000)
    await expect(root.getByTestId('mcp-approval-outcome')).toHaveAttribute('data-phase', 'expired')
    await expect(root.getByTestId('mcp-approval-approve')).toHaveCount(0)
  })

  test('oturum yok → girişe redirect ile; klavye: başlık → Reddet → onay düğmesi → Enter', async ({ page }) => {
    await installMcpMocks(page, ['approval-pending'], { overrides: { checkAuthentication: false } })
    await page.goto('/approve/apr-e2e-1')
    await page.waitForURL(/\/login\?redirect=/)
    expect(decodeURIComponent(new URL(page.url()).searchParams.get('redirect') ?? '')).toBe('/approve/apr-e2e-1')

    const calls = await installMcpMocks(page, ['approval-pending'])
    const root = await open(page)
    await expect(root.getByRole('heading', { level: 1 })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(root.getByTestId('mcp-approval-reject')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(root.getByTestId('mcp-approval-approve')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(root.getByTestId('mcp-approval-outcome')).toHaveAttribute('data-phase', 'executed')
    expect(calls.some((c) => c.method === 'POST')).toBe(true)
  })

  test('axe AA = 0 (light + dark) pending ve sonuç; yatay taşma yok; görsel taban (pending)', async ({ page }) => {
    await installMcpMocks(page, ['approval-pending', { 'approval.get': () => ({ status: 200, body: approvalView({ expiresAt: new Date(Date.now() + 9 * 60_000).toISOString() }) }) }])
    const root = await open(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const fmt = (r: any) => JSON.stringify(r.violations.map((v: any) => [v.id, v.nodes.map((n: any) => n.target)]))
    let res = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(res.violations, fmt(res)).toEqual([])
    await expect(page).toHaveScreenshot('mcp-approval-pending.png', { fullPage: true, animations: 'disabled', mask: [root.getByTestId('mcp-approval-timer')] })
    await forceDarkTheme(page)
    res = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(res.violations, fmt(res)).toEqual([])
    await root.getByTestId('mcp-approval-approve').click()
    await expect(root.getByTestId('mcp-approval-outcome')).toBeVisible()
    res = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(res.violations, fmt(res)).toEqual([])
  })
})
