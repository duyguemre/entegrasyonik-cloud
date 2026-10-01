// Protokol 13 karakterizasyon: Hepsiburada `FinancialMapper` (finansal işlem dönüşümü). ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { FinancialMapper } from '@integration/modules/marketplace/hepsiburada/transformers/FinancialMapper';
import { UniversalTransactionType } from '@interfaces/platforms';

describe('Hepsiburada FinancialMapper.toInternalTransactions — karakterizasyon', () => {
    const m = new FinancialMapper();

    it('commissionAmount/grossAmount/netPayoutAmount alanları varsa doğrudan kullanılır', () => {
        const [tx] = m.toInternalTransactions([{
            id: 'T1', orderNumber: 'O1', transactionType: 'Sale', commissionAmount: 15, grossAmount: 200, netPayoutAmount: 185,
            orderDate: '2026-01-01T00:00:00.000Z', payoutDate: '2026-01-05T00:00:00.000Z', description: 'Satış', commissionRate: 7.5,
        }]);
        expect(tx).toMatchObject({
            integrationCode: 'hepsiburada', externalId: 'T1', orderNumber: 'O1', transactionType: UniversalTransactionType.SALE,
            platformType: 'Sale', debt: 15, credit: 200, netAmount: 185, description: 'Satış', commissionAmount: 15, commissionRate: 7.5,
        });
        expect(tx.transactionDate).toEqual(new Date('2026-01-01T00:00:00.000Z'));
        expect(tx.payoutDate).toEqual(new Date('2026-01-05T00:00:00.000Z'));
    });

    it('commissionAmount/grossAmount/netPayoutAmount yoksa amount.value üzerinden hesaplanır (negatif->debt, pozitif->credit)', () => {
        const [debtTx] = m.toInternalTransactions([{ id: 'T2', amount: { value: -50 } }]);
        expect(debtTx.debt).toBe(50);
        expect(debtTx.credit).toBe(0);
        expect(debtTx.netAmount).toBe(-50);
        const [creditTx] = m.toInternalTransactions([{ id: 'T3', amount: { value: 80 } }]);
        expect(creditTx.debt).toBe(0);
        expect(creditTx.credit).toBe(80);
    });

    it('amount da yoksa debt/credit/netAmount 0; orderNumber/description boş string varsayılır', () => {
        const [tx] = m.toInternalTransactions([{ id: 'T4' }]);
        expect(tx.debt).toBe(0);
        expect(tx.credit).toBe(0);
        expect(tx.netAmount).toBe(0);
        expect(tx.orderNumber).toBe('');
        expect(tx.description).toBe('');
    });

    it('payoutDate yoksa maturityDate kullanılır; ikisi de yoksa undefined', () => {
        const [withMaturity] = m.toInternalTransactions([{ id: 'T5', maturityDate: '2026-02-01T00:00:00.000Z' }]);
        expect(withMaturity.payoutDate).toEqual(new Date('2026-02-01T00:00:00.000Z'));
        const [none] = m.toInternalTransactions([{ id: 'T6' }]);
        expect(none.payoutDate).toBeUndefined();
    });

    it('orderDate yoksa transactionDate "şimdi"ye düşer (Date örneği olduğu doğrulanır, tam değer değil)', () => {
        const [tx] = m.toInternalTransactions([{ id: 'T7' }]);
        expect(tx.transactionDate).toBeInstanceOf(Date);
    });

    it.each([
        ['Sale', UniversalTransactionType.SALE],
        ['Paid', UniversalTransactionType.SALE],
        ['Return', UniversalTransactionType.RETURN],
        ['Cancel', UniversalTransactionType.CANCEL],
        ['Deduction', UniversalTransactionType.DEDUCTION],
        ['BilinmeyenTip', UniversalTransactionType.SALE], // bilinmeyen -> SALE varsayılan (sessizce)
    ])('mapTransactionType("%s") -> %s', (type, expected) => {
        const [tx] = m.toInternalTransactions([{ id: 'X', transactionType: type }]);
        expect(tx.transactionType).toBe(expected);
    });

    it('id yoksa externalId boş string; dizi olmayan girdi -> boş dizi', () => {
        const [tx] = m.toInternalTransactions([{}]);
        expect(tx.externalId).toBe('');
        expect(m.toInternalTransactions(null as any)).toEqual([]);
    });

    it('commissionAmount alanı yoksa commissionAmount çıktısı 0 olur (ayrı hesap: Number(item.commissionAmount || 0))', () => {
        const [tx] = m.toInternalTransactions([{ id: 'T8', amount: { value: 10 } }]);
        expect(tx.commissionAmount).toBe(0);
    });

    it('meta ham veriyi olduğu gibi saklar', () => {
        const raw = { id: 'T9', extra: 'field' };
        const [tx] = m.toInternalTransactions([raw]);
        expect(tx.meta).toBe(raw);
    });
});
