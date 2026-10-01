/**
 * WP5 (Trendyol V2 uyumu): gönderim ÖNCESİ yerel sözleşme doğrulaması (barcode/title/productMainId/description/KDV/görsel
 * sınırları) + %0 KDV düzeltmesi. Resmi sınırlar: API_CONTRACTS_2026-09-30 §1. Gerçek ağ YOK (yalnız dönüştürücü).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ProductMapper } from '@integration/modules/marketplace/trendyol/transformers/ProductTransformer';
import { PLATFORM_PROCESS } from '@interfaces/index';
import { makeVariant, staged } from '../../helpers/trendyolProductFixtures';

const P = PLATFORM_PROCESS;
const mapping = { catId: 411, brandId: 22, settings: {} as any };
const m = new ProductMapper();
const build = (over: any, mp: any = mapping, mode = P.TRANSFER) => m.toPlatformBatch(staged(makeVariant(over)), mode, [], [], mp);

beforeEach(() => { ProductMapper.clock = () => Date.parse('2026-10-01T00:00:00+03:00'); });
afterEach(() => { ProductMapper.clock = () => Date.now(); });

describe('Trendyol ürün yerel doğrulaması (WP5)', () => {
    it('geçerli varyant hatasız gider', () => {
        expect(() => build({})).not.toThrow();
    });

    it.each([
        ['barcode 41 karakter', { barcode: 'A'.repeat(41) }, /barcode: en fazla 40/],
        ['barcode geçersiz karakter', { barcode: 'AB/12' }, /barcode: yalnızca harf/],
        ['title 101 karakter', { product: { title: 'T'.repeat(101), description: 'x' } }, /title: en fazla 100/],
        ['title boş', { product: { title: '', description: 'x' } }, /title: boş/],
        ['description 30001', { product: { title: 't', description: 'd'.repeat(30001) } }, /description: en fazla 30000/],
        ['maincode 41', { maincode: 'M'.repeat(41) }, /productMainId: en fazla 40/],
        ['maincode boş', { maincode: '' }, /productMainId/],
        ['9 görsel', { images: Array.from({ length: 9 }, (_, i) => `https://cdn.x/${i}.jpg`) }, /images: en fazla 8/],
        ['http görsel', { images: ['http://cdn.x/a.jpg'] }, /HTTPS/],
        ['görsel yok', { images: [] }, /images: en az 1/],
        ['KDV 18', { product: { title: 't', description: 'd', taxPercentage: 18 } }, /vatRate: 0, 1, 10, 20/],
    ])('%s => VALIDATION, alan bazlı mesaj', (_n, over, re) => {
        try { build(over); throw new Error('atmalıydı'); } catch (e: any) {
            expect(e.code).toBe('VALIDATION');
            expect(e.message).toMatch(re);
        }
    });

    it('birden çok ihlal TEK hatada toplanır', () => {
        try { build({ barcode: 'A'.repeat(41), product: { title: 't', description: 'd', taxPercentage: 18 } }); throw new Error('atmalıydı'); } catch (e: any) {
            expect(e.message).toMatch(/barcode:.*vatRate:/);
        }
    });

    it('brandId/categoryId sayısal değilse reddedilir', () => {
        expect(() => build({}, { ...mapping, brandId: 'abc' })).toThrow(/brandId/);
    });

    it('%0 KDV korunur (eskiden || zinciri 0 değerini 20 yapıyordu); tanımsızsa 20', () => {
        expect((build({ product: { title: 't', description: 'd', taxPercentage: 0 } }) as any).vatRate).toBe(0);
        expect((build({ product: { title: 't', description: 'd' } }) as any).vatRate).toBe(20);
    });

    it('onaylı içerik güncellemesinde yalnız mevcut alanlar denetlenir (barkodsuz gövde geçerli)', () => {
        const item: any = build({}, { ...mapping, contentId: 555 }, P.UPDATE);
        expect(item.contentId).toBe(555);
        expect(() => build({ product: { title: 'T'.repeat(101), description: 'd' } }, { ...mapping, contentId: 555 }, P.UPDATE)).toThrow(/title/);
    });

    it('menşe: geçersiz kod reddedilir; 23.10.2026 öncesi eksik olabilir, sonrası VALIDATION', () => {
        expect(() => build({ origin: 'TUR' })).toThrow(/origin/);
        expect((build({ origin: 'tr' }) as any).origin).toBe('TR');
        expect((build({}) as any).origin).toBeUndefined();
        ProductMapper.clock = () => Date.parse('2026-10-23T00:00:01+03:00');
        expect(() => build({})).toThrow(/Menşe/);
        expect((build({}, { ...mapping, settings: { origin: 'TR' } }) as any).origin).toBe('TR');
    });

    it('aynı gün kargo: fastDeliveryType SAME_DAY_SHIPPING -> deliveryOption.deliveryDuration 0 (eski alan gönderilmez)', () => {
        const item: any = build({}, { ...mapping, settings: { fastDeliveryType: 'SAME_DAY_SHIPPING' } });
        expect(item.deliveryOption).toEqual({ deliveryDuration: 0 });
        expect(JSON.stringify(item)).not.toMatch(/fastDeliveryType/);
    });
});
