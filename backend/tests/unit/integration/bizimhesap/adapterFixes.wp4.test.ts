// [eslesme-fiyat WP4, 02-ekler/bizimhesap C-1..C-5 (D-BH-1..3)] taban, Key+Token aynı anahtar, zarf/hata, id ile gruplama, sipariş ucu yok.
import { describe, it, expect } from '@jest/globals';
import Service from '@integration/modules/erp/bizimhesap/services/Service';
import { readProductsEnvelope } from '@integration/modules/erp/bizimhesap/services/ProductService';
import { OrderService } from '@integration/modules/erp/bizimhesap/services/OrderService';
import { ProductTransformer } from '@integration/modules/erp/bizimhesap/transformers/ProductTransformer';

const params = (settings: any = { key: 'FIRMA', secret: 'APIKEY-1' }, urls: any = {}) => ({ clientId: 1, integrationSettings: { settings, urls } });

describe('Bizimhesap (WP4 D-BH-1..3)', () => {
  it('D-BH-1: varsayılan taban bizimhesap.com/api/b2b; Key ve Token aynı API anahtarı', async () => {
    const s = new Service(params());
    expect(s.resolveUrl('products')).toBe('https://bizimhesap.com/api/b2b/products');
    const h: any = (await (s as any).authConfig()).headers;
    expect(h.key).toBe('APIKEY-1');
    expect(h.token).toBe('APIKEY-1');
    const legacy: any = (await (new Service(params({ key: 'YALNIZKEY' })) as any).authConfig()).headers;
    expect([legacy.key, legacy.token]).toEqual(['YALNIZKEY', 'YALNIZKEY']);
  });

  it('zarf: resultCode=0 → VALIDATION; data.products dizi; beklenmedik nesne → VALIDATION (sahte boş başarı yok)', () => {
    expect(readProductsEnvelope({ resultCode: 1, data: { products: [{ id: 1 }] } }, 'c')).toEqual([{ id: 1 }]);
    expect(readProductsEnvelope([{ id: 2 }], 'c')).toEqual([{ id: 2 }]);
    expect(() => readProductsEnvelope({ resultCode: 0, errorText: 'Yetkisiz', data: {} }, 'c')).toThrow(/Yetkisiz/);
    expect(() => readProductsEnvelope({ data: { products: { x: 1 } } }, 'c')).toThrow(/zarf/);
  });

  it('D-BH-2: aynı id farklı yazımlı başlıklar tek ürün altında toplanır', async () => {
    const out = await new ProductTransformer().convertProducts([
      { id: 'P1', title: 'Gömlek', code: 'G-L', barcode: '1', price: 10, variantName: 'Beden', variant: 'L' },
      { id: 'P1', title: 'GÖMLEK Mavi', code: 'G-M', barcode: '2', price: 10, variantName: 'Beden', variant: 'M' },
      { id: 'P2', title: 'Gömlek', code: 'X', barcode: '3', price: 5 },
    ], undefined);
    expect(out).toHaveLength(2); // P1 (iki yazım) + P2 (aynı slug, farklı id → ayrı ürün)
    expect(new Set(out.map((p: any) => p.maincode)).size).toBe(2);
    const p1 = out.find((p: any) => p.variants.some((v: any) => v.stockcode === 'G-M'));
    expect(p1.variants.map((v: any) => v.stockcode).sort()).toEqual(['G-L', 'G-M']);
  });

  it('D-BH-3: sipariş listesi adresi yoksa NOT_SUPPORTED (eskiden sessiz [])', async () => {
    await expect(new OrderService(params(), {} as any).fetchOrders({})).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });
});
