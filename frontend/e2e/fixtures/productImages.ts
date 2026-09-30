// Faz 3 B2 — ürün resim galerisi + varyanta resim atama için sentetik veri (Protokol 7: PII yok).
// Görseller gerçek dosya DEĞİL: `https://img.e2e.test/...` adresleri `routeImages()` ile SVG olarak
// cevaplanır (tişört silueti, renk adı + çözünürlük yazılı). Ağ/CDN yok.
import type { Page, Route } from '@playwright/test'
import { buildProduct, buildChoice } from './apiData'

export const IMG_HOST = 'https://img.e2e.test'

const PALETTE: Record<string, { fill: string; bg: string }> = {
  kirmizi: { fill: '#C0392B', bg: '#FFFFFF' },
  kirmizi2: { fill: '#A93226', bg: '#F4F4F4' },
  lacivert: { fill: '#1F3A68', bg: '#FFFFFF' },
  lacivert2: { fill: '#243B6B', bg: '#EFEFEF' },
  beyaz: { fill: '#F5F5F0', bg: '#D8DCE2' },
  detay: { fill: '#7A5C3E', bg: '#FFFFFF' },
}

function teeSvg(key: string, w: number, h: number, label: string) {
  const c = PALETTE[key] ?? PALETTE.detay
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
  <rect width="100" height="100" fill="${c.bg}"/>
  <path d="M34 18 L22 24 L12 38 L22 44 L26 40 L26 84 L74 84 L74 40 L78 44 L88 38 L78 24 L66 18 Q50 28 34 18 Z" fill="${c.fill}" stroke="#00000022" stroke-width="0.6"/>
  <text x="50" y="95" font-family="sans-serif" font-size="4.2" text-anchor="middle" fill="#00000066">${label}</text>
</svg>`
}

export function buildImage(id: string, key: string, order: number, w = 1500, h = 1500, size = 412_000) {
  return { _id: id, url: `${IMG_HOST}/p/${id}.svg?k=${key}&w=${w}&h=${h}`, width: w, height: h, size, extension: 'jpg', order, isTempImage: false }
}

export const galleryImages = [
  buildImage('img-e2e-1', 'kirmizi', 0),
  buildImage('img-e2e-2', 'kirmizi2', 1, 1200, 1600, 388_000),
  buildImage('img-e2e-3', 'lacivert', 2),
  buildImage('img-e2e-4', 'lacivert2', 3, 1200, 1600, 356_000),
  buildImage('img-e2e-5', 'beyaz', 4, 480, 480, 42_000),
  buildImage('img-e2e-6', 'detay', 5, 2000, 2000, 1_240_000),
]

export const colorChoice = buildChoice({
  _id: 'choice-e2e-renk', title: 'Renk', isSlicer: true, isVarianter: false,
  values: [{ _id: 'cv-kirmizi', title: 'Kırmızı' }, { _id: 'cv-lacivert', title: 'Lacivert' }, { _id: 'cv-beyaz', title: 'Beyaz' }],
})
export const sizeChoice = buildChoice({
  _id: 'choice-e2e-beden', title: 'Beden', isSlicer: false, isVarianter: true,
  values: [{ _id: 'cv-s', title: 'S' }, { _id: 'cv-m', title: 'M' }, { _id: 'cv-l', title: 'L' }],
})
export const galleryChoices = [colorChoice, sizeChoice]

const COLORS = [['cv-kirmizi', 'KIR'], ['cv-lacivert', 'LAC'], ['cv-beyaz', 'BYZ']] as const
const SIZES = [['cv-s', 'S'], ['cv-m', 'M'], ['cv-l', 'L']] as const

/** 3 renk × 3 beden = 9 varyant. `assigned`: Kırmızı ve Lacivert görselli, Beyaz görselsiz (uyarı durumu). */
export function galleryVariants(assigned = true) {
  const out: any[] = []
  let order = 0
  for (const [cv, ck] of COLORS) {
    for (const [sv, sk] of SIZES) {
      const images = !assigned ? [] : cv === 'cv-kirmizi' ? ['img-e2e-1', 'img-e2e-2'] : cv === 'cv-lacivert' ? ['img-e2e-3', 'img-e2e-4'] : []
      out.push({
        tempId: `var-${ck}-${sk}`, stockcode: `TSH-${ck}-${sk}`, barcode: `86900000${order}${order}${order}`,
        choices: [{ choiceId: 'choice-e2e-renk', choiceValueId: cv }, { choiceId: 'choice-e2e-beden', choiceValueId: sv }],
        prices: { salePrice: 349.9, marketPrice: 449.9, isPlatformBasedPrice: false }, stock: 10 + order, shelf: 'B-02',
        images: [...images], platforms: {}, order: order++,
      })
    }
  }
  return out
}

export function galleryProduct(opts: { images?: any[]; assigned?: boolean } = {}) {
  return buildProduct({
    _id: 'product-e2e-gallery',
    tempId: 'temp-e2e-gallery',
    title: 'Pamuklu Basic Tişört',
    hasVariant: true,
    maincode: 'TSH-BASIC',
    category: 'category-e2e-1',
    images: opts.images ?? galleryImages,
    variants: galleryVariants(opts.assigned ?? true),
  })
}

/** Sentetik görsel sunucusu: `?k=<renk>&w=&h=` → SVG. */
export async function routeImages(page: Page) {
  await page.route(`${IMG_HOST}/**`, async (route: Route) => {
    const u = new URL(route.request().url())
    const key = u.searchParams.get('k') || 'detay'
    const w = Number(u.searchParams.get('w')) || 1200
    const h = Number(u.searchParams.get('h')) || 1200
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: teeSvg(key, w, h, `${w}×${h}`) })
  })
}

/** Küçük geçerli PNG (1×1) — dosya seçici/sürükle-bırak testleri için. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
