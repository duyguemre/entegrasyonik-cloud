// [eslesme-fiyat WP5, Ek B P1-5, D-PRICE-1/2] Fiyat ve KDV sunucu doğrulaması (zod): negatif/NaN/Infinity/metin reddedilir, 2 ondalığa
// yuvarlanır, KDV {0,1,10,20} ya da boş. Eskiden `batchForm.prices = z.record(unknown)` ve varyant fiyatı passthrough'tu.
import { describe, it, expect } from '@jest/globals';
import { RPC_INPUT_SCHEMAS } from '../../../src/capabilities/rpc-input';
import { money, vatRate, MONEY_MAX } from '../../../src/capabilities/rpc-input/catalog';

const oid = 'a'.repeat(24);
const parse = (rpc: string, body: unknown) => RPC_INPUT_SCHEMAS[rpc as keyof typeof RPC_INPUT_SCHEMAS]!.safeParse(body);

describe('money', () => {
    it.each([[12.5, 12.5], ['12.5', 12.5], [0, 0], [1.005, 1.01], [99.999, 100], [MONEY_MAX, MONEY_MAX]])('%p → %p', (inp, out) => {
        const r = money.safeParse(inp);
        expect(r.success && r.data).toBe(out);
    });
    it.each([[-1], [NaN], [Infinity], ['12,5'], ['abc'], [MONEY_MAX + 1], [null], [{}]])('%p reddedilir', (inp) => {
        expect(money.safeParse(inp).success).toBe(false);
    });
});

describe('vatRate', () => {
    it.each([[0, 0], [1, 1], [10, 10], [20, 20], ['20', 20], ['', null], [null, null], [undefined, undefined]])('%p → %p', (inp, out) => {
        const r = vatRate.safeParse(inp);
        expect(r.success).toBe(true);
        expect((r as any).data).toBe(out);
    });
    it.each([[18], [8], ['18'], [-1], ['abc']])('%p reddedilir (eski %18/%8 dahil)', (inp) => expect(vatRate.safeParse(inp).success).toBe(false));
});

describe('RPC gövdeleri', () => {
    it('varyant ana ve kanal fiyatı doğrulanır, yuvarlanır; boş dize = değer yok', () => {
        const r: any = parse('VariantService/updateVariants', { productId: oid, variants: [{ _id: oid, prices: { isPlatformBasedPrice: true, salePrice: '10.555', marketPrice: '' }, platforms: { trendyol: { prices: { salePrice: 9.999 }, attributes: { a: 1 } } } }] });
        expect(r.success).toBe(true);
        expect(r.data.variants[0].prices).toMatchObject({ salePrice: 10.56, marketPrice: null });
        expect(r.data.variants[0].platforms.trendyol.prices.salePrice).toBe(10);
        expect(r.data.variants[0].platforms.trendyol.attributes).toEqual({ a: 1 }); // diğer alanlar korunur
        expect(parse('VariantService/updateVariants', { productId: oid, variants: [{ _id: oid, prices: { salePrice: -5 } }] }).success).toBe(false);
        expect(parse('VariantService/updateVariants', { productId: oid, variants: [{ _id: oid, platforms: { n11: { prices: { salePrice: 'NaN' } } } }] }).success).toBe(false);
        expect(parse('VariantService/updateVariants', { productId: oid, variants: [{ _id: oid, platforms: { $where: {} } }] }).success).toBe(false);
    });

    it('ürün KDV {0,1,10,20}/null; eski 18 reddedilir', () => {
        const base = { _id: oid, title: 'T', variants: [] as any[] };
        expect(parse('ProductService/updateProduct', { productInfo: { ...base, taxPercentage: 0 } }).success).toBe(true);
        expect(parse('ProductService/updateProduct', { productInfo: { ...base, taxPercentage: null } }).success).toBe(true);
        expect(parse('ProductService/updateProduct', { productInfo: { ...base } }).success).toBe(true);
        expect(parse('ProductService/updateProduct', { productInfo: { ...base, taxPercentage: 18 } }).success).toBe(false);
    });

    it('toplu fiyat: ana alanlar sayı/bayrak, kanal kodu {salePrice, marketPrice}; yanlış tür reddedilir', () => {
        const ok: any = parse('VariantService/batchProcessUpdate', { productId: oid, scope: 2, batchProcessForm: { prices: { salePrice: '100.004', isPlatformBasedPrice: true, trendyol: { salePrice: 90 } } } });
        expect(ok.success).toBe(true);
        expect(ok.data.batchProcessForm.prices).toEqual({ salePrice: 100, isPlatformBasedPrice: true, trendyol: { salePrice: 90 } });
        expect(parse('VariantService/batchProcessUpdate', { productId: oid, scope: 2, batchProcessForm: { prices: { salePrice: -1 } } }).success).toBe(false);
        expect(parse('VariantService/batchProcessUpdate', { productId: oid, scope: 2, batchProcessForm: { prices: { salePrice: true } } }).success).toBe(false);
        expect(parse('VariantService/batchProcessUpdate', { productId: oid, scope: 2, batchProcessForm: { prices: { trendyol: 5 } } }).success).toBe(false);
        expect(parse('VariantService/batchProcessUpdate', { productId: oid, scope: 2, batchProcessForm: { prices: { trendyol: { salePrice: 'x' } } } }).success).toBe(false);
    });
});
