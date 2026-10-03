// [eslesme-fiyat WP4, 02-ekler/pazarama C-10/C-12/C-14 (D-PZ-8, D-PZ-11)] adres takma adları, 30 günlük sipariş dilimi, fatura GUID.
import { describe, it, expect, jest } from '@jest/globals';
import { OrderService, splitWindows, PZ_ORDER_WINDOW_MS } from '@integration/modules/marketplace/pazarama/services/OrderService';
import { OrderMapper } from '@integration/modules/marketplace/pazarama/transformers/OrderTransformer';
import { pazaramaOrderGuid } from '@integration/modules/marketplace/pazarama/api/OrderConnector';

describe('Pazarama sipariş (WP4 D-PZ-8/11)', () => {
  it('aralık 30 günlük dilimlere bölünür (son dilim kısa); her dilim ayrı istek', async () => {
    const start = new Date('2026-07-01T00:00:00Z');
    const end = new Date('2026-09-05T00:00:00Z');
    const w = splitWindows(start, end, PZ_ORDER_WINDOW_MS);
    expect(w).toHaveLength(3);
    expect(w[0].end.getTime() - w[0].start.getTime()).toBe(PZ_ORDER_WINDOW_MS);
    expect(w[2].end).toEqual(end);
    const svc = new OrderService({ clientId: 1, integrationSettings: { settings: {}, urls: {} } }, {} as any);
    const fetchOrdersFromPlatform = jest.fn(async (_q: any) => [] as any[]);
    (svc as any).connector = { fetchOrdersFromPlatform };
    await svc.fetchOrders({ lastSyncTimestamp: start.toISOString(), endDate: end.toISOString() });
    expect(fetchOrdersFromPlatform).toHaveBeenCalledTimes(3);
    expect(fetchOrdersFromPlatform.mock.calls[2][0]).toEqual({ startDate: w[2].start.toISOString(), endDate: end.toISOString() });
  });

  it('bağımsız DTO adları (fullName/address/city/district/phone) da okunur', () => {
    const [pkg] = new OrderMapper().toInternalOrderPackages([{
      OrderNumber: 'PZ1', OrderId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', OrderStatus: 3,
      ShipmentAddress: { fullName: 'Ayşe Kaya Demir', address: 'Cad. 1', city: 'İzmir', district: 'Konak', phone: '0555' },
      Items: [{ OrderItemId: 'I1', Quantity: 1, ListPrice: { Value: 10 }, SalePrice: { Value: 10 } }],
    }] as any);
    expect(pkg.customer).toMatchObject({ firstName: 'Ayşe', lastName: 'Kaya Demir', phone: '0555' });
    expect(pkg.order.shippingAddress).toMatchObject({ addressLine1: 'Cad. 1', city: 'İzmir', state: 'Konak' });
  });

  it('fatura orderid: ham siparişin GUID OrderId\'si; GUID değilse undefined (OrderNumber yedeği)', () => {
    expect(pazaramaOrderGuid({ OrderId: '3F2504E0-4F89-11D3-9A0C-0305E82C3301' })).toBe('3F2504E0-4F89-11D3-9A0C-0305E82C3301');
    expect(pazaramaOrderGuid({ OrderId: 'PZ1' })).toBeUndefined();
    expect(pazaramaOrderGuid(undefined)).toBeUndefined();
  });
});
