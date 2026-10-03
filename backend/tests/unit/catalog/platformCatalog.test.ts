// [eslesme-fiyat WP2] catalog.platformRefresh: katalog yenileme + eşleme bayatlık taraması (bellek-içi; DB/ağ yok).
import { describe, it, expect, jest } from '@jest/globals';
import { runPlatformCatalogCycle, staleFor, PlatformCatalogDeps } from '@operations/catalog/platformCatalog';

const NOW = new Date('2026-10-03T00:00:00Z');
const tree = [{ _id: 1, children: [{ _id: 411 }, { _id: 412 }] }];

function setup(over: { adapter?: any; rows?: any[] } = {}) {
  const adapter = over.adapter ?? {
    retrieveCategories: jest.fn(async () => tree),
    retrieveCategoryAttributes: jest.fn(async (cat: string) => (cat === '411' ? [{ _id: 338, title: 'Beden', values: [] }, { _id: 47, title: 'Renk', values: [{ id: 1 }, { id: 2 }] }] : [])),
    retrieveCategoryAttributeValues: jest.fn(async () => [{ id: 'M' }, { id: 'L' }]),
  };
  const rows = over.rows ?? [
    { _id: 'a', integrationCode: 'trendyol', isCategoryMapping: true, platformCategoryId: '411', platformAttributeId: null },
    { _id: 'b', integrationCode: 'trendyol', platformCategoryId: '411', platformAttributeId: '338', values: [{ platformValueId: 'M' }, { platformValueId: 'XL' }] },
    { _id: 'c', integrationCode: 'trendyol', platformCategoryId: '411', platformAttributeId: '47', values: [{ platformValueId: '1' }] },
    { _id: 'd', integrationCode: 'trendyol', platformCategoryId: '411', platformAttributeId: '999', values: [] },
    { _id: 'e', integrationCode: 'trendyol', isCategoryMapping: true, platformCategoryId: '500', platformAttributeId: null, stale: null },
    { _id: 'f', integrationCode: 'trendyol', isCategoryMapping: true, platformCategoryId: '412', platformAttributeId: null, stale: { reason: 'CATEGORY_GONE' } },
  ];
  const saved: any[] = []; const stale: any[] = [];
  const deps: PlatformCatalogDeps = {
    now: () => NOW,
    listTenants: async () => [7],
    listChannels: async () => [{ integrationCode: 'trendyol', adapter: async () => adapter }, { integrationCode: 'n11', adapter: async () => { throw new Error('kurulu değil'); } }],
    listMappings: async (_tid, code) => (code === 'trendyol' ? rows : []),
    setStale: async (tid, u) => { stale.push(...u.map((x) => ({ tid, ...x }))); },
    saveCatalog: async (e) => { saved.push(...e); },
  };
  return { deps, adapter, saved, stale };
}

describe('runPlatformCatalogCycle', () => {
  it('yalnız eşlenmiş kategorilerin özelliklerini ve eşlenmiş özelliklerin değerlerini çeker; gömülü değer varsa ayrı uca gitmez', async () => {
    const { deps, adapter, saved } = setup();
    const r = await runPlatformCatalogCycle(deps);
    expect(adapter.retrieveCategoryAttributes.mock.calls.map((c: any[]) => c[0]).sort()).toEqual(['411', '412', '500']);
    expect(adapter.retrieveCategoryAttributeValues).toHaveBeenCalledTimes(1); // yalnız 338 (47 gömülü; 999 platformda yok)
    expect(saved.map((e) => `${e.kind}:${e.platformCategoryId}:${e.platformAttributeId}`).sort()).toEqual(['attribute:411:', 'attribute:412:', 'attribute:500:', 'category::', 'value:411:338', 'value:411:47']);
    expect(r).toMatchObject({ channels: 1, failed: 0 });
  });

  it('bayatlık: kategori yok, özellik yok, değer kaldırıldı işaretlenir; geri gelen temizlenir; güncel olana dokunulmaz', async () => {
    const { deps, stale } = setup();
    const r = await runPlatformCatalogCycle(deps);
    const by = Object.fromEntries(stale.map((s) => [s.id, s.stale]));
    expect(by.e).toMatchObject({ reason: 'CATEGORY_GONE', detectedAt: NOW });
    expect(by.d).toMatchObject({ reason: 'ATTRIBUTE_GONE' });
    expect(by.b).toMatchObject({ reason: 'VALUES_GONE', missingValueIds: ['XL'] });
    expect(by.f).toBeNull(); // 412 geri geldi
    expect('a' in by).toBe(false);
    expect('c' in by).toBe(false);
    expect(r).toMatchObject({ marked: 3, cleared: 1, tenantsScanned: 1 });
    expect(stale.every((s) => s.tid === 7)).toBe(true);
  });

  it('liste çekilemezse karar verilmez (yanlış pozitif yok); kanal hatası diğer kanalları durdurmaz', async () => {
    const adapter = { retrieveCategories: jest.fn(async () => { throw new Error('down'); }), retrieveCategoryAttributes: jest.fn(async () => { throw new Error('down'); }) };
    const { deps, stale } = setup({ adapter });
    const r = await runPlatformCatalogCycle(deps);
    expect(stale).toEqual([]);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('çağrı bütçesi aşılmaz', async () => {
    const { deps, adapter } = setup();
    await runPlatformCatalogCycle({ ...deps, maxCallsPerChannel: 2 });
    expect(adapter.retrieveCategories.mock.calls.length + adapter.retrieveCategoryAttributes.mock.calls.length + adapter.retrieveCategoryAttributeValues.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe('staleFor', () => {
  it('kategori listesi bilinmiyorsa kategori kaydı için karar yok', () => {
    expect(staleFor({ _id: 1, integrationCode: 't', isCategoryMapping: true, platformCategoryId: '1' }, { categories: null, attributes: new Map(), values: new Map() }, NOW)).toBeUndefined();
  });
});
