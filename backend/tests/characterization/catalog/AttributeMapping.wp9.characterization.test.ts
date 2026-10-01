/**
 * WP9 (faz4-int): özellik eşleme ÇÖZÜMLEME katmanı — PlatformMappingProvider (tenant izolasyonu, tek önbellek, kategori/platform
 * kategorisi süzmesi, boş kimlik koruması) + import tarafı varyant seçenek çözümü (Trendyol ProductService.convertToInternalModel).
 * DB/HTTP YOK: `lean()` dönen sahte model; provider gerçek sınıf.
 */
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import { PlatformMappingProvider } from '@integration/modules/provider/PlatformMappingProvider';
import { matchMappingValue } from '@integration/catalog/attributePayload';
import { nodeCache, resetCacheForTests, configureCache, invalidateTenantCache } from '@utils/decorator/cache';
import Service from '@integration/modules/marketplace/trendyol/services/Service';
import { ProductService } from '@integration/modules/marketplace/trendyol/services/ProductService';
import { makeParams, CATEGORY_ATTRIBUTES_V1, V2_URLS } from '../../helpers/trendyolProductFixtures';
import { http, resetHttp } from '../stubs/_axiosMock';

const L1 = 'aaaaaaaaaaaaaaaaaaaaaaaa'; // yerel kategori 1
const L2 = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CH = 'cccccccccccccccccccccccc'; // yerel seçenek (Beden)
const V_M = 'dddddddddddddddddddddddd';
const V_L = 'eeeeeeeeeeeeeeeeeeeeeeee';

function fakeDb(rows: { mappings?: any[]; choices?: any[]; brands?: any[]; cats?: any[] }, counter: { n: number }): any {
    const q = (data: any[]) => () => ({ lean: async () => { counter.n++; return data; } });
    return {
        getBrandModel: () => ({ find: q(rows.brands || []) }),
        getCategoryModel: () => ({ find: q(rows.cats || []) }),
        getAttributeMappingModel: () => ({ find: q(rows.mappings || []) }),
        getChoiceModel: () => ({ find: q(rows.choices || []) }),
    };
}

const catMap = (local: string, platform: string, code = 'trendyol') => ({ integrationCode: code, localCategoryId: local, platformCategoryId: platform, isCategoryMapping: true, platformAttributeId: null });
const attrMap = (local: string, platform: string, attrId: string, values: any[], extra: any = {}) => ({
    integrationCode: 'trendyol', localCategoryId: local, platformCategoryId: platform, platformAttributeId: attrId, platformAttributeName: 'Beden',
    localChoiceId: CH, isCategoryMapping: false, isVarianter: true, isSlicer: true, values, ...extra,
});

beforeEach(() => { resetCacheForTests(); configureCache({ jitter: 0 }); });
afterAll(() => { nodeCache.flushAll(); nodeCache.close(); });

describe('PlatformMappingProvider — özellik eşleme çözümü (WP9)', () => {
    it('kategori eşlemesi + özellik eşlemesi TEK DB okumasıyla çözülür (eskiden iki ayrı önbellek = iki okuma)', async () => {
        const c = { n: 0 };
        const p = new PlatformMappingProvider(fakeDb({ mappings: [catMap(L1, '411'), attrMap(L1, '411', '338', [])] }, c), 1, 'trendyol');
        expect(await p.getPlatformCategoryId(L1)).toBe('411');
        expect(await p.getAllAttributeMappings()).toHaveLength(2);
        expect(await p.getLocalCategoryId('411')).toBe(L1);
        expect(c.n).toBe(1);
    });

    it('yazma sonrası invalidation özellik eşleme önbelleğini de düşürür (tek aile)', async () => {
        const c = { n: 0 };
        const rows: any[] = [catMap(L1, '411')];
        const p = new PlatformMappingProvider(fakeDb({ mappings: rows }, c), 1, 'trendyol');
        expect(await p.getAttributeMappingsForCategory(L1)).toHaveLength(0);
        rows.push(attrMap(L1, '411', '338', []));
        expect(await p.getAttributeMappingsForCategory(L1)).toHaveLength(0); // bayat (TTL)
        invalidateTenantCache(1, 'PlatformMappingProvider');
        expect(await p.getAttributeMappingsForCategory(L1)).toHaveLength(1);
    });

    it('getAttributeMappingsForCategory: entegrasyon + yerel kategori süzülür; kategori-eşleme kaydı dönmez; platform kategorisi ile daraltılır', async () => {
        const rows = [
            catMap(L1, '411'),
            attrMap(L1, '411', '338', []),
            attrMap(L1, '999', '338', [], { platformAttributeId: '338' }), // eski platform kategorisinden kalan bayat kayıt
            attrMap(L2, '411', '338', []),
            { ...attrMap(L1, '411', '338', []), integrationCode: 'pazarama' },
        ];
        const p = new PlatformMappingProvider(fakeDb({ mappings: rows }, { n: 0 }), 1, 'trendyol');
        expect(await p.getAttributeMappingsForCategory(L1)).toHaveLength(2);
        const narrowed = await p.getAttributeMappingsForCategory(L1, 411);
        expect(narrowed).toHaveLength(1);
        expect(String(narrowed[0].platformCategoryId)).toBe('411');
        expect(await p.getAttributeMappingsForCategory('')).toEqual([]);
    });

    it('tenant izolasyonu: A tenant\'ının özellik eşlemesi B\'ye sızmaz', async () => {
        const a = new PlatformMappingProvider(fakeDb({ mappings: [attrMap(L1, '411', '338', [])] }, { n: 0 }), 1, 'trendyol');
        const b = new PlatformMappingProvider(fakeDb({ mappings: [] }, { n: 0 }), 2, 'trendyol');
        expect(await a.getAttributeMappingsForCategory(L1)).toHaveLength(1);
        expect(await b.getAttributeMappingsForCategory(L1)).toHaveLength(0);
    });

    it('yerel kategori/marka kimliği yoksa TypeError yerine "eşleme yok" (undefined) döner', async () => {
        const p = new PlatformMappingProvider(fakeDb({ mappings: [catMap(L1, '411')] }, { n: 0 }), 1, 'trendyol');
        await expect(p.getPlatformCategoryId(undefined as any)).resolves.toBeUndefined();
        await expect(p.getPlatformCategoryId(null as any)).resolves.toBeUndefined();
        await expect(p.getPlatformBrandId(undefined as any)).resolves.toBeUndefined();
    });
});

describe('matchMappingValue (WP9)', () => {
    const values = [
        { platformValueId: null, platformValueName: 'Lila Grisi' },
        { platformValueId: '7001', platformValueName: 'M' },
        { platformValueId: '7000', platformValueName: 'L' },
    ];
    it('önce kimlik, sonra metin (TR büyük/küçük harf duyarsız); null kimlik "null" ile eşleşmez', () => {
        expect(matchMappingValue(values, { valueId: '7000', text: 'M' })?.platformValueName).toBe('L'); // kimlik metne baskın
        expect(matchMappingValue(values, { text: 'lila grisi' })?.platformValueName).toBe('Lila Grisi');
        expect(matchMappingValue(values, { valueId: 'null' })).toBeUndefined();
    });
    it('platformValueName eksik kayıt istisna fırlatmaz', () => {
        expect(matchMappingValue([{ platformValueId: '1' } as any], { text: 'x' })).toBeUndefined();
        expect(matchMappingValue(undefined, { text: 'x' })).toBeUndefined();
    });
});

describe('Trendyol import: varyant seçenek çözümü (WP9)', () => {
    const build = (mappings: any[]) => {
        const params: any = makeParams({ urls: V2_URLS });
        params.mappingProvider = {
            getLocalBrandId: async () => 'brand1',
            getCategoryCommission: async () => 10,
            getAllAttributeMappings: async () => mappings,
            getLocalChoices: async () => [{ _id: CH, title: 'Beden', values: [{ _id: V_M, title: 'M' }, { _id: V_L, title: 'L' }] }],
        };
        const service = new Service(params);
        return new ProductService(params, service);
    };
    const raw = (attrs: any[]) => ({
        rawData: { pimCategoryId: 411, brandId: 22, barcode: 'B1', productMainId: 'M1', title: 'T', salePrice: 100, listPrice: 120, vatRate: 20, quantity: 1, images: [], attributes: attrs },
        localCategoryId: L1,
    });
    beforeEach(() => { resetHttp(); http.get.mockResolvedValue({ status: 200, data: CATEGORY_ATTRIBUTES_V1 } as any); });

    it('kimlik eşleşmesi metne baskındır; allowCustom (platformValueId null) metinle çözülür', async () => {
        const svc = build([attrMap(L1, '411', '338', [{ localValueId: V_M, platformValueId: '7001', platformValueName: 'M' }, { localValueId: V_L, platformValueId: null, platformValueName: 'Uzun' }])]);
        const r1: any = await svc.convertToInternalModel(raw([{ attributeId: 338, attributeName: 'Beden', attributeValueId: 7001, attributeValue: 'M' }]) as any);
        expect(r1.variant.choices).toEqual([expect.objectContaining({ choiceId: CH, choiceValueId: V_M, choiceValueTitle: 'M' })]);
        const r2: any = await svc.convertToInternalModel(raw([{ attributeId: 338, attributeName: 'Beden', attributeValue: 'uzun' }]) as any);
        expect(r2.variant.choices).toEqual([expect.objectContaining({ choiceValueId: V_L })]);
    });

    it('eşlemede platformValueName eksik olsa da TypeError yok; farklı yerel kategori eşlemesi karışmaz', async () => {
        const svc = build([
            attrMap(L1, '411', '338', [{ localValueId: V_M, platformValueId: '7001' }]),
            attrMap(L2, '411', '338', [{ localValueId: V_L, platformValueId: '7001', platformValueName: 'M' }]),
        ]);
        const r: any = await svc.convertToInternalModel(raw([{ attributeId: 338, attributeValueId: 7001, attributeValue: 'M' }]) as any);
        expect(r.variant.choices).toEqual([expect.objectContaining({ choiceValueId: V_M })]); // L2'nin (V_L) eşlemesi değil
    });

    it('platform ürününde boş/undefined değerli özellik eşleme çözümünde yok sayılır', async () => {
        const svc = build([attrMap(L1, '411', '338', [{ localValueId: V_M, platformValueId: '7001', platformValueName: 'M' }])]);
        const r: any = await svc.convertToInternalModel(raw([{ attributeId: 338, attributeValueId: 'undefined', attributeValue: '' }]) as any);
        expect(r.variant.choices).toEqual([]);
    });
});
