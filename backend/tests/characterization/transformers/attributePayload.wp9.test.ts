/**
 * WP9 (faz4-int): özellik (attribute) yükü — ortak normalizasyon yardımcıları + Hepsiburada / Pazarama / Ideasoft dönüştürücülerinin
 * özellik kısımları. Bu üç platformun sözleşmesi resmi kaynaktan DOĞRULANAMADI (API_CONTRACTS §2,4,5); testler yalnızca
 * DEĞİŞEN güvenlik davranışlarını (boş değer gönderme, nesnenin kendisini kimlik diye gönderme, zorunlu eksik) sabitler.
 */
import { describe, it, expect } from '@jest/globals';
import { normalizeAttrValue, cleanScalar, missingRequiredAttributes, findValueByText } from '@integration/catalog/attributePayload';
import { ProductMapper as HbMapper } from '@integration/modules/marketplace/hepsiburada/transformers/ProductTransformer';
import { ProductMapper as PazMapper } from '@integration/modules/marketplace/pazarama/transformers/ProductTransformer';
import { ProductTransformer as IdeaMapper } from '@integration/modules/ecommerce/ideasoft/transformers/ProductTransformer';
import { PLATFORM_PROCESS } from '@interfaces/index';

const variantFor = (code: string, attributes: any) => ({
    _id: 'v1', barcode: '1234567890123', stockcode: 'SKU', maincode: 'M', stock: 3, images: ['https://x/1.jpg'],
    prices: { salePrice: 100, marketPrice: 120 }, product: { title: 'T', description: 'D', taxPercentage: 20 }, /* WP5: KDV {0,1,10,20} */
    platforms: { [code]: { prices: { salePrice: 100, marketPrice: 120 }, upload: {}, attributes, mapping: {} } },
}) as any;
const staged = (payload: any) => ({ payload }) as any;

describe('attributePayload yardımcıları', () => {
    it('cleanScalar: boş/undefined/null/nesne -> undefined; kırpar', () => {
        expect(cleanScalar('  x ')).toBe('x');
        for (const v of ['', ' ', 'undefined', 'NULL', 'NaN', null, undefined, {}, []]) expect(cleanScalar(v)).toBeUndefined();
        expect(cleanScalar(0)).toBe('0');
    });
    it('normalizeAttrValue: nesne (FE), ilkel (eski), boş', () => {
        expect(normalizeAttrValue({ attributeValueId: '7', attributeValue: 'M' })).toEqual({ valueId: '7', text: 'M' });
        expect(normalizeAttrValue({ attributeValueId: 'undefined', attributeValue: 'Lila' })).toEqual({ valueId: undefined, text: 'Lila' });
        expect(normalizeAttrValue({ id: 5 })).toEqual({ valueId: '5', text: undefined });
        expect(normalizeAttrValue('RAW')).toEqual({ valueId: 'RAW', text: 'RAW' });
        expect(normalizeAttrValue({ attributeValueId: null, attributeValue: '' })).toBeNull();
        expect(normalizeAttrValue(null)).toBeNull();
    });
    it('missingRequiredAttributes / findValueByText', () => {
        const cats: any[] = [{ _id: '1', title: 'A', required: true }, { _id: '2', title: 'B', required: true, values: [{ id: 'x', title: 'İRİ' }] }, { _id: '3', title: 'C', required: false }];
        expect(missingRequiredAttributes(cats, new Set(['1'])).map(c => c._id)).toEqual(['2']);
        expect(missingRequiredAttributes(cats, new Set(), c => c._id === '1').map(c => c._id)).toEqual(['2']);
        expect(findValueByText(cats[1], 'iri')?.id).toBe('x');
    });
});

describe('Hepsiburada özellik yükü (WP9)', () => {
    const m = new HbMapper();
    const build = (attrs: any) => m.toPlatformBatch(staged(variantFor('hepsiburada', attrs)), PLATFORM_PROCESS.TRANSFER, [], [], { catId: 1, brandId: 'Marka', settings: {} });
    it('kimlik yoksa serbest METİN gider (eskiden nesnenin kendisi gidiyordu)', () => {
        const item = build({ Renk: { attributeName: 'Renk', attributeValue: 'Lila' } });
        expect(item.attributes.Renk).toBe('Lila');
    });
    it('boş / "undefined" değerli özellik gönderilmez; kimlik öncelikli kalır', () => {
        const item = build({ A: { attributeValue: 'undefined', attributeValueId: 'undefined' }, B: { attributeValueId: 'V1', attributeValue: 'x' }, C: null });
        expect('A' in item.attributes).toBe(false);
        expect('C' in item.attributes).toBe(false);
        expect(item.attributes.B).toBe('V1');
    });
});

describe('Pazarama özellik yükü (WP9)', () => {
    const m = new PazMapper();
    const build = (attrs: any, cats: any[] = []) => m.toPlatformBatch(staged(variantFor('pazarama', attrs)), PLATFORM_PROCESS.TRANSFER, cats, [], { catId: 1, brandId: 2, settings: {} });
    // [BİLİNÇLİ DÜZELTME - eslesme-fiyat WP4 C-6/D-PZ-6] kimlik varsa YALNIZ attributeValueId (eskiden kimlik + metin birlikte).
    it('boş değerli kayıt gönderilmez; kimlik varsa yalnız kimlik, yoksa serbest metin', () => {
        const item = build({ A1: { attributeValueId: 'V1', attributeValue: 'Kırmızı' }, A2: { attributeValueId: 'undefined', attributeValue: '' }, A3: { attributeValue: 'Serbest' } });
        expect(item.attributes).toEqual([
            { attributeId: 'A1', attributeValueId: 'V1' },
            { attributeId: 'A3', customAttributeValue: 'Serbest' },
        ]);
    });
    it('zorunlu kategori özelliği eksik -> VALIDATION (alan bazlı, barkod içerir)', () => {
        const cats: any[] = [{ _id: 'A1', title: 'Renk', required: true }, { _id: 'A9', title: 'Beden', required: true }, { _id: 'A5', title: 'Not', required: false }];
        try { build({ A1: { attributeValueId: 'V1', attributeValue: 'K' } }, cats); throw new Error('atmalıydı'); } catch (e: any) {
            expect(e.code).toBe('VALIDATION');
            expect(e.message).toMatch(/zorunlu özellik eksik: Beden \(A9\)/);
            expect(e.message).toMatch(/1234567890123/);
            expect(e.message).not.toMatch(/Renk/);
        }
    });
    it('zorunlu özellikler tamamsa hata yok; kategori özellikleri yoksa denetim yok', () => {
        const cats: any[] = [{ _id: 'A1', title: 'Renk', required: true }];
        expect(() => build({ A1: { attributeValueId: 'V1', attributeValue: 'K' } }, cats)).not.toThrow();
        expect(() => build({}, [])).not.toThrow();
    });
});

describe('Ideasoft özellik yükü (WP9)', () => {
    const m = new IdeaMapper();
    const build = (attrs: any) => m.buildIdeasoftVariant(variantFor('ideasoft', attrs), { title: 'T', taxPercentage: 20 }, 1, 2, [], {}).optionGroups;
    it('FE nesnesi: seçenek kimliği attributeValueId olur (eskiden nesnenin kendisi gidiyordu)', () => {
        expect(build({ '10': { attributeName: 'Beden', attributeValue: 'M', attributeValueId: '55' } })).toEqual([{ id: '10', options: [{ id: '55' }] }]);
    });
    it('kimliksiz (yalnız metin) ve boş kayıtlar gönderilmez; ilkel eski biçim korunur', () => {
        expect(build({ '10': { attributeValue: 'M' }, '11': null, '12': { attributeValueId: 'undefined' }, '13': 'V100' })).toEqual([{ id: '13', options: [{ id: 'V100' }] }]);
    });
});
