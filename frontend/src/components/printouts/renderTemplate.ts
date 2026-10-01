/**
 * frontend/src/components/printouts/renderTemplate.ts
 *
 * FR3 madde 15 (fe-r3c) — TEK render motoru (araştırma 4.6, 12.5): tasarım tuvali, galeri küçük resmi,
 * önizleme ve yazdırma aynı HTML'i ve aynı CSS'i kullanır. "Ekranda başka, kâğıtta başka" olmaz.
 *
 * Ayrım:
 *  - `renderPageHtml`  → İÇERİK (metin, barkod SVG, tablo). Konum/ölçü içermez; öğe sürüklenirken değişmez,
 *    böylece Vue `v-html`'i yeniden yazmaz (odak ve SVG korunur).
 *  - `geometryCss`     → KONUM/ÖLÇÜ/YAZI kuralları (`[data-page][data-el]` seçicisiyle, mm/pt birimleri).
 *  - `TEMPLATE_CSS`    → yapısal taban kurallar (tek kaynak; uygulamaya ve yazdırma belgesine aynen girer).
 *
 * Güvenlik: sipariş verisi (müşteri adı, adres…) ve kullanıcı metni HER ZAMAN `escapeHtml`'den geçer.
 * Kâğıt her temada beyazdır (`color-scheme: light` + `Canvas/CanvasText` sistem renkleri) — belge önizlemesi
 * kâğıdın gerçek görünümüdür, karanlık modda kararmaz.
 */
import JsBarcode from 'jsbarcode'
import { renderSVG } from 'uqr'
import {
  ITEM_COLUMNS, fieldDef, itemsLayout, itemRowHeightMm, paperSize, resolveField, resolveItemCell,
  type PrintData, type TemplateDoc, type TemplateElement,
} from './templateModel'

export function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

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
.ek-tpl-code{flex:1 1 auto;min-height:0;display:block;width:100%;height:100%}
.ek-tpl-code svg{display:block;width:100%;height:100%}
.ek-tpl-code-text{flex:none;text-align:center;font-size:8pt;letter-spacing:.08em;font-variant-numeric:tabular-nums}
.ek-tpl-items{width:100%;border-collapse:collapse;table-layout:fixed}
.ek-tpl-items th,.ek-tpl-items td{padding:0 1mm;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
  border-bottom:0.2mm solid color-mix(in srgb,CanvasText 22%,Canvas)}
.ek-tpl-items th{font-weight:600;border-bottom-color:CanvasText}
.ek-tpl-items .is-num{text-align:right;font-variant-numeric:tabular-nums}
.ek-tpl-items.is-zebra tbody tr:nth-child(even) td{background:color-mix(in srgb,CanvasText 6%,Canvas)}
.ek-tpl-items .is-more td{font-style:italic;text-align:left}
.ek-tpl-items .is-check{text-align:center}
.ek-tpl-items .is-check i{display:inline-block;width:3mm;height:3mm;border:0.25mm solid CanvasText}
.ek-tpl-missing{opacity:.45;font-style:italic}
.ek-tpl-codefail{display:flex;align-items:center;justify-content:center;height:100%;font-size:7pt;text-align:center;
  border:0.3mm dashed color-mix(in srgb,CanvasText 45%,Canvas)}
`

export interface RenderOptions {
  /** Tasarım modu: boş alanlarda `{Alan adı}` yer tutucusu; öğeler odaklanabilir (klavye). */
  design?: boolean
  /** Erişilebilir ad üreticisi (tasarım modunda `aria-label`). */
  nameOf?: (el: TemplateElement) => string
}

function barcodeSvg(value: string, symbology: 'code128' | 'ean13'): string | null {
  if (typeof document === 'undefined') return null
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, value, { format: symbology === 'ean13' ? 'EAN13' : 'CODE128', displayValue: false, margin: 0, width: 2, height: 60, background: 'transparent' })
    svg.setAttribute('preserveAspectRatio', 'none')
    const w = svg.getAttribute('width')?.replace('px', '')
    const h = svg.getAttribute('height')?.replace('px', '')
    if (w && h && !svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.removeAttribute('style')
    svg.setAttribute('aria-hidden', 'true')
    return svg.outerHTML
  } catch {
    return null
  }
}

function qrSvg(value: string): string | null {
  try {
    return renderSVG(value, { border: 0, ecc: 'M', whiteColor: 'transparent', blackColor: 'currentColor' })
      .replace('<svg ', '<svg aria-hidden="true" preserveAspectRatio="xMidYMid meet" ')
  } catch {
    return null
  }
}

function placeholder(path: string): string {
  return `<span class="ek-tpl-missing">{${escapeHtml(fieldDef(path)?.label ?? path)}}</span>`
}

function itemsHtml(el: Extract<TemplateElement, { kind: 'items' }>, data: PrintData): string {
  const cols = el.columns.map((id) => ITEM_COLUMNS.find((c) => c.id === id)).filter((c): c is (typeof ITEM_COLUMNS)[number] => !!c)
  if (!cols.length) return ''
  const colgroup = `<colgroup>${cols.map(() => '<col>').join('')}</colgroup>`
  const cls = (c: (typeof cols)[number]) => [c.numeric ? 'is-num' : '', c.id === 'check' ? 'is-check' : ''].filter(Boolean).join(' ')
  const head = `<thead><tr>${cols.map((c) => `<th class="${cls(c)}">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>`
  const { visible, hidden } = itemsLayout(el, data.items.length)
  const rows = data.items.slice(0, visible).map((item, i) =>
    `<tr>${cols.map((c) => `<td class="${cls(c)}">${c.id === 'check' ? '<i></i>' : escapeHtml(resolveItemCell(c.id, item, i, data.currency))}</td>`).join('')}</tr>`)
  if (hidden > 0) rows.push(`<tr class="is-more"><td colspan="${cols.length}">+${hidden} kalem daha</td></tr>`)
  return `<table class="ek-tpl-items${el.zebra ? ' is-zebra' : ''}">${colgroup}${head}<tbody>${rows.join('')}</tbody></table>`
}

/** Öğenin İÇ içeriği (konumsuz). */
export function renderElementInner(el: TemplateElement, data: PrintData, opts: RenderOptions = {}): string {
  switch (el.kind) {
    case 'text':
      return escapeHtml(el.text)
    case 'field': {
      const v = resolveField(el.path, data)
      if (!v) return opts.design ? `${el.prefix ? `${escapeHtml(el.prefix)} ` : ''}${placeholder(el.path)}` : ''
      return `${el.prefix ? `${escapeHtml(el.prefix)} ` : ''}${escapeHtml(v)}`
    }
    case 'barcode': {
      const raw = String(data.values[el.path] ?? '')
      if (!raw) return opts.design ? `<span class="ek-tpl-codefail">${placeholder(el.path)}</span>` : ''
      const svg = barcodeSvg(raw, el.symbology)
      if (!svg) return `<span class="ek-tpl-codefail">Barkod basılamadı</span>`
      return `<span class="ek-tpl-code">${svg}</span>${el.showText ? `<span class="ek-tpl-code-text">${escapeHtml(raw)}</span>` : ''}`
    }
    case 'qr': {
      const raw = String(data.values[el.path] ?? '')
      if (!raw) return opts.design ? `<span class="ek-tpl-codefail">${placeholder(el.path)}</span>` : ''
      const svg = qrSvg(raw)
      return svg ? `<span class="ek-tpl-code">${svg}</span>` : `<span class="ek-tpl-codefail">QR basılamadı</span>`
    }
    case 'line':
      return `<i class="${el.dashed ? 'is-dashed' : ''}"></i>`
    case 'box':
      return ''
    case 'items':
      return itemsHtml(el, data)
  }
}

/** Sayfa içeriği (konumsuz). `pageKey` geometri CSS'iyle eşleşir. */
export function renderPageHtml(doc: TemplateDoc, data: PrintData, pageKey: string, opts: RenderOptions = {}): string {
  const key = safeId(pageKey)
  const body = doc.elements.map((el) => {
    const a11y = opts.design
      ? ` tabindex="0" role="button" aria-label="${escapeHtml(opts.nameOf ? opts.nameOf(el) : el.kind)}"`
      : ''
    return `<div class="ek-tpl-el ek-tpl-el--${el.kind}" data-el="${safeId(el.id)}"${a11y}>${renderElementInner(el, data, opts)}</div>`
  }).join('')
  return `<div class="ek-tpl-page" data-page="${key}">${body}</div>`
}

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
      const cols = el.columns.map((id) => ITEM_COLUMNS.find((c) => c.id === id)).filter((c) => !!c)
      const total = cols.reduce((s, c) => s + c.weight, 0)
      cols.forEach((c, i) => rules.push(`${sel} col:nth-child(${i + 1}){width:${n((c.weight / total) * 100)}%}`))
    }
  }
  return rules.join('\n')
}

/**
 * Yazdırma belgesi: her veri için bir sayfa (toplu yazdırma), `@page` boyutu şablondan, kenar boşluğu 0
 * (konumlar zaten mm). `fontFaceCss`: uygulamanın yüklü yazı tipi tanımları (aynı görünüm için).
 */
export function buildPrintDocument(doc: TemplateDoc, dataList: PrintData[], opts: { title?: string; fontFaceCss?: string } = {}): string {
  const { w, h } = paperSize(doc.paper)
  const pages = dataList.map((d, i) => renderPageHtml(doc, d, `p${i}`)).join('')
  const geom = dataList.map((_, i) => geometryCss(doc, `p${i}`)).join('\n')
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(opts.title ?? doc.name)}</title>
<style>${opts.fontFaceCss ?? ''}
@page{size:${n(w)}mm ${n(h)}mm;margin:0}
html,body{margin:0;padding:0;color-scheme:light;background:Canvas}
.ek-tpl-page{break-after:page;page-break-after:always}
.ek-tpl-page:last-child{break-after:auto;page-break-after:auto}
${TEMPLATE_CSS}
${geom}</style></head><body>${pages}</body></html>`
}
