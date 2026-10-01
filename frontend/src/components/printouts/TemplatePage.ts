/**
 * frontend/src/components/printouts/TemplatePage.ts
 *
 * FR3 madde 15 — şablon sayfası (render fonksiyonu). Tuval, küçük resim, önizleme ve yazdırma bu bileşeni kullanır.
 * Konum/ölçü `geometryCss` kuralındadır (bu bileşen yalnız içerik ve `data-page`/`data-el` öznitelikleri basar).
 * Tasarım modunda öğeler odaklanabilir (`tabindex=0`, `role=button`, erişilebilir ad) ve boş alanlar `{Alan adı}` gösterir.
 */
import { defineComponent, h, type PropType, type VNode } from 'vue'
import { barcodeModules, qrModules, safeId } from './renderTemplate'
import {
  ITEM_COLUMNS, fieldDef, itemsLayout, resolveField, resolveItemCell,
  type ItemsElement, type PrintData, type TemplateDoc, type TemplateElement,
} from './templateModel'

const placeholder = (path: string) => h('span', { class: 'ek-tpl-missing' }, `{${fieldDef(path)?.label ?? path}}`)
const codeFail = (child: VNode | string) => h('span', { class: 'ek-tpl-codefail' }, [child])

function barcodeNode(value: string, symbology: 'code128' | 'ean13', showText: boolean): VNode[] {
  const m = barcodeModules(value, symbology)
  if (!m) return [codeFail('Barkod basılamadı')]
  const svg = h('svg', { class: 'ek-tpl-code', viewBox: `0 0 ${m.width} 1`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    m.runs.map(([x, w]) => h('rect', { x, y: 0, width: w, height: 1 })))
  return showText ? [svg, h('span', { class: 'ek-tpl-code-text' }, value)] : [svg]
}

function qrNode(value: string): VNode {
  const m = qrModules(value)
  if (!m) return codeFail('QR basılamadı')
  const rects: VNode[] = []
  m.rows.forEach((row, y) => row.forEach(([x, w]) => rects.push(h('rect', { x, y, width: w, height: 1 }))))
  return h('svg', { class: 'ek-tpl-code', viewBox: `0 0 ${m.size} ${m.size}`, preserveAspectRatio: 'xMidYMid meet', 'shape-rendering': 'crispEdges', 'aria-hidden': 'true', focusable: 'false' }, rects)
}

function itemsNode(el: ItemsElement, data: PrintData): VNode | null {
  const cols = el.columns.map((id) => ITEM_COLUMNS.find((c) => c.id === id)).filter((c): c is (typeof ITEM_COLUMNS)[number] => !!c)
  if (!cols.length) return null
  const cls = (c: (typeof cols)[number]) => [c.numeric ? 'is-num' : '', c.id === 'check' ? 'is-check' : ''].filter(Boolean).join(' ')
  const { visible, hidden } = itemsLayout(el, data.items.length)
  const rows: VNode[] = data.items.slice(0, visible).map((item, i) =>
    h('tr', cols.map((c) => h('td', { class: cls(c) }, c.id === 'check' ? [h('i')] : resolveItemCell(c.id, item, i, data.currency)))))
  if (hidden > 0) rows.push(h('tr', { class: 'is-more' }, [h('td', { colspan: cols.length }, `+${hidden} kalem daha`)]))
  return h('table', { class: ['ek-tpl-items', el.zebra ? 'is-zebra' : ''] }, [
    h('colgroup', cols.map(() => h('col'))),
    h('thead', [h('tr', cols.map((c) => h('th', { class: cls(c) }, c.label)))]),
    h('tbody', rows),
  ])
}

/** Öğenin iç içeriği (konumsuz). Dışa açık: birim testleri ve yazdırma aynı yolu kullanır. */
export function elementChildren(el: TemplateElement, data: PrintData, design: boolean): Array<VNode | string> {
  switch (el.kind) {
    case 'text':
      return [el.text]
    case 'field': {
      const v = resolveField(el.path, data)
      const prefix = el.prefix ? `${el.prefix} ` : ''
      if (!v) return design ? [prefix, placeholder(el.path)] : []
      return [`${prefix}${v}`]
    }
    case 'barcode': {
      const raw = String(data.values[el.path] ?? '')
      if (!raw) return design ? [codeFail(placeholder(el.path))] : []
      return barcodeNode(raw, el.symbology, el.showText)
    }
    case 'qr': {
      const raw = String(data.values[el.path] ?? '')
      if (!raw) return design ? [codeFail(placeholder(el.path))] : []
      return [qrNode(raw)]
    }
    case 'line':
      return [h('i', { class: el.dashed ? 'is-dashed' : undefined })]
    case 'box':
      return []
    case 'items': {
      const t = itemsNode(el, data)
      return t ? [t] : []
    }
  }
}

export default defineComponent({
  name: 'TemplatePage',
  props: {
    doc: { type: Object as PropType<TemplateDoc>, required: true },
    data: { type: Object as PropType<PrintData>, required: true },
    pageKey: { type: String, required: true },
    design: { type: Boolean, default: false },
    nameOf: { type: Function as PropType<(el: TemplateElement) => string>, default: undefined },
  },
  setup(props) {
    return () => h('div', { class: 'ek-tpl-page', 'data-page': safeId(props.pageKey) },
      props.doc.elements.map((el) => h('div', {
        key: el.id,
        class: ['ek-tpl-el', `ek-tpl-el--${el.kind}`],
        'data-el': safeId(el.id),
        ...(props.design ? { tabindex: 0, role: 'button', 'aria-label': props.nameOf ? props.nameOf(el) : el.kind } : {}),
      }, elementChildren(el, props.data, props.design))))
  },
})
