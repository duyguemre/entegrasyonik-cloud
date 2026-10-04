// @vitest-environment happy-dom
/**
 * FE R4 Şerit B (K61, FE_FEEDBACK_R4 B1/B2) — ürün ekleme/düzenleme KARAKTERİZASYONU.
 *
 * Yeniden tasarımdan ÖNCE yazıldı (taban `origin/main` = faz3-arayuz @ b68ae6f7) ve tasarımdan SONRA DEĞİŞTİRİLMEDEN yeşil
 * kalmalıdır. Sabitlenen davranış:
 *   1. Alanlar (etiket, model, maxlength, tür, `data-pf-field`) ve doğrulama kuralları + MESAJLARI (gerçek tr.json),
 *   2. Sihirbaz adımları (erişilebilir ad, durum, kilit, Kaydet etkinliği, ipucu, eksik listesi, Geri/Devam),
 *   3. Kaydet (`ProductService/saveProduct`) ve Güncelle (`ProductService/updateProduct`) istek gövdeleri,
 *   4. Varyant ızgarası ROWSPAN'lı grup hücreleri (DOM: sıra, rowspan değerleri, sanal pencere kırpması).
 * Görsel yapı (sınıf adları, kart düzeni) bilerek İDDİA EDİLMEZ; yalnız rol/etiket/erişilebilir ad ve model kullanılır.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as vuetifyDirectives from 'vuetify/directives'
import trMessages from '../src/plugins/locales/tr.json'

// ── modül sahteleri (ağ, store) ──────────────────────────────────────────────────────────────────────────────
const api = vi.hoisted(() => ({
  post: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  get: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  postImage: vi.fn(async (..._a: any[]): Promise<any> => ({ images: [] })),
}))
vi.mock('@/composables/restapi', () => ({ default: () => api }))

const snack = vi.hoisted(() => ({ addSnackbar: vi.fn() }))
vi.mock('@/stores/snackbarStore', () => ({ useSnackbarStore: () => snack }))

const cost = vi.hoisted(() => ({
  plan: vi.fn(() => ({ items: [], skippedNoBarcode: 0 })),
  persist: vi.fn(async () => ({ status: 'none' })),
  baseline: vi.fn(() => ({})),
}))
vi.mock('@/composables/useCostSave', () => ({ useCostSave: () => cost }))

const CHOICES = vi.hoisted(() => [
  { _id: 'renk', title: 'Renk', values: [{ _id: 'siyah', title: 'Siyah' }, { _id: 'beyaz', title: 'Beyaz' }, { _id: 'lacivert', title: 'Lacivert' }] },
  { _id: 'beden', title: 'Beden', values: [{ _id: 's', title: 'S' }, { _id: 'm', title: 'M' }, { _id: 'l', title: 'L' }, { _id: 'xl', title: 'XL' }] },
])
vi.mock('@/stores/choicesStore', () => {
  const find = (id: any) => CHOICES.find((c) => c._id === id)
  const store = {
    choices: CHOICES,
    getChoices: () => CHOICES,
    getChoiceTitle: (id: any) => find(id)?.title,
    getChoiceValues: (id: any) => find(id)?.values,
    getChoiceValueTitle: (cid: any, vid: any) => find(cid)?.values.find((v) => v._id === vid)?.title,
    getChoiceValueName: (cid: any, vid: any) => find(cid)?.values.find((v) => v._id === vid)?.title,
    getDirectChoiceValueTitle: (vid: any) => CHOICES.flatMap((c) => c.values).find((v) => v._id === vid)?.title,
  }
  return { useChoicesStore: () => store }
})
vi.mock('@/stores/integrationStore', () => {
  const store = {
    getPlatforms: () => [{ code: 'trendyol', title: 'Trendyol' }, { code: 'hepsiburada', title: 'Hepsiburada' }],
    getClientMarketplaces: () => [],
    getClientECommerces: () => [],
    retrieveIntegrationCategoryChoices: async () => [],
    getIntegrationTitle: (c: string) => c,
  }
  return { useIntegrationStore: () => store }
})
vi.mock('@/stores/categoriesStore', () => {
  const store = {
    getCategory: (id: any) => (id ? { _id: id, title: 'Tişört', platforms: {} } : undefined),
    getCategoryTitle: (id: any) => (id ? 'Tişört' : ''),
    getSelectCategories: () => [],
    getCategories: () => [],
  }
  return { useCategoriesStore: () => store }
})
vi.mock('@/stores/brandsStore', () => {
  const store = { getBrands: () => [], getBrandTitle: (id: any) => (id ? 'Marka A' : ''), getBrand: () => ({ title: 'Marka A' }) }
  return { useBrandsStore: () => store }
})
vi.mock('@/stores/staticsStore', () => ({
  useStaticsStore: () => ({ taxPercentage: 20, warranty: 24, desi: 1, shippingDuration: 3, maxPurchaseQuantity: 99 }),
}))

// ── kurulum ──────────────────────────────────────────────────────────────────────────────────────────────────
const i18n = () => createI18n({ legacy: false, locale: 'tr', fallbackLocale: 'tr', messages: { tr: trMessages as any }, missingWarn: false, fallbackWarn: false })
const vuetify = () => createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives })

const LoadingStub = defineComponent({
  name: 'LoadingComponent',
  setup(_p, { expose }) {
    expose({ info: () => 'guid', remove: () => undefined, success: () => undefined, error: () => undefined, warning: () => undefined })
    return () => h('div', { 'data-stub': 'loading' })
  },
})
const Stub = (name: string, props: string[] = []) => defineComponent({ name, props, emits: ['save', 'navigate'], setup: () => () => h('div', { 'data-stub': name }) })

function mountWith(component: any, props: Record<string, any>, stubs: Record<string, any> = {}) {
  return mount(component, {
    props,
    attachTo: document.body,
    global: {
      plugins: [vuetify(), i18n(), pinia],
      provide: { eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }, useMenuStore: { tabProcessedMenu: [], getMenuLinkWithCode: () => undefined } },
      stubs: { LoadingComponent: LoadingStub, QuillEditor: Stub('QuillEditor'), BrandSelectBoxComponent: Stub('BrandSelectBoxComponent', ['modelValue', 'mandatory']), ...stubs },
    },
  })
}

let pinia = createPinia()
let wrappers: VueWrapper[] = []
const track = <T extends VueWrapper>(w: T) => (wrappers.push(w), w)
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  api.post.mockReset()
  api.post.mockResolvedValue(undefined)
  snack.addSnackbar.mockReset()
  cost.plan.mockClear()
  cost.persist.mockClear()
})
afterEach(() => {
  wrappers.forEach((w) => w.unmount())
  wrappers = []
  document.body.innerHTML = ''
})

/** Erişilebilir ad: aria-hidden alt ağaçları hariç metin (görsel işaretçiler sayılmaz). */
function accessibleText(el: Element): string {
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return n.textContent || ''
    if (n.nodeType !== 1) return ''
    const e = n as Element
    if (e.getAttribute('aria-hidden') === 'true') return ''
    if (e.classList.contains('ek-sr-only')) return ''
    return Array.from(e.childNodes).map(walk).join(' ')
  }
  return walk(el).replace(/\s+/g, ' ').trim()
}

// Kural yoklama girdileri (boş, kısa, sınır, uzun, sayı/sayı olmayan).
const PROBES: Array<[string, any]> = [
  ['undefined', undefined], ['boş', ''], ['0 (sayı)', 0], ['a', 'a'], ['ab', 'ab'], ['5', '5'], ['05', '05'], ['12a', '12a'],
  ['17 karakter', 'x'.repeat(17)], ['33 karakter', 'x'.repeat(33)], ['161 karakter', 'x'.repeat(161)],
]
function probeRules(rules: any[] | undefined) {
  if (!rules?.length) return null
  const out: Record<string, string | true> = {}
  for (const [name, value] of PROBES) {
    const failed = rules.map((r) => r(value)).find((r) => r !== true)
    out[name] = failed === undefined ? true : String(failed)
  }
  return out
}

/** Bir kök altındaki tüm Vuetify alanlarının kimliği + kuralları. */
function describeFields(w: VueWrapper) {
  const out: any[] = []
  const add = (c: any, kind: string) => {
    const p = c.props()
    const input = c.element.querySelector('input, textarea')
    out.push({
      kind,
      label: p.label,
      field: c.element.closest('[data-pf-field]')?.getAttribute('data-pf-field') ?? input?.getAttribute('data-pf-field') ?? null,
      maxlength: input?.getAttribute('maxlength') ?? null,
      type: input?.getAttribute('type') ?? null,
      counter: p.counter ?? null,
      rules: probeRules(p.rules),
    })
  }
  w.findAllComponents({ name: 'VTextField' }).filter((c: any) => !c.element.closest('.v-select')).forEach((c: any) => add(c, 'text'))
  w.findAllComponents({ name: 'VSelect' }).forEach((c: any) => add(c, 'select'))
  return out
}

// ── 1. alanlar + doğrulama ───────────────────────────────────────────────────────────────────────────────────
import ProductInfoFormComponent from '../src/components/productDefinitions/crud/ProductInfoFormComponent.vue'
import ProductDetailsComponent from '../src/components/productDefinitions/variants/ProductDetailsComponent.vue'
import ProductSingleVariantComponent from '../src/components/productDefinitions/variants/ProductSingleVariantComponent.vue'

const RULE_TITLE = {
  undefined: 'Bu alan zorunlu', 'boş': 'Bu alan zorunlu', '0 (sayı)': true, a: 'Bu alan 2-160 karakter içermeli', ab: true, '5': 'Bu alan 2-160 karakter içermeli',
  '05': true, '12a': true, '17 karakter': true, '33 karakter': true, '161 karakter': 'Bu alan 2-160 karakter içermeli',
}
const RULE_STOCKCODE = {
  undefined: 'Bu alan zorunlu', 'boş': 'Bu alan zorunlu', '0 (sayı)': true, a: 'Bu alan 2-32 karakter içermeli', ab: true, '5': 'Bu alan 2-32 karakter içermeli',
  '05': true, '12a': true, '17 karakter': true, '33 karakter': 'Bu alan 2-32 karakter içermeli', '161 karakter': 'Bu alan 2-32 karakter içermeli',
}
const RULE_0_16 = {
  undefined: true, 'boş': true, '0 (sayı)': true, a: true, ab: true, '5': true, '05': true, '12a': true,
  '17 karakter': 'Bu alan 0-16 karakter içermeli', '33 karakter': 'Bu alan 0-16 karakter içermeli', '161 karakter': 'Bu alan 0-16 karakter içermeli',
}
const RULE_MANDATORY = {
  undefined: 'Bu alan zorunlu', 'boş': 'Bu alan zorunlu', '0 (sayı)': true, a: true, ab: true, '5': true, '05': true, '12a': true, '17 karakter': true, '33 karakter': true, '161 karakter': true,
}

describe('1 · alanlar ve doğrulama kuralları/mesajları', () => {
  it('Ürün Tanımı (tekil): ürün tipi radyoları, marka, başlık; varyantlıda ana kod', async () => {
    const form = reactive<any>({ hasVariant: false, title: '', brand: undefined, maincode: undefined, description: '', images: [] })
    const w = track(mountWith(ProductInfoFormComponent, { productInfoForm: form, quillToolbar: [], galleryDisabled: false, imageProductId: 't1' }))
    await flushPromises()
    const radios = w.findAllComponents({ name: 'VRadio' }).map((r: any) => ({ label: r.props('label'), value: r.props('value') }))
    expect(radios).toEqual([{ label: 'Tekil Ürün', value: false }, { label: 'Varyantlı Ürün', value: true }])
    expect(describeFields(w)).toEqual([
      { kind: 'text', label: 'Ürün Başlığı *', field: 'title', maxlength: '160', type: 'text', counter: true, rules: RULE_TITLE },
    ])
    expect(w.find('[data-pf-field="brand"]').exists()).toBe(true)
    expect(w.findComponent({ name: 'BrandSelectBoxComponent' }).props('mandatory')).toBe(true)
    expect(w.find('[data-pf-field="gallery"]').exists()).toBe(true)
    expect(w.findComponent({ name: 'QuillEditor' }).exists()).toBe(true)

    // galeri düğmesi: tıklayınca `openGallery`; devre dışıyken kapalı
    await w.find('[data-pf-field="gallery"]').trigger('click')
    expect(w.emitted('openGallery')).toHaveLength(1)

    form.hasVariant = true
    await nextTick()
    // FE-LOCAL-1002b: Temel bilgiler (marka, başlık) Ürün tipinin ÜSTÜNDE → başlık, ana koddan önce gelir.
    expect(describeFields(w)).toEqual([
      { kind: 'text', label: 'Ürün Başlığı *', field: 'title', maxlength: '160', type: 'text', counter: true, rules: RULE_TITLE },
      { kind: 'text', label: 'Varyant Grup Kodu *', field: 'maincode', maxlength: '32', type: 'text', counter: true, rules: RULE_STOCKCODE },
    ])
    // v-model bağları: alan yazımı formu doğrudan düzenler
    const title = w.find('[data-pf-field="title"]')
    const titleInput = title.element.matches('input') ? title : title.find('input')
    await titleInput.setValue('Pamuklu Tişört')
    expect(form.title).toBe('Pamuklu Tişört')
  })

  it('Ürün Tanımı: galeri taslak kimliği yokken kapalı', async () => {
    const form = reactive<any>({ hasVariant: false, images: [] })
    const w = track(mountWith(ProductInfoFormComponent, { productInfoForm: form, quillToolbar: [], galleryDisabled: true, imageProductId: undefined }))
    await flushPromises()
    expect((w.find('[data-pf-field="gallery"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('Detay Bilgiler: 4 sayı alanı + KDV; tümü isteğe bağlı, en fazla 16 karakter, yalnız sayı; varsayılan durumu + varsayılana dön', async () => {
    // Yeniden tasarım: ayar satırı (etiket solda, `<label for>`), birimli giriş, "Varsayılan kullanılıyor / Özel değer".
    const form = reactive<any>({ maxPurchaseQuantity: 100, shippingDuration: 3, desi: 0, warranty: undefined, taxPercentage: 20 })
    const w = track(mountWith(ProductDetailsComponent, { productInfoForm: form }))
    await flushPromises()
    const labelOf = (id: string) => w.find(`label[for="${id}"]`).text()
    const texts = w.findAllComponents({ name: 'VTextField' }).filter((c: any) => !c.element.closest('.v-select'))
    expect(texts.map((c: any) => labelOf(c.props('id')))).toEqual(['Maksimum Satış Adedi', 'Kargo Süresi', 'Desi', 'Garanti Süresi'])
    expect(texts.map((c: any) => c.props('suffix'))).toEqual(['adet', 'gün', 'dm³', 'ay'])
    // varsayılanlar staticsStore'dan (yer tutucu)
    expect(texts.map((c: any) => c.props('placeholder'))).toEqual(['99', '3', '1', '24'])
    for (const c of texts) {
      const input = c.find('input')
      expect(input.attributes('maxlength')).toBe('16')
      expect(input.attributes('type')).toBe('tel')
    }
    // kurallar: boş geçerli · sayı/ondalık geçerli · harf "Sayı girilmeli" · 17 karakter sınır
    const rules = texts[0].props('rules') as Array<(v: any) => true | string>
    const check = (v: any) => rules.map((r) => r(v)).find((x) => x !== true) ?? true
    expect(check('')).toBe(true)
    expect(check(undefined)).toBe(true)
    expect(check('12')).toBe(true)
    expect(check('1,5')).toBe(true)
    expect(check('a')).toBe('Sayı girilmeli')
    expect(check('1'.repeat(17))).toBe('Bu alan 0-16 karakter içermeli')
    // [eslesme-fiyat WP5, D-PRICE-2] KDV: yalnız 0/1/10/20 (eski 1..29 listesi ve "varsayılan %18" kalktı); boş = ayarsız uyarısı
    expect(labelOf('pdc-taxPercentage')).toBe('KDV')
    expect(w.findAll('.pdc-seg__btn').map((b) => b.text())).toEqual(['%0', '%1', '%10', '%20'])
    await w.findAll('.pdc-seg__btn').find((b) => b.text() === '%10')!.trigger('click')
    expect(form.taxPercentage).toBe(10)
    await w.find('#pdc-taxPercentage-state .pdc-reset').trigger('click')
    expect(form.taxPercentage).toBeNull()
    expect(w.find('#pdc-taxPercentage-state').text()).toContain('KDV seçilmedi')
    await w.findAll('.pdc-seg__btn').find((b) => b.text() === '%0')!.trigger('click')
    expect(form.taxPercentage).toBe(0)
    // durum + varsayılana dön (garanti boş → varsayılan; desi 0 → özel değer)
    expect(w.find('#pdc-warranty-state').text()).toContain('Varsayılan kullanılıyor: 24 ay')
    expect(w.find('#pdc-desi-state').text()).toContain('Özel değer')
    await w.find('#pdc-desi-state .pdc-reset').trigger('click')
    expect(form.desi).toBeUndefined()
    // model bağı
    const inputs = w.findAll('input[type="tel"]')
    await inputs[2].setValue('4')
    expect(form.desi).toBe('4')
  })

  it('Tekil Ürün Bilgisi: stok kodu, barkod, fiyatlar, maliyet, stok, raf (+ kanal fiyatı anahtarı)', async () => {
    const variant = reactive<any>({ stockcode: '', barcode: '', stock: 0, shelf: '', prices: { salePrice: 0, marketPrice: 100, isPlatformBasedPrice: false }, platforms: {} })
    const form = reactive<any>({ hasVariant: false, variants: [variant], images: [] })
    const w = track(mountWith(ProductSingleVariantComponent, { productInfoForm: form, singleVariant: variant, dialogAttach: 'body' }, {
      ProductVariantAttributesComponent: Stub('ProductVariantAttributesComponent'),
      ProductVariantPlatformPricesComponent: Stub('ProductVariantPlatformPricesComponent'),
    }))
    await flushPromises()
    const STOCK = {
      undefined: 'Bu alan zorunlu', 'boş': 'Bu alan zorunlu', '0 (sayı)': true, a: 'Sayı girilmeli', ab: 'Sayı girilmeli', '5': true, '05': true,
      '12a': 'Sayı girilmeli', '17 karakter': 'Sayı girilmeli', '33 karakter': 'Sayı girilmeli', '161 karakter': 'Sayı girilmeli',
    }
    const SHELF = {
      undefined: true, 'boş': true, '0 (sayı)': true, a: 'Bu alan 2-160 karakter içermeli', ab: true, '5': 'Bu alan 2-160 karakter içermeli',
      '05': true, '12a': true, '17 karakter': true, '33 karakter': true, '161 karakter': 'Bu alan 2-160 karakter içermeli',
    }
    const fields = describeFields(w)
    expect(fields.filter((f) => f.label && /Stok Kodu|Barkod|Stok Adedi|Raf/.test(f.label))).toEqual([
      { kind: 'text', label: 'Stok Kodu *', field: 'stockcode', maxlength: '160', type: 'text', counter: true, rules: RULE_TITLE },
      { kind: 'text', label: 'Barkod *', field: 'barcode', maxlength: '160', type: 'text', counter: true, rules: RULE_TITLE },
      { kind: 'text', label: 'Stok Adedi *', field: null, maxlength: '160', type: 'tel', counter: true, rules: STOCK },
      { kind: 'text', label: 'Raf', field: null, maxlength: '160', type: 'text', counter: true, rules: SHELF },
    ])
    // para alanları (VCurrencyComponent): etiket + kural
    const inner = (c: any) => c.findComponent({ name: 'VTextField' })
    const money = w.findAllComponents({ name: 'VCurrencyComponent' }).map((c: any) => ({ label: inner(c).props('label'), rules: probeRules(inner(c).props('rules')) }))
    expect(money).toEqual([
      { label: 'Satış Fiyatı *', rules: RULE_MANDATORY },
      { label: 'Piyasa Fiyatı *', rules: RULE_MANDATORY },
      { label: 'Maliyet (KDV hariç)', rules: null },
    ])
    expect(w.find('[data-pf-field="salePrice"]').exists()).toBe(true)
    expect(w.find('[data-pf-field="costPrice"]').exists()).toBe(true)
    const chk = w.findComponent({ name: 'VCheckbox' })
    expect(chk.exists()).toBe(true)
    expect(w.text()).toContain('Platform Bazında Fiyat')
    expect(w.text()).toContain('Ürün Özellikleri')

    // kanal bazında fiyat açılınca ana fiyat alanları yerine "Kanal fiyatları" düğmesi
    variant.prices.isPlatformBasedPrice = true
    await nextTick()
    expect(w.findAllComponents({ name: 'VCurrencyComponent' }).map((c: any) => inner(c).props('label'))).toEqual(['Maliyet (KDV hariç)'])
    expect(w.find('[data-pf-field="channelPrices"]').exists()).toBe(true)

    // model bağı
    const sc = w.find('[data-pf-field="stockcode"]')
    await (sc.element.matches('input') ? sc : sc.find('input')).setValue('SK-1')
    expect(variant.stockcode).toBe('SK-1')
  })
})

// ── 2. sihirbaz ──────────────────────────────────────────────────────────────────────────────────────────────
import ProductFormWizardBar from '../src/components/productDefinitions/crud/ProductFormWizardBar.vue'
import ProductFormStepFooter from '../src/components/productDefinitions/crud/ProductFormStepFooter.vue'

const emptyForm = () => ({ hasVariant: false, category: undefined, brand: undefined, title: undefined, variants: [{ stockcode: '', barcode: '', prices: { salePrice: 0, marketPrice: 100, isPlatformBasedPrice: false } }], images: [] })
const fullForm = () => ({
  hasVariant: false, category: 'c1', brand: 'b1', title: 'Pamuklu Tişört', images: [{ _id: 'i1' }],
  variants: [{ stockcode: 'SK-1', barcode: '869', stock: 4, prices: { salePrice: 100, marketPrice: 120, isPlatformBasedPrice: false } }],
})

function wizardSnapshot(w: VueWrapper) {
  const nav = w.find('nav[aria-label="Ürün formu adımları"]')
  const steps = nav.findAll('button').map((b) => ({
    name: accessibleText(b.element),
    current: b.attributes('aria-current') ?? null,
    disabled: b.attributes('aria-disabled') ?? null,
    title: b.attributes('title') ?? null,
    describedBy: (b.attributes('aria-describedby') || '').split(' ').filter(Boolean).map((id) => accessibleText(document.getElementById(id)!) || document.getElementById(id)?.textContent?.trim()),
  }))
  const save = w.findAll('button').find((b) => /^(Kaydet|Güncelle)$/.test(accessibleText(b.element)))!
  const hintId = save.attributes('aria-describedby')!
  const progress = w.find('progress')
  return {
    steps,
    save: { name: accessibleText(save.element), disabled: (save.element as HTMLButtonElement).disabled, hint: document.getElementById(hintId)?.textContent?.trim() },
    progress: { max: progress.attributes('max'), value: progress.attributes('value'), label: accessibleText(document.querySelector(`label[for="${progress.attributes('id')}"]`)!) },
  }
}

describe('2 · sihirbaz adımları', () => {
  it('boş ekleme formu: kategori adımı etkin, diğerleri kilitli; Kaydet kapalı ve nedeni yazılı', async () => {
    const w = track(mountWith(ProductFormWizardBar, { form: emptyForm(), current: 0, saveLabel: 'Kaydet' }))
    await flushPromises()
    expect(wizardSnapshot(w)).toEqual({
      steps: [
        { name: 'Kategori Seçimi 1 eksik', current: 'step', disabled: null, title: null, describedBy: ['1 eksik'] },
        { name: 'Ürün Tanımı Kilitli', current: null, disabled: 'true', title: 'Önce bir kategori seçin.', describedBy: ['Kilitli', 'Önce bir kategori seçin.'] },
        { name: 'Tekil Ürün Bilgisi Kilitli', current: null, disabled: 'true', title: 'Önce ürün başlığını girin (en az 2 karakter).', describedBy: ['Kilitli', 'Önce ürün başlığını girin (en az 2 karakter).'] },
        { name: 'Detay Bilgiler Kilitli', current: null, disabled: 'true', title: 'Önce ürün başlığını girin (en az 2 karakter).', describedBy: ['Kilitli', 'Önce ürün başlığını girin (en az 2 karakter).'] },
      ],
      save: { name: 'Kaydet', disabled: true, hint: 'Kaydet için 5 zorunlu bilgi eksik. İlki: kategori seçin.' },
      progress: { max: '5', value: '0', label: 'Zorunlu bilgiler' },
    })
    // kilitli adıma tıklama gezinti yaymaz; etkin adım yayar
    const buttons = w.find('nav').findAll('button')
    await buttons[1].trigger('click')
    expect(w.emitted('navigate')).toBeUndefined()
    await buttons[0].trigger('click')
    expect(w.emitted('navigate')).toEqual([[{ step: 0 }]])
  })

  it('eksikler paneli: maddeler, uyarılar; maddeye tıklayınca adım + alan', async () => {
    const form = { ...emptyForm(), category: 'c1' }
    const w = track(mountWith(ProductFormWizardBar, { form, current: 1, saveLabel: 'Kaydet' }))
    await flushPromises()
    const toggle = w.findAll('button').find((b) => accessibleText(b.element) === 'Eksikleri göster')!
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const panel = w.find(`#${toggle.attributes('aria-controls')}`)
    expect(panel.attributes('aria-label')).toBe('Kayıt öncesi kontrol')
    const items = panel.findAll('ul button').map((b) => accessibleText(b.element))
    expect(items).toEqual([
      'Marka seçin Adım 2', 'Ürün başlığını girin Adım 2', 'Stok kodunu girin Adım 3', 'Barkodu girin Adım 3',
      'Satış fiyatı 0 — Trendyol bu ürünü reddeder Adım 3', 'Ürün resmi eklenmedi Adım 2',
    ])
    // adım 3 kilitli → kilidi açacak ilk eksiğin adımına (2) gider, alan odağı verilmez
    await panel.findAll('ul button')[2].trigger('click')
    expect(w.emitted('navigate')!.at(-1)).toEqual([{ step: 1, field: undefined }])
    expect(w.find(`#${toggle.attributes('aria-controls')}`).exists()).toBe(false)
    await w.findAll('button').find((b) => accessibleText(b.element) === 'Eksikleri göster')!.trigger('click')
    await w.find(`#${toggle.attributes('aria-controls')}`).findAll('ul button')[1].trigger('click')
    expect(w.emitted('navigate')!.at(-1)).toEqual([{ step: 1, field: 'title' }])
  })

  it('dolu düzenleme formu: tüm adımlar açık, Güncelle etkin; özet satırları; tıklama `save` yayar', async () => {
    const w = track(mountWith(ProductFormWizardBar, { form: fullForm(), current: 2, saveLabel: 'Güncelle', categoryTitle: 'Tişört', brandTitle: 'Marka A' }))
    await flushPromises()
    const snap = wizardSnapshot(w)
    expect(snap.steps.map((s) => [s.name, s.current, s.disabled])).toEqual([
      ['Kategori Seçimi Tamam', null, null], ['Ürün Tanımı Tamam', null, null], ['Tekil Ürün Bilgisi Tamam', 'step', null], ['Detay Bilgiler İsteğe bağlı', null, null],
    ])
    expect(snap.save).toEqual({ name: 'Güncelle', disabled: false, hint: 'Güncelle için hazır.' })
    expect(snap.progress).toMatchObject({ max: '5', value: '5' })
    await w.findAll('button').find((b) => accessibleText(b.element) === 'Kayıt özeti')!.trigger('click')
    expect(w.text()).toContain('Tüm zorunlu bilgiler girildi. Güncelle düğmesi etkin.')
    const dts = w.findAll('dt').map((d) => d.text())
    const dds = w.findAll('dd').map((d) => d.text())
    expect(dts.map((t, i) => [t, dds[i]])).toEqual([
      ['Ürün tipi', 'Tekil ürün'], ['Kategori', 'Tişört'], ['Marka', 'Marka A'], ['Ürün başlığı', 'Pamuklu Tişört'],
      ['Stok kodu', 'SK-1'], ['Barkod', '869'], ['Toplam stok', '4'],
    ])
    await w.findAll('button').find((b) => accessibleText(b.element) === 'Güncelle')!.trigger('click')
    expect(w.emitted('save')).toHaveLength(1)
  })

  it('varyantlı form: 3. adım adı "Varyant Bilgileri"; ana kod eksiği kilit nedeni', async () => {
    const form = { ...fullForm(), hasVariant: true, maincode: '', variants: [] }
    const w = track(mountWith(ProductFormWizardBar, { form, current: 1, saveLabel: 'Kaydet' }))
    await flushPromises()
    const snap = wizardSnapshot(w)
    expect(snap.steps[2]).toMatchObject({ name: 'Varyant Bilgileri Kilitli', disabled: 'true', title: 'Önce varyantlı ürün için ana kodu girin.' })
    expect(snap.save.hint).toBe('Kaydet için 2 zorunlu bilgi eksik. İlki: ana kodu girin.')
  })

  it('kaydediliyor: Kaydet kapalı (çift gönderim yok)', async () => {
    const w = track(mountWith(ProductFormWizardBar, { form: fullForm(), current: 0, saveLabel: 'Kaydet', saving: true }))
    await flushPromises()
    expect(wizardSnapshot(w).save.disabled).toBe(true)
  })

  it('adım altbilgisi: Geri/Devam; sonraki adım kilitliyse Devam kapalı ve nedeni yazılı', async () => {
    const w0 = track(mountWith(ProductFormStepFooter, { form: emptyForm(), current: 0 }))
    await flushPromises()
    const g0 = w0.find('[role="group"]')
    expect(g0.attributes('aria-label')).toBe('Adım gezintisi')
    expect(g0.findAll('button').map((b) => [accessibleText(b.element), (b.element as HTMLButtonElement).disabled])).toEqual([['Devam', true]])
    const why = g0.findAll('button')[0].attributes('aria-describedby')!
    expect(document.getElementById(why)?.textContent?.trim()).toBe('Önce bir kategori seçin.')

    const w1 = track(mountWith(ProductFormStepFooter, { form: fullForm(), current: 1 }))
    await flushPromises()
    const b1 = w1.find('[role="group"]').findAll('button')
    expect(b1.map((b) => [accessibleText(b.element), (b.element as HTMLButtonElement).disabled])).toEqual([['Geri', false], ['Devam', false]])
    await b1[0].trigger('click')
    await b1[1].trigger('click')
    expect(w1.emitted('navigate')).toEqual([[{ step: 0 }], [{ step: 2 }]])

    const w3 = track(mountWith(ProductFormStepFooter, { form: fullForm(), current: 3 }))
    await flushPromises()
    expect(w3.find('[role="group"]').findAll('button').map((b) => accessibleText(b.element))).toEqual(['Geri'])
  })
})

// ── 3. kaydet / güncelle istek gövdeleri ─────────────────────────────────────────────────────────────────────
import ProductDefinitionView from '../src/views/secure/definitions/ProductDefinitionView.vue'
import ProductUpdateView from '../src/views/secure/definitions/ProductUpdateView.vue'

const VIEW_STUBS = {
  ProductFormWizardBar: Stub('ProductFormWizardBar', ['form', 'current', 'saveLabel', 'saving', 'categoryTitle', 'brandTitle']),
  ProductFormStepFooter: Stub('ProductFormStepFooter', ['form', 'current']),
  CategorySelectBoxLevelComponent: Stub('CategorySelectBoxLevelComponent', ['modelValue']),
  ProductInfoFormComponent: Stub('ProductInfoFormComponent'),
  ProductVariantsComponent: Stub('ProductVariantsComponent'),
  ProductSingleVariantComponent: Stub('ProductSingleVariantComponent'),
  ProductDetailsComponent: Stub('ProductDetailsComponent'),
  ProductImagesComponent: Stub('ProductImagesComponent'),
  ProductCompetitivePricesComponent: Stub('ProductCompetitivePricesComponent'),
  CompetitionPanel: Stub('CompetitionPanel'),
  EkPageHeader: Stub('EkPageHeader', ['title', 'section', 'description', 'trail', 'record']),
}
const ID = /^[0-9a-f]{24}$/

describe('3 · kaydet / güncelle istek gövdeleri', () => {
  it('ekleme (tekil): saveProduct gövdesi — images çıkarılır, maincode üretilir, varyant görselleri galeriden', async () => {
    const w = track(mountWith(ProductDefinitionView, { parameters: undefined }, VIEW_STUBS))
    await flushPromises()
    const bar = w.findComponent({ name: 'ProductFormWizardBar' })
    expect(bar.props('saveLabel')).toBe('Kaydet')
    expect(bar.props('current')).toBe(0)
    const form = bar.props('form') as any
    // açılış formu
    expect(Object.keys(form).sort()).toEqual(['barcode', 'brand', 'category', 'desi', 'hasVariant', 'images', 'invoiceTitle', 'maincode', 'maxPurchaseQuantity', 'platforms', 'prepDuration', 'prices', 'shelf', 'shippingDuration', 'stock', 'subtitle', 'taxPercentage', 'tempId', 'title', 'variants', 'warrantyDuration'])
    expect(form).toMatchObject({ hasVariant: false, maxPurchaseQuantity: 100, shippingDuration: 3, taxPercentage: 20, desi: 0, stock: 0, shelf: 0, prepDuration: 3, warrantyDuration: 0 })
    expect(form.tempId).toMatch(ID)
    // GİZLİ DAVRANIŞ (korunur): reset() tek varyant oluşturur ama `hasVariant` izleyicisi (undefined → false) listeyi boşaltır;
    // tekil varyant 3. adıma geçişte (`checkSingleVariant`) yeniden oluşur.
    expect(form.variants).toEqual([])
    bar.vm.$emit('navigate', { step: 2 })
    await flushPromises()
    expect(w.findComponent({ name: 'ProductFormWizardBar' }).props('current')).toBe(2)
    expect(w.findComponent({ name: 'ProductSingleVariantComponent' }).exists()).toBe(true)
    expect(form.variants).toHaveLength(1)
    expect(form.variants[0]).toMatchObject({ choices: [], images: [], stockcode: '', barcode: '', stock: 0, shelf: '', prices: { isPlatformBasedPrice: false, marketPrice: 100, salePrice: 0 }, platforms: { trendyol: { attributes: {}, prices: { marketPrice: 0, salePrice: 0 } }, hepsiburada: { attributes: {}, prices: { marketPrice: 0, salePrice: 0 } } } })

    Object.assign(form, { category: 'c1', brand: 'b1', title: 'Pamuklu Tişört', images: [{ _id: 'i1', url: 'u1' }, { _id: 'i2', url: 'u2' }] })
    Object.assign(form.variants[0], { stockcode: 'SK-1', barcode: '8690001', stock: '5', shelf: 'A-1' })
    api.post.mockResolvedValueOnce(true)
    bar.vm.$emit('save')
    await flushPromises()

    expect(api.post).toHaveBeenCalledTimes(1)
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('ProductService/saveProduct')
    expect(Object.keys(body)).toEqual(['productInfo'])
    const info = body.productInfo
    expect('images' in info).toBe(false)
    expect(Object.keys(info).sort()).toEqual(['barcode', 'brand', 'category', 'desi', 'hasVariant', 'invoiceTitle', 'maincode', 'maxPurchaseQuantity', 'platforms', 'prepDuration', 'prices', 'shelf', 'shippingDuration', 'stock', 'subtitle', 'taxPercentage', 'tempId', 'title', 'variants', 'warrantyDuration'])
    expect(info).toMatchObject({ category: 'c1', brand: 'b1', title: 'Pamuklu Tişört', hasVariant: false })
    expect(info.maincode).toMatch(ID)
    expect(info.variants).toHaveLength(1)
    expect(info.variants[0]).toMatchObject({ stockcode: 'SK-1', barcode: '8690001', stock: '5', shelf: 'A-1', images: ['u1', 'u2'], maincode: info.maincode })
    // maliyet ayrı yazma yolu; başarı bildirimi; form sıfırlanır
    expect(cost.plan).toHaveBeenCalledTimes(1)
    expect(cost.persist).toHaveBeenCalledWith(undefined, expect.anything(), 'create')
    expect(snack.addSnackbar).toHaveBeenCalledWith(expect.objectContaining({ text: 'Ürün eklendi', color: 'success' }))
    const after = w.findComponent({ name: 'ProductFormWizardBar' }).props('form') as any
    expect(after.title).toBeUndefined()
    expect(after.tempId).not.toBe(info.tempId)
  })

  it('ekleme (varyantlı): her varyanta ana kod kopyalanır; tip değişince varyantlar sıfırlanır', async () => {
    const w = track(mountWith(ProductDefinitionView, { parameters: undefined }, VIEW_STUBS))
    await flushPromises()
    const bar = w.findComponent({ name: 'ProductFormWizardBar' })
    const form = bar.props('form') as any
    form.hasVariant = true
    await flushPromises()
    expect(form.variants).toEqual([])
    Object.assign(form, { category: 'c1', brand: 'b1', title: 'Tişört', maincode: 'MC-1' })
    form.variants.push(
      { tempId: 'v1', choices: [{ choiceId: 'renk', choiceValueId: 'siyah' }], stockcode: 'SK-S', barcode: '1', prices: { salePrice: 1, marketPrice: 2 }, images: [] },
      { tempId: 'v2', choices: [{ choiceId: 'renk', choiceValueId: 'beyaz' }], stockcode: 'SK-B', barcode: '2', prices: { salePrice: 1, marketPrice: 2 }, images: ['x'] },
    )
    api.post.mockResolvedValueOnce(false)
    bar.vm.$emit('save')
    await flushPromises()
    const info = api.post.mock.calls[0][1].productInfo
    expect(info.maincode).toBe('MC-1')
    expect(info.variants.map((v: any) => [v.tempId, v.maincode, v.images])).toEqual([['v1', 'MC-1', []], ['v2', 'MC-1', ['x']]])
    // başarısız yanıt: bildirim yok, form korunur
    expect(snack.addSnackbar).not.toHaveBeenCalled()
    expect((w.findComponent({ name: 'ProductFormWizardBar' }).props('form') as any).title).toBe('Tişört')
  })

  it('düzenleme: retrieveProduct → updateProduct gövdesi formun kendisi; yanıt formu yeniler', async () => {
    const product = {
      _id: 'p1', title: 'Eski', hasVariant: false, category: 'c1', brand: 'b1', images: [{ _id: 'i1' }], desi: 2,
      variants: [{ _id: 'v1', stockcode: 'SK-1', barcode: '869', stock: 3, prices: { salePrice: 10, marketPrice: 12, isPlatformBasedPrice: false }, platforms: {} }],
    }
    api.post.mockImplementation(async (url: string) => (url === 'ProductService/retrieveProduct' ? { product: structuredClone(product) } : undefined))
    const w = track(mountWith(ProductUpdateView, { parameters: { productId: 'p1' } }, VIEW_STUBS))
    await flushPromises()
    await (w.vm as any).initialize({ productId: 'p1' })
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('ProductService/retrieveProduct', { _id: 'p1' })
    const bar = w.findComponent({ name: 'ProductFormWizardBar' })
    expect(bar.props('saveLabel')).toBe('Güncelle')
    expect(bar.props('categoryTitle')).toBe('Tişört')
    expect(bar.props('brandTitle')).toBe('Marka A')
    const form = bar.props('form') as any
    form.title = 'Yeni başlık'
    form.variants[0].stock = '9'

    const saved = { ...structuredClone(product), title: 'Yeni başlık (sunucu)' }
    api.post.mockImplementation(async (url: string) => (url === 'ProductService/updateProduct' ? { product: saved } : undefined))
    bar.vm.$emit('save')
    await flushPromises()
    const call = api.post.mock.calls.find((c) => c[0] === 'ProductService/updateProduct')!
    expect(Object.keys(call[1])).toEqual(['productInfo'])
    const info = call[1].productInfo
    expect(Object.keys(info).sort()).toEqual(['_id', 'brand', 'category', 'desi', 'hasVariant', 'images', 'prices', 'title', 'variants'])
    expect(info).toMatchObject({ _id: 'p1', title: 'Yeni başlık', images: [{ _id: 'i1' }], prices: {} })
    expect(info.variants[0]).toMatchObject({ _id: 'v1', stock: '9' })
    expect(cost.persist).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'update')
    expect(snack.addSnackbar).toHaveBeenCalledWith(expect.objectContaining({ text: 'Ürün Güncellendi', color: 'success' }))
    expect((w.findComponent({ name: 'ProductFormWizardBar' }).props('form') as any).title).toBe('Yeni başlık (sunucu)')
  })

  it('düzenleme: adım gezintisi `navigate` ile; 3. adıma geçişte tekil varyant yoksa oluşturulur', async () => {
    const product = { _id: 'p2', title: 'Ürün', hasVariant: false, category: 'c1', brand: 'b1', images: [], variants: [] }
    api.post.mockImplementation(async (url: string) => (url === 'ProductService/retrieveProduct' ? { product: structuredClone(product) } : undefined))
    const w = track(mountWith(ProductUpdateView, { parameters: { productId: 'p2' } }, VIEW_STUBS))
    await flushPromises()
    await (w.vm as any).initialize({ productId: 'p2' })
    await flushPromises()
    const form = w.findComponent({ name: 'ProductFormWizardBar' }).props('form') as any
    // retrieveProduct sonrası checkSingleVariant: tekil üründe boş varyant listesi tek boş varyanta tamamlanır
    expect(form.variants).toHaveLength(1)
    expect(form.variants[0]).toMatchObject({ stockcode: '', barcode: '', stock: 0, prices: { isPlatformBasedPrice: false, marketPrice: 100, salePrice: 0 } })
    w.findComponent({ name: 'ProductFormWizardBar' }).vm.$emit('navigate', { step: 3 })
    await flushPromises()
    expect(w.findComponent({ name: 'ProductFormWizardBar' }).props('current')).toBe(3)
    expect(w.findComponent({ name: 'ProductDetailsComponent' }).exists()).toBe(true)
    // FE-LOCAL-1002b: alt Geri/Devam satırı kaldırıldı; gezinti şeritteki düğmelerden (ProductFormWizardBar `navigate`).
    w.findComponent({ name: 'ProductFormWizardBar' }).vm.$emit('navigate', { step: 2 })
    await flushPromises()
    expect(w.findComponent({ name: 'ProductSingleVariantComponent' }).exists()).toBe(true)
  })
})

// ── 4. varyant ızgarası rowspan (DOM) ───────────────────────────────────────────────────────────────────────
import VariantGrid from '../src/components/productDefinitions/variants/grid/VariantGrid.vue'

const vr = (id: string, color: string, size: string, extra: Record<string, any> = {}) => ({
  tempId: id, stockcode: `SK-${id}`, barcode: `869${id}`, stock: 2, shelf: '', images: [], platforms: {},
  choices: [{ choiceId: 'renk', choiceValueId: color }, { choiceId: 'beden', choiceValueId: size }],
  prices: { salePrice: 100, marketPrice: 120, isPlatformBasedPrice: false }, ...extra,
})

function gridShape(w: VueWrapper) {
  const rows = w.findAll('tbody tr[role="row"]')
  return rows.map((tr) => {
    const group = tr.find('[role="rowheader"]')
    return {
      code: tr.find('[data-cell="stockcode"]').text().match(/SK-[a-z0-9-]+/)?.[0],
      group: group.exists() ? { rowspan: group.attributes('rowspan'), text: accessibleText(group.element) } : null,
    }
  })
}

describe('4 · varyant ızgarası: rowspan\'lı grup hücreleri (yapı AYNEN korunur)', () => {
  it('ilk seçenek (Renk) tanım sırasıyla gruplanır; grup hücresi rowspan = grup boyu; grup içi beden tanım sırası', async () => {
    const variants = [
      vr('b-m', 'beyaz', 'm'), vr('s-l', 'siyah', 'l'), vr('l-s', 'lacivert', 's'), vr('s-s', 'siyah', 's'),
      vr('b-s', 'beyaz', 's'), vr('s-m', 'siyah', 'm'),
    ]
    const w = track(mountWith(VariantGrid, { variants, productInfoForm: { images: [], variants }, baseline: {}, filter: '' }))
    await flushPromises()
    expect(w.find('table').attributes('role')).toBe('grid')
    expect(w.find('thead [aria-colindex="2"]').text()).toBe('Renk')
    expect(gridShape(w)).toEqual([
      { code: 'SK-s-s', group: { rowspan: '3', text: 'Siyah 3 varyant' } },
      { code: 'SK-s-m', group: null },
      { code: 'SK-s-l', group: null },
      { code: 'SK-b-s', group: { rowspan: '2', text: 'Beyaz 2 varyant' } },
      { code: 'SK-b-m', group: null },
      { code: 'SK-l-s', group: { rowspan: '1', text: 'Lacivert 1 varyant' } },
    ])
    // her satır 11 kolonluk ızgarada; grup hücresi kolon 2 ve satır başlığı
    expect(w.find('table').attributes('aria-colcount')).toBe('11')
    expect(w.findAll('[role="rowheader"]').every((c) => c.attributes('aria-colindex') === '2')).toBe(true)
    // başlık kolonları (erişilebilir ad sırası)
    expect(w.findAll('thead th').map((th) => accessibleText(th.element))).toEqual([
      '', 'Renk', 'Stok kodu', 'Barkod', 'Satış fiyatı', 'Piyasa fiyatı', 'Kanal fiyatı', 'Stok', 'Raf', 'Maliyet (KDV hariç)', '',
    ])
  })

  it('kolon sıralaması grupları bozmaz (grup içinde sıralar); kanal fiyatlı satır fiyatları tek hücrede (colspan 2)', async () => {
    const variants = [
      vr('s-s', 'siyah', 's', { stock: 9 }), vr('s-m', 'siyah', 'm', { stock: 1 }), vr('b-s', 'beyaz', 's', { stock: 5, prices: { salePrice: 1, marketPrice: 2, isPlatformBasedPrice: true } }),
    ]
    const w = track(mountWith(VariantGrid, { variants, productInfoForm: { images: [], variants }, baseline: {}, filter: '' }))
    await flushPromises()
    const stockSort = w.findAll('thead button').find((b) => b.text().startsWith('Stok') && !b.text().includes('kodu'))!
    await stockSort.trigger('click')
    expect(gridShape(w)).toEqual([
      { code: 'SK-s-m', group: { rowspan: '2', text: 'Siyah 2 varyant' } },
      { code: 'SK-s-s', group: null },
      { code: 'SK-b-s', group: { rowspan: '1', text: 'Beyaz 1 varyant' } },
    ])
    const chanRow = w.findAll('tbody tr[role="row"]')[2]
    expect(chanRow.find('td[colspan="2"]').exists()).toBe(true)
    expect(chanRow.find('[data-cell="salePrice"]').exists()).toBe(false)
  })

  it('sayfalama: sayfa bir grubu keserse rowspan sayfa sınırında kırpılır; sayaç grubun TOPLAMIdır', async () => {
    // FE-LOCAL-1002b: sanal kaydırma yerine sayfalama (25/50/100). 3 renk × 4 beden × 3 = 36 satır → 1. sayfa 25 satır.
    const variants: any[] = []
    for (const c of ['siyah', 'beyaz', 'lacivert']) for (const s of ['s', 'm', 'l', 'xl']) for (const k of [1, 2, 3]) variants.push(vr(`${c}-${s}-${k}`, c, s))
    const w = track(mountWith(VariantGrid, { variants, productInfoForm: { images: [], variants }, baseline: {}, filter: '' }))
    await flushPromises()
    const shape = gridShape(w)
    expect(shape).toHaveLength(25)
    expect(shape.filter((r) => r.group).map((r) => r.group)).toEqual([
      { rowspan: '12', text: 'Siyah 12 varyant' },
      { rowspan: '12', text: 'Beyaz 12 varyant' },
      { rowspan: '1', text: 'Lacivert 12 varyant' },
    ])
    // boşluk satırı yok; sayfalama çubuğu toplamı gösterir
    expect(w.find('tbody tr[aria-hidden="true"]').exists()).toBe(false)
    expect(w.findComponent({ name: 'EkPagerBar' }).props('total')).toBe(36)
  })

  it('arama süzgeci grupları yeniden hesaplar', async () => {
    const variants = [vr('s-s', 'siyah', 's'), vr('s-m', 'siyah', 'm'), vr('b-s', 'beyaz', 's')]
    const w = track(mountWith(VariantGrid, { variants, productInfoForm: { images: [], variants }, baseline: {}, filter: 'SK-s-' }))
    await flushPromises()
    expect(gridShape(w)).toEqual([
      { code: 'SK-s-s', group: { rowspan: '2', text: 'Siyah 2 varyant' } },
      { code: 'SK-s-m', group: null },
    ])
  })
})
