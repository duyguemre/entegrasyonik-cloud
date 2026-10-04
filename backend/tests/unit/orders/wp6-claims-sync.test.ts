// [eslesme-fiyat WP6-kalan, D-TY-6 / Ek E F-P1-9, F-P1-10] İade kalem düzeyi durum + sync güncellemesi.
// DB/Redis/ağ YOK: ClaimRepository sahte model ile (bulkWrite işlemleri incelenir).
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';

const bulkWrite = jest.fn(async (_ops: any[]) => ({ upsertedCount: 0, modifiedCount: 0 }));
let existing: any[] = [];
const fakeModel = (rows: () => any[]) => ({
  find: jest.fn(() => ({ select: () => ({ lean: async () => rows() }) })),
});
jest.mock('@database/index', () => ({
  DatabaseManagerInstance: {
    getClientDB: jest.fn(async () => ({
      getClaimModel: () => ({ ...fakeModel(() => existing), bulkWrite }),
      getOrderModel: () => fakeModel(() => []),
    })),
  },
}));

import { ClaimInternalStatusEnum as S } from '@interfaces/claim';
import { aggregateClaimStatus, decideClaimSync, initialResolvedAt } from '@platform/core/orders/claimStatus';
import { ClaimMapper } from '@integration/modules/marketplace/trendyol/transformers/ClaimTransformer';
import { ClaimRepository } from '../../../src/database/repositories/tenant/ClaimRepository';
import { ClaimSchema } from '../../../src/database/client/models/Claim';
import { getUnknownEnumCount, resetUnknownEnumState } from '@integration/modules/common/contract/reportUnknownEnum';

describe('aggregateClaimStatus (D-TY-6)', () => {
  it('açık kalem varsa iade açık (DISPUTED > UNDER_REVIEW > WAITING)', () => {
    expect(aggregateClaimStatus([S.APPROVED, S.WAITING, S.UNDER_REVIEW])).toBe(S.UNDER_REVIEW);
    expect(aggregateClaimStatus([S.WAITING, S.DISPUTED])).toBe(S.DISPUTED);
    expect(aggregateClaimStatus([S.REJECTED, S.WAITING])).toBe(S.WAITING);
  });
  it('tümü kapalı: kısmi kabul → APPROVED; hepsi COMPLETED → COMPLETED; ret/iptal', () => {
    expect(aggregateClaimStatus([S.APPROVED, S.REJECTED])).toBe(S.APPROVED);
    expect(aggregateClaimStatus([S.COMPLETED, S.COMPLETED])).toBe(S.COMPLETED);
    expect(aggregateClaimStatus([S.COMPLETED, S.CANCELLED])).toBe(S.APPROVED);
    expect(aggregateClaimStatus([S.REJECTED, S.CANCELLED])).toBe(S.REJECTED);
    expect(aggregateClaimStatus([S.CANCELLED])).toBe(S.CANCELLED);
    expect(aggregateClaimStatus([])).toBe(S.WAITING);
  });
});

describe('decideClaimSync (F-P1-9)', () => {
  const now = new Date('2026-10-04T10:00:00Z');
  const ext = new Date('2026-10-03T08:00:00Z');
  it('durum değişimi → PLATFORM tarihçe satırı, platform zamanıyla; kapanışta resolvedAt', () => {
    const d = decideClaimSync({ internalStatus: S.WAITING }, { internalStatus: S.REJECTED, externalStatus: 'Rejected', externalUpdatedAt: ext }, now);
    expect(d.historyEntry).toMatchObject({ status: S.REJECTED, changedAt: ext, actionBy: 'PLATFORM' });
    expect(d.resolvedAt).toEqual(ext);
  });
  it('aynı durum → satır yok, mevcut resolvedAt korunur; yeniden açılış → resolvedAt silinir', () => {
    const r = new Date('2026-10-01T00:00:00Z');
    expect(decideClaimSync({ internalStatus: S.APPROVED, resolvedAt: r }, { internalStatus: S.APPROVED, externalStatus: 'Accepted' }, now)).toEqual({});
    const reopened = decideClaimSync({ internalStatus: S.REJECTED, resolvedAt: r }, { internalStatus: S.DISPUTED, externalStatus: 'Unresolved' }, now);
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.historyEntry?.changedAt).toEqual(now); // platform zamanı yoksa tespit anı
  });
  it('yeni iade: kapalı gelirse resolvedAt platform zamanı, açık gelirse yok', () => {
    expect(initialResolvedAt({ internalStatus: S.COMPLETED, externalStatus: 'x', externalUpdatedAt: ext }, now)).toEqual(ext);
    expect(initialResolvedAt({ internalStatus: S.WAITING, externalStatus: 'x' }, now)).toBeUndefined();
  });
});

describe('Trendyol ClaimMapper (D-TY-6, F-P1-10 Accepted ölü dalı)', () => {
  beforeEach(() => resetUnknownEnumState());
  const raw = {
    claimId: 'C1', orderNumber: 'O1', claimDate: 1759400000000, lastModifiedDate: 1759500000000,
    items: [
      { orderLine: { id: 11, productName: 'A', price: 10 }, claimItems: [{ id: 'i1', claimItemStatus: { name: 'Rejected' } }] },
      { orderLine: { id: 12, productName: 'B', price: 20 }, claimItems: [{ id: 'i2', claimItemStatus: { name: 'WaitingInAction' } }] },
    ],
  };
  it('kalem başına durum; iade durumu ilk kalemden DEĞİL birleşimden; platform zamanı', () => {
    const [{ claim }] = new ClaimMapper().toInternalClaimPackages([raw]);
    expect(claim.items.map(i => [i.externalStatus, i.internalStatus])).toEqual([['Rejected', S.REJECTED], ['WaitingInAction', S.UNDER_REVIEW]]);
    expect(claim.internalStatus).toBe(S.UNDER_REVIEW);
    expect(claim.externalStatus).toBe('WaitingInAction');
    expect(claim.externalUpdatedAt).toEqual(new Date(1759500000000));
    expect(claim.history[0].changedAt).toEqual(new Date(1759500000000));
  });
  it('Accepted → APPROVED; bilinmeyen statü raporlanır ve WAITING', () => {
    const [{ claim }] = new ClaimMapper().toInternalClaimPackages([{ ...raw, items: [
      { orderLine: { id: 1 }, claimItems: [{ id: 'a', claimItemStatus: { name: 'Accepted' } }] },
      { orderLine: { id: 2 }, claimItems: [{ id: 'b', claimItemStatus: { name: 'Accepted' } }] },
    ] }]);
    expect(claim.internalStatus).toBe(S.APPROVED);
    const [{ claim: c2 }] = new ClaimMapper().toInternalClaimPackages([{ ...raw, items: [{ orderLine: { id: 1 }, claimItems: [{ id: 'z', claimItemStatus: { name: 'BrandNew' } }] }] }]);
    expect(c2.internalStatus).toBe(S.WAITING);
    expect(getUnknownEnumCount('trendyol.claims', 'claimItemStatus', 'BrandNew')).toBe(1);
  });
});

describe('Claim şeması', () => {
  it('kalem durumu strict şemada kalır, geçersiz iç durum reddedilir', () => {
    const M = mongoose.models.WP6Claim || mongoose.model('WP6Claim', ClaimSchema);
    const doc: any = new M({ items: [{ externalLineItemId: '1', externalItemId: '1', productName: 'p', quantity: 1, externalStatus: 'Rejected', internalStatus: 'REJECTED' }] });
    expect(doc.items[0]).toMatchObject({ externalStatus: 'Rejected', internalStatus: 'REJECTED' });
    expect(new M({ items: [{ externalLineItemId: '1', externalItemId: '1', productName: 'p', quantity: 1, internalStatus: 'NOPE' }] }).validateSync()?.errors['items.0.internalStatus']).toBeDefined();
  });
});

describe('ClaimRepository.saveClaims (F-P1-9)', () => {
  beforeEach(() => { bulkWrite.mockClear(); existing = []; });
  const base = { integrationCode: 'trendyol', externalOrderId: 'O1', type: 'REFUND', totalRefundAmount: 1, currencyCode: 'TRY', items: [], claimedAt: new Date('2026-10-01T00:00:00Z') } as any;
  const ext = new Date('2026-10-03T08:00:00Z');

  it('var olan iade: durum değişimi $push history (setOnInsert\'te history YOK), resolvedAt platform zamanı', async () => {
    existing = [{ externalClaimId: 'C1', internalStatus: 'WAITING' }];
    await new ClaimRepository().saveClaims(1, [{ ...base, externalClaimId: 'C1', internalStatus: S.APPROVED, externalStatus: 'Accepted', externalUpdatedAt: ext, history: [{ status: S.APPROVED, changedAt: ext }] }]);
    const u = (bulkWrite.mock.calls[0][0] as any[])[0].updateOne.update;
    expect(u.$push.history).toMatchObject({ status: S.APPROVED, changedAt: ext, actionBy: 'PLATFORM' });
    expect(u.$setOnInsert.history).toBeUndefined();
    expect(u.$set).toMatchObject({ resolvedAt: ext, externalUpdatedAt: ext, internalStatus: S.APPROVED });
  });

  it('yeni iade: history setOnInsert; platform zamanı yoksa externalUpdatedAt yazılmaz (eskiden new Date())', async () => {
    await new ClaimRepository().saveClaims(1, [{ ...base, externalClaimId: 'C2', internalStatus: S.WAITING, externalStatus: 'Created', history: [{ status: S.WAITING, changedAt: ext }] }]);
    const u = (bulkWrite.mock.calls[0][0] as any[])[0].updateOne.update;
    expect(u.$setOnInsert.history).toHaveLength(1);
    expect(u.$push).toBeUndefined();
    expect(u.$set.externalUpdatedAt).toBeUndefined();
    expect(u.$set.resolvedAt).toBeUndefined();
  });

  it('yeniden açılan iade: resolvedAt $unset', async () => {
    existing = [{ externalClaimId: 'C3', internalStatus: 'REJECTED', resolvedAt: ext }];
    await new ClaimRepository().saveClaims(1, [{ ...base, externalClaimId: 'C3', internalStatus: S.DISPUTED, externalStatus: 'Unresolved', history: [] }]);
    const u = (bulkWrite.mock.calls[0][0] as any[])[0].updateOne.update;
    expect(u.$unset).toEqual({ resolvedAt: '' });
    expect(u.$push.history.status).toBe(S.DISPUTED);
  });
});
