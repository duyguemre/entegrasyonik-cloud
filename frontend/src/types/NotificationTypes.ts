/**
 * frontend/src/types/NotificationTypes.ts
 *
 * C1.5 (F-06) — bildirim merkezi sunum modeli. Tür kümesi backend şemasıyla
 * birebir (backend/src/database/client/models/Notification.ts `type` enum);
 * uydurma tür yok. Etiketler i18n anahtarıdır (`notificationCenter.types.*`).
 *
 * C2b (ADR-0029, NOTIFICATION_PLAN §2) — v2 alanları: katalog `code`, `category`, `critical` önem, grup sayacı
 * (`count`/`lastOccurredAt`), `params`. Eski `type` alanı YALNIZ yedek ikon/kategori içindir (v2'de `category`
 * yoksa eşlenir). Kategori/kod listesi `stores/notificationCatalog.ts`'ten (getCatalog) gelir; burada yalnız
 * sabit sunum eşlemesi (kategori → ikon, önem → ton) durur.
 */
import type { StatusTone } from '@/design/status-map'

export type NotificationType = 'BATCH_PROCESS' | 'ORDER' | 'STOCK_ALERT' | 'INFO' | 'SYSTEM' | 'EXPORT_READY' | 'IMPORT_READY'

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'STOCK_ALERT',
  'SYSTEM',
  'ORDER',
  'BATCH_PROCESS',
  'IMPORT_READY',
  'EXPORT_READY',
  'INFO',
]

/**
 * "Dikkat" türleri: listede her zaman üstte sabit. Tercih ayarı (susturma) bu turda YOK (B-07);
 * zorunlu kategoriler ileride de kapatılamaz (araştırma notu Konu 5).
 */
export const ATTENTION_TYPES: readonly NotificationType[] = ['STOCK_ALERT', 'SYSTEM']

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  STOCK_ALERT: 'mdi-package-variant-remove',
  SYSTEM: 'mdi-shield-alert-outline',
  ORDER: 'mdi-cart-outline',
  BATCH_PROCESS: 'mdi-layers-triple-outline',
  IMPORT_READY: 'mdi-file-import-outline',
  EXPORT_READY: 'mdi-file-export-outline',
  INFO: 'mdi-information-outline',
}

export const isNotificationType = (value: unknown): value is NotificationType =>
  typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value)

export const isAttentionType = (value: unknown): boolean =>
  typeof value === 'string' && (ATTENTION_TYPES as readonly string[]).includes(value)

export const notificationTypeIcon = (value: unknown): string =>
  isNotificationType(value) ? NOTIFICATION_TYPE_ICONS[value] : 'mdi-bell-outline'

/** Backend `severity` (success|info|warning|error|critical|primary|danger) → tek anlamsal ton kümesi. */
export function notificationSeverityTone(severity: unknown): StatusTone {
  switch (severity) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
    case 'critical':
    case 'danger':
      return 'danger'
    case 'info':
    case 'primary':
      return 'info'
    default:
      return 'neutral'
  }
}

/**
 * `actionUrl` yalnız UYGULAMA İÇİ bir yol ise döner (ör. `/orders`); dış adres, protokol
 * içeren (`javascript:`, `https:`), protokol-göreli (`//alan`) ya da ters eğik çizgili değerler
 * reddedilir → `undefined` ("Görüntüle" gösterilmez, dış URL asla açılmaz).
 */
export function internalActionPath(actionUrl: unknown): string | undefined {
  if (typeof actionUrl !== 'string') return undefined
  const value = actionUrl.trim()
  if (!value.startsWith('/') || value.startsWith('//')) return undefined
  if (value.includes('\\') || /^\/*[a-z][a-z0-9+.-]*:/i.test(value)) return undefined
  return value
}

// ---------------------------------------------------------------------------------------------------------------
// C2b — ADR-0029 v2 modeli
// ---------------------------------------------------------------------------------------------------------------

/** NOTIFICATION_PLAN §2.1 kategori kümesi (sıra = tercih ekranı ve filtre sırası). */
export type NotificationCategory = 'order' | 'stock' | 'integration' | 'catalog' | 'finance' | 'billing' | 'security' | 'system'

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'order',
  'stock',
  'integration',
  'catalog',
  'finance',
  'billing',
  'security',
  'system',
]

export const isNotificationCategory = (value: unknown): value is NotificationCategory =>
  typeof value === 'string' && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)

/** v2 önem kümesi; `critical` yeni (danger + vurgu). Eski `primary`/`danger` değerleri de okunur. */
export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error' | 'critical'

export const NOTIFICATION_SEVERITIES: readonly NotificationSeverity[] = ['critical', 'error', 'warning', 'info', 'success']

export function normalizeSeverity(value: unknown): NotificationSeverity {
  switch (value) {
    case 'critical':
    case 'error':
    case 'warning':
    case 'success':
      return value
    case 'danger':
      return 'error'
    default:
      return 'info'
  }
}

/** E-posta kanalı modu (plan §2: `inst` anında, `dig` özet, `off` kapalı). */
export type EmailMode = 'inst' | 'dig' | 'off'

export const EMAIL_MODES: readonly EmailMode[] = ['off', 'inst', 'dig']

/** Uygulama içi bildirim satırı (NotificationService/get). v2 alanları isteğe bağlıdır — eski kayıtlarda yoktur. */
export interface NotificationItem {
  _id: string
  /** v2 katalog kodu (ör. `STOCK_OVERSOLD`). */
  code?: string
  category?: string
  /** Eski tür (yalnız yedek ikon/kategori). */
  type?: string
  severity?: string
  title?: string
  message?: string
  params?: Record<string, unknown>
  actionUrl?: string | null
  metaData?: Record<string, any>
  mode?: string
  isRead: boolean
  createdAt?: string
  /** Grup sayacı (aynı grup penceresinde tekrarlanan olay sayısı). */
  count?: number
  lastOccurredAt?: string
  mandatory?: boolean
}

/** Kategori → MDI ikon (ikon kapsülünde; anlam tonu önemden gelir). */
export const CATEGORY_ICONS: Record<NotificationCategory, string> = {
  order: 'mdi-cart-outline',
  stock: 'mdi-package-variant-closed',
  integration: 'mdi-connection',
  catalog: 'mdi-layers-triple-outline',
  finance: 'mdi-cash-multiple',
  billing: 'mdi-credit-card-outline',
  security: 'mdi-shield-lock-outline',
  system: 'mdi-bullhorn-outline',
}

/** Kod bazlı ince ayar: kategori ikonundan daha açıklayıcı olduğu yerler. */
export const CODE_ICONS: Record<string, string> = {
  STOCK_OVERSOLD: 'mdi-package-variant-remove',
  STOCK_OVERSOLD_UNRESOLVED: 'mdi-package-variant-remove',
  STOCK_UNMAPPED_LINE: 'mdi-link-variant-off',
  STOCK_REALLOCATED: 'mdi-swap-horizontal',
  INTEGRATION_AUTH_FAILED: 'mdi-key-alert-outline',
  INTEGRATION_CIRCUIT_OPEN: 'mdi-lan-disconnect',
  CATALOG_IMPORT_COMPLETED: 'mdi-file-import-outline',
  CATALOG_IMPORT_FAILED: 'mdi-file-import-outline',
  SECURITY_PASSWORD_CHANGED: 'mdi-lock-reset',
  SECURITY_SUPPORT_ACCESS_STARTED: 'mdi-account-eye-outline',
  BILLING_PAYMENT_FAILED: 'mdi-credit-card-remove-outline',
  SYSTEM_ANNOUNCEMENT: 'mdi-bullhorn-outline',
}

/** Eski `type` → v2 kategori (v2 alanı olmayan kayıtlar için). */
const LEGACY_TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  STOCK_ALERT: 'stock',
  ORDER: 'order',
  BATCH_PROCESS: 'catalog',
  IMPORT_READY: 'catalog',
  EXPORT_READY: 'catalog',
  SYSTEM: 'system',
  INFO: 'system',
}

/**
 * Bildirimin kategorisi: sunucu `category` → katalogdaki kodun kategorisi → eski `type` eşlemesi. Bilinmiyorsa
 * `undefined` (uydurulmaz; filtrede "Diğer" sayılmaz, yalnız "Tümü" altında görünür).
 */
export function notificationCategory(
  item: Pick<NotificationItem, 'category' | 'code' | 'type'>,
  codeCategory?: (code: string) => NotificationCategory | undefined,
): NotificationCategory | undefined {
  if (isNotificationCategory(item.category)) return item.category
  if (item.code && codeCategory) {
    const fromCatalog = codeCategory(item.code)
    if (fromCatalog) return fromCatalog
  }
  if (item.code) {
    const prefix = item.code.split('_')[0]?.toLowerCase()
    if (isNotificationCategory(prefix)) return prefix
  }
  return isNotificationType(item.type) ? LEGACY_TYPE_CATEGORY[item.type] : undefined
}

export type NotificationVisualTone = 'success' | 'info' | 'warning' | 'error' | 'neutral'

/** Görsel: ikon (kod → kategori → eski tür) + ton (önem). `critical` ayrıca vurgulanır. */
export function notificationVisual(
  item: Pick<NotificationItem, 'category' | 'code' | 'type' | 'severity'>,
  codeCategory?: (code: string) => NotificationCategory | undefined,
): { icon: string; tone: NotificationVisualTone; critical: boolean; category?: NotificationCategory } {
  const category = notificationCategory(item, codeCategory)
  const icon =
    (item.code && CODE_ICONS[item.code]) ||
    (category ? CATEGORY_ICONS[category] : undefined) ||
    notificationTypeIcon(item.type)
  const severity = normalizeSeverity(item.severity)
  const tone: NotificationVisualTone = severity === 'critical' || severity === 'error' ? 'error' : severity
  return { icon, tone, critical: severity === 'critical', category }
}

/** i18n yedeği: `{param}` yer tutucularını params ile doldurur (bilinmeyen yer tutucu olduğu gibi kalır). */
export function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = params[key]
    return value === undefined || value === null ? whole : String(value)
  })
}
