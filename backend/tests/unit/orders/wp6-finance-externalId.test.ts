// [eslesme-fiyat WP6, D-FIN-1 / Ek E F-P1-7] Finans idempotency anahtarı: kimliksiz satır yazılmaz + raporlanır; N11 belirlenimci anahtar.
import { describe, it, expect, jest } from '@jest/globals';

const bulkWrite = jest.fn(async (_ops: any[], _o?: any) => ({ upsertedCount: 1, modifiedCount: 0 }));
jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getClientDB: jest.fn(async () => ({ getFinancialTransactionModel: () => ({ bulkWrite }) })) } }));

import { FinancialRepository, hasFinancialExternalId } from '../../../src/database/repositories/tenant/FinancialRepository';
import { FinancialMapper as N11FinancialMapper } from '@integration/modules/marketplace/n11/transformers/Mappers';
import { FinancialMapper as HbFinancialMapper } from '@integration/modules/marketplace/hepsiburada/transformers/FinancialMapper';

describe('D-FIN-1', () => {
  it('hasFinancialExternalId: boş/undefined/null/"undefined" geçersiz', () => {
    for (const v of [undefined, null, '', '  ', 'undefined', 'null', 'NaN']) expect(hasFinancialExternalId(v)).toBe(false);
    expect(hasFinancialExternalId(0)).toBe(true);
    expect(hasFinancialExternalId('A1')).toBe(true);
  });
  it('saveFinancials kimliksiz satırları atlar ve sayısını döner; hepsi kimliksizse yazmaz', async () => {
    const repo = new FinancialRepository();
    const r = await repo.saveFinancials(1, [
      { integrationCode: 'hepsiburada', externalId: 'X1', netAmount: 1, transactionDate: new Date() } as any,
      { integrationCode: 'hepsiburada', externalId: '', netAmount: 2, transactionDate: new Date() } as any,
      { integrationCode: 'hepsiburada', externalId: 'undefined', netAmount: 3, transactionDate: new Date() } as any,
    ]);
    expect(r).toEqual({ skipped: 2 });
    expect((bulkWrite.mock.calls[0][0] as any[]).map(o => o.updateOne.filter.externalId)).toEqual(['X1']);
    bulkWrite.mockClear();
    expect(await repo.saveFinancials(1, [{ integrationCode: 'n11', externalId: '' } as any])).toEqual({ skipped: 1 });
    expect(bulkWrite).not.toHaveBeenCalled();
  });
  it('N11 anahtarı belirlenimci (Date.now yok): tarih|durum|tutar; tarih yoksa boş', () => {
    const raw = { settlementListData: { settlementList: [{ settlementDate: '01/10/2026', status: 'PAID', settlementAmount: '12.5' }, { status: 'PAID', settlementAmount: '1' }] } };
    const a = new N11FinancialMapper().toInternalTransactions(raw);
    const b = new N11FinancialMapper().toInternalTransactions(raw);
    expect(a[0].externalId).toBe('01/10/2026|PAID|12.50');
    expect(b[0].externalId).toBe(a[0].externalId);
    expect(a[1].externalId).toBe('');
  });
  it('HB kimliksiz satır boş anahtar (repository atlar); 0 geçerli kimlik', () => {
    const rows = new HbFinancialMapper().toInternalTransactions([{ id: 0 }, {}]);
    expect(rows.map(r => r.externalId)).toEqual(['0', '']);
  });
});
