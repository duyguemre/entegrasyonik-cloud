/**
 * Bildirimler, duyurular, teslim günlüğü, olay kataloğu, platform uyarıları — NB7/NB8 (BO-N1..BO-N3)
 * (docs/cloud-contracts/API_BACKOFFICE_NOTIFICATIONS.md). [BE HAZIR]
 * Kaynak: backend/src/api/services/backoffice-notification-service.ts; şema rpc-input/backoffice-notifications.ts (strict gövde,
 * iç içe duyuru nesnesi de strict). Sızıntı kuralı: teslim satırında e-posta/kullanıcı kimliği/metin YOK; tenant geçmişi yalnız
 * meta veri; test e-postası yalnız yöneticinin kendi adresine gider (yanıtta adres yok).
 */

export type AnnouncementKind = 'info' | 'maintenance' | 'incident' | 'release'
export type AnnouncementSeverity = 'info' | 'warning' | 'critical'
export type AnnouncementStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled'
export type AnnouncementAudience = 'all_members' | 'owners_admins'
export interface AnnouncementText {
  tr: string
  en?: string
}
export type AnnouncementTarget = { mode: 'all' } | { mode: 'plans'; planCodes: string[] } | { mode: 'tenants'; tids: number[] }
export interface AnnouncementChannels {
  banner: boolean
  inApp: boolean
  email: boolean
}

/** create/update/önizleme taslağı girdisi. `email:true` → `inApp:true` zorunlu; maintenance/incident kapatılamaz (sunucu zorlar). */
export interface AnnouncementInput {
  kind: AnnouncementKind
  severity?: AnnouncementSeverity
  title: AnnouncementText
  body: AnnouncementText
  target: AnnouncementTarget
  audience?: AnnouncementAudience
  channels: AnnouncementChannels
  startsAt: string
  endsAt?: string | null
  dismissible?: boolean
}

export interface Announcement {
  id: string
  kind: AnnouncementKind
  severity: AnnouncementSeverity
  title: AnnouncementText
  body: AnnouncementText
  target: AnnouncementTarget
  audience: AnnouncementAudience
  channels: AnnouncementChannels
  startsAt: string
  endsAt: string | null
  dismissible: boolean
  status: AnnouncementStatus
  emailConsentAt: string | null
  /** Dağıtım başladıysa dolu; `null` = henüz dağıtılmadı. */
  fanout: { done: boolean; tenants: number; notified: number } | null
  createdBy: string
  updatedBy: string | null
  scheduledBy: string | null
  cancelledBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ListAnnouncementsRequest {
  status?: AnnouncementStatus
  kind?: AnnouncementKind
  /** `startsAt` aralığı (ISO). */
  from?: string
  to?: string
  cursor?: string
  limit?: number
}

export interface AnnouncementBanner {
  id: string
  kind: AnnouncementKind
  severity: AnnouncementSeverity
  title: AnnouncementText
  body: AnnouncementText
  dismissible: boolean
  startsAt: string
  endsAt: string | null
}
export interface AnnouncementPreview {
  banner: AnnouncementBanner
  notification: Record<'tr' | 'en', { title: string; message: string }>
  /** `html` sunucuda kaçışlıdır; yine de YALNIZ `<iframe sandbox srcdoc>` ile gösterilir (asla innerHTML). */
  email: Record<'tr' | 'en', { subject: string; text: string; html: string }>
}

// ---------------------------------------------------------------- BO-N2 teslim günlüğü
export type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'dead' | 'skipped' | 'suppressed'
export type DeliveryWindow = '24h' | '7d'
export interface DeliveryWindowStats {
  byStatus: Record<DeliveryStatus, number>
  byChannelStatus: Array<{ channel: 'email'; status: DeliveryStatus; count: number }>
  /** Toplama göre azalan, ≤100. */
  byCode: Array<{ code: string; statuses: Partial<Record<DeliveryStatus, number>> }>
}
export interface DeliveryStats {
  generatedAt: string
  /** En eski bekleyen teslimin vadesinden bu yana saniye; `null` = bekleyen yok. */
  oldestPendingAgeSec: number | null
  windows: Record<DeliveryWindow, DeliveryWindowStats>
}
export interface DeliveryRow {
  id: string
  eventId: string
  /** 0 = platform alarm teslimi. */
  tid: number
  code: string
  channel: 'email'
  mode: 'instant' | 'digest'
  status: DeliveryStatus
  attempts: number
  /** Sınıf kodu (disabled, unverified, no_recipient, opt_out, misconfigured, quiet_hours, shadow, discarded, SMTP_*); ham SMTP metni değil. */
  lastErrorCode: string | null
  createdAt: string
  nextAttemptAt: string | null
  sentAt: string | null
}
export interface ListDeliveriesRequest {
  status?: DeliveryStatus
  channel?: 'email'
  tid?: number
  code?: string
  eventId?: string
  cursor?: string
  limit?: number
}

// ---------------------------------------------------------------- katalog + şablon
export interface NotificationCatalogItem {
  code: string
  category: string
  severities: string[]
  mandatory: boolean
  defaultChannels: { inApp: boolean; email: 'off' | 'instant' | 'digest' }
  permission: string
  retention: string
  surface: 'tenant' | 'platform'
  titleKey: string
  bodyKey: string
  grouped: boolean
  legacy: boolean
  /** `previewTemplate` örnek parametreleri. */
  example: Record<string, string | number | boolean>
}
export interface PreviewTemplateRequest {
  code: string
  locale: 'tr' | 'en'
  channel: 'inApp' | 'email'
  params?: Record<string, string | number | boolean>
}
export type TemplatePreview =
  | { channel: 'inApp'; locale: 'tr' | 'en'; title: string; message: string; actionPath: string | null; severity: string }
  | { channel: 'email'; locale: 'tr' | 'en'; subject: string; text: string; html: string }

// ---------------------------------------------------------------- BO-N3 tenant geçmişi
export interface TenantHistoryRow {
  /** Olay kimliği (satır detayı: listDeliveries { eventId }). */
  id: string
  at: string
  code: string
  category: string
  severity: string
  /** Grup penceresindeki olay sayısı. */
  count: number
  recipientCount: number
  inAppCount: number
  emailQueued: number
  suppressedCount: number
  /** Boş `{}` = e-posta yok. */
  emailStatus: Partial<Record<DeliveryStatus, number>>
}

// ---------------------------------------------------------------- NB8 platform uyarıları
export type AlertRuleId = 'R1' | 'R2' | 'R4' | 'R7'
export type AlertLevel = 'warning' | 'critical'
export type AlertStatus = 'firing' | 'resolved'
export interface AlertRow {
  id: string
  ruleId: AlertRuleId | string
  scopeKey: string
  level: AlertLevel
  status: AlertStatus
  /** Yalnız sayı/kod: R1 integ,tid,total,errors,rate · R2 auth integ,tid,authErrors · R2 devre integ,openCircuits,openForSec · R4 wait,oldestWaitSec · R7 dead. */
  detail: Record<string, string | number>
  firstFiredAt: string
  lastSeenAt: string
  lastNotifiedAt: string | null
  resolvedAt: string | null
  mutedUntil: string | null
  /** Gölge mod: kayıt tutulur, bildirim gitmez. */
  shadow: boolean
}
export interface ListAlertsRequest {
  status?: AlertStatus
  level?: AlertLevel
  ruleId?: string
  cursor?: string
  limit?: number
}
/** Susturma süresi (saat): 1–336; 0 susturmayı kaldırır. */
export const ALERT_MUTE_MAX_HOURS = 336

// ---------------------------------------------------------------- MOB-06 web push (BackofficePrefsService; backend backoffice-prefs-service.ts)
/** Bu yöneticinin kayıtlı cihazı (uç/anahtar DÖNMEZ). */
export interface BoPushDevice {
  id: string
  deviceLabel: string | null
  createdAt: string
  lastSuccessAt: string | null
}
/** Kanal kapalıysa (`NOTIFY_V2_ENABLED`/VAPID yok) `enabled:false`, `publicKey:null`, cihaz listesi boş. */
export interface BoPushConfig {
  enabled: boolean
  /** Tarayıcı web push (VAPID) açıksa açık anahtar; değilse null. */
  publicKey: string | null
  /** Android kabuğu yerel push (FCM) açık mı (MOB-07). */
  fcm: boolean
  devices: BoPushDevice[]
}
/** Tarayıcı aboneliği YA DA Android kabuğu FCM belirteci — yalnız biri. */
export type BoPushSubscribeRequest =
  | { subscription: { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } }; deviceLabel?: string }
  | { fcmToken: string; deviceLabel?: string }

interface Page<T> {
  items: T[]
  nextCursor: string | null
}

declare module '../contract' {
  interface AdminRpc {
    'BackofficeNotificationService/listAnnouncements': [ListAnnouncementsRequest, Page<Announcement>]
    'BackofficeNotificationService/getAnnouncement': [{ id: string }, { announcement: Announcement }]
    'BackofficeNotificationService/createAnnouncement': [{ announcement: AnnouncementInput; reason: string }, { announcement: Announcement }]
    'BackofficeNotificationService/updateAnnouncement': [{ id: string; announcement: AnnouncementInput; reason: string }, { announcement: Announcement }]
    'BackofficeNotificationService/scheduleAnnouncement': [{ id: string; emailConsent?: boolean; reason: string }, { announcement: Announcement }]
    'BackofficeNotificationService/cancelAnnouncement': [{ id: string; reason: string }, { announcement: Announcement }]
    'BackofficeNotificationService/previewAnnouncement': [{ id: string } | { draft: AnnouncementInput }, AnnouncementPreview]
    'BackofficeNotificationService/getDeliveryStats': [Record<string, never>, DeliveryStats]
    'BackofficeNotificationService/listDeliveries': [ListDeliveriesRequest, Page<DeliveryRow>]
    'BackofficeNotificationService/retryDelivery': [{ id: string; tid?: number; reason: string }, { id: string; ok: true }]
    'BackofficeNotificationService/discardDelivery': [{ id: string; tid?: number; reason: string }, { id: string; ok: true }]
    'BackofficeNotificationService/getCatalog': [Record<string, never>, { items: NotificationCatalogItem[] }]
    'BackofficeNotificationService/previewTemplate': [PreviewTemplateRequest, TemplatePreview]
    'BackofficeNotificationService/sendTestEmail': [{ reason: string }, { sent: true }]
    'BackofficeNotificationService/getTenantHistory': [{ tid: number; cursor?: string; limit?: number }, Page<TenantHistoryRow>]
    'BackofficeNotificationService/listAlerts': [ListAlertsRequest, Page<AlertRow>]
    'BackofficePrefsService/getPushConfig': [Record<string, never>, BoPushConfig]
    'BackofficePrefsService/subscribePush': [BoPushSubscribeRequest, { ok: true }]
    'BackofficePrefsService/unsubscribePush': [{ endpoint: string } | { id: string } | { fcmToken: string }, { removed: number }]
    'BackofficeNotificationService/muteAlert': [{ ruleId: string; scopeKey: string; hours: number; reason: string }, { ruleId: string; scopeKey: string; mutedUntil: string | null }]
  }
}
