/**
 * frontend/src/mocks/mcp.ts
 *
 * MCP-6 — `MCP_UI_CONTRACT.md` §7 mock senaryoları. Yanıtlar §4 tipleriyle (src/types/McpTypes.ts) TİP DENETİMLİDİR.
 * Tüketiciler:
 *   - Playwright (e2e/specs/mcp-*.spec.ts): `page.route` içinde `resolveMcpMock` ile.
 *   - Geliştirme sunucusu: `?mcpMock=<senaryo>` (yalnız `import.meta.env.DEV`; üretim paketine girmez — useMcpApi.ts).
 * Sentetik veri (Protokol 7): gerçek kişi/mağaza/uygulama adı YOK; alan adları `.invalid`. Hedef yapay zekâ
 * uygulamalarının ürün adları yazılmaz (sözleşme "Kapsam dışı" + K07) — istemci adları uydurmadır.
 */
import type {
  ApprovalList,
  ApprovalView,
  ConsentDecisionRequest,
  ConsentDecisionResult,
  ConsentRequest,
  ApiError,
  McpConnection,
  McpConnectionList,
  McpRevokeAllResult,
  McpSettings,
  McpSettingsSave,
} from '@/types/McpTypes'

export type McpEndpoint =
  | 'consent.get'
  | 'consent.decide'
  | 'approval.get'
  | 'approval.decide'
  | 'approvals.list'
  | 'connections.me'
  | 'connections.tenant'
  | 'connections.revoke'
  | 'connections.revokeAll'
  | 'settings.get'
  | 'settings.save'

/** Uç → başarı gövdesi tipi (mock yanıtlarının tip denetimi buradan). */
export interface McpEndpointBodies {
  'consent.get': ConsentRequest
  'consent.decide': ConsentDecisionResult
  'approval.get': ApprovalView
  'approval.decide': ApprovalView
  'approvals.list': ApprovalList
  'connections.me': McpConnectionList
  'connections.tenant': McpConnectionList
  'connections.revoke': null
  'connections.revokeAll': McpRevokeAllResult
  'settings.get': McpSettings
  'settings.save': McpSettings
}

export type McpMockReply<E extends McpEndpoint = McpEndpoint> =
  | { status: 200 | 204; body: McpEndpointBodies[E] }
  | { status: number; body: ApiError }

export type McpMockHandler<E extends McpEndpoint> = McpMockReply<E> | ((req: { body: unknown; id?: string }) => McpMockReply<E>)

export type McpMockScenario = { [E in McpEndpoint]?: McpMockHandler<E> }

/** HTTP yöntemi + `/api/` sonrası yol → uç (+ yol kimliği). Tanınmayan yol → null. */
export function mcpEndpointOf(method: string, pathWithQuery: string): { endpoint: McpEndpoint; id?: string } | null {
  const m = method.toUpperCase()
  const [path, query = ''] = pathWithQuery.replace(/^\/?(api\/)?/, '').split('?')
  const params = new URLSearchParams(query)
  let r: RegExpMatchArray | null
  if ((r = path.match(/^oauth\/requests\/([^/]+)$/)) && m === 'GET') return { endpoint: 'consent.get', id: decodeURIComponent(r[1]) }
  if ((r = path.match(/^oauth\/requests\/([^/]+)\/decision$/)) && m === 'POST') return { endpoint: 'consent.decide', id: decodeURIComponent(r[1]) }
  if (path === 'mcp/approvals' && m === 'GET') return { endpoint: 'approvals.list' }
  if ((r = path.match(/^mcp\/approvals\/([^/]+)$/))) {
    if (m === 'GET') return { endpoint: 'approval.get', id: decodeURIComponent(r[1]) }
    if (m === 'POST') return { endpoint: 'approval.decide', id: decodeURIComponent(r[1]) }
  }
  if (path === 'mcp/connections' && m === 'GET') return { endpoint: params.get('scope') === 'tenant' ? 'connections.tenant' : 'connections.me' }
  if (path === 'mcp/connections/revoke-all' && m === 'POST') return { endpoint: 'connections.revokeAll' }
  if ((r = path.match(/^mcp\/connections\/([^/]+)$/)) && m === 'DELETE') return { endpoint: 'connections.revoke', id: decodeURIComponent(r[1]) }
  if (path === 'mcp/settings') {
    if (m === 'GET') return { endpoint: 'settings.get' }
    if (m === 'PUT') return { endpoint: 'settings.save' }
  }
  return null
}

// ── Sentetik veri ────────────────────────────────────────────────────────────────────────────────────────────────

const inMinutes = (min: number, now = Date.now()) => new Date(now + min * 60_000).toISOString()
const daysAgo = (d: number, now = Date.now()) => new Date(now - d * 86_400_000).toISOString()

export const MCP_SERVER_URL = 'https://api.entegrasyonik.invalid/mcp'

export const NOTICE_TEXT =
  'Bağlantıya izin verdiğinizde, seçtiğiniz mağazanın sipariş, ürün, stok ve rapor verileri yapay zekâ uygulamanızın ' +
  'hizmet sağlayıcısına aktarılır ve orada o sağlayıcının koşullarına göre işlenir. Entegrasyonik bu sağlayıcıyı seçmez ' +
  've konuşma içeriğinizi saklamaz. Bağlantıyı istediğiniz zaman Bağlı uygulamalar ekranından kesebilirsiniz.'

export const SETTINGS_TEXT =
  'Yapay zekâ bağlantısını açtığınızda, mağazanızdaki kullanıcılar kendi seçtikleri yapay zekâ uygulamalarını bu mağazaya ' +
  'bağlayabilir. Bağlanan uygulamalar kullanıcının yetkisi dahilindeki sipariş, ürün, stok ve rapor verilerini okuyabilir; ' +
  'bu veriler kullanıcının seçtiği yapay zekâ sağlayıcısına aktarılır. Kişisel veriler (ad, adres, telefon) maskelenir. ' +
  'Her yazma işlemi Entegrasyonik içinde ayrıca onaylanır.'

export function consentRequest(over: Partial<ConsentRequest> = {}): ConsentRequest {
  return {
    id: 'req-e2e-1',
    state: 'pending',
    client: { name: 'Örnek Asistan', known: true, redirectHost: 'connector.ornek-asistan.invalid' },
    requestedScopes: ['mcp:read', 'mcp:write'],
    tenants: [{ tid: 101, name: 'Deniz Butik', role: 'owner', mcpAccess: 'readwrite', writeAvailable: true }],
    notice: { textVersion: 'mcp-v1', text: NOTICE_TEXT },
    expiresAt: inMinutes(10),
    ...over,
  }
}

export function approvalView(over: Partial<ApprovalView> = {}): ApprovalView {
  return {
    id: 'apr-e2e-1',
    status: 'pending',
    client: { name: 'Örnek Asistan' },
    capability: { id: 'orders.approve', title: 'Siparişleri onayla' },
    external: true,
    preview: {
      title: '12 sipariş “Onaylandı” durumuna geçecek',
      lines: [
        'E2E-100231 · 2 ürün · Pazaryeri A',
        'E2E-100232 · 1 ürün · Pazaryeri A',
        'E2E-100240 · 3 ürün · Pazaryeri B',
        'E2E-100244 · 1 ürün · Pazaryeri B',
        've 8 sipariş daha',
      ],
      count: 12,
      confirmLabel: '12 siparişi onayla',
    },
    expiresAt: inMinutes(1),
    ...over,
  }
}

export function connection(over: Partial<McpConnection> = {}): McpConnection {
  return {
    id: 'fam-e2e-1',
    clientName: 'Örnek Asistan',
    known: true,
    redirectHost: 'connector.ornek-asistan.invalid',
    tenant: { tid: 101, name: 'Deniz Butik' },
    scopes: ['mcp:read', 'mcp:write'],
    createdAt: daysAgo(12),
    lastUsedAt: daysAgo(0.02),
    expiresAt: inMinutes(60 * 24 * 78),
    ...over,
  }
}

export function mcpSettings(over: Partial<McpSettings> = {}): McpSettings {
  return {
    access: 'readwrite',
    consent: { textVersion: 'mcp-v1', at: daysAgo(20), byEmail: 'sahip@entegrasyonik-e2e.invalid' },
    currentText: { textVersion: 'mcp-v1', text: SETTINGS_TEXT },
    consentOutdated: false,
    canEdit: true,
    serverUrl: MCP_SERVER_URL,
    activeConnections: 2,
    ...over,
  }
}

const MY_CONNECTIONS: McpConnection[] = [
  connection(),
  connection({
    id: 'fam-e2e-2',
    clientName: 'Deneme Notlar',
    known: false,
    redirectHost: 'notlar.deneme-uygulama.invalid',
    scopes: ['mcp:read'],
    createdAt: daysAgo(3),
    lastUsedAt: null,
  }),
]

const TENANT_CONNECTIONS: McpConnection[] = [
  ...MY_CONNECTIONS.map((c) => ({ ...c, user: { id: 'u-owner', email: 'sahip@entegrasyonik-e2e.invalid' } })),
  connection({
    id: 'fam-e2e-3',
    clientName: 'Örnek Asistan',
    scopes: ['mcp:read'],
    createdAt: daysAgo(30),
    lastUsedAt: daysAgo(2),
    user: { id: 'u-op', email: 'operasyon@entegrasyonik-e2e.invalid' },
  }),
]

const err = (status: number, code: string, error = 'E2E sentetik hata'): { status: number; body: ApiError } => ({
  status,
  body: { error, code, requestId: `req_e2e_${code.toLowerCase()}` },
})

/** Onay kararının mock'u: approve → executed (sonuç özeti + ekranda aç), reject → rejected. */
function decideApproval(base: ApprovalView) {
  return ({ body }: { body: unknown }): McpMockReply<'approval.decide'> => {
    const decision = (body as { decision?: string } | null)?.decision
    if (decision === 'approve') {
      return {
        status: 200,
        body: { ...base, status: 'executed', result: { summary: '12 sipariş onaylandı.', openIn: { screen: 'OrderListView', params: { status: 'approved' } } } },
      }
    }
    if (decision === 'reject') return { status: 200, body: { ...base, status: 'rejected' } }
    return err(400, 'OAUTH_INVALID_REQUEST')
  }
}

function decideConsent({ body }: { body: unknown }): McpMockReply<'consent.decide'> {
  const b = (body ?? {}) as ConsentDecisionRequest
  const base = 'https://connector.ornek-asistan.invalid/oauth/callback'
  return { status: 200, body: { redirectTo: b.approve ? `${base}?code=e2e-code&state=e2e-state` : `${base}?error=access_denied&state=e2e-state` } }
}

function saveSettings(current: McpSettings) {
  return ({ body }: { body: unknown }): McpMockReply<'settings.save'> => {
    const b = (body ?? {}) as McpSettingsSave
    if (b.access !== 'off' && b.acceptTextVersion !== current.currentText.textVersion) return err(400, 'OAUTH_INVALID_REQUEST', 'Bilgilendirme onayı gerekli')
    const consent = b.acceptTextVersion
      ? { textVersion: b.acceptTextVersion, at: new Date().toISOString(), byEmail: 'sahip@entegrasyonik-e2e.invalid' }
      : current.consent
    return { status: 200, body: { ...current, access: b.access, consent, consentOutdated: false } }
  }
}

// ── Senaryolar (§7 adları birebir) ──────────────────────────────────────────────────────────────────────────────

const ownerSettings = mcpSettings()
const approvalPending = approvalView()

export const MCP_MOCK_SCENARIOS = {
  'consent-known-single': {
    'consent.get': () => ({ status: 200, body: consentRequest() }),
    'consent.decide': decideConsent,
  },
  'consent-unknown-multi': {
    'consent.get': {
      status: 200,
      body: consentRequest({
        id: 'req-e2e-2',
        client: { name: 'Deneme Notlar', known: false, redirectHost: 'notlar.deneme-uygulama.invalid' },
        tenants: [
          { tid: 101, name: 'Deniz Butik', role: 'owner', mcpAccess: 'readwrite', writeAvailable: true },
          { tid: 102, name: 'Kuzey Ev Tekstili', role: 'admin', mcpAccess: 'read', writeAvailable: false },
          { tid: 103, name: 'Ada Kırtasiye', role: 'owner', mcpAccess: 'off', writeAvailable: false },
        ],
      }),
    },
    'consent.decide': decideConsent,
  },
  'consent-expired': {
    'consent.get': { status: 200, body: consentRequest({ state: 'expired', expiresAt: inMinutes(-5) }) },
  },
  'consent-impersonation': {
    'consent.get': err(403, 'IMPERSONATION_FORBIDDEN'),
  },
  'consent-no-eligible': {
    'consent.get': {
      status: 200,
      body: consentRequest({
        tenants: [
          { tid: 101, name: 'Deniz Butik', role: 'owner', mcpAccess: 'off', writeAvailable: false },
          { tid: 102, name: 'Kuzey Ev Tekstili', role: 'member', mcpAccess: 'off', writeAvailable: false },
        ],
      }),
    },
    'consent.decide': decideConsent,
  },
  'approval-pending': {
    // Her okumada taze 60 sn (§7) — modül yüklenme anına bağlı kalmasın.
    'approval.get': () => ({ status: 200, body: approvalView() }),
    'approval.decide': decideApproval(approvalPending),
  },
  'approval-executed': {
    'approval.get': {
      status: 200,
      body: approvalView({ status: 'executed', result: { summary: '12 sipariş onaylandı.', openIn: { screen: 'OrderListView' } } }),
    },
  },
  'approval-failed': {
    'approval.get': { status: 200, body: approvalView({ status: 'failed', result: { code: 'RATE_LIMITED' } }) },
  },
  'approval-unknown': {
    'approval.get': { status: 200, body: approvalView({ status: 'unknown_outcome', result: { openIn: { screen: 'OrderListView' } } }) },
  },
  'approval-live-readonly': {
    'approval.get': () => ({ status: 200, body: approvalView() }),
    'approval.decide': err(423, 'LIVE_READONLY'),
  },
  'approval-expired': {
    'approval.get': { status: 200, body: approvalView({ status: 'expired', expiresAt: inMinutes(-3) }) },
  },
  'connections-empty': {
    'settings.get': { status: 200, body: mcpSettings({ activeConnections: 0 }) },
    'connections.me': { status: 200, body: { items: [] } },
    'connections.tenant': { status: 200, body: { items: [] } },
    'approvals.list': { status: 200, body: { items: [] } },
  },
  'connections-many': {
    'settings.get': { status: 200, body: mcpSettings({ activeConnections: TENANT_CONNECTIONS.length }) },
    'connections.me': { status: 200, body: { items: MY_CONNECTIONS } },
    'connections.tenant': { status: 200, body: { items: TENANT_CONNECTIONS } },
    'approvals.list': () => ({ status: 200, body: { items: [approvalView({ expiresAt: inMinutes(8) })] } }),
    'connections.revoke': { status: 204, body: null },
    'connections.revokeAll': { status: 200, body: { revoked: TENANT_CONNECTIONS.length } },
  },
  'settings-owner-off': {
    'settings.get': { status: 200, body: mcpSettings({ access: 'off', consent: null, activeConnections: 0 }) },
    'settings.save': saveSettings(mcpSettings({ access: 'off', consent: null, activeConnections: 0 })),
  },
  'settings-owner-outdated': {
    'settings.get': {
      status: 200,
      body: mcpSettings({
        access: 'off',
        consent: { textVersion: 'mcp-v0', at: daysAgo(90), byEmail: 'sahip@entegrasyonik-e2e.invalid' },
        consentOutdated: true,
      }),
    },
    'settings.save': saveSettings(mcpSettings({ consentOutdated: true })),
  },
  'settings-admin-readonly': {
    'settings.get': { status: 200, body: mcpSettings({ access: 'read', canEdit: false }) },
  },
  // Sahip — açık (okuma+yazma) ayar; S4 görsel tabanı için.
  'settings-owner-on': {
    'settings.get': { status: 200, body: ownerSettings },
    'settings.save': saveSettings(ownerSettings),
  },
} satisfies Record<string, McpMockScenario>

export type McpMockScenarioName = keyof typeof MCP_MOCK_SCENARIOS
export const MCP_MOCK_SCENARIO_NAMES = Object.keys(MCP_MOCK_SCENARIOS) as McpMockScenarioName[]

/**
 * İstek → mock yanıt. Senaryoda tanımsız uç → `null` (çağıran kendi varsayılanını seçer; e2e'de "eşlenmemiş").
 * `body`: istek gövdesi (JSON'dan çözülmüş).
 */
export function resolveMcpMock(
  scenario: McpMockScenario,
  method: string,
  pathWithQuery: string,
  body: unknown = null,
): McpMockReply | null {
  const match = mcpEndpointOf(method, pathWithQuery)
  if (!match) return null
  const handler = scenario[match.endpoint] as McpMockHandler<McpEndpoint> | undefined
  if (!handler) return null
  return typeof handler === 'function' ? handler({ body, id: match.id }) : handler
}
