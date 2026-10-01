/**
 * Hata → kullanıcı iletisi (premium-ui-standards "Hata Mesajı Standardı": "<ne oldu> — <ne yapılmalı>").
 * Sunucu iletisi (ERROR_CODES.md; Türkçe, ham değil) esas alınır; yalnız EYLEM kısmı koda göre eklenir. Ham istisna/yığın
 * ASLA gösterilmez. `kind` ekran durumunu seçer: `unavailable` → "degraded" kartı, `readonly` → salt-okuma bandı.
 */
import { AdminApiError } from '@bo/api/client'

export type ErrorKind =
  | 'cancelled'
  | 'readonly'
  | 'unavailable'
  | 'timeout'
  | 'conflict'
  | 'validation'
  | 'notFound'
  | 'forbidden'
  | 'rateLimited'
  | 'network'
  | 'generic'

export interface DescribedError {
  kind: ErrorKind
  code: string
  status: number
  /** Ne oldu (tek cümle). */
  title: string
  /** Ne yapılmalı. */
  action: string
  /** "<title> — <action>" (toast/diyalog satırı). */
  message: string
  requestId?: string
  fields?: Array<{ path: string; message: string }>
  /** Sunucunun koda özgü sayısal ayrıntısı (yalnız bilinen kodlarda okunur). */
  details?: Record<string, unknown>
  retryable: boolean
}

const ACTIONS: Record<ErrorKind, string> = {
  cancelled: 'İşlem uygulanmadı; yeniden başlatıp doğrulamayı tamamlayın.',
  readonly: 'Canlı salt-okuma kipi kapatıldığında yeniden deneyin.',
  unavailable: 'Birkaç dakika sonra yeniden deneyin; sürerse Altyapı ekranından bağımlılık durumunu kontrol edin.',
  timeout: 'Daha dar bir zaman aralığı seçip yeniden deneyin.',
  conflict: 'Güncel durumu görmek için listeyi yenileyin.',
  validation: 'İşaretli alanları düzeltip yeniden deneyin.',
  notFound: 'Kayıt başka bir işlemle kaldırılmış olabilir; listeyi yenileyin.',
  forbidden: 'Bu işlem bu hesapla yapılamaz.',
  rateLimited: 'Biraz bekleyip yeniden deneyin.',
  network: 'Bağlantınızı kontrol edip yeniden deneyin.',
  generic: 'Yeniden deneyin; sürerse istek kimliğiyle bildirin.',
}

const UNAVAILABLE = new Set(['QUEUE_UNAVAILABLE', 'INFRA_UNAVAILABLE', 'IMPERSONATION_UNAVAILABLE', 'ADMIN_INVITE_UNAVAILABLE', 'PROVIDER_ERROR'])

export function errorKind(e: AdminApiError): ErrorKind {
  if (e.cancelled) return 'cancelled'
  if (e.code === 'LIVE_READONLY' || e.status === 423) return 'readonly'
  if (e.code === 'QUERY_TIMEOUT' || e.status === 504) return 'timeout'
  if (UNAVAILABLE.has(e.code) || e.status === 503) return 'unavailable'
  if (e.code === 'VALIDATION' || e.code === 'WEAK_PASSWORD') return 'validation'
  if (e.status === 409) return 'conflict'
  if (e.status === 404) return 'notFound'
  if (e.status === 403) return 'forbidden'
  if (e.status === 429) return 'rateLimited'
  if (e.status === 0) return 'network'
  return 'generic'
}

const TITLES: Partial<Record<ErrorKind, string>> = {
  cancelled: 'Yeniden doğrulama yapılmadı',
  readonly: 'Canlı salt-okuma kipinde bu işlem kapalı',
  network: 'Sunucuya ulaşılamadı',
}

/** Koda özgü eylem (sözleşmedeki `details` ile). Bilinmeyen kod → tür eylemi. */
function codeAction(e: AdminApiError): string | null {
  if (e.code === 'TRIAL_EXTENSION_LIMIT') {
    const left = Number(e.details?.remainingDays)
    const max = Number(e.details?.maxTotalDays) || 60
    if (!Number.isFinite(left)) return `Toplam uzatma ${max} günü aşamaz; gün sayısını düşürüp yeniden deneyin.`
    return left > 0 ? `En fazla ${left} gün daha uzatabilirsiniz; gün sayısını düşürün.` : `Toplam ${max} günlük uzatma hakkı doldu; müşteriye ücretli plana geçişi önerin.`
  }
  if (e.code === 'TRIAL_NOT_ACTIVE') return 'Yalnız süren deneme ya da denemesi bitip askıya alınmış kartsız abonelik uzatılabilir; sayfayı yenileyin.'
  return null
}

function trimDot(s: string) {
  return s.trim().replace(/[.。]+$/, '')
}

export function describeError(error: unknown, overrides: Partial<Record<string, string>> = {}): DescribedError {
  const e = error instanceof AdminApiError ? error : new AdminApiError(0, { error: '' })
  const kind = error instanceof AdminApiError ? errorKind(e) : 'generic'
  const server = error instanceof AdminApiError ? e.message : ''
  const title = trimDot(overrides[e.code] ?? TITLES[kind] ?? (server || 'Beklenmeyen bir hata oluştu'))
  const action = (error instanceof AdminApiError ? codeAction(e) : null) ?? ACTIONS[kind]
  return {
    kind,
    code: e.code,
    status: e.status,
    title,
    action,
    message: `${title} — ${action}`,
    requestId: e.requestId,
    fields: e.fields,
    details: e.details,
    retryable: kind === 'unavailable' || kind === 'timeout' || kind === 'network' || kind === 'generic' || kind === 'rateLimited',
  }
}
