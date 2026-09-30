/**
 * frontend/src/types/McpTypes.ts
 *
 * MCP-6 (ADR-0035) — uzak MCP bağlantısı önyüz tipleri. KANONİK kaynak: `docs/cloud-contracts/MCP_UI_CONTRACT.md` §4
 * (sürüm 1.0.0). Bu dosya o bloğun BİREBİR kopyasıdır; alan eklenmez/çıkarılmaz (sözleşme değişirse önce belge).
 * Mock (`src/mocks/mcp.ts`) bu tiplerle tip denetimlidir; `tests/mcp-contract.test.ts` şekli çalışma anında da korur.
 */

// Ortak
export type McpScope = 'mcp:read' | 'mcp:write'
export type McpAccess = 'off' | 'read' | 'readwrite'
/** Tek hata zarfı (F4). */
export interface ApiError { error: string; code?: string; requestId: string; fields?: Record<string, string> }

// S1 — GET /api/oauth/requests/:id   (yetenek: oauth.consent.view)
export interface ConsentTenant {
  tid: number
  name: string
  role: 'owner' | 'admin' | 'member' | string
  mcpAccess: McpAccess
  writeAvailable: boolean
}
export interface ConsentRequest {
  id: string
  state: 'pending' | 'expired'
  client: { name: string; known: boolean; redirectHost: string }
  requestedScopes: McpScope[]
  tenants: ConsentTenant[]
  /** Düz metin; markdown/HTML değil. */
  notice: { textVersion: string; text: string }
  /** ISO */
  expiresAt: string
}
// POST /api/oauth/requests/:id/decision   (yetenek: oauth.consent.decide)
export interface ConsentDecisionRequest { approve: boolean; tid?: number; scopes?: McpScope[] }
export interface ConsentDecisionResult { redirectTo: string }

// S2 — GET/POST /api/mcp/approvals/:id   (yetenek: mcp.approvals.view / mcp.approvals.decide)
export type ApprovalStatus = 'pending' | 'executed' | 'failed' | 'unknown_outcome' | 'rejected' | 'expired'
export interface ApprovalView {
  id: string
  status: ApprovalStatus
  client: { name: string }
  /** title: kayıttaki summary (i18n backend'de çözülmüş). */
  capability: { id: string; title: string }
  external: boolean
  /** lines ≤ 20, her biri ≤ 200 karakter, düz metin. */
  preview: { title: string; lines: string[]; count?: number; confirmLabel: string }
  expiresAt: string
  result?: { summary?: string; code?: string; openIn?: { screen: string; params?: Record<string, string> } }
}
export interface ApprovalDecisionRequest { decision: 'approve' | 'reject' }

// S3 — Bağlı uygulamalar
// GET /api/mcp/connections?scope=me|tenant   (mcp.connections.list; scope=tenant yalnız users:manage)
export type McpConnectionScope = 'me' | 'tenant'
export interface McpConnection {
  /** Aile kimliği. */
  id: string
  clientName: string
  known: boolean
  redirectHost: string
  tenant: { tid: number; name: string }
  /** Yalnız scope=tenant. */
  user?: { id: string; email: string }
  scopes: McpScope[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string
}
export interface McpConnectionList { items: McpConnection[] }
// DELETE /api/mcp/connections/:id            (mcp.connections.revoke) → 204
// POST   /api/mcp/connections/revoke-all     (mcp.connections.revokeAll; sahip/admin) → { revoked: number }
export interface McpRevokeAllResult { revoked: number }
// GET /api/mcp/approvals?status=pending      (mcp.approvals.list) → { items: ApprovalView[] }
export interface ApprovalList { items: ApprovalView[] }

// S4 — Tenant ayarı
// GET /api/mcp/settings                      (mcp.settings.get)
export interface McpSettings {
  /** Etkin değer (metin sürümü eskiyse 'off'). */
  access: McpAccess
  consent: { textVersion: string; at: string; byEmail: string } | null
  currentText: { textVersion: string; text: string }
  /** Kayıtlı onay eski sürüm → yeniden onay gerekir. */
  consentOutdated: boolean
  /** Yalnız sahip ve impersonation değil. */
  canEdit: boolean
  /** Kullanıcıya gösterilecek MCP adresi. */
  serverUrl: string
  activeConnections: number
}
// PUT /api/mcp/settings                      (mcp.settings.save; yalnız sahip)
/** access≠off ise acceptTextVersion = currentText.textVersion ZORUNLU. */
export interface McpSettingsSave { access: McpAccess; acceptTextVersion?: string }

/** §4 hata kodları (i18n anahtarı `mcp.errors.<CODE>`); bilinmeyen → genel ileti + destek kodu. */
export const MCP_ERROR_CODES = [
  'OAUTH_INVALID_REQUEST', 'OAUTH_ACCESS_DENIED', 'MCP_TENANT_OFF', 'IMPERSONATION_FORBIDDEN', 'FORBIDDEN',
  'APPROVAL_EXPIRED', 'APPROVAL_REJECTED', 'LIVE_READONLY', 'MAINTENANCE', 'QUOTA_EXCEEDED', 'RATE_LIMITED', 'NOT_FOUND',
] as const
export type McpErrorCode = (typeof MCP_ERROR_CODES)[number]
