// B1 — ürün listesi küçük görselleri: sayı rozeti yok, sessiz yığın ipucu, iskelet, yer tutucu, gecikmeli önizleme.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PRODUCT_IMAGE_BASE, PREVIEW_STRIP_LIMIT, productImageSrcs, variantImageSrc, variantImageSrcs,
} from '@/components/productDefinitions/products/productImage'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const THUMB = 'src/components/productDefinitions/products/ProductThumb.vue'
const LISTVIEW = 'src/views/secure/productDefinitions/ProductListView.vue'
const VLIST = 'src/components/productDefinitions/variants/ProductVariantListComponent.vue'

describe('görsel adresi çözümü (eski bileşenlerle aynı kural)', () => {
  it('ürün satırı: order sırası, yalnız url taşıyanlar', () => {
    const p = { images: [{ _id: 'b', url: 'https://x/b.jpg', order: 2 }, { _id: 'a', url: 'https://x/a.jpg', order: 1 }, { _id: 'c', order: 0 }] }
    expect(productImageSrcs(p)).toEqual(['https://x/a.jpg', 'https://x/b.jpg'])
    expect(productImageSrcs({})).toEqual([])
  })

  it('varyant: http doğrudan, _id → ürün görseli url, url yoksa (temp/)tempId/_id_t.uzantı', () => {
    const product = { tempId: 'T1', images: [{ _id: 'i1', url: 'https://x/1.jpg' }, { _id: 'i2', extension: 'png', isTempImage: false }, { _id: 'i3', extension: 'jpg' }] }
    expect(variantImageSrc('https://cdn/z.jpg', product)).toBe('https://cdn/z.jpg')
    expect(variantImageSrc('i1', product)).toBe('https://x/1.jpg')
    expect(variantImageSrc('i2', product)).toBe(`${PRODUCT_IMAGE_BASE}T1/i2_t.png`)
    expect(variantImageSrc('i3', product)).toBe(`${PRODUCT_IMAGE_BASE}temp/T1/i3_t.jpg`)
    expect(variantImageSrc('yok', product)).toBeUndefined()
    expect(variantImageSrcs({ images: ['i1', 'i1', 'yok', 'i2'] }, product)).toHaveLength(2)
  })
})

describe('ProductThumb', () => {
  const src = read(THUMB)

  it('sayı rozeti yok; çoklu görsel yalnız yığın kenarı (mutlak konum → satır yüksekliği değişmez)', () => {
    expect(src).not.toMatch(/__count|images\.length\s*}}/)
    expect(src).toMatch(/\.pth\.is-stacked::before\s*{[^}]*position: absolute/)
    expect(src).toMatch(/stacked = computed\(\(\) => showImage\.value && props\.gallery\.length > 1\)/)
  })

  it('kare ölçüler (xs 28 / sm 40 / md 44), cover, iskelet + reduced-motion, yer tutucu ikon', () => {
    expect(src).toMatch(/--pth-size: 40px/)
    expect(src).toMatch(/\.pth--xs { --pth-size: 28px; }/)
    expect(src).toMatch(/\.pth--md { --pth-size: 44px; }/)
    expect(src).toMatch(/object-fit: cover/)
    expect(src).toMatch(/is-loading/)
    expect(src).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/)
    expect(src).toMatch(/mdi-image-outline/)
  })

  it('önizleme: gecikmeli, sabit çerçeve (hoplamaz), şerit sınırı, etkileşimsiz tooltip', () => {
    expect(src).toMatch(/<v-tooltip[^>]*:open-delay="PREVIEW_OPEN_DELAY"/)
    expect(src).toMatch(/PREVIEW_OPEN_DELAY = (4|5)\d\d/)
    expect(src).toMatch(/\.pth-pop__frame {[^}]*width: 240px;[^}]*height: 240px;/)
    expect(PREVIEW_STRIP_LIMIT).toBe(5)
    expect(src).toMatch(/inheritAttrs: false/) // sınıflar tooltip'e değil görsele
  })

  it('yalnız semantik token (ham renk yok); odaklanabilir sürümde odak halkası', () => {
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    expect(src).toMatch(/:focus-visible { outline: none; box-shadow: var\(--ek-focus-ring\); }/)
  })
})

describe('kullanım yerleri', () => {
  it('ürün listesi: resim adedi rozeti kaldırıldı, ProductThumb (düğme, md) kullanılır', () => {
    const lv = read(LISTVIEW)
    expect(lv).not.toMatch(/plv-thumb__count/)
    expect(lv).toMatch(/<ProductThumb interactive size="md"/)
  })
  it('varyant alt listesi: ProductThumb (kompaktta xs)', () => {
    const vl = read(VLIST)
    expect(vl).toMatch(/<ProductThumb[^>]*:size="isCompact \? 'xs' : 'sm'"/)
    expect(vl).not.toMatch(/ProductVariantImageComponent/)
  })
})
