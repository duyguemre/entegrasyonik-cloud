// [eslesme-fiyat WP4, API_IDEASOFT K-1/K-2/K-4/K-8 (D-IS-1/2/3/6)] taban /admin-api + token /oauth/v2/token + /panel/auth,
// maincode parent yoksa kendi kimliği, taxIncluded/discount, artımlı sipariş startUpdatedAt. Ağ YOK.
import { describe, it, expect, jest } from '@jest/globals';
import Service from '@integration/modules/ecommerce/ideasoft/services/Service';
import { ProductTransformer } from '@integration/modules/ecommerce/ideasoft/transformers/ProductTransformer';
import { OrderService } from '@integration/modules/ecommerce/ideasoft/services/OrderService';

const params = (urls: any = {}) => ({ clientId: 1, integrationSettings: { settings: { storeName: 'magaza' }, urls } });

describe('Ideasoft adaptör düzeltmeleri (WP4)', () => {
  it('D-IS-1: varsayılan taban /admin-api, token mağaza kökünde /oauth/v2/token, yetkilendirme /panel/auth', () => {
    const s = new Service(params());
    expect(s.resolveUrl('orders')).toBe('https://magaza.myideasoft.com/admin-api/orders');
    expect(s.getTokenUrl()).toBe('https://magaza.myideasoft.com/oauth/v2/token');
    const auth = new URL(s.getAuthorizeUrl('cid', 'https://app/cb', 'st'));
    expect(auth.origin + auth.pathname).toBe('https://magaza.myideasoft.com/panel/auth');
    expect(Object.fromEntries(auth.searchParams)).toEqual({ client_id: 'cid', response_type: 'code', state: 'st', redirect_uri: 'https://app/cb' });
    expect(new Service(params({ baseUrl: 'https://x.ideasoft.com.tr' })).resolveUrl('orders')).toBe('https://x.ideasoft.com.tr/orders'); // tenant ayarı aynen
  });

  it('D-IS-2: parent yoksa maincode ürünün kendi kimliği (eskiden ideasoft_undefined)', () => {
    const t = new ProductTransformer();
    expect(t.mainCodeOf({ id: 42 })).toBe('ideasoft_42');
    expect(t.mainCodeOf({ id: 42 }, { id: 7 })).toBe('ideasoft_7');
    expect(t.toInternalVariant({ id: 5, price1: 10, images: [{ originalUrl: 'https://i/1.jpg' }] }, undefined).maincode).toBe('ideasoft_5');
  });

  it('D-IS-3: taxIncluded=0 → KDV eklenir; indirim yüzde/tutar → salePrice indirimli, marketPrice indirimsiz', () => {
    const t = new ProductTransformer();
    expect(t.pricesOf({ price1: 100, tax: 20, taxIncluded: 1 })).toEqual({ salePrice: 100, marketPrice: 100, tax: 20 });
    expect(t.pricesOf({ price1: 100, tax: 20, taxIncluded: 0 })).toEqual({ salePrice: 120, marketPrice: 120, tax: 20 });
    expect(t.pricesOf({ price1: 100, tax: 20, taxIncluded: 1, discount: 10, discountType: 1 })).toEqual({ salePrice: 90, marketPrice: 100, tax: 20 });
    expect(t.pricesOf({ price1: 100, tax: 20, taxIncluded: 1, discount: 15, discountType: 0 })).toEqual({ salePrice: 85, marketPrice: 100, tax: 20 });
  });

  it('D-IS-6: sipariş çekimi startUpdatedAt (1 gün geri) + endUpdatedAt; belgelenmemiş startDate gitmez', async () => {
    const get = jest.fn(async (..._a: any[]) => ({ data: [] }));
    const svc = new OrderService(params(), { get } as any);
    await svc.fetchOrders({ lastSyncTimestamp: '2026-10-03T10:00:00Z', endDate: '2026-10-04T00:00:00Z' });
    const q: any = (get.mock.calls[0] as any[])[1];
    expect(q).toMatchObject({ limit: 100, page: 1, startUpdatedAt: '2026-10-02', endUpdatedAt: '2026-10-04' });
    expect(q.startDate).toBeUndefined();
  });
});
