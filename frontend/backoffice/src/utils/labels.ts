import type { IssueStatus, LifecycleStatus, LogCategory, LogLevel, LogSource } from '@bo/api/contract'
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

export const LIFECYCLE: Record<LifecycleStatus, { label: string; tone: StatusTone }> = {
  trialing: { label: 'Deneme', tone: 'info' },
  active: { label: 'Aktif', tone: 'success' },
  past_due: { label: 'Ödeme gecikti', tone: 'warning' },
  suspended: { label: 'Askıda', tone: 'danger' },
  pending_deletion: { label: 'Silme bekliyor', tone: 'neutral' },
}

export const PLAN: Record<string, string> = { baslangic: 'Başlangıç', profesyonel: 'Profesyonel', kurumsal: 'Kurumsal' }

export const CHANNEL: Record<string, string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
  n11: 'N11',
  pazarama: 'Pazarama',
  ideasoft: 'Ideasoft',
  bizimhesap: 'Bizimhesap',
}
