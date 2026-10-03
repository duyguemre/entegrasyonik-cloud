// INT-05: Pazarama conformance bağlantısı (pazaryeri; AdapterHttpService + OAuthTokenCache tabanında). Gerçek ağ YOK (yerel sunucu).
// Pazarama'ya özgü: her veri isteğinden önce OAuth2 token alınır (`/connect/token`; kit `authHandler` ile karşılar, istek sayımına girmez),
// sayfa numarası POST GÖVDESİNDEDİR (`pageNumber`, 1 tabanlı) ve sayfa boyutu 100'dür (`dönen < 100` = son sayfa).
import Pazarama from '@integration/modules/marketplace/pazarama';
import Service from '@integration/modules/marketplace/pazarama/services/Service';
import { runAdapterConformance, type ConformanceSpec } from './kit';

const APIKEY = 'PZKEY-conf-4d1e';
const APISECRET = 'PZSECRET-conf-a7c3';
const TOKEN = 'PZTOKEN-conf-9b20';
const PII = ['pii.pz@example.invalid', 'Ayse Demir', '05558889900'];
const PAGE_SIZE = 100;

const order = (i: number, j: number, over: Record<string, unknown> = {}) => ({
    OrderId: `PZID-${i}-${j}`, OrderNumber: `PZ-${i}-${j}`, OrderDate: '2026-09-01T10:00:00Z', OrderStatus: 3,
    CustomerId: `CU-${i}-${j}`, CustomerName: PII[1], CustomerEmail: PII[0],
    ShipmentAddress: { NameSurname: PII[1], PhoneNumber: PII[2], AddressDetail: 'Test Mah. 1', CityName: 'Istanbul', DistrictName: 'Kadikoy' },
    OrderAmount: { Value: 10, Currency: 'TRY' }, Currency: 'TRY',
    Items: [{ OrderItemId: `PZL-${i}-${j}`, OrderItemStatus: 3, Quantity: 1, SalePrice: { Value: 10 }, TotalPrice: { Value: 10 }, Product: { ProductId: 'P-1', Name: 'Urun', Code: 'BC-1', VatRate: 18 } }],
    ...over,
});
// Son sayfa (index === count-1) KISA (2 kayıt) döner: adaptör `dönen < 100` ile durur; aradaki sayfalar dolu (perPage).
const pageBody = (i: number, count: number, per: number, over: Record<string, unknown> = {}) =>
    ({ data: Array.from({ length: i === count - 1 ? Math.min(2, per) : per }, (_, j) => order(i, j, over)), success: true });

const variant = () => ({
    _id: 'v1', barcode: 'BC-1', stock: 5, prices: { salePrice: 10, marketPrice: 10 }, platforms: {}, product: { category: 'c1', brand: 'b1' },
});
const params = (baseUrl: string) => ({
    clientId: 87,
    integrationSettings: { settings: { APIKEY, APISECRET }, urls: { baseUrl, tokenUrl: `${baseUrl}/connect/token` } },
    mappingProvider: { getPlatformCategoryId: async () => 'CAT-1', getPlatformBrandId: async () => 'BR-1' },
});

const spec: ConformanceSpec = {
    code: 'pazarama',
    mock: { prefix: 'PAZARAMA' },
    timeoutEnv: 'PAZARAMA_HTTP_TIMEOUT_MS',
    secrets: [APIKEY, APISECRET, TOKEN],
    // Sayfa tavanı 50 sayfa (PZ_MAX_PAGES): sonsuz-sayfa testi bunun üstüne çıkmadan durmalı.
    maxSaneRequests: 60,
    authHandler: (req, res) => {
        if (!req.url?.includes('/connect/token')) return false;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: TOKEN, expires_in: 3600 }));
        return true;
    },
    build: (baseUrl) => ({ platform: new Pazarama(params(baseUrl)), raw: new Service(params(baseUrl)) }),
    read: {
        call: (a) => a.platform.retrieveOrders({}),
        page: (i, count, per) => pageBody(i, count, per),
        pageSize: PAGE_SIZE,
        c6aTotal: PAGE_SIZE * 2 + 2,
        pageIndexOf: (_url, body) => Number(JSON.parse(body || '{}').pageNumber ?? 1) - 1,
        ids: (r) => ({
            orders: r.map((p: any) => String(p.order.externalOrderId)),
            lines: r.flatMap((p: any) => p.order.items.map((l: any) => String(l.externalLineItemId))),
        }),
        packageShapeOk: (r) => r.length > 0 && r.every((p: any) => typeof p.order?.externalOrderId === 'string' && typeof p.customer === 'object'),
        // zorunlu olmayan alan tipi bozuk (Quantity nesne), kimlikler tamam
        driftBody: () => pageBody(0, 1, 2, { Items: [{ OrderItemId: 'PZL-0-0', Quantity: { bozuk: true } }] }),
        missingIdBody: () => ({ data: Array.from({ length: 4 }, () => ({ OrderStatus: 3, Items: [{ Quantity: 1 }] })), success: true }),
        unknownEnumBody: (raw) => pageBody(0, 1, 2, { OrderStatus: raw }),
        statusesOf: (r) => r.map((p: any) => p.order.externalStatus),
        pii: PII,
    },
    write: {
        call: (a) => a.platform.updateProductStock([{ payload: variant(), stockcode: 'SKU-1', productId: 'P-1', stock: 5 } as any]),
        respond: (_req, mode) => {
            if (mode === 'write') return { status: 200, body: { data: 'JOB-CONF-1', success: true } };
            // [eslesme-fiyat WP4, C-4/D-PZ-4] fiyat/stok sonucu `product/getProductBatchResult` ({status 1/2/3, batchResult[]}).
            if (mode === 'batch-done') return { status: 200, body: { data: { status: 2, batchResult: [{ code: 'SKU-1', barcode: 'BC-1', isSuccess: true }] } } };
            return { status: 200, body: { data: { status: 1, batchResult: [] } } };
        },
        shapeOk: (r) => r?.result === true && typeof r.trackingId === 'string' && Array.isArray(r.variantList) && r.variantList.length > 0,
    },
};

runAdapterConformance(spec);
