/**
 * frontend/src/composables/useMcpApi.ts
 *
 * MCP-6 (ADR-0035, `docs/cloud-contracts/MCP_UI_CONTRACT.md` §4) — uzak MCP bağlantısı uçları. Uçlar REST biçimli
 * (GET/POST/PUT/DELETE; RPC değil) olduğu için `restApi` (yalnız GET/POST) yerine axios doğrudan kullanılır; taban
 * adres, çerez (`withCredentials`) ve genel yakalayıcılar (REAUTH, IDEMPOTENCY) AYNI. Her çağrı `skipSessionRedirect`
 * ile gider: 401'de genel "oturum düştü → /login" yakalayıcısı `redirect`'i kaybettirir; bu ekranlar 401'i kendileri
 * `/login?redirect=<bulunulan adres>` ile karşılar (onay ekranı dış uygulamadan gelir, dönüş adresi kaybolmamalı).
 *
 * Sonuç tek biçim: `{ ok:true, data }` | `{ ok:false, failure }` (fırlatmaz). Gerçek uçlar MCP-7'de (yerel) bağlanır.
 *
 * Geliştirme mock'u: `?mcpMock=<senaryo>` (src/mocks/mcp.ts §7 adları). YALNIZ `import.meta.env.DEV` — üretim
 * derlemesinde dal ve mock modülü elenir (statik test: tests/mcp-contract.test.ts).
 */
import axios from 'axios'
import { apiBaseUrl } from '@/config/env'
import { describeFailure } from '@/composables/errorCodes'
import type {
  ApprovalList,
  ApprovalView,
  ConsentDecisionRequest,
  ConsentDecisionResult,
  ConsentRequest,
  McpConnectionList,
  McpConnectionScope,
  McpRevokeAllResult,
  McpSettings,
  McpSettingsSave,
} from '@/types/McpTypes'

export interface McpFailure {
  status?: number
  code?: string
  requestId?: string
}

export type McpResult<T> = { ok: true; data: T } | { ok: false; failure: McpFailure }

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

const MOCK_PARAM = 'mcpMock'
const MOCK_STORAGE_KEY = 'ek-mcp-mock'

/** Geliştirme mock senaryosu adı (URL > oturum deposu). Üretimde her zaman null. */
function devMockName(): string | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  try {
    const fromUrl = new URLSearchParams(window.location.search).get(MOCK_PARAM)
    if (fromUrl) window.sessionStorage.setItem(MOCK_STORAGE_KEY, fromUrl)
    return fromUrl || window.sessionStorage.getItem(MOCK_STORAGE_KEY)
  } catch {
    return null
  }
}

async function devMock<T>(method: Method, path: string, body: unknown): Promise<McpResult<T> | null> {
  if (!import.meta.env.DEV) return null
  const name = devMockName()
  if (!name) return null
  const { MCP_MOCK_SCENARIOS, resolveMcpMock } = await import('@/mocks/mcp')
  const scenario = (MCP_MOCK_SCENARIOS as Record<string, object>)[name]
  if (!scenario) return null
  const reply = resolveMcpMock(scenario, method, path, body)
  if (!reply) return null
  await new Promise((r) => setTimeout(r, 250))
  if (reply.status >= 200 && reply.status < 300) return { ok: true, data: reply.body as T }
  const e = reply.body as { code?: string; requestId?: string }
  return { ok: false, failure: { status: reply.status, code: e?.code, requestId: e?.requestId } }
}

async function call<T>(method: Method, path: string, body?: unknown): Promise<McpResult<T>> {
  const mocked = await devMock<T>(method, path, body ?? null)
  if (mocked) return mocked
  try {
    const res = await axios.request({
      method,
      url: apiBaseUrl + path,
      data: body,
      skipSessionRedirect: true,
    })
    return { ok: true, data: (res.status === 204 ? null : res.data) as T }
  } catch (error) {
    const f = describeFailure(error)
    return { ok: false, failure: { status: f.status, code: f.code, requestId: f.requestId } }
  }
}

const enc = encodeURIComponent

export function useMcpApi() {
  return {
    // S1
    getConsentRequest: (id: string) => call<ConsentRequest>('GET', `oauth/requests/${enc(id)}`),
    decideConsent: (id: string, body: ConsentDecisionRequest) =>
      call<ConsentDecisionResult>('POST', `oauth/requests/${enc(id)}/decision`, body),
    // S2
    getApproval: (id: string) => call<ApprovalView>('GET', `mcp/approvals/${enc(id)}`),
    decideApproval: (id: string, decision: 'approve' | 'reject') =>
      call<ApprovalView>('POST', `mcp/approvals/${enc(id)}`, { decision }),
    listPendingApprovals: () => call<ApprovalList>('GET', 'mcp/approvals?status=pending'),
    // S3
    listConnections: (scope: McpConnectionScope) => call<McpConnectionList>('GET', `mcp/connections?scope=${scope}`),
    revokeConnection: (id: string) => call<null>('DELETE', `mcp/connections/${enc(id)}`),
    revokeAllConnections: () => call<McpRevokeAllResult>('POST', 'mcp/connections/revoke-all', {}),
    // S4
    getSettings: () => call<McpSettings>('GET', 'mcp/settings'),
    saveSettings: (body: McpSettingsSave) => call<McpSettings>('PUT', 'mcp/settings', body),
  }
}

export type McpApi = ReturnType<typeof useMcpApi>
