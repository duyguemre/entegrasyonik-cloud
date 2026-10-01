/**
 * frontend/src/components/productDefinitions/images/gallerySrc.ts
 *
 * FE-CFG-1 — galeri bileşenlerinin (B2: galeri, önizleme, seçici, varyant ataması) görsel adresi tek kuraldan:
 * `config/imageUrl.ts` (önce DB kaydının `url`'i, yoksa public-config görsel tabanı + backend yolu). Galeri kabı
 * (`ProductImagesComponent`, `ProductVariantImagesComponent`) ürün bağlamıyla `provideGallerySrc` çağırır; alt
 * bileşenler `useGallerySrc` ile alır. Sağlayıcı yoksa (yalıtılmış kullanım) yalnız DB `url`'i kullanılır.
 */
import { inject, provide, type InjectionKey } from 'vue'
import { useProductImageUrl } from '@/composables/useProductImageUrl'
import type { ProductImageRecord } from '@/config/imageUrl'

export type GallerySrc = (image: ProductImageRecord | null | undefined) => string | undefined

const GALLERY_SRC: InjectionKey<GallerySrc> = Symbol('gallerySrc')

const dbUrlOnly: GallerySrc = (image) => (typeof image?.url === 'string' && image.url.trim() ? image.url.trim() : undefined)

export function provideGallerySrc(product: () => { _id?: unknown; tempId?: unknown } | null | undefined): GallerySrc {
  const productImageUrl = useProductImageUrl()
  const src: GallerySrc = (image) => productImageUrl(image, product())
  provide(GALLERY_SRC, src)
  return src
}

export function useGallerySrc(): GallerySrc {
  return inject(GALLERY_SRC, dbUrlOnly)
}
