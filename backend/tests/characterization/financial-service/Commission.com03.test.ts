/**
 * COM-03 / COM-07 okuma tarafi: komisyon kaynagi cozumleme (override > gerceklesen > tahmini > bilinmiyor), hakedis ozeti,
 * kategori basina son 90 gun ortalama gerceklesen oran, FinancialService RPC dogrulamasi. DB/ag YOK (mock clientDB, sentetik veri).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { resolveCommission, summarizeActual, averageRateByCategory, tenantOverrideRate } from '@operations/finance/commissionSummary';
import { getOrderCommissionSummary, getCommissionByBarcodes, getRealizedCommissionByCategory, codeVariants } from '@operations/finance/commissionQueries';
import FinancialService from '@api/services/financial-service';

const sale = (o: any = {}) => ({ transactionType: 'SALE', commissionRate: 20, commissionAmount: 20, sellerRevenue: 80, orderNumber: '555', paymentOrderId: '42', payoutDate: new Date('2026-02-04T00:00:00Z'), meta: { barcode: 'BC-1', paymentPeriod: 28 }, ...o });

describe('resolveCommission oncelik zinciri', () => {
    const actual = summarizeActual([sale()])!;
    it('override > gerceklesen > tahmini > bilinmiyor', () => {
        expect(resolveCommission({ overrideRate: 10, actual, estimatedRate: 25 })).toMatchObject({ source: 'override', rate: 10 });
        expect(resolveCommission({ actual, estimatedRate: 25 })).toMatchObject({ source: 'actual', rate: 20 });
        expect(resolveCommission({ estimatedRate: 25 })).toMatchObject({ source: 'estimated', rate: 25, actual: null });
        expect(resolveCommission({})).toEqual({ source: 'unknown', rate: null, actual: null });
    });
    it('gercek %0 (kampanya) korunur; bilinmeyen %0 sayilmaz', () => {
        expect(resolveCommission({ estimatedRate: 0 })).toMatchObject({ source: 'estimated', rate: 0 });
        expect(resolveCommission({ estimatedRate: null }).rate).toBeNull();
    });
    it('override satiri yoksa null (COM-04 ayrintisi: Commission.com04.test.ts)', () => { expect(tenantOverrideRate([], {})).toBeNull(); });
});

describe('summarizeActual', () => {
    it('SALE toplami + iade komisyonu + en gec hakedis tarihi/odeme emri/vade', () => {
        const a = summarizeActual([sale(), sale({ commissionAmount: 10, sellerRevenue: 40, payoutDate: new Date('2026-02-11T00:00:00Z'), paymentOrderId: '43' }), { transactionType: 'RETURN', commissionAmount: -5, meta: { barcode: 'BC-1' } }])!;
        expect(a).toMatchObject({ rate: 20, amount: 30, sellerRevenue: 120, returnedAmount: 5, lineCount: 2, paymentOrderId: '43', paymentPeriod: 28 });
        expect(a.payoutDate).toEqual(new Date('2026-02-11T00:00:00Z'));
    });
    it('oran verisi olmayan / yalniz iade satirlari -> null', () => {
        expect(summarizeActual([])).toBeNull();
        expect(summarizeActual([{ transactionType: 'RETURN', commissionRate: 20 }])).toBeNull();
        expect(summarizeActual([sale({ commissionRate: undefined })])).toBeNull();
    });
});

describe('averageRateByCategory (son 90 gun fixture)', () => {
    it('kategori basina satir-agirlikli ortalama; kategorisiz barkodlar null altinda', () => {
        const out = averageRateByCategory(
            [{ barcode: 'A', rateSum: 40, count: 2 }, { barcode: 'B', rateSum: 30, count: 1 }, { barcode: 'C', rateSum: 10, count: 1 }],
            new Map([['A', 'cat1'], ['B', 'cat1']]),
        );
        expect(out).toEqual([{ categoryId: 'cat1', avgRate: 23.33, sampleCount: 3 }, { categoryId: null, avgRate: 10, sampleCount: 1 }]);
    });
});

function chain(result: any) {
    const c: any = { limit: jest.fn(() => c), lean: jest.fn(async () => result) };
    return c;
}
function fakeDb(o: { fin?: any[]; order?: any; variants?: any[]; products?: any[]; agg?: any[]; cats?: any[]; attrMaps?: any[]; overrides?: any[] }) {
    return {
        getFinancialTransactionModel: () => ({ find: jest.fn(() => chain(o.fin ?? [])), aggregate: jest.fn(async () => o.agg ?? []) }),
        getOrderModel: () => ({ findOne: jest.fn(() => ({ lean: async () => o.order ?? null })) }),
        getVariantModel: () => ({ find: jest.fn(() => ({ lean: async () => o.variants ?? [] })) }),
        getProductModel: () => ({ find: jest.fn(() => ({ lean: async () => o.products ?? [] })) }),
        getCategoryModel: () => ({ find: jest.fn(() => ({ lean: async () => o.cats ?? [] })) }),
        getAttributeMappingModel: () => ({ find: jest.fn(() => ({ lean: async () => o.attrMaps ?? [] })) }),
        getCommissionOverrideModel: () => ({ find: jest.fn(() => chain(o.overrides ?? [])) }),
    };
}

describe('getOrderCommissionSummary', () => {
    const order = { items: [{ barcode: 'BC-1', sku: 'S1', productName: 'A', quantity: 1 }, { barcode: 'BC-2', sku: 'S2', productName: 'B', quantity: 2 }, { sku: 'S3', productName: 'barkodsuz' }] };
    it('kalem basina kaynak: gerceklesen (BC-1), tahmini (BC-2: kategori -> AttributeMappings -> kanal tablosu), bilinmiyor (barkodsuz)', async () => {
        const db = fakeDb({
            fin: [sale(), sale({ meta: { barcode: 'BC-ORPHAN' } })],
            order,
            variants: [{ barcode: 'BC-2', productId: 'p2' }],
            products: [{ _id: 'p2', category: 'L2' }],
            attrMaps: [{ integrationCode: 'trendyol', isCategoryMapping: true, localCategoryId: 'L2', platformCategoryId: '368' }],
        });
        const r: any = await getOrderCommissionSummary(db, 'c-com03-a', { orderNumber: '555', integrationCode: 'trendyol' });
        expect(r.orderFound).toBe(true);
        expect(r.items[0].commission).toMatchObject({ source: 'actual', rate: 20, actual: { amount: 20, sellerRevenue: 80, paymentOrderId: '42', paymentPeriod: 28 } });
        expect(r.items[1].commission).toMatchObject({ source: 'estimated', rate: 25, actual: null, categoryId: 'L2' });
        expect(r.items[2].commission).toMatchObject({ source: 'unknown', rate: null });
        expect(r.unmatchedSettlementRows).toBe(1);
    });
    it('siparis yoksa orderFound=false ve bos kalem listesi', async () => {
        const r: any = await getOrderCommissionSummary(fakeDb({}), 'c-com03-b', { orderNumber: 'X', integrationCode: 'trendyol' });
        expect(r).toMatchObject({ orderFound: false, items: [], unmatchedSettlementRows: 0 });
    });
    it('Financial ve Order entegrasyon kodu yazim farki (TRENDYOL/trendyol) sorguda birlikte aranir', () => {
        expect(codeVariants('trendyol').sort()).toEqual(['TRENDYOL', 'trendyol']);
    });
});

describe('getCommissionByBarcodes', () => {
    it('gerceklesen yoksa tahmini, o da yoksa bilinmiyor; bos liste guvenli', async () => {
        const db = fakeDb({ fin: [sale()], variants: [{ barcode: 'BC-2', productId: 'p2' }], products: [{ _id: 'p2', category: 'L2' }], attrMaps: [{ integrationCode: 'trendyol', isCategoryMapping: true, localCategoryId: 'L2', platformCategoryId: '368' }] });
        const r: any = await getCommissionByBarcodes(db, 'c-com03-c', { integrationCode: 'trendyol', barcodes: ['BC-1', 'BC-2', 'BC-3'] });
        expect(r.items.map((i: any) => i.commission.source)).toEqual(['actual', 'estimated', 'unknown']);
        expect(r.days).toBe(90);
        expect(((await getCommissionByBarcodes(db, 'c-com03-c', { integrationCode: 'trendyol', barcodes: [] })) as any).items).toEqual([]);
    });
    it('days ust siniri 180', async () => {
        expect(((await getCommissionByBarcodes(fakeDb({}), 'c', { integrationCode: 'trendyol', barcodes: ['x'], days: 9999 })) as any).days).toBe(180);
    });
});

describe('getRealizedCommissionByCategory (son 90 gun, kategori basina)', () => {
    it('barkod agregasyonu -> kategori ortalamasi + baslik', async () => {
        const db = fakeDb({
            agg: [{ _id: 'A', rateSum: 40, count: 2 }, { _id: 'B', rateSum: 30, count: 1 }, { _id: 'Z', rateSum: 10, count: 1 }],
            variants: [{ barcode: 'A', productId: 'p1' }, { barcode: 'B', productId: 'p1' }],
            products: [{ _id: 'p1', category: 'cat1' }],
            cats: [{ _id: 'cat1', title: 'Giyim' }],
        });
        const r = await getRealizedCommissionByCategory(db, { integrationCode: 'trendyol' });
        expect(r.days).toBe(90);
        expect(r.categories).toEqual([
            { categoryId: 'cat1', avgRate: 23.33, sampleCount: 3, title: 'Giyim' },
            { categoryId: null, avgRate: 10, sampleCount: 1, title: null },
        ]);
    });
});

describe('FinancialService komisyon RPC girdi dogrulamasi', () => {
    const svc = (req: any) => { const s: any = new FinancialService(1, req); s.clientDB = fakeDb({}); return s; };
    it('orderNumber skaler olmali (nesne/operator reddedilir)', async () => {
        await expect(svc({ orderNumber: { $ne: null } }).getOrderCommissionSummary()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc({}).getOrderCommissionSummary()).rejects.toMatchObject({ statusCode: 400 });
    });
    it('barcodes dizi olmali; elemanlar skaler', async () => {
        await expect(svc({ barcodes: 'x' }).getCommissionByBarcodes()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc({ barcodes: [{ a: 1 }] }).getCommissionByBarcodes()).rejects.toMatchObject({ statusCode: 400 });
    });
    it('gecerli istek varsayilan trendyol ile calisir', async () => {
        const r = await svc({ orderNumber: '555' }).getOrderCommissionSummary();
        expect(r).toMatchObject({ orderNumber: '555', integrationCode: 'trendyol', orderFound: false });
        expect((await svc({}).getRealizedCommissionByCategory()).categories).toEqual([]);
    });
});
