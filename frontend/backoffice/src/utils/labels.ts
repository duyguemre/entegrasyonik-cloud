import type { AlertLevel, AnnouncementAudience, AnnouncementKind, AnnouncementSeverity, AnnouncementStatus, DeliveryStatus, IssueStatus, LogCategory, LogLevel, LogSource, SubscriptionStatus, TenantStatus } from '@bo/api/contract'
import type { StatusTone } from '@entegrasyonik/ui/components'

export const CATEGORY: Record<LogCategory, { label: string; icon: string }> = {
  integration: { label: 'Entegrasyon', icon: 'mdi-transit-connection-variant' },
  order: { label: 'Sipariş', icon: 'mdi-package-variant-closed' },
  catalog: { label: 'Katalog', icon: 'mdi-tag-multiple-outline' },
  auth: { label: 'Kimlik', icon: 'mdi-shield-account-outline' },
  billing: { label: 'Faturalama', icon: 'mdi-credit-card-outline' },
  platform: { label: 'Platform', icon: 'mdi-server-outline' },
}

export const SOURCE: Record<LogSource, string> = {
  api: 'API',
  engine: 'Motor',
  adapter: 'Adaptör',
  worker: 'İşçi',
  webhook: 'Webhook',
  auth: 'Kimlik',
  scheduler: 'Zamanlayıcı',
  client: 'İstemci',
  'legacy-console': 'Eski console',
}

export const LEVEL: Record<LogLevel, { label: string; tone: StatusTone; icon: string }> = {
  fatal: { label: 'Kritik', tone: 'danger', icon: 'mdi-alert-octagon' },
  error: { label: 'Hata', tone: 'danger', icon: 'mdi-close-circle' },
  warn: { label: 'Uyarı', tone: 'warning', icon: 'mdi-alert' },
  info: { label: 'Bilgi', tone: 'info', icon: 'mdi-information' },
}

export const ISSUE_STATUS: Record<IssueStatus, { label: string; tone: StatusTone }> = {
  open: { label: 'Açık', tone: 'danger' },
  acknowledged: { label: 'İnceleniyor', tone: 'warning' },
  resolved: { label: 'Çözüldü', tone: 'success' },
  muted: { label: 'Susturuldu', tone: 'neutral' },
}

/** Clients.status (B2 yaşam döngüsü). */
export const TENANT_STATUS: Record<TenantStatus, { label: string; tone: StatusTone }> = {
  PROVISIONING: { label: 'Kuruluyor', tone: 'info' },
  PROVISIONING_FAILED: { label: 'Kurulum başarısız', tone: 'danger' },
  ACTIVE: { label: 'Aktif', tone: 'success' },
  DELETION_PENDING: { label: 'Silme bekliyor', tone: 'warning' },
  PURGING: { label: 'Siliniyor', tone: 'warning' },
  PURGE_FAILED: { label: 'Silme başarısız', tone: 'danger' },
  PURGED: { label: 'Silindi', tone: 'neutral' },
}

/** Subscriptions.status (ADR-0008 durum makinesi). */
export const SUB_STATUS: Record<SubscriptionStatus, { label: string; tone: StatusTone }> = {
  trialing: { label: 'Deneme', tone: 'info' },
  active: { label: 'Aktif', tone: 'success' },
  past_due: { label: 'Ödeme gecikti', tone: 'warning' },
  suspended: { label: 'Askıda', tone: 'danger' },
  canceled: { label: 'İptal edildi', tone: 'neutral' },
  expired: { label: 'Süresi doldu', tone: 'neutral' },
}

/** Plan kodu → ad (plans.seed.json). Bilinmeyen kod olduğu gibi gösterilir. */
export const PLAN: Record<string, string> = { starter: 'Başlangıç', growth: 'Büyüme', enterprise: 'Kurumsal' }
export const planLabel = (code: string | null | undefined) => (code ? (PLAN[code] ?? code) : '—')

export const CHANNEL: Record<string, string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
  n11: 'N11',
  pazarama: 'Pazarama',
  ideasoft: 'Ideasoft',
  bizimhesap: 'Bizimhesap',
}

/** Sağlık durumu → rozet (genel bakış kartları ve bölümler; BO_UI_PATTERNS §5). */
export type HealthState = 'ok' | 'degraded' | 'fail' | 'unknown'
export const HEALTH: Record<HealthState, { label: string; tone: StatusTone; icon: string }> = {
  ok: { label: 'Sağlıklı', tone: 'success', icon: 'mdi-check-circle' },
  degraded: { label: 'Kısmi bozulma', tone: 'warning', icon: 'mdi-alert' },
  fail: { label: 'Erişilemiyor', tone: 'danger', icon: 'mdi-close-circle' },
  unknown: { label: 'Bilinmiyor', tone: 'neutral', icon: 'mdi-help-circle-outline' },
}

// ---------------------------------------------------------------- Bildirimler ve duyurular (NB7/NB8)
export const ANN_STATUS: Record<AnnouncementStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Taslak', tone: 'neutral' },
  scheduled: { label: 'Zamanlandı', tone: 'info' },
  active: { label: 'Yayında', tone: 'success' },
  ended: { label: 'Bitti', tone: 'neutral' },
  cancelled: { label: 'İptal edildi', tone: 'warning' },
}
export const ANN_KIND: Record<AnnouncementKind, { label: string; icon: string; hint: string }> = {
  info: { label: 'Bilgi', icon: 'mdi-information-outline', hint: 'Genel bilgilendirme; kullanıcı kapatabilir.' },
  release: { label: 'Yenilik', icon: 'mdi-star-four-points-outline', hint: 'Yeni özellik ya da değişiklik; kullanıcı kapatabilir.' },
  maintenance: { label: 'Planlı bakım', icon: 'mdi-wrench-clock', hint: 'Bakım penceresi; bant kapatılamaz.' },
  incident: { label: 'Olay', icon: 'mdi-alert-octagon-outline', hint: 'Süren kesinti ya da gecikme; bant kapatılamaz.' },
}
export const ANN_SEVERITY: Record<AnnouncementSeverity, { label: string; tone: StatusTone; alert: 'info' | 'warning' | 'error' }> = {
  info: { label: 'Bilgi', tone: 'info', alert: 'info' },
  warning: { label: 'Uyarı', tone: 'warning', alert: 'warning' },
  critical: { label: 'Kritik', tone: 'danger', alert: 'error' },
}
export const ANN_AUDIENCE: Record<AnnouncementAudience, string> = {
  all_members: 'Tüm üyeler',
  owners_admins: 'Yalnız sahip ve yöneticiler',
}
export const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; tone: StatusTone; hint: string }> = {
  pending: { label: 'Bekliyor', tone: 'info', hint: 'Gönderim sırasında.' },
  sending: { label: 'Gönderiliyor', tone: 'info', hint: 'İşçi şu an gönderiyor; dokunulmaz.' },
  sent: { label: 'Gönderildi', tone: 'success', hint: 'E-posta sunucusu kabul etti.' },
  failed: { label: 'Başarısız', tone: 'warning', hint: 'Geçici hata; otomatik yeniden denenecek.' },
  dead: { label: 'Kalıcı hata', tone: 'danger', hint: 'Deneme hakkı bitti; elle yeniden denenebilir ya da atılabilir.' },
  skipped: { label: 'Atlandı', tone: 'neutral', hint: 'Tercih, doğrulanmamış adres ya da sessiz saat nedeniyle gönderilmedi.' },
  suppressed: { label: 'Bastırıldı', tone: 'neutral', hint: 'Elle atıldı ya da bastırıldı; bir daha denenmez.' },
}
/** Teslim hata sınıfı kodu → açıklama (ham SMTP metni gelmez). */
export const DELIVERY_ERROR: Record<string, string> = {
  disabled: 'E-posta kanalı kapalı',
  unverified: 'Adres doğrulanmamış',
  no_recipient: 'Alıcı yok',
  opt_out: 'Kullanıcı e-postayı kapatmış',
  misconfigured: 'E-posta yapılandırması eksik',
  quiet_hours: 'Sessiz saat',
  shadow: 'Gölge mod (gönderilmedi)',
  discarded: 'Elle atıldı',
  SMTP_4XX: 'E-posta sunucusu geçici red',
  SMTP_5XX: 'E-posta sunucusu kalıcı red',
  SMTP_TIMEOUT: 'E-posta sunucusu zaman aşımı',
}
export const deliveryErrorLabel = (code: string | null | undefined) => (code ? (DELIVERY_ERROR[code] ?? (code.startsWith('SMTP_') ? 'E-posta sunucusu hatası' : code)) : '—')
export const NOTIFY_CATEGORY: Record<string, string> = {
  order: 'Sipariş',
  stock: 'Stok',
  integration: 'Entegrasyon',
  catalog: 'Katalog',
  finance: 'Finans',
  system: 'Sistem',
  platform: 'Platform',
  billing: 'Faturalama',
  account: 'Hesap',
}
export const NOTIFY_SEVERITY: Record<string, { label: string; tone: StatusTone }> = {
  info: { label: 'Bilgi', tone: 'info' },
  success: { label: 'Başarılı', tone: 'success' },
  warning: { label: 'Uyarı', tone: 'warning' },
  error: { label: 'Hata', tone: 'danger' },
  critical: { label: 'Kritik', tone: 'danger' },
}
export const ALERT_LEVEL: Record<AlertLevel, { label: string; tone: StatusTone }> = {
  warning: { label: 'Uyarı', tone: 'warning' },
  critical: { label: 'Kritik', tone: 'danger' },
}
export const ALERT_RULE: Record<string, { label: string; hint: string }> = {
  R1: { label: 'Entegrasyon hata oranı', hint: '15 dk içinde ≥20 çağrı ve hata oranı ≥%20 (≥%50 kritik).' },
  R2: { label: 'Kimlik hatası / devre kesici', hint: 'Kimlik hatası 15 dk\'da ≥3 ya da devre kesici 10 dk\'dan uzun açık.' },
  R4: { label: 'Sipariş kuyruğu birikimi', hint: 'Bekleyen iş >200 ya da en eski >10 dk.' },
  R7: { label: 'Teslim edilemeyen bildirimler', hint: 'Son 1 saatte ≥10 kalıcı hatalı teslim.' },
}
