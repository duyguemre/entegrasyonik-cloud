/**
 * frontend/src/stores/notificationCatalog.ts
 *
 * C2b (ADR-0029 Karar 1, NOTIFICATION_PLAN §2) — bildirim olay kataloğu: kod → kategori / önem / zorunluluk /
 * varsayılan kanal. Kaynak `NotificationService/getCatalog` (NB4, oturum başına BİR kez). Uç yoksa ya da hata
 * verirse plan §2.1 v1 tablosunun AYNI içerikli istemci kopyası (`FALLBACK_CATALOG`) kullanılır — ekran boş kalmaz,
 * ama `source === 'fallback'` olarak işaretlenir (tercih ekranı "varsayılan katalog" notu gösterir).
 *
 * Sunum etiketleri (kategori adı, kısa olay adı) burada tr/en sözlük olarak durur: paylaşılan locale JSON'larına
 * dokunmadan (paralel dallarla çakışma yok) i18n'e hazır. Sunucunun `title`/`message` alanı içerik için esastır;
 * buradaki kısa ad yalnız filtre/tercih/yedek başlık içindir.
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { registerStoreReset } from '@/stores/resetRegistry'
import {
  CATEGORY_ICONS,
  NOTIFICATION_CATEGORIES,
  isNotificationCategory,
  normalizeSeverity,
  type EmailMode,
  type NotificationCategory,
  type NotificationSeverity,
} from '@/types/NotificationTypes'

export interface CatalogEntry {
  code: string
  category: NotificationCategory
  /** Olası önemler (ör. `warning/critical`); ilki varsayılan. */
  severities: NotificationSeverity[]
  mandatory: boolean
  /** Varsayılan e-posta modu (tercih yoksa). */
  email: EmailMode
}

export interface CategoryDefaults {
  inApp: boolean
  email: EmailMode
}

export interface CategoryMeta {
  key: NotificationCategory
  icon: string
  codes: string[]
  mandatoryCodes: string[]
  /** Kategorinin TÜM kodları zorunlu → satır tümüyle kilitli (billing, security). */
  locked: boolean
  defaults: CategoryDefaults
}

export type CatalogSource = 'none' | 'server' | 'fallback'

const EMAIL_VALUES: readonly EmailMode[] = ['inst', 'dig', 'off']
const isEmailMode = (v: unknown): v is EmailMode => typeof v === 'string' && (EMAIL_VALUES as readonly string[]).includes(v)

/** Plan §2.3 — tercih matrisi varsayılanları (tenant varsayılanı yoksa). */
export const CATEGORY_DEFAULTS: Record<NotificationCategory, CategoryDefaults> = {
  order: { inApp: true, email: 'dig' },
  stock: { inApp: true, email: 'dig' },
  integration: { inApp: true, email: 'dig' },
  catalog: { inApp: true, email: 'off' },
  finance: { inApp: true, email: 'dig' },
  billing: { inApp: true, email: 'inst' },
  security: { inApp: true, email: 'inst' },
  system: { inApp: true, email: 'off' },
}

const e = (code: string, category: NotificationCategory, severities: NotificationSeverity[], mandatory: boolean, email: EmailMode): CatalogEntry => ({
  code,
  category,
  severities,
  mandatory,
  email,
})

/** Plan §2.1 v1 tenant kodları (LEGACY_* köprüsü hariç) — yalnız getCatalog yokken. */
export const FALLBACK_CATALOG: readonly CatalogEntry[] = [
  e('ORDER_SYNC_WINDOW_OVERFLOW', 'order', ['warning'], false, 'off'),
  e('ORDER_SYNC_FAILED', 'order', ['error'], false, 'dig'),
  e('ORDER_SYNC_LAGGING', 'order', ['warning', 'critical'], false, 'inst'),
  e('STOCK_OVERSOLD', 'stock', ['critical'], true, 'inst'),
  e('STOCK_UNMAPPED_LINE', 'stock', ['warning'], true, 'dig'),
  e('STOCK_REALLOCATED', 'stock', ['success'], false, 'off'),
  e('STOCK_LINE_AUTO_CANCELLED', 'stock', ['warning'], false, 'dig'),
  e('STOCK_COMPENSATION_MANUAL', 'stock', ['error'], true, 'inst'),
  e('STOCK_OVERSOLD_UNRESOLVED', 'stock', ['warning'], true, 'dig'),
  e('INTEGRATION_AUTH_FAILED', 'integration', ['critical'], true, 'inst'),
  e('INTEGRATION_CIRCUIT_OPEN', 'integration', ['warning'], false, 'off'),
  e('INTEGRATION_ERROR_RATE_HIGH', 'integration', ['warning', 'critical'], false, 'dig'),
  e('INTEGRATION_CHANGE_NOTICE', 'integration', ['info', 'warning'], false, 'dig'),
  e('CATALOG_BATCH_SUBMITTED', 'catalog', ['success', 'warning'], false, 'off'),
  e('CATALOG_BATCH_FAILED', 'catalog', ['error'], false, 'off'),
  e('CATALOG_IMPORT_COMPLETED', 'catalog', ['success'], false, 'off'),
  e('CATALOG_IMPORT_FAILED', 'catalog', ['error'], false, 'dig'),
  e('CATALOG_EXPORT_ERRORS_DIGEST', 'catalog', ['warning'], false, 'dig'),
  e('FINANCE_RECONCILIATION_MISMATCH', 'finance', ['warning'], false, 'dig'),
  e('BILLING_TRIAL_ENDING', 'billing', ['warning'], true, 'inst'),
  e('BILLING_TRIAL_ENDED', 'billing', ['error'], true, 'inst'),
  e('BILLING_SUSPENSION_WARNING', 'billing', ['critical'], true, 'inst'),
  e('BILLING_SUSPENDED', 'billing', ['critical'], true, 'inst'),
  e('BILLING_PAYMENT_FAILED', 'billing', ['error'], true, 'inst'),
  e('SECURITY_PASSWORD_CHANGED', 'security', ['warning'], true, 'inst'),
  e('SECURITY_SUPPORT_ACCESS_STARTED', 'security', ['warning'], true, 'off'),
  e('SECURITY_MEMBER_ROLE_CHANGED', 'security', ['info'], true, 'inst'),
  e('SECURITY_OWNERSHIP_TRANSFERRED', 'security', ['warning'], true, 'inst'),
  e('SYSTEM_ANNOUNCEMENT', 'system', ['info', 'warning'], false, 'off'),
]

/** Kısa etiketler (tr/en). `events` kısa ad = filtre/tercih/yedek başlık. */
export const NOTIFICATION_LABELS = {
  tr: {
    categories: {
      order: 'Siparişler',
      stock: 'Stok',
      integration: 'Entegrasyonlar',
      catalog: 'Katalog aktarımları',
      finance: 'Finans',
      billing: 'Abonelik ve ödeme',
      security: 'Güvenlik',
      system: 'Sistem duyuruları',
    },
    categoryHints: {
      order: 'Sipariş eşitleme sorunları ve gecikmeler',
      stock: 'Aşırı satış, eşleşmeyen satır, otomatik telafi',
      integration: 'Pazaryeri bağlantısı, hata oranı, API değişiklikleri',
      catalog: 'Toplu gönderim, içe/dışa aktarma sonuçları',
      finance: 'Mutabakat uyuşmazlıkları',
      billing: 'Deneme süresi, ödeme ve askı uyarıları',
      security: 'Parola, rol, destek erişimi, sahiplik devri',
      system: 'Bakım, olay ve ürün duyuruları',
    },
    severities: { critical: 'Kritik', error: 'Hata', warning: 'Uyarı', info: 'Bilgi', success: 'Başarılı' },
    events: {
      ORDER_SYNC_WINDOW_OVERFLOW: 'Sipariş penceresi taştı',
      ORDER_SYNC_FAILED: 'Sipariş eşitlenemedi',
      ORDER_SYNC_LAGGING: 'Sipariş eşitleme gecikiyor',
      STOCK_OVERSOLD: 'Aşırı satış',
      STOCK_UNMAPPED_LINE: 'Eşleşmeyen sipariş satırı',
      STOCK_REALLOCATED: 'Stok yeniden ayrıldı',
      STOCK_LINE_AUTO_CANCELLED: 'Satır otomatik iptal edildi',
      STOCK_COMPENSATION_MANUAL: 'Elle telafi gerekiyor',
      STOCK_OVERSOLD_UNRESOLVED: 'Çözülmemiş aşırı satışlar',
      INTEGRATION_AUTH_FAILED: 'Pazaryeri kimlik doğrulaması başarısız',
      INTEGRATION_CIRCUIT_OPEN: 'Entegrasyon geçici olarak durduruldu',
      INTEGRATION_ERROR_RATE_HIGH: 'Entegrasyon hata oranı yüksek',
      INTEGRATION_CHANGE_NOTICE: 'Pazaryeri API değişikliği',
      CATALOG_BATCH_SUBMITTED: 'Toplu gönderim alındı',
      CATALOG_BATCH_FAILED: 'Toplu gönderim başarısız',
      CATALOG_IMPORT_COMPLETED: 'İçe aktarma tamamlandı',
      CATALOG_IMPORT_FAILED: 'İçe aktarma başarısız',
      CATALOG_EXPORT_ERRORS_DIGEST: 'Aktarım hataları özeti',
      FINANCE_RECONCILIATION_MISMATCH: 'Mutabakat uyuşmazlığı',
      BILLING_TRIAL_ENDING: 'Deneme süresi bitiyor',
      BILLING_TRIAL_ENDED: 'Deneme süresi bitti',
      BILLING_SUSPENSION_WARNING: 'Hesap askıya alınacak',
      BILLING_SUSPENDED: 'Hesap askıya alındı',
      BILLING_PAYMENT_FAILED: 'Ödeme alınamadı',
      SECURITY_PASSWORD_CHANGED: 'Parola değiştirildi',
      SECURITY_SUPPORT_ACCESS_STARTED: 'Destek erişimi başladı',
      SECURITY_MEMBER_ROLE_CHANGED: 'Üye rolü değişti',
      SECURITY_OWNERSHIP_TRANSFERRED: 'Mağaza sahipliği devredildi',
      SYSTEM_ANNOUNCEMENT: 'Sistem duyurusu',
    } as Record<string, string>,
  },
  en: {
    categories: {
      order: 'Orders',
      stock: 'Stock',
      integration: 'Integrations',
      catalog: 'Catalog transfers',
      finance: 'Finance',
      billing: 'Subscription & billing',
      security: 'Security',
      system: 'System announcements',
    },
    categoryHints: {
      order: 'Order sync problems and delays',
      stock: 'Oversell, unmapped lines, automatic compensation',
      integration: 'Marketplace connection, error rate, API changes',
      catalog: 'Batch submissions, import/export results',
      finance: 'Reconciliation mismatches',
      billing: 'Trial, payment and suspension notices',
      security: 'Password, role, support access, ownership transfer',
      system: 'Maintenance, incident and product announcements',
    },
    severities: { critical: 'Critical', error: 'Error', warning: 'Warning', info: 'Info', success: 'Success' },
    events: {
      ORDER_SYNC_WINDOW_OVERFLOW: 'Order window overflowed',
      ORDER_SYNC_FAILED: 'Order sync failed',
      ORDER_SYNC_LAGGING: 'Order sync lagging',
      STOCK_OVERSOLD: 'Oversold',
      STOCK_UNMAPPED_LINE: 'Unmapped order line',
      STOCK_REALLOCATED: 'Stock reallocated',
      STOCK_LINE_AUTO_CANCELLED: 'Line auto-cancelled',
      STOCK_COMPENSATION_MANUAL: 'Manual compensation needed',
      STOCK_OVERSOLD_UNRESOLVED: 'Unresolved oversells',
      INTEGRATION_AUTH_FAILED: 'Marketplace authentication failed',
      INTEGRATION_CIRCUIT_OPEN: 'Integration temporarily paused',
      INTEGRATION_ERROR_RATE_HIGH: 'High integration error rate',
      INTEGRATION_CHANGE_NOTICE: 'Marketplace API change',
      CATALOG_BATCH_SUBMITTED: 'Batch submitted',
      CATALOG_BATCH_FAILED: 'Batch failed',
      CATALOG_IMPORT_COMPLETED: 'Import completed',
      CATALOG_IMPORT_FAILED: 'Import failed',
      CATALOG_EXPORT_ERRORS_DIGEST: 'Export errors digest',
      FINANCE_RECONCILIATION_MISMATCH: 'Reconciliation mismatch',
      BILLING_TRIAL_ENDING: 'Trial ending',
      BILLING_TRIAL_ENDED: 'Trial ended',
      BILLING_SUSPENSION_WARNING: 'Account will be suspended',
      BILLING_SUSPENDED: 'Account suspended',
      BILLING_PAYMENT_FAILED: 'Payment failed',
      SECURITY_PASSWORD_CHANGED: 'Password changed',
      SECURITY_SUPPORT_ACCESS_STARTED: 'Support access started',
      SECURITY_MEMBER_ROLE_CHANGED: 'Member role changed',
      SECURITY_OWNERSHIP_TRANSFERRED: 'Store ownership transferred',
      SYSTEM_ANNOUNCEMENT: 'System announcement',
    } as Record<string, string>,
  },
} as const

export type NotificationLocale = keyof typeof NOTIFICATION_LABELS

export function labelsFor(locale: unknown) {
  return NOTIFICATION_LABELS[locale === 'en' ? 'en' : 'tr']
}

function toSeverities(raw: unknown): NotificationSeverity[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[/,|]/) : []
  const out = list.map((s) => normalizeSeverity(String(s).trim())).filter((s, i, a) => a.indexOf(s) === i)
  return out.length ? out : ['info']
}

/**
 * getCatalog yanıtı → girdi listesi (savunmacı; alan uydurmaz). Kabul edilen biçimler:
 * `{data: {codes|events: [...]}}`, `{data: [...]}`, `{codes: [...]}`. Girdi alanları: `code`, `category`,
 * `severity` (dize, `a/b` ya da dizi) | `severities`, `mandatory`, e-posta varsayılanı `channels.email` |
 * `defaultEmail` | `email`. Geçersiz satırlar atlanır; hiç geçerli satır yoksa `null`.
 */
export function normalizeCatalog(response: any): CatalogEntry[] | null {
  if (response && response.result === false) return null
  const data = response?.data ?? response
  const list: unknown = Array.isArray(data) ? data : data?.codes ?? data?.events
  if (!Array.isArray(list)) return null
  const out: CatalogEntry[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, any>
    const code = typeof row.code === 'string' ? row.code.trim() : ''
    if (!code || seen.has(code) || code.startsWith('LEGACY_') || row.surface === 'platform') continue
    if (!isNotificationCategory(row.category)) continue
    const emailRaw = row.channels?.email ?? row.defaultEmail ?? row.email
    seen.add(code)
    out.push({
      code,
      category: row.category,
      severities: toSeverities(row.severities ?? row.severity),
      mandatory: row.mandatory === true,
      email: isEmailMode(emailRaw) ? emailRaw : CATEGORY_DEFAULTS[row.category as NotificationCategory].email,
    })
  }
  return out.length ? out : null
}

/** Girdiler → kategori satırları (plan sırası; girdisi olmayan kategori de listelenir — tercih matrisi sabit). */
export function buildCategories(entries: readonly CatalogEntry[]): CategoryMeta[] {
  return NOTIFICATION_CATEGORIES.map((key) => {
    const rows = entries.filter((x) => x.category === key)
    const mandatoryCodes = rows.filter((x) => x.mandatory).map((x) => x.code)
    return {
      key,
      icon: CATEGORY_ICONS[key],
      codes: rows.map((x) => x.code),
      mandatoryCodes,
      locked: rows.length > 0 && mandatoryCodes.length === rows.length,
      defaults: { ...CATEGORY_DEFAULTS[key] },
    }
  })
}

export const useNotificationCatalogStore = defineStore('notificationCatalog', () => {
  const restApi = useRestApi()
  const entries = ref<CatalogEntry[]>([])
  const source = ref<CatalogSource>('none')
  let pending: Promise<void> | null = null

  const byCode = computed(() => new Map(entries.value.map((x) => [x.code, x])))
  const categories = computed(() => buildCategories(entries.value))

  /** Oturum başına bir kez: getCatalog → normalize; olmazsa plan v1 yedeği. */
  function ensureLoaded(): Promise<void> {
    if (source.value !== 'none') return Promise.resolve()
    if (pending) return pending
    pending = (async () => {
      let parsed: CatalogEntry[] | null = null
      try {
        parsed = normalizeCatalog(await restApi.post('NotificationService/getCatalog', {}))
      } catch (error) {
        logger.error('Bildirim kataloğu alınamadı', { module: 'notificationCatalog', op: 'ensureLoaded', error })
      }
      entries.value = parsed ?? FALLBACK_CATALOG.map((x) => ({ ...x, severities: [...x.severities] }))
      source.value = parsed ? 'server' : 'fallback'
    })().finally(() => {
      pending = null
    })
    return pending
  }

  const entry = (code: string | undefined) => (code ? byCode.value.get(code) : undefined)
  const codeCategory = (code: string) => byCode.value.get(code)?.category
  const isMandatory = (code: string | undefined) => !!entry(code)?.mandatory

  registerStoreReset('notificationCatalog', () => {
    entries.value = []
    source.value = 'none'
    pending = null
  })

  return { entries, source, categories, ensureLoaded, entry, codeCategory, isMandatory }
})
