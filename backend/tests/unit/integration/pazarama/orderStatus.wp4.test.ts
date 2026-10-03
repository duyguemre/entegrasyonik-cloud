// [eslesme-fiyat WP4, D-PZ-9 (P0 oversell)] Pazarama onay/ret: tüm kalemler `updateOrderStatusList` ile tek istekte;
// `orderItemId = externalOrderId` fallback'i kalktı. Ağ YOK: Service sahte.
import { describe, it, expect, jest } from '@jest/globals';
import { OrderService } from '@integration/modules/marketplace/pazarama/services/OrderService';

function setup() {
  const put = jest.fn(async (..._a: any[]) => ({ status: 200, data: {} }));
  const os = new OrderService({ clientId: 1, integrationSettings: { settings: {}, urls: {} } }, { put } as any);
  return { os, put };
}

describe('Pazarama sipariş statüsü (WP4 D-PZ-9)', () => {
  it('onay: PUT order/updateOrderStatusList {orderNumber, status:12}', async () => {
    const { os, put } = setup();
    await expect(os.approveOrder('PZ-100')).resolves.toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe('order/updateOrderStatusList');
    expect(put.mock.calls[0][1]).toEqual({ orderNumber: 'PZ-100', status: 12 });
  });

  it('ret kalem yoksa tüm kalemler 13 (liste ucu); kalem verilmişse yalnız o kalemler', async () => {
    const { os, put } = setup();
    await os.rejectOrder('PZ-100', { reasonId: '1' } as any);
    expect(put.mock.calls[0][1]).toEqual({ orderNumber: 'PZ-100', status: 13 });
    await os.rejectOrder('PZ-100', { reasonId: '1', lineItems: [{ externalLineId: 'IT-1' }, { externalLineId: 'IT-2' }] } as any);
    expect(put.mock.calls.slice(1).map((c) => c[1])).toEqual([
      { orderNumber: 'PZ-100', item: { orderItemId: 'IT-1', status: 13 } },
      { orderNumber: 'PZ-100', item: { orderItemId: 'IT-2', status: 13 } },
    ]);
  });
});
