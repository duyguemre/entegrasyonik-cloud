// FR2-PFORM (fe-r2c) — ürün formu sentetik verisi (Protokol 7): galeri görselleri satır içi SVG (ağ yok),
// kanal bazında fiyatlı tekil ürün ve görselli varyantlı ürün. Fiyat/kanal kodları yalnız mevcut
// fixture'lardaki bağlı kanallardır (trendyol, hepsiburada, ideasoft — clientIntegrationsDoluFixture).
import { buildProduct } from './apiData'

const PALETTE = [
  ['#1f2937', '#e5e7eb'],
  ['#b91c1c', '#fee2e2'],
  ['#1d4ed8', '#dbeafe'],
  ['#047857', '#d1fae5'],
  ['#a16207', '#fef3c7'],
  ['#6d28d9', '#ede9fe'],
]

/** Basit "ürün" silueti (tişört) — her görsel farklı renk; metin yok (gerçek ürün fotoğrafı gibi). */
export function productSvg(i: number, w = 800, h = 800): string {
  const [fg, bg] = PALETTE[i % PALETTE.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" fill="${bg}"/>` +
    `<path d="M30 22 L42 16 Q50 22 58 16 L70 22 L82 34 L72 42 L68 38 L68 84 L32 84 L32 38 L28 42 L18 34 Z" fill="${fg}"/>` +
    (i % 2 ? `<circle cx="50" cy="48" r="7" fill="${bg}" opacity="0.85"/>` : `<rect x="44" y="40" width="12" height="3" fill="${bg}" opacity="0.8"/>`) +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const galleryImages = Array.from({ length: 6 }, (_, i) => ({
  _id: `img-r2c-${i + 1}`,
  url: productSvg(i),
  order: i,
  width: 1200,
  height: 1200,
  originalname: `urun-gorsel-${i + 1}.jpg`,
}))

export const r2cSingleProduct = buildProduct({
  _id: 'product-r2c-single',
  tempId: '66f0a0a0a0a0a0a0a0a0a0a1',
  title: 'Pamuklu Basic Tişört',
  hasVariant: false,
  category: 'cat-e2e-2',
  brand: 'brand-e2e-1',
  images: galleryImages,
  variants: [{
    tempId: 'single-r2c-1', stockcode: 'SK-R2C-TEKIL', barcode: '8690000000401', choices: [],
    prices: { salePrice: 349.9, marketPrice: 449.9, isPlatformBasedPrice: true },
    platforms: {
      trendyol: { prices: { salePrice: 369.9, marketPrice: 449.9 } },
      hepsiburada: { prices: { salePrice: 359.9, marketPrice: 449.9 } },
    },
    stock: 24, shelf: 'B-03', images: ['img-r2c-1'],
  }],
})

const v = (tempId: string, stockcode: string, barcode: string, color: string, size: string, imgs: string[], extra: Record<string, any> = {}) => ({
  tempId, stockcode, barcode,
  choices: [{ choiceId: 'choice-e2e-1', choiceValueId: color }, { choiceId: 'choice-e2e-2', choiceValueId: size }],
  prices: { salePrice: 349.9, marketPrice: 449.9, isPlatformBasedPrice: false },
  stock: 8, shelf: 'A-01', images: imgs, platforms: {}, maincode: 'MC-R2C-001', ...extra,
})

export const r2cVariantProduct = buildProduct({
  _id: 'product-r2c-variant',
  tempId: '66f0a0a0a0a0a0a0a0a0a0a2',
  title: 'Pamuklu Basic Tişört (Renk/Beden)',
  hasVariant: true,
  maincode: 'MC-R2C-001',
  category: 'cat-e2e-2',
  brand: 'brand-e2e-1',
  images: galleryImages,
  variants: [
    v('r2c-v1', 'SK-R2C-SIYAH-S', '8690000000501', 'choiceval-e2e-1', 'choiceval-e2e-3', ['img-r2c-1', 'img-r2c-3']),
    v('r2c-v2', 'SK-R2C-BEYAZ-S', '8690000000502', 'choiceval-e2e-2', 'choiceval-e2e-3', ['img-r2c-2'], {
      prices: { salePrice: 349.9, marketPrice: 449.9, isPlatformBasedPrice: true },
      platforms: { trendyol: { prices: { salePrice: 369.9, marketPrice: 449.9 } }, hepsiburada: { prices: { salePrice: 339.9, marketPrice: 429.9 } } },
    }),
    v('r2c-v3', 'SK-R2C-SIYAH-M', '8690000000503', 'choiceval-e2e-1', 'choiceval-e2e-3', [], { stock: 0 }),
  ],
})
