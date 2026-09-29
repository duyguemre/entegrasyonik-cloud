/**
 * frontend/src/composables/useAuditLogApi.ts
 *
 * ADR-0015 B4-P1c — N10 "Denetim günlüğü" (tenant, YALNIZCA OKUMA) istemcisi + saf yardımcılar.
 * Sözleşme: `docs/API_TENANT_SURFACE.md` §4 — `AuditService/getAuditLogs` (admin, owner dahil).
 * Backend karşılığı (salt-okunur, grep ile doğrulandı): `backend/src/api/services/audit-service.ts`
 * (`limit` 1..100, `page` ≥1, aralık ≤366 gün, vars. son 30 gün, `event/eventPrefix` `^[A-Za-z0-9_.:-]{1,64}$`,
 * `userId` `^[A-Za-z0-9_-]{1,64}$`, `result` ok|fail|error, `admin.*` olayları tenant'a KAPALI).
 * Bu dosya aynı kuralları İSTEMCİDE uygular: geçersiz bir filtre hiç gönderilmez (400 önlenir).
 *
 * Kullanıcı adı: yanıttaki `userId` opaktır; ad `UserService/getUsers` (admin) listesinden çözülür.
 * DTO'da `ip`/`tid` YOKTUR ve burada da üretilmez/gösterilmez.
 */
import useRestApi from '@/composables/restapi'
import { apiErrorStatus, type ApiResult } from '@/composables/useIntegrationHealthApi'
import type { StatusTone } from '@/design/status-map'

export type AuditResult = 'ok' | 'fail' | 'error'

export interface AuditLogEntry {
  id: string
  at: string
  event: string
  result: AuditResult | string
  userId: string | null
  meta: Record<string, string | number | boolean> | null
}

export interface AuditLogResponse {
  logs: AuditLogEntry[]
  page: number
  limit: number
  totalNumberOfRecords: number
  totalNumberOfPages: number
  from: string
  to: string
}

export interface AuditLogRequest {
  page: number
  limit: number
  from: string
  to: string
  event?: string
  eventPrefix?: string
  userId?: string
  result?: AuditResult
}

export interface AuditUser {
  id: string
  name: string
}

// ---- Sözleşme sınırları (backend ile birebir) ----
export const DAY_MS = 24 * 60 * 60 * 1000
export const DEFAULT_WINDOW_DAYS = 30
export const MAX_WINDOW_DAYS = 366
export const MAX_LIMIT = 100
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export const DEFAULT_LIMIT = 25
const EVENT_RE = /^[A-Za-z0-9_.:-]{1,64}$/
const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const PLATFORM_INTERNAL_PREFIX = 'admin.'
export const RESULTS: readonly AuditResult[] = ['ok', 'fail', 'error']

// ---- Tarih (tr-TR, GG.AA.YYYY) ----

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `Date` → `"GG.AA.YYYY"` (yerel saat). */
export function toTrDate(d: Date): string {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** `"GG.AA.YYYY"` → yerel gün başlangıcı; geçersiz (31.02 gibi) → `null`. */
export function parseTrDate(text: string): Date | null {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(text ?? '')
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/** Varsayılan pencere (backend ile aynı: son 30 gün) — gün sınırlarına yuvarlanmış. */
export function defaultRange(now: Date = new Date()): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DEFAULT_WINDOW_DAYS)
  return { from: toTrDate(start), to: toTrDate(now) }
}

export function presetRange(days: number, now: Date = new Date()): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  return { from: toTrDate(start), to: toTrDate(now) }
}

// ---- Filtre modeli ----

/** Olay filtresi tek alanda: `prefix:<önek>` (grup) veya `event:<ad>` (tekil olay). */
export interface AuditFilters {
  from: string
  to: string
  eventKey: string | null
  userId: string | null
  result: AuditResult | null
}

export type FilterErrors = Partial<Record<'from' | 'to' | 'eventKey' | 'userId' | 'result', string>>

export function emptyFilters(now: Date = new Date()): AuditFilters {
  return { ...defaultRange(now), eventKey: null, userId: null, result: null }
}

/** İstemci doğrulaması — backend'in 400 kurallarının birebir karşılığı (mesajlar i18n anahtarıdır). */
export function validateFilters(f: AuditFilters): FilterErrors {
  const errors: FilterErrors = {}
  const from = parseTrDate(f.from)
  const to = parseTrDate(f.to)
  if (!from) errors.from = 'auditLog.validation.date'
  if (!to) errors.to = 'auditLog.validation.date'
  if (from && to) {
    if (from.getTime() > to.getTime()) errors.to = 'auditLog.validation.order'
    else if (endOfDay(to).getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) errors.to = 'auditLog.validation.span'
  }
  if (f.eventKey) {
    const parsed = parseEventKey(f.eventKey)
    if (!parsed || !EVENT_RE.test(parsed.value) || parsed.value.startsWith(PLATFORM_INTERNAL_PREFIX)) errors.eventKey = 'auditLog.validation.event'
  }
  if (f.userId && !USER_ID_RE.test(f.userId)) errors.userId = 'auditLog.validation.user'
  if (f.result && !RESULTS.includes(f.result)) errors.result = 'auditLog.validation.result'
  return errors
}

export function parseEventKey(key: string): { kind: 'prefix' | 'event'; value: string } | null {
  const i = key.indexOf(':')
  if (i < 0) return null
  const kind = key.slice(0, i)
  const value = key.slice(i + 1)
  if ((kind !== 'prefix' && kind !== 'event') || !value) return null
  return { kind, value }
}

/** Geçerli filtre + sayfa → istek gövdesi (yalnız dolu alanlar). Geçersizse `null` (istek ATILMAZ). */
export function buildRequest(f: AuditFilters, page: number, limit: number): AuditLogRequest | null {
  if (Object.keys(validateFilters(f)).length) return null
  const from = parseTrDate(f.from)!
  const to = endOfDay(parseTrDate(f.to)!)
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit) || DEFAULT_LIMIT))
  const safePage = Math.max(1, Math.trunc(page) || 1)
  const req: AuditLogRequest = { page: safePage, limit: safeLimit, from: from.toISOString(), to: to.toISOString() }
  const ev = f.eventKey ? parseEventKey(f.eventKey) : null
  if (ev?.kind === 'event') req.event = ev.value
  if (ev?.kind === 'prefix') req.eventPrefix = ev.value
  if (f.userId) req.userId = f.userId
  if (f.result) req.result = f.result
  return req
}

// ---- Olay etiketleri (okunur Türkçe; bilinmeyen → ham ad) ----
// Kaynak: backend'de `AuditLogger.log/fromRequest` çağrılarındaki olay adları (grep, 2026-09-29).
// `admin.*` olayları tenant'a gösterilmediğinden burada YOKTUR.

export const EVENT_LABELS: Record<string, string> = {
  login: 'Oturum açıldı',
  register: 'Hesap oluşturuldu',
  selectStore: 'Mağaza seçildi',
  'user.create': 'Kullanıcı eklendi',
  'user.delete': 'Kullanıcı silindi',
  'user.password_change': 'Parola değiştirildi',
  'user.role_change': 'Kullanıcı rolü değiştirildi',
  'password_reset.request': 'Parola sıfırlama istendi',
  'password_reset.confirm': 'Parola sıfırlandı',
  'email.verify': 'E-posta doğrulandı',
  'email.verify_resend': 'Doğrulama e-postası yeniden gönderildi',
  'tenant.provision': 'Mağaza hesabı kuruldu',
  'tenant.export.requested': 'Veri dışa aktarımı istendi',
  'tenant.export.completed': 'Veri dışa aktarımı tamamlandı',
  'tenant.export.download': 'Dışa aktarım dosyası indirildi',
  'tenant.deletion.requested': 'Hesap silme istendi',
  'tenant.deletion.cancelled': 'Hesap silme iptal edildi',
  'tenant.deletion.jobsCancelled': 'Silme öncesi işler durduruldu',
  'tenant.purge': 'Mağaza verisi kalıcı silindi',
  'stock.policy.primary': 'Birincil stok kanalı değiştirildi',
  'stock.policy.channel': 'Kanal stok politikası değiştirildi',
  'integration.settings.url_field_ignored': 'Entegrasyon ayarında adres alanı yok sayıldı',
  'integration_config.save_draft': 'Entegrasyon yapılandırma taslağı kaydedildi',
  'integration_config.discard_draft': 'Entegrasyon yapılandırma taslağı atıldı',
  'integration_config.publish': 'Entegrasyon yapılandırması yayımlandı',
  'integration_config.rollback': 'Entegrasyon yapılandırması geri alındı',
  'integration_config.lock_takeover': 'Yapılandırma düzenleme kilidi devralındı',
  'integration_config.set_intake': 'Sipariş alım durumu değiştirildi',
  'integration_config.propose_from_finding': 'Bulgudan yapılandırma önerisi oluşturuldu',
  'integration_compliance.transition': 'Uyum bulgusu durumu değiştirildi',
  'billing.webhook.invalid_signature': 'Ödeme bildirimi imzası doğrulanamadı',
}

export function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event
}

/** Olay grupları (`eventPrefix`). Önek, backend'deki `^<önek>` regex'iyle aynı anlamdadır. */
export const EVENT_GROUPS: { prefix: string; label: string; icon: string }[] = [
  { prefix: 'user.', label: 'Kullanıcı yönetimi', icon: 'mdi-account-cog-outline' },
  { prefix: 'password_reset.', label: 'Parola sıfırlama', icon: 'mdi-lock-reset' },
  { prefix: 'email.', label: 'E-posta doğrulama', icon: 'mdi-email-check-outline' },
  { prefix: 'tenant.', label: 'Mağaza hesabı ve veri', icon: 'mdi-store-cog-outline' },
  { prefix: 'stock.', label: 'Stok politikası', icon: 'mdi-scale-balance' },
  { prefix: 'integration', label: 'Entegrasyon', icon: 'mdi-connection' },
]

export function eventIcon(event: string): string {
  if (event === 'login' || event === 'register' || event === 'selectStore') return 'mdi-login-variant'
  const group = EVENT_GROUPS.find((g) => event.startsWith(g.prefix))
  return group?.icon ?? 'mdi-text-box-outline'
}

export interface EventOption {
  value: string
  title: string
  kind: 'prefix' | 'event'
}

export function eventOptions(): EventOption[] {
  const groups = EVENT_GROUPS.map((g) => ({ value: `prefix:${g.prefix}`, title: `${g.label} (tümü)`, kind: 'prefix' as const }))
  const events = Object.keys(EVENT_LABELS).map((e) => ({ value: `event:${e}`, title: EVENT_LABELS[e], kind: 'event' as const }))
  return [...groups, ...events]
}

export function eventKeyLabel(key: string | null): string {
  if (!key) return ''
  const parsed = parseEventKey(key)
  if (!parsed) return key
  if (parsed.kind === 'prefix') return EVENT_GROUPS.find((g) => g.prefix === parsed.value)?.label ?? parsed.value
  return eventLabel(parsed.value)
}

// ---- Sonuç tonu ----

export const RESULT_PRESENTATION: Record<AuditResult, { tone: StatusTone; labelKey: string }> = {
  ok: { tone: 'success', labelKey: 'auditLog.result.ok' },
  fail: { tone: 'warning', labelKey: 'auditLog.result.fail' },
  error: { tone: 'danger', labelKey: 'auditLog.result.error' },
}

export function resultPresentation(result: string): { tone: StatusTone; labelKey: string | null } {
  return RESULT_PRESENTATION[result as AuditResult] ?? { tone: 'neutral', labelKey: null }
}

// ---- Meta (yalnız ilkel alanlar) ----

export const META_LABELS: Record<string, string> = {
  roleCode: 'Rol',
  reason: 'Neden',
  integrationCode: 'Entegrasyon',
  primaryChannel: 'Birincil kanal',
  bufferUnits: 'Tampon adet',
  bufferPercent: 'Tampon yüzdesi',
  graceMinutes: 'Aşırı satış bekleme süresi (dk)',
  autoCancelOversold: 'Aşırı satışta otomatik iptal',
  jobId: 'İş kimliği',
  target: 'Hedef',
  version: 'Sürüm',
  draftRev: 'Taslak revizyonu',
  changedKeys: 'Değişen alan sayısı',
  fromVersion: 'Önceki sürüm',
  toVersion: 'Yeni sürüm',
  rollbackTo: 'Geri dönülen sürüm',
  intake: 'Alım durumu',
  findingId: 'Bulgu kimliği',
  action: 'Eylem',
  kind: 'Tür',
  type: 'Tür',
  ignoredKeys: 'Yok sayılan alanlar',
  reset: 'Varsayılana dönen alanlar',
  actor: 'İşlemi yapan',
  alreadyPending: 'Zaten bekliyordu',
  removed: 'Durdurulan iş sayısı',
  step: 'Adım',
  resumed: 'Kaldığı yerden sürdü',
  provider: 'Sağlayıcı',
}

export function metaRows(meta: AuditLogEntry['meta']): { key: string; label: string; value: string }[] {
  if (!meta || typeof meta !== 'object') return []
  return Object.entries(meta)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => ({
      key: k,
      label: META_LABELS[k] ?? k,
      value: typeof v === 'boolean' ? (v ? 'Evet' : 'Hayır') : String(v),
    }))
}

// ---- Kullanıcılar ----

export function toAuditUsers(res: any): AuditUser[] {
  const list: any[] = Array.isArray(res?.users) ? res.users : []
  return list
    .filter((u) => u && (typeof u._id === 'string' || typeof u._id === 'number'))
    .map((u) => {
      const full = [u.name, u.surname].filter((p) => typeof p === 'string' && p.trim()).join(' ').trim()
      return { id: String(u._id), name: full || (typeof u.email === 'string' ? u.email : String(u._id)) }
    })
    .filter((u) => USER_ID_RE.test(u.id))
}

export function shortId(id: string): string {
  return id.length > 8 ? `…${id.slice(-6)}` : id
}

// ---- API ----

export function isAuditLogResponse(value: any): value is AuditLogResponse {
  return !!value && typeof value === 'object' && Array.isArray(value.logs) && typeof value.totalNumberOfRecords === 'number'
}

export function useAuditLogApi() {
  const restApi = useRestApi()

  async function getAuditLogs(req: AuditLogRequest): Promise<ApiResult<AuditLogResponse>> {
    const res: any = await restApi.post('AuditService/getAuditLogs', req)
    const status = apiErrorStatus(res)
    if (status !== undefined) return { ok: false, status }
    if (!isAuditLogResponse(res)) return { ok: false, status: null }
    return { ok: true, data: res }
  }

  /** Filtre + ad çözümü için mağaza kullanıcıları (ilk 100). Başarısızsa boş liste — ekran kimlikle devam eder. */
  async function getUsers(): Promise<AuditUser[]> {
    const res: any = await restApi.post('UserService/getUsers', { pagination: { page: 1, limit: MAX_LIMIT } })
    if (apiErrorStatus(res) !== undefined) return []
    return toAuditUsers(res)
  }

  return { getAuditLogs, getUsers }
}
