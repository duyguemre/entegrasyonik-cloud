// Varyant KANAL ÖZELLİKLERİ ortak katmanı — tek varyant (ProductVariantAttributesComponent) ve toplu
// (ProductBatchVariantAttributesComponent) özellik diyalogları aynı kanal listesini, özellik yüklemesini, değer
// biçimini ve kanal bilgisi etiketlerini kullanır. Değer satırı: AttrValueField.vue · stiller: channelAttributeEditor.css.
// Veri yolu değişmedi: `variant.platforms[kanal].attributes[özellikId] = { attributeName, attributeValue, attributeValueId }`,
// `variant.platforms[kanal].mapping` (kanal bilgileri).
import { computed, defineAsyncComponent, ref } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
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

/** Değer listesi: aramaya BAŞTAN uyan ilk `limit` değer; seçili değer her zaman listede. */
export function attrOptions(a: any, query: string, selectedId: string | undefined, limit = 200): AttrOptionItem[] {
  const q = (query || '').toLocaleLowerCase('tr')
  const all: AttrOptionItem[] = (a.values || []).map((v: any) => ({ id: String(v.id), title: String(v.title ?? v.name ?? v.id), level: v.level, mandatory: v.mandatory }))
  const shown = q ? all.filter((v) => v.title.toLocaleLowerCase('tr').startsWith(q)) : all
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

  async function loadAttrs(code: string) {
    if (!code || attrs.value.get(code)) return
    const result = await integrationStore.loadIntegrationCategoryChoices(code, integrationCategoryId(code))
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

  /** Değerleri istenince gelen (lazyValues) özellik: menü açılınca bir kez yükle. */
  const lazyLoading = ref(new Set<string>())
  async function loadLazyValues(code: string, a: any) {
    if (!a?.lazyValues || a.values?.length || lazyLoading.value.has(a._id)) return
    lazyLoading.value = new Set([...lazyLoading.value, a._id])
    const result = await integrationStore.loadIntegrationCategoryAttributeValues(code, integrationCategoryId(code), a._id)
    if (result.ok) a.values = result.data
    const s = new Set(lazyLoading.value); s.delete(a._id); lazyLoading.value = s
  }

  return { channels, channelTitle, categoryTitle, mappingState, attrs, attrErrors, retrying, loadAttrs, retry, loadLazyValues, lazyLoading }
}
