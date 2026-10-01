// Protokol 13 karakterizasyon: Pazarama `BrandMapper` (marka listesi normalizasyonu). ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { BrandMapper } from '@integration/modules/marketplace/pazarama/transformers/BrandTransformer';

describe('Pazarama BrandMapper.toInternalBrands — karakterizasyon', () => {
    const m = new BrandMapper();

    it('doğrudan dizi girdiyi kabul eder; id/name -> id/title; başlığa göre alfabetik sıralar', () => {
        const res = m.toInternalBrands([{ id: 2, name: 'Zebra' }, { id: 1, name: 'Alfa' }]);
        expect(res).toEqual([{ id: '1', title: 'Alfa' }, { id: '2', title: 'Zebra' }]);
    });

    it('{ data: [...] } sarmalayıcısını okur', () => {
        const res = m.toInternalBrands({ data: [{ brandId: 5, brandName: 'Marka5' }] });
        expect(res).toEqual([{ id: '5', title: 'Marka5' }]);
    });

    it('{ brands: [...] } sarmalayıcısını okur (data yoksa)', () => {
        const res = m.toInternalBrands({ brands: [{ brandId: 6, brandName: 'Marka6' }] });
        expect(res).toEqual([{ id: '6', title: 'Marka6' }]);
    });

    it('ne dizi ne data ne brands alanı varsa boş diziye düşer (kırılmaz)', () => {
        expect(m.toInternalBrands({})).toEqual([]);
    });

    it('id: item.id öncelikli, yoksa brandId; name: item.name öncelikli, yoksa brandName', () => {
        const res = m.toInternalBrands([{ id: 1, brandId: 99, name: 'Ad1', brandName: 'BrandAd1' }]);
        expect(res).toEqual([{ id: '1', title: 'Ad1' }]);
    });
});
