// DS-v2 A6a — varyant ızgarası ve toplu düzenleyicinin SAF modeli (Vue'dan bağımsız; tests/variant-sheet.test.ts).
//
// Tek yerde toplananlar:
//  · Kolon tanımı + değer okuma/yazma (genel fiyat `variant.prices.*`, kanal fiyatı `variant.platforms[code].prices.*`)
//  · Gruplama (ilk seçenek değeri) ve rowspan hesabı — pencereli (sanal kaydırma) çizimde de doğru
//  · Seçenek sırası: seçenek tanımındaki değer sırası (S, M, L, XL alfabetik değil tanım sırasıyla)
//  · Sayı ayrıştırma (tr-TR "1.234,56", "₺ 12,5", "1234.5"), pano (TSV) okuma/yazma
//  · Toplu işlem (sabit / ± yüzde / ± tutar), aşağı doldur, geri al/yinele geçmişi
//  · Hücre doğrulaması ve değişiklik özeti
// Veri modeli değişmez: kaydetme mevcut ürün kaydet/güncelle uçlarıyla (variants dizisi) yapılır.

/** `moneyOpt`: isteğe bağlı para (ör. maliyet) — boş = değer YOK (null), 0 değil. */
export type CellKind = 'text' | 'money' | 'moneyOpt' | 'int'
export type BaseField = 'stockcode' | 'barcode' | 'salePrice' | 'marketPrice' | 'stock' | 'shelf' | 'costPrice'
/** Kanal fiyatı anahtarı: `ch:<kanalKodu>:salePrice|marketPrice` */
export type ColumnKey = BaseField | `ch:${string}:${'salePrice' | 'marketPrice'}`
export type CellValue = string | number | null | undefined

export interface SheetColumn {
  key: ColumnKey
  label: string
  kind: CellKind
  /** Kanal fiyat kolonları için kanal kodu (kanal rengi/adı bu koddan). */
  channel?: string
  channelName?: string
}

export interface CellRef { row: number; col: number }
export interface CellChange { id: string; key: ColumnKey; before: CellValue; after: CellValue }

export const BASE_COLUMNS: SheetColumn[] = [
  { key: 'stockcode', label: 'Stok kodu', kind: 'text' },
  { key: 'barcode', label: 'Barkod', kind: 'text' },
  { key: 'salePrice', label: 'Satış fiyatı', kind: 'money' },
  { key: 'marketPrice', label: 'Piyasa fiyatı', kind: 'money' },
  { key: 'stock', label: 'Stok', kind: 'int' },
  { key: 'shelf', label: 'Raf', kind: 'text' },
  // PRC-R0: birim alış maliyeti (KDV hariç). Kolon SONDA: klavye sırası = görsel sıra; kayıt genel varyant kaydıyla DEĞİL
  // `PricingService/setVariantCosts` ile yapılır (backend genel kayıtta bu alanı süzer).
  { key: 'costPrice', label: 'Maliyet (KDV hariç)', kind: 'moneyOpt' },
]

/** Maliyet üst sınırı (backend `setVariantCosts` ile aynı). */
export const COST_MAX = 10_000_000

export function channelColumns(channels: Array<{ code: string; title?: string }>): SheetColumn[] {
  const out: SheetColumn[] = []
  for (const ch of channels) {
    const name = ch.title || ch.code
    out.push({ key: `ch:${ch.code}:salePrice`, label: 'Satış fiyatı', kind: 'money', channel: ch.code, channelName: name })
    out.push({ key: `ch:${ch.code}:marketPrice`, label: 'Piyasa fiyatı', kind: 'money', channel: ch.code, channelName: name })
  }
  return out
}

/** Satırın kararlı kimliği: kayıtlı varyantta `_id`, yenide `tempId`. */
export const rowId = (v: any): string => String(v?.tempId ?? v?._id ?? '')

function parseChannelKey(key: ColumnKey): { code: string; field: 'salePrice' | 'marketPrice' } | null {
  if (!key.startsWith('ch:')) return null
  const [, code, field] = key.split(':')
  return { code, field: field as 'salePrice' | 'marketPrice' }
}

export function getCell(v: any, key: ColumnKey): CellValue {
  const ch = parseChannelKey(key)
  if (ch) return v?.platforms?.[ch.code]?.prices?.[ch.field]
  if (key === 'salePrice' || key === 'marketPrice') return v?.prices?.[key]
  return v?.[key]
}

export function setCell(v: any, key: ColumnKey, value: CellValue): void {
  const ch = parseChannelKey(key)
  if (ch) {
    v.platforms = v.platforms || {}
    v.platforms[ch.code] = v.platforms[ch.code] || {}
    v.platforms[ch.code].prices = v.platforms[ch.code].prices || {}
    v.platforms[ch.code].prices[ch.field] = value
    return
  }
  if (key === 'salePrice' || key === 'marketPrice') {
    v.prices = v.prices || {}
    v.prices[key] = value
    return
  }
  v[key] = value
}

// ── Sayılar ────────────────────────────────────────────────────────────────

/**
 * tr-TR ve düz biçimleri ayrıştırır: "1.234,56" → 1234.56 · "12,5" → 12.5 · "1234.5" → 1234.5 ·
 * "₺ 99" → 99 · "%10" → 10 · "" → null · geçersiz → NaN.
 */
export function parseNumber(input: CellValue): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN
  let s = String(input).trim().replace(/[\s\u00a0₺%]|TL|TRY/gi, '')
  if (s === '') return null
  const neg = /^[-−]/.test(s)
  s = s.replace(/^[-−+]/, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // Hangisi sondaysa ondalık ayırıcıdır.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot >= 0 && s.split('.').length > 2) {
    s = s.replace(/\./g, '') // 1.234.567 → binlik
  } else if (lastDot >= 0 && /^\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace('.', '') // "1.234" tr-TR binlik (ondalıklı fiyat yazımı "1234.5" ya da "1.234,5")
  }
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN
  const n = Number(s)
  return neg ? -n : n
}

export const roundMoney = (n: number) => Math.round(n * 100) / 100

/** Hücreye yazılan metni kolon türüne göre saklanacak değere çevirir. Geçersizse `{ error }`. */
export function coerce(kind: CellKind, raw: CellValue): { value: CellValue } | { error: string } {
  if (kind === 'text') return { value: raw === null || raw === undefined ? '' : String(raw).trim() }
  const n = parseNumber(raw)
  if (n === null) return kind === 'moneyOpt' ? { value: null } : { value: 0 }
  if (Number.isNaN(n)) return { error: 'Sayı bekleniyor' }
  if (n < 0) return { error: 'Negatif olamaz' }
  if (kind === 'moneyOpt' && n > COST_MAX) return { error: 'Çok büyük bir tutar' }
  if (kind === 'int') {
    if (!Number.isInteger(n)) return { error: 'Tam sayı olmalı' }
    return { value: n }
  }
  return { value: roundMoney(n) }
}

// ── Toplu işlem ─────────────────────────────────────────────────────────────

export type BulkMode = 'set' | 'percent' | 'amount' | 'clear'
export interface BulkOp { mode: BulkMode; value: CellValue }

/**
 * Tek hücreye toplu işlem uygular. `percent`/`amount` yalnız sayısal kolonlarda; ± işareti değerde
 * (ör. -10 = %10 indirim). Sonuç 0'ın altına düşmez (fiyat/stok negatif olamaz), para 2 haneye yuvarlanır.
 */
export function applyBulk(kind: CellKind, current: CellValue, op: BulkOp): { value: CellValue } | { error: string } {
  if (op.mode === 'clear') return { value: kind === 'text' ? '' : kind === 'moneyOpt' ? null : 0 }
  if (op.mode === 'set') return coerce(kind, op.value)
  if (kind === 'text') return { error: 'Metin kolonunda yalnız sabit değer' }
  const delta = parseNumber(op.value)
  if (delta === null || Number.isNaN(delta)) return { error: 'Sayı bekleniyor' }
  // Boş maliyetin yüzdesi/farkı anlamsız: bilinmeyen değerden sayı üretilmez (0 uydurulmaz).
  if (kind === 'moneyOpt' && (parseNumber(current) ?? null) === null) return { error: 'Önce maliyet girin' }
  const base = Number(parseNumber(current) ?? 0) || 0
  let next = op.mode === 'percent' ? base * (1 + delta / 100) : base + delta
  if (next < 0) next = 0
  if (kind === 'int') return { value: Math.round(next) }
  return { value: roundMoney(next) }
}

// ── Pano (Excel/Sheets TSV) ────────────────────────────────────────────────

/** Excel/Sheets'ten gelen sekmeli metni satır × hücreye böler (tırnaklı çok satırlı hücreyi destekler). */
export function parseClipboard(text: string): string[][] {
  if (!text) return []
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const t = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
      continue
    }
    if (c === '"' && cell === '') { quoted = true; continue }
    if (c === '\t') { row.push(cell); cell = ''; continue }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
    cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  // Sondaki tek boş satır (Excel her kopyanın sonuna \n ekler) zaten düşer.
  return rows
}

export function toClipboard(matrix: CellValue[][]): string {
  return matrix
    .map((r) => r.map((v) => {
      const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v)
      return /[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join('\t'))
    .join('\n')
}

/** Seçim aralığını normalize eder (sol-üst → sağ-alt). */
export function normRange(a: CellRef, b: CellRef) {
  return { r1: Math.min(a.row, b.row), r2: Math.max(a.row, b.row), c1: Math.min(a.col, b.col), c2: Math.max(a.col, b.col) }
}

/**
 * Yapıştırma hedeflerini üretir. Tek hücre kopyalanıp çok hücreli seçime yapıştırılırsa seçimin tamamına
 * yayılır; aksi hâlde aktif hücreden başlayarak tablo boyutunca (sınırlarda kırpılır).
 */
export function pasteTargets(
  matrix: string[][], sel: { r1: number; r2: number; c1: number; c2: number }, rowCount: number, colCount: number,
): Array<{ row: number; col: number; raw: string }> {
  const out: Array<{ row: number; col: number; raw: string }> = []
  if (!matrix.length) return out
  const single = matrix.length === 1 && matrix[0].length === 1
  if (single && (sel.r2 > sel.r1 || sel.c2 > sel.c1)) {
    for (let r = sel.r1; r <= sel.r2; r++) for (let c = sel.c1; c <= sel.c2; c++) out.push({ row: r, col: c, raw: matrix[0][0] })
    return out
  }
  matrix.forEach((cells, i) => cells.forEach((raw, j) => {
    const row = sel.r1 + i
    const col = sel.c1 + j
    if (row < rowCount && col < colCount) out.push({ row, col, raw })
  }))
  return out
}

/** Aşağı doldur: her kolonda seçimin ilk satırının değeri alttaki seçili satırlara kopyalanır. */
export function fillDownTargets(sel: { r1: number; r2: number; c1: number; c2: number }): Array<{ from: CellRef; to: CellRef }> {
  const out: Array<{ from: CellRef; to: CellRef }> = []
  for (let c = sel.c1; c <= sel.c2; c++) for (let r = sel.r1 + 1; r <= sel.r2; r++) out.push({ from: { row: sel.r1, col: c }, to: { row: r, col: c } })
  return out
}

// ── Geri al / yinele ────────────────────────────────────────────────────────

/** Her adım bir değişiklik kümesidir (toplu uygula/yapıştır tek adımda geri alınır). */
export class SheetHistory {
  private done: CellChange[][] = []
  private undone: CellChange[][] = []
  constructor(private limit = 100) {}
  push(step: CellChange[]) {
    const real = step.filter((c) => !sameValue(c.before, c.after))
    if (!real.length) return
    this.done.push(real)
    if (this.done.length > this.limit) this.done.shift()
    this.undone = []
  }
  /** Geri alınacak adımı döndürür; çağıran `before` değerlerini yazar. */
  undo(): CellChange[] | null {
    const s = this.done.pop()
    if (!s) return null
    this.undone.push(s)
    return s
  }
  redo(): CellChange[] | null {
    const s = this.undone.pop()
    if (!s) return null
    this.done.push(s)
    return s
  }
  get canUndo() { return this.done.length > 0 }
  get canRedo() { return this.undone.length > 0 }
  get size() { return this.done.length }
  clear() { this.done = []; this.undone = [] }
}

export function sameValue(a: CellValue, b: CellValue): boolean {
  const na = a === undefined || a === null || a === '' ? null : a
  const nb = b === undefined || b === null || b === '' ? null : b
  if (typeof na === 'number' || typeof nb === 'number') return Number(na ?? 0) === Number(nb ?? 0)
  return na === nb
}

// ── Gruplama / rowspan ──────────────────────────────────────────────────────

export interface GroupedRow<T = any> {
  variant: T
  /** Görünen sıra (0 tabanlı). */
  index: number
  groupKey: string
  groupIndex: number
  /** Grubun ilk satırı mı. */
  groupStart: boolean
  /** Grubun satır sayısı (yalnız ilk satırda anlamlı değil; tüm satırlarda taşınır). */
  groupSize: number
  /** Grubun ilk satırının sırası. */
  groupFirst: number
}

/**
 * Varyantları ilk seçenek değerine göre gruplar (sıra korunur — çağıran önce sıralar).
 * Aynı grup ardışık olmayabilir; bu fonksiyon ardışık blokları grup sayar (rowspan ancak ardışıkta doğru).
 */
export function groupRows<T>(variants: T[], groupOf: (v: T) => string): GroupedRow<T>[] {
  const rows: GroupedRow<T>[] = []
  let gi = -1
  let prev: string | undefined
  for (let i = 0; i < variants.length; i++) {
    const key = groupOf(variants[i]) ?? ''
    const start = i === 0 || key !== prev
    if (start) gi++
    rows.push({ variant: variants[i], index: i, groupKey: key, groupIndex: gi, groupStart: start, groupSize: 0, groupFirst: start ? i : rows[i - 1].groupFirst })
    prev = key
  }
  // boyutları geriye doğru doldur
  let end = rows.length
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].groupStart) {
      const size = end - i
      for (let k = i; k < end; k++) rows[k].groupSize = size
      end = i
    }
  }
  return rows
}

/**
 * Sanal kaydırma penceresi [start, end) için grup hücresi rowspan'ları: pencerenin ilk satırı bir grubun
 * ortasındaysa grup hücresi orada yeniden açılır (kalan kısmı kadar) — rowspan hesabı yalnız burada.
 */
export function windowRowspans(rows: GroupedRow[], start: number, end: number): Map<number, number> {
  const spans = new Map<number, number>()
  for (let i = start; i < end && i < rows.length; i++) {
    const r = rows[i]
    if (r.groupStart || i === start) {
      const groupEnd = r.groupFirst + r.groupSize
      spans.set(i, Math.min(groupEnd, end) - i)
    }
  }
  return spans
}

/** Görünür pencere (sabit satır yüksekliği). `overscan` satır kadar üst/alt tampon. */
export function visibleWindow(scrollTop: number, viewport: number, rowHeight: number, total: number, overscan = 6) {
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const last = Math.min(total, Math.ceil((scrollTop + viewport) / rowHeight) + overscan)
  return { start: first, end: Math.max(first, last) }
}

/**
 * Seçenek tanım sırasına göre karşılaştırıcı: önce ilk seçeneğin (grup) değer sırası, sonra sıradaki
 * seçeneklerin değer sırası. Tanımda bulunmayan değer sona, ad ile.
 */
export function choiceOrderComparator(order: (choiceId: string, valueId: string) => number, title: (valueId: string) => string) {
  return (a: any, b: any): number => {
    const ac = a?.choices || []
    const bc = b?.choices || []
    const n = Math.max(ac.length, bc.length)
    for (let i = 0; i < n; i++) {
      const x = ac[i]
      const y = bc[i]
      if (!x) return -1
      if (!y) return 1
      const ox = order(x.choiceId, x.choiceValueId)
      const oy = order(y.choiceId, y.choiceValueId)
      if (ox !== oy) return ox - oy
      const t = (title(x.choiceValueId) || '').localeCompare(title(y.choiceValueId) || '', 'tr', { sensitivity: 'base' })
      if (t) return t
    }
    return 0
  }
}

// ── Doğrulama ───────────────────────────────────────────────────────────────

export interface CellIssue { level: 'error' | 'warning'; message: string }

/** Ürün içindeki tekrar eden barkod/stok kodlarını bulur (boşlar hariç). */
export function duplicateIndex(variants: any[], key: 'barcode' | 'stockcode'): Set<string> {
  const seen = new Map<string, number>()
  for (const v of variants) {
    const s = String(v?.[key] ?? '').trim()
    if (!s) continue
    seen.set(s, (seen.get(s) || 0) + 1)
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([s]) => s))
}

export function validateCell(v: any, col: SheetColumn, dup: { barcode: Set<string>; stockcode: Set<string> }): CellIssue | null {
  const value = getCell(v, col.key)
  if (col.key === 'barcode' || col.key === 'stockcode') {
    const s = String(value ?? '').trim()
    if (!s) return { level: 'warning', message: col.key === 'barcode' ? 'Barkod boş — pazaryerine gönderimde gerekir' : 'Stok kodu boş' }
    if (dup[col.key].has(s)) return { level: 'error', message: `Bu ${col.key === 'barcode' ? 'barkod' : 'stok kodu'} başka bir varyantta da var` }
    return null
  }
  if (col.kind === 'text') return null
  const n = parseNumber(value as CellValue)
  if (n !== null && Number.isNaN(n)) return { level: 'error', message: 'Sayı bekleniyor' }
  if (n !== null && n < 0) return { level: 'error', message: 'Negatif olamaz' }
  if (col.kind === 'moneyOpt' && n !== null && n > COST_MAX) return { level: 'error', message: 'Çok büyük bir tutar' }
  if (col.kind === 'int' && n !== null && !Number.isInteger(n)) return { level: 'error', message: 'Tam sayı olmalı' }
  if (col.key.endsWith('salePrice')) {
    const market = parseNumber(getCell(v, col.key.replace('salePrice', 'marketPrice') as ColumnKey))
    if (n !== null && market !== null && !Number.isNaN(market) && market > 0 && n > market) {
      return { level: 'warning', message: 'Satış fiyatı piyasa fiyatından yüksek' }
    }
  }
  return null
}

// ── Değişiklik özeti ────────────────────────────────────────────────────────

export interface Snapshot { [id: string]: Partial<Record<ColumnKey, CellValue>> }

export function snapshot(variants: any[], columns: SheetColumn[]): Snapshot {
  const s: Snapshot = {}
  for (const v of variants) {
    const row: Partial<Record<ColumnKey, CellValue>> = {}
    for (const c of columns) row[c.key] = getCell(v, c.key)
    s[rowId(v)] = row
  }
  return s
}

export function diff(before: Snapshot, variants: any[], columns: SheetColumn[]): CellChange[] {
  const out: CellChange[] = []
  for (const v of variants) {
    const id = rowId(v)
    const b = before[id]
    if (!b) continue
    for (const c of columns) {
      const after = getCell(v, c.key)
      if (!sameValue(b[c.key], after)) out.push({ id, key: c.key, before: b[c.key], after })
    }
  }
  return out
}
