// [eslesme-fiyat WP4, 02-ekler/n11 C-1 / D-N11-1 / D-N11-4 (P0)] N11 `product-create` gövdesi: attributes (Marka id 1 dahil),
// shipmentTemplate, vatRate, productMainId, preparingDay. Eskiden bu alanlar hiç gönderilmiyordu → her ürün ret. Ağ YOK: bağlayıcı sahte.
import { describe, it, expect, jest } from '@jest/globals';
import { ProductService } from '@integration/modules/marketplace/n11/services/ProductService';
import { ProductMapper, N11_MAX_SKUS_PER_TASK } from '@integration/modules/marketplace/n11/transformers/Mappers';

const catAttrs: any[] = [
  { _id: '1', title: 'Marka', required: true, allowCustom: true, values: [{ id: '501', title: 'Acme' }] },
  { _id: '20', title: 'Renk', required: true, allowCustom: false, values: [{ id: '7', title: 'Kırmızı' }] },
  { _id: '30', title: 'Materyal', required: false, allowCustom: true, values: [] },
];

const sp = (over: any = {}, vOver: any = {}): any => ({
  productId: 'v1', barcode: 'BC1', stockcode: 'SKU1', price: 199.9, stock: 5, title: 'T',
  payload: {
    _id: 'v1', barcode: 'BC1', stockcode: 'SKU1', maincode: 'MAIN1', stock: 5,
    images: ['https://img/a.jpg', { url: 'https://img/b.jpg' }],
    product: { title: 'Elbise', description: 'Açıklama', category: 'LC1', brand: 'LB1' },
    platforms: { n11: { attributes: { '20': { attributeValueId: '7', attributeValue: 'Kırmızı' }, '30': { attributeValue: 'Pamuk' } }, mapping: {} } },
    ...vOver,
  },
  ...over,
});

const settings = { shippingId: 'Standart', shippingDuration: 2, taxPercentage: 10, maxPurchaseQuantity: 3 };

describe('N11 ürün oluşturma gövdesi (WP4 C-1)', () => {
  it('tam SKU gövdesi: attributes (Marka kimlikle), shipmentTemplate, vatRate, productMainId, preparingDay, images[]', () => {
    const { sku, errors } = new ProductMapper().toRestCreateSku(sp(), { categoryId: '1000', brandName: 'acme', catAttrs, settings });
    expect(errors).toEqual([]);
    expect(sku).toMatchObject({
      title: 'Elbise', description: 'Açıklama', categoryId: 1000, productMainId: 'MAIN1', stockCode: 'SKU1', barcode: 'BC1',
      quantity: 5, salePrice: 199.9, listPrice: 199.9, currencyType: 'TL', vatRate: 10, shipmentTemplate: 'Standart', preparingDay: 2,
      maxPurchaseQuantity: 3,
      images: [{ url: 'https://img/a.jpg', order: 1 }, { url: 'https://img/b.jpg', order: 2 }],
    });
    expect(sku.attributes).toEqual(expect.arrayContaining([
      { id: 20, valueId: 7 }, { id: 30, customValue: 'Pamuk' }, { id: 1, valueId: 501 },
    ]));
    expect(sku.attributes).toHaveLength(3);
  });

  it('listede olmayan marka customValue ile gider; valueId ve customValue aynı elemanda karışmaz', () => {
    const { sku, errors } = new ProductMapper().toRestCreateSku(sp(), { categoryId: 1000, brandName: 'YeniMarka', catAttrs, settings });
    expect(errors).toEqual([]);
    expect(sku.attributes).toContainEqual({ id: 1, customValue: 'YeniMarka' });
    for (const a of sku.attributes) expect('valueId' in a && 'customValue' in a).toBe(false);
  });

  it('eksikler alan bazlı hata: kargo şablonu, geçersiz KDV, zorunlu özellik, listede olmayan değer', () => {
    const bad = sp({}, { platforms: { n11: { attributes: { '20': { attributeValue: 'Mor' } }, mapping: {} } } });
    const { errors } = new ProductMapper().toRestCreateSku(bad, { categoryId: 1, catAttrs, settings: { taxPercentage: 18 } });
    const all = errors.join(' | ');
    expect(all).toMatch(/shipmentTemplate/);
    expect(all).toMatch(/vatRate.*18/);
    expect(all).toMatch(/Renk \(20\).*Mor/);
    expect(all).toMatch(/zorunlu özellik eksik: .*Marka \(1\)/);
  });

  it('kategori özellikleri okunamazsa marka yine zorunlu; boş attributes/images [] olarak gider', () => {
    const v = sp({}, { images: [], platforms: { n11: { attributes: {}, mapping: { shippingId: 'Varyant' } } } });
    const m = new ProductMapper();
    expect(m.toRestCreateSku(v, { categoryId: 1, settings }).errors.join()).toMatch(/Marka \(1\)/);
    const { sku, errors } = m.toRestCreateSku(v, { categoryId: 1, brandName: 'X', settings });
    expect(errors).toEqual([]);
    expect(sku.images).toEqual([]);
    expect(sku.attributes).toEqual([{ id: 1, customValue: 'X' }]);
    expect(sku.shipmentTemplate).toBe('Varyant'); // varyant ayarı mağaza ayarını ezer
  });

  it('servis: kategori AttributeMappings\'ten, marka Brands.title\'dan; eksik varyant gönderilmez; 1000 SKU\'da bölünür', async () => {
    const mappingProvider = {
      getPlatformCategoryId: jest.fn(async () => '1000'),
      getLocalBrandTitle: jest.fn(async () => 'Acme'),
    };
    const fetchCategoryAttributes = jest.fn(async () => catAttrs);
    const svc = new ProductService({ clientId: 7, mappingProvider, integrationSettings: { settings, urls: {} } }, {} as any, { fetchCategoryAttributes });
    let n = 0;
    const transferProductsRest = jest.fn(async () => ({ id: `T${++n}`, status: 'IN_QUEUE' }));
    (svc as any).connector = { transferProductsRest };

    const good = Array.from({ length: N11_MAX_SKUS_PER_TASK + 1 }, (_, i) => sp({ productId: `v${i}`, barcode: `B${i}` }));
    const badOne = sp({ productId: 'bad', barcode: 'BX' }, { platforms: { n11: { attributes: {}, mapping: {} } } });
    const res = await svc.transferProducts([...good, badOne]);

    expect(fetchCategoryAttributes).toHaveBeenCalledTimes(1); // kategori başına bir kez
    expect(transferProductsRest).toHaveBeenCalledTimes(2);
    const body: any = (transferProductsRest.mock.calls[0] as any[])[0];
    expect(body.payload.integrator).toBe('Entegrasyonik_7');
    expect(body.payload.skus).toHaveLength(N11_MAX_SKUS_PER_TASK);
    expect(body.payload.skus[0]).toMatchObject({ categoryId: 1000, shipmentTemplate: 'Standart', vatRate: 10 });
    expect(body.payload.skus[0].attributes).toContainEqual({ id: 1, valueId: 501 });
    expect(res.result).toBe(true);
    expect(res.trackingId).toBe('T1');
    expect(res.variantList).toHaveLength(N11_MAX_SKUS_PER_TASK + 1);
    expect(res.variantList[N11_MAX_SKUS_PER_TASK]).toMatchObject({ variantId: `v${N11_MAX_SKUS_PER_TASK}`, taskId: 'T2' });
    expect(res.failedVariants).toHaveLength(1);
    expect(res.failedVariants[0]).toMatchObject({ variantId: 'bad' });
    expect(res.failedVariants[0].reason).toMatch(/Renk \(20\)/);
  });

  it('servis: kategori eşlemesi yoksa ağ çağrısı yapılmaz', async () => {
    const svc = new ProductService({ clientId: 7, mappingProvider: { getPlatformCategoryId: async () => undefined }, integrationSettings: { settings } }, {} as any);
    const transferProductsRest = jest.fn();
    (svc as any).connector = { transferProductsRest };
    const res = await svc.transferProducts([sp()]);
    expect(transferProductsRest).not.toHaveBeenCalled();
    expect(res.result).toBe(false);
    expect(res.failedVariants[0].reason).toMatch(/kategori eşlemesi/);
  });
});
