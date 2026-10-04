// [eslesme-fiyat WP4, D-N11-2 / C-3 / C-4] N11 ürün içe aktarımı: `page`/`size` + `content[]`, düz ham kayıt, iç model (eskiden boş iskelet),
// `productStatus` eşlemesi. Ağ YOK: bağlayıcı sahte; alan adları resmî özetten (10493), canlıda doğrulanmadı.
import { describe, it, expect, jest } from '@jest/globals';
import { ProductService } from '@integration/modules/marketplace/n11/services/ProductService';

const item = (i: number, over: any = {}) => ({
  id: 9000 + i, stockCode: `SKU${i}`, barcode: `BC${i}`, title: `Ürün ${i}`, description: 'D', categoryId: 1001, productMainId: 'GRP',
  salePrice: 120, listPrice: 150, quantity: 4, vatRate: 10, productStatus: 'Active', images: [{ url: 'https://i/1.jpg' }, 'https://i/2.jpg'],
  attributes: [{ attributeId: 1, attributeName: 'Marka', attributeValue: 'Acme' }, { attributeId: 20, attributeName: 'Renk', attributeValue: 'Kırmızı', attributeValueId: 7 }],
  ...over,
});

const svcWith = (fetchProductListRest: any, extra: any = {}) => {
  const svc = new ProductService({ clientId: 3, integrationSettings: { settings: {} }, ...extra }, {} as any);
  (svc as any).connector = { fetchProductListRest };
  return svc;
};

describe('N11 ürün içe aktarımı (WP4 D-N11-2 / C-3)', () => {
  it('page/size ile tüm sayfalar; content[] düz kayda çevrilir; toplam totalElements', async () => {
    const fetch = jest.fn(async (q: any) => ({ content: q.page === 0 ? Array.from({ length: 100 }, (_, i) => item(i)) : [item(100)], totalElements: 101 }));
    const chunks: any[][] = [];
    const r = await svcWith(fetch).streamProducts(async (c) => { chunks.push(c); });
    expect((fetch.mock.calls as any[]).map(c => c[0])).toEqual([{ page: 0, size: 100 }, { page: 1, size: 100 }]);
    expect(r).toMatchObject({ status: 'COMPLETED', totalElements: 101, totalProcessed: 101 });
    expect(chunks[1][0]).toMatchObject({
      id: 9100, stockCode: 'SKU100', barcode: 'BC100', categoryId: 1001, productMainId: 'GRP', salePrice: 120, listPrice: 150,
      quantity: 4, vatRate: 10, brandName: 'Acme', images: ['https://i/1.jpg', 'https://i/2.jpg'],
    });
  });

  it('özet + iç model: yerel kategori Stager\'dan / AttributeMappings\'ten, marka metni mapping.brandName, özellikler kimlik anahtarlı', async () => {
    const getLocalCategoryId = jest.fn(async () => 'LC9');
    const svc = svcWith(jest.fn(), { mappingProvider: { getLocalCategoryId } });
    const rec = (svc as any).mapper.toImportRecord(item(1));
    const sum = await svc.getSummaryFromRaw(rec);
    expect(sum).toMatchObject({ barcode: 'BC1', stockcode: 'SKU1', maincode: 'GRP', platformCategoryId: 1001, salePrice: 120, marketPrice: 150 });

    const a = await svc.convertToInternalModel({ rawData: rec, localCategoryId: 'LC1' });
    expect(getLocalCategoryId).not.toHaveBeenCalled();
    expect(a.product).toMatchObject({ title: 'Ürün 1', brand: null, category: 'LC1', maincode: 'GRP', hasVariant: true });
    expect(a.variant).toMatchObject({ barcode: 'BC1', stockcode: 'SKU1', stock: 4, taxPercentage: 10, onSale: true });
    const n11: any = (a.variant as any).platforms.n11;
    expect(n11.mapping).toMatchObject({ id: 9001, categoryId: 1001, brandName: 'Acme' });
    expect(n11.attributes).toEqual({ '20': { attributeName: 'Renk', attributeValue: 'Kırmızı', attributeValueId: '7' } });
    // [eslesme-fiyat WP5] bilinçli: içe aktarmada kanal fiyat nesnesi yazılmaz (bayrak false), kanal fiyatı `observed`'da.
    expect(n11.prices).toBeUndefined();
    expect(n11.observed).toEqual({ salePrice: 120, marketPrice: 150, source: 'import' });

    const b = await svc.convertToInternalModel({ rawData: rec });
    expect(b.product.category).toBe('LC9');
    await expect(svc.convertToInternalModel({ rawData: { ...rec, categoryId: undefined } })).rejects.toThrow(/kategori/);
  });

  it('C-4: productStatus eşlemesi ve stockCode ile eşleşme', async () => {
    const fetch = jest.fn(async () => ({ content: [item(1), item(2, { productStatus: 'InCatalogApproval' }), item(3, { productStatus: 'CatalogRejected' })] }));
    const out = await svcWith(fetch).updateProductStatuses({ barcodes: [], matchValues: ['SKU1', 'SKU2', 'SKU3', 'YOK'] });
    expect(out.map(o => o.status)).toEqual(['COMPLETED', 'WAITING', 'FAILED', 'WAITING']);
    expect(out[0].mapping).toEqual({ id: 9001, stockcode: 'SKU1' });
  });
});
