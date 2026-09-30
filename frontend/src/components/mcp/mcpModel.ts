/**
 * frontend/src/components/mcp/mcpModel.ts
 *
 * MCP-6 — dört ekranın (S1 onay, S2 işlem onayı, S3 bağlı uygulamalar, S4 ayar) SAF görünüm modeli
 * (`MCP_UI_CONTRACT.md` §2–§6). Bileşenler yalnız bu kararları çizer; durum → görünüm eşlemesi, rol görünürlüğü ve
 * kayıt gövdesi burada tek yerde ve vitest'lidir (tests/mcp-model.test.ts). i18n'e bağlı değildir: anahtar döner.
 */
import { MCP_ERROR_CODES } from '@/types/McpTypes'
import type {
  ApprovalStatus,
  ApprovalView,
  ConsentDecisionRequest,
  ConsentRequest,
  ConsentTenant,
  McpAccess,
  McpScope,
  McpSettings,
  McpSettingsSave,
} from '@/types/McpTypes'
import type { McpFailure } from '@/composables/useMcpApi'
import type { StatusTone } from '@entegrasyonik/ui/components/statusTone'
import { buildScreenPath, pickUrlParams, resolveScreenByKey } from '@/navigation/screens'

// ── Hata kodları ─────────────────────────────────────────────────────────────────────────────────────────────

const KNOWN = new Set<string>(MCP_ERROR_CODES)

/** §4: `mcp.errors.<CODE>`; bilinmeyen/kodsuz → genel ileti (destek kodu ayrıca gösterilir). */
export function mcpErrorKey(code: string | undefined | null): string {
  return code && KNOWN.has(code) ? `mcp.errors.${code}` : 'mcp.errors.GENERIC'
}

/** Oturum düşmüş mü (ekran `/login?redirect=` ile karşılar; REAUTH ayrı akıştır). */
export function needsLogin(f: McpFailure | undefined): boolean {
  return f?.status === 401 && f.code !== 'REAUTH_REQUIRED'
}

// ── S1 — Onay (consent) ekranı ─────────────────────────────────────────────────────────────────────────────

export type ConsentPhase = 'loading' | 'ready' | 'expired' | 'impersonation' | 'error' | 'login'

/** GET sonucu → faz. 404 ve `state:'expired'` aynı görünüm (§2 tablo). */
export function consentPhase(result: { ok: true; data: ConsentRequest } | { ok: false; failure: McpFailure }): ConsentPhase {
  if (result.ok) return result.data.state === 'expired' ? 'expired' : 'ready'
  const f = result.failure
  if (needsLogin(f)) return 'login'
  if (f.code === 'IMPERSONATION_FORBIDDEN') return 'impersonation'
  if (f.status === 404 || f.code === 'NOT_FOUND' || f.code === 'OAUTH_INVALID_REQUEST') return 'expired'
  return 'error'
}

export function isTenantEligible(t: ConsentTenant): boolean {
  return t.mcpAccess !== 'off'
}

/** Tüm mağazalar `off` → "İzin ver" gösterilmez, yalnız "Reddet" (§2 `noEligibleTenant`). */
export function noEligibleTenant(req: ConsentRequest): boolean {
  return !req.tenants.some(isTenantEligible)
}

/** Başlangıç seçimi: yalnız TEK uygun mağaza varsa o; çoklu seçimde kullanıcı seçer ("seçilmeden İzin ver devre dışı"). */
export function initialTenant(req: ConsentRequest): number | null {
  const eligible = req.tenants.filter(isTenantEligible)
  return eligible.length === 1 ? eligible[0].tid : null
}

/**
 * Yazma kutusu gösterilir mi: istemci `mcp:write` istedi VE seçili mağazada `writeAvailable` (tenant `read` ise
 * backend `false` döner; biz ayrıca `mcpAccess==='readwrite'` ile kesiştiririz — savunma derinliği).
 */
export function writeOptionVisible(req: ConsentRequest, tid: number | null): boolean {
  if (tid === null || !req.requestedScopes.includes('mcp:write')) return false
  const t = req.tenants.find((x) => x.tid === tid)
  return !!t && t.writeAvailable === true && t.mcpAccess === 'readwrite'
}

/** Karar gövdesi (§4 `ConsentDecisionRequest`). Reddet: yalnız `{approve:false}`. */
export function consentDecisionBody(approve: boolean, req: ConsentRequest, tid: number | null, write: boolean): ConsentDecisionRequest {
  if (!approve) return { approve: false }
  const scopes: McpScope[] = ['mcp:read']
  if (write && writeOptionVisible(req, tid)) scopes.push('mcp:write')
  return { approve: true, tid: tid ?? undefined, scopes }
}

/** Mağaza satırındaki rol etiketi anahtarı (bilinmeyen rol → genel "Üye"). */
export function roleLabelKey(role: string): string {
  return role === 'owner' || role === 'admin' || role === 'member' ? `mcp.roles.${role}` : 'mcp.roles.member'
}

// ── S2 — İşlem onayı ─────────────────────────────────────────────────────────────────────────────────────────

export type ApprovalPhase =
  | 'loading'
  | 'login'
  | 'error'
  | ApprovalStatus
  | 'LIVE_READONLY'
  | 'MAINTENANCE'
  | 'QUOTA_EXCEEDED'

export interface ApprovalOutcomeView {
  tone: 'success' | 'error' | 'warning' | 'neutral' | 'info'
  icon: string
  titleKey: string
  textKey?: string
  /** "Ekranda aç" bağlantısı gösterilir mi (yalnız `result.openIn` varsa). */
  showOpenIn: boolean
  /** Destek kodu gösterilir mi. */
  showSupport: boolean
  /** Plan yükseltme bağlantısı. */
  showUpgrade: boolean
  /** "Yapay zekâ uygulamanıza dönebilirsiniz" notu. */
  showReturnNote: boolean
}

/** Karar/okuma hatası → faz. Hata kodu yoksa HTTP durumu (423 LIVE_READONLY sözleşmede, ADR-0035 §5). */
export function approvalFailurePhase(f: McpFailure): ApprovalPhase {
  if (needsLogin(f)) return 'login'
  switch (f.code) {
    case 'LIVE_READONLY':
      return 'LIVE_READONLY'
    case 'MAINTENANCE':
      return 'MAINTENANCE'
    case 'QUOTA_EXCEEDED':
      return 'QUOTA_EXCEEDED'
    case 'APPROVAL_EXPIRED':
    case 'NOT_FOUND':
      return 'expired'
    case 'APPROVAL_REJECTED':
      return 'rejected'
  }
  if (f.status === 404) return 'expired'
  if (f.status === 423) return 'LIVE_READONLY'
  return 'error'
}

/** Faz → sonuç görünümü (`pending`/`loading`/`login` önizleme ya da iskelet çizer; burada null). */
export function approvalOutcome(phase: ApprovalPhase, view?: ApprovalView | null): ApprovalOutcomeView | null {
  const openIn = !!view?.result?.openIn
  const base = { showOpenIn: false, showSupport: false, showUpgrade: false, showReturnNote: false }
  switch (phase) {
    case 'executed':
      return { ...base, tone: 'success', icon: 'mdi-check-circle-outline', titleKey: 'mcp.approval.executed.title', showOpenIn: openIn, showReturnNote: true }
    case 'failed':
      return { ...base, tone: 'error', icon: 'mdi-alert-circle-outline', titleKey: 'mcp.approval.failed.title', showSupport: true, showReturnNote: true }
    case 'unknown_outcome':
      return { ...base, tone: 'warning', icon: 'mdi-help-circle-outline', titleKey: 'mcp.approval.unknown.title', textKey: 'mcp.approval.unknown.text', showOpenIn: openIn, showReturnNote: true }
    case 'rejected':
      return { ...base, tone: 'neutral', icon: 'mdi-close-circle-outline', titleKey: 'mcp.approval.rejected.title', textKey: 'mcp.approval.rejected.text', showReturnNote: true }
    case 'expired':
      return { ...base, tone: 'neutral', icon: 'mdi-timer-off-outline', titleKey: 'mcp.approval.expired.title', textKey: 'mcp.approval.expired.text' }
    case 'LIVE_READONLY':
      return { ...base, tone: 'warning', icon: 'mdi-lock-outline', titleKey: 'mcp.approval.blocked.title', textKey: 'mcp.errors.LIVE_READONLY' }
    case 'MAINTENANCE':
      return { ...base, tone: 'warning', icon: 'mdi-wrench-outline', titleKey: 'mcp.approval.blocked.title', textKey: 'mcp.errors.MAINTENANCE' }
    case 'QUOTA_EXCEEDED':
      return { ...base, tone: 'warning', icon: 'mdi-gauge-full', titleKey: 'mcp.approval.blocked.title', textKey: 'mcp.errors.QUOTA_EXCEEDED', showUpgrade: true }
    case 'error':
      return { ...base, tone: 'error', icon: 'mdi-alert-circle-outline', titleKey: 'mcp.approval.loadError.title', textKey: 'mcp.approval.loadError.text', showSupport: true }
    default:
      return null
  }
}

/** Kalan tam saniye (negatif → 0). */
export function remainingSeconds(expiresAt: string, now: number = Date.now()): number {
  const t = Date.parse(expiresAt)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.ceil((t - now) / 1000))
}

/** `9:05` / `0:59` biçimi (saat varsa `1:02:03`). */
export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/**
 * Ekran okuyucu duyurusu (§3): yalnız son 60 sn'ye GİRİLDİĞİ anda bir kez. `announced` çağıranın bayrağıdır;
 * sayfa zaten ≤60 sn ile açıldıysa da bir kez duyurulur.
 */
export function shouldAnnounceCountdown(remaining: number, announced: boolean): boolean {
  return !announced && remaining > 0 && remaining <= 60
}

/** `failed` sonucundaki kod → ileti anahtarı (sözleşme: `result.code` → i18n). */
export function failedResultKey(view: ApprovalView | null | undefined): string {
  return mcpErrorKey(view?.result?.code)
}

// ── S3 — Bağlı uygulamalar ──────────────────────────────────────────────────────────────────────────────────

/** Rol görünürlüğü için gereken en az kullanıcı bilgisi (`useUser` profil alanları). */
export interface McpActor {
  owner?: boolean
  roleCode?: string
  isGlobalAdmin?: boolean
}

export type McpRole = 'owner' | 'admin' | 'operator'

/** ADR-0028 rolleri: sahip ⊇ yönetici ⊇ operatör (`ROLE_ADMIN`/`ROLE_OWNER` → yönetici kademesi; teamModel ile aynı küme). */
export function mcpRole(actor: McpActor | null | undefined): McpRole {
  if (actor?.owner === true) return 'owner'
  if (actor?.isGlobalAdmin === true || ['ROLE_ADMIN', 'ROLE_OWNER'].includes(String(actor?.roleCode ?? ''))) return 'admin'
  return 'operator'
}

export interface McpVisibility {
  /** "Mağazadaki tüm bağlantılar" sekmesi (`users:manage`). */
  tenantTab: boolean
  /** "Tümünü kes" (`mcp.connections.revokeAll`; sahip/yönetici). */
  revokeAll: boolean
  /** S4'e "ayarı aç" bağlantıları (yalnız sahip değiştirebilir; asıl karar `McpSettings.canEdit`). */
  settingsLink: boolean
}

/**
 * Rol → görünürlük (yalnız İPUCU; asıl sınır backend `can()`). Sahip: hepsi. Yönetici: tenant sekmesi + tümünü kes,
 * ayar salt-okuma. Operatör: yalnız kendi bağlantıları.
 */
export function mcpVisibility(actor: McpActor | null | undefined): McpVisibility {
  const role = mcpRole(actor)
  return {
    tenantTab: role !== 'operator',
    revokeAll: role !== 'operator',
    settingsLink: role === 'owner',
  }
}

/** İzin çipleri: "Okuma" her zaman; `mcp:write` → "İşlem önerme". */
export function scopeChips(scopes: McpScope[]): Array<{ key: string; tone: StatusTone }> {
  const chips: Array<{ key: string; tone: StatusTone }> = [{ key: 'mcp.scopes.read', tone: 'neutral' }]
  if (scopes.includes('mcp:write')) chips.push({ key: 'mcp.scopes.write', tone: 'info' })
  return chips
}

// ── S4 — Yapay zekâ bağlantısı ayarı ─────────────────────────────────────────────────────────────────────────

export const MCP_ACCESS_OPTIONS: ReadonlyArray<McpAccess> = ['off', 'read', 'readwrite']

export function accessLabelKey(access: McpAccess): string {
  return `mcp.access.${access}`
}

export function accessTone(access: McpAccess): StatusTone {
  return access === 'off' ? 'neutral' : access === 'read' ? 'info' : 'success'
}

/**
 * Seçilen erişim için aktarım onayı gerekli mi: `off` dışında VE (onay yok | eski sürüm | sürüm farklı).
 * (§6: "yalnız off dışı seçimde ve onay yoksa/eskiyse zorunlu".)
 */
export function consentRequired(s: McpSettings, access: McpAccess): boolean {
  if (access === 'off') return false
  return !s.consent || s.consentOutdated || s.consent.textVersion !== s.currentText.textVersion
}

/**
 * Kayıt gövdesi. §4: `access≠off` ise `acceptTextVersion = currentText.textVersion` ZORUNLU — onay zaten güncelse de
 * gönderilir (sunucu doğrular). Onay gerekli ama işaretlenmemişse `null` (kaydet devre dışı).
 */
export function settingsSaveBody(s: McpSettings, access: McpAccess, accepted: boolean): McpSettingsSave | null {
  if (access === 'off') return { access: 'off' }
  if (consentRequired(s, access) && !accepted) return null
  return { access, acceptTextVersion: s.currentText.textVersion }
}

// ── "Ekranda aç" (S2 `result.openIn`) ──────────────────────────────────────────────────────────────────────

/**
 * `openIn` → uygulama içi konum. YALNIZ kayıtlı ekran (`screens.ts`) ve o ekranın `urlParams` beyaz listesi;
 * tanınmayan ekran → null (bağlantı gösterilmez). Backend'den gelen serbest metinle URL kurulmaz.
 */
export function openInLocation(openIn: { screen: string; params?: Record<string, string> } | undefined | null): { path: string; query: Record<string, string> } | null {
  if (!openIn || typeof openIn.screen !== 'string') return null
  const screen = resolveScreenByKey(openIn.screen)
  if (!screen) return null
  const instanceId = screen.instanceParam ? openIn.params?.[screen.instanceParam] : undefined
  if (screen.instanceParam && instanceId !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(instanceId)) return null
  return { path: buildScreenPath(screen, instanceId), query: pickUrlParams(screen, openIn.params) }
}
