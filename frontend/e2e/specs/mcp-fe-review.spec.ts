// MCP-6 — inceleme görüntüleri (frontend/docs/mcp-fe-review/, 1440 + 390). İddia yok; yalnız görüntü üretir.
// Günlük koşuda ATLANIR.
//   MCP_REVIEW=1 MCP_WIDTH=1440|390 npx playwright test e2e/specs/mcp-fe-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop
import { test, type Page } from '@playwright/test'
import { forceDarkTheme, installMcpMocks, openBarePage, openMcpScreen } from '../fixtures/mcp'
import { approvalView } from '../../src/mocks/mcp'

const ENABLED = process.env.MCP_REVIEW === '1'
const WIDTH = Number(process.env.MCP_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.MCP_OUT || 'docs/mcp-fe-review'

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}-${WIDTH}.png`, fullPage: true, animations: 'disabled' })
}

test.describe('MCP-6 inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'MCP_REVIEW=1 ile çalışır')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  test('S1 onay ekranı', async ({ page }) => {
    await installMcpMocks(page, ['consent-known-single'])
    await openBarePage(page, '/oauth/consent?req=req-e2e-1', '.OAuthConsentView [data-testid="mcp-consent"]')
    await shot(page, 's1-onay-bilinen-tek')
    await installMcpMocks(page, ['consent-unknown-multi'])
    await openBarePage(page, '/oauth/consent?req=req-e2e-2', '.OAuthConsentView [data-testid="mcp-consent"]')
    await page.locator('.OAuthConsentView').getByRole('radio', { name: /Deniz Butik/ }).check()
    await shot(page, 's1-onay-dogrulanmamis-coklu')
    await installMcpMocks(page, ['consent-expired'])
    await openBarePage(page, '/oauth/consent?req=x', '.OAuthConsentView [data-testid="mcp-consent-expired"]')
    await shot(page, 's1-onay-suresi-dolmus')
  })

  test('S2 işlem onayı', async ({ page }) => {
    await installMcpMocks(page, ['approval-pending', { 'approval.get': () => ({ status: 200, body: approvalView({ expiresAt: new Date(Date.now() + 8 * 60_000 + 30_000).toISOString() }) }) }])
    await openBarePage(page, '/approve/apr-e2e-1', '.McpApprovalView [data-testid="mcp-action-preview"]')
    const root = page.locator('.McpApprovalView')
    await shot(page, 's2-islem-onayi-bekliyor')
    await forceDarkTheme(page)
    await shot(page, 's2-islem-onayi-bekliyor-koyu')
    await page.reload()
    await page.locator('.McpApprovalView [data-testid="mcp-action-preview"]').waitFor()
    await root.getByTestId('mcp-approval-approve').click()
    await root.getByTestId('mcp-approval-outcome').waitFor()
    await shot(page, 's2-islem-onayi-tamamlandi')
    await installMcpMocks(page, ['approval-live-readonly'])
    await openBarePage(page, '/approve/apr-e2e-1', '.McpApprovalView [data-testid="mcp-action-preview"]')
    const r2 = page.locator('.McpApprovalView')
    await r2.getByTestId('mcp-approval-approve').click()
    await r2.getByTestId('mcp-approval-outcome').waitFor()
    await shot(page, 's2-islem-onayi-salt-okuma')
    await installMcpMocks(page, ['approval-expired'])
    await openBarePage(page, '/approve/apr-e2e-1', '.McpApprovalView [data-testid="mcp-approval-outcome"]')
    await shot(page, 's2-islem-onayi-suresi-dolmus')
  })

  test('S3 bağlı uygulamalar', async ({ page }) => {
    await installMcpMocks(page, ['connections-many'])
    let root = await openMcpScreen(page, 'apps')
    await root.getByTestId('mcp-guide-toggle').click()
    await shot(page, 's3-bagli-uygulamalar-dolu')
    await root.getByRole('tab', { name: 'Mağazadaki tüm bağlantılar' }).click()
    await root.getByTestId('mcp-connections').waitFor()
    await shot(page, 's3-bagli-uygulamalar-magaza-sekmesi')
    // Koyu tema: müşteri uygulamasında seçici kapalı (FR2-DARK); axe koyu denetimiyle aynı zorlanmış tema.
    await forceDarkTheme(page)
    await shot(page, 's3-bagli-uygulamalar-magaza-sekmesi-koyu')
    await installMcpMocks(page, ['connections-empty'], { role: 'operator' })
    root = await openMcpScreen(page, 'apps')
    await root.getByTestId('mcp-empty').waitFor()
    await shot(page, 's3-bagli-uygulamalar-bos-operator')
  })

  test('S4 yapay zekâ bağlantısı ayarı', async ({ page }) => {
    await installMcpMocks(page, ['settings-owner-off'])
    let root = await openMcpScreen(page, 'settings')
    await root.getByRole('radio', { name: /Okuma \+ işlem önerme/ }).check()
    await shot(page, 's4-ayar-sahip-acma')
    await installMcpMocks(page, ['settings-owner-outdated'])
    root = await openMcpScreen(page, 'settings')
    await shot(page, 's4-ayar-sahip-metin-guncellendi')
    await installMcpMocks(page, ['settings-admin-readonly'], { role: 'admin' })
    root = await openMcpScreen(page, 'settings')
    await shot(page, 's4-ayar-yonetici-salt-okuma')
  })
})
