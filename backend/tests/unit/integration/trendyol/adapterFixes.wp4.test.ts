// [eslesme-fiyat WP4, D-TY-2/D-TY-4, 02-ekler/trendyol C-2/C-3/C-4/C-7/C-14] Trendyol adaptör düzeltmeleri.
// Ağ YOK: Service sahte (yalnız get/post/put çağrıları kaydedilir).
import { describe, it, expect, jest } from '@jest/globals';
import { BrandConnector } from '@integration/modules/marketplace/trendyol/api/BrandConnector';
import { CategoryConnector } from '@integration/modules/marketplace/trendyol/api/CategoryConnector';
import { ClaimConnector } from '@integration/modules/marketplace/trendyol/api/ClaimConnector';
import { MessageConnector } from '@integration/modules/marketplace/trendyol/api/MessageConnector';
import { BrandMapper } from '@integration/modules/marketplace/trendyol/transformers/BrandTransformer';
import { CategoryMapper } from '@integration/modules/marketplace/trendyol/transformers/CategoryTransformer';
import { MessageTransformer } from '@integration/modules/marketplace/trendyol/transformers/MessageTransformer';
import { CategoryService } from '@integration/modules/marketplace/trendyol/services/CategoryService';
import { TRENDYOL_EXTRA_GROUP_RATE_PER_MIN } from '@integration/modules/marketplace/trendyol/limits';

const params = {
  clientId: 1,
  integrationSettings: {
    settings: { SELLERID: '42' },
    urls: {
      brandListUrl: 'https://apigw.trendyol.com/integration/product/brands',
      categoryListUrl: 'https://apigw.trendyol.com/integration/product/product-categories',
      categoryAttributeListUrl: 'https://apigw.trendyol.com/integration/product/categories/<CATEGORYID>/attributes',
      claimListUrl: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/claims',
      claimApproveUrl: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/claims/<CLAIMID>/items/approve',
      qnaAnswerUrl: 'https://apigw.trendyol.com/integration/qna/sellers/<SELLERID>/questions/<QID>/answers',
    },
  },
};
const fakeService = (data: any = {}) => ({
  get: jest.fn(async (..._a: any[]) => ({ status: 200, data })),
  post: jest.fn(async (..._a: any[]) => ({ status: 200, data: {} })),
  put: jest.fn(async (..._a: any[]) => ({ status: 200, data: {} })),
});

describe('Trendyol WP4 — marka (D-TY-4)', () => {
  it('tam liste size=1000 ve marka/kategori kovası; ad aramasında size gönderilmez', async () => {
    const svc = fakeService({ brands: [] });
    const c = new BrandConnector(svc as any, params);
    await c.fetchBrandsFromPlatform({ page: 0 });
    expect(svc.get.mock.calls[0][1]).toEqual({ page: 0, size: '1000' });
    expect(svc.get.mock.calls[0][2]).toEqual({ group: 'brand_category_read' });
    await c.fetchBrandsFromPlatform('Nike');
    expect(svc.get.mock.calls[1][1]).toEqual({ name: 'Nike' });
    await c.fetchBrandsFromPlatform({ size: '500' });
    expect(svc.get.mock.calls[2][1]).toEqual({ size: '1000' }); // geçersiz 500 → 1000
  });

  it('yanıt `brands[]` (resmî) okunur; düz dizi ve eski `content` geriye uyumlu', () => {
    const m = new BrandMapper();
    expect(m.toInternalBrands({ brands: [{ id: 2, name: 'B' }, { id: 1, name: 'A' }] })).toEqual([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
    expect(m.toInternalBrands([{ id: 3, name: 'C' }])).toEqual([{ id: '3', title: 'C' }]);
    expect(m.toInternalBrands({ content: [{ id: 4, name: 'D' }] })).toEqual([{ id: '4', title: 'D' }]);
  });
});

describe('Trendyol WP4 — kategori özellik değerleri (C-2, C-14)', () => {
  it('değer ucu page/size ile çağrılır', async () => {
    const svc = fakeService({});
    const c = new CategoryConnector(svc as any, params);
    await c.fetchAttributeValuesFromPlatform('10', '47', 2, 1000);
    expect(String(svc.get.mock.calls[0][0])).toContain('/categories/10/attributes/47/values');
    expect(svc.get.mock.calls[0][1]).toEqual({ page: 2, size: 1000 });
    expect(svc.get.mock.calls[0][2]).toEqual({ group: 'brand_category_read' });
  });

  it('CategoryService totalPages kadar sayfa çeker ve `attributeValueId/attributeValue` okur', async () => {
    const cs = new CategoryService(params, {} as any);
    // Önbellek dekoratörünü atlamak için ham prototip yöntemleri yerine bağlayıcıyı sahteleriz; fetchCategoryAttributes da sahte.
    (cs as any).fetchCategoryAttributes = jest.fn(async () => [{ _id: '47', title: 'Renk', values: [] }]);
    const pages = [
      { content: [{ attributeValueId: 1, attributeValue: 'Kırmızı' }], totalPages: 2, page: 0 },
      { content: [{ attributeValueId: 2, attributeValue: 'Mavi' }], totalPages: 2, page: 1 },
    ];
    const fetchValues = jest.fn(async (_c: string, _a: string, page: number) => ({ data: pages[page] }));
    (cs as any).connector = { fetchAttributeValuesFromPlatform: fetchValues };
    const vals = await (CategoryService.prototype as any).fetchCategoryAttributeValues.call(cs, `c-${Date.now()}`, '47');
    expect(fetchValues).toHaveBeenCalledTimes(2);
    expect(vals).toEqual([{ id: '1', title: 'Kırmızı' }, { id: '2', title: 'Mavi' }]);
  });

  it('allowMultipleAttributeValues → multiple', () => {
    const out = new CategoryMapper().toInternalAttributes([
      { attribute: { id: 1, name: 'Renk' }, allowMultipleAttributeValues: true, attributeValues: [] },
      { attribute: { id: 2, name: 'Beden' }, attributeValues: [] },
    ]);
    expect(out.find((a) => a._id === '1')!.multiple).toBe(true);
    expect(out.find((a) => a._id === '2')!.multiple).toBe(false);
  });
});

describe('Trendyol WP4 — iade/soru (C-4, C-7, D-TY-2)', () => {
  it('iade listesi size=200; onay `claim_action` kovası', async () => {
    const svc = fakeService({ content: [], totalPages: 1 });
    const c = new ClaimConnector(svc as any, params);
    await c.fetchClaimsFromPlatform();
    expect(String(svc.get.mock.calls[0][0])).toContain('size=200');
    await c.approveClaim('C1', { claimItemIdList: ['i1'] });
    expect(svc.put.mock.calls[0][2]).toEqual({ group: 'claim_action' });
  });

  it('soru cevabı `qna_answer` kovası; kova değerleri resmî', async () => {
    const svc = fakeService();
    await new MessageConnector(svc as any, params).answerMessage('Q1', 'Merhaba, stokta var.');
    expect(svc.post.mock.calls[0][2]).toEqual({ group: 'qna_answer' });
    expect(TRENDYOL_EXTRA_GROUP_RATE_PER_MIN).toEqual({ brand_category_read: 50, claim_action: 5, qna_answer: 500 });
  });

  it('soru statüleri resmî enum: WAITING_FOR_ANSWER → WAITING_SELLER, REPORTED/UNANSWERED → AUTO_CLOSED', () => {
    const t = new MessageTransformer();
    const st = (s: string) => t.toInternalMessage({ id: 1, status: s, text: 'x' }).status;
    expect(st('WAITING_FOR_ANSWER')).toBe('WAITING_SELLER');
    expect(st('WAITING_SELLER')).toBe('WAITING_SELLER');
    expect(st('ANSWERED')).toBe('ANSWERED');
    expect(st('REPORTED')).toBe('AUTO_CLOSED');
    expect(st('UNANSWERED')).toBe('AUTO_CLOSED');
    expect(t.toInternalMessage({ id: 1, status: 'REPORTED', text: 'x' }).rawMetadata!.platformStatus).toBe('REPORTED');
  });
});
