/**
 * frontend/src/composables/useProductFormProgress.ts
 *
 * Ürün ekleme/düzenleme sihirbazı için SAF ilerleme hesabı (DOM/Vue bağımlılığı yok, birim test edilir).
 * Girdi: görünümün `productInfoForm` nesnesi (doğrudan düzenlenen model). Çıktı: eksik zorunlu bilgiler,
 * uyarılar, adım erişimi ve adım durumları.
 *
 * Kaynaklar (uydurma kural YOK):
 *  - Kaydet düğmesinin eski koşulu (`isSaveDisabled`/`isUpdateDisabled`): kategori + marka + en az bir varyant
 *    + her varyantta stok kodu ve barkod.
 *  - Form kuralları: ürün başlığı 2–160 karakter (formRules.titleRules); varyantlı üründe ana kod
 *    (formRules.stockcodeRules) — arka uçta `Products.maincode` ve `Products.title` şemada `required`.
 *  - Arka uç: `Variants.stockcode` zorunlu ve `stockcode`/`barcode` benzersiz dizinli (Variant.ts) — aynı formdaki
 *    yinelenen kod kayıtta hataya döner.
 *  - Uyarılar (engellemez): Trendyol doğrulaması satış fiyatı ≤ 0 ve satış > piyasa fiyatını reddeder
 *    (ProductTransformer.validate); resim yoksa yalnızca bilgi olarak gösterilir.
 */

export type StepIndex = 0 | 1 | 2 | 3

export type ProductFieldKey =
  | 'category'
  | 'brand'
  | 'title'
  | 'maincode'
  | 'variants'
  | 'stockcode'
  | 'barcode'
  | 'duplicateStockcode'
  | 'duplicateBarcode'

export type WarningKey = 'salePrice' | 'priceOrder' | 'images'

export interface ProgressItem {
  key: ProductFieldKey | WarningKey
  step: StepIndex
  /** İnsan-okunur, aksiyon alınabilir kısa metin. */
  label: string
  /** Kullanıcıyı götürecek alanın `data-pf-field` değeri (odak için). */
  field?: string
}

export interface StepInfo {
  index: StepIndex
  locked: boolean
  /** Bu adımdaki eksik zorunlu bilgi sayısı. */
  missing: number
  /** Adımda hiç zorunlu bilgi yok (Detay adımı). */
  optional: boolean
  complete: boolean
  /** Kilit nedeni (yalnızca `locked` iken). */
  lockedReason?: string
}

export interface ProductFormProgress {
  missing: ProgressItem[]
  warnings: ProgressItem[]
  steps: StepInfo[]
  requiredTotal: number
  requiredDone: number
  canSave: boolean
}

const TITLE_MIN = 2
const TITLE_MAX = 160

const text = (value: unknown): string => (value === undefined || value === null ? '' : String(value).trim())

export function isTitleValid(title: unknown): boolean {
  const len = text(title).length
  return len >= TITLE_MIN && len <= TITLE_MAX
}

function variantsOf(form: any): any[] {
  return Array.isArray(form?.variants) ? form.variants : []
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const v of values) {
    if (!v) continue
    if (seen.has(v)) dup.add(v)
    seen.add(v)
  }
  return [...dup]
}

/** Adım kilitleri: 0 her zaman açık; 1 kategori ister; 2 geçerli başlık (+ varyantlıda ana kod); 3 geçerli başlık. */
export function stepAccess(form: any): boolean[] {
  const titleOk = isTitleValid(form?.title)
  const hasVariant = form?.hasVariant === true
  return [true, !!form?.category, titleOk && (!hasVariant || !!text(form?.maincode)), titleOk]
}

function lockReason(index: StepIndex, form: any): string | undefined {
  if (index === 1 && !form?.category) return 'Önce bir kategori seçin.'
  if (index === 2 || index === 3) {
    if (!isTitleValid(form?.title)) return 'Önce ürün başlığını girin (en az 2 karakter).'
    if (index === 2 && form?.hasVariant === true && !text(form?.maincode)) return 'Önce varyantlı ürün için ana kodu girin.'
  }
  return undefined
}

export function evaluateProductForm(form: any): ProductFormProgress {
  const missing: ProgressItem[] = []
  const warnings: ProgressItem[] = []
  let requiredTotal = 0
  let requiredDone = 0

  const check = (ok: boolean, item: ProgressItem) => {
    requiredTotal += 1
    if (ok) requiredDone += 1
    else missing.push(item)
  }

  const hasVariant = form?.hasVariant === true
  const variants = variantsOf(form)

  check(!!form?.category, { key: 'category', step: 0, label: 'Kategori seçin', field: 'category' })
  check(!!form?.brand, { key: 'brand', step: 1, label: 'Marka seçin', field: 'brand' })
  check(isTitleValid(form?.title), {
    key: 'title',
    step: 1,
    label: text(form?.title) ? 'Ürün başlığı 2–160 karakter olmalı' : 'Ürün başlığını girin',
    field: 'title',
  })
  if (hasVariant) {
    check(!!text(form?.maincode), { key: 'maincode', step: 1, label: 'Ana kodu girin', field: 'maincode' })
    check(variants.length > 0, { key: 'variants', step: 2, label: 'En az bir varyant oluşturun' })
  }

  const noStockcode = variants.filter((v) => !text(v?.stockcode)).length
  const noBarcode = variants.filter((v) => !text(v?.barcode)).length
  const single = !hasVariant
  if (variants.length > 0 || single) {
    check(noStockcode === 0 && variants.length > 0, {
      key: 'stockcode',
      step: 2,
      label: single || variants.length === 1 ? 'Stok kodunu girin' : `${noStockcode} varyantta stok kodu eksik`,
      field: 'stockcode',
    })
    check(noBarcode === 0 && variants.length > 0, {
      key: 'barcode',
      step: 2,
      label: single || variants.length === 1 ? 'Barkodu girin' : `${noBarcode} varyantta barkod eksik`,
      field: 'barcode',
    })
  }

  const dupStock = duplicates(variants.map((v) => text(v?.stockcode)))
  if (dupStock.length) {
    requiredTotal += 1
    missing.push({ key: 'duplicateStockcode', step: 2, label: `Yinelenen stok kodu: ${dupStock.slice(0, 3).join(', ')}${dupStock.length > 3 ? '…' : ''}`, field: 'stockcode' })
  }
  const dupBarcode = duplicates(variants.map((v) => text(v?.barcode)))
  if (dupBarcode.length) {
    requiredTotal += 1
    missing.push({ key: 'duplicateBarcode', step: 2, label: `Yinelenen barkod: ${dupBarcode.slice(0, 3).join(', ')}${dupBarcode.length > 3 ? '…' : ''}`, field: 'barcode' })
  }

  // --- Uyarılar (kaydı engellemez) ---
  const numeric = (v: unknown) => (v === undefined || v === null || v === '' ? NaN : Number(v))
  const priced = variants.filter((v) => v?.prices && v.prices.isPlatformBasedPrice !== true)
  const zeroSale = priced.filter((v) => !(numeric(v.prices.salePrice) > 0)).length
  if (zeroSale > 0) {
    warnings.push({
      key: 'salePrice',
      step: 2,
      label: single || variants.length === 1 ? 'Satış fiyatı 0 — Trendyol bu ürünü reddeder' : `${zeroSale} varyantta satış fiyatı 0 — Trendyol bu ürünleri reddeder`,
      field: 'salePrice',
    })
  }
  const inverted = priced.filter((v) => numeric(v.prices.salePrice) > 0 && numeric(v.prices.marketPrice) > 0 && numeric(v.prices.salePrice) > numeric(v.prices.marketPrice)).length
  if (inverted > 0) {
    warnings.push({
      key: 'priceOrder',
      step: 2,
      label: single || variants.length === 1 ? 'Satış fiyatı piyasa fiyatından yüksek — Trendyol bu ürünü reddeder' : `${inverted} varyantta satış fiyatı piyasa fiyatından yüksek — Trendyol bu ürünleri reddeder`,
      field: 'salePrice',
    })
  }
  const productImages = Array.isArray(form?.images) ? form.images.length : 0
  const variantImages = variants.reduce((n, v) => n + (Array.isArray(v?.images) ? v.images.length : 0), 0)
  if (productImages === 0 && variantImages === 0) {
    warnings.push({ key: 'images', step: 1, label: 'Ürün resmi eklenmedi', field: 'gallery' })
  }

  const access = stepAccess(form)
  const steps: StepInfo[] = ([0, 1, 2, 3] as StepIndex[]).map((index) => {
    const count = missing.filter((m) => m.step === index).length
    const optional = index === 3
    return {
      index,
      locked: !access[index],
      missing: count,
      optional,
      complete: !optional && count === 0,
      lockedReason: access[index] ? undefined : lockReason(index, form),
    }
  })

  return { missing, warnings, steps, requiredTotal, requiredDone, canSave: missing.length === 0 }
}

/** Kaydet düğmesi devre dışıyken görünen tek cümlelik açıklama (aria-describedby hedefi). */
export function saveHint(progress: ProductFormProgress, saveLabel: string): string {
  const n = progress.missing.length
  if (n === 0) {
    const w = progress.warnings.length
    return w > 0 ? `${saveLabel} için hazır — ${w} uyarı var, kaydı engellemez.` : `${saveLabel} için hazır.`
  }
  const first = progress.missing[0].label.charAt(0).toLocaleLowerCase('tr-TR') + progress.missing[0].label.slice(1)
  return n === 1 ? `${saveLabel} için 1 zorunlu bilgi eksik: ${first}.` : `${saveLabel} için ${n} zorunlu bilgi eksik. İlki: ${first}.`
}

/** Bir eksik maddenin tıklanınca götüreceği adım: kendi adımı kilitliyse kilidi açacak ilk eksiğin adımı. */
export function resolveTargetStep(item: ProgressItem, progress: ProductFormProgress): StepIndex {
  const own = progress.steps[item.step]
  if (own && !own.locked) return item.step
  return progress.missing[0]?.step ?? 0
}

export interface SummaryRow {
  label: string
  value: string
}

/** Kaydet öncesi özet satırları — yalnızca formda gerçekten bulunan değerler. */
export function buildSummaryRows(form: any, names: { category?: string; brand?: string }): SummaryRow[] {
  const variants = variantsOf(form)
  const hasVariant = form?.hasVariant === true
  const rows: SummaryRow[] = [
    { label: 'Ürün tipi', value: hasVariant ? 'Varyantlı ürün' : 'Tekil ürün' },
    { label: 'Kategori', value: names.category || (form?.category ? 'Seçildi' : '—') },
    { label: 'Marka', value: names.brand || (form?.brand ? 'Seçildi' : '—') },
    { label: 'Ürün başlığı', value: text(form?.title) || '—' },
  ]
  if (hasVariant) {
    rows.push({ label: 'Ana kod', value: text(form?.maincode) || '—' })
    rows.push({ label: 'Varyant sayısı', value: String(variants.length) })
  } else if (variants[0]) {
    rows.push({ label: 'Stok kodu', value: text(variants[0].stockcode) || '—' })
    rows.push({ label: 'Barkod', value: text(variants[0].barcode) || '—' })
  }
  const totalStock = variants.reduce((n, v) => n + (Number(v?.stock) || 0), 0)
  rows.push({ label: 'Toplam stok', value: String(totalStock) })
  return rows
}
