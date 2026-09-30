import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ADR-0015 Karar 1.4 — logo geometri drift testi (statik). `logo-mark.svg`
 * içindeki `rect`/`circle` geometrisi `site/src/components/Logo.astro` ile
 * BİREBİR eşit olmalıdır — böylece uygulama ve site AYNI işareti kullanır;
 * nihai logo geldiğinde iki dosya BİRLİKTE değişir (Açık Soru 1).
 *
 * Bu test YALNIZCA site dosyasını OKUR, değiştirmez (ADR'nin "site kaynak
 * kodu bu ADR'nin kapsamı dışındadır" kısıtı).
 */
// __dirname = frontend/tests/theme → 3 seviye yukarı = proje kökü (frontend/ VE site/'i içeren dizin).
const REPO_ROOT = resolve(__dirname, '../../..')

/** `<rect .../>`/`<circle .../>` etiketlerinden geometrik özellikleri (x/y/width/height/rx/cx/cy/r) çıkarır, sınıf adı ve renk YOK SAYILIR. */
function extractShapes(svgSource: string): Array<{ tag: string; attrs: Record<string, string> }> {
  const shapeRegex = /<(rect|circle)\b([^>]*)\/?>/g
  const geometryAttrs = ['x', 'y', 'width', 'height', 'rx', 'cx', 'cy', 'r']
  const shapes: Array<{ tag: string; attrs: Record<string, string> }> = []
  let match: RegExpExecArray | null
  while ((match = shapeRegex.exec(svgSource)) !== null) {
    const [, tag, rawAttrs] = match
    const attrs: Record<string, string> = {}
    for (const attrName of geometryAttrs) {
      const attrMatch = rawAttrs.match(new RegExp(`\\b${attrName}="([^"]*)"`))
      if (attrMatch) attrs[attrName] = attrMatch[1]
    }
    shapes.push({ tag, attrs })
  }
  return shapes
}

describe('logo geometri drift — src/design/brand/logo-mark.svg ≡ site/src/components/Logo.astro', () => {
  const appSvg = readFileSync(resolve(REPO_ROOT, 'frontend/packages/ui/src/brand/logo-mark.svg'), 'utf8')
  const siteAstro = readFileSync(resolve(REPO_ROOT, 'site/src/components/Logo.astro'), 'utf8')

  const appShapes = extractShapes(appSvg)
  const siteShapes = extractShapes(siteAstro)

  it('site dosyasında en az 1 rect + 3 circle var (regex kırılmadı)', () => {
    expect(siteShapes.filter((s) => s.tag === 'rect').length).toBeGreaterThanOrEqual(1)
    expect(siteShapes.filter((s) => s.tag === 'circle').length).toBeGreaterThanOrEqual(3)
  })

  it('şekil SAYISI birebir eşit', () => {
    expect(appShapes.length).toBe(siteShapes.length)
  })

  it('şekil geometrisi (tag + x/y/width/height/rx/cx/cy/r) birebir eşit', () => {
    expect(appShapes).toEqual(siteShapes)
  })
})

describe('EkBrandLogo.vue inline SVG geometrisi ≡ logo-mark.svg', () => {
  const appSvg = readFileSync(resolve(REPO_ROOT, 'frontend/packages/ui/src/brand/logo-mark.svg'), 'utf8')
  const componentSource = readFileSync(resolve(REPO_ROOT, 'frontend/packages/ui/src/components/EkBrandLogo.vue'), 'utf8')

  it('EkBrandLogo.vue şablonundaki şekiller kaynak SVG ile birebir eşit', () => {
    expect(extractShapes(componentSource)).toEqual(extractShapes(appSvg))
  })
})

describe('public/favicon.svg geometrisi ≡ logo-mark.svg (Karar 1.4)', () => {
  const appSvg = readFileSync(resolve(REPO_ROOT, 'frontend/packages/ui/src/brand/logo-mark.svg'), 'utf8')
  const faviconSvg = readFileSync(resolve(REPO_ROOT, 'frontend/public/favicon.svg'), 'utf8')

  it('favicon şekilleri kaynak SVG ile birebir eşit (renkler İSTİSNAEN literal, geometri değil)', () => {
    expect(extractShapes(faviconSvg)).toEqual(extractShapes(appSvg))
  })
})
