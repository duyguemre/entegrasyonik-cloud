/**
 * frontend/src/components/productDefinitions/products/productImage.ts
 *
 * B1 — ürün listesi küçük görselleri için SAF görsel adresi çözümü (Vue import'u yok; `tests/b1-product-thumb.test.ts`).
 * Eski `ProductImageComponent` / `ProductVariantImageComponent` kurallarıyla aynı (davranış değişmedi):
 *  · ürün satırı: yalnız `image.url` (eski bileşen hesapladığı adresi sonunda `url` ile eziyordu),
 *  · varyant: `images[i]` ya doğrudan `http…` adres ya da ürünün `images` dizisindeki kaydın `_id`'si;
 *    kayıtta `url` yoksa `…/products/[temp/]<tempId>/<_id>_t.<uzantı>`.
 */
import { DEFAULT_PRODUCT_IMAGE_BASE_URL } from '@/config/imageUrl'
export const PRODUCT_IMAGE_BASE = DEFAULT_PRODUCT_IMAGE_BASE_URL

/** Önizleme şeridinde gösterilen en fazla görsel (fazlası sessizce kırpılır — sayı yazılmaz). */
export const PREVIEW_STRIP_LIMIT = 5

const isHttp = (x: unknown): x is string => typeof x === 'string' && /^https?:\/\//.test(x)

/** Ürün satırı görselleri (sıra `order` alanıyla; yalnız `url` taşıyanlar). */
export function productImageSrcs(product: any): string[] {
  const images: any[] = Array.isArray(product?.images) ? [...product.images] : []
  images.sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0))
  return images.map((img) => (isHttp(img) ? img : img?.url)).filter(isHttp)
}

/** Tek bir varyant görsel referansını adrese çevirir (bulunamazsa `undefined`). */
export function variantImageSrc(ref: unknown, product: any): string | undefined {
  if (!ref) return undefined
  if (isHttp(ref)) return ref
  const image = (product?.images ?? []).find((img: any) => img?._id === ref)
  if (!image?._id) return undefined
  if (isHttp(image.url)) return image.url
  if (!product?.tempId || !image.extension) return undefined
  const folder = image.isTempImage === false ? PRODUCT_IMAGE_BASE : `${PRODUCT_IMAGE_BASE}temp/`
  return `${folder}${product.tempId}/${image._id}_t.${image.extension}`
}

/** Varyantın çözülebilen tüm görselleri (sıra korunur, tekrarlar atılır). */
export function variantImageSrcs(variant: any, product: any): string[] {
  const out: string[] = []
  for (const ref of variant?.images ?? []) {
    const src = variantImageSrc(ref, product)
    if (src && !out.includes(src)) out.push(src)
  }
  return out
}
