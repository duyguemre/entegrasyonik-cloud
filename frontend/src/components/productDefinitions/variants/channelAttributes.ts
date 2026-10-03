// Varyant KANAL ÖZELLİKLERİ ortak katmanı — tek varyant (ProductVariantAttributesComponent) ve toplu
// (ProductBatchVariantAttributesComponent) özellik diyalogları aynı kanal listesini, özellik yüklemesini, değer
// biçimini ve kanal bilgisi etiketlerini kullanır. Değer satırı: AttrValueField.vue · stiller: channelAttributeEditor.css.
// Veri yolu değişmedi: `variant.platforms[kanal].attributes[özellikId] = { attributeName, attributeValue, attributeValueId }`,
// `variant.platforms[kanal].mapping` (kanal bilgileri).
import { computed, defineAsyncComponent, ref } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useAttributeMappingStore } from '@/stores/site/attributeMapping'
import type { IntegrationErrorInfo } from '@/composables/useIntegrationError'

export interface StoredAttr { attributeName: string; attributeValue: string; attributeValueId: string }
export interface AttrOptionItem { id: string; title: string; level?: number; mandatory?: boolean }

/** Kanala özgü "kanal bilgileri" form bileşenleri (genel VariantInfoComponent'e ek). */
export const platformInfoComponents = new Map<string, any>([
  ['hepsiburada', defineAsyncComponent(() => import('./platformInfos/HepsiburadaVariantInfoComponent.vue'))],
  ['trendyol', defineAsyncComponent(() => import('./platformInfos/TrendyolVariantInfoComponent.vue'))],
  ['n11', defineAsyncComponent(() => import('./platformInfos/N11VariantInfoComponent.vue'))],
  ['pazarama', defineAsyncComponent(() => import('./platformInfos/PazaramaVariantInfoComponent.vue'))],
  ['ideasoft', defineAsyncComponent(() => import('./platformInfos/IdeasoftVariantInfoComponent.vue'))],
])

/** Kanal bilgisi alanlarının okunur adları (önizleme / değişiklik listesi). */
export const INFO_LABELS: Record<string, string> = {
  title: 'Varyant başlığı', shippingDuration: 'Kargo süresi', desi: 'Desi', warranty: 'Garanti süresi',
  maxPurchaseQuantity: 'Maks. satılabilir adet', shippingId: 'Kargo firması', fastDeliveryType: 'Teslimat seçeneği',
  stockTypeLabel: 'Stok tipi', customShippingCost: 'Özel kargo ücreti', hasGift: 'Hediye paketi', cities: 'Şehirler',
}

export const isFilled = (v: any) => !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length))
export const infoDisplay = (v: any) => (v === undefined || v === null || v === '' ? '—'
  : typeof v === 'boolean' ? (v ? 'Evet' : 'Hayır') : Array.isArray(v) ? `${v.length} seçim` : String(v))

/** Saklanan değerin (nesne ya da eski düz kimlik/metin) okunur metni. */
export function attrValueText(a: any, stored: any): string {
  if (stored === undefined || stored === null || stored === '') return ''
  if (typeof stored === 'object') {
    return String(stored.attributeValue ?? '') || String(a?.values?.find((v: any) => String(v.id) === String(stored.attributeValueId))?.title ?? '')
  }
  return String(a?.values?.find((v: any) => String(v.id) === String(stored))?.title ?? stored)
}

/**
 * [eslesme-fiyat WP2, Ek C P0-2] Değer listesi ayrı uçtan yüklenmeli mi: liste değerli (serbest değil) ve listesi boş özellik ya da
 * adaptörün `lazyValues` işaretlediği özellik. Eskiden yalnız `lazyValues`'a bakılıyordu; Hepsiburada bu bayrağı hiç set etmediğinden
 * HB liste özellikleri formda hep "Uyan değer yok" kalıyordu (eşleme ekranı aynı kuralla değerleri çekiyordu).
 */
export const needsValueFetch = (a: any): boolean => !!a && !(a.values?.length) && (!!a.lazyValues || !a.allowCustom)

/** Değer alanının boş liste durumu (AttrValueField'in dört durumu; bkz. `valueEmptyState`). */
export type ValueEmptyState = 'loading' | 'noMatch' | 'channelError' | 'channelEmpty'

/** Saf: liste boşken hangi durumun gösterileceği. */
export function valueEmptyState(input: { loading: boolean; query: string; valueCount: number; error?: unknown }): ValueEmptyState {
  if (input.loading) return 'loading'
  if (input.valueCount > 0 && input.query) return 'noMatch'
  return input.error ? 'channelError' : 'channelEmpty'
}

/** Saklanan değerin kimliği (karşılaştırma için). */
export const attrValueId = (stored: any): string =>
  stored && typeof stored === 'object' ? String(stored.attributeValueId ?? '') : stored ? String(stored) : ''

/** Saklanan değeri yeni nesne biçimine çevirir (eski düz değer gelirse). */
export function normalizeStored(a: any, stored: any): StoredAttr | undefined {
  if (stored === undefined || stored === null || stored === '') return undefined
  if (typeof stored === 'object') return { attributeName: stored.attributeName ?? a?.title ?? '', attributeValue: attrValueText(a, stored), attributeValueId: String(stored.attributeValueId ?? '') }
  return { attributeName: a?.title ?? '', attributeValue: attrValueText(a, stored), attributeValueId: a?.allowCustom ? '' : String(stored) }
}

/** Seçim/yazım → saklanan nesne. Boş → null (değer kaldırılır). */
export function toStoredAttr(a: any, val: any): StoredAttr | null {
  if (val === null || val === undefined || val === '') return null
  let id = ''
  let text = ''
  if (typeof val === 'object') { id = String(val.id ?? ''); text = String(val.title ?? val.name ?? val.value ?? '') }
  else if (a.allowCustom) {
    text = String(val)
    const m = a.values?.find((v: any) => String(v.title ?? '').toLocaleLowerCase('tr') === text.toLocaleLowerCase('tr'))
    if (m) { id = String(m.id); text = String(m.title) }
  } else {
    id = String(val)
    text = String(a.values?.find((v: any) => String(v.id) === id)?.title ?? id)
  }
  return { attributeName: a.title, attributeValue: text, attributeValueId: id }
}

export const sameStored = (x: StoredAttr | undefined, y: StoredAttr | undefined) =>
  (x?.attributeValueId || '') === (y?.attributeValueId || '') && (x?.attributeValue || '') === (y?.attributeValue || '')

/**
 * Değer listesi: aramayı İÇEREN ilk `limit` değer (başa uyanlar önce; [eslesme-fiyat WP2, Ek C P1-2] eskiden yalnız baştan eşleşme:
 * "mavi" → "Koyu Mavi" bulunmuyordu); seçili değer her zaman listede.
 */
export function attrOptions(a: any, query: string, selectedId: string | undefined, limit = 200): AttrOptionItem[] {
  const q = (query || '').toLocaleLowerCase('tr')
  const all: AttrOptionItem[] = (a.values || []).map((v: any) => ({ id: String(v.id), title: String(v.title ?? v.name ?? v.id), level: v.level, mandatory: v.mandatory }))
  const lower = (v: AttrOptionItem) => v.title.toLocaleLowerCase('tr')
  const shown = q ? [...all.filter((v) => lower(v).startsWith(q)), ...all.filter((v) => !lower(v).startsWith(q) && lower(v).includes(q))] : all
  const out = shown.slice(0, limit)
  if (selectedId && !out.some((v) => v.id === selectedId)) { const s = all.find((v) => v.id === selectedId); if (s) out.unshift(s) }
  return out
}

/**
 * Kanal listesi + kanal özellik yüklemesi (hata yolu görünür; özel eşlemeli özellikler — ör. marka — elenir).
 * `keep`: hangi özellikler bu diyalogda düzenlenir (toplu: varyant ekseni hariç; tek varyant: hepsi).
 */
export function useChannelAttributes(opts: { category: () => any; keep?: (a: any) => boolean }) {
  const integrationStore = useIntegrationStore()
  const categoriesStore = useCategoriesStore()
  const attributeMappingStore = useAttributeMappingStore()

  const channels = computed<Array<{ code: string; title: string }>>(() => (integrationStore.getClientMarketplaces() || [])
    .filter((p: any) => p?.type?.code === 'marketplace')
    .map((p: any) => ({ code: p.code as string, title: integrationStore.getIntegrationTitle(p.code) || p.title || p.code })))
  const channelTitle = (code: string): string => channels.value.find((c) => c.code === code)?.title || code
  const categoryTitle = computed(() => categoriesStore.getCategoryTitle(opts.category()) || 'ürün')
  const mappingState = (code: string): { code: string; choices: string[] } =>
    (code ? categoriesStore.checkCategoryPlatformMapping(opts.category(), code) : { code: 'SUCCESS', choices: [] })

  const attrs = ref(new Map<string, any[]>())
  const attrErrors = ref(new Map<string, IntegrationErrorInfo>())
  const retrying = ref(false)
  const isCustomMap = (code: string, attributeId: any) =>
    !!integrationStore.getIntegrationCustomMap(code)?.find((x: any) => String(x.attributeId) === String(attributeId))
  const integrationCategoryId = (code: string) => categoriesStore.getIntegrationCategoryId(code, opts.category())

  /** [eslesme-fiyat WP2] Bu özellik bu kategoride (AttributeMappings) yerel bir seçeneğe eşli mi — "Eşlemeye git" bağlantısı için. */
  const isAttributeMapped = (code: string, a: any): boolean =>
    attributeMappingStore.attributeMappingsFor(code, opts.category()).some((m: any) => String(m.platformAttributeId) === String(a?._id) && !!m.localChoiceId)

  async function loadAttrs(code: string) {
    if (!code || attrs.value.get(code)) return
    // Kategori kimliği AttributeMappings'ten gelir (tek kaynak); eşleme yoksa kanal çağrılmaz, `mappingState` 'PLATFORM' uyarısını gösterir.
    await attributeMappingStore.ensureLoaded()
    const platformCategoryId = integrationCategoryId(code)
    if (!platformCategoryId) return
    const result = await integrationStore.loadIntegrationCategoryChoices(code, platformCategoryId)
    const errors = new Map(attrErrors.value)
    if (result.ok) {
      errors.delete(code)
      const list = result.data.filter((a: any) => !isCustomMap(code, a._id) && (!opts.keep || opts.keep(a)))
      // Sıra: varyant ekseni → zorunlu → isteğe bağlı (kanalın kendi sırası korunur).
      const rank = (a: any) => (a.varianter || a.slicer ? 0 : a.required ? 1 : 2)
      const next = new Map(attrs.value)
      next.set(code, [...list].sort((a: any, b: any) => rank(a) - rank(b)))
      attrs.value = next
    } else errors.set(code, result.error)
    attrErrors.value = errors
  }
  async function retry(code: string) { retrying.value = true; try { await loadAttrs(code) } finally { retrying.value = false } }

  /** Değer listesi ayrı uçtan gelen özellik (bkz. `needsValueFetch`): menü açılınca bir kez yükle; hata/boş SESSİZ DEĞİL (`valueErrors`). */
  const lazyLoading = ref(new Set<string>())
  const valueErrors = ref(new Map<string, IntegrationErrorInfo>())
  async function loadLazyValues(code: string, a: any, force = false) {
    if (!needsValueFetch(a) || lazyLoading.value.has(a._id) || (!force && valueErrors.value.has(a._id))) return
    lazyLoading.value = new Set([...lazyLoading.value, a._id])
    try {
      const platformCategoryId = integrationCategoryId(code)
      if (!platformCategoryId) return
      const result = await integrationStore.loadIntegrationCategoryAttributeValues(code, platformCategoryId, a._id)
      const errs = new Map(valueErrors.value)
      if (result.ok) { a.values = result.data; errs.delete(a._id) } else if (!result.error?.empty) errs.set(a._id, result.error)
      else errs.delete(a._id)
      valueErrors.value = errs
    } finally {
      const s = new Set(lazyLoading.value); s.delete(a._id); lazyLoading.value = s
    }
  }
  const retryValues = (code: string, a: any) => loadLazyValues(code, a, true)

  return { channels, channelTitle, categoryTitle, mappingState, attrs, attrErrors, retrying, loadAttrs, retry, loadLazyValues, retryValues, lazyLoading, valueErrors, isAttributeMapped }
}
