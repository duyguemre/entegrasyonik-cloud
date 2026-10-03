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

describe('Trendyol WP4 — kargo modeli (K-D)', () => {
  const { OrderService } = require('@integration/modules/marketplace/trendyol/services/OrderService');
  const { resolveShippingModel } = require('@integration/modules/marketplace/trendyol/constants');
  const withModel = (shippingModel?: string) => ({ ...params, integrationSettings: { ...params.integrationSettings, settings: { SELLERID: '42', shippingModel } } });

  it('varsayılan marketplace: bildirim yapılmaz, dürüst performed:false', async () => {
    const svc = fakeService();
    const r = await new OrderService(withModel(undefined), svc as any).sendOrderShipping({ orderId: 'P1', trackingCode: 'T1' } as any);
    expect(r).toMatchObject({ success: true, performed: false });
    expect(svc.put).not.toHaveBeenCalled();
    expect(svc.post).not.toHaveBeenCalled();
    expect(resolveShippingModel({})).toBe('marketplace');
  });

  it('seller: takip numarası update-tracking-number ucuna PUT; eksik takip no VALIDATION', async () => {
    const svc = fakeService();
    const os = new OrderService(withModel('seller'), svc as any);
    const r = await os.sendOrderShipping({ orderId: 'P1', trackingCode: 'T1' } as any);
    expect(r).toMatchObject({ success: true, performed: true });
    expect(svc.put.mock.calls[0][0]).toBe('https://apigw.trendyol.com/integration/order/sellers/42/shipment-packages/P1/update-tracking-number');
    expect(svc.put.mock.calls[0][1]).toEqual({ trackingNumber: 'T1' });
    await expect(os.sendOrderShipping({ orderId: 'P1', trackingCode: '' } as any)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('Trendyol tedarik edememe reasonId + mikro ihracat faturası (WP4 C-11 / C-6)', () => {
  const { OrderConnector } = require('@integration/modules/marketplace/trendyol/api/OrderConnector');
  const make = (put: any = jest.fn(async () => ({})), post: any = jest.fn(async () => ({ data: {} }))) => {
    const c = new OrderConnector({ put, post } as any, { clientId: 1, integrationSettings: { settings: { SELLERID: '9' }, urls: {} } });
    return { c, put, post };
  };

  it('reasonId sayı değilse ağa yazmadan VALIDATION; sayıysa number olarak gider', async () => {
    const { c, put } = make();
    await expect(c.rejectOrder('P1', { reasonId: 'OUT_OF_STOCK', lineItems: [{ externalLineId: '5', quantity: 1 }] } as any)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(put).not.toHaveBeenCalled();
    await c.rejectOrder('P1', { reasonId: '500', lineItems: [{ externalLineId: '5', quantity: 1 }] } as any);
    expect((put.mock.calls[0] as any[])[1]).toEqual({ lines: [{ lineId: 5, quantity: 1 }], reasonId: 500 });
  });

  it('mikro ihracat: invoiceNumber biçimi + invoiceDateTime zorunlu; normal pakette invoiceDateTime gönderilmez; 409 anlamlı hata', async () => {
    const { c, post } = make();
    const base = { orderId: '123', pdfUrl: 'https://f/x.pdf', invoiceDate: '2026-10-01T10:00:00Z', invoiceAmount: 1, documentType: 'E_ARSIV', currency: 'TRY' };
    await expect(c.sendOrderInvoice({ ...base, invoiceNumber: 'X1', meta: { platformOrder: { micro: true } } } as any)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(post).not.toHaveBeenCalled();
    await c.sendOrderInvoice({ ...base, invoiceNumber: 'ABC2026000000001', meta: { platformOrder: { etgbNo: 'E1' } } } as any);
    expect((post.mock.calls[0] as any[])[1]).toMatchObject({ shipmentPackageId: 123, invoiceNumber: 'ABC2026000000001', invoiceDateTime: Date.parse('2026-10-01T10:00:00Z') });
    await c.sendOrderInvoice({ ...base, invoiceNumber: 'N1' } as any);
    expect((post.mock.calls[1] as any[])[1].invoiceDateTime).toBeUndefined();
    const conflict = make(undefined, jest.fn(async () => { const e: any = new Error('409'); e.response = { status: 409 }; throw e; }));
    await expect(conflict.c.sendOrderInvoice({ ...base, invoiceNumber: 'N1' } as any)).rejects.toMatchObject({ code: 'VALIDATION', platformCode: 'INVOICE_LINK_CONFLICT' });
  });
});
