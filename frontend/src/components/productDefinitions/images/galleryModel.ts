/**
 * frontend/src/components/productDefinitions/images/galleryModel.ts
 *
 * Faz 3 B2 — ürün resim galerisi + varyanta resim atama için SAF mantık (Vue yok; vitest:
 * `tests/b2-gallery-model.test.ts`). Bileşenler (ProductImagesComponent, VariantImageAssign,
 * ProductVariantImagesComponent) yalnızca bu fonksiyonları çağırır.
 *
 * Backend sözleşmesi DEĞİŞMEDİ (ImageApi): sıra = `sortImages({ sortedImageIds })` → dizideki ilk
 * görsel KAPAK'tır (backend `order` 0). Varyantın görselleri `variant.images` dizisinde görsel
 * KİMLİĞİ (bazı içe aktarılmış ürünlerde görsel URL'si) olarak tutulur ve ürün kaydıyla gider.
 */
import { formatNumber } from '@entegrasyonik/ui/format'

export interface GalleryImage {
  _id: string
  url?: string
  width?: number
  height?: number
  size?: number
  extension?: string
  order?: number
  [k: string]: unknown
}

export interface VariantChoice {
  choiceId: string
  choiceValueId: string
}

export interface VariantLike {
  _id?: string
  tempId?: string
  stockcode?: string
  choices?: VariantChoice[]
  images?: string[]
  [k: string]: unknown
}

// ---------------------------------------------------------------- sıra / kapak

/** Diziyi değiştirmeden `from` → `to` taşınmış kopya döner (sınır dışı indeks kırpılır). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice()
  if (from < 0 || from >= out.length) return out
  const target = Math.max(0, Math.min(out.length - 1, to))
  if (target === from) return out
  const [item] = out.splice(from, 1)
  out.splice(target, 0, item)
  return out
}

/** Görseli kapak (ilk sıra) yapar. Zaten kapaksa ya da yoksa aynı sıra döner. */
export function makeCover<T extends { _id: string }>(images: readonly T[], id: string): T[] {
  const i = images.findIndex((x) => x._id === id)
  return i <= 0 ? images.slice() : moveItem(images, i, 0)
}

/** İki sıra aynı mı (gereksiz `sortImages` çağrısını önler). */
export function sameOrder(a: readonly { _id: string }[], b: readonly { _id: string }[]): boolean {
  return a.length === b.length && a.every((x, i) => x._id === b[i]._id)
}

/**
 * Klavyeyle taşıma: ızgarada ←/→ bir adım, ↑/↓ bir satır (`columns`), Home/End uçlar.
 * Bilinmeyen tuş → `null`.
 */
export function keyboardTarget(index: number, key: string, columns: number, length: number): number | null {
  const cols = Math.max(1, columns)
  let next: number
  switch (key) {
    case 'ArrowLeft': next = index - 1; break
    case 'ArrowRight': next = index + 1; break
    case 'ArrowUp': next = index - cols; break
    case 'ArrowDown': next = index + cols; break
    case 'Home': next = 0; break
    case 'End': next = length - 1; break
    default: return null
  }
  return Math.max(0, Math.min(length - 1, next))
}

// ---------------------------------------------------------------- referans çözümleme

/** Varyanttaki görsel referansı (kimlik ya da URL) bu görsele mi işaret ediyor? */
export function refMatches(ref: string, image: GalleryImage): boolean {
  return ref === image._id || (!!image.url && ref === image.url)
}

export function resolveRef(ref: string, images: readonly GalleryImage[]): GalleryImage | undefined {
  return images.find((img) => refMatches(ref, img))
}

/** Varyantın galeride karşılığı olan görsel kimlikleri (sırası varyantın kendi sırası). */
export function variantImageIds(variant: VariantLike, images: readonly GalleryImage[]): string[] {
  const out: string[] = []
  for (const ref of variant.images ?? []) {
    const img = resolveRef(ref, images)
    if (img && !out.includes(img._id)) out.push(img._id)
  }
  return out
}

/**
 * Galeriden silinen görsellerin varyant referanslarını temizler. Önceki davranış yalnız kimlikleri
 * tutuyordu (URL referanslı içe aktarılmış varyantların görselleri sessizce düşüyordu); artık
 * galeride karşılığı OLAN her referans (kimlik ya da URL) korunur.
 */
export function pruneVariantRefs(variants: VariantLike[], images: readonly GalleryImage[]): void {
  for (const v of variants) {
    v.images = (v.images ?? []).filter((ref) => !!resolveRef(ref, images))
  }
}

// ---------------------------------------------------------------- seçenek grupları

export const variantKey = (v: VariantLike, index = 0): string =>
  String(v.tempId ?? v._id ?? v.stockcode ?? `#${index}`)

export interface OptionValue {
  valueId: string
  title: string
  variantKeys: string[]
}

export interface OptionGroup {
  choiceId: string
  title: string
  values: OptionValue[]
}

/**
 * Varyantlardaki seçeneklerden (ör. Renk, Beden) grup listesi — ilk görünme sırasıyla. Başlıklar
 * çağıranın sözlüğünden gelir; bulunamazsa kimlik gösterilmez, "Seçenek" / "Değer" yazılır.
 */
export function buildOptionGroups(
  variants: readonly VariantLike[],
  choiceTitle: (id: string) => string | undefined,
  valueTitle: (id: string) => string | undefined,
): OptionGroup[] {
  const groups: OptionGroup[] = []
  variants.forEach((v, i) => {
    for (const c of v.choices ?? []) {
      let g = groups.find((x) => x.choiceId === c.choiceId)
      if (!g) {
        g = { choiceId: c.choiceId, title: choiceTitle(c.choiceId) || 'Seçenek', values: [] }
        groups.push(g)
      }
      let val = g.values.find((x) => x.valueId === c.choiceValueId)
      if (!val) {
        val = { valueId: c.choiceValueId, title: valueTitle(c.choiceValueId) || 'Değer', variantKeys: [] }
        g.values.push(val)
      }
      val.variantKeys.push(variantKey(v, i))
    }
  })
  return groups
}

/**
 * Görsel ataması için en anlamlı grup: görseller genelde RENK gibi görünüşü değiştiren seçeneğe
 * bağlanır. Adında renk/desen/model geçen grup önce; yoksa en az değerli (>1) grup; yoksa ilki.
 */
export function preferredGroup(groups: readonly OptionGroup[]): OptionGroup | undefined {
  const visual = groups.find((g) => /renk|color|colour|desen|model|görünüm/i.test(g.title) && g.values.length > 1)
  if (visual) return visual
  const multi = groups.filter((g) => g.values.length > 1).sort((a, b) => a.values.length - b.values.length)
  return multi[0] ?? groups[0]
}

/** Seçim: { choiceId: [valueId…] } — boş liste o seçeneği SINIRLAMAZ. */
export type OptionSelection = Record<string, string[]>

export function matchesSelection(v: VariantLike, selection: OptionSelection): boolean {
  for (const [choiceId, values] of Object.entries(selection)) {
    if (!values || values.length === 0) continue
    const c = (v.choices ?? []).find((x) => x.choiceId === choiceId)
    if (!c || !values.includes(c.choiceValueId)) return false
  }
  return true
}

export function hasAnySelection(selection: OptionSelection): boolean {
  return Object.values(selection).some((v) => Array.isArray(v) && v.length > 0)
}

export function matchingVariants<T extends VariantLike>(variants: readonly T[], selection: OptionSelection): T[] {
  if (!hasAnySelection(selection)) return []
  return variants.filter((v) => matchesSelection(v, selection))
}

/** Galeri sırasına göre sıralar; galeride olmayan referanslar (dış URL) kendi sırasıyla sonda kalır. */
export function sortByGallery(refs: readonly string[], images: readonly GalleryImage[]): string[] {
  const pos = (ref: string) => {
    const i = images.findIndex((img) => refMatches(ref, img))
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return refs
    .map((ref, i) => ({ ref, i, p: pos(ref) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.ref)
}

/**
 * Grup görsel durumu: `common` = gruptaki TÜM varyantlarda olan, `partial` = yalnız bazılarında olan
 * görsel kimlikleri (galeri sırasıyla). Boş grup → ikisi de boş.
 */
export function groupImageState(variants: readonly VariantLike[], images: readonly GalleryImage[]) {
  const sets = variants.map((v) => new Set(variantImageIds(v, images)))
  const common: string[] = []
  const partial: string[] = []
  if (sets.length === 0) return { common, partial }
  for (const img of images) {
    const n = sets.filter((s) => s.has(img._id)).length
    if (n === sets.length) common.push(img._id)
    else if (n > 0) partial.push(img._id)
  }
  return { common, partial }
}

/**
 * Seçenek grubu seviyesinde atama (ör. Renk=Kırmızı → tüm bedenler): gruptaki her varyantta
 * `next` kümesinde olup eksik olanlar eklenir, `prevCommon`'da olup `next`'ten çıkarılanlar
 * kaldırılır. Varyanta özel (grup ortak kümesinde olmayan) görseller KORUNUR. Sonuç galeri
 * sırasına göre dizilir. Değişen varyant sayısını döner (yerinde değiştirir).
 */
export function applyGroupImages(
  variants: VariantLike[],
  next: readonly string[],
  prevCommon: readonly string[],
  images: readonly GalleryImage[],
): number {
  let changed = 0
  const nextSet = new Set(next)
  const removed = new Set(prevCommon.filter((id) => !nextSet.has(id)))
  for (const v of variants) {
    const before = (v.images ?? []).slice()
    const kept = before.filter((ref) => {
      const img = resolveRef(ref, images)
      return !(img && removed.has(img._id))
    })
    const have = new Set(kept.map((ref) => resolveRef(ref, images)?._id ?? ref))
    for (const id of next) if (!have.has(id)) kept.push(id)
    const after = sortByGallery(kept, images)
    if (after.length !== before.length || after.some((x, i) => x !== before[i])) {
      v.images = after
      changed++
    }
  }
  return changed
}

/** Seçili görselleri eşleşen varyantlara EKLER (var olanlar korunur). Değişen varyant sayısı. */
export function addImagesToVariants(variants: VariantLike[], imageIds: readonly string[], images: readonly GalleryImage[]): number {
  let changed = 0
  for (const v of variants) {
    const have = new Set(variantImageIds(v, images))
    const add = imageIds.filter((id) => !have.has(id))
    if (add.length === 0) continue
    v.images = sortByGallery([...(v.images ?? []), ...add], images)
    changed++
  }
  return changed
}

/** Görseli verilen varyantlardan kaldırır (kimlik ya da URL referansı). Değişen varyant sayısı. */
export function removeImageFromVariants(variants: VariantLike[], imageId: string, images: readonly GalleryImage[]): number {
  const img = images.find((x) => x._id === imageId)
  let changed = 0
  for (const v of variants) {
    const before = v.images ?? []
    const after = before.filter((ref) => !(ref === imageId || (img && refMatches(ref, img))))
    if (after.length !== before.length) {
      v.images = after
      changed++
    }
  }
  return changed
}

/** Görsel kimliği → onu kullanan varyant anahtarları. */
export function imageUsage(images: readonly GalleryImage[], variants: readonly VariantLike[]): Map<string, string[]> {
  const map = new Map<string, string[]>(images.map((img) => [img._id, [] as string[]]))
  variants.forEach((v, i) => {
    for (const id of variantImageIds(v, images)) map.get(id)?.push(variantKey(v, i))
  })
  return map
}

/** Galeride karşılığı olan hiçbir görseli olmayan varyantlar. */
export function unassignedVariants<T extends VariantLike>(variants: readonly T[], images: readonly GalleryImage[]): T[] {
  return variants.filter((v) => variantImageIds(v, images).length === 0)
}

/** "Kırmızı · S" — seçenek değerlerinden okunur ad (yoksa stok kodu). */
export function variantLabel(v: VariantLike, valueTitle: (id: string) => string | undefined): string {
  const parts = (v.choices ?? []).map((c) => valueTitle(c.choiceValueId)).filter(Boolean) as string[]
  return parts.length ? parts.join(' · ') : String(v.stockcode ?? 'Varyant')
}

// ---------------------------------------------------------------- kalite ipuçları

/**
 * Görsel kalite ipuçları. Bu eşikler PAZARYERİ KURALI DEĞİLDİR (projede pazaryeri görsel kuralı
 * verisi yok) — genel öneridir; bu yüzden yalnız bilgi/uyarı olarak gösterilir, yüklemeyi engellemez.
 */
export const IMAGE_GUIDE = {
  /** Bunun altı "düşük çözünürlük" uyarısı (kısa kenar, px). */
  lowPx: 800,
  /** Önerilen kısa kenar (px) — altı yalnız bilgi. */
  recommendedPx: 1200,
  /** En-boy oranı bu aralığın dışındaysa bilgi (ör. çok geniş banner). */
  minRatio: 0.5,
  maxRatio: 2,
  /** Tek seferde en çok dosya (önceki bileşenle aynı sınır). */
  maxFilesPerBatch: 20,
  /** Kabul edilen türler. */
  accept: ['image/jpeg', 'image/png', 'image/webp'] as readonly string[],
  acceptAttr: 'image/jpeg,image/png,image/webp',
}

export type QualityLevel = 'ok' | 'info' | 'warning'

export interface QualityHint {
  level: QualityLevel
  /** Kısa rozet metni (kartta). */
  short: string
  /** Açıklama (önizleme / ipucu). */
  text: string
}

export function imageQuality(img: Pick<GalleryImage, 'width' | 'height'>): QualityHint[] {
  const hints: QualityHint[] = []
  const w = Number(img.width) || 0
  const h = Number(img.height) || 0
  if (!w || !h) return hints
  const short = Math.min(w, h)
  if (short < IMAGE_GUIDE.lowPx) {
    hints.push({ level: 'warning', short: 'Düşük çözünürlük', text: `Kısa kenar ${short} px. Yakınlaştırmada bulanık görünebilir; en az ${IMAGE_GUIDE.recommendedPx} px önerilir.` })
  } else if (short < IMAGE_GUIDE.recommendedPx) {
    hints.push({ level: 'info', short: 'Önerilenin altında', text: `Kısa kenar ${short} px; ${IMAGE_GUIDE.recommendedPx} px ve üzeri önerilir.` })
  }
  const ratio = w / h
  if (ratio < IMAGE_GUIDE.minRatio || ratio > IMAGE_GUIDE.maxRatio) {
    hints.push({ level: 'info', short: 'Sıra dışı oran', text: `${w}×${h} — kare ya da dikey (3:4) oran vitrinde daha iyi görünür.` })
  }
  return hints
}

export function worstLevel(hints: readonly QualityHint[]): QualityLevel {
  if (hints.some((h) => h.level === 'warning')) return 'warning'
  if (hints.some((h) => h.level === 'info')) return 'info'
  return 'ok'
}

// ---------------------------------------------------------------- dosya doğrulama

export interface FileCheck<F> {
  accepted: F[]
  rejected: { file: F; reason: string }[]
}

/** Dosya türü ve adet sınırı (tarayıcı tarafı ön kontrol; asıl doğrulama backend'de). */
export function checkFiles<F extends { name: string; type: string }>(files: readonly F[]): FileCheck<F> {
  const accepted: F[] = []
  const rejected: { file: F; reason: string }[] = []
  for (const f of files) {
    if (!IMAGE_GUIDE.accept.includes(f.type)) rejected.push({ file: f, reason: 'Desteklenmeyen tür (JPG, PNG ya da WebP yükleyin)' })
    else if (accepted.length >= IMAGE_GUIDE.maxFilesPerBatch) rejected.push({ file: f, reason: `Tek seferde en çok ${IMAGE_GUIDE.maxFilesPerBatch} görsel` })
    else accepted.push(f)
  }
  return { accepted, rejected }
}

/** 412 KB · 1,2 MB */
export function formatBytes(size: number | undefined): string {
  if (!size || size < 0) return '—'
  if (size < 1_000_000) return `${formatNumber(Math.max(1, Math.round(size / 1000)))} KB`
  return `${formatNumber(Math.round(size / 100_000) / 10)} MB`
}

// ---------------------------------------------------------------- yükleme kuyruğu

export type UploadStatus = 'queued' | 'uploading' | 'error'

export interface UploadItem {
  id: string
  name: string
  status: UploadStatus
  /** 0–100 */
  progress: number
  error?: string
}

/** Yükleme hatasını kullanıcı diline çevirir (ham HTTP kodu gösterilmez). */
export function uploadErrorText(status?: number): string {
  if (status === 413) return 'Dosya çok büyük'
  if (status === 401 || status === 403) return 'Oturum/yetki sorunu'
  if (status === undefined || status === 0) return 'Bağlantı kurulamadı'
  // Backend IMAGE_STORAGE_FAILED: dosya depoya (R2) yazılamadı; kayıt oluşturulmadı → tekrar denenebilir.
  if (status === 502) return 'Görsel depoya yüklenemedi'
  return 'Sunucu görseli kaydedemedi'
}

/** Kaç yükleme sürüyor / hatalı — başlık özeti için. */
export function uploadSummary(items: readonly UploadItem[]) {
  const active = items.filter((x) => x.status !== 'error').length
  const failed = items.filter((x) => x.status === 'error').length
  const progress = active
    ? Math.round(items.filter((x) => x.status !== 'error').reduce((s, x) => s + x.progress, 0) / active)
    : 0
  return { active, failed, progress }
}
