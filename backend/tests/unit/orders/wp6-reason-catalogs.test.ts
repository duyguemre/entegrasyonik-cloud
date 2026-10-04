// [eslesme-fiyat WP6, K-G / D-ORD-5, Ek E F-P1-4] İptal ve iade-reddi sebep katalogları AYRI.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { orderRejectionReasons } from '../../../src/operations/orders/orderActions';
import { claimRejectReasons } from '../../../src/operations/orders/claims';
import { TRENDYOL_UNSUPPLIED_REASONS } from '@integration/modules/marketplace/trendyol/constants';
import Pazarama from '@integration/modules/marketplace/pazarama';

const useInstance = (instance: any) => (IntegrationFactory as any).mockImplementation(() => ({ getInstance: jest.fn(async () => instance) }));
beforeEach(() => { (IntegrationFactory as any).mockReset(); });

describe('K-G sebep katalogları', () => {
  it('iptal RPC İPTAL kataloğunu kullanır (varsa); yoksa eski metot', async () => {
    useInstance({ retrieveOrderCancelReasons: async () => [{ id: '500', title: 'Stok' }], retrieveOrderRejectionReasons: async () => [{ id: 'X', title: 'iade' }] });
    expect((await orderRejectionReasons(1, 'trendyol')).data).toEqual([{ id: '500', title: 'Stok' }]);
    useInstance({ retrieveOrderRejectionReasons: async () => [{ id: 'X', title: 'eski' }] });
    expect((await orderRejectionReasons(1, 'ideasoft')).data).toEqual([{ id: 'X', title: 'eski' }]);
  });
  it('iade red RPC kanal kataloğu; yöntem yoksa boş; integrationCode zorunlu', async () => {
    useInstance({ retrieveClaimRejectReasons: async () => [{ id: '1', title: 'a' }] });
    expect((await claimRejectReasons(1, 'pazarama')).data).toEqual([{ id: '1', title: 'a' }]);
    useInstance({});
    expect((await claimRejectReasons(1, 'bizimhesap')).data).toEqual([]);
    await expect(claimRejectReasons(1, '')).rejects.toMatchObject({ status: 400 });
  });
  it('Trendyol tedarik edememe kodları sayısal ve verified:false (ikincil kaynak)', () => {
    expect(TRENDYOL_UNSUPPLIED_REASONS.every(r => /^\d+$/.test(r.id) && r.verified === false)).toBe(true);
  });
  it('Pazarama: iptal 1-4 sipariş sebepleri, iade reddi 1-12 RefundRejectType (eskiden ulaşılamıyordu)', async () => {
    const pz: any = new (Pazarama as any)({ clientId: 1, integrationSettings: { settings: {}, urls: {} } });
    expect((await pz.retrieveOrderCancelReasons()).map((r: any) => String(r.id))).toEqual(['1', '2', '3', '4']);
    const claim = await pz.retrieveClaimRejectReasons();
    expect(claim).toHaveLength(12);
    expect(claim[11]).toMatchObject({ title: 'Diğer' });
  });
});
