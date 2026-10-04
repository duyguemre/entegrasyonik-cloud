// [eslesme-fiyat WP6-kalan, D-ORD-4] Ortak sipariş durum tabloları + yeni iç durumlar PRE_APPROVAL / SPLIT.
import { describe, it, expect } from '@jest/globals';
import { OrderInternalStatusEnum as S } from '@interfaces/order';
import { ORDER_INTERNAL_STATUSES, ORDER_STATUS_WEIGHTS, ORDER_INTERNAL_STATUS_BUCKETS, orderStatusWeight } from '@platform/core/orders/orderStatus';
import { deriveDesiredAllocationBucket } from '../../../src/operations/stock/orderStatusMapping';
import { OrderMapper as HbOrderMapper } from '@integration/modules/marketplace/hepsiburada/transformers/OrderTransformer';
import { getUnknownEnumCount, resetUnknownEnumState } from '@integration/modules/common/contract/reportUnknownEnum';

describe('orderStatus tabloları', () => {
  it('her iç durumun ağırlığı var; liste enum ile aynı', () => {
    expect(ORDER_INTERNAL_STATUSES).toEqual(Object.values(S));
    for (const s of Object.values(S)) expect(typeof ORDER_STATUS_WEIGHTS[s]).toBe('number');
    expect(orderStatusWeight('PRE_APPROVAL')).toBeLessThan(orderStatusWeight('AWAITING_APPROVAL'));
    expect(orderStatusWeight('SPLIT')).toBe(orderStatusWeight('CANCELLED'));
    expect(orderStatusWeight('NOPE')).toBe(0);
  });
  it('stok kovası: PRE_APPROVAL rezerv; SPLIT kovasız (stok yönü değişmez)', () => {
    expect(ORDER_INTERNAL_STATUS_BUCKETS[S.PRE_APPROVAL]).toBe('RESERVED');
    expect(ORDER_INTERNAL_STATUS_BUCKETS[S.SPLIT]).toBeUndefined();
    expect(deriveDesiredAllocationBucket('trendyol', 'UnPacked', 'SPLIT')).toBeNull();
    expect(deriveDesiredAllocationBucket('hepsiburada', 'AwaitingPreApproval', 'PRE_APPROVAL')).toBe('RESERVED');
    expect(deriveDesiredAllocationBucket('ideasoft', 'x', 'SPLIT')).toBeNull();
  });
});

describe('HB AwaitingPreApproval → PRE_APPROVAL', () => {
  it('artık bilinmeyen değil; onaylanabilir AWAITING_APPROVAL\'a düşmez', () => {
    resetUnknownEnumState();
    const m: any = new (HbOrderMapper as any)();
    expect(m.mapStringStatus('AwaitingPreApproval')).toBe(S.PRE_APPROVAL);
    expect(getUnknownEnumCount('hepsiburada.orders.list', 'status', 'AwaitingPreApproval')).toBe(0);
  });
});
