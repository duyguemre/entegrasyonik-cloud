/**
 * COM-03: Trendyol settlements/otherfinancials cekimi. Ag YOK (sahte Service); gercek Trendyol'a istek atilmaz.
 * Kapsam: transactionType (cagri basina tek tip), sayfalama, sayfa tavani -> markIncomplete, servis grubu + storeFrontCode,
 * idempotent yazim anahtari, yanit sozlesmesi gozlemi (API_SCHEMA_DRIFT; istek bozulmaz).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { FinancialService } from '@integration/modules/marketplace/trendyol/services/FinancialService';
import { FinancialConnector } from '@integration/modules/marketplace/trendyol/api/FinancialConnector';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { TRENDYOL_SETTLEMENTS_LIST } from '@integration/modules/marketplace/trendyol/contracts/finance.settlements';
import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { metricsRegistry } from '@platform/runtime/metrics';

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
const row = (id: number, type = 'Sale') => ({ id, transactionType: type, orderNumber: 1000 + id, barcode: `BC-${id}`, credit: 80, debt: 0, commissionRate: 20, commissionAmount: 20, sellerRevenue: 80, transactionDate: 1_700_000_000_000 });
const window1 = { startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-01-05T00:00:00Z') };

describe('FinancialService.fetchFinancials (COM-03)', () => {
    // [BİLİNÇLİ DÜZELTME - eslesme-fiyat WP4 D-TY-9] settlements'a Discount/Coupon eklendi (eskiden yalnız Sale/Return).
    it('settlements icin Sale/Return/Discount/Coupon, otherfinancials icin 4 tip AYRI cagrilir (cagri basina tek transactionType)', async () => {
        const get = jest.fn(async () => ({ data: { content: [], totalPages: 1 } }));
        await new FinancialService(params, { get } as any).fetchFinancials(window1);
        const calls = get.mock.calls as any[];
        const st = calls.filter(c => c[0].includes('/settlements')).map(c => c[1].transactionType);
        const of = calls.filter(c => c[0].includes('/otherfinancials')).map(c => c[1].transactionType);
        expect(st).toEqual(['Sale', 'Return', 'Discount', 'Coupon']);
        expect(of).toEqual(['PaymentOrder', 'DeductionInvoices', 'CreditNote', 'CommissionInvoice']);
        expect(calls.every(c => c[1].transactionTypes === undefined)).toBe(true);
    });

    it('[WP4 D-TY-9] ödeme emri satırları sayfalı çekilir (eskiden tek istek size=1000)', async () => {
        const get = jest.fn(async (_u: string, q: any) => ({ data: { content: [{ id: q.page, transactionType: 'Sale', credit: 1, debt: 0 }], totalPages: 2 } }));
        const rows = await new FinancialService(params, { get } as any).fetchSettlementsByPaymentId('PO1');
        expect((get.mock.calls as any[]).map(c => [c[1].paymentOrderId, c[1].page])).toEqual([['PO1', 0], ['PO1', 1]]);
        expect(rows).toHaveLength(2);
    });

    it('transactionTypes verilirse yalniz kesisim cagrilir', async () => {
        const get = jest.fn(async () => ({ data: { content: [], totalPages: 1 } }));
        await new FinancialService(params, { get } as any).fetchFinancials({ ...window1, transactionTypes: ['Sale'] });
        expect((get.mock.calls as any[]).map(c => c[1].transactionType)).toEqual(['Sale']);
    });

    it('tum sayfalari dolasir (totalPages=3) ve satirlari birlestirir', async () => {
        const get = jest.fn(async (_url: any, q: any) => ({ data: { content: [row(q.page + 1)], totalPages: 3 } }));
        const out = await new FinancialService(params, { get } as any).fetchFinancials({ ...window1, transactionTypes: ['Sale'] });
        expect((get.mock.calls as any[]).map(c => c[1].page)).toEqual([0, 1, 2]);
        expect(out.map(t => t.externalId)).toEqual(['1', '2', '3']);
        expect(getIncomplete(out)).toBeUndefined();
    });

    it('bos sayfada durur (kacak dongu yok)', async () => {
        const get = jest.fn(async () => ({ data: { content: [], totalPages: 999 } }));
        await new FinancialService(params, { get } as any).fetchFinancials({ ...window1, transactionTypes: ['Sale'] });
        expect(get).toHaveBeenCalledTimes(1);
    });

    it('sayfa tavanina (200) takilirsa sonuc markIncomplete ile isaretlenir (imlec ilerlemez)', async () => {
        const get = jest.fn(async (_u: any, q: any) => ({ data: { content: [row(q.page + 1)], totalPages: 100000 } }));
        const out = await new FinancialService(params, { get } as any).fetchFinancials({ ...window1, transactionTypes: ['Sale'] });
        expect(get).toHaveBeenCalledTimes(200);
        expect(getIncomplete(out)).toMatchObject({ incomplete: true, reason: 'PAGINATION_PAGE_CAP', collected: 200 });
    });

    it('15 gunden uzun aralik pencerelere bolunur (her pencere <= 15 gun)', async () => {
        const get = jest.fn(async () => ({ data: { content: [], totalPages: 1 } }));
        await new FinancialService(params, { get } as any).fetchFinancials({ startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-02-20T00:00:00Z'), transactionTypes: ['Sale'] });
        const calls = get.mock.calls as any[];
        expect(calls.length).toBeGreaterThanOrEqual(4);
        for (const c of calls) expect(c[1].endDate - c[1].startDate).toBeLessThanOrEqual(15 * 24 * 3600 * 1000);
    });

    it('ayni hakedis satiri iki kez gelirse ayni dogal anahtari uretir (yazimda kosullu upsert ile tekillesir)', async () => {
        const get = jest.fn(async () => ({ data: { content: [row(5), row(5)], totalPages: 1 } }));
        const out = await new FinancialService(params, { get } as any).fetchFinancials({ ...window1, transactionTypes: ['Sale'] });
        expect(new Set(out.map(t => `${t.integrationCode}:${t.externalId}`)).size).toBe(1);
    });

    it('barkod ve vade (paymentPeriod) meta altinda tasinir', async () => {
        const get = jest.fn(async () => ({ data: { content: [{ ...row(9), paymentPeriod: 28 }], totalPages: 1 } }));
        const [t] = await new FinancialService(params, { get } as any).fetchFinancials({ ...window1, transactionTypes: ['Sale'] });
        expect(t.meta).toMatchObject({ barcode: 'BC-9', paymentPeriod: 28 });
    });
});

describe('FinancialConnector (COM-03): servis grubu + storeFrontCode', () => {
    it('settlements/otherfinancials/byPaymentId cagrilari finance grubu ve storeFrontCode basligi tasir', async () => {
        const get = jest.fn(async () => ({ data: { content: [] } }));
        const c = new FinancialConnector({ get } as any, params);
        await c.fetchSettlements({ startDate: new Date(0), endDate: new Date(1000), transactionType: 'Sale' });
        await c.fetchOtherFinancials({ startDate: new Date(0), endDate: new Date(1000), transactionType: 'PaymentOrder' });
        await c.fetchSettlementsByPaymentId('42');
        for (const call of get.mock.calls as any[]) {
            expect(call[2]).toMatchObject({ group: 'finance', headers: { storeFrontCode: 'TR' } });
        }
    });
});

describe('Yanit sozlesmesi (F-09): finance.settlements', () => {
    beforeEach(() => { jest.restoreAllMocks(); });
    it('uyumlu yanit true; alan tipi bozulursa false doner ve sayac artar (istek bozulmaz)', () => {
        expect(observeResponseSchema(TRENDYOL_SETTLEMENTS_LIST, { content: [row(1)], totalPages: 1 })).toBe(true);
        const spy = jest.spyOn(metricsRegistry, 'incCounter');
        expect(observeResponseSchema(TRENDYOL_SETTLEMENTS_LIST, { content: [{ ...row(1), commissionRate: '20' }] })).toBe(false);
        expect(spy).toHaveBeenCalledWith('integration_response_schema_mismatch', expect.objectContaining({ integration: 'trendyol', endpoint: 'finance.settlements' }));
    });
    it('connector drift durumunda da veriyi aynen dondurur', async () => {
        const bad = { content: [{ ...row(1), commissionRate: '20' }] };
        const get = jest.fn(async () => ({ data: bad }));
        const out = await new FinancialConnector({ get } as any, params).fetchSettlements({ transactionType: 'Sale' });
        expect(out).toBe(bad);
    });
});
