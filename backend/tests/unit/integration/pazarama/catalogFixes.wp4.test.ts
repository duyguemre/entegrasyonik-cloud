// [eslesme-fiyat WP4, 02-ekler/pazarama C-1..C-4, C-9 (D-PZ-1..4, 7)] token scope + sarmalı yanıt, marka Page/Size/name,
// stok ucu ve ayrı gövde, batch sonucu getProductBatchResult + isSuccess/status. Ağ YOK: http/bağlayıcı sahte.
import { describe, it, expect, jest } from '@jest/globals';
import Service, { PAZARAMA_TOKEN_SCOPE } from '@integration/modules/marketplace/pazarama/services/Service';
import { BrandService, PAZARAMA_BRAND_PAGE_SIZE } from '@integration/modules/marketplace/pazarama/services/BrandService';
import { ProductService } from '@integration/modules/marketplace/pazarama/services/ProductService';
import { PLATFORM_PROCESS } from '@interfaces/index';

const params = (urls: any = {}) => ({ clientId: 5, integrationSettings: { settings: { APIKEY: 'k', APISECRET: 's' }, urls } });

describe('Pazarama token (C-1 / D-PZ-1)', () => {
  it.each([
    [{ access_token: 'A1', expires_in: 3600 }, 'A1'],
    [{ success: true, data: { accessToken: 'A2', expiresIn: 3600 } }, 'A2'],
  ])('scope gönderilir; iki yanıt şekli okunur (%#)', async (body, tok) => {
    const svc = new Service(params());
    const post = jest.fn(async (..._a: any[]) => ({ data: body }));
    (svc as any).http = { post };
    await expect(svc.getAccessToken()).resolves.toBe(tok);
    const form = String((post.mock.calls[0] as any[])[1]);
    expect(form).toContain(`scope=${encodeURIComponent(PAZARAMA_TOKEN_SCOPE)}`);
    expect(form).toContain('grant_type=client_credentials');
  });
});

describe('Pazarama marka (C-2 / D-PZ-2)', () => {
  it('arama: name + Page=1&Size=100; aramasız: Size sayfalı, son sayfada durur', async () => {
    const svc = new BrandService(params(), {} as any);
    const pages: Record<number, any[]> = {
      1: Array.from({ length: PAZARAMA_BRAND_PAGE_SIZE }, (_, i) => ({ id: i + 1, name: `M${i + 1}` })),
      2: [{ id: 99999, name: 'Son' }],
    };
    const fetchBrandsFromPlatform = jest.fn(async (q: any) => (q.name ? { data: { items: [{ id: 7, name: 'Acme' }] } } : { data: pages[q.Page] || [] }));
    (svc as any).connector = { fetchBrandsFromPlatform };
    await expect(svc.fetchBrands('acme' as any)).resolves.toEqual([{ id: '7', title: 'Acme' }]);
    expect(fetchBrandsFromPlatform.mock.calls[0][0]).toEqual({ name: 'acme', Page: 1, Size: 100 });
    const all = await svc.fetchBrands({});
    expect(all).toHaveLength(PAZARAMA_BRAND_PAGE_SIZE + 1);
    expect(fetchBrandsFromPlatform.mock.calls.slice(1).map(c => c[0])).toEqual([{ Page: 1, Size: PAZARAMA_BRAND_PAGE_SIZE }, { Page: 2, Size: PAZARAMA_BRAND_PAGE_SIZE }]);
  });
});

describe('Pazarama stok ucu + batch sonucu (C-3/C-4/C-9)', () => {
  it('stok product/updateStock ucuna gider', () => {
    const svc = new ProductService(params(), {} as any);
    expect((svc as any).getEndpointUrl(PLATFORM_PROCESS.UPDATE_STOCK)).toBe('product/updateStock');
  });

  it('fiyat/stok sonucu varsayılan getProductBatchResult; status=1 → bekle; isSuccess:false → FAILED + message', async () => {
    const svc = new ProductService(params(), {} as any);
    const fetchBatchResults = jest.fn(async () => ({ data: { status: 2, batchResult: [{ code: 'C1', isSuccess: true }, { code: 'C2', isSuccess: false, message: 'Stok negatif' }] } }));
    const fetchUpdateBatchResults = jest.fn();
    (svc as any).connector = { fetchBatchResults, fetchUpdateBatchResults };
    const r = await svc.checkBatchProduct({ trackingId: 'B1', mode: PLATFORM_PROCESS.UPDATE_STOCK } as any);
    expect(fetchUpdateBatchResults).not.toHaveBeenCalled();
    expect(r).toEqual([
      { matchValue: 'C1', barcode: 'C1', status: 'COMPLETED', messages: ['Başarılı'] },
      { matchValue: 'C2', barcode: 'C2', status: 'FAILED', messages: ['Stok negatif'] },
    ]);
    fetchBatchResults.mockResolvedValueOnce({ data: { status: 1, batchResult: [] } } as any);
    await expect(svc.checkBatchProduct({ trackingId: 'B1', mode: PLATFORM_PROCESS.TRANSFER } as any)).resolves.toBeUndefined();
  });
});

describe('Pazarama özellik tek alan + isRequired (C-6/C-7)', () => {
  const { ProductMapper } = require('@integration/modules/marketplace/pazarama/transformers/ProductTransformer');
  const { CategoryMapper } = require('@integration/modules/marketplace/pazarama/transformers/CategoryTransformer');
  const variant = (attributes: any) => ({ barcode: 'B1', stockcode: 'S1', stock: 1, images: [], product: { title: 'T' },
    platforms: { pazarama: { prices: { salePrice: 10 }, attributes, mapping: {} } } });
  const sp = (v: any) => ({ payload: v } as any);
  const catAttrs = new CategoryMapper().toInternalAttributes([
    { id: 'A1', name: 'Renk', isRequired: true, allowCustom: false, attributeValues: [{ id: 'V1', value: 'Kırmızı' }] },
    { id: 'A2', name: 'Not', allowCustom: true, attributeValues: [] },
  ]);

  it('isRequired okunur; kimlik → yalnız attributeValueId, serbest → yalnız customAttributeValue, metin listedeyse kimliğe çevrilir', () => {
    expect(catAttrs.find((a: any) => a._id === 'A1').required).toBe(true);
    const m = new ProductMapper();
    const item = m.toPlatformBatch(sp(variant({ A1: { attributeValue: 'kırmızı' }, A2: { attributeValueId: 'x', attributeValue: 'El yapımı' } })), PLATFORM_PROCESS.TRANSFER, catAttrs, [], { catId: 1, brandId: 2, settings: {} });
    expect(item.attributes).toEqual([{ attributeId: 'A1', attributeValueId: 'V1' }, { attributeId: 'A2', attributeValueId: 'x' }]);
    expect(() => m.toPlatformBatch(sp(variant({ A2: { attributeValue: 'x' } })), PLATFORM_PROCESS.TRANSFER, catAttrs, [], { catId: 1, brandId: 2, settings: {} })).toThrow(/zorunlu özellik eksik: Renk \(A1\)/);
    expect(() => m.toPlatformBatch(sp(variant({ A1: { attributeValue: 'Mor' } })), PLATFORM_PROCESS.TRANSFER, catAttrs, [], { catId: 1, brandId: 2, settings: {} })).toThrow(/Renk \(A1\).*Mor/);
    const free = m.toPlatformBatch(sp(variant({ A1: { attributeValueId: 'V1' }, A2: { attributeValue: 'El yapımı' } })), PLATFORM_PROCESS.TRANSFER, catAttrs, [], { catId: 1, brandId: 2, settings: {} });
    expect(free.attributes[1]).toEqual({ attributeId: 'A2', customAttributeValue: 'El yapımı' });
  });
});
