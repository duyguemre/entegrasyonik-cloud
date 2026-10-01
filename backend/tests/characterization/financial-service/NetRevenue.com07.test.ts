/**
 * COM-07: kalemli kesinti modeli + net gelir (saf hesap), kesinti kurali ayarlari (katalog varsayilanlari), siparis/onizleme RPC'leri.
 * DB/ag YOK (mock clientDB, sentetik veri). Bilinmeyen bilesen 0 sayilmaz; yuvarlama tek noktada (yarim-yukari).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { computeNetRevenue, roundMoney } from '@operations/finance/netRevenue';
import { getOrderCommissionSummary, getNetRevenuePreview } from '@operations/finance/commissionQueries';
import { resolveDeductionRules } from '@integration/config/financeDeductionRules';
import { getSettingDef } from '@integration/config/catalog';
import FinancialService from '@api/rpc/handlers/financial-service';

const ALL = { commissionVatRate: 20, serviceFeeFixed: 5, serviceFeeRate: 1, shippingContribution: 10, withholdingRate: 1 };

describe('roundMoney (2 ondalik, yarim-yukari)', () => {
    it('kayan nokta tuzagi ve yarim kurus: 1.005 -> 1.01, 2.675 -> 2.68, -1.005 -> -1.01', () => {
        expect(roundMoney(1.005)).toBe(1.01);
        expect(roundMoney(2.675)).toBe(2.68);
        expect(roundMoney(-1.005)).toBe(-1.01);
        expect(roundMoney(0.125)).toBe(0.13); // bankaci yuvarlamasi 0.12 verirdi
        expect(roundMoney(10)).toBe(10);
    });
});

describe('computeNetRevenue - tum bilesenler bilinen (kalemli net)', () => {
    const r = computeNetRevenue({ grossPrice: 120, vatRate: 20, commission: { rate: 20, source: 'estimated' }, deductions: ALL });
    it('bilesenler: komisyon 24, komisyona KDV 4.8, hizmet 5+1.2, kargo 10, stopaj (100 x %1) 1', () => {
        expect(r).toMatchObject({ gross: 120, commissionAmount: 24, commissionVat: 4.8, serviceFee: 6.2, shipping: 10, withholding: 1 });
        expect(r.components.map(c => c.kind)).toEqual(['commission', 'commissionVat', 'serviceFee', 'shipping', 'withholding']);
        expect(r.components.every(c => c.source === 'rule')).toBe(true);
    });
    it('net = brut - bilesen toplami (tam); tahmini komisyon -> confidence estimated', () => {
        expect(r.net).toBe(74);
        expect(r.confidence).toBe('estimated');
        expect(r.missing).toEqual([]);
    });
    it('override orani -> bilesen kaynagi override, guven yine estimated', () => {
        const o = computeNetRevenue({ grossPrice: 120, vatRate: 20, commission: { rate: 10, source: 'override' }, deductions: ALL });
        expect(o.components[0]).toEqual({ kind: 'commission', amount: 12, source: 'override' });
        expect(o.confidence).toBe('estimated');
    });
});

describe('computeNetRevenue - bilinmeyen bilesen 0 SAYILMAZ', () => {
    it('kural yok: komisyon bilinir, digerleri unknown -> partial; net yalniz bilinenleri dusurur', () => {
        const r = computeNetRevenue({ grossPrice: 100, commission: { rate: 15, source: 'estimated' }, deductions: {} });
        expect(r.confidence).toBe('partial');
        expect(r.net).toBe(85);
        expect(r.missing).toEqual(['commissionVat', 'serviceFee', 'shipping', 'withholding']);
        expect(r.commissionVat).toBeNull();
        expect(r.components.filter(c => c.source === 'unknown').map(c => c.amount)).toEqual([null, null, null, null]);
    });
    it('stopaj: KDV orani yoksa matrah bilinmez -> unknown (gercek %0 KDV ile karistirilmaz)', () => {
        const noVat = computeNetRevenue({ grossPrice: 100, commission: { rate: 10, source: 'estimated' }, deductions: { withholdingRate: 1 } });
        expect(noVat.withholding).toBeNull();
        const zeroVat = computeNetRevenue({ grossPrice: 100, vatRate: 0, commission: { rate: 10, source: 'estimated' }, deductions: { withholdingRate: 1 } });
        expect(zeroVat.withholding).toBe(1);
    });
    it('hizmet bedeli: yalniz sabit veya yalniz oran verilmis olsa da bilinir', () => {
        const a = computeNetRevenue({ grossPrice: 100, commission: { rate: 10, source: 'estimated' }, deductions: { serviceFeeFixed: 3 } });
        const b = computeNetRevenue({ grossPrice: 100, commission: { rate: 10, source: 'estimated' }, deductions: { serviceFeeRate: 2 } });
        expect([a.serviceFee, b.serviceFee]).toEqual([3, 2]);
    });
    it('komisyon bilinmiyor: net null, confidence unknown (yanilticli net uretilmez)', () => {
        const r = computeNetRevenue({ grossPrice: 100, commission: { rate: null, source: 'unknown' }, deductions: ALL });
        expect(r).toMatchObject({ net: null, confidence: 'unknown', commissionAmount: null, commissionVat: null });
        expect(r.components[0]).toEqual({ kind: 'commission', amount: null, source: 'unknown' });
    });
    it('gercek %0 komisyon (kampanya) korunur ve bilinir', () => {
        const r = computeNetRevenue({ grossPrice: 100, commission: { rate: 0, source: 'estimated' }, deductions: { commissionVatRate: 20 } });
        expect(r.commissionAmount).toBe(0);
        expect(r.commissionVat).toBe(0);
    });
    it('gecersiz brut: hepsi unknown', () => {
        expect(computeNetRevenue({ grossPrice: NaN, commission: { rate: 10, source: 'estimated' } })).toMatchObject({ gross: null, net: null, confidence: 'unknown' });
        expect(computeNetRevenue({ grossPrice: -1, commission: { rate: 10, source: 'estimated' } }).net).toBeNull();
    });
});

describe('computeNetRevenue - gerceklesen vs tahmini + yuvarlama', () => {
    it('gerceklesen hakedis (komisyon tutari) + tum kurallar bilinen -> confidence actual; komisyon gerceklesenden', () => {
        const r = computeNetRevenue({ grossPrice: 120, vatRate: 20, commission: { rate: 20, source: 'actual' }, deductions: ALL, settled: { commissionAmount: 22.5, sellerRevenue: 97.5 } });
        expect(r.commissionAmount).toBe(22.5);
        expect(r.components[0].source).toBe('actual');
        expect(r.confidence).toBe('actual');
        expect(r.reportedSellerRevenue).toBe(97.5);
    });
    it('gerceklesen komisyon ama eksik bilesen varsa partial (actual iddia edilmez)', () => {
        const r = computeNetRevenue({ grossPrice: 120, commission: { rate: 20, source: 'actual' }, deductions: {}, settled: { commissionAmount: -22.5 } });
        expect(r.confidence).toBe('partial');
        expect(r.commissionAmount).toBe(22.5); // isaret pazaryerine bagli: mutlak deger
        expect(r.net).toBe(97.5);
    });
    it('bilesenler ayri ayri yuvarlanir ve toplam brute TAM tutar (kurus kaymasi yok)', () => {
        const r = computeNetRevenue({ grossPrice: 99.99, vatRate: 20, commission: { rate: 17.33, source: 'estimated' }, deductions: { commissionVatRate: 20, serviceFeeRate: 0.67, withholdingRate: 1, shippingContribution: 0 } });
        const sum = (r.commissionAmount ?? 0) + (r.commissionVat ?? 0) + (r.serviceFee ?? 0) + (r.shipping ?? 0) + (r.withholding ?? 0) + (r.net ?? 0);
        expect(Math.round(sum * 100)).toBe(9999);
        expect(r.commissionAmount).toBe(17.33); // 99.99 x 0.1733 = 17.3283... -> 17.33
    });
});

describe('kesinti kurali ayarlari (ADR-0020 katalog)', () => {
    it('5 anahtar kayitli, entegrasyon kapsamli, TR/EN aciklama kaynak belgeye atif yapar', () => {
        for (const k of ['commissionVatRate', 'withholdingRate', 'serviceFeeFixed', 'serviceFeeRate', 'shippingContribution']) {
            const d = getSettingDef(`finance.${k}`)!;
            expect(d.scope).toBe('integration');
            expect(d.help.tr).toContain('MARKETPLACE_COMMISSIONS_2026-09-30.md');
            expect(d.help.en).toContain('MARKETPLACE_COMMISSIONS_2026-09-30.md');
        }
    });
    it('varsayilanlar: stopaj %1 tum kanallar; komisyona KDV yalniz HB %20; digerleri null (bilinmiyor)', () => {
        expect(resolveDeductionRules('trendyol')).toEqual({ commissionVatRate: null, withholdingRate: 1, serviceFeeFixed: null, serviceFeeRate: null, shippingContribution: null });
        expect(resolveDeductionRules('HEPSIBURADA')).toMatchObject({ commissionVatRate: 20, withholdingRate: 1 });
        expect(resolveDeductionRules('n11').commissionVatRate).toBeNull();
        expect(resolveDeductionRules('pazarama').serviceFeeRate).toBeNull();
    });
    it('semalar null kabul eder, aralik disini reddeder', () => {
        const s = getSettingDef('finance.withholdingRate')!.schema;
        expect(s.safeParse(null).success).toBe(true);
        expect(s.safeParse(101).success).toBe(false);
        expect(s.safeParse(-1).success).toBe(false);
    });
});

const lean = (v: any) => { const c: any = { limit: jest.fn(() => c), lean: jest.fn(async () => v) }; return c; };
function fakeDb(o: { fin?: any[]; order?: any; variants?: any[]; products?: any[]; attrMaps?: any[] }) {
    return {
        getFinancialTransactionModel: () => ({ find: jest.fn(() => lean(o.fin ?? [])) }),
        getOrderModel: () => ({ findOne: jest.fn(() => ({ lean: async () => o.order ?? null })) }),
        getVariantModel: () => ({ find: jest.fn(() => ({ lean: async () => o.variants ?? [] })) }),
        getProductModel: () => ({ find: jest.fn(() => ({ lean: async () => o.products ?? [] })) }),
        getCategoryModel: () => ({ find: jest.fn(() => ({ lean: async () => [] })) }),
        getAttributeMappingModel: () => ({ find: jest.fn(() => ({ lean: async () => o.attrMaps ?? [] })) }),
        getCommissionOverrideModel: () => ({ find: jest.fn(() => lean([])) }),
    } as any;
}

describe('getOrderCommissionSummary net blogu', () => {
    it('gerceklesen hakedis -> komisyon gerceklesenden; hakedis yoksa bilinmiyor -> net null; kalem tutari totalPrice', async () => {
        const db = fakeDb({
            fin: [{ transactionType: 'SALE', commissionRate: 20, commissionAmount: 20, sellerRevenue: 80, orderNumber: '1', meta: { barcode: 'A' } }],
            order: { items: [{ barcode: 'A', quantity: 1, totalPrice: 100, taxRate: 20 }, { barcode: 'B', quantity: 2, totalPrice: 50, taxRate: 10 }] },
        });
        const r: any = await getOrderCommissionSummary(db, 'c-com07-a', { orderNumber: '1', integrationCode: 'trendyol' });
        expect(r.items[0].net).toMatchObject({ gross: 100, commissionAmount: 20, withholding: 0.83, confidence: 'partial', reportedSellerRevenue: 80 });
        expect(r.items[0].net.components[0].source).toBe('actual');
        expect(r.items[1].net).toMatchObject({ gross: 50, net: null, confidence: 'unknown' });
    });
});

describe('getNetRevenuePreview', () => {
    const variants = [
        { _id: '507f1f77bcf86cd799439011', barcode: 'V1', productId: 'p1', prices: { salePrice: 200, isPlatformBasedPrice: false } },
        { _id: '507f1f77bcf86cd799439012', barcode: 'V2', productId: 'p2', prices: { salePrice: 1, isPlatformBasedPrice: true }, platforms: { trendyol: { prices: { salePrice: 300 } } } },
    ];
    const db = () => fakeDb({
        variants, products: [{ _id: 'p1', category: 'L1', taxPercentage: 20 }, { _id: 'p2', category: 'L2', taxPercentage: 0 }],
        attrMaps: [{ integrationCode: 'trendyol', isCategoryMapping: true, localCategoryId: 'L1', platformCategoryId: '368' }],
    });
    it('grossPrice verilmezse varyant fiyati (kanal bazli fiyat dahil); verilirse onun uzerinden; tahmini oran etiketi korunur', async () => {
        const r: any = await getNetRevenuePreview(db(), 'c-com07-b', { items: [
            { barcode: 'V1', integrationCode: 'trendyol' },
            { variantId: '507f1f77bcf86cd799439012', integrationCode: 'trendyol' },
            { barcode: 'V1', grossPrice: 100, integrationCode: 'trendyol' },
            { barcode: 'YOK', integrationCode: 'trendyol' },
        ] });
        expect(r.items[0]).toMatchObject({ barcode: 'V1', variantFound: true, grossSource: 'variant', vatRate: 20, commission: { source: 'estimated', rate: 25 } });
        expect(r.items[0].net).toMatchObject({ gross: 200, commissionAmount: 50, withholding: 1.67, net: 148.33, confidence: 'partial' });
        expect(r.items[1]).toMatchObject({ barcode: 'V2', grossSource: 'variant', vatRate: null });
        expect(r.items[1].net.gross).toBe(300);
        expect(r.items[1].net.withholding).toBeNull(); // taxPercentage 0 = ayarsiz -> matrah bilinmiyor
        expect(r.items[2]).toMatchObject({ grossSource: 'input' });
        expect(r.items[2].net.gross).toBe(100);
        expect(r.items[3]).toMatchObject({ variantFound: false, grossSource: 'unknown' });
        expect(r.items[3].net).toMatchObject({ gross: null, net: null, confidence: 'unknown' });
    });
});

describe('FinancialService/getNetRevenuePreview dogrulama', () => {
    const svc = (req: any) => { const s: any = new (FinancialService as any)(); s.request = req; s.clientDB = fakeDb({}); s.clientId = 'c'; return s as FinancialService; };
    it('items dizi degilse / >200 / kimliksiz / negatif fiyat -> 400', async () => {
        await expect(svc({ items: 'x' }).getNetRevenuePreview()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc({ items: Array.from({ length: 201 }, () => ({ barcode: 'a', integrationCode: 'trendyol' })) }).getNetRevenuePreview()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc({ items: [{ integrationCode: 'trendyol' }] }).getNetRevenuePreview()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc({ items: [{ barcode: 'a', grossPrice: -5, integrationCode: 'trendyol' }] }).getNetRevenuePreview()).rejects.toMatchObject({ statusCode: 400 });
    });
    it('gecerli istek sonuc dondurur', async () => {
        const r: any = await svc({ items: [{ barcode: 'a', grossPrice: 100, integrationCode: 'trendyol' }] }).getNetRevenuePreview();
        expect(r.items).toHaveLength(1);
        expect(r.items[0].net.confidence).toBe('unknown');
    });
});
