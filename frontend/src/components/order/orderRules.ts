/**
 * X-04 / F-CL3c — Sipariş listesi toplu eylem ve kilit kuralları (saf; `OrderListView` içinden taşındı).
 *
 * DİKKAT — iki sürüm bilinçli olarak ayrı adla korunur (davranış değişmedi):
 *  - Toplu fatura: `BULK_INVOICE_STATUSES` = [APPROVED, SHIPPED]; tekil satır eylemi (`useLifecycle`
 *    `isOrderActionAllowed(…,'INVOICE')`) DELIVERED'ı da kabul eder. Hizalama ürün kararıdır.
 *  - Toplu düğme sayaçları (`countBulkEligible`) kilitli siparişi saymaz; onaydan sonra gönderilen
 *    hedef listesi (`bulkTargetIds`) kilidi yeniden süzmez (sunucu kilidi reddeder).
 */
import { OrderInternalStatusEnum } from '@/types/OrderTypes'

export type BulkOrderAction = 'APPROVE' | 'INVOICE' | 'SHIP'

interface OrderLike {
  _id?: string
  internalStatus?: string
  invoice?: { invoiceNumber?: string } | null
  platformOperation?: { lockedUntil?: string | Date | null } | null
}

export const BULK_APPROVE_STATUSES: readonly string[] = [OrderInternalStatusEnum.AWAITING_APPROVAL]
export const BULK_CANCEL_STATUSES: readonly string[] = [
  OrderInternalStatusEnum.UNAPPROVED, OrderInternalStatusEnum.AWAITING_APPROVAL, OrderInternalStatusEnum.APPROVED,
]
export const BULK_INVOICE_STATUSES: readonly string[] = [OrderInternalStatusEnum.APPROVED, OrderInternalStatusEnum.SHIPPED]
export const BULK_SHIP_STATUSES: readonly string[] = [OrderInternalStatusEnum.APPROVED]

/** Platform işlemi sürerken sipariş `platformOperation.lockedUntil` anına kadar kilitlidir. */
export function isOrderLocked(order: OrderLike | null | undefined, now: Date = new Date()): boolean {
  if (!order?.platformOperation?.lockedUntil) return false
  return new Date(order.platformOperation.lockedUntil) > now
}

/** Toplu eyleme uygunluk (kilit hariç). */
export function isBulkEligible(order: OrderLike, action: BulkOrderAction | 'CANCEL'): boolean {
  const status = order.internalStatus ?? ''
  switch (action) {
    case 'APPROVE': return BULK_APPROVE_STATUSES.includes(status)
    case 'CANCEL': return BULK_CANCEL_STATUSES.includes(status)
    case 'INVOICE': return BULK_INVOICE_STATUSES.includes(status) && !order.invoice?.invoiceNumber
    case 'SHIP': return BULK_SHIP_STATUSES.includes(status)
  }
}

/** Toplu eylem çubuğu sayaçları: kilitli siparişler sayılmaz. */
export function countBulkEligible(orders: OrderLike[], now: Date = new Date()) {
  const open = orders.filter(o => !isOrderLocked(o, now))
  const count = (a: BulkOrderAction | 'CANCEL') => open.filter(o => isBulkEligible(o, a)).length
  return { APPROVE: count('APPROVE'), CANCEL: count('CANCEL'), INVOICE: count('INVOICE'), SHIP: count('SHIP') }
}

/** Toplu eylemin gönderileceği sipariş kimlikleri (kilit süzülmez — bkz. başlık notu). */
export function bulkTargetIds(orders: OrderLike[], action: BulkOrderAction): string[] {
  return orders.filter(o => isBulkEligible(o, action)).map(o => o._id as string)
}
