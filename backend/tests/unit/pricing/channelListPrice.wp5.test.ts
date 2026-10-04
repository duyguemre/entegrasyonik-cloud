// [eslesme-fiyat WP5] Liste (üstü çizili) fiyatı ayrı kaynaktan: Validator staging `listPrice` (effectiveListPrice) → N11 gövdesi.
// WP4'te N11 liste fiyatı bilinçli olarak satışa eşit bırakılmıştı. Ağ YOK.
import { describe, it, expect } from '@jest/globals';
import { ProductMapper, n11ListPrice } from '@integration/modules/marketplace/n11/transformers/Mappers';

const catAttrs: any[] = [{ _id: '1', title: 'Marka', required: true, allowCustom: true, values: [] }];
const settings = { shippingId: 'Standart', shippingDuration: 2, taxPercentage: 10 };
const sp = (over: any = {}, prices: any = { isPlatformBasedPrice: false, salePrice: 100, marketPrice: 150 }): any => ({
  integrationCode: 'n11', productId: 'v1', barcode: 'BC1', stockcode: 'SKU1', price: 100, stock: 5, title: 'T',
  payload: { _id: 'v1', barcode: 'BC1', stockcode: 'SKU1', maincode: 'M1', stock: 5, images: ['https://i/a.jpg'], prices,
    product: { title: 'E', description: 'A' }, platforms: { n11: { mapping: {} } } },
  ...over,
});

describe('n11ListPrice', () => {
  it('staging listPrice önceliklidir; yoksa payload ana/kanal fiyatından; ≥ satış; 2 ondalık', () => {
    expect(n11ListPrice(sp({ listPrice: 180 }), 100)).toBe(180);
    expect(n11ListPrice(sp(), 100)).toBe(150);
    expect(n11ListPrice(sp({ listPrice: 80 }), 100)).toBe(100); // liste < satış gönderilmez
    expect(n11ListPrice(sp({ payload: undefined }), 99.999)).toBe(100);
    expect(n11ListPrice(sp({}, { isPlatformBasedPrice: true, salePrice: 100, marketPrice: 150 }), 100)).toBe(150);
  });

  it('kanal özel fiyatı (bayrak) liste fiyatı da kanaldan', () => {
    const s = sp({}, { isPlatformBasedPrice: true, salePrice: 100, marketPrice: 150 });
    s.payload.platforms.n11.prices = { salePrice: 90, marketPrice: 199.5 };
    expect(n11ListPrice(s, 90)).toBe(199.5);
  });

  it('ürün oluşturma ve toplu güncelleme gövdeleri liste fiyatını ayrı taşır', () => {
    const m = new ProductMapper();
    const { sku } = m.toRestCreateSku(sp({ listPrice: 175 }), { categoryId: 1, brandName: 'X', catAttrs, settings });
    expect(sku).toMatchObject({ salePrice: 100, listPrice: 175 });
    const upd = m.mapToRestBulkUpdate([sp({ listPrice: 175 })], 'entegrasyonik');
    expect(upd.payload.skus[0]).toMatchObject({ salePrice: 100, listPrice: 175 });
    const cr = m.mapToRestBulkCreate([sp({ listPrice: 175 })], 'entegrasyonik');
    expect(cr.payload.skus[0]).toMatchObject({ salePrice: 100, listPrice: 175 });
  });
});
