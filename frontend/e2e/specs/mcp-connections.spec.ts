// MCP-6 S3 — Bağlı uygulamalar (MCP_UI_CONTRACT §5, §8). Mock senaryoları src/mocks/mcp.ts (§7).
// Kapsam: listele (uygulama + tanınan çipi + host, mağaza, izin çipleri, göreli son kullanım), bekleyen onaylar → S2,
// kes (onay diyaloğu, iyimser değil, toast, odak dönüşü), tenant sekmesi YALNIZ sahip/yönetici (operatör görmez),
// Tümünü kes (sayı), boş durum → "Nasıl bağlanırım?" açılır, bağlantı adresi kopyala (aria-live), erişim kapalı uyarısı,
// yükleme hatası, axe AA (light + dark), yatay taşma yok, görsel taban (dolu).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { AXE_TAGS, forceDarkTheme, grantClipboard, installMcpMocks, openMcpScreen } from '../fixtures/mcp'
import { mcpSettings } from '../../src/mocks/mcp'

test.describe('MCP-6 S3 — Bağlı uygulamalar', () => {
  test('dolu: bağlantılarım tablosu, bekleyen onay kartı S2 bağlantısı, izin çipleri, hiç kullanılmadı', async ({ page }) => {
    const calls = await installMcpMocks(page, ['connections-many'])
    const root = await openMcpScreen(page, 'apps')
    await expect(root.getByRole('heading', { level: 1, name: 'Bağlı uygulamalar' })).toBeVisible()

    const table = root.getByTestId('mcp-connections')
    await expect(table.locator('tbody tr')).toHaveCount(2)
    const first = table.locator('tbody tr').first()
    await expect(first).toContainText('Örnek Asistan')
    await expect(first.getByRole('img', { name: 'Tanınan uygulama' })).toBeVisible()
    await expect(first).toContainText('connector.ornek-asistan.invalid')
    await expect(first).toContainText('Deniz Butik')
    await expect(first).toContainText('Okuma')
    await expect(first).toContainText('İşlem önerme')
    await expect(first).toContainText('dk önce')
    const second = table.locator('tbody tr').nth(1)
    await expect(second.getByTestId('mcp-known')).toHaveCount(0)
    await expect(second).not.toContainText('İşlem önerme')
    await expect(second).toContainText('Hiç kullanılmadı')
    // scope=me'de kullanıcı sütunu yok
    await expect(table.getByRole('columnheader', { name: 'Kullanıcı' })).toHaveCount(0)

    const pending = root.getByTestId('mcp-pending')
    await expect(pending).toContainText('Onay bekleyen işlemler')
    await expect(pending).toContainText('12 sipariş “Onaylandı” durumuna geçecek')
    await pending.getByRole('button', { name: /İncele/ }).click()
    await expect(page).toHaveURL(/\/approve\/apr-e2e-1$/)
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(expect.arrayContaining(['GET mcp/connections?scope=me', 'GET mcp/approvals?status=pending', 'GET mcp/settings']))
  })

  test('kes: onay diyaloğu (uygulama adıyla), yanıttan SONRA listeden düşer, bildirim; vazgeç odağı geri verir', async ({ page }) => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    await installMcpMocks(page, ['connections-many'])
    // DELETE yanıtı bekletilir: iyimser silme yoksa satır yanıt gelene dek kalır.
    await page.route(/\/api\/mcp\/connections\/fam-e2e-1$/, async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      await gate
      const origin = (await route.request().headerValue('origin')) ?? '*'
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }, body: '' })
    })
    const root = await openMcpScreen(page, 'apps')
    const rows = root.getByTestId('mcp-connections').locator('tbody tr')

    const revokeBtn = rows.first().getByRole('button', { name: 'Örnek Asistan bağlantısını kes' })
    await revokeBtn.click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Bağlantı kesilsin mi?')
    await expect(dialog).toContainText('Örnek Asistan artık hesabınıza erişemeyecek.')
    await dialog.getByRole('button', { name: /Vazgeç|İptal/ }).click()
    await expect(dialog).toBeHidden()
    await expect(revokeBtn).toBeFocused()

    await revokeBtn.click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Bağlantıyı kes' }).click()
    await page.waitForTimeout(300)
    await expect(rows).toHaveCount(2) // iyimser değil
    release()
    await expect(rows).toHaveCount(1)
    await expect(page.getByText('Örnek Asistan bağlantısı kesildi.')).toBeVisible()
  })

  test('kes hatası: diyalog açık kalır, satır içi ileti; satır listede kalır', async ({ page }) => {
    await installMcpMocks(page, ['connections-many', { 'connections.revoke': { status: 403, body: { error: 'x', code: 'FORBIDDEN', requestId: 'req_f' } } }])
    const root = await openMcpScreen(page, 'apps')
    const rows = root.getByTestId('mcp-connections').locator('tbody tr')
    await rows.first().getByRole('button', { name: /bağlantısını kes/ }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Bağlantıyı kes' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('Bağlantı kesilemedi. Bu işlem için yetkiniz yok')
    await expect(rows).toHaveCount(2)
  })

  test('sahip: tenant sekmesi (kullanıcı sütunu) + Tümünü kes (sayı gösterilir, istek gider)', async ({ page }) => {
    const calls = await installMcpMocks(page, ['connections-many'], { role: 'owner' })
    const root = await openMcpScreen(page, 'apps')
    await root.getByRole('tab', { name: 'Mağazadaki tüm bağlantılar' }).click()
    const table = root.getByTestId('mcp-connections')
    await expect(table.locator('tbody tr')).toHaveCount(3)
    await expect(table.getByRole('columnheader', { name: 'Kullanıcı' })).toBeVisible()
    await expect(table).toContainText('operasyon@entegrasyonik-e2e.invalid')

    await root.getByTestId('mcp-revoke-all').click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Mağazadaki tüm bağlantılar kesilsin mi?')
    await expect(dialog).toContainText('3 bağlantı kesilecek.')
    await dialog.getByRole('button', { name: 'Tümünü kes' }).click()
    await expect(page.getByText('3 bağlantı kesildi.')).toBeVisible()
    expect(calls.some((c) => c.method === 'POST' && c.path === 'mcp/connections/revoke-all')).toBe(true)
  })

  test('yönetici: tenant sekmesi ve Tümünü kes görünür; operatör: YOK, yalnız kendi bağlantıları istenir', async ({ page }) => {
    await installMcpMocks(page, ['connections-many'], { role: 'admin' })
    let root = await openMcpScreen(page, 'apps')
    await expect(root.getByRole('tab', { name: 'Mağazadaki tüm bağlantılar' })).toBeVisible()

    const calls = await installMcpMocks(page, ['connections-many'], { role: 'operator' })
    root = await openMcpScreen(page, 'apps')
    await expect(root.getByTestId('mcp-connections').locator('tbody tr')).toHaveCount(2)
    await expect(root.getByRole('tab')).toHaveCount(0)
    await expect(root.getByTestId('mcp-revoke-all')).toHaveCount(0)
    expect(calls.some((c) => c.path.includes('scope=tenant'))).toBe(false)
  })

  test('boş durum → "Nasıl bağlanırım?" açılır; 3 adım + adres kopyala (aria-live "Kopyalandı")', async ({ page }) => {
    await grantClipboard(page)
    await installMcpMocks(page, ['connections-empty'])
    const root = await openMcpScreen(page, 'apps')
    await expect(root.getByTestId('mcp-empty')).toContainText('Henüz bağlı uygulama yok')
    const toggle = root.getByTestId('mcp-guide-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await root.getByTestId('mcp-empty').getByRole('button', { name: 'Nasıl bağlanırım?' }).click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toBeFocused()
    const guide = root.getByTestId('mcp-guide')
    await expect(guide.getByRole('listitem')).toHaveCount(3)
    await expect(guide.getByTestId('mcp-server-url')).toHaveValue('https://api.entegrasyonik.invalid/mcp')
    await guide.getByTestId('mcp-copy').click()
    await expect(guide.getByTestId('mcp-copy-status')).toHaveText('Kopyalandı')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://api.entegrasyonik.invalid/mcp')
  })

  test('tenant erişimi kapalı: adımlar yerine uyarı; sahip ayara gider, operatör bağlantı görmez', async ({ page }) => {
    await installMcpMocks(page, ['connections-empty', { 'settings.get': { status: 200, body: mcpSettings({ access: 'off', canEdit: true }) } }], { role: 'owner' })
    let root = await openMcpScreen(page, 'apps')
    await root.getByTestId('mcp-guide-toggle').click()
    await expect(root.getByTestId('mcp-guide')).toContainText('Bu mağazada yapay zekâ bağlantısı kapalı')
    await expect(root.getByTestId('mcp-guide').getByRole('listitem')).toHaveCount(0)
    await root.getByTestId('mcp-guide').getByRole('button', { name: 'Yapay zekâ bağlantısı ayarı' }).click()
    await expect(page).toHaveURL(/\/settings\/ai-connection$/)

    await installMcpMocks(page, ['connections-empty', { 'settings.get': { status: 200, body: mcpSettings({ access: 'off', canEdit: false }) } }], { role: 'operator' })
    root = await openMcpScreen(page, 'apps')
    await root.getByTestId('mcp-guide-toggle').click()
    await expect(root.getByTestId('mcp-guide')).toContainText('Mağaza sahibi açtığında')
    await expect(root.getByTestId('mcp-guide').getByRole('button')).toHaveCount(0)
  })

  test('liste yüklenemezse sorun durumu + Tekrar dene; ham hata sızmaz', async ({ page }) => {
    await installMcpMocks(page, ['connections-many', { 'connections.me': { status: 500, body: { error: 'stack trace x', code: 'INTERNAL', requestId: 'req_e2e_500' } } }])
    const root = await openMcpScreen(page, 'apps')
    await expect(root.getByText('Bağlantılar yüklenemedi')).toBeVisible()
    await expect(root.getByRole('button', { name: /Tekrar dene/ })).toBeVisible()
    await expect(root).not.toContainText('stack trace')
  })

  test('axe AA = 0 (light + dark), yatay taşma yok, görsel taban (dolu)', async ({ page }) => {
    await installMcpMocks(page, ['connections-many'])
    const root = await openMcpScreen(page, 'apps')
    await root.getByTestId('mcp-guide-toggle').click()
    await expect(root.getByTestId('mcp-guide')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const fmt = (r: any) => JSON.stringify(r.violations.map((v: any) => [v.id, v.nodes.map((n: any) => n.target)]))
    let res = await new AxeBuilder({ page }).include('.connectedAppsView:not(.hide-tab-component)').withTags(AXE_TAGS).analyze()
    expect(res.violations, fmt(res)).toEqual([])
    await expect(page).toHaveScreenshot('mcp-connections.png', { fullPage: true, animations: 'disabled', mask: [root.locator('.ek-apps-pending__meta')] })
    await forceDarkTheme(page)
    res = await new AxeBuilder({ page }).include('.connectedAppsView:not(.hide-tab-component)').withTags(AXE_TAGS).analyze()
    expect(res.violations, fmt(res)).toEqual([])
  })
})
