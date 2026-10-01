/**
 * DB-06: Bizimhesap katalog okumasi `erp[0]` sabit indeksi yerine entegrasyon KODU ile secer.
 * Mevcut davranis (korunur): `{ 'erp.code': code }, { 'erp.$': 1 }` ile tek elemanli erp doner -> marka/kategori/ozellik listesi.
 * Yeni: dizi birden fazla elemanliysa da kod eslesen eleman okunur (Mongo projeksiyonuna bagimli kalinmaz). DB/ag YOK.
 */
import { describe, it, expect } from '@jest/globals';
import { BrandService } from '@integration/modules/erp/bizimhesap/services/BrandService';
import { CategoryService } from '@integration/modules/erp/bizimhesap/services/CategoryService';

const clientDBWith = (erp: any[]) => ({ getClientIntegrationModel: () => ({ findOne: () => ({ lean: async () => ({ erp }) }) }) });
const catalog = { brands: [{ id: 'b1' }], categories: [{ id: 'c1' }], options: [{ id: 'o1' }] };

describe('Bizimhesap katalog okuma (DB-06)', () => {
    it('tek elemanli erp: marka/kategori/ozellik doner (mevcut davranis)', async () => {
        const db = clientDBWith([{ code: 'bizimhesap', settings: { catalog } }]);
        expect(await new BrandService({ clientDB: db }, {} as any).fetchBrands()).toEqual(catalog.brands);
        const cs = new CategoryService({ clientDB: db }, {} as any);
        expect(await cs.fetchCategories()).toEqual(catalog.categories);
        expect(await cs.fetchCategoryAttributes()).toEqual(catalog.options);
    });
    it('birden fazla erp elemani: erp[0] DEGIL, kodu eslesen eleman okunur', async () => {
        const db = clientDBWith([{ code: 'baska-erp', settings: { catalog: { brands: [{ id: 'X' }], categories: [], options: [] } } }, { code: 'bizimhesap', settings: { catalog } }]);
        expect(await new BrandService({ clientDB: db }, {} as any).fetchBrands()).toEqual(catalog.brands);
        expect(await new CategoryService({ clientDB: db }, {} as any).fetchCategories()).toEqual(catalog.categories);
    });
    it('kod eslesmezse bos', async () => {
        const db = clientDBWith([{ code: 'baska-erp', settings: { catalog } }]);
        expect(await new BrandService({ clientDB: db }, {} as any).fetchBrands()).toEqual([]);
    });
});
