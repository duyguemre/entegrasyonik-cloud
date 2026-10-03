/**
 * frontend/src/components/integrations/integrationCatalog.ts
 *
 * C1.2 — kanal kapsamı ("bu kanalda neler çalışır") ve dürüst "Yakında" kümesi için TEK kaynak istemci.
 * Sözleşme (SALT OKU): `IntegrationService/getCatalog {}` (member; backend `api/services/integration-service.ts`
 * `getCatalog` → `integration/catalog/IntegrationDescriptorRegistry.ts`) →
 *   [{ code, displayName, category, status, adapterVersion, capabilities: { <key>: { level, note } }, limitations, verification }]
 * `level` ∈ supported | limited | platform_auto | not_supported. Manifestoda HİÇ yazılmayan yetenek `not_supported`
 * sayılır (backend `catalog/types.ts` kuralı) — FE bunu yeniden türetmez, yalnızca aynı kuralı gösterir.
 *
 * Kurallar: uydurma yetenek/düzey YOK (yalnız backend manifestosu); katalog alınamazsa kapsam GÖSTERİLMEZ
 * (bilgi durumu), "Yakında" kümesi ise `docs/INTEGRATIONS_REGISTRY.md`'deki 6 canlı kodla aynı yedek listeye düşer.
 */
import useRestApi from '@/composables/restapi'
import type { StatusTone } from '@/design/status-map'

export type CapabilityLevel = 'supported' | 'limited' | 'platform_auto' | 'not_supported'
/** Backend kanonik kategori adı (`shipping`); FE ekranları DB adını (`shipment`) kullanır — bkz. `toCatalogCategory`. */
export type CatalogCategory = 'marketplace' | 'ecommerce' | 'erp' | 'einvoice' | 'shipping'

export interface CatalogCapability {
  level: CapabilityLevel
  note?: string
}

/** [eslesme-fiyat WP2, K-C] Kanalın marka eşleme biçimi (backend descriptor `brandMapping`). */
export type BrandMappingMode = 'id' | 'name' | 'attribute' | 'none'
const BRAND_MODES: BrandMappingMode[] = ['id', 'name', 'attribute', 'none']

export interface CatalogEntry {
  code: string
  /** Eski backend yanıtında yok → undefined (tüketici eski bayrağa düşer). */
  brandMapping?: BrandMappingMode
  displayName: string
  category: CatalogCategory
  status: string
  adapterVersion?: string
  capabilities: Record<string, CatalogCapability>
  limitations: string[]
  verification?: { liveApi?: boolean; mockEnvironment?: boolean } | null
}

export type CatalogResult = { ok: true; data: CatalogEntry[] } | { ok: false }

/** Katalog yüklenemediğinde "canlı" sayılan kodlar (backend manifestosundaki 6 adaptörle birebir; ADR-0014/N13). */
export const FALLBACK_LIVE_CODES: Record<CatalogCategory, string[]> = {
  marketplace: ['trendyol', 'hepsiburada', 'n11', 'pazarama'],
  ecommerce: ['ideasoft'],
  erp: ['bizimhesap'],
  einvoice: [],
  shipping: [],
}

export function toCatalogCategory(screenCategory: string): CatalogCategory {
  return (screenCategory === 'shipment' ? 'shipping' : screenCategory) as CatalogCategory
}

const LEVELS: CapabilityLevel[] = ['supported', 'limited', 'platform_auto', 'not_supported']

function isCatalogEntry(value: any): value is CatalogEntry {
  return !!value && typeof value === 'object' && typeof value.code === 'string' && !!value.capabilities && typeof value.capabilities === 'object'
}

/** Yanıtı yalnız sözleşmedeki alanlarla normalize eder; bilinmeyen düzey `not_supported` sayılır (fazla vaat YOK). */
export function normalizeCatalog(raw: any): CatalogEntry[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter(isCatalogEntry).map((entry: any) => ({
    code: String(entry.code).toLowerCase(),
    displayName: typeof entry.displayName === 'string' && entry.displayName ? entry.displayName : entry.code,
    category: entry.category,
    status: typeof entry.status === 'string' ? entry.status : '',
    adapterVersion: typeof entry.adapterVersion === 'string' ? entry.adapterVersion : undefined,
    brandMapping: BRAND_MODES.includes(entry.brandMapping) ? (entry.brandMapping as BrandMappingMode) : undefined,
    capabilities: Object.fromEntries(
      Object.entries(entry.capabilities as Record<string, any>).map(([key, cap]) => [
        key,
        {
          level: LEVELS.includes(cap?.level) ? (cap.level as CapabilityLevel) : 'not_supported',
          note: typeof cap?.note === 'string' ? cap.note : undefined,
        },
      ]),
    ),
    limitations: Array.isArray(entry.limitations) ? entry.limitations.filter((l: unknown) => typeof l === 'string') : [],
    verification: entry.verification && typeof entry.verification === 'object' ? entry.verification : null,
  }))
}

// Oturum boyunca tek istek: katalog statik kod verisidir (backend yeniden başlatılmadan değişmez).
let pending: Promise<CatalogResult> | null = null

export function useIntegrationCatalog() {
  const restApi = useRestApi()
  async function fetchCatalog(): Promise<CatalogResult> {
    const res: any = await restApi.post('IntegrationService/getCatalog', {})
    const data = normalizeCatalog(res)
    return data ? { ok: true, data } : { ok: false }
  }
  /** `force`: önceki başarısız/başarılı sonucu yok sayar (Tekrar dene). Başarısız sonuç önbellekte TUTULMAZ. */
  function getCatalog(force = false): Promise<CatalogResult> {
    if (!pending || force) {
      pending = fetchCatalog().then((result) => {
        if (!result.ok) pending = null
        return result
      })
    }
    return pending
  }
  return { getCatalog }
}

/** Yalnız testler için: modül önbelleğini sıfırlar. */
export function resetCatalogCache() {
  pending = null
}

/** Katalogdaki (kodu olan) sağlayıcılar = bu kategoride "canlı" sayılan kodlar. Katalog yoksa yedek liste. */
export function liveCodesFor(catalog: CatalogEntry[] | null, screenCategory: string): string[] {
  const category = toCatalogCategory(screenCategory)
  if (!catalog) return FALLBACK_LIVE_CODES[category] ?? []
  return catalog.filter((e) => e.category === category).map((e) => e.code)
}

// ---- Sunum ----

/** Kategori başına gösterilen yetenek anahtarları (sabit sıra → kanallar arası karşılaştırılabilir). */
export const CAPABILITY_KEYS_BY_CATEGORY: Record<CatalogCategory, string[]> = {
  marketplace: ['products', 'stockPrice', 'orders', 'orderActions', 'returns', 'questions', 'finance', 'shippingNotice', 'invoiceNotice', 'categories'],
  ecommerce: ['products', 'stockPrice', 'orders', 'orderActions', 'returns', 'questions', 'finance', 'shippingNotice', 'invoiceNotice', 'categories'],
  erp: ['products', 'stockPrice', 'orders', 'categories', 'accountingSync'],
  einvoice: ['einvoiceIssue', 'earchiveIssue', 'edespatchIssue', 'documentStatus', 'documentCancel', 'taxpayerLookup', 'documentPdf'],
  shipping: ['shipmentCreate', 'label', 'tracking', 'shipmentCancel', 'rates', 'returnShipment'],
}

export interface CapabilityRow {
  key: string
  level: CapabilityLevel
  note?: string
  /** Manifestoda yazılmamış (örtük `not_supported`). */
  implicit: boolean
}

export function capabilityRows(entry: CatalogEntry): CapabilityRow[] {
  const keys = [...(CAPABILITY_KEYS_BY_CATEGORY[entry.category] ?? [])]
  for (const key of Object.keys(entry.capabilities)) if (!keys.includes(key)) keys.push(key)
  return keys.map((key) => {
    const cap = entry.capabilities[key]
    return cap
      ? { key, level: cap.level, note: cap.note, implicit: false }
      : { key, level: 'not_supported' as const, implicit: true }
  })
}

export interface LevelPresentation {
  tone: StatusTone
  icon: string
  labelKey: string
}

export const LEVEL_PRESENTATION: Record<CapabilityLevel, LevelPresentation> = {
  supported: { tone: 'success', icon: 'mdi-check-circle-outline', labelKey: 'integrationCoverage.level.supported' },
  limited: { tone: 'warning', icon: 'mdi-alert-circle-outline', labelKey: 'integrationCoverage.level.limited' },
  platform_auto: { tone: 'info', icon: 'mdi-refresh', labelKey: 'integrationCoverage.level.platform_auto' },
  not_supported: { tone: 'neutral', icon: 'mdi-minus-circle-outline', labelKey: 'integrationCoverage.level.not_supported' },
}

export function levelCounts(rows: CapabilityRow[]): Record<CapabilityLevel, number> {
  const counts: Record<CapabilityLevel, number> = { supported: 0, limited: 0, platform_auto: 0, not_supported: 0 }
  for (const row of rows) counts[row.level]++
  return counts
}

/**
 * Manifesto notları geliştirici için yazılmıştır: iç başvuru parantezleri (`BACKLOG C10`, `INTEGRATIONS_REGISTRY §2.1`,
 * `limits.ts`), ters tırnaklar ve metot adları. Kullanıcıya gösterilmeden önce yalnız bu İÇ BAŞVURULAR ayıklanır —
 * cümlenin anlamı (sınır/koşul) KORUNUR; ayıklanınca boş kalan not gösterilmez.
 */
const INTERNAL_REF = /(BACKLOG|INTEGRATIONS_REGISTRY|§|\.ts\b|NOT_SUPPORTED|OrderQueueProducer|TRENDYOL_|coverage=|\(supported\)|retrieve[A-Z]|update[A-Z]|stream[A-Z]|transfer[A-Z]|approve[A-Z]|reject[A-Z])/

/** Kod tanımlayıcısı: `approveOrder`, `orderItemShipment`, `SellerInvoiceService`, yol `ms/product/tasks`. */
const CODE_TOKEN = /`[^`]*`|\b[a-z]+[A-Z]\w*\b|\b[A-Z][a-z]+[A-Z]\w*\b|\b\w+\/\w+/

export function userFacingNote(note: string | undefined | null): string {
  if (!note) return ''
  let text = note
  // İç başvuru ya da kod tanımlayıcısı içeren parantez grupları (iç içe olmayan) tümüyle çıkar.
  text = text.replace(/\s*\(([^()]*)\)/g, (match, inner) => (INTERNAL_REF.test(inner) || CODE_TOKEN.test(inner) ? '' : match))
  // Parantez dışında kalan iç başvuru / metot adı içeren cümleleri çıkar (ör. "`approveOrder` … `true` döner").
  text = text
    .split(/(?<=[.;])\s+/)
    .filter((sentence) => !INTERNAL_REF.test(sentence) && !/`[a-zA-Z]+[A-Z]\w*`/.test(sentence))
    .join(' ')
  text = text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/boş dizi/g, 'boş sonuç')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .trim()
    .replace(/;$/, '.')
  return text ? text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1) : ''
}
