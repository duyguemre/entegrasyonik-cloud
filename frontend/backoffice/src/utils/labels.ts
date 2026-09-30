import type { IssueStatus, LogCategory, LogLevel, LogSource, SubscriptionStatus, TenantStatus } from '@bo/api/contract'
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
