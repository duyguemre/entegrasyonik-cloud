// @vitest-environment happy-dom
// fe-r3c — FR3 madde 15: çıktı şablonu modeli, geri al/yinele, saklama ve tek render motoru.
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  FIELDS, PAPER_PRESETS, STARTER_TEMPLATES, alignToPaper, blankTemplate, buildPrintData, clampToPaper, copyTemplate,
  createElement, ean13Valid, itemsLayout, paperSize, resolveField, sampleData, searchFields, snap, validateTemplate,
  type TemplateDoc,
} from '../src/components/printouts/templateModel'
import { TemplateHistory } from '../src/components/printouts/templateHistory'
import { readTemplates, sanitizeFile, templateStorageKey, writeTemplates } from '../src/components/printouts/templateStore'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import TemplatePage from '../src/components/printouts/TemplatePage'
import { barcodeModules, geometryCss, printCss, qrModules, TEMPLATE_CSS } from '../src/components/printouts/renderTemplate'

const render = (doc: TemplateDoc, data: ReturnType<typeof sampleData>, design = false) =>
  renderToString(createSSRApp({ render: () => h(TemplatePage, { doc, data, pageKey: 'p0', design, nameOf: () => 'Öğe' }) }))

const NOW = new Date('2026-10-01T10:00:00.000Z')

describe('kâğıt ve ızgara', () => {
  it('ön ayarlar mm cinsinden; termal 100×150 ve 80 mm rulo var; yön ölçüyü çevirir', () => {
    expect(PAPER_PRESETS.map((p) => p.id)).toEqual(['a4', 'a5', 'label-100x150', 'label-100x100', 'roll-80'])
    expect(paperSize({ preset: 'a4', landscape: false, marginMm: 10 })).toEqual({ w: 210, h: 297 })
    expect(paperSize({ preset: 'a4', landscape: true, marginMm: 10 })).toEqual({ w: 297, h: 210 })
    expect(paperSize({ preset: 'bilinmeyen', landscape: false, marginMm: 0 })).toEqual({ w: 210, h: 297 })
  })

  it('snap 1 mm ızgaraya yuvarlar; clamp öğeyi kâğıda çeker', () => {
    expect(snap(12.46)).toBe(12)
    expect(snap(12.5, 0.5)).toBe(12.5)
    const paper = { preset: 'label-100x100', landscape: false, marginMm: 3 }
    const el = clampToPaper({ ...createElement('text'), x: 95, y: -4, w: 30, h: 6 }, paper)
    expect([el.x, el.y, el.w]).toEqual([70, 0, 30])
  })

  it('hizalama kenar boşluğunu ve ortayı kullanır', () => {
    const paper = { preset: 'label-100x150', landscape: false, marginMm: 3 }
    const el = { ...createElement('barcode'), w: 60 }
    expect(alignToPaper(el, paper, 'hcenter').x).toBe(20)
    expect(alignToPaper(el, paper, 'right').x).toBe(37)
    expect(alignToPaper(el, paper, 'top').y).toBe(3)
  })
})

describe('veri (IOrder sözleşmesi)', () => {
  it('buildPrintData backend IOrder alanlarını düzleştirir; son takip kodlu fulfillment kullanılır', () => {
    const d = buildPrintData({
      orderNumber: 'A-1', integrationCode: 'n11',
      shippingAddress: { firstName: 'Ali', lastName: 'Veli', addressLine1: 'X Sok.', addressLine2: 'No 1', state: 'Çankaya', city: 'Ankara' },
      financials: { currencyCode: 'TRY', grandTotal: 100 },
      fulfillment: [{ carrierName: 'Eski', trackingCode: 'T1' }, { carrierName: 'Yeni', trackingCode: 'T2' }, { carrierName: 'Bekleyen' }],
      items: [{ sku: 'S', productName: 'Ürün', quantity: 2, unitPrice: 50, taxRate: 20, totalPrice: 100 }, { sku: 'İPT', quantity: 1, itemStatus: 'CANCELLED' }],
    }, NOW)
    expect(d.values['shipping.name']).toBe('Ali Veli')
    expect(d.values['shipping.address']).toBe('X Sok. No 1')
    expect(d.values['shipping.cityLine']).toBe('Çankaya / Ankara')
    expect(d.values['cargo.carrier']).toBe('Yeni')
    expect(d.values['cargo.barcode']).toBe('T2') // barcodeData yoksa takip kodu
    expect(d.items.map((i) => i.sku)).toEqual(['S']) // iptal satırı basılmaz
    expect(d.values['order.itemCount']).toBe(2)
    expect(resolveField('totals.grand', d)).toMatch(/100/)
    expect(resolveField('cargo.trackingUrl', d)).toBe('')
  })

  it('bozuk/boş sipariş çökertmez', () => {
    expect(() => buildPrintData(null)).not.toThrow()
    expect(buildPrintData(undefined).items).toEqual([])
  })

  it('alan kataloğu: yollar benzersiz, her alan örnek veride tanımlı; arama Türkçe harf duyarsız', () => {
    const paths = FIELDS.map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
    const d = sampleData('normal', NOW)
    for (const p of paths) expect(Object.prototype.hasOwnProperty.call(d.values, p), p).toBe(true)
    expect(searchFields('İL').map((f) => f.path)).toContain('shipping.city')
    expect(searchFields('takip').map((f) => f.path)).toEqual(['cargo.trackingCode', 'cargo.trackingUrl'])
  })
})

describe('doğrulama', () => {
  it('EAN-13 kontrol hanesi', () => {
    expect(ean13Valid('8690000000012')).toBe(true)
    expect(ean13Valid('8690000000013')).toBe(false)
    expect(ean13Valid('123')).toBe(false)
  })

  it('kalem tablosu: sığmayan satırlar "+N" satırına düşer', () => {
    expect(itemsLayout({ h: 50, fontSize: 8 }, 2)).toEqual({ visible: 2, hidden: 0 })
    const r = itemsLayout({ h: 20, fontSize: 8 }, 18)
    expect(r.visible + r.hidden).toBe(18)
    expect(r.hidden).toBeGreaterThan(0)
  })

  it('hazır şablonlar örnek veride HATA vermez; stres verisi taşma uyarısı, eksik veri barkod hatası üretir', () => {
    for (const t of STARTER_TEMPLATES) {
      const errors = validateTemplate(t, sampleData('normal', NOW)).filter((i) => i.level === 'error')
      expect(errors, t.id).toEqual([])
    }
    const label = STARTER_TEMPLATES.find((t) => t.id === 'sys-label-100x150')!
    expect(validateTemplate(label, sampleData('stress', NOW)).some((i) => /sığmadı|sığmıyor/.test(i.message))).toBe(true)
    expect(validateTemplate(label, sampleData('sparse', NOW)).some((i) => i.level === 'error' && /Barkod/.test(i.message))).toBe(true)
  })

  it('kâğıt dışı = hata, kenar boşluğu = uyarı, boş şablon = uyarı', () => {
    const doc = blankTemplate('shipping-label', 'label-100x100')
    expect(validateTemplate(doc, sampleData())[0].message).toMatch(/boş/)
    doc.elements = [{ ...createElement('text'), x: 1, y: 1 }, { ...createElement('text'), x: 80, y: 10 }]
    const issues = validateTemplate(doc, sampleData())
    expect(issues.map((i) => i.level).sort()).toEqual(['error', 'warning'])
  })

  it('hazır şablon kopyası düzenlenebilir ve yeni kimlikler alır', () => {
    const c = copyTemplate(STARTER_TEMPLATES[0])
    expect(c.system).toBe(false)
    expect(c.id).not.toBe(STARTER_TEMPLATES[0].id)
    expect(c.elements.every((e, i) => e.id !== STARTER_TEMPLATES[0].elements[i].id)).toBe(true)
    expect(STARTER_TEMPLATES[0].system).toBe(true) // kaynak değişmedi
  })
})

describe('geri al / yinele', () => {
  it('commit/undo/redo; aynı durum adım üretmez; yeni commit yinele yığınını siler', () => {
    const h = new TemplateHistory({ n: 0 })
    expect(h.commit({ n: 0 })).toBe(false)
    h.commit({ n: 1 }); h.commit({ n: 2 })
    expect(h.undo()).toEqual({ n: 1 })
    expect(h.undo()).toEqual({ n: 0 })
    expect(h.undo()).toBeUndefined()
    expect(h.redo()).toEqual({ n: 1 })
    h.commit({ n: 5 })
    expect(h.canRedo).toBe(false)
    expect(h.isDirtyAgainst({ n: 5 })).toBe(false)
    expect(h.isDirtyAgainst({ n: 1 })).toBe(true)
  })

  it('sınır aşılınca en eski adım düşer', () => {
    const h = new TemplateHistory(0, 3)
    for (let i = 1; i <= 5; i++) h.commit(i)
    expect(h.undoCount).toBe(3)
  })
})

describe('saklama (bu tarayıcı, kullanıcı + mağaza kapsamlı)', () => {
  beforeEach(() => window.localStorage.clear())

  it('anahtar kimlik ister; e-posta içermez', () => {
    expect(templateStorageKey(undefined, 5)).toBeUndefined()
    expect(templateStorageKey('u1', 7)).toBe('ek.printTemplates.v1.u1.7')
    expect(templateStorageKey('u1', undefined)).toBe('ek.printTemplates.v1.u1.default')
  })

  it('yaz/oku; şema dışı kayıt ve sistem bayrağı ayıklanır', () => {
    const key = templateStorageKey('u1', 1)
    const good = { ...copyTemplate(STARTER_TEMPLATES[0]), system: true }
    expect(writeTemplates(key, { v: 1, templates: [good, { id: 1 } as unknown as TemplateDoc], defaults: { 'shipping-label': good.id, nope: 'x' } as never })).toBe(true)
    const { file, persistent } = readTemplates(key)
    expect(persistent).toBe(true)
    expect(file.templates).toHaveLength(1)
    expect(file.templates[0].system).toBe(false)
    expect(file.defaults).toEqual({ 'shipping-label': good.id })
    expect(sanitizeFile({ v: 99, templates: [good] }).templates).toEqual([])
  })

  it('bozuk JSON okumada çökmez', () => {
    window.localStorage.setItem('k', '{bozuk')
    expect(readTemplates('k').file.templates).toEqual([])
    expect(readTemplates(undefined).persistent).toBe(false)
  })
})

describe('render motoru (TemplatePage — tuval, önizleme ve yazdırma ortak)', () => {
  const label = STARTER_TEMPLATES.find((t) => t.id === 'sys-label-100x150')!

  it('sipariş verisi ve kullanıcı metni HTML olarak yorumlanmaz (XSS): Vue metin düğümü', async () => {
    const d = sampleData('normal', NOW)
    d.values['shipping.name'] = '<script>alert(1)</script>'
    const doc: TemplateDoc = { ...blankTemplate('packing-slip', 'a4'), elements: [createElement('field', { x: 10, y: 10 }, { path: 'shipping.name' }), { ...createElement('text', { x: 10, y: 20 }), text: '<img src=x onerror=alert(1)>' } as never] }
    const html = await render(doc, d)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
  })

  it('içerik konumsuzdur; geometri yalnız CSS kuralında (mm/pt); taşıma içeriği değiştirmez', async () => {
    const d = sampleData('normal', NOW)
    const before = await render(label, d)
    const moved = { ...label, elements: label.elements.map((e, i) => (i === 0 ? { ...e, x: e.x + 7 } : e)) }
    expect(await render(moved, d)).toBe(before)
    expect(geometryCss(moved, 'p0')).toContain('left:12mm')
    expect(geometryCss(label, 'p0')).toContain('.ek-tpl-page[data-page="p0"]{width:100mm;height:150mm}')
    expect(before).not.toMatch(/style=/)
  })

  it('barkod ve QR modülleri DOM gerektirmeden üretilir; SVG rect olarak basılır; okunur metin var', async () => {
    const b = barcodeModules('7330012345678', 'code128')!
    expect(b.width).toBeGreaterThan(50)
    expect(b.runs.length).toBeGreaterThan(10)
    expect(barcodeModules('8690000000013', 'ean13')).toBeNull() // geçersiz kontrol hanesi
    expect(barcodeModules('8690000000012', 'ean13')).not.toBeNull()
    expect(qrModules('https://kargo.example/takip/1')!.size).toBeGreaterThanOrEqual(21)
    const html = await render(label, sampleData('normal', NOW))
    expect((html.match(/<svg/g) || []).length).toBe(2)
    expect(html).toContain('<rect')
    expect(html).toContain('7330012345678')
  })

  it('tasarım modu: boş alanda yer tutucu + odaklanabilir öğe; yazdırmada boş', async () => {
    const d = sampleData('sparse', NOW)
    const design = await render(label, d, true)
    expect(design).toContain('{Kargo barkodu (pazaryeri)}')
    expect(design).toContain('tabindex="0"')
    expect(design).toContain('aria-label="Öğe"')
    const print = await render(label, d)
    expect(print).not.toContain('{Kargo')
    expect(print).not.toContain('tabindex')
  })

  it('stres verisinde kalem tablosu "+N kalem daha" basar', async () => {
    expect(await render(label, sampleData('stress', NOW))).toMatch(/\+\d+ kalem daha/)
  })

  it('yazdırma CSS: @page boyutu ve her sayfa için geometri; taban CSS aynı kaynak', () => {
    const css = printCss(label, ['p0', 'p1'])
    expect(css).toContain('@page{size:100mm 150mm;margin:0}')
    expect(css).toContain('[data-page="p1"]')
    expect(css).toContain(TEMPLATE_CSS.trim().slice(0, 40))
  })

  it('taban CSS literal renk içermez (sistem renkleri Canvas/CanvasText)', () => {
    expect(TEMPLATE_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|\b(white|black)\b(?!-)/i)
  })
})

describe('mevcut çıktı üretimi korunur', () => {
  it('sipariş ekranındaki termal kargo etiketi (BarcodePrintComponent) değişmedi: print/printBulk ve 100mm sayfa', () => {
    const src = readFileSync('src/components/order/BarcodePrintComponent.vue', 'utf8')
    expect(src).toContain('defineExpose({ print, printBulk })')
    expect(src).toContain('@page { size: 100mm 100mm; margin: 0; }')
  })
})
