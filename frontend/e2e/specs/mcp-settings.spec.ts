// MCP-6 S4 — Yapay zekâ bağlantısı ayarı (MCP_UI_CONTRACT §6, §8). Mock senaryoları src/mocks/mcp.ts (§7).
// Kapsam: sahip kapalıdan okuma+yazmaya (aktarım onayı ZORUNLU; gövde acceptTextVersion), güncel olmayan metin bandı,
// yönetici/operatör salt-okuma (radyolar pasif, "yalnız mağaza sahibi"), off'a alırken bilgi notu, Vazgeç, kayıt hatası,
// durum kartı (erişim, aktif bağlantı, adres kopyala), axe AA (light + dark), yatay taşma yok, görsel taban (sahip).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { AXE_TAGS, forceDarkTheme, installMcpMocks, openMcpScreen } from '../fixtures/mcp'

const saveBar = (page: any) => page.locator('.ek-settings-template__save-bar')

test.describe('MCP-6 S4 — Yapay zekâ bağlantısı ayarı', () => {
  test('sahip, kapalı → okuma + işlem önerme: onay kutusu zorunlu, gövde {access, acceptTextVersion}, kayıt sonrası durum', async ({ page }) => {
    const calls = await installMcpMocks(page, ['settings-owner-off'])
    const root = await openMcpScreen(page, 'settings')
    await expect(root.getByRole('heading', { level: 1, name: 'Yapay zekâ bağlantısı' })).toBeVisible()
    const status = root.getByTestId('mcp-settings-status')
    await expect(status).toContainText('Kapalı')
    await expect(status).toContainText('0')
    await expect(root.getByTestId('mcp-settings-readonly')).toHaveCount(0)
    await expect(root.getByTestId('mcp-settings-accept')).toHaveCount(0) // off seçiliyken onay yok

    await root.getByRole('radio', { name: /Okuma \+ işlem önerme/ }).check()
    const accept = root.getByRole('checkbox', { name: /Okudum; mağaza verilerinin/ })
    await expect(accept).toBeVisible()
    await expect(accept).not.toBeChecked()
    await expect(root.getByText('Kaydetmek için bilgilendirmeyi onaylayın.')).toBeVisible()

    // Onaysız kaydet → istek GİTMEZ, ileti.
    await saveBar(page).getByRole('button', { name: 'Kaydet' }).click()
    await expect(root.getByTestId('mcp-settings-error')).toContainText('Kaydetmek için bilgilendirmeyi onaylayın.')
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0)

    await accept.check()
    await saveBar(page).getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Yapay zekâ bağlantısı ayarı kaydedildi.')).toBeVisible()
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.path).toBe('mcp/settings')
    expect(put.body).toEqual({ access: 'readwrite', acceptTextVersion: 'mcp-v1' })
    await expect(status).toContainText('Okuma + işlem önerme')
    await expect(saveBar(page)).toHaveCount(0)
    await expect(root.getByTestId('mcp-settings-accept')).toHaveCount(0) // onay güncel
    await expect(root).toContainText('Bilgilendirme')
  })

  test('güncel olmayan metin: uyarı bandı; açmak için yeniden onay gerekir', async ({ page }) => {
    await installMcpMocks(page, ['settings-owner-outdated'])
    const root = await openMcpScreen(page, 'settings')
    await expect(root.getByTestId('mcp-settings-outdated')).toContainText('Bilgilendirme metni güncellendi; bağlantılar yeniden onaylanana kadar kapalı.')
    await root.getByRole('radio', { name: /Yalnız okuma/ }).check()
    await expect(root.getByRole('checkbox', { name: /Okudum/ })).not.toBeChecked()
  })

  test('açıktan kapalıya: bilgi notu (askıya alınır), gövde {access:"off"}; Vazgeç geri alır', async ({ page }) => {
    const calls = await installMcpMocks(page, ['settings-owner-on'])
    const root = await openMcpScreen(page, 'settings')
    await expect(root.getByTestId('mcp-settings-status')).toContainText('Okuma + işlem önerme')
    await root.getByRole('radio', { name: /^Kapalı/ }).check()
    await expect(root.getByTestId('mcp-settings-off-note')).toContainText('Mevcut bağlantılar askıya alınır')
    await saveBar(page).getByRole('button', { name: 'Vazgeç' }).click()
    await expect(root.getByRole('radio', { name: /Okuma \+ işlem önerme/ })).toBeChecked()
    await expect(root.getByTestId('mcp-settings-off-note')).toHaveCount(0)

    await root.getByRole('radio', { name: /^Kapalı/ }).check()
    await saveBar(page).getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Yapay zekâ bağlantısı ayarı kaydedildi.')).toBeVisible()
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ access: 'off' })
  })

  test('yönetici: salt-okuma görünüm (radyolar pasif, onay kutusu yok, kaydet çubuğu yok)', async ({ page }) => {
    await installMcpMocks(page, ['settings-admin-readonly'], { role: 'admin' })
    const root = await openMcpScreen(page, 'settings')
    await expect(root.getByTestId('mcp-settings-readonly')).toContainText('Bu ayarı yalnız mağaza sahibi değiştirebilir.')
    for (const r of await root.getByRole('radio').all()) await expect(r).toBeDisabled()
    await expect(root.getByRole('radio', { name: /Yalnız okuma/ })).toBeChecked()
    await expect(root.getByTestId('mcp-settings-accept')).toHaveCount(0)
    await expect(saveBar(page)).toHaveCount(0)
    await expect(root.getByTestId('mcp-settings-notice')).toBeVisible()
  })

  test('operatör: ayarı görür (settings:read) ama değiştiremez; 403 okuma → yetki iletisi', async ({ page }) => {
    await installMcpMocks(page, ['settings-admin-readonly'], { role: 'operator' })
    let root = await openMcpScreen(page, 'settings')
    await expect(root.getByTestId('mcp-settings-readonly')).toBeVisible()

    await installMcpMocks(page, [{ 'settings.get': { status: 403, body: { error: 'x', code: 'FORBIDDEN', requestId: 'req_e2e_403' } } }], { role: 'operator' })
    root = await openMcpScreen(page, 'settings')
    await expect(root.getByText('Ayar yüklenemedi')).toBeVisible()
    await expect(root).toContainText('Bu işlem için yetkiniz yok')
  })

  test('kayıt hatası (impersonation): satır içi ileti + destek kodu; değişiklik korunur', async ({ page }) => {
    await installMcpMocks(page, ['settings-owner-on', { 'settings.save': { status: 403, body: { error: 'x', code: 'IMPERSONATION_FORBIDDEN', requestId: 'req_e2e_imp' } } }])
    const root = await openMcpScreen(page, 'settings')
    await root.getByRole('radio', { name: /Yalnız okuma/ }).check()
    await saveBar(page).getByRole('button', { name: 'Kaydet' }).click()
    await expect(root.getByTestId('mcp-settings-error')).toContainText('Destek oturumunda bu işlem yapılamaz.')
    await expect(root.getByTestId('mcp-settings-error')).toContainText('Destek kodu: req_e2e_imp')
    await expect(root.getByRole('radio', { name: /Yalnız okuma/ })).toBeChecked()
  })

  test('klavye: erişim seçenekleri ok tuşlarıyla, onay kutusu Space ile', async ({ page }) => {
    await installMcpMocks(page, ['settings-owner-off'])
    const root = await openMcpScreen(page, 'settings')
    await root.getByRole('radio', { name: /^Kapalı/ }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(root.getByRole('radio', { name: /Yalnız okuma/ })).toBeChecked()
    await page.keyboard.press('Tab')
    // Sıradaki odaklanabilir: bilgilendirme onay kutusu.
    await expect(root.getByRole('checkbox', { name: /Okudum/ })).toBeFocused()
    await page.keyboard.press('Space')
    await expect(root.getByRole('checkbox', { name: /Okudum/ })).toBeChecked()
  })

  test('axe AA = 0 (light + dark), yatay taşma yok, görsel taban (sahip)', async ({ page }) => {
    await installMcpMocks(page, ['settings-owner-off'])
    const root = await openMcpScreen(page, 'settings')
    await root.getByRole('radio', { name: /Okuma \+ işlem önerme/ }).check()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const fmt = (r: any) => JSON.stringify(r.violations.map((v: any) => [v.id, v.nodes.map((n: any) => n.target)]))
    let res = await new AxeBuilder({ page }).include('.aiConnectionView:not(.hide-tab-component)').withTags(AXE_TAGS).analyze()
    expect(res.violations, fmt(res)).toEqual([])
    await expect(page).toHaveScreenshot('mcp-settings-owner.png', { fullPage: true, animations: 'disabled' })
    await forceDarkTheme(page)
    res = await new AxeBuilder({ page }).include('.aiConnectionView:not(.hide-tab-component)').withTags(AXE_TAGS).analyze()
    expect(res.violations, fmt(res)).toEqual([])
  })
})
