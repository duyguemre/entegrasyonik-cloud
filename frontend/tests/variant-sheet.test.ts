import { describe, expect, it } from 'vitest'
import {
  BASE_COLUMNS, SheetHistory, applyBulk, channelColumns, choiceOrderComparator, coerce, diff, duplicateIndex,
  fillDownTargets, getCell, groupRows, normRange, parseClipboard, parseNumber, pasteTargets, setCell, snapshot,
  toClipboard, validateCell, visibleWindow, windowRowspans,
} from '../src/components/productDefinitions/variants/grid/variantSheet'

/** DS-v2 A6a — varyant ızgarası / toplu düzenleyici saf modeli. */
const v = (id: string, over: Record<string, any> = {}) => ({
  tempId: id, stockcode: `SK-${id}`, barcode: `869${id}`, stock: 1, shelf: '',
  prices: { salePrice: 100, marketPrice: 120, isPlatformBasedPrice: false }, platforms: {}, choices: [], ...over,
})
const col = (key: string) => [...BASE_COLUMNS, ...channelColumns([{ code: 'trendyol', title: 'Trendyol' }])].find((c) => c.key === key)!

describe('parseNumber — tr-TR ve düz yazım', () => {
  it.each([
    ['1.234,56', 1234.56], ['12,5', 12.5], ['1234.5', 1234.5], ['₺ 99', 99], ['%10', 10], ['-10', -10],
    ['1.500', 1500], ['1.234.567', 1234567], ['1,234.50', 1234.5], ['  42 ', 42], [7, 7],
  ])('%s → %s', (input, out) => expect(parseNumber(input as any)).toBe(out))
  it('boş → null, geçersiz → NaN', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber(undefined)).toBeNull()
    expect(parseNumber('abc')).toBeNaN()
  })
})

describe('coerce — kolon türüne göre saklanacak değer', () => {
  it('para 2 haneye yuvarlanır, stok tam sayı, negatif reddedilir', () => {
    expect(coerce('money', '12,345')).toEqual({ value: 12.35 })
    expect(coerce('int', '3')).toEqual({ value: 3 })
    expect(coerce('int', '3,5')).toEqual({ error: 'Tam sayı olmalı' })
    expect(coerce('money', '-1')).toEqual({ error: 'Negatif olamaz' })
    expect(coerce('text', '  A-01 ')).toEqual({ value: 'A-01' })
  })
})

describe('getCell / setCell — genel ve kanal fiyatı yolları', () => {
  it('genel fiyat variant.prices, kanal fiyatı variant.platforms[kod].prices', () => {
    const x: any = v('1')
    setCell(x, 'ch:trendyol:salePrice', 90)
    expect(x.platforms.trendyol.prices.salePrice).toBe(90)
    setCell(x, 'salePrice', 95)
    expect(x.prices.salePrice).toBe(95)
    expect(getCell(x, 'ch:trendyol:salePrice')).toBe(90)
    expect(getCell(x, 'stock')).toBe(1)
  })
})

describe('applyBulk — toplu uygula', () => {
  it('sabit değer', () => expect(applyBulk('money', 100, { mode: 'set', value: '149,90' })).toEqual({ value: 149.9 }))
  it('+%10 ve -%15', () => {
    expect(applyBulk('money', 100, { mode: 'percent', value: 10 })).toEqual({ value: 110 })
    expect(applyBulk('money', 249.9, { mode: 'percent', value: '-15' })).toEqual({ value: 212.42 })
  })
  it('± tutar ve 0 altına düşmez', () => {
    expect(applyBulk('money', 100, { mode: 'amount', value: '-25,5' })).toEqual({ value: 74.5 })
    expect(applyBulk('money', 10, { mode: 'amount', value: -50 })).toEqual({ value: 0 })
  })
  it('stok ayarla: sabit ve ± adet (tam sayı)', () => {
    expect(applyBulk('int', 5, { mode: 'set', value: 20 })).toEqual({ value: 20 })
    expect(applyBulk('int', 5, { mode: 'amount', value: -2 })).toEqual({ value: 3 })
  })
  it('metin kolonunda yüzde reddedilir, temizle boşaltır', () => {
    expect(applyBulk('text', 'A', { mode: 'percent', value: 10 })).toHaveProperty('error')
    expect(applyBulk('text', 'A', { mode: 'clear', value: null })).toEqual({ value: '' })
  })
})

describe('pano — Excel/Sheets tablo yapıştırma', () => {
  it('sekme + satır, CRLF, tırnaklı hücre', () => {
    expect(parseClipboard('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']])
    expect(parseClipboard('"x\ty"\t"he said ""hi"""\n')).toEqual([['x\ty', 'he said "hi"']])
  })
  it('toClipboard sayıyı tr ondalıkla yazar, özel karakteri tırnaklar', () => {
    expect(toClipboard([[12.5, 'A'], [null, 'a\tb']])).toBe('12,5\tA\n\t"a\tb"')
  })
  it('yapıştırma hedefleri: aktif hücreden başlar, sınırda kırpılır', () => {
    const t = pasteTargets([['1', '2'], ['3', '4']], normRange({ row: 1, col: 4 }, { row: 1, col: 4 }), 3, 5)
    expect(t).toEqual([{ row: 1, col: 4, raw: '1' }, { row: 2, col: 4, raw: '3' }])
  })
  it('tek hücre çoklu seçime yayılır', () => {
    const t = pasteTargets([['9']], normRange({ row: 0, col: 0 }, { row: 2, col: 1 }), 5, 5)
    expect(t).toHaveLength(6)
    expect(t.every((x) => x.raw === '9')).toBe(true)
  })
})

describe('aşağı doldur', () => {
  it('her kolonda ilk satırı alttakilere kopyalar', () => {
    expect(fillDownTargets(normRange({ row: 3, col: 1 }, { row: 1, col: 2 }))).toEqual([
      { from: { row: 1, col: 1 }, to: { row: 2, col: 1 } }, { from: { row: 1, col: 1 }, to: { row: 3, col: 1 } },
      { from: { row: 1, col: 2 }, to: { row: 2, col: 2 } }, { from: { row: 1, col: 2 }, to: { row: 3, col: 2 } },
    ])
  })
})

describe('SheetHistory — geri al / yinele', () => {
  it('adım bazında geri alır, yeni adım yineleme yığınını boşaltır, değişmeyen adım kaydedilmez', () => {
    const h = new SheetHistory()
    h.push([{ id: 'a', key: 'stock', before: 1, after: 1 }])
    expect(h.canUndo).toBe(false)
    h.push([{ id: 'a', key: 'stock', before: 1, after: 5 }, { id: 'b', key: 'stock', before: 2, after: 5 }])
    h.push([{ id: 'a', key: 'shelf', before: '', after: 'A' }])
    expect(h.undo()?.[0].key).toBe('shelf')
    expect(h.canRedo).toBe(true)
    expect(h.redo()?.[0].key).toBe('shelf')
    h.undo()
    h.push([{ id: 'c', key: 'stock', before: 0, after: 3 }])
    expect(h.canRedo).toBe(false)
    expect(h.size).toBe(2)
  })
})

describe('gruplama ve rowspan — tek yerde', () => {
  const rows = groupRows(['S', 'S', 'S', 'B', 'B', 'L'].map((g, i) => ({ g, i })), (x) => x.g)
  it('grup başı / boyut / ilk satır', () => {
    expect(rows.map((r) => [r.groupStart, r.groupSize, r.groupFirst, r.groupIndex])).toEqual([
      [true, 3, 0, 0], [false, 3, 0, 0], [false, 3, 0, 0], [true, 2, 3, 1], [false, 2, 3, 1], [true, 1, 5, 2],
    ])
  })
  it('tam pencere: her grup başında tam rowspan', () => {
    expect([...windowRowspans(rows, 0, 6)]).toEqual([[0, 3], [3, 2], [5, 1]])
  })
  it('pencere grubun ortasından başlarsa grup hücresi kalan kısım kadar yeniden açılır ve sonda kırpılır', () => {
    expect([...windowRowspans(rows, 1, 4)]).toEqual([[1, 2], [3, 1]])
  })
  it('görünür pencere (sabit satır yüksekliği, tampon)', () => {
    expect(visibleWindow(560, 400, 56, 1000, 2)).toEqual({ start: 8, end: 20 })
    expect(visibleWindow(0, 400, 56, 3, 6)).toEqual({ start: 0, end: 3 })
  })
})

describe('seçenek tanım sırası', () => {
  const order: Record<string, number> = { s: 0, m: 1, l: 2, xl: 3, siyah: 0, beyaz: 1 }
  const cmp = choiceOrderComparator((_c, val) => order[val] ?? 99, (val) => val)
  it('beden S, M, L, XL (alfabetik değil)', () => {
    const list = ['xl', 'l', 's', 'm'].map((b) => ({ choices: [{ choiceId: 'r', choiceValueId: 'siyah' }, { choiceId: 'b', choiceValueId: b }] }))
    expect(list.sort(cmp).map((x) => x.choices[1].choiceValueId)).toEqual(['s', 'm', 'l', 'xl'])
  })
})

describe('doğrulama', () => {
  const list = [v('1', { barcode: '111' }), v('2', { barcode: '111' }), v('3', { barcode: '' })]
  const dup = { barcode: duplicateIndex(list, 'barcode'), stockcode: duplicateIndex(list, 'stockcode') }
  it('tekrarlayan barkod hata, boş barkod uyarı', () => {
    expect(validateCell(list[0], col('barcode'), dup)?.level).toBe('error')
    expect(validateCell(list[2], col('barcode'), dup)?.level).toBe('warning')
  })
  it('negatif stok hata; satış > piyasa uyarı (kanal fiyatında da)', () => {
    expect(validateCell(v('4', { stock: -1 }), col('stock'), dup)?.level).toBe('error')
    expect(validateCell(v('5', { prices: { salePrice: 150, marketPrice: 120 } }), col('salePrice'), dup)?.message).toMatch(/piyasa/)
    const ch = v('6', { platforms: { trendyol: { prices: { salePrice: 200, marketPrice: 100 } } } })
    expect(validateCell(ch, col('ch:trendyol:salePrice'), dup)?.level).toBe('warning')
  })
})

describe('değişiklik özeti', () => {
  it('yalnız gerçekten değişen hücreler (0 ↔ boş eşit sayılmaz, sayı/metin eşdeğeri eşit)', () => {
    const list: any[] = [v('1'), v('2')]
    const cols = [col('salePrice'), col('stock'), col('shelf')]
    const snap = snapshot(list, cols)
    setCell(list[0], 'salePrice', 110)
    setCell(list[1], 'shelf', '')
    setCell(list[1], 'stock', '1' as any)
    expect(diff(snap, list, cols)).toEqual([{ id: '1', key: 'salePrice', before: 100, after: 110 }])
  })
})
