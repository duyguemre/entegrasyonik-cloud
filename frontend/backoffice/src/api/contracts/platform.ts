/**
 * Sistem ayarları (`_platform` hedefi; ADR-0031 BO-CFG-1 + B11 bakım/bayraklar) ve yöneticiler (B12). [BE HAZIR]
 * Kaynak: backend/src/api/services/integration-config-service.ts (getEffectiveConfig/saveDraft/discardDraft/previewPublish/publish/
 * rollback/history — yeni servis YOK), backoffice-admin-user-service.ts; şema rpc-input/identity.ts + backoffice.ts.
 * Sözleşmeler: API_BACKOFFICE_FLAGS_MAINTENANCE.md, API_PUBLIC_CONFIG.md, API_BACKOFFICE_ADMINS.md.
 */
import type { SettingDanger } from './infra'

export const PLATFORM_TARGET = '_platform'

export interface SaveDraftRequest {
  target: string
  patch?: Record<string, unknown>
  unset?: string[]
  expectedDraftRev?: number
}
export interface SaveDraftResponse {
  target: string
  version: number
  draftRev: number
  overrides: Record<string, unknown>
}
export interface ConfigDiffEntry {
  key: string
  from?: unknown
  to?: unknown
  danger: SettingDanger
}
export interface PreviewPublishResponse {
  target: string
  draftVersion: number
  basedOnVersion: number | null
  diff: ConfigDiffEntry[]
  /** `_platform` için tüm ACTIVE tenant'lar; >50 ise approximate. */
  impact: { activeTenants: number; approximate: boolean }
  danger: SettingDanger
  restartCount: number
  requiresReason: boolean
  requiresTypedApproval: boolean
}
export interface PublishRequest {
  target: string
  reason?: string
  typedConfirmation?: string
  approvedBy?: string
}
export interface PublishResponse {
  target: string
  version: number
  publishedVersion: number
  diff: ConfigDiffEntry[]
}
export interface RollbackRequest {
  target: string
  toVersion: number
  reason?: string
  typedConfirmation?: string
}
export interface ConfigRevision {
  version: number
  status: string
  createdBy: string | null
  createdAt: string
  publishedBy: string | null
  publishedAt: string | null
  reason: string | null
  diff: ConfigDiffEntry[] | null
  origin: string | null
  approvedBy: string | null
}

/** GET /api/public-config (kimliksiz; müşteri `/api` kökü). Ortam bölümü bu yanıtın `env` bloğundan salt okunur gösterilir. */
export interface PublicConfig {
  version: number
  env: { images: { productBaseUrl: string; uploadMaxBytes: number } }
  settings: Record<string, unknown>
}

// ---------------------------------------------------------------- B12 yöneticiler
export type AdminStatus = 'active' | 'disabled' | 'invited'
export interface PlatformAdmin {
  /** 24 hex. */
  sub: string
  email: string
  name: string
  surname: string
  status: AdminStatus
  mfaEnabled: boolean
  lastLoginAt: string | null
  locked: boolean
  createdAt: string
}
export interface AcceptInviteRequest {
  token: string
  name: string
  surname: string
  password: string
}

declare module '../contract' {
  interface AdminRpc {
    'IntegrationConfigService/saveDraft': [SaveDraftRequest, SaveDraftResponse]
    'IntegrationConfigService/discardDraft': [{ target: string; expectedDraftRev: number }, { target: string; discarded: true }]
    'IntegrationConfigService/previewPublish': [{ target: string }, PreviewPublishResponse]
    'IntegrationConfigService/publish': [PublishRequest, PublishResponse]
    'IntegrationConfigService/rollback': [RollbackRequest, { target: string; version: number; publishedVersion: number }]
    'IntegrationConfigService/history': [{ target: string; limit?: number }, ConfigRevision[]]
    'BackofficeAdminUserService/list': [Record<string, never>, { items: PlatformAdmin[] }]
    'BackofficeAdminUserService/invite': [{ email: string; reason: string }, { sub: string; status: 'invited'; expiresAt: string; renewed: boolean }]
    'BackofficeAdminUserService/disable': [{ sub: string; reason: string }, { sub: string; status: 'disabled' | 'revoked' }]
    'BackofficeAdminUserService/enable': [{ sub: string; reason: string }, { sub: string; status: 'active' }]
    'BackofficeAdminUserService/resetMfa': [{ sub: string; reason: string }, { sub: string; mfaEnabled: false }]
    'BackofficeAuthService/acceptInvite': [AcceptInviteRequest, { accepted: true }]
  }
}
