/**
 * frontend/src/composables/errorCodes.ts
 *
 * Faz 3 / C2a — sunucu hata KODU → kullanıcı iletisi (i18n anahtarı). Kaynak: docs/cloud-contracts/ERROR_CODES.md
 * (RPC zarfı `{ error, code, requestId }`; "FE ileti eşlemesi `code`'a göre yapılmalı, `error` metni yedektir") +
 * API_IDEMPOTENCY.md. Saf modül (i18n'e bağlı değil): anahtar döner, bileşen `t(key)` ile çevirir.
 *
 * `restApi.post` hatayı fırlatmaz, axios hata nesnesini değer olarak döner (BR-20) — hata olup olmadığını
 * `apiErrors.ts` `isApiError` söyler; bu modül yalnız İLETİ eşlemesidir (alan çıkarımı `apiErrors.ts` ile aynı).
 */
import { apiCode, apiStatus } from '@/composables/apiErrors'

/** Kodu bilinen ve ayrı iletisi olan hatalar — `apiErrors.<KOD>` anahtarı tr.json/en.json'da ZORUNLU (test korur). */
export const MAPPED_ERROR_CODES = [
  // genel
  'VALIDATION', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED', 'QUOTA_EXCEEDED', 'PLAN_REQUIRED',
  'SUBSCRIPTION_RESTRICTED', 'REAUTH_REQUIRED', 'INTERNAL',
  // entegrasyon
  'AUTH', 'UNAVAILABLE', 'NOT_SUPPORTED', 'UNKNOWN_OUTCOME',
  // hesap yaşam döngüsü
  'INVALID_REQUEST', 'INVALID_CURRENT_PASSWORD', 'SAME_PASSWORD', 'WEAK_PASSWORD', 'TOKEN_INVALID', 'EMAIL_NOT_CONFIGURED',
  'COOLDOWN', 'MAIL_FAILED',
  // davet / üyelik / sahiplik (ADR-0028)
  'INVITATION_INVALID', 'INVITATION_EXPIRED', 'INVITATION_REVOKED', 'INVITATION_ACCEPTED', 'INVITATION_RATE_LIMITED',
  'PLAN_LIMIT_REACHED', 'ALREADY_MEMBER', 'EMAIL_TAKEN', 'LAST_OWNER', 'ALREADY_OWNER', 'TARGET_NOT_ACTIVE',
  'TARGET_EMAIL_UNVERIFIED',
  // idempotency (ADR-0030 X3)
  'IDEMPOTENCY_IN_PROGRESS', 'IDEMPOTENCY_KEY_REUSED',
] as const

export type MappedErrorCode = (typeof MAPPED_ERROR_CODES)[number]

/** Kodu olmayan (ya da bilinmeyen) hatalar için duruma göre yedek anahtarlar. */
export const FALLBACK_ERROR_KEYS = {
  network: 'apiErrors.NETWORK',
  generic: 'apiErrors.GENERIC',
} as const

/** Ekran bağlamına özel iletiler: kod ya da HTTP durumu → anahtar (ör. davet uçlarında kodsuz 404 = "bekleyen değil"). */
export type ErrorContextOverrides = Partial<Record<MappedErrorCode | `HTTP_${number}`, string>>

export interface ApiFailure {
  status?: number
  code?: string
  requestId?: string
  /** Sunucunun insan-okunur iletisi (yalnız yedek; WEAK_PASSWORD kuralları burada gelir). */
  serverMessage?: string
  /** Kullanıcı yeniden doğrulamayı iptal etti — işlem yapılmadı, ileti GÖSTERİLMEZ. */
  cancelled: boolean
}

export function describeFailure(resp: unknown): ApiFailure {
  const r = resp as any
  const data = r?.response?.data
  const headers = r?.response?.headers ?? {}
  return {
    status: apiStatus(r),
    code: apiCode(r),
    requestId: (typeof data?.requestId === 'string' ? data.requestId : undefined) ?? headers['x-request-id'],
    serverMessage: typeof data?.error === 'string' ? data.error : undefined,
    cancelled: r?.reauthCancelled === true,
  }
}

const MAPPED = new Set<string>(MAPPED_ERROR_CODES)

const STATUS_FALLBACK: Record<number, MappedErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
  502: 'UNAVAILABLE',
  503: 'UNAVAILABLE',
}

/**
 * Hata → i18n anahtarı. Öncelik: bağlam kodu → genel kod → bağlam HTTP durumu → duruma göre genel → ağ/genel.
 * Kullanıcı yeniden doğrulamayı iptal ettiyse `null` (sessiz).
 */
export function errorMessageKey(resp: unknown, overrides: ErrorContextOverrides = {}): string | null {
  const f = describeFailure(resp)
  if (f.cancelled) return null
  if (f.code && overrides[f.code as MappedErrorCode]) return overrides[f.code as MappedErrorCode]!
  if (f.code && MAPPED.has(f.code)) return `apiErrors.${f.code}`
  if (f.status === undefined) return FALLBACK_ERROR_KEYS.network
  const httpKey = `HTTP_${f.status}` as const
  if (overrides[httpKey]) return overrides[httpKey]!
  const byStatus = STATUS_FALLBACK[f.status]
  if (byStatus) return `apiErrors.${byStatus}`
  return f.status >= 500 ? 'apiErrors.INTERNAL' : FALLBACK_ERROR_KEYS.generic
}

/** Planı yükseltme yönlendirmesi gösterilmeli mi (yetki hatası DEĞİL — ADR-0028 Karar 4)? */
export function isPlanLimit(resp: unknown): boolean {
  const code = describeFailure(resp).code
  return code === 'PLAN_LIMIT_REACHED' || code === 'QUOTA_EXCEEDED' || code === 'PLAN_REQUIRED'
}
