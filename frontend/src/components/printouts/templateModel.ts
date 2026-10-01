/**
 * frontend/src/components/printouts/templateModel.ts
 *
 * FR3 madde 15 (fe-r3c) — çıktı şablonu modeli. SAF TS (Vue/DOM yok): tipler, kâğıt ön ayarları,
 * alan (değişken) kataloğu, örnek veri kümeleri, hazır şablon galerisi, ızgara/sınır yardımcıları ve
 * doğrulama (taşma, eksik veri, barkod). Tuval, önizleme ve yazdırma aynı modeli `renderTemplate.ts`
 * ile çizer (tek render motoru — araştırma 4.6).
 *
 * Birimler: konum/ölçü mm, yazı punto (pt). Kullanıcıya piksel gösterilmez (araştırma 5.2).
 * Veri: alan yolları backend `IOrder` sözleşmesinden düzleştirilir (`buildPrintData`); yeni backend
 * alanı GEREKMEZ. Şablon kaydı backend'de yok → `templateStore.ts` (yalnız bu tarayıcı).
 */
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@entegrasyonik/ui/format'

// ─── Belge türleri ve kâğıt ────────────────────────────────────────────────

export type DocKind = 'shipping-label' | 'packing-slip' | 'dispatch-note' | 'pick-list'

export const DOC_KINDS: ReadonlyArray<{ id: DocKind; label: string; icon: string; hint: string }> = [
  { id: 'shipping-label', label: 'Kargo etiketi', icon: 'mdi-truck-delivery-outline', hint: 'Termal etiket yazıcısı için alıcı ve kargo barkodu' },
  { id: 'packing-slip', label: 'Sipariş fişi', icon: 'mdi-receipt-text-outline', hint: 'Pakete konan ürün listesi ve tutarlar' },
  { id: 'dispatch-note', label: 'İrsaliye taslağı', icon: 'mdi-file-document-outline', hint: 'Sevk bilgisi ve kalemler (e-İrsaliye yerine geçmez)' },
  { id: 'pick-list', label: 'Toplama listesi', icon: 'mdi-format-list-checks', hint: 'Depoda ürün toplamak için stok kodu ve adet' },
]

export const docKindLabel = (k: DocKind) => DOC_KINDS.find((d) => d.id === k)?.label ?? k

export interface PaperPreset {
  id: string
  label: string
  widthMm: number
  heightMm: number
  thermal?: boolean
  hint: string
}

export const PAPER_PRESETS: ReadonlyArray<PaperPreset> = [
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297, hint: 'Ofis yazıcısı' },
  { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210, hint: 'Yarım A4' },
  { id: 'label-100x150', label: '100 × 150 mm', widthMm: 100, heightMm: 150, thermal: true, hint: 'Termal kargo etiketi (4×6)' },
  { id: 'label-100x100', label: '100 × 100 mm', widthMm: 100, heightMm: 100, thermal: true, hint: 'Kare termal etiket' },
  { id: 'roll-80', label: '80 mm rulo', widthMm: 80, heightMm: 200, thermal: true, hint: 'Fiş yazıcısı' },
]

export interface Paper {
  preset: string
  landscape: boolean
  /** Yazdırılamaz bölge kılavuzu (mm). */
  marginMm: number
}

export function paperPreset(id: string): PaperPreset {
  return PAPER_PRESETS.find((p) => p.id === id) ?? PAPER_PRESETS[0]
}

/** Yön uygulanmış kâğıt ölçüsü (mm). */
export function paperSize(paper: Paper): { w: number; h: number } {
  const p = paperPreset(paper.preset)
  return paper.landscape ? { w: p.heightMm, h: p.widthMm } : { w: p.widthMm, h: p.heightMm }
}

export function paperLabel(paper: Paper): string {
  const p = paperPreset(paper.preset)
  return `${p.label} · ${paper.landscape ? 'Yatay' : 'Dikey'}`
}

// ─── Alan (değişken) kataloğu ─────────────────────────────────────────────

export type FieldFormat = 'text' | 'money' | 'date' | 'datetime' | 'number' | 'percent'

export interface FieldDef {
  path: string
  label: string
  group: string
  format?: FieldFormat
  /** Barkod/QR için uygun mu (paletteki rozet). */
  code?: boolean
}

export const FIELD_GROUPS = ['Sipariş', 'Alıcı ve teslimat', 'Fatura bilgileri', 'Kargo', 'Tutarlar', 'Belge'] as const

export const FIELDS: ReadonlyArray<FieldDef> = [
  { path: 'order.number', label: 'Sipariş numarası', group: 'Sipariş', code: true },
  { path: 'order.externalId', label: 'Pazaryeri sipariş kimliği', group: 'Sipariş', code: true },
  { path: 'order.channel', label: 'Satış kanalı', group: 'Sipariş' },
  { path: 'order.date', label: 'Sipariş tarihi', group: 'Sipariş', format: 'datetime' },
  { path: 'order.shippedDate', label: 'Sevk tarihi', group: 'Sipariş', format: 'date' },
  { path: 'order.itemCount', label: 'Toplam ürün adedi', group: 'Sipariş', format: 'number' },

  { path: 'shipping.name', label: 'Alıcı adı soyadı', group: 'Alıcı ve teslimat' },
  { path: 'shipping.address', label: 'Teslimat adresi', group: 'Alıcı ve teslimat' },
  { path: 'shipping.district', label: 'İlçe', group: 'Alıcı ve teslimat' },
  { path: 'shipping.city', label: 'İl', group: 'Alıcı ve teslimat' },
  { path: 'shipping.cityLine', label: 'İlçe / İl', group: 'Alıcı ve teslimat' },
  { path: 'shipping.postalCode', label: 'Posta kodu', group: 'Alıcı ve teslimat' },
  { path: 'shipping.phone', label: 'Alıcı telefonu', group: 'Alıcı ve teslimat' },

  { path: 'billing.name', label: 'Fatura adı / unvan', group: 'Fatura bilgileri' },
  { path: 'billing.taxNumber', label: 'TC kimlik / vergi no', group: 'Fatura bilgileri' },
  { path: 'billing.taxOffice', label: 'Vergi dairesi', group: 'Fatura bilgileri' },
  { path: 'billing.address', label: 'Fatura adresi', group: 'Fatura bilgileri' },
  { path: 'billing.cityLine', label: 'Fatura ilçe / il', group: 'Fatura bilgileri' },
  { path: 'invoice.number', label: 'Fatura numarası', group: 'Fatura bilgileri', code: true },

  { path: 'cargo.carrier', label: 'Kargo firması', group: 'Kargo' },
  { path: 'cargo.trackingCode', label: 'Kargo takip kodu', group: 'Kargo', code: true },
  { path: 'cargo.barcode', label: 'Kargo barkodu (pazaryeri)', group: 'Kargo', code: true },
  { path: 'cargo.trackingUrl', label: 'Takip bağlantısı', group: 'Kargo', code: true },
  { path: 'cargo.desi', label: 'Desi', group: 'Kargo', format: 'number' },

  { path: 'totals.subTotal', label: 'Ara toplam', group: 'Tutarlar', format: 'money' },
  { path: 'totals.discount', label: 'İndirim', group: 'Tutarlar', format: 'money' },
  { path: 'totals.tax', label: 'KDV toplamı', group: 'Tutarlar', format: 'money' },
  { path: 'totals.shipping', label: 'Kargo ücreti', group: 'Tutarlar', format: 'money' },
  { path: 'totals.grand', label: 'Genel toplam', group: 'Tutarlar', format: 'money' },

  { path: 'doc.printDate', label: 'Yazdırma tarihi', group: 'Belge', format: 'date' },
  { path: 'doc.pageNote', label: 'Sabit not (mağaza)', group: 'Belge' },
]

export function fieldDef(path: string): FieldDef | undefined {
  return FIELDS.find((f) => f.path === path)
}

/** Alan araması: Türkçe büyük/küçük harf duyarsız, etiket ve grup üzerinde. */
export function searchFields(query: string): FieldDef[] {
  const q = query.trim().toLocaleLowerCase('tr-TR')
  if (!q) return [...FIELDS]
  return FIELDS.filter((f) => `${f.label} ${f.group}`.toLocaleLowerCase('tr-TR').includes(q))
}

// ─── Kalem tablosu sütunları ──────────────────────────────────────────────

export type ItemColumn = 'index' | 'sku' | 'name' | 'barcode' | 'quantity' | 'unitPrice' | 'taxRate' | 'totalPrice' | 'check'

export const ITEM_COLUMNS: ReadonlyArray<{ id: ItemColumn; label: string; numeric?: boolean; weight: number }> = [
  { id: 'index', label: '#', numeric: true, weight: 0.5 },
  { id: 'sku', label: 'Stok kodu', weight: 1.4 },
  { id: 'name', label: 'Ürün', weight: 3 },
  { id: 'barcode', label: 'Barkod', weight: 1.6 },
  { id: 'quantity', label: 'Adet', numeric: true, weight: 0.7 },
  { id: 'unitPrice', label: 'Birim fiyat', numeric: true, weight: 1.2 },
  { id: 'taxRate', label: 'KDV', numeric: true, weight: 0.7 },
  { id: 'totalPrice', label: 'Tutar', numeric: true, weight: 1.2 },
  { id: 'check', label: '✓', weight: 0.5 },
]

// ─── Öğeler ────────────────────────────────────────────────────────────────

export type ElementKind = 'text' | 'field' | 'barcode' | 'qr' | 'line' | 'box' | 'items'
export type Align = 'left' | 'center' | 'right'

export interface ElementBase {
  id: string
  kind: ElementKind
  x: number
  y: number
  w: number
  h: number
}
export interface TextStyle {
  fontSize: number
  bold: boolean
  align: Align
  uppercase?: boolean
}
export interface TextElement extends ElementBase, TextStyle { kind: 'text'; text: string }
export interface FieldElement extends ElementBase, TextStyle { kind: 'field'; path: string; prefix: string }
export interface BarcodeElement extends ElementBase { kind: 'barcode'; path: string; symbology: 'code128' | 'ean13'; showText: boolean }
export interface QrElement extends ElementBase { kind: 'qr'; path: string }
export interface LineElement extends ElementBase { kind: 'line'; thickness: number; dashed: boolean }
export interface BoxElement extends ElementBase { kind: 'box'; thickness: number }
export interface ItemsElement extends ElementBase { kind: 'items'; columns: ItemColumn[]; fontSize: number; zebra: boolean }

export type TemplateElement = TextElement | FieldElement | BarcodeElement | QrElement | LineElement | BoxElement | ItemsElement

export const ELEMENT_KINDS: ReadonlyArray<{ id: ElementKind; label: string; icon: string; hint: string }> = [
  { id: 'text', label: 'Metin', icon: 'mdi-format-text', hint: 'Sabit yazı: başlık, not, iade adresi' },
  { id: 'field', label: 'Alan', icon: 'mdi-code-braces', hint: 'Siparişten gelen değer' },
  { id: 'barcode', label: 'Barkod', icon: 'mdi-barcode', hint: 'Code128 veya EAN-13, bir alana bağlı' },
  { id: 'qr', label: 'QR kod', icon: 'mdi-qrcode', hint: 'Takip bağlantısı veya sipariş no' },
  { id: 'items', label: 'Kalem tablosu', icon: 'mdi-table', hint: 'Sipariş satırları, sütunları seçilebilir' },
  { id: 'line', label: 'Çizgi', icon: 'mdi-minus', hint: 'Bölüm ayırıcı' },
  { id: 'box', label: 'Çerçeve', icon: 'mdi-square-outline', hint: 'Bölümü kutu içine alır' },
]

export const elementKindLabel = (k: ElementKind) => ELEMENT_KINDS.find((e) => e.id === k)?.label ?? k

/** Öğenin kısa adı (katman listesi, ekran okuyucu). */
export function elementName(el: TemplateElement): string {
  switch (el.kind) {
    case 'text': return `Metin: ${el.text.trim().slice(0, 28) || '(boş)'}`
    case 'field': return `Alan: ${fieldDef(el.path)?.label ?? el.path}`
    case 'barcode': return `Barkod: ${fieldDef(el.path)?.label ?? el.path}`
    case 'qr': return `QR: ${fieldDef(el.path)?.label ?? el.path}`
    case 'items': return 'Kalem tablosu'
    case 'line': return 'Çizgi'
    case 'box': return 'Çerçeve'
  }
}

let seq = 0
export function newId(prefix = 'el'): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`
}

/** Yeni öğe varsayılanları (konum verilmezse kenar boşluğunun içine). */
export function createElement(kind: ElementKind, at: { x: number; y: number } = { x: 10, y: 10 }, opts: { path?: string } = {}): TemplateElement {
  const base = { id: newId(), x: at.x, y: at.y }
  const style: TextStyle = { fontSize: 10, bold: false, align: 'left' }
  switch (kind) {
    case 'text': return { ...base, ...style, kind, w: 60, h: 7, text: 'Yeni metin' }
    case 'field': return { ...base, ...style, kind, w: 60, h: 7, path: opts.path ?? 'order.number', prefix: '' }
    case 'barcode': return { ...base, kind, w: 70, h: 20, path: opts.path ?? 'cargo.trackingCode', symbology: 'code128', showText: true }
    case 'qr': return { ...base, kind, w: 22, h: 22, path: opts.path ?? 'cargo.trackingUrl' }
    case 'line': return { ...base, kind, w: 80, h: 1, thickness: 0.4, dashed: false }
    case 'box': return { ...base, kind, w: 80, h: 30, thickness: 0.4 }
    case 'items': return { ...base, kind, w: 120, h: 50, columns: ['sku', 'name', 'quantity', 'totalPrice'], fontSize: 8, zebra: true }
  }
}

// ─── Şablon belgesi ───────────────────────────────────────────────────────

export interface TemplateDoc {
  id: string
  name: string
  kind: DocKind
  paper: Paper
  elements: TemplateElement[]
  /** Hazır (sistem) şablon: salt-okunur, "kopyasını düzenle" ile çoğaltılır (araştırma 13). */
  system?: boolean
  updatedAt?: string
}

export function cloneDoc<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

// ─── Izgara, sınır ────────────────────────────────────────────────────────

export const GRID_MM = 1
export const NUDGE_MM = 1
export const NUDGE_LARGE_MM = 5
export const MIN_SIZE_MM = 2

/** 0,1 mm hassasiyetle yuvarlar (kayan nokta gürültüsü yok). */
export const round1 = (v: number) => Math.round(v * 10) / 10

export function snap(v: number, step = GRID_MM): number {
  return step > 0 ? round1(Math.round(v / step) * step) : round1(v)
}

/** Öğeyi kâğıdın içine çeker; ölçü kâğıttan büyükse kâğıda sığdırır. */
export function clampToPaper<T extends ElementBase>(el: T, paper: Paper): T {
  const { w: pw, h: ph } = paperSize(paper)
  const w = Math.min(Math.max(el.w, MIN_SIZE_MM), pw)
  const h = Math.min(Math.max(el.h, el.kind === 'line' ? 0.2 : MIN_SIZE_MM), ph)
  return { ...el, w: round1(w), h: round1(h), x: round1(Math.min(Math.max(el.x, 0), pw - w)), y: round1(Math.min(Math.max(el.y, 0), ph - h)) }
}

export type AlignAction = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom'

/** Seçili öğeyi kâğıdın kenar boşluğuna/ortasına hizalar. */
export function alignToPaper<T extends ElementBase>(el: T, paper: Paper, action: AlignAction): T {
  const { w: pw, h: ph } = paperSize(paper)
  const m = paper.marginMm
  const next = { ...el }
  if (action === 'left') next.x = m
  if (action === 'hcenter') next.x = (pw - el.w) / 2
  if (action === 'right') next.x = pw - m - el.w
  if (action === 'top') next.y = m
  if (action === 'vmiddle') next.y = (ph - el.h) / 2
  if (action === 'bottom') next.y = ph - m - el.h
  next.x = round1(next.x)
  next.y = round1(next.y)
  return next
}

// ─── Veri ─────────────────────────────────────────────────────────────────

export interface PrintItem {
  sku: string
  name: string
  barcode: string
  quantity: number
  unitPrice: number
  taxRate: number
  totalPrice: number
}

export interface PrintData {
  /** Düz alan değerleri (`FIELDS[].path` anahtarlı; ham değer, biçimlenmemiş). */
  values: Record<string, string | number | null | undefined>
  items: PrintItem[]
  currency: string
  /** Seçicide görünen kısa ad. */
  label: string
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim()
const joinName = (a?: unknown, b?: unknown) => [str(a), str(b)].filter(Boolean).join(' ')

/**
 * Backend `IOrder` (OrderService/getOrders satırı) → düz yazdırma verisi. Bilinmeyen/eksik alanlar boş kalır
 * (önizleme "eksik veri" uyarısı verir). Kargo bilgisi son başarılı/son fulfillment kaydından okunur.
 */
export function buildPrintData(order: any, now: Date = new Date()): PrintData {
  const o = order ?? {}
  const ship = o.shippingAddress ?? {}
  const bill = o.billingAddress ?? {}
  const fin = o.financials ?? {}
  const ful: any[] = Array.isArray(o.fulfillment) ? o.fulfillment : []
  const cargo = [...ful].reverse().find((f) => f?.trackingCode) ?? ful[ful.length - 1] ?? {}
  const items: PrintItem[] = (Array.isArray(o.items) ? o.items : [])
    .filter((i: any) => i && i.itemStatus !== 'CANCELLED')
    .map((i: any) => ({
      sku: str(i.sku), name: str(i.productName), barcode: str(i.barcode),
      quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0,
      taxRate: Number(i.taxRate) || 0, totalPrice: Number(i.totalPrice) || 0,
    }))
  const cityLine = (a: any) => [str(a.state), str(a.city)].filter(Boolean).join(' / ')
  const address = (a: any) => [str(a.addressLine1), str(a.addressLine2)].filter(Boolean).join(' ')
  const number = str(o.orderNumber) || str(o.externalOrderId)
  return {
    label: [number && `#${number}`, joinName(ship.firstName, ship.lastName) || joinName(o.customerFirstName, o.customerLastName)].filter(Boolean).join(' · ') || 'Sipariş',
    currency: str(fin.currencyCode) || 'TRY',
    items,
    values: {
      'order.number': number,
      'order.externalId': str(o.externalOrderId),
      'order.channel': str(o.integrationCode),
      'order.date': o.dates?.orderDate ?? '',
      'order.shippedDate': o.dates?.shippedDate ?? '',
      'order.itemCount': items.reduce((s, i) => s + i.quantity, 0),
      'shipping.name': joinName(ship.firstName, ship.lastName) || joinName(o.customerFirstName, o.customerLastName),
      'shipping.address': address(ship),
      'shipping.district': str(ship.state),
      'shipping.city': str(ship.city),
      'shipping.cityLine': cityLine(ship),
      'shipping.postalCode': str(ship.postalCode),
      'shipping.phone': str(ship.phone),
      'billing.name': str(bill.companyName) || joinName(bill.firstName, bill.lastName),
      'billing.taxNumber': str(bill.taxNumber),
      'billing.taxOffice': str(bill.taxOffice),
      'billing.address': address(bill),
      'billing.cityLine': cityLine(bill),
      'invoice.number': str(o.invoice?.invoiceNumber),
      'cargo.carrier': str(cargo.carrierName),
      'cargo.trackingCode': str(cargo.trackingCode),
      'cargo.barcode': str(cargo.barcodeData) || str(cargo.trackingCode),
      'cargo.trackingUrl': str(cargo.trackingUrl),
      'cargo.desi': cargo.desi ?? '',
      'totals.subTotal': fin.subTotal ?? '',
      'totals.discount': fin.totalDiscount ?? '',
      'totals.tax': fin.totalTax ?? '',
      'totals.shipping': fin.shippingFee ?? '',
      'totals.grand': fin.grandTotal ?? '',
      'doc.printDate': now.toISOString(),
      'doc.pageNote': 'Bizi tercih ettiğiniz için teşekkür ederiz.',
    },
  }
}

/** Alan değerini biçimlenmiş metin olarak verir; değer yoksa ''. */
export function resolveField(path: string, data: PrintData): string {
  const raw = data.values[path]
  if (raw === undefined || raw === null || raw === '') return ''
  const fmt = fieldDef(path)?.format ?? 'text'
  if (fmt === 'money') return formatMoney(raw as number, data.currency)
  if (fmt === 'date') return formatDate(raw as string)
  if (fmt === 'datetime') return formatDateTime(raw as string)
  if (fmt === 'number') return formatNumber(raw as number)
  return String(raw)
}

export function resolveItemCell(col: ItemColumn, item: PrintItem, index: number, currency: string): string {
  switch (col) {
    case 'index': return String(index + 1)
    case 'sku': return item.sku
    case 'name': return item.name
    case 'barcode': return item.barcode
    case 'quantity': return formatNumber(item.quantity)
    case 'unitPrice': return formatMoney(item.unitPrice, currency)
    case 'taxRate': return `%${formatNumber(item.taxRate)}`
    case 'totalPrice': return formatMoney(item.totalPrice, currency)
    case 'check': return ''
  }
}

// Örnek veri kümeleri (araştırma 4.2: stres verisi — uzun ad, çok kalem, boş alan).
const SAMPLE_ORDER = {
  integrationCode: 'trendyol', orderNumber: '10458823190', externalOrderId: '10458823190',
  dates: { orderDate: '2026-09-30T14:32:00.000Z', shippedDate: '2026-10-01T09:10:00.000Z' },
  shippingAddress: { firstName: 'Ayşe', lastName: 'Demir', addressLine1: 'Bağdat Cad. No: 214 D: 7', addressLine2: 'Suadiye Mah.', state: 'Kadıköy', city: 'İstanbul', postalCode: '34740', phone: '05321234567' },
  billingAddress: { firstName: 'Ayşe', lastName: 'Demir', taxNumber: '11111111111', taxOffice: 'Kadıköy', addressLine1: 'Bağdat Cad. No: 214 D: 7', state: 'Kadıköy', city: 'İstanbul' },
  financials: { currencyCode: 'TRY', subTotal: 1874.92, totalDiscount: 100, totalTax: 312.49, shippingFee: 0, grandTotal: 2087.41 },
  invoice: { invoiceNumber: 'EKA2026000001234' },
  fulfillment: [{ carrierName: 'Yurtiçi Kargo', trackingCode: '7330012345678', barcodeData: '7330012345678', trackingUrl: 'https://kargo.example/takip/7330012345678', desi: 2 }],
  items: [
    { sku: 'HB-226028-S37', productName: 'Hakiki Deri Kadın Günlük Bot Siyah 37', barcode: '8690000000012', quantity: 1, unitPrice: 1499.9, taxRate: 20, totalPrice: 1499.9 },
    { sku: 'CR-1180-BEJ', productName: 'Pamuklu Örgü Atkı Bej', barcode: '8690000000029', quantity: 1, unitPrice: 375.02, taxRate: 20, totalPrice: 375.02 },
  ],
}

export type SampleId = 'normal' | 'stress' | 'sparse'

export const SAMPLE_SETS: ReadonlyArray<{ id: SampleId; label: string; hint: string }> = [
  { id: 'normal', label: 'Örnek sipariş', hint: '2 kalem, tüm alanlar dolu' },
  { id: 'stress', label: 'Uzun içerik', hint: 'Uzun adres, 18 kalem — taşmayı dener' },
  { id: 'sparse', label: 'Eksik bilgi', hint: 'Takip kodu ve telefon yok' },
]

export function sampleData(id: SampleId = 'normal', now?: Date): PrintData {
  if (id === 'stress') {
    const items = Array.from({ length: 18 }, (_, i) => ({
      sku: `UZN-${String(1000 + i)}-XL`, productName: `Organik Pamuk Oversize Kapüşonlu Sweatshirt Antrasit Gri Beden XL Model ${i + 1}`,
      barcode: `86900000${String(10000 + i)}`, quantity: (i % 3) + 1, unitPrice: 649.9, taxRate: 20, totalPrice: 649.9 * ((i % 3) + 1),
    }))
    return {
      ...buildPrintData({
        ...SAMPLE_ORDER, orderNumber: '20990012345678901', items,
        shippingAddress: { ...SAMPLE_ORDER.shippingAddress, firstName: 'Mehmet Ali Emre', lastName: 'Yıldırımoğlu Karaosmanoğlu', addressLine1: 'Cumhuriyet Mahallesi Atatürk Bulvarı Gül Apartmanı No: 1453/27 Kat: 11 Daire: 44', addressLine2: 'Yeşilköy Sitesi B Blok, kapıcıya bırakılabilir', state: 'Çekmeköy', city: 'İstanbul' },
      }, now),
      label: 'Uzun içerik (stres)',
    }
  }
  if (id === 'sparse') {
    return {
      ...buildPrintData({
        ...SAMPLE_ORDER, orderNumber: '30551', invoice: undefined,
        shippingAddress: { firstName: 'Can', lastName: 'Öz', addressLine1: 'Atatürk Mah. 12. Sok. No: 3', state: 'Merkez', city: 'Isparta' },
        fulfillment: [], items: [SAMPLE_ORDER.items[0]],
      }, now),
      label: 'Eksik bilgi',
    }
  }
  return { ...buildPrintData(SAMPLE_ORDER, now), label: 'Örnek sipariş' }
}

// ─── Barkod ───────────────────────────────────────────────────────────────

export function ean13Valid(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const sum = digits.slice(0, 12).reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === digits[12]
}

/** Code128: yazdırılabilir ASCII (32–126). */
export const code128Valid = (v: string) => v.length > 0 && /^[\x20-\x7E]+$/.test(v)

// ─── Kalem tablosu yerleşimi ──────────────────────────────────────────────

const PT_TO_MM = 25.4 / 72
/** Tek satır yüksekliği (mm): punto × satır aralığı + dikey dolgu. */
export const itemRowHeightMm = (fontSize: number) => round1(fontSize * PT_TO_MM * 1.3 + 1.6)

/** Kutuya sığan kalem satırı; sığmayan kısım "+N kalem daha" satırına düşer. */
export function itemsLayout(el: Pick<ItemsElement, 'h' | 'fontSize'>, count: number): { visible: number; hidden: number } {
  const row = itemRowHeightMm(el.fontSize)
  const capacity = Math.max(0, Math.floor((el.h - row) / row)) // başlık satırı düşülür
  if (count <= capacity) return { visible: count, hidden: 0 }
  const visible = Math.max(0, capacity - 1) // son satır "+N" notuna ayrılır
  return { visible, hidden: count - visible }
}

/** Metin kutusunun aldığı tahmini satır sayısı (ortalama karakter genişliği ≈ 0,5 em). */
export function estimateLines(text: string, widthMm: number, fontSize: number): number {
  const charMm = fontSize * PT_TO_MM * 0.5
  const perLine = Math.max(1, Math.floor(widthMm / charMm))
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0)
}
export const textLineHeightMm = (fontSize: number) => fontSize * PT_TO_MM * 1.25

// ─── Doğrulama ────────────────────────────────────────────────────────────

export type IssueLevel = 'error' | 'warning'
export interface Issue {
  level: IssueLevel
  elementId?: string
  message: string
}

/**
 * Şablon + veri denetimi (araştırma 4.7, 7.4–7.5, 8.5, 13 "sessiz taşma"): kenar boşluğu dışı, kâğıt dışı,
 * eksik veri, geçersiz barkod, sığmayan kalemler, taşan metin. Mesajlar "ne oldu — ne yapmalı" biçiminde.
 */
export function validateTemplate(doc: TemplateDoc, data: PrintData): Issue[] {
  const issues: Issue[] = []
  const { w: pw, h: ph } = paperSize(doc.paper)
  const m = doc.paper.marginMm
  if (!doc.elements.length) issues.push({ level: 'warning', message: 'Şablon boş — soldan alan veya bileşen ekleyin.' })
  for (const el of doc.elements) {
    const name = elementName(el)
    if (el.x < -0.05 || el.y < -0.05 || el.x + el.w > pw + 0.05 || el.y + el.h > ph + 0.05) {
      issues.push({ level: 'error', elementId: el.id, message: `${name} kâğıdın dışına taşıyor — öğeyi kâğıdın içine taşıyın.` })
    } else if (el.kind !== 'box' && (el.x < m - 0.05 || el.y < m - 0.05 || el.x + el.w > pw - m + 0.05 || el.y + el.h > ph - m + 0.05)) {
      issues.push({ level: 'warning', elementId: el.id, message: `${name} yazdırılamaz kenar boşluğuna giriyor — yazıcı bu kısmı kesebilir.` })
    }
    if (el.kind === 'field' || el.kind === 'barcode' || el.kind === 'qr') {
      const value = resolveField(el.path, data)
      if (!value) {
        issues.push({ level: el.kind === 'field' ? 'warning' : 'error', elementId: el.id, message: `${name} bu siparişte boş — ${el.kind === 'field' ? 'çıktıda boş görünecek' : 'kod basılamaz; başka bir alana bağlayın'}.` })
      } else if (el.kind === 'barcode') {
        const raw = String(data.values[el.path] ?? '')
        if (el.symbology === 'ean13' && !ean13Valid(raw)) issues.push({ level: 'error', elementId: el.id, message: `${name}: değer geçerli bir EAN-13 değil — Code128 seçin veya alanı değiştirin.` })
        if (el.symbology === 'code128' && !code128Valid(raw)) issues.push({ level: 'error', elementId: el.id, message: `${name}: değer Code128 ile basılamayan karakter içeriyor.` })
        if (el.w < 30 || el.h < 8) issues.push({ level: 'warning', elementId: el.id, message: `${name} çok küçük — tarayıcıların okuyabilmesi için en az 30 × 8 mm önerilir.` })
      }
      if (el.kind === 'field' && value) {
        const text = el.prefix ? `${el.prefix} ${value}` : value
        const need = estimateLines(text, el.w, el.fontSize) * textLineHeightMm(el.fontSize)
        if (need > el.h + 0.5) issues.push({ level: 'warning', elementId: el.id, message: `${name} kutuya sığmıyor, kesilebilir — kutuyu büyütün veya yazıyı küçültün.` })
      }
    }
    if (el.kind === 'items') {
      if (!data.items.length) issues.push({ level: 'warning', elementId: el.id, message: 'Kalem tablosu: bu siparişte ürün satırı yok.' })
      const { hidden } = itemsLayout(el, data.items.length)
      if (hidden > 0) issues.push({ level: 'warning', elementId: el.id, message: `Kalem tablosuna ${hidden} kalem sığmadı ("+${hidden} kalem daha" basılır) — tabloyu uzatın veya yazıyı küçültün.` })
    }
  }
  return issues
}

// ─── Hazır şablonlar (galeri) ─────────────────────────────────────────────

type Draft = Omit<TemplateElement, 'id'>
const els = (list: Draft[]): TemplateElement[] => list.map((e, i) => ({ ...e, id: `s${i}` }) as TemplateElement)
const T = (x: number, y: number, w: number, h: number, text: string, s: Partial<TextStyle> = {}): Draft =>
  ({ kind: 'text', x, y, w, h, text, fontSize: 10, bold: false, align: 'left', ...s }) as Draft
const F = (x: number, y: number, w: number, h: number, path: string, s: Partial<TextStyle> & { prefix?: string } = {}): Draft =>
  ({ kind: 'field', x, y, w, h, path, prefix: '', fontSize: 10, bold: false, align: 'left', ...s }) as Draft
const L = (x: number, y: number, w: number, dashed = false): Draft => ({ kind: 'line', x, y, w, h: 0.4, thickness: 0.4, dashed }) as Draft

export const STARTER_TEMPLATES: ReadonlyArray<TemplateDoc> = [
  {
    id: 'sys-label-100x150', name: 'Kargo etiketi — standart', kind: 'shipping-label', system: true,
    paper: { preset: 'label-100x150', landscape: false, marginMm: 3 },
    elements: els([
      F(5, 5, 55, 6, 'cargo.carrier', { fontSize: 11, bold: true, uppercase: true }),
      F(60, 5, 35, 6, 'order.channel', { fontSize: 9, align: 'right', uppercase: true }),
      L(5, 13, 90),
      { kind: 'barcode', x: 8, y: 16, w: 84, h: 26, path: 'cargo.barcode', symbology: 'code128', showText: true } as Draft,
      L(5, 46, 90, true),
      T(5, 49, 40, 4, 'ALICI', { fontSize: 7, bold: true }),
      F(5, 54, 90, 7, 'shipping.name', { fontSize: 13, bold: true }),
      F(5, 62, 90, 16, 'shipping.address', { fontSize: 10 }),
      F(5, 79, 90, 7, 'shipping.cityLine', { fontSize: 12, bold: true, uppercase: true }),
      F(5, 87, 90, 5, 'shipping.phone', { fontSize: 9, prefix: 'Tel:' }),
      L(5, 95, 90),
      { kind: 'items', x: 5, y: 98, w: 64, h: 36, columns: ['sku', 'quantity'], fontSize: 7, zebra: false } as Draft,
      { kind: 'qr', x: 73, y: 98, w: 22, h: 22, path: 'cargo.trackingUrl' } as Draft,
      L(5, 137, 90),
      F(5, 139, 50, 5, 'order.number', { fontSize: 8, prefix: 'Sipariş no:' }),
      F(55, 139, 40, 5, 'doc.printDate', { fontSize: 8, align: 'right' }),
    ]),
  },
  {
    id: 'sys-label-100x100', name: 'Kargo etiketi — kare', kind: 'shipping-label', system: true,
    paper: { preset: 'label-100x100', landscape: false, marginMm: 3 },
    elements: els([
      T(5, 5, 50, 6, 'KARGO', { fontSize: 11, bold: true }),
      F(55, 5, 40, 6, 'cargo.carrier', { fontSize: 9, bold: true, align: 'right' }),
      L(5, 12, 90),
      { kind: 'barcode', x: 8, y: 15, w: 84, h: 22, path: 'cargo.trackingCode', symbology: 'code128', showText: true } as Draft,
      L(5, 40, 90, true),
      T(5, 43, 40, 4, 'ALICI BİLGİLERİ', { fontSize: 7, bold: true }),
      F(5, 48, 90, 7, 'shipping.name', { fontSize: 12, bold: true }),
      F(5, 56, 90, 14, 'shipping.address', { fontSize: 10 }),
      F(5, 71, 90, 6, 'shipping.cityLine', { fontSize: 11, bold: true }),
      L(5, 88, 90),
      F(5, 90, 50, 5, 'order.number', { fontSize: 8, prefix: 'Sipariş no: #' }),
      F(55, 90, 40, 5, 'doc.printDate', { fontSize: 8, align: 'right' }),
    ]),
  },
  {
    id: 'sys-packing-a4', name: 'Sipariş fişi — A4', kind: 'packing-slip', system: true,
    paper: { preset: 'a4', landscape: false, marginMm: 10 },
    elements: els([
      T(15, 15, 100, 10, 'Sipariş Fişi', { fontSize: 20, bold: true }),
      F(15, 26, 100, 6, 'order.number', { fontSize: 10, prefix: 'Sipariş no:' }),
      F(15, 32, 100, 6, 'order.date', { fontSize: 10, prefix: 'Tarih:' }),
      { kind: 'qr', x: 170, y: 15, w: 25, h: 25, path: 'order.number' } as Draft,
      L(15, 45, 180),
      T(15, 50, 85, 5, 'TESLİMAT ADRESİ', { fontSize: 8, bold: true }),
      F(15, 56, 85, 6, 'shipping.name', { fontSize: 11, bold: true }),
      F(15, 62, 85, 12, 'shipping.address', { fontSize: 10 }),
      F(15, 74, 85, 6, 'shipping.cityLine', { fontSize: 10 }),
      T(110, 50, 85, 5, 'FATURA BİLGİLERİ', { fontSize: 8, bold: true }),
      F(110, 56, 85, 6, 'billing.name', { fontSize: 11, bold: true }),
      F(110, 62, 85, 6, 'billing.taxNumber', { fontSize: 10, prefix: 'TCKN/VKN:' }),
      F(110, 68, 85, 6, 'billing.taxOffice', { fontSize: 10, prefix: 'Vergi dairesi:' }),
      { kind: 'items', x: 15, y: 88, w: 180, h: 140, columns: ['index', 'sku', 'name', 'quantity', 'unitPrice', 'totalPrice'], fontSize: 9, zebra: true } as Draft,
      T(120, 235, 40, 6, 'Ara toplam', { fontSize: 10 }),
      F(160, 235, 35, 6, 'totals.subTotal', { fontSize: 10, align: 'right' }),
      T(120, 241, 40, 6, 'İndirim', { fontSize: 10 }),
      F(160, 241, 35, 6, 'totals.discount', { fontSize: 10, align: 'right' }),
      T(120, 247, 40, 6, 'KDV', { fontSize: 10 }),
      F(160, 247, 35, 6, 'totals.tax', { fontSize: 10, align: 'right' }),
      L(120, 254, 75),
      T(120, 256, 40, 7, 'Genel toplam', { fontSize: 12, bold: true }),
      F(150, 256, 45, 7, 'totals.grand', { fontSize: 12, bold: true, align: 'right' }),
      F(15, 275, 180, 6, 'doc.pageNote', { fontSize: 9, align: 'center' }),
    ]),
  },
  {
    id: 'sys-packing-a5', name: 'Sipariş fişi — A5', kind: 'packing-slip', system: true,
    paper: { preset: 'a5', landscape: false, marginMm: 8 },
    elements: els([
      T(10, 10, 80, 8, 'Sipariş Fişi', { fontSize: 16, bold: true }),
      F(10, 19, 90, 5, 'order.number', { fontSize: 9, prefix: 'Sipariş no:' }),
      F(10, 24, 90, 5, 'order.date', { fontSize: 9, prefix: 'Tarih:' }),
      L(10, 31, 128),
      F(10, 34, 128, 6, 'shipping.name', { fontSize: 11, bold: true }),
      F(10, 40, 128, 10, 'shipping.address', { fontSize: 9 }),
      F(10, 50, 128, 5, 'shipping.cityLine', { fontSize: 9 }),
      { kind: 'items', x: 10, y: 60, w: 128, h: 110, columns: ['sku', 'name', 'quantity', 'totalPrice'], fontSize: 8, zebra: true } as Draft,
      L(80, 175, 58),
      T(80, 177, 28, 6, 'Toplam', { fontSize: 11, bold: true }),
      F(105, 177, 33, 6, 'totals.grand', { fontSize: 11, bold: true, align: 'right' }),
      F(10, 195, 128, 5, 'doc.pageNote', { fontSize: 8, align: 'center' }),
    ]),
  },
  {
    id: 'sys-dispatch-a4', name: 'İrsaliye taslağı — A4', kind: 'dispatch-note', system: true,
    paper: { preset: 'a4', landscape: false, marginMm: 10 },
    elements: els([
      T(15, 15, 120, 10, 'Sevk İrsaliyesi (taslak)', { fontSize: 18, bold: true }),
      T(15, 25, 180, 5, 'Bu belge e-İrsaliye yerine geçmez; depo içi sevk kontrolü içindir.', { fontSize: 8 }),
      { kind: 'box', x: 15, y: 34, w: 180, h: 40, thickness: 0.3 } as Draft,
      T(19, 37, 80, 5, 'SEVK ADRESİ', { fontSize: 8, bold: true }),
      F(19, 43, 85, 6, 'shipping.name', { fontSize: 11, bold: true }),
      F(19, 49, 85, 12, 'shipping.address', { fontSize: 10 }),
      F(19, 62, 85, 6, 'shipping.cityLine', { fontSize: 10 }),
      F(110, 37, 80, 6, 'order.number', { fontSize: 10, prefix: 'Sipariş no:' }),
      F(110, 43, 80, 6, 'order.shippedDate', { fontSize: 10, prefix: 'Sevk tarihi:' }),
      F(110, 49, 80, 6, 'cargo.carrier', { fontSize: 10, prefix: 'Taşıyıcı:' }),
      F(110, 55, 80, 6, 'cargo.trackingCode', { fontSize: 10, prefix: 'Takip no:' }),
      { kind: 'items', x: 15, y: 82, w: 180, h: 160, columns: ['index', 'sku', 'name', 'barcode', 'quantity'], fontSize: 9, zebra: true } as Draft,
      L(15, 262, 70),
      T(15, 264, 70, 5, 'Teslim eden', { fontSize: 8 }),
      L(125, 262, 70),
      T(125, 264, 70, 5, 'Teslim alan', { fontSize: 8, align: 'right' }),
    ]),
  },
  {
    id: 'sys-pick-a4', name: 'Toplama listesi — A4', kind: 'pick-list', system: true,
    paper: { preset: 'a4', landscape: false, marginMm: 10 },
    elements: els([
      T(15, 15, 120, 9, 'Toplama Listesi', { fontSize: 18, bold: true }),
      F(15, 25, 100, 6, 'order.number', { fontSize: 10, prefix: 'Sipariş no:' }),
      F(15, 31, 100, 6, 'order.itemCount', { fontSize: 10, prefix: 'Toplam adet:' }),
      { kind: 'barcode', x: 135, y: 15, w: 60, h: 18, path: 'order.number', symbology: 'code128', showText: true } as Draft,
      { kind: 'items', x: 15, y: 42, w: 180, h: 230, columns: ['check', 'sku', 'barcode', 'name', 'quantity'], fontSize: 10, zebra: true } as Draft,
    ]),
  },
]

/** Boş şablon (Yeni şablon → tür + kâğıt). */
export function blankTemplate(kind: DocKind, preset: string): TemplateDoc {
  const p = paperPreset(preset)
  return {
    id: newId('tpl'), name: `Yeni ${docKindLabel(kind).toLocaleLowerCase('tr-TR')}`, kind,
    paper: { preset: p.id, landscape: false, marginMm: p.thermal ? 3 : 10 }, elements: [],
  }
}

/** Hazır şablondan düzenlenebilir kopya. */
export function copyTemplate(doc: TemplateDoc, name?: string): TemplateDoc {
  const c = cloneDoc(doc)
  return { ...c, id: newId('tpl'), name: name ?? `${doc.name} (kopya)`, system: false, elements: c.elements.map((e) => ({ ...e, id: newId() })) }
}
