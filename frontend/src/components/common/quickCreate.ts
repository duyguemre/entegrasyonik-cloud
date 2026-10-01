/**
 * frontend/src/components/common/quickCreate.ts
 *
 * FR2-PFORM madde 23 — combobox'tan "yeni marka/kategori ekle" (saf yardımcılar; bileşen: QuickCreateDialog).
 * Eski hâl: listenin altındaki metin kutusu v-autocomplete'in menüsünde duruyordu; Vuetify menüde basılan her
 * yazdırılabilir tuşu arama kutusuna geri yönlendirdiği (VAutocomplete `onListKeydown`) için kutuya YAZILAMIYORDU.
 * Ayrıca istek beklenmiyor, oluşturulan kayıt seçilmiyor ve hata sessizce yutuluyordu.
 * Uçlar (backend salt-okunur doğrulandı): `BrandService/addBrand` `{ title }` → `{ _id }`;
 * `CategoryService/addCategory` `{ parentCategoryId?, title }` → `{ _id }` (üst yoksa ana kök). rpc-input: title ≤ 200.
 */
import { apiMessage, apiStatus } from '@/composables/apiErrors'

export const TITLE_MIN = 2
export const TITLE_MAX = 160

/** Baş/son boşluk atılır, iç boşluklar teke iner. */
export function normalizeTitle(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

const fold = (s: string) => normalizeTitle(s).toLocaleUpperCase('tr-TR')

/** Türkçe büyük/küçük harf duyarsız "içerir" (İ/ı doğru). */
export function trIncludes(haystack: unknown, needle: unknown): boolean {
  const q = fold(String(needle ?? ''))
  if (!q) return true
  return fold(String(haystack ?? '')).includes(q)
}

/** Aynı adlı (tr, harf duyarsız) mevcut kayıt. */
export function findDuplicate<T extends { title?: string }>(list: readonly T[] | undefined, title: string): T | undefined {
  const t = fold(title)
  if (!t) return undefined
  return (list ?? []).find((x) => fold(x.title ?? '') === t)
}

/** Ad kuralı (ürün başlığıyla aynı 2–160). Geçerliyse `null`. */
export function titleProblem(title: string, noun: string): string | null {
  const t = normalizeTitle(title)
  if (!t) return `${capitalize(noun)} adı gerekli.`
  if (t.length < TITLE_MIN) return `${capitalize(noun)} adı en az ${TITLE_MIN} karakter olmalı.`
  if (t.length > TITLE_MAX) return `${capitalize(noun)} adı en çok ${TITLE_MAX} karakter olabilir.`
  return null
}

/** `restApi.post` hata nesnesinden kullanıcı mesajı ("ne oldu — ne yapılmalı"); ham hata gösterilmez. */
export function createErrorMessage(res: unknown, noun: string): string {
  const status = apiStatus(res)
  if (status === 403) return `${capitalize(noun)} eklemek için yetkiniz yok — hesap yöneticinizden katalog düzenleme izni isteyin.`
  if (status === 409) return `Bu adla bir ${noun} zaten var — listeden seçin.`
  return apiMessage(res, `${capitalize(noun)} eklenemedi — bağlantınızı kontrol edip tekrar deneyin.`)
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s
}

/** Mağazalar (brandsStore/categoriesStore) `add*` sonucu. */
export interface CreateResult {
  id?: string
  error?: unknown
}
