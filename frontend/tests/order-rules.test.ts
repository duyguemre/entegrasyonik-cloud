import { describe, expect, it } from 'vitest'
import { OrderInternalStatusEnum as S } from '../src/types/OrderTypes'
import { useLifecycle } from '../src/composables/useLifecycle'
import {
  BULK_INVOICE_STATUSES, bulkTargetIds, countBulkEligible, isBulkEligible, isOrderLocked,
} from '../src/components/order/orderRules'

const NOW = new Date('2026-09-30T12:00:00Z')
const order = (id: string, internalStatus: string, extra: Record<string, any> = {}) => ({ _id: id, internalStatus, ...extra })

describe('orderRules — kilit', () => {
  it.each([
    ['kilit yok', {}, false],
    ['lockedUntil null', { platformOperation: { lockedUntil: null } }, false],
    ['gelecekte', { platformOperation: { lockedUntil: '2026-09-30T12:02:00Z' } }, true],
    ['geçmişte', { platformOperation: { lockedUntil: '2026-09-30T11:58:00Z' } }, false],
    ['tam şimdi (bitti)', { platformOperation: { lockedUntil: NOW.toISOString() } }, false],
  ])('%s', (_n, extra, expected) => {
    expect(isOrderLocked(order('1', S.APPROVED, extra), NOW)).toBe(expected)
  })
})

describe('orderRules — toplu uygunluk (tablo)', () => {
  const statuses = Object.values(S)
  const table: Record<string, string[]> = {
    APPROVE: [S.AWAITING_APPROVAL],
    CANCEL: [S.UNAPPROVED, S.AWAITING_APPROVAL, S.APPROVED],
    INVOICE: [S.APPROVED, S.SHIPPED],
    SHIP: [S.APPROVED],
  }
  for (const [action, allowed] of Object.entries(table)) {
    it(`${action}: yalnız ${allowed.join(', ')}`, () => {
      const got = statuses.filter(s => isBulkEligible(order('x', s), action as any))
      expect(got.sort()).toEqual([...allowed].sort())
    })
  }

  it('faturası kesilmiş sipariş toplu faturaya uygun değil', () => {
    expect(isBulkEligible(order('1', S.APPROVED, { invoice: { invoiceNumber: 'F1' } }), 'INVOICE')).toBe(false)
  })
})

describe('orderRules — sayaçlar ve hedefler', () => {
  const locked = { platformOperation: { lockedUntil: '2026-09-30T12:01:00Z' } }
  const rows = [
    order('a', S.AWAITING_APPROVAL),
    order('b', S.APPROVED),
    order('c', S.APPROVED, locked),
    order('d', S.SHIPPED),
    order('e', S.SHIPPED, { invoice: { invoiceNumber: 'F' } }),
    order('f', S.DELIVERED),
  ]

  it('sayaçlar kilitli siparişi saymaz', () => {
    expect(countBulkEligible(rows, NOW)).toEqual({ APPROVE: 1, CANCEL: 2, INVOICE: 2, SHIP: 1 })
  })

  it('hedef listesi kilidi süzmez (bugünkü davranış)', () => {
    expect(bulkTargetIds(rows, 'SHIP')).toEqual(['b', 'c'])
    expect(bulkTargetIds(rows, 'INVOICE')).toEqual(['b', 'c', 'd'])
    expect(bulkTargetIds(rows, 'APPROVE')).toEqual(['a'])
  })
})

describe('orderRules — tekil/toplu fatura ayrışması (C-07, bilinçli)', () => {
  it('DELIVERED tekil satırda faturalanabilir, toplu faturada değil', () => {
    const delivered = order('1', S.DELIVERED)
    expect(useLifecycle().isOrderActionAllowed(delivered, 'INVOICE')).toBe(true)
    expect(BULK_INVOICE_STATUSES).not.toContain(S.DELIVERED)
    expect(isBulkEligible(delivered, 'INVOICE')).toBe(false)
  })
})
