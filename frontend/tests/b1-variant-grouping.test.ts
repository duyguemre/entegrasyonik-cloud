// B1 — ürün listesi varyant alt listesi ürün güncelle ızgarasıyla AYNI rowspan'lı grup desenini kullanır.
// Saf sıra (sortGrouped) + ortak rowspan hesabı (groupRows/windowRowspans, "Tümünü gör" kırpması) + statik bekçiler (kopya yok).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sortGrouped } from '@/components/productDefinitions/variants/useVariantGrouping'
import { groupRows, windowRowspans } from '@/components/productDefinitions/variants/grid/variantSheet'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const LIST = 'src/components/productDefinitions/variants/ProductVariantListComponent.vue'
const GRID = 'src/components/productDefinitions/variants/grid/VariantGrid.vue'
const CELL = 'src/components/productDefinitions/variants/VariantGroupCell.vue'

// Renk tanım sırası: Siyah, Beyaz, Lacivert — beden: S, M, L, XL (alfabetik DEĞİL).
const COLOR = ['siyah', 'beyaz', 'lacivert']
const SIZE = ['s', 'm', 'l', 'xl']
const v = (c: string, s: string, o: Record<string, any> = {}) => ({ id: `${c}-${s}`, c, s, ...o })
const groupCmp = (a: any, b: any) => COLOR.indexOf(a.c) - COLOR.indexOf(b.c)
const fallback = (a: any, b: any) => groupCmp(a, b) || SIZE.indexOf(a.s) - SIZE.indexOf(b.s)

describe('sortGrouped — ızgara ile aynı sıra', () => {
  const list = [v('beyaz', 'l'), v('siyah', 'm', { stock: 1 }), v('lacivert', 'm'), v('siyah', 's', { stock: 9 }), v('beyaz', 's'), v('siyah', 'xl', { stock: 4 })]

  it('grup = tanım sırası, grup içi = seçenek tanım sırası (S, M, L, XL)', () => {
    expect(sortGrouped(list, { groupCmp, fallback }).map((x) => x.id))
      .toEqual(['siyah-s', 'siyah-m', 'siyah-xl', 'beyaz-s', 'beyaz-l', 'lacivert-m'])
  })

  it('kolon sıralaması yalnız grup İÇİNDE uygulanır; gruplar ardışık kalır', () => {
    const byStockDesc = (a: any, b: any) => (b.stock ?? 0) - (a.stock ?? 0)
    const out = sortGrouped(list, { groupCmp, fallback, cmp: byStockDesc }).map((x) => x.id)
    expect(out.slice(0, 3)).toEqual(['siyah-s', 'siyah-xl', 'siyah-m'])
    expect(groupRows(out, (id) => id.split('-')[0]).filter((r) => r.groupStart)).toHaveLength(3)
  })

  it('seçenek kolonunda azalan yön tüm sırayı ters çevirir, gruplar bölünmez', () => {
    const out = sortGrouped(list, { groupCmp, fallback, reverse: true }).map((x) => x.id)
    expect(out[0]).toBe('lacivert-m')
    expect(groupRows(out, (id) => id.split('-')[0]).filter((r) => r.groupStart).map((r) => r.groupKey)).toEqual(['lacivert', 'beyaz', 'siyah'])
  })

  it('gruplamasız görünüm (groupCmp = 0): kolon sıralaması tüm listeye uygulanır', () => {
    const byId = (a: any, b: any) => a.id.localeCompare(b.id)
    expect(sortGrouped(list, { groupCmp: () => 0, fallback, cmp: byId })[0].id).toBe('beyaz-l')
  })
})

describe('rowspan — "Tümünü gör" kırpması', () => {
  it('ilk 8 satır gösterilince kırpılan grubun hücresi görünen kısım kadar; sayı yine grubun TOPLAMI', () => {
    const ids = [...Array(4)].map((_, i) => `a-${i}`).concat([...Array(6)].map((_, i) => `b-${i}`))
    const rows = groupRows(ids, (id) => id[0])
    const spans = windowRowspans(rows, 0, 8)
    expect([...spans.entries()]).toEqual([[0, 4], [4, 4]])
    expect(rows[4].groupSize).toBe(6)
  })
})

describe('statik bekçiler — tek desen, kopya yok', () => {
  const list = read(LIST)
  const grid = read(GRID)

  it('liste ve ızgara aynı grup hücresini ve aynı sıra/gruplama modülünü kullanır', () => {
    for (const src of [list, grid]) {
      expect(src).toMatch(/import VariantGroupCell from '\.\.?\/(\.\.\/)?VariantGroupCell\.vue'/)
      expect(src).toMatch(/useVariantGrouping/)
      expect(src).toMatch(/<VariantGroupCell\b[^>]*:rowspan=/)
    }
  })

  it('listede A11 grup başlık satırı ve kendi gruplama kopyası kalmadı', () => {
    expect(list).not.toMatch(/pvl-group__head|groupVariants/)
    expect(list).toMatch(/windowRowspans\(/)
    expect(grid).not.toMatch(/vg-group__label|vg-group__title/)
  })

  it('grup hücresi yalnız semantik token (ham renk yok) ve etiket yapışık', () => {
    const cell = read(CELL)
    expect(cell).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    expect(cell).toMatch(/position: sticky/)
    expect(cell).toMatch(/var\(--ek-color-surface-sunken\)/)
  })

  it('dar kap (< 600px) kart görünümü korunur; grup hücresi kartın üstünde tam genişlik', () => {
    expect(list).toMatch(/@container \(max-width: 599px\)/)
    expect(list).toMatch(/'grp grp grp'/)
  })
})
