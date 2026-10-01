// faz4-db09 (ADR-0032 H1): Ideasoft kanal dış kimliği tek anahtar `mapping`; okuma eski `mappings`'i de tanır.
import { describe, it, expect, jest } from '@jest/globals';
import { ProductService, platformProductId } from '@integration/modules/ecommerce/ideasoft/services/ProductService';

describe('Ideasoft kanal kimliği anahtarı (DB-09)', () => {
  it('platformProductId: `mapping` kazanır; yalnız eski `mappings` varsa onu okur; ikisi de yoksa undefined', () => {
    expect(platformProductId({ mapping: { productId: 1 }, mappings: { productId: 2 } })).toBe(1);
    expect(platformProductId({ mappings: { productId: 2 } })).toBe(2);
    expect(platformProductId({})).toBeUndefined();
    expect(platformProductId(undefined)).toBeUndefined();
  });

  it('yazma YALNIZ `platforms.ideasoft.mapping.productId` yoluna gider (varyant ve ürün)', async () => {
    const variantUpdate = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({});
    const productUpdate = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({});
    const clientDB = { getVariantModel: () => ({ updateOne: variantUpdate }), getProductModel: () => ({ updateOne: productUpdate }) };
    const svc: any = new ProductService({ clientDB }, {} as any);
    await svc.updateVariantPlatformId('v1', 55);
    await svc.updateProductPlatformId('p1', 66);
    expect(variantUpdate).toHaveBeenCalledWith({ _id: 'v1' }, { $set: { 'platforms.ideasoft.mapping.productId': 55 } });
    expect(productUpdate).toHaveBeenCalledWith({ _id: 'p1' }, { $set: { 'platforms.ideasoft.mapping.productId': 66 } });
    expect(JSON.stringify([variantUpdate.mock.calls, productUpdate.mock.calls])).not.toContain('mappings');
  });
});
