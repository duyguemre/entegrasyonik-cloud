/**
 * WP9 (faz4-int): Trendyol ürün gönderiminde ÖZELLİK (attribute) yükü. Resmi sözleşme (API_CONTRACTS Trendyol §1, V2):
 * `attributes[{attributeId:int, attributeValueId:int | customAttributeValue:str}]`, onaylı içerik güncellemesinde
 * slicer/varianter DEĞİŞTİRİLEMEZ. Yalnız dönüştürücü; gerçek ağ YOK. Eski (V2-öncesi WP5) davranışlar
 * `Trendyol.product.characterization.test.ts` içinde korunur; burada YENİ kurallar sabitlenir.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ProductMapper } from '@integration/modules/marketplace/trendyol/transformers/ProductTransformer';
import { PLATFORM_PROCESS } from '@interfaces/index';
import { makeVariant, staged } from '../../helpers/trendyolProductFixtures';

const P = PLATFORM_PROCESS;
const mapping = { catId: 411, brandId: 22, settings: {} as any };
const m = new ProductMapper();

const RENK: any = { _id: '47', title: 'Renk', allowCustom: true, required: true, varianter: false, slicer: false, multiple: false, values: [{ id: '2', title: 'Mavi' }, { id: '1', title: 'Kırmızı' }] };
const BEDEN: any = { _id: '338', title: 'Beden', allowCustom: false, required: true, varianter: true, slicer: true, multiple: false, values: [{ id: '7001', title: 'M' }, { id: '7000', title: 'L' }] };
const MATERYAL: any = { _id: '55', title: 'Materyal', allowCustom: false, required: false, varianter: false, slicer: false, multiple: false, values: [{ id: '9', title: 'Pamuk' }] };
const catAttrs = [RENK, BEDEN, MATERYAL];

const withAttrs = (attributes: any, over: any = {}) => {
    const base = makeVariant(over);
    base.platforms.trendyol.attributes = attributes;
    return base;
};
const run = (attributes: any, cats: any[] = catAttrs, mode = P.TRANSFER, mp: any = mapping) =>
    m.toPlatformBatch(staged(withAttrs(attributes)), mode, cats, [], mp);
const errOf = (fn: () => any) => { try { fn(); } catch (e: any) { return e; } throw new Error('VALIDATION bekleniyordu'); };

beforeEach(() => { ProductMapper.clock = () => Date.parse('2026-10-01T00:00:00+03:00'); });
afterEach(() => { ProductMapper.clock = () => Date.now(); });

describe('Trendyol özellik yükü (WP9)', () => {
    it('zorunlu özellik eksik -> VALIDATION, alan bazlı (ad + kimlik), barkod içerir', () => {
        const e = errOf(() => run({ '47': { attributeName: 'Renk', attributeValue: 'Mavi', attributeValueId: '2' } }));
        expect(e.code).toBe('VALIDATION');
        expect(e.message).toMatch(/zorunlu özellik eksik: Beden \(338\)/);
        expect(e.message).toMatch(/BC-001/);
    });

    it('hiç özellik yok + zorunlu var -> tüm eksikler tek mesajda; diğer sözleşme ihlalleriyle BİRLİKTE toplanır', () => {
        const v = withAttrs({}, { maincode: '' });
        const e = errOf(() => m.toPlatformBatch(staged(v), P.TRANSFER, catAttrs, [], mapping));
        expect(e.message).toMatch(/productMainId/);
        expect(e.message).toMatch(/zorunlu özellik eksik: Renk \(47\), Beden \(338\)/);
    });

    it('boş / "undefined" / "null" değer YOK sayılır (zorunluysa eksik raporlanır, sessiz atlanmaz)', () => {
        const e = errOf(() => run({
            '47': { attributeName: 'Renk', attributeValue: 'undefined', attributeValueId: 'undefined' },
            '338': { attributeName: 'Beden', attributeValue: '  ', attributeValueId: 'null' },
        }));
        expect(e.message).toMatch(/zorunlu özellik eksik: Renk \(47\), Beden \(338\)/);
    });

    it('kategoride olmayan (bayat: kategori değişti) özellik GÖNDERİLMEZ', () => {
        const item = run({
            '47': { attributeValue: 'Mavi', attributeValueId: '2' },
            '338': { attributeValue: 'M', attributeValueId: '7001' },
            '999': { attributeValue: 'Eski kategori', attributeValueId: '1' },
        });
        expect(item.attributes.map((a: any) => a.attributeId).sort()).toEqual([338, 47]);
    });

    it('allowCustom özellikte listeden seçilmiş GEÇERLİ kimlik kimlikle gider (customAttributeValue değil)', () => {
        const item = run({ '47': { attributeValue: 'Mavi', attributeValueId: '2' }, '338': { attributeValue: 'M', attributeValueId: '7001' } });
        expect(item.attributes).toContainEqual({ attributeId: 47, attributeValueId: 2 });
    });

    it('allowCustom özellikte kimliksiz metin serbest metin (customAttributeValue) olarak gider', () => {
        const item = run({ '47': { attributeValue: 'Lila Grisi', attributeValueId: 'undefined' }, '338': { attributeValue: 'M', attributeValueId: '7001' } });
        expect(item.attributes).toContainEqual({ attributeId: 47, customAttributeValue: 'Lila Grisi' });
    });

    it('allowCustom özellikte metin listedeki bir değerle (TR, büyük/küçük harf duyarsız) eşleşirse kimliğe çevrilir', () => {
        const item = run({ '47': { attributeValue: 'kırmızı' }, '338': { attributeValue: 'M', attributeValueId: '7001' } });
        expect(item.attributes).toContainEqual({ attributeId: 47, attributeValueId: 1 });
    });

    it('bayat değer kimliği (listede yok) + metin listedeki değerle eşleşiyorsa güncel kimliğe çevrilir', () => {
        const item = run({ '47': { attributeValue: 'Mavi', attributeValueId: '2' }, '338': { attributeValue: 'L', attributeValueId: '1234' } });
        expect(item.attributes).toContainEqual({ attributeId: 338, attributeValueId: 7000 });
    });

    it('bayat kimlik + listede olmayan metin + allowCustom DEĞİL -> alan bazlı VALIDATION (custom\'a sessiz düşme YOK)', () => {
        const e = errOf(() => run({ '47': { attributeValue: 'Mavi', attributeValueId: '2' }, '338': { attributeValue: 'XXL', attributeValueId: '1234' } }));
        expect(e.code).toBe('VALIDATION');
        expect(e.message).toMatch(/Beden \(338\): 'XXL' değeri Trendyol değer listesinde yok/);
    });

    it('bayat kimlik + allowCustom -> serbest metne düşer (Renk)', () => {
        const item = run({ '47': { attributeValue: 'Bordo', attributeValueId: '9999' }, '338': { attributeValue: 'M', attributeValueId: '7001' } });
        expect(item.attributes).toContainEqual({ attributeId: 47, customAttributeValue: 'Bordo' });
    });

    it('sayısal olmayan özellik kimliği NaN göndermek yerine VALIDATION üretir', () => {
        const e = errOf(() => run({ abc: { attributeValue: 'x' }, '47': { attributeValue: 'Mavi', attributeValueId: '2' }, '338': { attributeValue: 'M', attributeValueId: '7001' } }));
        expect(e.message).toMatch(/özellik kimliği geçersiz: 'abc'/);
    });

    it('zorunlu olmayan özellik eksikse hata YOK', () => {
        const item = run({ '47': { attributeValue: 'Mavi', attributeValueId: '2' }, '338': { attributeValue: 'M', attributeValueId: '7001' } });
        expect(item.attributes.some((a: any) => a.attributeId === 55)).toBe(false);
    });

    it('kategori özellikleri yüklenemediyse (boş liste) eski davranış: doğrulama/eleme yapılmaz', () => {
        const item = run({ '47': { attributeValue: 'Lila', attributeValueId: 'undefined' }, '338': { attributeValue: 'M', attributeValueId: '7001' } }, []);
        expect(item.attributes).toEqual([{ attributeId: 47, customAttributeValue: 'Lila' }, { attributeId: 338, attributeValueId: 7001 }]);
    });

    it('onaylı içerik güncellemesi: slicer/varianter hariç; zorunluluk yalnız gönderilen öznitelik varsa ve varianter/slicer dışında aranır', () => {
        const cats = [RENK, BEDEN, { ...MATERYAL, required: true }];
        const ok = m.toPlatformBatch(staged(withAttrs({ '47': { attributeValue: 'Mavi', attributeValueId: '2' }, '55': { attributeValue: 'Pamuk', attributeValueId: '9' }, '338': { attributeValue: 'M', attributeValueId: '7001' } })), P.UPDATE, cats, [], { ...mapping, contentId: 5551 });
        expect(ok.attributes).toEqual([{ attributeId: 47, attributeValueId: 2 }, { attributeId: 55, attributeValueId: 9 }]);
        const e = errOf(() => m.toPlatformBatch(staged(withAttrs({ '47': { attributeValue: 'Mavi', attributeValueId: '2' } })), P.UPDATE, cats, [], { ...mapping, contentId: 5551 }));
        expect(e.message).toMatch(/zorunlu özellik eksik: Materyal \(55\)/);
        expect(e.message).not.toMatch(/Beden/);
    });

    it('onaylı içerik güncellemesinde gönderilecek öznitelik yoksa attributes hiç gönderilmez ve zorunluluk aranmaz', () => {
        const item = m.toPlatformBatch(staged(withAttrs({})), P.UPDATE, catAttrs, [], { ...mapping, contentId: 5551 });
        expect(item.attributes).toBeUndefined();
    });
});
