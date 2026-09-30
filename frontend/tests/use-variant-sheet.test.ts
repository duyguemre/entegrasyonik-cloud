import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useVariantSheet } from '../src/components/productDefinitions/variants/grid/useVariantSheet'
import { BASE_COLUMNS, channelColumns } from '../src/components/productDefinitions/variants/grid/variantSheet'

/** DS-v2 A6a — toplu düzenleyici etkileşimleri: toplu uygula, aşağı doldur, yapıştır, geri al, klavye. */
function setup() {
  const rows = ref<any[]>([0, 1, 2, 3].map((i) => ({
    tempId: `v${i}`, stockcode: `SK-${i}`, barcode: `86900${i}`, stock: i, shelf: '',
    prices: { salePrice: 100 + i * 10, marketPrice: 150, isPlatformBasedPrice: false }, platforms: {},
  })))
  const columns = ref([...BASE_COLUMNS, ...channelColumns([{ code: 'trendyol', title: 'Trendyol' }])])
  const changes: any[] = []
  const said: string[] = []
  const sheet = useVariantSheet({ rows, columns, onChange: (c) => changes.push(...c), announce: (m) => said.push(m) })
  const colOf = (key: string) => columns.value.findIndex((c) => c.key === key)
  return { rows, columns, sheet, changes, said, colOf }
}

describe('toplu uygula', () => {
  it('satış fiyatı kolonu seçilip +%10 uygulanınca tüm satırlar artar; tek adımda geri alınır', () => {
    const { rows, sheet, colOf, said } = setup()
    sheet.selectCol(colOf('salePrice'))
    const res = sheet.applyToSelection({ mode: 'percent', value: 10 })
    expect(res).toEqual({ changed: 4, skipped: 0 })
    expect(rows.value.map((r) => r.prices.salePrice)).toEqual([110, 121, 132, 143])
    expect(said.at(-1)).toMatch(/4 hücre/)
    sheet.undo()
    expect(rows.value.map((r) => r.prices.salePrice)).toEqual([100, 110, 120, 130])
    sheet.redo()
    expect(rows.value[0].prices.salePrice).toBe(110)
  })
  it('stok ayarla (sabit) yalnız seçili aralığa; metin kolonuna yüzde atlanır', () => {
    const { rows, sheet, colOf } = setup()
    sheet.activate(1, colOf('shelf'))
    sheet.activate(2, colOf('stock'), true) // shelf..stock ters yönde aralık
    const r = sheet.applyToSelection({ mode: 'percent', value: 50 })
    expect(r.skipped).toBe(2) // raf (metin) hücreleri
    expect(rows.value.map((x) => x.stock)).toEqual([0, 2, 3, 3])
  })
  it('kanal fiyatı kolonu platforms[kod].prices içine yazılır', () => {
    const { rows, sheet, colOf } = setup()
    sheet.selectCol(colOf('ch:trendyol:salePrice'))
    sheet.applyToSelection({ mode: 'set', value: '199,90' })
    expect(rows.value.every((r) => r.platforms.trendyol.prices.salePrice === 199.9)).toBe(true)
  })
})

describe('aşağı doldur (Ctrl+D)', () => {
  it('ilk satırın değeri seçili alt satırlara', () => {
    const { rows, sheet, colOf } = setup()
    sheet.activate(0, colOf('stock'))
    sheet.activate(3, colOf('stock'), true)
    expect(sheet.onKeydown({ key: 'd', ctrlKey: true })).toBe(true)
    expect(rows.value.map((r) => r.stock)).toEqual([0, 0, 0, 0])
    sheet.onKeydown({ key: 'z', ctrlKey: true })
    expect(rows.value.map((r) => r.stock)).toEqual([0, 1, 2, 3])
  })
})

describe('Excel yapıştırma', () => {
  it('2×2 blok aktif hücreden başlar; tr sayıları ayrışır; geçersiz hücre atlanır', () => {
    const { rows, sheet, colOf } = setup()
    sheet.activate(1, colOf('salePrice'))
    const r = sheet.pasteText('1.234,50\t999\r\nabc\t10\r\n')
    expect(r).toEqual({ changed: 3, invalid: 1 })
    expect(rows.value[1].prices.salePrice).toBe(1234.5)
    expect(rows.value[1].prices.marketPrice).toBe(999)
    expect(rows.value[2].prices.salePrice).toBe(120) // "abc" yazılmadı
    expect(rows.value[2].prices.marketPrice).toBe(10)
    sheet.undo()
    expect(rows.value[1].prices.salePrice).toBe(110)
  })
  it('tek değer çoklu seçime yayılır', () => {
    const { rows, sheet, colOf } = setup()
    sheet.selectCol(colOf('stock'))
    sheet.pasteText('7')
    expect(rows.value.map((r) => r.stock)).toEqual([7, 7, 7, 7])
  })
  it('kopyala seçimi TSV verir (tr ondalık)', () => {
    const { sheet, colOf } = setup()
    sheet.activate(0, colOf('salePrice'))
    sheet.activate(1, colOf('marketPrice'), true)
    expect(sheet.copyText()).toBe('100\t150\n110\t150')
  })
})

describe('klavye ile hücre içi düzenleme', () => {
  it('yazmaya başlamak düzenler, Enter kaydedip aşağı iner, Tab sağa geçer', () => {
    const { rows, sheet, colOf } = setup()
    sheet.activate(0, colOf('stock'))
    sheet.onKeydown({ key: '5' })
    expect(sheet.editing.value?.draft).toBe('5')
    sheet.editing.value!.draft = '25'
    sheet.onKeydown({ key: 'Enter' })
    expect(rows.value[0].stock).toBe(25)
    expect(sheet.active.value).toEqual({ row: 1, col: colOf('stock') })
    sheet.onKeydown({ key: 'F2' })
    sheet.editing.value!.draft = 'A-9'
    // stok kolonunda metin → hücrede hata, düzenlemede kalır
    expect(sheet.onKeydown({ key: 'Tab' })).toBe(true)
    expect(sheet.editing.value?.error).toBe('Sayı bekleniyor')
    sheet.onKeydown({ key: 'Escape' })
    expect(sheet.editing.value).toBeNull()
    expect(rows.value[1].stock).toBe(1)
  })
  it('oklar sınırda kalır, Shift+ok seçimi genişletir, Delete temizler, Ctrl+A tümü', () => {
    const { rows, sheet, colOf, columns } = setup()
    sheet.activate(0, 0)
    sheet.onKeydown({ key: 'ArrowUp' })
    expect(sheet.active.value).toEqual({ row: 0, col: 0 })
    sheet.activate(0, colOf('stock'))
    sheet.onKeydown({ key: 'ArrowDown', shiftKey: true })
    expect(sheet.selectedCount.value).toBe(2)
    sheet.onKeydown({ key: 'Delete' })
    expect(rows.value.map((r) => r.stock)).toEqual([0, 0, 2, 3])
    sheet.onKeydown({ key: 'a', ctrlKey: true })
    expect(sheet.selectedCount.value).toBe(4 * columns.value.length)
  })
  it('son kolonda Tab ızgaradan çıkar (odak tuzağı yok)', () => {
    const { sheet, columns } = setup()
    sheet.activate(0, columns.value.length - 1)
    expect(sheet.onKeydown({ key: 'Tab' })).toBe(false)
  })
})
