/**
 * COM-02: "bilinmiyor" komisyon %0 sayilmaz. getCategoryCommission bulunamayan/tanimsiz -> null, gercek 0 -> 0;
 * Trendyol KA1/KA2 kademeleri yalniz okunur; Pazarama commissions.json bos -> undefined; donusturuculer null'da %0 varsaymaz.
 * DB/ag YOK (mock clientDB).
 */
import { describe, it, expect } from '@jest/globals';
import { PlatformMappingProvider } from '@integration/modules/provider/PlatformMappingProvider';
import { CategoryService as TyCategoryService } from '@integration/modules/marketplace/trendyol/services/CategoryService';
import { CategoryService as PzCategoryService } from '@integration/modules/marketplace/pazarama/services/CategoryService';

// [DB-06] Eski okuma (Categories.platforms + var olmayan `commission`) hep null donuyordu; artik kanal tablosu (commissions.json)
// platform kategori kimligiyle aranir, yerel kategori -> platform kategorisi eslemesi AttributeMappings'ten gelir.
const provider = (attrMappings: any[] = [], code = 'trendyol') => new PlatformMappingProvider({
    getAttributeMappingModel: () => ({ find: () => ({ lean: async () => attrMappings }) }),
} as any, `c-com02-${Math.random()}`, code);

describe('PlatformMappingProvider.getCategoryCommission (COM-02 + DB-06)', () => {
    it('kanal tablosundaki kategori -> temel oran (Trendyol 368 = 25)', async () => { expect(await provider().getCategoryCommission(368)).toBe(25); });
    it('string kimlik de calisir', async () => { expect(await provider().getCategoryCommission('368')).toBe(25); });
    it('tabloda olmayan kategori -> null (0 degil)', async () => { expect(await provider().getCategoryCommission(99999999)).toBeNull(); });
    it('bos/tanimsiz kimlik -> null', async () => { expect(await provider().getCategoryCommission('')).toBeNull(); });
    it('tablosu olmayan kanal (Pazarama bos) -> null', async () => { expect(await provider([], 'pazarama').getCategoryCommission(368)).toBeNull(); });
    it('yerel kategori -> AttributeMappings -> kanal tablosu', async () => {
        const p = provider([{ integrationCode: 'trendyol', isCategoryMapping: true, localCategoryId: 'L1', platformCategoryId: '368' }]);
        expect(await p.getLocalCategoryCommission('L1')).toBe(25);
    });
    it('eslesmemis yerel kategori -> null', async () => { expect(await provider().getLocalCategoryCommission('YOK')).toBeNull(); });
    it('baska entegrasyonun eslemesi kullanilmaz', async () => {
        const p = provider([{ integrationCode: 'hepsiburada', isCategoryMapping: true, localCategoryId: 'L1', platformCategoryId: '368' }]);
        expect(await p.getLocalCategoryCommission('L1')).toBeNull();
    });
});

describe('Trendyol fetchCategoryCommission: KA1/KA2 okuyucu', () => {
    const svc = new TyCategoryService({ clientId: 'c-com02' }, {} as any);
    it('ka1/ka2 dolu dugum -> tiers + commission + maturity', async () => {
        const r: any = await svc.fetchCategoryCommission('835');
        expect(r.commission).toBe(14.5);
        expect(r.tiers).toEqual({ KA1: 9, KA2: 12 });
        expect(typeof r.maturity === 'number' || r.maturity === null).toBe(true);
    });
    it('ka1/ka2 null dugum -> bos tiers', async () => {
        const r: any = await svc.fetchCategoryCommission('368');
        expect(r.commission).toBe(25);
        expect(r.tiers).toEqual({});
    });
    it('bilinmeyen kategori -> undefined', async () => { expect(await svc.fetchCategoryCommission('99999999')).toBeUndefined(); });
});

describe('Pazarama fetchCategoryCommission: bos commissions.json', () => {
    it('bos veri -> undefined (0 degil)', async () => {
        const svc = new PzCategoryService({ clientId: 'c-com02' }, {} as any);
        expect(await svc.fetchCategoryCommission('123')).toBeUndefined();
    });
});

// toInternalVariant komisyon parametresi COM-10 ile kaldirildi; brut fiyat davranisi: Commission.com10.test.ts
