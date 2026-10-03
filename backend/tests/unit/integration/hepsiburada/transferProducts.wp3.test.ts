// [eslesme-fiyat WP3, D-HB-2 / K-4 / K-5] HB ürün gönderimi: kategori kimliği AttributeMappings'ten, marka ADI, zorunlu özellik denetimi.
// Ağ YOK: connector sahte. İçe aktarılmış ürün (mapping.categoryId/brandId) geriye uyumlu kalır.
import { describe, it, expect, jest } from '@jest/globals';
import { ProductService } from '@integration/modules/marketplace/hepsiburada/services/ProductService';
import { CategoryMapper } from '@integration/modules/marketplace/hepsiburada/transformers/CategoryTransformer';

const CODE = 'hepsiburada';
const variant = (over: any = {}) => ({
  _id: 'v1', barcode: 'B1', stockcode: 'SKU1', maincode: 'M1', stock: 3, images: ['https://x/1.jpg'],
  prices: { salePrice: 100 }, product: { title: 'Elbise', category: 'cat1', brand: 'br1', taxPercentage: 20 },
  platforms: { [CODE]: { prices: { salePrice: 100 }, mapping: {}, attributes: { renk_variant_property: { attributeValueId: 'Kırmızı' } } } },
  ...over,
});
const CAT_ATTRS = [
  { _id: 'UrunAdi', title: 'Ürün Adı', required: true, base: true },
  { _id: 'renk_variant_property', title: 'Renk', required: true, varianter: true },
  { _id: 'beden', title: 'Beden', required: true },
  { _id: 'opsiyonel', title: 'Opsiyonel', required: false },
] as any[];

function setup(opts: { platformCat?: any; brandTitle?: string; attrs?: any[] } = {}) {
  const mappingProvider = {
    getPlatformCategoryId: jest.fn(async () => opts.platformCat),
    getLocalBrandTitle: jest.fn(async () => opts.brandTitle ?? 'Bilinmeyen Marka'),
  };
  const categoryService = { fetchCategoryAttributes: jest.fn(async () => opts.attrs ?? []) };
  const ps = new ProductService({ clientId: 1, mappingProvider, integrationSettings: { settings: { SELLERID: 'merchant-uuid', APIKEY: 'k' } } }, {} as any, categoryService);
  const importProducts = jest.fn(async (_items: any[]) => ({ success: true, data: { trackingId: 'T1' } }));
  (ps as any).connector = { importProducts };
  return { ps, importProducts, mappingProvider, categoryService };
}

describe('HB transferProducts (WP3)', () => {
  it('kategori kimliği AttributeMappings\'ten, Marka = Brands.title, merchant = SELLERID; zorunlu özellikler tamam → gönderilir', async () => {
    const { ps, importProducts, categoryService } = setup({ platformCat: '60001', brandTitle: 'Markam', attrs: CAT_ATTRS.filter((a) => a._id !== 'beden') });
    const r = await ps.transferProducts([{ payload: variant() } as any, { payload: variant({ _id: 'v2', barcode: 'B2' }) } as any]);
    expect(r).toMatchObject({ result: true, trackingId: 'T1', failedVariants: [] });
    const item = importProducts.mock.calls[0][0][0];
    expect(item).toMatchObject({ categoryId: 60001, merchant: 'merchant-uuid' });
    expect(item.attributes.Marka).toBe('Markam');
    expect(categoryService.fetchCategoryAttributes).toHaveBeenCalledTimes(1); // paket içinde kategori başına tek okuma
  });

  it('kategori eşlemesi yoksa ve içe aktarılmış kimlik de yoksa gönderilmez (MAP_CATEGORY_MISSING metni)', async () => {
    const { ps, importProducts } = setup({ platformCat: undefined, brandTitle: 'Markam' });
    const r = await ps.transferProducts([{ payload: variant() } as any]);
    expect(importProducts).not.toHaveBeenCalled();
    expect(r.failedVariants[0].reason).toBe('Hepsiburada kategori eşlemesi bulunamadı.');
  });

  it('içe aktarılmış ürün: mapping.categoryId ve HB marka metni (mapping.brandId) yedek olarak kullanılır', async () => {
    const { ps, importProducts } = setup({ platformCat: undefined });
    const v = variant({ product: { title: 'X' }, platforms: { [CODE]: { prices: { salePrice: 10 }, mapping: { categoryId: 777, brandId: 'Nike' }, attributes: {} } } });
    await ps.transferProducts([{ payload: v } as any]);
    expect(importProducts.mock.calls[0][0][0]).toMatchObject({ categoryId: 777, attributes: { Marka: 'Nike' } });
  });

  it('kategoriye özgü zorunlu özellik eksikse gönderilmez; temel kova (base) denetlenmez; mesaj alan bazlı', async () => {
    const { ps, importProducts } = setup({ platformCat: '60001', brandTitle: 'Markam', attrs: CAT_ATTRS });
    const r = await ps.transferProducts([{ payload: variant() } as any]);
    expect(importProducts).not.toHaveBeenCalled();
    expect(r.failedVariants[0].reason).toBe('Hepsiburada zorunlu özellik eksik: Beden (beden)');
  });

  it('marka bulunamazsa gönderilmez', async () => {
    const { ps } = setup({ platformCat: '60001' });
    const r = await ps.transferProducts([{ payload: variant() } as any]);
    expect(r.failedVariants[0].reason).toMatch(/marka adı bulunamadı/);
  });
});

describe('HB CategoryMapper.toInternalAttributes (WP3)', () => {
  it('enum → lazyValues; temel kova base; varyant kovası varianter; mandatory → required', () => {
    const out = new CategoryMapper().toInternalAttributes({ data: {
      baseAttributes: [{ id: 'UrunAdi', name: 'Ürün Adı', mandatory: true, type: 'string' }],
      attributes: [{ id: 'kumas', name: 'Kumaş', mandatory: false, type: 'enum' }],
      variantAttributes: [{ id: 'renk_variant_property', name: 'Renk', mandatory: true, type: 'enum', multiValue: false }],
    } }) as any[];
    const by = Object.fromEntries(out.map((a) => [a._id, a]));
    expect(by.UrunAdi).toMatchObject({ base: true, lazyValues: false, required: true, allowCustom: true });
    expect(by.kumas).toMatchObject({ base: false, lazyValues: true, allowCustom: false });
    expect(by.renk_variant_property).toMatchObject({ varianter: true, required: true, lazyValues: true });
  });
});
