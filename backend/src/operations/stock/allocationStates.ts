/**
 * Sipariş kalemi (`Orders.items[].allocationState`) için geçerli değerler — `database/client/models/Order.ts` enum'unun
 * yansıması (UNMAPPED, `interfaces/stock` AllocationState'inde YOKTUR: eşleşmeyen SKU, hiç rezervasyon yapılamadı).
 * Eşitlik tests/unit/tenant-surface/order-allocation-api.test.ts'te statik olarak doğrulanır.
 */
export const ORDER_ITEM_ALLOCATION_STATES: ReadonlyArray<string> = ['RESERVED', 'COMMITTED', 'RELEASED', 'OVERSOLD', 'RESTOCKED', 'UNMAPPED'];

/** Operatör dikkati gerektiren durumlar: aşırı satış ve eşleşmeyen SKU. */
export const ATTENTION_ALLOCATION_STATES = ['OVERSOLD', 'UNMAPPED'] as const;
