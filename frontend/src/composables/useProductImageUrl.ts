/**
 * frontend/src/composables/useProductImageUrl.ts
 *
 * FE-CFG-1 — bileşenlerin ürün görseli adresini kurduğu tek giriş: taban `stores/publicConfig` (backend ortam değeri),
 * mağaza kimliği oturumdan. Kural `config/imageUrl.ts` `buildProductImageUrl` (önce DB `url`, yoksa backend yolu).
 */
import { buildProductImageUrl, productImageDir, type ProductImageRecord } from '@/config/imageUrl'
import { usePublicConfigStore } from '@/stores/publicConfig'
import useUser from '@/composables/user'

export function useProductImageUrl() {
  const publicConfig = usePublicConfigStore()
  const user = useUser()

  /** `product`: `{ _id, tempId }` (ürün formu) ya da doğrudan ürün kimliği. */
  return function productImageUrl(
    image: ProductImageRecord | null | undefined,
    product: { _id?: unknown; tempId?: unknown } | string | null | undefined,
    options: { thumbnail?: boolean } = {},
  ): string | undefined {
    const productId = typeof product === 'string' ? product : productImageDir(image, product)
    return buildProductImageUrl(image, {
      baseUrl: publicConfig.productBaseUrl,
      clientId: user.getSessionScope.value.tenantId,
      productId,
      thumbnail: options.thumbnail,
    })
  }
}
