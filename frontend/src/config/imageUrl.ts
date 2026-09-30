/**
 * frontend/src/config/imageUrl.ts
 *
 * FE-CFG-1 (ADR-0031) — ürün görseli adresinin TEK yardımcısı.
 *
 * Görsel tabanı bir ORTAM değeridir; tek kaynak backend'dir (`GET /api/public-config` →
 * `env.images.productBaseUrl`, bkz. docs/cloud-contracts/API_PUBLIC_CONFIG.md). Uygulama açılışta
 * `stores/publicConfig.ts` ile alır. Aşağıdaki sabit YALNIZ yapılandırma alınamazsa (çevrimdışı, hata)
 * kullanılan güvenli varsayılandır — bu alan adı `src/` içinde başka hiçbir dosyada geçmez
 * (statik test: `tests/public-config.test.ts`).
 *
 * Kural (sırayla):
 *   1. DB'deki görsel kaydının `url` alanı varsa AYNEN o kullanılır (backend'in yazdığı kesin adres).
 *   2. Yoksa backend'in yazdığı yoldan kurulur: `productBaseUrl + <clientId>/<productId>/<imageId>.<ext>`
 *      (küçük resimde `<imageId>_t.<ext>`; taslak üründe `productId` = `tempId` — backend taslak görselleri
 *      de `products/<clientId>/<tempId>/` altına yazar, ayrı bir `temp/` dizini YOKTUR).
 *   3. Taban, clientId, ürün/görsel kimliği ya da uzantı eksikse `undefined` → çağıran yer tutucu gösterir.
 */

/** Yapılandırma alınamazsa kullanılan görsel tabanı (bugünkü sabit). */
export const DEFAULT_PRODUCT_IMAGE_BASE_URL = 'https://images.entegrasyonik.com/products/'

export interface ProductImageRecord {
  _id?: string | { toString(): string } | null
  url?: string | null
  extension?: string | null
  isTempImage?: boolean
}

export interface ProductImageUrlContext {
  /** `env.images.productBaseUrl` (sonda `/`). */
  baseUrl: string | null | undefined
  /** Etkin mağaza (tenant) kimliği. */
  clientId: string | number | null | undefined
  /** Ürün kimliği; taslak üründe `tempId`. */
  productId: string | number | null | undefined
  /** Küçük resim (`_t`) sürümü — yalnız tabandan KURULAN adreste uygulanır. */
  thumbnail?: boolean
}

/** Tabanı `http(s)://…/` biçimine getirir; geçersizse boş dize. */
export function normalizeImageBaseUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const value = raw.trim()
  if (!/^https?:\/\/[^\s]+$/i.test(value)) return ''
  return value.endsWith('/') ? value : `${value}/`
}

function idText(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  return text === '[object Object]' ? '' : text
}

export function buildProductImageUrl(image: ProductImageRecord | null | undefined, ctx: ProductImageUrlContext): string | undefined {
  if (!image) return undefined
  if (typeof image.url === 'string' && image.url.trim()) return image.url.trim()

  const base = normalizeImageBaseUrl(ctx.baseUrl)
  const clientId = idText(ctx.clientId)
  const productId = idText(ctx.productId)
  const imageId = idText(image._id)
  const extension = idText(image.extension).replace(/^\./, '')
  if (!base || !clientId || clientId === '0' || !productId || !imageId || !extension) return undefined

  const segment = (s: string) => encodeURIComponent(s)
  const file = `${segment(imageId)}${ctx.thumbnail ? '_t' : ''}.${segment(extension)}`
  return `${base}${segment(clientId)}/${segment(productId)}/${file}`
}

/**
 * Görselin backend'de durduğu ürün dizini: kaydedilmiş görsel (`isTempImage === false`) ürün kimliği altında,
 * taslak görsel ürünün `tempId`'si altında (bkz. backend `ProductService.copyTempImages`).
 */
export function productImageDir(
  image: ProductImageRecord | null | undefined,
  product: { _id?: unknown; tempId?: unknown } | null | undefined,
): string | undefined {
  const id = idText(product?._id)
  const tempId = idText(product?.tempId)
  const dir = image?.isTempImage === false ? id || tempId : tempId || id
  return dir || undefined
}
