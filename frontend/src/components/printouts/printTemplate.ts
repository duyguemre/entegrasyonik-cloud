/**
 * frontend/src/components/printouts/printTemplate.ts
 *
 * Şablonu yazdırır. Sayfalar tuval/önizlemeyle AYNI bileşenle (`TemplatePage`) belge dışı bir kapta çizilir, düğümler
 * görünmez bir iframe'e taşınır (`importNode`) ve tarayıcının yazdır penceresi açılır. HTML dizesi yazılmaz
 * (`document.write`/`innerHTML` yok — R7 G-01/G-02); CSS `textContent` ile eklenir. Sayfa boyutu `@page` ile gömülüdür.
 * "PDF olarak kaydet" aynı pencereden yapılır. Açılır pencere engelleyicisine takılmaz.
 *
 * Mevcut sipariş ekranı etiketi (`components/order/BarcodePrintComponent.vue`) bu dosyayı KULLANMAZ; değişmedi.
 */
import { createApp, h } from 'vue'
import TemplatePage from './TemplatePage'
import { printCss } from './renderTemplate'
import type { PrintData, TemplateDoc } from './templateModel'

/** Uygulamanın yüklü @font-face kuralları (yazdırma belgesinde aynı yazı tipi için). */
function collectFontFaces(): string {
  const out: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | undefined
    try { rules = sheet.cssRules } catch { continue } // başka kökenli sayfa
    for (const r of Array.from(rules ?? [])) if (r.cssText.startsWith('@font-face')) out.push(r.cssText)
  }
  return out.join('\n')
}

/** Sayfaları belge dışı bir kapta çizer (aynı render bileşeni). */
export function renderPages(doc: TemplateDoc, dataList: PrintData[]): { nodes: Element[]; keys: string[] } {
  const host = document.createElement('div')
  const keys = dataList.map((_, i) => `p${i}`)
  const app = createApp({ render: () => dataList.map((data, i) => h(TemplatePage, { doc, data, pageKey: keys[i] })) })
  app.mount(host)
  const nodes = Array.from(host.querySelectorAll('.ek-tpl-page')).map((n) => n.cloneNode(true) as Element)
  app.unmount()
  return { nodes, keys }
}

export function printTemplate(doc: TemplateDoc, dataList: PrintData[]): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    frame.className = 'ek-tpl-print-frame'
    document.body.appendChild(frame)
    const win = frame.contentWindow
    const fdoc = frame.contentDocument
    if (!win || !fdoc) { frame.remove(); resolve(); return }

    const { nodes, keys } = renderPages(doc, dataList)
    fdoc.documentElement.lang = 'tr'
    fdoc.title = doc.name
    const style = fdoc.createElement('style')
    style.textContent = printCss(doc, keys, collectFontFaces())
    fdoc.head.appendChild(style)
    for (const node of nodes) fdoc.body.appendChild(fdoc.importNode(node, true))

    let done = false
    const cleanup = () => { if (done) return; done = true; setTimeout(() => frame.remove(), 1000); resolve() }
    const go = () => {
      win.addEventListener('afterprint', cleanup, { once: true })
      win.focus()
      win.print()
      // Bazı tarayıcılar afterprint göndermez: güvenlik ağı.
      setTimeout(cleanup, 60_000)
    }
    const fonts = (fdoc as Document & { fonts?: FontFaceSet }).fonts
    if (fonts?.ready) fonts.ready.then(go, go)
    else setTimeout(go, 150)
  })
}
