/**
 * frontend/src/types/NotificationTypes.ts
 *
 * C1.5 (F-06) — bildirim merkezi sunum modeli. Tür kümesi backend şemasıyla
 * birebir (backend/src/database/client/models/Notification.ts `type` enum);
 * uydurma tür yok. Etiketler i18n anahtarıdır (`notificationCenter.types.*`).
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

/** Backend `severity` (success|info|warning|error|primary|danger) → tek anlamsal ton kümesi. */
export function notificationSeverityTone(severity: unknown): StatusTone {
  switch (severity) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
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
