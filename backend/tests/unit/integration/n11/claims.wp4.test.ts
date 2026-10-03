// [eslesme-fiyat WP4, D-N11-7 (P0)] N11 iade çekimi: 20'lik sayfalar + IClaimPackage eşlemesi (eskiden ham kayıt dönüyordu).
// Ağ YOK: ReturnConnector sahte. Alan adları WSDL'den doğrulanamadı → hoşgörülü okuma (bilinen takma adlar) test edilir.
import { describe, it, expect, jest } from '@jest/globals';
import { ClaimService, N11_CLAIM_PAGE_SIZE } from '@integration/modules/marketplace/n11/services/ClaimService';
import { ClaimMapper } from '@integration/modules/marketplace/n11/transformers/ClaimMapper';
import { ClaimInternalStatusEnum } from '@interfaces/index';

const raw = (id: number, over: any = {}) => ({
  claimCancelId: id, orderNumber: `O${id}`, status: 'REQUESTED', claimDate: '2026-10-01T10:00:00Z', reason: 'Beden uymadı',
  buyer: { fullName: 'Ayşe Yılmaz', email: 'a@x' },
  claimItemList: { claimItem: [{ orderItemId: 900 + id, productName: 'Elbise', productSellerCode: 'SKU1', quantity: 2, price: 50 }] },
  ...over,
});

describe('N11 iade (WP4 D-N11-7)', () => {
  it('tüm sayfaları 20\'lik çeker ve IClaimPackage üretir', async () => {
    const svc = new ClaimService({ clientId: 1, integrationSettings: { settings: {}, urls: {} } }, {} as any);
    const page0 = Array.from({ length: 20 }, (_, i) => raw(i + 1));
    const claimReturnList = jest.fn(async (p: any) => {
      const page = p['sch:pagingData'].currentPage;
      return { claimReturnList: { claimReturn: page === 0 ? page0 : raw(99) }, pagingData: { totalCount: 21 } };
    });
    (svc as any).connector = { claimReturnList };
    const out = await svc.fetchClaims();
    expect(claimReturnList).toHaveBeenCalledTimes(2);
    expect(claimReturnList.mock.calls[0][0]['sch:pagingData']).toEqual({ currentPage: 0, pageSize: N11_CLAIM_PAGE_SIZE });
    expect(out).toHaveLength(21);
    expect(out[0].claim).toMatchObject({
      integrationCode: 'n11', externalClaimId: '1', externalOrderId: 'O1', internalStatus: ClaimInternalStatusEnum.WAITING,
      totalRefundAmount: 100,
    });
    expect(out[0].claim.items[0]).toMatchObject({ externalLineItemId: '901', sku: 'SKU1', quantity: 2, unitPrice: 50, reason: 'Beden uymadı' });
    expect(out[0].customer).toMatchObject({ firstName: 'Ayşe', lastName: 'Yılmaz' });
  });

  it('durum eşlemesi; kimliksiz kayıt atlanır; tekil (dizi olmayan) kalem okunur', () => {
    const m = new ClaimMapper();
    expect(m.mapStatus('ACCEPTED')).toBe(ClaimInternalStatusEnum.APPROVED);
    expect(m.mapStatus('Rejected')).toBe(ClaimInternalStatusEnum.REJECTED);
    expect(m.mapStatus('COMPLETED')).toBe(ClaimInternalStatusEnum.COMPLETED);
    expect(m.mapStatus('???')).toBe(ClaimInternalStatusEnum.WAITING);
    const pk = m.toInternalClaimPackages([raw(1, { claimItemList: { claimItem: { orderItemId: 5, quantity: 1, price: 10 } } }), { status: 'REQUESTED' }]);
    expect(pk).toHaveLength(1);
    expect(pk[0].claim.items).toHaveLength(1);
    expect(pk[0].claim.meta).toMatchObject({ claimCancelId: 1 });
  });
});
