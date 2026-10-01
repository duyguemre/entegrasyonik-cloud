/**
 * frontend/src/components/printouts/renderTemplate.ts
 *
 * FR3 madde 15 (fe-r3c) — TEK render motoru (araştırma 4.6, 12.5): tasarım tuvali, galeri küçük resmi,
 * önizleme ve yazdırma AYNI Vue bileşenini (`TemplatePage`) ve AYNI CSS'i kullanır. "Ekranda başka, kâğıtta başka" olmaz.
 *
 * Güvenlik (R7 / G-01, G-02): HTML dizesi ÜRETİLMEZ, `v-html`/`innerHTML`/`document.write` yoktur. Sipariş verisi ve
 * kullanıcı metni Vue tarafından metin düğümü olarak basılır (kaçışlı). Barkod ve QR, kodlayıcıların modül dizisinden
 * SVG `<rect>` olarak çizilir (JsBarcode "nesne" çıktısı, uqr `encode`) — DOM gerektirmez, SSR ile test edilir.
 *
 * Ayrım:
 *  - `TemplatePage` → İÇERİK (metin, barkod, tablo); konum/ölçü içermez.
 *  - `geometryCss`  → KONUM/ÖLÇÜ/YAZI kuralları (`[data-page][data-el]` seçicisi, mm/pt). Satır içi stil yok (style-ratchet).
 *  - `TEMPLATE_CSS` → yapısal taban kurallar (uygulamaya ve yazdırma belgesine aynen girer).
 * Kâğıt her temada beyazdır (`color-scheme: light` + `Canvas/CanvasText` sistem renkleri).
 */
import JsBarcode from 'jsbarcode'
import { encode } from 'uqr'
import { ITEM_COLUMNS, itemRowHeightMm, paperSize, type TemplateDoc } from './templateModel'

/** CSS seçici/öznitelik için güvenli kimlik (yalnız harf, rakam, tire, alt çizgi). */
export const safeId = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, '')

export const TEMPLATE_CSS = `
.ek-tpl-page{position:relative;overflow:hidden;box-sizing:border-box;color-scheme:light;background:Canvas;color:CanvasText;
  font-family:Inter,"Segoe UI",Arial,sans-serif;line-height:1.25;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ek-tpl-page *{box-sizing:border-box}
.ek-tpl-el{position:absolute;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}
.ek-tpl-el--line{overflow:visible}
.ek-tpl-el--line>i{display:block;width:100%;border-top-style:solid;border-top-color:CanvasText}
.ek-tpl-el--line>i.is-dashed{border-top-style:dashed}
.ek-tpl-el--box{border-style:solid;border-color:CanvasText}
.ek-tpl-el--barcode,.ek-tpl-el--qr{display:flex;flex-direction:column;align-items:stretch}
.ek-tpl-code{flex:1 1 auto;min-height:0;display:block;width:100%;height:100%;fill:CanvasText}
.ek-tpl-code-text{flex:none;text-align:center;font-size:8pt;letter-spacing:.08em;font-variant-numeric:tabular-nums}
.ek-tpl-items{width:100%;border-collapse:collapse;table-layout:fixed}
.ek-tpl-page .ek-tpl-items th,.ek-tpl-page .ek-tpl-items td{background:Canvas;color:CanvasText;height:auto;font-size:inherit;padding:0 1mm;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
  border-bottom:0.2mm solid color-mix(in srgb,CanvasText 22%,Canvas)}
.ek-tpl-page .ek-tpl-items th{font-weight:600;border-bottom-color:CanvasText}
.ek-tpl-items .is-num{text-align:right;font-variant-numeric:tabular-nums}
.ek-tpl-page .ek-tpl-items.is-zebra tbody tr:nth-child(even) td{background:color-mix(in srgb,CanvasText 6%,Canvas)}
.ek-tpl-items .is-more td{font-style:italic;text-align:left}
.ek-tpl-items .is-check{text-align:center}
.ek-tpl-items .is-check i{display:inline-block;width:3mm;height:3mm;border:0.25mm solid CanvasText}
.ek-tpl-missing{opacity:.45;font-style:italic}
.ek-tpl-codefail{display:flex;align-items:center;justify-content:center;height:100%;font-size:7pt;text-align:center;
  border:0.3mm dashed color-mix(in srgb,CanvasText 45%,Canvas)}
.ek-tpl-print-frame{position:fixed;right:0;bottom:0;width:0;height:0;border:0}
`

// ─── Barkod / QR modülleri (DOM'suz) ──────────────────────────────────────

/** Ardışık koyu modül dizisi: [başlangıç, uzunluk]. */
export type Run = [number, number]
export interface BarcodeModules { width: number; runs: Run[] }
export interface QrModules { size: number; rows: Run[][] }

const cache = new Map<string, BarcodeModules | QrModules | null>()
function memo<T extends BarcodeModules | QrModules>(key: string, make: () => T | null): T | null {
  if (cache.has(key)) return cache.get(key) as T | null
  if (cache.size > 300) cache.clear()
  let v: T | null = null
  try { v = make() } catch { v = null }
  cache.set(key, v)
  return v
}

function runsOf(bits: ArrayLike<boolean | string>): Run[] {
  const runs: Run[] = []
  let start = -1
  for (let i = 0; i <= bits.length; i++) {
    const on = i < bits.length && (bits[i] === true || bits[i] === '1')
    if (on && start < 0) start = i
    if (!on && start >= 0) { runs.push([start, i - start]); start = -1 }
  }
  return runs
}

/** Code128 / EAN-13 çubukları (JsBarcode nesne çıktısı). Geçersiz değerde `null`. */
export function barcodeModules(value: string, symbology: 'code128' | 'ean13'): BarcodeModules | null {
  if (!value) return null
  return memo(`b:${symbology}:${value}`, () => {
    const out: { encodings?: Array<{ data: string }> } = {}
    let valid = true
    JsBarcode(out, value, { format: symbology === 'ean13' ? 'EAN13' : 'CODE128', valid: (ok: boolean) => { valid = ok } })
    if (!valid || !out.encodings?.length) return null
    const bits = out.encodings.map((e) => e.data).join('')
    return { width: bits.length, runs: runsOf(bits) }
  })
}

/** QR modülleri (hata düzeltme M, kenarsız). */
export function qrModules(value: string): QrModules | null {
  if (!value) return null
  return memo(`q:${value}`, () => {
    const r = encode(value, { ecc: 'M', border: 0 })
    return { size: r.size, rows: r.data.map((row) => runsOf(row)) }
  })
}

// ─── Geometri ─────────────────────────────────────────────────────────────

const n = (v: number) => Math.round(v * 100) / 100

/** Sayfa ve öğe geometrisi + yazı biçimi (mm/pt). Tuvalde yakınlaştırma dışarıdan `transform` ile yapılır. */
export function geometryCss(doc: TemplateDoc, pageKey: string): string {
  const key = safeId(pageKey)
  const { w, h } = paperSize(doc.paper)
  const page = `.ek-tpl-page[data-page="${key}"]`
  const rules = [`${page}{width:${n(w)}mm;height:${n(h)}mm}`]
  for (const el of doc.elements) {
    const sel = `${page} [data-el="${safeId(el.id)}"]`
    const decl: string[] = [`left:${n(el.x)}mm`, `top:${n(el.y)}mm`, `width:${n(el.w)}mm`, `height:${n(el.h)}mm`]
    if (el.kind === 'text' || el.kind === 'field') {
      decl.push(`font-size:${n(el.fontSize)}pt`, `font-weight:${el.bold ? 700 : 400}`, `text-align:${el.align}`)
      if (el.uppercase) decl.push('text-transform:uppercase')
    }
    if (el.kind === 'items') decl.push(`font-size:${n(el.fontSize)}pt`)
    if (el.kind === 'box') decl.push(`border-width:${n(el.thickness)}mm`)
    rules.push(`${sel}{${decl.join(';')}}`)
    if (el.kind === 'line') rules.push(`${sel}>i{border-top-width:${n(el.thickness)}mm}`)
    if (el.kind === 'items') {
      rules.push(`${sel} tr{height:${n(itemRowHeightMm(el.fontSize))}mm}`)
      const cols = el.columns.map((id) => ITEM_COLUMNS.find((c) => c.id === id)).filter((c): c is (typeof ITEM_COLUMNS)[number] => !!c)
      const total = cols.reduce((s, c) => s + c.weight, 0)
      cols.forEach((c, i) => rules.push(`${sel} col:nth-child(${i + 1}){width:${n((c.weight / total) * 100)}%}`))
    }
  }
  return rules.join('\n')
}

/** Yazdırma belgesinin CSS'i: `@page` boyutu şablondan, kenar 0 (konumlar zaten mm), sayfa başına bir veri. */
export function printCss(doc: TemplateDoc, pageKeys: string[], fontFaceCss = ''): string {
  const { w, h } = paperSize(doc.paper)
  return [
    fontFaceCss,
    `@page{size:${n(w)}mm ${n(h)}mm;margin:0}`,
    'html,body{margin:0;padding:0;color-scheme:light;background:Canvas}',
    '.ek-tpl-page{break-after:page;page-break-after:always}',
    '.ek-tpl-page:last-child{break-after:auto;page-break-after:auto}',
    TEMPLATE_CSS,
    ...pageKeys.map((k) => geometryCss(doc, k)),
  ].join('\n')
}
