// C1.1 (F-01) — useStockHealthApi saf yardımcıları + tahsis durumu eşlemesi + screens.ts kaydı.
import { describe, it, expect } from 'vitest'
import {
  ALLOCATION_STATES,
  availableOf,
  buildAllocationTimeline,
  flattenAttentionRows,
  isStockOverview,
  orderListParams,
  stockBalance,
  summarizeOrderAllocation,
} from '@/composables/useStockHealthApi'
import { ALLOCATION_STATE_TONE } from '@/design/status-map'
import { parseUrlParams, pickUrlParams, resolveScreenByKey, resolveScreenPath } from '@/navigation/screens'
import tr from '@/plugins/locales/tr.json'

const overview = {
  generatedAt: '2026-09-28T12:00:00.000Z',
  attention: { oversold: { lines: 1, units: 3 }, unmapped: { lines: 1, units: 4 } },
  recentOrders: [
    { orderId: 'a', orderNumber: 'N-1', externalOrderId: null, integrationCode: 'n11', orderDate: '2026-09-27T10:00:00.000Z',
      items: [{ externalLineItemId: 'L1', sku: null, barcode: null, productName: 'x', quantity: 4, allocationState: 'UNMAPPED', lastAllocationAppliedAt: null, oversoldEscalatedAt: null }] },
    { orderId: 'b', orderNumber: 'N-2', externalOrderId: null, integrationCode: 'trendyol', orderDate: '2026-09-26T10:00:00.000Z',
      items: [{ externalLineItemId: null, sku: 'S', barcode: null, productName: 'y', quantity: 3, allocationState: 'OVERSOLD', lastAllocationAppliedAt: null, oversoldEscalatedAt: null }] },
  ],
  variants: { total: 2, totalStock: 10, reservedUnits: 4, availableUnits: 6, withReservations: 1, overReserved: 0, publishPending: 0 },
  reconciliation: { tracked: false, lastRunAt: null },
}

describe('useStockHealthApi — sözleşme koruması', () => {
  it('isStockOverview: sözleşme gövdesini kabul eder; hata/boş gövdeyi reddeder', () => {
    expect(isStockOverview(overview)).toBe(true)
    expect(isStockOverview({})).toBe(false)
    expect(isStockOverview({ isAxiosError: true, response: { status: 500 } })).toBe(false)
    expect(isStockOverview({ ...overview, reconciliation: { lastRunAt: null } })).toBe(false)
  })

  it('flattenAttentionRows: kalem başına satır, aşırı satış önce, benzersiz anahtar', () => {
    const rows = flattenAttentionRows(overview.recentOrders as any)
    expect(rows.map((r) => r.allocationState)).toEqual(['OVERSOLD', 'UNMAPPED'])
    expect(rows[0]).toMatchObject({ orderId: 'b', orderNumber: 'N-2', key: 'b:0' })
    expect(rows[1].key).toBe('a:L1')
    expect(flattenAttentionRows(undefined)).toEqual([])
  })

  it('summarizeOrderAllocation: en önemli durum + karışık sayım; durumsuzsa null', () => {
    expect(summarizeOrderAllocation([{ allocationState: 'RESERVED' }, { allocationState: 'OVERSOLD' }, {}])).toEqual({
      state: 'OVERSOLD', count: 1, tracked: 2, distinct: 2,
    })
    expect(summarizeOrderAllocation([{ allocationState: 'UNMAPPED' }, { allocationState: 'RESERVED' }])?.state).toBe('UNMAPPED')
    expect(summarizeOrderAllocation([{ productName: 'eski' }])).toBeNull()
    expect(summarizeOrderAllocation([{ allocationState: 'BOGUS' }])).toBeNull()
  })

  it('availableOf: stock − reserved (FE hesaplar); stok bilinmiyorsa null (— gösterilir)', () => {
    expect(availableOf({ stock: 10, reserved: 3 })).toBe(7)
    expect(availableOf({ stock: 2, reserved: 5 })).toBe(-3)
    expect(availableOf({ stock: 4 })).toBe(4)
    expect(availableOf({ reserved: 1 })).toBeNull()
  })

  it('stockBalance: oranlar 0..1; toplam 0 ise çubuk yok', () => {
    expect(stockBalance(overview.variants)).toEqual({ availableRatio: 0.6, reservedRatio: 0.4, overCommitted: false })
    expect(stockBalance({ totalStock: 0, reservedUnits: 0 }).availableRatio).toBeNull()
    expect(stockBalance({ totalStock: 2, reservedUnits: 5 })).toMatchObject({ reservedRatio: 1, overCommitted: true })
  })

  it('orderListParams: allocationStates + isteğe bağlı sipariş no', () => {
    expect(orderListParams(['OVERSOLD'], 'N-2')).toEqual({ allocationStates: ['OVERSOLD'], globalSearch: 'N-2' })
    expect(orderListParams(['OVERSOLD', 'UNMAPPED'])).toEqual({ allocationStates: ['OVERSOLD', 'UNMAPPED'] })
  })

  it('buildAllocationTimeline: yalnız gerçek damgalar, zaman sırasıyla; durum yoksa null', () => {
    const [a, b] = buildAllocationTimeline([
      { externalLineItemId: 'L1', productName: 'x', quantity: 2, allocationState: 'OVERSOLD',
        lastAllocationAppliedAt: '2026-09-28T09:41:00.000Z', oversoldEscalatedAt: '2026-09-28T09:10:00.000Z' },
      { productName: 'eski kalem', quantity: 1 },
    ])
    expect(a.events.map((e) => e.kind)).toEqual(['escalated', 'applied'])
    expect(a.state).toBe('OVERSOLD')
    expect(b).toMatchObject({ key: '1', state: null, events: [] })
  })
})

describe('status-map — tahsis durumu (brif eşlemesi)', () => {
  it('6 kod, brifteki ton ve Türkçe etiketler', () => {
    const expected: Record<string, [string, string]> = {
      RESERVED: ['info', 'Rezerve'], COMMITTED: ['success', 'Sevk edildi'], RELEASED: ['neutral', 'Serbest'],
      OVERSOLD: ['danger', 'Aşırı satış'], RESTOCKED: ['neutral', 'Stoka döndü'], UNMAPPED: ['warning', 'Eşleşmedi'],
    }
    expect([...ALLOCATION_STATES].sort()).toEqual(Object.keys(expected).sort())
    for (const s of ALLOCATION_STATES) {
      const entry = ALLOCATION_STATE_TONE[s]
      expect(entry.tone).toBe(expected[s][0])
      const label = entry.labelKey.split('.').reduce((o: any, k) => o?.[k], tr as any)
      expect(label).toBe(expected[s][1])
    }
  })
})

describe('screens.ts — C1.1 kayıtları', () => {
  it('StockHealthView catalog/stock-health slug\'ından çözülür', () => {
    expect(resolveScreenPath(['catalog', 'stock-health'])?.screen.key).toBe('StockHealthView')
  })

  it('OrderListView allocationStates: kapalı küme, çoklu; izinsiz değer atılır; globalSearch URL\'ye yazılmaz', () => {
    const screen = resolveScreenByKey('OrderListView')!
    expect(parseUrlParams(screen, { allocationStates: 'OVERSOLD,HACK,UNMAPPED' })).toEqual({ allocationStates: ['OVERSOLD', 'UNMAPPED'] })
    expect(pickUrlParams(screen, { allocationStates: ['OVERSOLD'], globalSearch: 'N-1' })).toEqual({ allocationStates: 'OVERSOLD' })
    expect(parseUrlParams(screen, { internalStatuses: 'APPROVED' })).toEqual({ internalStatuses: ['APPROVED'] })
  })
})
