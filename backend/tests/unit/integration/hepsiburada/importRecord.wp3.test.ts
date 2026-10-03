// [eslesme-fiyat WP3, D-HB-1 / K-3] HB içe aktarım: katalog (ürün bilgisi) + listing (fiyat/stok) birleşimi; Stager'a ham düz kayıt.
import { describe, it, expect, jest } from '@jest/globals';
import { compactCatalogProduct, toImportRecord } from '@integration/modules/marketplace/hepsiburada/transformers/importRecord';
import { ProductService } from '@integration/modules/marketplace/hepsiburada/services/ProductService';

const CATALOG_RAW = {
  merchantSku: 'SKU-1', hbSku: 'HBV1', barcode: '869000', productName: 'Elbise', categoryId: 60001, brand: 'Markam',
  baseAttributes: [{ name: 'VaryantGroupID', value: 'G-1' }, { name: 'Image1', value: 'https://x/1.jpg' }, { name: 'tax_vat_rate', value: '10' }],
  productAttributes: [{ name: 'kumas', value: 'Pamuk' }], variantTypeAttributes: [{ name: 'renk_variant_property', value: 'Kırmızı' }],
};

describe('compactCatalogProduct / toImportRecord', () => {
  it('katalog alanları hoşgörülü okunur (baseAttributes yedekleri dahil)', () => {
    expect(compactCatalogProduct(CATALOG_RAW)).toEqual({
      merchantSku: 'SKU-1', hbSku: 'HBV1', barcode: '869000', productName: 'Elbise', description: undefined, categoryId: '60001', brand: 'Markam',
      variantGroupId: 'G-1', images: ['https://x/1.jpg'], attributes: { kumas: 'Pamuk', renk_variant_property: 'Kırmızı' }, vatRate: 10,
    });
    expect(compactCatalogProduct({ productName: 'sku yok' })).toBeUndefined();
  });
  it('listing fiyat/stok/satılabilirlik + katalog ürün bilgisi birleşir; katalog yoksa listing alanları', () => {
    const rec = toImportRecord({ merchantSku: 'SKU-1', hbSku: 'HBV1', price: 129.9, availableStock: 4, isSalable: true }, compactCatalogProduct(CATALOG_RAW));
    expect(rec).toMatchObject({ productName: 'Elbise', barcode: '869000', categoryId: '60001', brand: 'Markam', price: 129.9, stockCount: 4, status: 'Active', catalogMatched: true });
    expect(toImportRecord({ merchantSku: 'X', availableStock: 0, isSalable: false })).toMatchObject({ status: 'Passive', stockCount: 0, catalogMatched: false });
  });
});

describe('ProductService.getProductsAndPersist (D-HB-1)', () => {
  it('önce katalog okunur, listing kayıtları merchantSku ile birleşip HAM kayıt olarak akar; convertToInternalModel kategori eşler', async () => {
    const get = jest.fn(async (url: string, _q?: any) => (url.includes('all-products-of-merchant')
      ? { data: { success: true, data: [CATALOG_RAW], totalPages: 1 } }
      : { data: { items: [{ merchantSku: 'SKU-1', hbSku: 'HBV1', price: 99, availableStock: 2, isSalable: true }], totalCount: 1 } }));
    const mappingProvider = { getLocalCategoryId: jest.fn(async () => 'local-cat') };
    const ps = new ProductService({ clientId: 1, mappingProvider, integrationSettings: { settings: { SELLERID: 'M-1' }, urls: {} } }, { get } as any);
    const chunks: any[][] = [];
    const r = await ps.getProductsAndPersist(async (c) => { chunks.push(c); });
    expect(get.mock.calls[0][0]).toBe('product/api/products/all-products-of-merchant/M-1');
    expect(r.status).toBe('COMPLETED');
    expect(chunks[0][0]).toMatchObject({ productName: 'Elbise', price: 99, stockCount: 2, catalogMatched: true });
    const summary = await ps.getSummaryFromRaw(chunks[0][0]);
    expect(summary).toMatchObject({ barcode: '869000', stockcode: 'SKU-1', maincode: 'G-1', platformCategoryId: '60001', images: ['https://x/1.jpg'] });
    const conv = await ps.convertToInternalModel(chunks[0][0]);
    expect(conv.product).toMatchObject({ title: 'Elbise', category: 'local-cat' });
    expect(conv.variant).toMatchObject({ barcode: '869000', stock: 2, onSale: true, maincode: 'G-1' });
  });
});
