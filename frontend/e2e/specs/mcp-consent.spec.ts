// MCP-6 S1 — OAuth onay ekranı (MCP_UI_CONTRACT §2, §8 "Playwright (mock)"). Mock senaryoları src/mocks/mcp.ts (§7).
// Kapsam: bilinen/bilinmeyen istemci, çoklu mağaza seçimi, `off` mağaza devre dışı, yazma kutusu varsayılan boş,
// izin ver/reddet yönlendirmesi (yalnız backend `redirectTo`), süresi dolmuş, destek oturumu, uygun mağaza yok,
// oturum yokken giriş dönüşü, klavye akışı, axe AA (light + dark), yatay taşma yok, görsel taban.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { AXE_TAGS, forceDarkTheme, installMcpMocks, openBarePage } from '../fixtures/mcp'

const ROOT = '.OAuthConsentView'
const CALLBACK = 'https://connector.ornek-asistan.invalid/oauth/callback'

/** Dış istemciye yönlendirme: `.invalid` çözülmez → sahte sayfa ile karşılanır, varılan URL doğrulanır. */
async function stubCallback(page: Page) {
  await page.route(/^https:\/\/connector\.ornek-asistan\.invalid\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>istemci</title><p>istemci geri dönüşü</p>' }),
  )
}

async function open(page: Page, req = 'req-e2e-1') {
  return openBarePage(page, `/oauth/consent?req=${req}`, ROOT)
}

test.describe('MCP-6 S1 — onay (consent) ekranı', () => {
  test('bilinen istemci, tek mağaza: başlık odakta, tanınan çipi, yönlendirme adresi, yazma kutusu işaretsiz → izin ver yalnız redirectTo', async ({ page }) => {
    const calls = await installMcpMocks(page, ['consent-known-single'])
    await stubCallback(page)
    const root = await open(page)

    const heading = root.getByRole('heading', { level: 1 })
    await expect(heading).toContainText('Örnek Asistan Entegrasyonik hesabınıza erişmek istiyor')
    await expect(heading).toBeFocused()
    await expect(root.getByText('Tanınan uygulama')).toBeVisible()
    await expect(root.getByTestId('mcp-consent-unverified')).toHaveCount(0)
    await expect(root.getByTestId('mcp-consent-host')).toHaveText('connector.ornek-asistan.invalid')
    await expect(root.getByText('Deniz Butik')).toBeVisible()
    await expect(root.getByRole('radio')).toHaveCount(0) // tek mağaza → salt metin
    const write = root.getByRole('checkbox', { name: /İşlem önerme/ })
    await expect(write).toBeVisible()
    await expect(write).not.toBeChecked()
    await expect(root.getByText('Kişisel veriler (ad, adres, telefon) maskelenir.')).toBeVisible()
    await expect(root.getByTestId('mcp-consent-allow')).toBeEnabled()

    await root.getByTestId('mcp-consent-allow').click()
    await page.waitForURL(/connector\.ornek-asistan\.invalid\/oauth\/callback\?code=e2e-code/)
    const decision = calls.find((c) => c.method === 'POST')!
    expect(decision.path).toBe('oauth/requests/req-e2e-1/decision')
    expect(decision.body).toEqual({ approve: true, tid: 101, scopes: ['mcp:read'] })
  })

  test('bilinmeyen istemci, çoklu mağaza: uyarı, off mağaza devre dışı + sahip bağlantısı, seçimsiz İzin ver pasif, yazma yalnız uygun mağazada', async ({ page }) => {
    const calls = await installMcpMocks(page, ['consent-unknown-multi'])
    await stubCallback(page)
    const root = await open(page, 'req-e2e-2')

    await expect(root.getByTestId('mcp-consent-unverified')).toContainText('Bu uygulama doğrulanmadı')
    await expect(root.getByText('Tanınan uygulama')).toHaveCount(0)
    await expect(root.getByTestId('mcp-consent-host')).toHaveText('notlar.deneme-uygulama.invalid')

    const radios = root.getByRole('radio')
    await expect(radios).toHaveCount(3)
    const off = root.getByRole('radio', { name: /Ada Kırtasiye/ })
    await expect(off).toBeDisabled()
    await expect(root.locator('[data-tid="103"]')).toContainText('Bu mağazada yapay zekâ bağlantısı kapalı')
    await expect(root.locator('[data-tid="103"]').getByRole('link', { name: 'Ayarı aç' })).toHaveAttribute('href', '/settings/ai-connection')

    const allow = root.getByTestId('mcp-consent-allow')
    await expect(allow).toBeDisabled()
    await expect(root.getByText('İzin vermek için önce bir mağaza seçin.')).toBeVisible()

    await root.getByRole('radio', { name: /Kuzey Ev Tekstili/ }).check()
    await expect(allow).toBeEnabled()
    await expect(root.getByTestId('mcp-consent-write')).toHaveCount(0) // read mağaza → yazma yok

    await root.getByRole('radio', { name: /Deniz Butik/ }).check()
    const write = root.getByRole('checkbox', { name: /İşlem önerme/ })
    await expect(write).not.toBeChecked()
    await write.check()
    await allow.click()
    await page.waitForURL(/oauth\/callback\?code=/)
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ approve: true, tid: 101, scopes: ['mcp:read', 'mcp:write'] })
  })

  test('mağaza değişince yazma işareti sıfırlanır (başka mağazaya taşınmaz)', async ({ page }) => {
    await installMcpMocks(page, ['consent-unknown-multi'])
    const root = await open(page, 'req-e2e-2')
    await root.getByRole('radio', { name: /Deniz Butik/ }).check()
    await root.getByRole('checkbox', { name: /İşlem önerme/ }).check()
    await root.getByRole('radio', { name: /Kuzey Ev Tekstili/ }).check()
    await root.getByRole('radio', { name: /Deniz Butik/ }).check()
    await expect(root.getByRole('checkbox', { name: /İşlem önerme/ })).not.toBeChecked()
  })

  test('reddet: gövde yalnız approve:false, backend redirectTo (hata parametresiyle) izlenir', async ({ page }) => {
    const calls = await installMcpMocks(page, ['consent-known-single'])
    await stubCallback(page)
    const root = await open(page)
    await root.getByTestId('mcp-consent-deny').click()
    await page.waitForURL(`${CALLBACK}?error=access_denied&state=e2e-state`)
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ approve: false })
  })

  test('süresi dolmuş istek ve 404 → yeniden bağlanın iletisi; düğme yok', async ({ page }) => {
    await installMcpMocks(page, ['consent-expired'])
    const root = await open(page)
    await expect(root.getByTestId('mcp-consent-expired')).toContainText('Bu bağlantı isteğinin süresi doldu. Yapay zekâ uygulamanıza dönüp yeniden bağlanın.')
    await expect(root.getByTestId('mcp-consent-allow')).toHaveCount(0)

    await installMcpMocks(page, [{}]) // tanımsız uç → 404 NOT_FOUND
    await page.goto('/oauth/consent?req=yok')
    await expect(page.locator(ROOT).getByTestId('mcp-consent-expired')).toBeVisible()
  })

  test('destek (impersonation) oturumu → "Destek oturumunda uygulama bağlanamaz."', async ({ page }) => {
    await installMcpMocks(page, ['consent-impersonation'])
    const root = await open(page)
    await expect(root.getByTestId('mcp-consent-impersonation')).toContainText('Destek oturumunda uygulama bağlanamaz.')
    await expect(root).not.toContainText('403')
  })

  test('uygun mağaza yok: açıklama, İzin ver YOK, yalnız Reddet', async ({ page }) => {
    await installMcpMocks(page, ['consent-no-eligible'])
    const root = await open(page)
    await expect(root.getByRole('radio')).toHaveCount(2)
    await expect(root.getByRole('radio', { name: /Deniz Butik/ })).toBeDisabled()
    await expect(root.getByText('Bu mağazada yapay zekâ bağlantısı kapalı', { exact: false }).first()).toBeVisible()
    await expect(root.getByTestId('mcp-consent-allow')).toHaveCount(0)
    await expect(root.getByTestId('mcp-consent-deny')).toBeVisible()
  })

  test('karar hatası: satır içi ileti + destek kodu, düğmeler yeniden etkin (çift gönderim yok)', async ({ page }) => {
    let posts = 0
    await installMcpMocks(page, [
      'consent-known-single',
      {
        'consent.decide': () => {
          posts += 1
          return { status: 429, body: { error: 'x', code: 'RATE_LIMITED', requestId: 'req_e2e_rl' } }
        },
      },
    ])
    const root = await open(page)
    await root.getByTestId('mcp-consent-allow').dblclick()
    await expect(root.getByTestId('mcp-consent-error')).toContainText('Çok fazla istek gönderildi')
    await expect(root.getByTestId('mcp-consent-error')).toContainText('Destek kodu: req_e2e_rl')
    expect(posts).toBe(1)
    await expect(root.getByTestId('mcp-consent-allow')).toBeEnabled()
  })

  test('oturum yok → giriş sayfasına redirect ile gider', async ({ page }) => {
    await installMcpMocks(page, ['consent-known-single'], { overrides: { checkAuthentication: false } })
    await page.goto('/oauth/consent?req=req-e2e-1')
    await page.waitForURL(/\/login\?redirect=/)
    expect(decodeURIComponent(new URL(page.url()).searchParams.get('redirect') ?? '')).toBe('/oauth/consent?req=req-e2e-1')
  })

  test('klavye: başlıktan sekmeyle mağaza → ayar bağlantısı → yazma → Reddet → İzin ver; Enter ile gönderim', async ({ page }) => {
    const calls = await installMcpMocks(page, ['consent-unknown-multi'])
    await stubCallback(page)
    const root = await open(page, 'req-e2e-2')
    await expect(root.getByRole('heading', { level: 1 })).toBeFocused()
    // İlk odaklanabilir radyo (grup içinde ok tuşlarıyla gezilir).
    await page.keyboard.press('Tab')
    await expect(root.getByRole('radio', { name: /Deniz Butik/ })).toBeFocused()
    await page.keyboard.press('Space')
    await expect(root.getByRole('radio', { name: /Deniz Butik/ })).toBeChecked()
    // Kapalı mağaza satırındaki "Ayarı aç" bağlantısı (sahip) klavyeyle erişilebilir.
    await page.keyboard.press('Tab')
    await expect(root.getByRole('link', { name: 'Ayarı aç' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(root.getByRole('checkbox', { name: /İşlem önerme/ })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(root.getByTestId('mcp-consent-deny')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(root.getByTestId('mcp-consent-allow')).toBeFocused()
    await page.keyboard.press('Enter')
    await page.waitForURL(/oauth\/callback\?code=/)
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ approve: true, tid: 101, scopes: ['mcp:read'] })
  })

  test('axe AA = 0 (light + dark), yatay taşma yok, görsel taban', async ({ page }) => {
    await installMcpMocks(page, ['consent-unknown-multi'])
    const root = await open(page, 'req-e2e-2')
    await root.getByRole('radio', { name: /Deniz Butik/ }).check()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)

    const light = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(light.violations, JSON.stringify(light.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([])

    await expect(page).toHaveScreenshot('mcp-consent.png', { fullPage: true, animations: 'disabled' })

    await forceDarkTheme(page)
    const dark = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(dark.violations, JSON.stringify(dark.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([])
  })
})
