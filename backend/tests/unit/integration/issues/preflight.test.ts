// [eslesme-fiyat WP1] preflightExport / explainChannelProduct — bellek-içi sahte bağımlılıklar (DB/ağ yok).
import { describe, it, expect, jest } from '@jest/globals';
import { explainChannelProduct, preflightExport, PreflightDeps } from '@operations/integrations/preflight';

const PRODUCT = { _id: 'p1', title: 'Elbise', category: 'cat1', brand: 'br1', taxPercentage: 10 };
const VARIANT = {
  _id: 'v1', productId: 'p1', barcode: 'B1', stock: 5, images: ['https://cdn/1.jpg'],
  prices: { salePrice: 100, marketPrice: 120 }, choices: [{ choiceId: 'ch1', choiceValueId: 'cv1' }],
  platforms: { trendyol: { prices: { salePrice: 110, marketPrice: 130 }, upload: { TRANSFER: { status: 'FAILED', issues: [{ code: 'PLATFORM_REJECTED' }] } } } },
};

function deps(over: { mappings?: any[]; brandId?: any; validate?: any } = {}): PreflightDeps & { saved: any[] } {
  const mappings = over.mappings ?? [
    { integrationCode: 'trendyol', isCategoryMapping: true, localCategoryId: 'cat1', platformCategoryId: 411, platformCategoryName: 'Kadın>Elbise', updatedAt: '2026-10-01T10:00:00Z', updatedBy: 'Ayşe' },
    { integrationCode: 'trendyol', localCategoryId: 'cat1', platformCategoryId: 411, localChoiceId: 'ch1', platformAttributeId: 47, platformAttributeName: 'Renk', values: [{ localValueId: 'cv1', platformValueId: 9001, platformValueName: 'Kırmızı' }] },
  ];
  const saved: any[] = [];
  return {
    saved,
    findVariants: jest.fn(async (q: any) => [VARIANT].filter((v) => q.variantIds?.includes(v._id) || q.productIds?.includes(v.productId))) as any,
    findProducts: jest.fn(async (ids: string[]) => [PRODUCT].filter((p) => ids.includes(p._id))) as any,
    mappingSource: () => ({
      getAllAttributeMappings: async () => mappings,
      getPlatformCategoryId: async (id: string) => mappings.find((m) => m.isCategoryMapping && m.localCategoryId === id)?.platformCategoryId,
      getAttributeMappingsForCategory: async (id: string) => mappings.filter((m) => !m.isCategoryMapping && m.localCategoryId === id),
      getPlatformBrandId: async () => over.brandId,
      getLocalCategoryTitle: async () => 'Elbise (yerel)',
      getLocalBrandTitle: async () => 'Markam',
    }),
    adapterValidate: over.validate ?? (async () => ({ result: true })),
  };
}

describe('preflightExport', () => {
  it('hazır ürün: issues yok, önizleme kanal fiyatı + eşlenmiş kategori + çözülen özellik; varyant bellekte değişmez', async () => {
    const res = await preflightExport({ variantIds: ['v1'], integrationCodes: ['trendyol'] }, deps({ brandId: 77 }));
    const ch = res.items[0].channels[0];
    expect(ch.ready).toBe(true);
    expect(ch.issues).toEqual([]);
    expect(ch.resolvedPreview).toMatchObject({ category: { localId: 'cat1', platformId: 411 }, brand: { platformId: 77 }, vatRate: 10, imageCount: 1, stock: 5, price: { salePrice: 110, source: 'variant.platforms.trendyol.prices' } });
    expect(ch.resolvedPreview.attributesFromMapping).toEqual(['47']);
    expect((VARIANT.platforms.trendyol as any).attributes).toBeUndefined(); // kuru çalıştırma
    expect(res.summary.trendyol).toEqual({ total: 1, ready: 1, blocked: 0, withWarnings: 0 });
  });

  it('kategori/marka eşlemesi yoksa MAP_CATEGORY_MISSING + MAP_BRAND_MISSING; adaptör validate çağrılmaz', async () => {
    const d = deps({ mappings: [], brandId: undefined });
    const res = await preflightExport({ productIds: ['p1'], integrationCodes: ['trendyol'] }, d);
    expect(res.items[0].channels[0].issues.map((i: any) => i.code)).toEqual(['MAP_CATEGORY_MISSING', 'MAP_BRAND_MISSING']);
    expect(res.summary.trendyol.blocked).toBe(1);
    expect(d.adapterValidate).not.toBe(undefined);
  });

  it('HB marka kimliği istemez; adaptör reddi errorMap ile koda; kurulu olmayan kanal INTEGRATION_NOT_CONFIGURED', async () => {
    const hb = deps({ mappings: [{ integrationCode: 'hepsiburada', isCategoryMapping: true, localCategoryId: 'cat1', platformCategoryId: 6001 }], validate: async () => ({ result: false, reason: 'Marka bulunamadı' }) });
    const r1 = await preflightExport({ variantIds: ['v1'], integrationCodes: ['hepsiburada'] }, hb);
    expect(r1.items[0].channels[0].issues.map((i: any) => i.code)).toEqual(['HB_BRAND_UNMATCHED']);

    const nc = deps({ brandId: 1, validate: async () => { throw new Error('Ayarları bulunamadı'); } });
    const r2 = await preflightExport({ variantIds: ['v1'], integrationCodes: ['trendyol'] }, nc);
    expect(r2.items[0].channels[0].issues[0]).toMatchObject({ code: 'INTEGRATION_NOT_CONFIGURED', link: { screen: 'integrations/MarketplaceView' } });
  });

  it('ürün kaydı yoksa PRODUCT_NOT_FOUND; varyant bulunamazsa items boş', async () => {
    const d = deps();
    (d as any).findProducts = async () => [];
    const r = await preflightExport({ variantIds: ['v1'], integrationCodes: ['n11'] }, d);
    expect(r.items[0].channels[0].issues.map((i: any) => i.code)).toEqual(['PRODUCT_NOT_FOUND']);
    expect((await preflightExport({ variantIds: ['yok'], integrationCodes: ['n11'] }, deps())).items).toEqual([]);
  });
});

describe('explainChannelProduct', () => {
  it('kategori ← AttributeMappings (tarih, kişi); fiyat ← kanal fiyatı; özellik zinciri; son yükleme durumu', async () => {
    const r: any = await explainChannelProduct({ variantId: 'v1', integrationCode: 'trendyol' }, deps({ brandId: 77 }));
    const f = Object.fromEntries(r.fields.map((x: any) => [x.field, x]));
    expect(f.category.chain[1]).toBe('kanal kategorisi Kadın>Elbise ← AttributeMappings (2026-10-01, Ayşe)');
    expect(f.price).toMatchObject({ value: 110, source: 'variant.platforms.trendyol.prices' });
    expect(f.brand.chain[1]).toContain('77');
    expect(f.vatRate).toMatchObject({ value: 10, source: 'product.taxPercentage' });
    expect(f.attributes.chain[1]).toBe('eşlemeden çözülen: 1 (47)');
    expect(r.lastUpload.TRANSFER).toMatchObject({ status: 'FAILED', issues: [{ code: 'PLATFORM_REJECTED' }] });
  });

  it('varyant yoksa null', async () => {
    expect(await explainChannelProduct({ variantId: 'yok', integrationCode: 'trendyol' }, deps())).toBeNull();
  });
});
