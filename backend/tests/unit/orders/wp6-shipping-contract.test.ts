// [eslesme-fiyat WP6, D-ORD-6 / Ek E F-P0-3, F-P0-4, F-P1-5, K-D] Kargo bildirim sözleşmesi + pazaryeri satır kimliği.
// DB/Redis/ağ YOK: repo ve IntegrationFactory sahtedir.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { buildShippingPayload, createShipment } from '../../../src/operations/orders/shipments';
import { cancelOrder } from '../../../src/operations/orders/orderActions';
import { OrderConnector } from '@integration/modules/marketplace/pazarama/api/OrderConnector';

const order = (over: any = {}) => ({
  _id: 'o1', integrationCode: 'pazarama', externalOrderId: 'PZ-100', externalStatus: 3, internalStatus: 'APPROVED',
  items: [
    { externalLineItemId: 'LINE-1', externalItemId: 'PROD-1', sku: 'S1', quantity: 2, itemStatus: 'ACTIVE' },
    { externalLineItemId: 'LINE-2', externalItemId: 'PROD-2', sku: 'S2', quantity: 1 },
    { externalLineItemId: 'LINE-3', externalItemId: 'PROD-3', sku: 'S3', quantity: 1, itemStatus: 'CANCELLED' },
  ],
  fulfillment: [], meta: { packageNumber: 9001 },
  ...over,
});

const useInstance = (instance: any) => (IntegrationFactory as any).mockImplementation(() => ({ getInstance: jest.fn(async () => instance) }));

beforeEach(() => { (IntegrationFactory as any).mockReset(); });

describe('buildShippingPayload (D-ORD-6)', () => {
  it('aktif TÜM satırlar pazaryeri satır kimliğiyle, ilk satır kimliği, dış durum, paket no ve kampanya kodu gider', () => {
    const p = buildShippingPayload(order(), { carrierName: 'Yurtiçi', carrierCode: 'YK', trackingCode: 'T1', campaignCode: 'C9' }, new Date('2026-10-04T00:00:00Z'));
    expect(p.orderId).toBe('PZ-100');
    expect(p.lineItems).toEqual([
      { externalLineItemId: 'LINE-1', merchantSku: 'S1', quantity: 2 },
      { externalLineItemId: 'LINE-2', merchantSku: 'S2', quantity: 1 },
    ]);
    expect(p.meta).toMatchObject({ orderItemId: 'LINE-1', currentExternalStatus: '3', packageNumber: '9001', campaignNumber: 'C9', shipmentMethod: 'MANUAL' });
  });
});

describe('createShipment — performed:false dürüstlüğü (K-D)', () => {
  it('kanal işlem yapmadıysa yerel kayıt güncellenir ama "iletildi" denmez; platformActions SKIPPED', async () => {
    const sendOrderShipping = jest.fn(async (_p: any) => ({ success: true, performed: false, message: 'Trendyol lojistiği' }));
    useInstance({ sendOrderShipping });
    const updates: any[] = [];
    const repo: any = { findOrderById: jest.fn(async () => order({ integrationCode: 'trendyol' })), updateOrderById: jest.fn(async (_id: any, u: any) => { updates.push(u); return { ok: 1 }; }) };
    const res = await createShipment({ repo, clientId: 1, logError: () => undefined }, 'o1', { carrierName: 'TEX', trackingCode: 'T1' });
    expect(res.success).toBe(true);
    expect(res.platformPerformed).toBe(false);
    expect(res.message).toMatch(/bildirim yapılmadı/);
    expect(updates[0].$push.platformActions.status).toBe('SKIPPED');
    expect(updates[1].$push.history.description).toMatch(/iletilmedi/);
    expect((sendOrderShipping.mock.calls[0][0] as any).lineItems).toHaveLength(2);
  });
});

describe('cancelOrder — satır kimliği (F-P0-4)', () => {
  it('rejectOrder pazaryeri SATIR kimliğini alır (PZ OrderItemId), ürün kimliğini değil', async () => {
    const rejectOrder = jest.fn(async (_id: string, _p: any) => true);
    useInstance({ rejectOrder });
    const repo: any = { findById: jest.fn(async () => order()), updateById: jest.fn(async () => ({ ok: 1 })) };
    await cancelOrder({ repo, clientId: 1 }, 'o1', { reasonId: 1, reason: 'stok' });
    expect((rejectOrder.mock.calls[0][1] as any).lineItems.map((l: any) => l.externalLineId)).toEqual(['LINE-1', 'LINE-2', 'LINE-3']);
  });
});

describe('Pazarama kargo bildirimi (F-P1-5)', () => {
  it('her kalem için ayrı updateOrderStatus (status 5); kalem yoksa ağa gitmeden VALIDATION', async () => {
    const put = jest.fn(async (_u: string, _b: any, _o?: any) => ({ data: { success: true } }));
    const c = new OrderConnector({ put } as any, { clientId: 1, integrationSettings: { urls: {} } });
    const p = buildShippingPayload(order(), { carrierCode: 'GUID-1', trackingCode: 'T1' }, new Date());
    await c.sendOrderShipping(p);
    expect(put.mock.calls.map(cl => (cl[1] as any).item.orderItemId)).toEqual(['LINE-1', 'LINE-2']);
    expect((put.mock.calls[0][1] as any).item).toMatchObject({ status: 5, shippingTrackingNumber: 'T1', cargoCompanyId: 'GUID-1' });
    put.mockClear();
    await expect(c.sendOrderShipping({ orderId: 'PZ-1', carrierCode: 'x', carrierName: 'x', trackingCode: 'T' } as any)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(put).not.toHaveBeenCalled();
  });
});
