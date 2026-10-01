/**
 * CHARACTERIZATION (COM-03 oncesi mevcut durum): Trendyol FinancialService/Connector/Mapper.
 * Kod degistirilmeden ONCE yazildi; COM-03 degisiklikleri (sayfalama, transactionType, servis grubu, storeFrontCode)
 * bilincli olarak bu testlerin ilgili maddelerini gunceller (her guncelleme "COM-03" notuyla isaretlidir).
 * Ag/DB YOK: Service sahte.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { FinancialService } from '@integration/modules/marketplace/trendyol/services/FinancialService';
import { FinancialMapper } from '@integration/modules/marketplace/trendyol/transformers/FinancialMapper';

const params = {
    clientId: 7,
    integrationSettings: {
        settings: { SELLERID: '123' },
        urls: {
            financeSettlementsUrl: 'https://apigw.trendyol.com/integration/finance/che/sellers/<SELLERID>/settlements',
            financeOtherFinancialsUrl: 'https://apigw.trendyol.com/integration/finance/che/sellers/<SELLERID>/otherfinancials',
        },
    },
};

const SALE_ROW = {
    id: 9001, transactionType: 'Sale', orderNumber: 555, shipmentPackageId: 777, barcode: 'BC-1',
    debt: 0, credit: 80, commissionRate: 20, commissionAmount: 20, sellerRevenue: 80,
    transactionDate: 1_700_000_000_000, paymentDate: 1_700_500_000_000, paymentOrderId: 42, paymentPeriod: 28,
};

describe('Trendyol FinancialMapper (mevcut davranis)', () => {
    it('komisyon alanlarini, hakedis tarihini ve odeme emrini evrensel modele tasir', () => {
        const [t] = new FinancialMapper().toInternalTransactions({ content: [SALE_ROW] }, 'TRENDYOL');
        expect(t).toMatchObject({
            integrationCode: 'TRENDYOL', externalId: '9001', orderNumber: '555', shipmentPackageId: '777',
            transactionType: 'SALE', commissionRate: 20, commissionAmount: 20, sellerRevenue: 80, paymentOrderId: '42', netAmount: 80,
        });
        expect(t.payoutDate).toEqual(new Date(1_700_500_000_000));
        expect(t.meta.barcode).toBe('BC-1');
    });
    it('icerik yoksa bos dizi', () => {
        expect(new FinancialMapper().toInternalTransactions(undefined, 'TRENDYOL')).toEqual([]);
    });
});

describe('Trendyol FinancialService.fetchFinancials (mevcut davranis)', () => {
    it('15 gunluk pencerelere boler; pencere basina settlements + otherfinancials cagirir', async () => {
        const get = jest.fn(async () => ({ data: { content: [] } }));
        const svc = new FinancialService(params, { get } as any);
        const start = new Date('2026-01-01T00:00:00Z');
        const end = new Date('2026-01-31T00:00:00Z');
        await svc.fetchFinancials({ startDate: start, endDate: end });
        const settlementCalls = (get.mock.calls as any[]).filter(c => String(c[0]).includes('/settlements'));
        expect(settlementCalls.length).toBeGreaterThanOrEqual(2);
        for (const c of settlementCalls) {
            const p = c[1];
            expect(p.endDate - p.startDate).toBeLessThanOrEqual(15 * 24 * 3600 * 1000);
            expect(typeof p.startDate).toBe('number'); // ms damgasi
        }
    });
    it('[COM-03] ilk sayfa page 0 / size 500 ile istenir (COM-03 oncesi TEK sayfaydi; simdi totalPages boyunca, bkz. Trendyol.finance.com03.test.ts)', async () => {
        const get = jest.fn(async () => ({ data: { content: [SALE_ROW], totalPages: 1 } }));
        const svc = new FinancialService(params, { get } as any);
        const out = await svc.fetchFinancials({ startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-01-05T00:00:00Z') });
        const settlementCalls = (get.mock.calls as any[]).filter(c => String(c[0]).includes('/settlements'));
        expect(settlementCalls[0][1]).toMatchObject({ page: 0, size: 500 });
        expect(out.length).toBeGreaterThan(0);
    });
});
