// [eslesme-fiyat WP4, 02-ekler/n11 C-9 / C-8] Kargo bildirimi gövdesi (tüm kalemler, firma kimliği, takip no campaignNumber'a YAZILMAZ)
// ve UnPacked eşlemesi (REST yolu). Ağ YOK: bağlayıcı sahte. Şema [İKİNCİL] kaynaktan; resmî WSDL yerelde doğrulanacak.
import { describe, it, expect, jest } from '@jest/globals';
import { OrderService } from '@integration/modules/marketplace/n11/services/OrderService';
import { OrderMapper } from '@integration/modules/marketplace/n11/transformers/OrderMapper';
import { OrderInternalStatusEnum } from '@interfaces/index';

const make = (companies: any = { shipmentCompanies: { shipmentCompany: [{ id: 3, name: 'Yurtiçi Kargo', shortName: 'YK' }, { id: 7, name: 'Aras Kargo', shortName: 'ARAS' }] } }) => {
  const svc = new OrderService({ clientId: 1, integrationSettings: { settings: {}, urls: {} } }, {} as any);
  const makeOrderItemShipment = jest.fn(async (_p: any) => ({ result: { status: 'success' } }));
  const fetchShipmentCompanies = jest.fn(async () => companies);
  (svc as any).connector = { makeOrderItemShipment, fetchShipmentCompanies };
  return { svc, makeOrderItemShipment, fetchShipmentCompanies };
};

describe('N11 kargo bildirimi (WP4 C-9)', () => {
  it('tüm kalemler orderItemList ile; firma adı listeden kimliğe çözülür (bir kez); campaignNumber yazılmaz', async () => {
    const { svc, makeOrderItemShipment, fetchShipmentCompanies } = make();
    const payload: any = { orderId: 'O1', carrierCode: 'aras', carrierName: 'Aras Kargo', trackingCode: 'TRK9', lineItems: [{ externalLineItemId: '11', quantity: 1 }, { externalLineItemId: '12', quantity: 2 }] };
    await expect(svc.sendOrderShipping(payload)).resolves.toEqual({ success: true });
    await svc.sendOrderShipping(payload);
    expect(fetchShipmentCompanies).toHaveBeenCalledTimes(1);
    const body: any = (makeOrderItemShipment.mock.calls[0] as any[])[0];
    const info = { shipmentCompany: { id: '7' }, trackingNumber: 'TRK9', shipmentMethod: 1 };
    expect(body).toEqual({ 'sch:orderItemList': { orderItem: [{ id: '11', shipmentInfo: info }, { id: '12', shipmentInfo: info }] } });
  });

  it('sayısal carrierCode doğrudan kimlik (liste okunmaz); meta.campaignNumber varsa ayrı alan', async () => {
    const { svc, makeOrderItemShipment, fetchShipmentCompanies } = make();
    await svc.sendOrderShipping({ orderId: 'O1', carrierCode: '3', carrierName: 'x', trackingCode: 'T', meta: { campaignNumber: 'C55', lines: [{ orderLineId: 21 }] } } as any);
    expect(fetchShipmentCompanies).not.toHaveBeenCalled();
    expect((makeOrderItemShipment.mock.calls[0] as any[])[0]['sch:orderItemList'].orderItem).toEqual([
      { id: '21', shipmentInfo: { shipmentCompany: { id: '3' }, trackingNumber: 'T', shipmentMethod: 1, campaignNumber: 'C55' } },
    ]);
  });

  it('listede olmayan / belirtilmeyen firma → ağa yazmadan VALIDATION', async () => {
    const { svc, makeOrderItemShipment } = make();
    await expect(svc.sendOrderShipping({ orderId: 'O1', carrierCode: 'MNG', carrierName: 'MNG Kargo', trackingCode: 'T' } as any)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(svc.sendOrderShipping({ orderId: 'O1', trackingCode: 'T' } as any)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(makeOrderItemShipment).not.toHaveBeenCalled();
  });
});

describe('N11 UnPacked (WP4 C-8, REST yolu)', () => {
  it('UNAPPROVED + meta.statusFlag=unpacked; diğer durumlarda bayrak yok', () => {
    const pkg = (st: string) => ({ id: 1, orderNumber: 'N1', shipmentPackageStatus: st, lines: [{ orderLineId: 5, quantity: 1, price: 10 }] });
    const [a] = new OrderMapper().toInternalOrderPackagesFromRest({ content: [pkg('UnPacked')] });
    expect(a.order.internalStatus).toBe(OrderInternalStatusEnum.UNAPPROVED);
    expect((a.order.meta as any).statusFlag).toBe('unpacked');
    const [b] = new OrderMapper().toInternalOrderPackagesFromRest({ content: [pkg('Picking')] });
    expect((b.order.meta as any).statusFlag).toBeUndefined();
  });
});
