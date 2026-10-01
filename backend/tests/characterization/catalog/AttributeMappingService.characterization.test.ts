/**
 * CHARACTERIZATION + WP11 davranis testleri: AttributeMappingService + ChoiceService/CategoryService silme yollari.
 * DB/HTTP YOK: sahte model. WP11 (faz4-int) ile BILINCLI guncellenen sabitlemeler `[WP11]` etiketlidir
 * (onceki davranis commit 8c954ff'te).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

const factoryState: { codes: string[]; instance: any } = { codes: [], instance: null };
jest.mock('@integration/modules/IntegrationFactory', () => ({
    __esModule: true,
    default: class { constructor(public id: number) { } async getInstance(code: string) { factoryState.codes.push(code); return factoryState.instance; } },
}));

import AttributeMappingService from '@api/rpc/handlers/attributeMapping-service';
import ChoiceService from '@api/rpc/handlers/choice-service';
import CategoryService from '@api/rpc/handlers/category-service';

let amModel: any;
let catModel: any;
let choiceModel: any;

const svc = (request: any = {}): any => {
    const s: any = new AttributeMappingService(42, request);
    s.clientDB = { getAttributeMappingModel: () => amModel, getCategoryModel: () => catModel, getChoiceModel: () => choiceModel };
    return s;
};

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    factoryState.codes = [];
    amModel = {
        find: jest.fn(() => Object.assign(Promise.resolve([]), { lean: async () => [], limit() { return this; }, collation() { return this; } })),
        findOne: jest.fn(() => ({ lean: async () => null })),
        updateOne: jest.fn(async () => ({ modifiedCount: 1, upsertedCount: 0 })),
        updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
        deleteMany: jest.fn(async () => ({ deletedCount: 2 })),
        create: jest.fn(async (d: any) => d),
        bulkWrite: jest.fn(async () => ({})),
    };
    catModel = { find: jest.fn(async () => []) };
    choiceModel = { find: jest.fn(async () => []) };
});

const B = { integrationCode: 'trendyol', platformCategoryId: '411', platformAttributeId: '338', platformAttributeName: 'Beden' };

describe('AttributeMappingService.saveAttributeValueMapping [WP11]', () => {
    const choice = new ObjectId().toString();
    const cat = new ObjectId().toString();
    const value = new ObjectId().toString();
    const full = { ...B, localCategoryId: cat, localChoiceId: choice, platformValueId: '1', platformValueName: 'XL', localValueId: value };

    it('TEK atomik updateOne (pipeline + upsert); sorguda localCategoryId VAR, platformCategoryId sorguda YOK', async () => {
        await svc({ ...full, platformValueId: 7, isVarianter: true }).saveAttributeValueMapping();
        expect(amModel.updateOne).toHaveBeenCalledTimes(1);
        const [q, pipeline, opts] = amModel.updateOne.mock.calls[0];
        expect(q).toEqual({ localCategoryId: new ObjectId(cat), integrationCode: 'trendyol', platformAttributeId: '338' });
        expect(opts).toEqual({ upsert: true });
        expect(Array.isArray(pipeline)).toBe(true);
        const set = pipeline[0].$set;
        expect(set.platformCategoryId).toEqual({ $literal: '411' });
        expect(set.isVarianter).toEqual({ $literal: true });
        expect(set.isSlicer).toBeUndefined(); // verilmeyen bayrak ezilmez
        const entry = set.values.$concatArrays[1][0].$literal;
        expect(entry).toMatchObject({ platformValueId: '7', platformValueName: 'XL' }); // sayi -> dizge
        expect(entry.localValueId).toEqual(new ObjectId(value));
    });
    it('kullanici metni aggregation ifadesi OLMAZ: "$..." degerler $literal icinde', async () => {
        await svc({ ...full, platformValueId: '$x', platformValueName: '$y', platformAttributeName: '$z' }).saveAttributeValueMapping();
        const set = amModel.updateOne.mock.calls[0][1][0].$set;
        expect(set.platformAttributeName).toEqual({ $literal: '$z' });
        expect(set.values.$concatArrays[1][0]).toEqual({ $literal: expect.objectContaining({ platformValueId: '$x', platformValueName: '$y' }) });
    });
    it('degeri tekilleme: ayni yerel deger VEYA ayni platform deger kimligi cikarilir', async () => {
        await svc({ ...full, platformValueId: 'p1' }).saveAttributeValueMapping();
        const cond = amModel.updateOne.mock.calls[0][1][0].$set.values.$concatArrays[0].$filter.cond;
        expect(JSON.stringify(cond)).toContain('$$v.localValueId');
        expect(JSON.stringify(cond)).toContain('$$v.platformValueId');
    });
    it('platformValueId YOK ve isAllowCustom degil -> 400 (metin kimlige DONUSMEZ)', async () => {
        await expect(svc({ ...full, platformValueId: undefined }).saveAttributeValueMapping()).rejects.toMatchObject({ statusCode: 400 });
        expect(amModel.updateOne).not.toHaveBeenCalled();
    });
    it('isAllowCustom=true: kimliksiz serbest metin platformValueId=null ile yazilir; tekilleme yalniz yerel degere gore', async () => {
        await svc({ ...full, platformValueId: undefined, platformValueName: 'Ozel', isAllowCustom: true }).saveAttributeValueMapping();
        const set = amModel.updateOne.mock.calls[0][1][0].$set;
        expect(set.values.$concatArrays[1][0].$literal.platformValueId).toBeNull();
        expect(JSON.stringify(set.values.$concatArrays[0].$filter.cond)).not.toContain('$$v.platformValueId');
    });
    it('localCategoryId verilmezse kategori eslemesinden TEK aday cikarilir; 0 veya >1 aday -> 400', async () => {
        const noCat = { ...full, localCategoryId: undefined };
        const mk = (rows: any[]) => amModel.find.mockReturnValue({ limit: () => ({ lean: async () => rows }) });
        mk([{ localCategoryId: new ObjectId(cat) }]);
        await svc(noCat).saveAttributeValueMapping();
        expect(amModel.updateOne.mock.calls[0][0].localCategoryId).toEqual(new ObjectId(cat));
        amModel.updateOne.mockClear();
        mk([]);
        await expect(svc(noCat).saveAttributeValueMapping()).rejects.toMatchObject({ statusCode: 400 });
        mk([{ localCategoryId: new ObjectId() }, { localCategoryId: new ObjectId() }]);
        await expect(svc(noCat).saveAttributeValueMapping()).rejects.toMatchObject({ statusCode: 400 });
        expect(amModel.updateOne).not.toHaveBeenCalled();
    });
    it('eksik veri 400; gecersiz ObjectId 400', async () => {
        await expect(svc({ integrationCode: 'trendyol' }).saveAttributeValueMapping()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc({ ...full, localCategoryId: 'x' }).saveAttributeValueMapping()).rejects.toMatchObject({ statusCode: 400 });
    });
    it('benzersiz indeks yarisi (11000): bir kez daha denenir; baska hata yutulmaz', async () => {
        amModel.updateOne.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 })).mockResolvedValueOnce({ modifiedCount: 1 });
        await expect(svc(full).saveAttributeValueMapping()).resolves.toEqual({ result: true });
        expect(amModel.updateOne).toHaveBeenCalledTimes(2);
        amModel.updateOne.mockReset();
        amModel.updateOne.mockRejectedValue(new Error('net'));
        await expect(svc(full).saveAttributeValueMapping()).rejects.toThrow('net');
    });
});

describe('AttributeMappingService.saveAttributeMapping [WP11]', () => {
    it('kimlikler dizgeye cevrilir; deger kimligi yoksa null; gecersiz localValueId 400', async () => {
        const cat = new ObjectId().toString(); const choice = new ObjectId().toString(); const v = new ObjectId().toString();
        await svc({ ...B, platformAttributeId: 338, platformCategoryId: 411, localCategoryId: cat, localChoiceId: choice, values: [{ localValueId: v, platformValueId: 5, platformValueName: 'M' }, { localValueId: v, platformValueId: null, platformValueName: 'Ozel' }] }).saveAttributeMapping();
        const [q, u] = amModel.updateOne.mock.calls[0];
        expect(q.platformAttributeId).toBe('338');
        expect(u.$set.platformCategoryId).toBe('411');
        expect(u.$set.values.map((x: any) => x.platformValueId)).toEqual(['5', null]);
        await expect(svc({ ...B, localCategoryId: cat, localChoiceId: choice, values: [{ localValueId: 'x', platformValueName: 'M' }] }).saveAttributeMapping()).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('AttributeMappingService.saveCategoryMapping / deleteFullMapping [WP11]', () => {
    it('kategori eslemesi upsert + eski platform kategorisine ait ozellik eslemeleri temizlenir; temizlenen sayi doner', async () => {
        const local = new ObjectId().toString();
        amModel.updateOne.mockResolvedValue({ upsertedCount: 0, modifiedCount: 1 });
        amModel.deleteMany.mockResolvedValue({ deletedCount: 3 });
        const r = await svc({ localCategoryId: local, integrationCode: 'trendyol', platformCategoryId: 999 }).saveCategoryMapping();
        expect(r).toEqual({ result: true, clearedAttributeMappings: 3 });
        expect(amModel.updateOne.mock.calls[0][1].$set.platformCategoryId).toBe('999');
        expect(amModel.deleteMany).toHaveBeenCalledWith({ localCategoryId: new ObjectId(local), integrationCode: 'trendyol', platformAttributeId: { $ne: null }, platformCategoryId: { $ne: '999' } });
    });
    it('keepAttributeMappings=true: temizlik YOK', async () => {
        const r = await svc({ localCategoryId: new ObjectId().toString(), integrationCode: 'trendyol', platformCategoryId: '9', keepAttributeMappings: true }).saveCategoryMapping();
        expect(amModel.deleteMany).not.toHaveBeenCalled();
        expect(r.clearedAttributeMappings).toBe(0);
    });
    it('bos platformCategoryId / gecersiz yerel kategori 400', async () => {
        await expect(svc({ localCategoryId: new ObjectId().toString(), integrationCode: 'trendyol' }).saveCategoryMapping()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc({ localCategoryId: 'zz', integrationCode: 'trendyol', platformCategoryId: '1' }).saveCategoryMapping()).rejects.toMatchObject({ statusCode: 400 });
    });
    it('deleteFullMapping: yerel kategori+entegrasyon icin deleteMany; ham yanit doner', async () => {
        const local = new ObjectId().toString();
        const r = await svc({ localCategoryId: local, integrationCode: 'trendyol' }).deleteFullMapping();
        expect(amModel.deleteMany).toHaveBeenCalledWith({ localCategoryId: new ObjectId(local), integrationCode: 'trendyol' });
        expect(r).toEqual({ deletedCount: 2 });
    });
    it('deleteFullMapping: gecerli entegrasyon kodu yoksa (FE -1) hicbir sey silinmez', async () => {
        const r = await svc({ localCategoryId: new ObjectId().toString(), integrationCode: -1 }).deleteFullMapping();
        expect(amModel.deleteMany).not.toHaveBeenCalled();
        expect(r.deletedCount).toBe(0);
    });
});

describe('AttributeMappingService.get [WP11]', () => {
    it('istek bos: tum kayitlar (FE sozlesmesi); limit/skip/integrationCode opsiyonel', async () => {
        const chain: any = { collation: jest.fn(() => chain), skip: jest.fn(() => chain), limit: jest.fn(() => chain), lean: jest.fn(async () => [1]) };
        amModel.find.mockReturnValue(chain);
        await expect(svc({}).get()).resolves.toEqual([1]);
        expect(amModel.find).toHaveBeenLastCalledWith({});
        expect(chain.limit).not.toHaveBeenCalled();
        await svc({ limit: 10, skip: 5, integrationCode: 'n11' }).get();
        expect(amModel.find).toHaveBeenLastCalledWith({ integrationCode: 'n11' });
        expect(chain.limit).toHaveBeenCalledWith(10);
        expect(chain.skip).toHaveBeenCalledWith(5);
    });
});

describe('AttributeMappingService.autoMatchAllCategories [WP11]', () => {
    const choiceId = new ObjectId();
    const valId = new ObjectId();
    const localCat = { _id: new ObjectId(), title: 'Ayakkabi', children: [] };
    beforeEach(() => {
        choiceModel.find.mockResolvedValue([{ _id: choiceId, title: 'Beden', values: [{ _id: valId, title: 'M' }] }]);
        catModel.find.mockResolvedValue([localCat]);
        factoryState.instance = {
            retrieveCategories: jest.fn(async () => [{ _id: 411, title: 'Ayakkabi', children: [] }]),
            retrieveCategoryAttributes: jest.fn(async () => [{ _id: 338, title: 'Beden', varianter: true, values: [{ id: 1, title: 'M' }] }]),
        };
    });
    it('parametre yok -> trendyol (eski varsayilan); yazma TOPLU bulkWrite ($setOnInsert upsert), create YOK', async () => {
        const r = await svc().autoMatchAllCategories();
        expect(factoryState.codes).toEqual(['trendyol']);
        expect(amModel.create).not.toHaveBeenCalled();
        expect(amModel.bulkWrite).toHaveBeenCalledTimes(2); // kategori + ozellik
        expect(r).toMatchObject({ result: true, matchedCount: 1, attributeMappingCount: 1, skippedCount: 0, failedCount: 0 });
        const attrOp = amModel.bulkWrite.mock.calls[1][0][0].updateOne;
        expect(attrOp.upsert).toBe(true);
        expect(attrOp.update.$setOnInsert.values).toEqual([{ localValueId: valId.toString(), platformValueId: '1', platformValueName: 'M' }]);
        expect(attrOp.update.$set).toBeUndefined(); // var olan esleme EZILMEZ
    });
    it('integrationCode parametresi: izinli pazaryeri kabul edilir, izinli olmayan 400 (fabrika cagrilmaz)', async () => {
        await svc({ integrationCode: 'hepsiburada' }).autoMatchAllCategories();
        expect(factoryState.codes).toEqual(['hepsiburada']);
        factoryState.codes = [];
        await expect(svc({ integrationCode: 'bizimhesap' }).autoMatchAllCategories()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc({ integrationCode: 'evil' }).autoMatchAllCategories()).rejects.toMatchObject({ statusCode: 400 });
        expect(factoryState.codes).toEqual([]);
    });
    it('platform hatasi YUTULMAZ (ADR-0006): firlar', async () => {
        factoryState.instance.retrieveCategories.mockRejectedValue(new Error('boom'));
        await expect(svc().autoMatchAllCategories()).rejects.toThrow('boom');
        expect(amModel.bulkWrite).not.toHaveBeenCalled();
    });
    it('tum kategoriler hata verirse 502; kismi hata `failed` listesinde raporlanir', async () => {
        factoryState.instance.retrieveCategoryAttributes.mockRejectedValue(new Error('attr down'));
        await expect(svc().autoMatchAllCategories()).rejects.toMatchObject({ statusCode: 502 });
        const cat2 = { _id: new ObjectId(), title: 'Zzzz Qqqq', children: [] };
        catModel.find.mockResolvedValue([localCat, cat2]);
        const r = await svc().autoMatchAllCategories(); // cat2 esleme bulamaz (hata almaz); localCat ozellik hatasi -> kismi
        expect(r.failedCount).toBe(1);
        expect(r.failed[0]).toMatchObject({ reason: 'attr down' });
    });
    it('V2: degerler gomulu degilse (allowCustom degil) BOS esleme YAZILMAZ; skipped raporlanir', async () => {
        factoryState.instance.retrieveCategoryAttributes.mockResolvedValue([{ _id: 338, title: 'Beden', varianter: true }]);
        const r = await svc().autoMatchAllCategories();
        expect(r.attributeMappingCount).toBe(0);
        expect(r.skipped).toEqual([expect.objectContaining({ platformAttributeId: '338', reason: 'PLATFORM_VALUES_NOT_EMBEDDED' })]);
    });
    it('mevcut kategori+ozellik eslemesi atlanir (yeniden yazilmaz)', async () => {
        amModel.find.mockReturnValue({ lean: async () => [
            { isCategoryMapping: true, localCategoryId: localCat._id, platformCategoryId: '411' },
            { isCategoryMapping: false, localCategoryId: localCat._id, platformAttributeId: '338' },
        ] });
        const r = await svc().autoMatchAllCategories();
        expect(r).toMatchObject({ matchedCount: 0, attributeMappingCount: 0 });
        expect(amModel.bulkWrite).not.toHaveBeenCalled();
    });
});

describe('ChoiceService / CategoryService silme: yetim referans temizligi [WP11]', () => {
    it('removeChoice: Choice silinir + AttributeMappings baglari koparilir (localChoiceId=null, values=[])', async () => {
        const cm: any = { deleteOne: jest.fn(async () => ({ deletedCount: 1, acknowledged: true })) };
        const id = new ObjectId().toString();
        amModel.updateMany.mockResolvedValue({ modifiedCount: 4 });
        const s: any = new ChoiceService(42, { _id: id });
        s.clientDB = { getChoiceModel: () => cm, getAttributeMappingModel: () => amModel };
        const r = await s.removeChoice();
        expect(r).toEqual({ result: { deletedCount: 1, acknowledged: true }, detachedMappings: 4 });
        const [f, u] = amModel.updateMany.mock.calls[0];
        expect(f.localChoiceId).toEqual(new ObjectId(id));
        expect(u.$set).toMatchObject({ localChoiceId: null, values: [] });
    });
    it('removeChoiceValue: degeri esleme values[] dizilerinden ceker', async () => {
        const cm: any = { updateOne: jest.fn(async () => ({ modifiedCount: 1 })) };
        const vid = new ObjectId().toString();
        amModel.updateMany.mockResolvedValue({ modifiedCount: 2 });
        const s: any = new ChoiceService(42, { _id: new ObjectId().toString(), id: vid });
        s.clientDB = { getChoiceModel: () => cm, getAttributeMappingModel: () => amModel };
        const r = await s.removeChoiceValue();
        expect(r.cleanedMappings).toBe(2);
        expect(amModel.updateMany.mock.calls[0][1].$pull).toEqual({ values: { localValueId: new ObjectId(vid) } });
    });
    it('temizlik silme sonucundan bagimsiz calisir (deletedCount 0 iken de: yarim kalan silme tekrarinda iyilesir)', async () => {
        const cm: any = { deleteOne: jest.fn(async () => ({ deletedCount: 0, acknowledged: true })) };
        const s: any = new ChoiceService(42, { _id: new ObjectId().toString() });
        s.clientDB = { getChoiceModel: () => cm, getAttributeMappingModel: () => amModel };
        await s.removeChoice();
        expect(amModel.updateMany).toHaveBeenCalledTimes(1);
    });
    it('deleteCategory: tum entegrasyonlardaki esleme kayitlari silinir; yanit sekli korunur (+deletedMappings)', async () => {
        const id = new ObjectId().toString();
        const s: any = new CategoryService(42, { _id: id });
        s.clientDB = { getCategoryModel: () => ({ deleteOne: jest.fn(async () => ({ acknowledged: true, deletedCount: 1 })) }), getAttributeMappingModel: () => amModel };
        const r = await s.deleteCategory();
        expect(amModel.deleteMany).toHaveBeenCalledWith({ localCategoryId: new ObjectId(id) });
        expect(r).toMatchObject({ acknowledged: true, deletedCount: 1, deletedMappings: 2 });
    });
});
