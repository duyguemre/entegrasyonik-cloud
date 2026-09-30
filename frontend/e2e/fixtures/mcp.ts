// MCP-6 (ADR-0035) — MCP ekranlarının Playwright yardımcıları. Yanıtlar `src/mocks/mcp.ts` senaryolarından (§4 tip
// denetimli, §7 adları) gelir; ağ katmanı `installApiMocks` (uygulama açılışı) + ÜSTÜNE `oauth/**` ve `mcp/**` için
// yöntem + sorgu duyarlı ikinci bir route (Playwright'ta sonra kaydedilen route önce çalışır).
// Sentetik veri (Protokol 7): PII yok, alan adları `.invalid`.
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { installApiMocks, type MockValue } from './mockApi'
import { userContextFixture } from './apiData'
import { menuFixture, waitForWorkplaceReady } from './nav'
import { MCP_MOCK_SCENARIOS, resolveMcpMock, type McpMockScenario, type McpMockScenarioName } from '../../src/mocks/mcp'

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** Rol → `userContext` (profil DTO alanları: owner / roleCode). Sahip = varsayılan fixture. */
export const MCP_USERS = {
  owner: { ...userContextFixture, owner: true, roleCode: 'ROLE_OWNER' },
  admin: { ...userContextFixture, _id: 'user-e2e-admin', username: 'yonetici@entegrasyonik-e2e.invalid', owner: false, roleCode: 'ROLE_ADMIN' },
  operator: { ...userContextFixture, _id: 'user-e2e-op', username: 'operasyon@entegrasyonik-e2e.invalid', owner: false, roleCode: 'ROLE_USER' },
} as const
export type McpRoleName = keyof typeof MCP_USERS

/** `menuFixture` + S3 (hesap) + S4 (ayarlar → yapay zekâ bağlantısı). Derin bağlantı çözümü menü ağacında arar. */
export const menuFixtureWithMcp = [
  ...menuFixture,
  {
    group: 'system',
    links: [
      { code: 'ConnectedAppsView', parent: '', title: 'connectedApps', icon: 'mdi-connection', singleton: true },
      {
        code: 'settings',
        parent: '',
        title: 'settings',
        icon: 'mdi-cog-outline',
        children: [{ code: 'AiConnectionView', parent: 'settings', title: 'aiConnection', icon: 'mdi-robot-outline', singleton: true }],
      },
    ],
  },
]

export interface McpCall {
  method: string
  path: string
  body: unknown
}

/**
 * Uygulama açılışı + MCP uçları. `scenarios`: birleştirilecek senaryo adları (soldan sağa; sonraki üstün) ya da
 * hazır nesne; `overrides`: ek `installApiMocks` anahtarları. Dönen dizi yapılan MCP çağrılarını kaydeder.
 */
export async function installMcpMocks(
  page: Page,
  scenarios: Array<McpMockScenarioName | McpMockScenario>,
  opts: { role?: McpRoleName; overrides?: Record<string, MockValue> } = {},
): Promise<McpCall[]> {
  const merged: McpMockScenario = Object.assign(
    {},
    ...scenarios.map((s) => (typeof s === 'string' ? MCP_MOCK_SCENARIOS[s] : s)),
  )
  await installApiMocks(page, {
    MenuService: menuFixtureWithMcp,
    userContext: MCP_USERS[opts.role ?? 'owner'],
    ...opts.overrides,
  })
  const calls: McpCall[] = []
  await page.route(/\/api\/(oauth|mcp)\//, async (route) => {
    const req = route.request()
    const method = req.method()
    const origin = (await req.headerValue('origin')) ?? '*'
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'content-type,authorization,idempotency-key',
    }
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' })
    const url = new URL(req.url())
    const path = url.pathname.replace(/^\/api\//, '') + url.search
    let body: unknown = null
    try {
      body = req.postDataJSON()
    } catch {
      body = null
    }
    calls.push({ method, path, body })
    const reply = resolveMcpMock(merged, method, path, body)
    if (!reply) {
      // eslint-disable-next-line no-console
      console.warn(`[mcpMocks] Eşlenmemiş MCP çağrısı: ${method} ${path}`)
      return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ error: 'yok', code: 'NOT_FOUND', requestId: 'req_e2e_unmapped' }) })
    }
    if (reply.status === 204) return route.fulfill({ status: 204, headers, body: '' })
    return route.fulfill({ status: reply.status, contentType: 'application/json', headers, body: JSON.stringify(reply.body) })
  })
  return calls
}

/** S3/S4: derin bağlantıyla kabuk içinde açar ve etkin sekmeyi bekler. */
export async function openMcpScreen(page: Page, which: 'apps' | 'settings') {
  const def = which === 'apps' ? { slug: 'account/connected-apps', root: '.connectedAppsView' } : { slug: 'settings/ai-connection', root: '.aiConnectionView' }
  await page.goto(`/${def.slug}`)
  await waitForWorkplaceReady(page)
  const root = page.locator(`${def.root}:not(.hide-tab-component)`)
  await expect(root).toBeVisible({ timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
  return root
}

/** S1/S2: sade kabuk sayfası (menü yok). */
export async function openBarePage(page: Page, path: string, root: string) {
  await page.goto(path)
  const loc = page.locator(root)
  await expect(loc).toBeVisible({ timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
  return loc
}

/**
 * Koyu tema (axe dark): müşteri uygulamasında tema seçici kapalı (FR2-DARK) ama `darkTheme` kayıtlı; Vuetify teması
 * çalışma anında `darkTheme`'e alınır + `html[data-theme=dark]` (statik token katmanı). Uygulama kodu değişmez.
 */
export async function forceDarkTheme(page: Page) {
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any)?.__vue_app__
    const theme = app?.config?.globalProperties?.$vuetify?.theme
    if (theme?.global?.name) theme.global.name.value = 'darkTheme'
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.classList.add('ek-dark')
    document.documentElement.style.colorScheme = 'dark'
  })
  await page.waitForTimeout(300)
}

/** `navigator.clipboard` izinleri (kopyala düğmesi). */
export async function grantClipboard(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined)
}
