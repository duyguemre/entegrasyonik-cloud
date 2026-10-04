// [eslesme-fiyat WP6-kalan, Ek E F-P1-8] Finans paneli: kargo toplamı CargoInvoices'tan, sıralama izin listesi.
// DB YOK: repository sahte.
import { describe, it, expect, jest } from '@jest/globals';
import { queryTransactions, financialSummary, FINANCE_SORT_FIELDS } from '../../../src/operations/finance/financialPanel';

function fakeRepo(totals: any[] = [{ _id: null, totalCredit: 100, totalDebt: 30, netAmount: 70, transactionCount: 2 }], cargo = 12.5) {
  return {
    transactionPage: jest.fn(async (..._a: any[]) => [2, [], totals]),
    totals: jest.fn(async (_m: any) => totals),
    cargoTotal: jest.fn(async (_m: any) => cargo),
  } as any;
}

describe('financialPanel (F-P1-8)', () => {
  it('totalCargo CargoInvoices.amount toplamından; kanal + tarih filtresi aktarılır', async () => {
    const repo = fakeRepo();
    const res = await financialSummary(repo, { integrationCodes: ['trendyol'], startDate: '2026-10-01', endDate: '2026-10-04' });
    expect(res).toMatchObject({ totalCredit: 100, totalDebt: 30, netAmount: 70, totalCargo: 12.5, transactionCount: 2 });
    expect(repo.cargoTotal).toHaveBeenCalledWith({ integrationCode: { $in: ['trendyol'] }, transactionDate: { $gte: new Date('2026-10-01'), $lte: new Date('2026-10-04') } });
  });

  it('kayıt yoksa sıfırlar; tür filtresi kargo kesintisini (DEDUCTION) içermiyorsa kargo 0 ve sorgu yok', async () => {
    const repo = fakeRepo([], 0);
    expect(await financialSummary(repo, {})).toMatchObject({ totalCredit: 0, totalCargo: 0, transactionCount: 0 });
    const repo2 = fakeRepo();
    expect((await financialSummary(repo2, { transactionTypes: ['SALE'] })).totalCargo).toBe(0);
    expect(repo2.cargoTotal).not.toHaveBeenCalled();
  });

  it('sıralama izin listesi: bilinen anahtar geçer, bilinmeyen 400', async () => {
    const repo = fakeRepo();
    const res = await queryTransactions(repo, { sortBy: [{ key: 'netAmount', order: 'asc' }] });
    expect(repo.transactionPage.mock.calls[0][1]).toEqual({ netAmount: 1 });
    expect(res.summary.totalCargo).toBe(12.5);
    await expect(queryTransactions(fakeRepo(), { sortBy: [{ key: 'meta.secret', order: 'asc' }] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(queryTransactions(fakeRepo(), { sortBy: [{ key: { $gt: '' } }] })).rejects.toBeDefined();
    expect(FINANCE_SORT_FIELDS).toEqual(expect.arrayContaining(['externalId', 'netAmount', 'transactionDate', 'paymentOrderId']));
  });
});
