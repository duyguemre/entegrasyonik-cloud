// INT-05: Hepsiburada conformance bağlantısı (pazaryeri; AdapterHttpService tabanında). Gerçek ağ YOK (yerel sunucu).
import Hepsiburada from '@integration/modules/marketplace/hepsiburada';
import Service from '@integration/modules/marketplace/hepsiburada/services/Service';
import { runAdapterConformance, type ConformanceSpec } from './kit';

const APIKEY = 'HBKEY-conf-5c2e';
const APISECRET = 'HBSECRET-conf-88d1';
const B64 = Buffer.from(`${APIKEY}:${APISECRET}`).toString('base64');
const PII = ['pii.hb@example.invalid', 'Ayse Demir', '05556667788'];
const PER_PAGE = 2; // kit sayfa başına 2 kayıt üretir; offset/2 = sayfa sırası

const order = (i: number, j: number, over: Record<string, unknown> = {}) => ({
    orderNumber: `HB-${i}-${j}`, status: 'Open', orderDate: '2026-09-01T10:00:00Z',
    customerName: PII[1], customerEmail: PII[0], customerId: `CU-${i}-${j}`,
    shippingAddress: { name: 'Ayse', surname: 'Demir', address: 'Test Mah. 1', city: 'Istanbul', phoneNumber: PII[2] },
    totalPrice: { amount: 10, currency: 'TRY' },
    lineItems: [{ id: `HL-${i}-${j}`, merchantSku: 'SKU-1', sku: 'SKU-1', barcode: 'BC-1', productName: 'Urun', quantity: 1, price: { amount: 10 }, totalPrice: { amount: 10 }, vatRate: 18, status: 'Open' }],
    ...over,
});
const pageBody = (i: number, count: number, per: number, over: Record<string, unknown> = {}) =>
    ({ items: Array.from({ length: per }, (_, j) => order(i, j, over)), totalCount: count * per });

// Mutlak uç adresleri (mock/host denetimleri C10 için adreslerle ilerler); listing tabanı da yerel sunucuya çevrilir.
const params = (baseUrl: string) => ({
    clientId: 86,
    integrationSettings: {
        settings: { APIKEY, APISECRET, SELLERID: 'M-77' },
        urls: {
            BASEURL: baseUrl, LISTINGBASEURL: baseUrl,
            orderListUrl: `${baseUrl}/orders/merchantid/M-77`,
            stockUpdateUrl: `${baseUrl}/listings/merchantid/M-77/stock-uploads`,
            stockStatusUrl: `${baseUrl}/listings/merchantid/M-77/stock-uploads/<TRACKINGID>`,
        },
    },
});

const spec: ConformanceSpec = {
    code: 'hepsiburada',
    mock: { prefix: 'HEPSIBURADA' },
    timeoutEnv: 'HB_HTTP_TIMEOUT_MS',
    secrets: [APIKEY, APISECRET, B64],
    // HB sayfa tavanı 50 sayfa (HB_MAX_PAGES): sonsuz-sayfa testi bunun üstüne çıkmadan durmalı.
    maxSaneRequests: 60,
    build: (baseUrl) => ({ platform: new Hepsiburada(params(baseUrl)), raw: new Service(params(baseUrl)) }),
    read: {
        call: (a) => a.platform.retrieveOrders({}),
        page: (i, count, per) => pageBody(i, count, per),
        pageIndexOf: (url) => Number(new URL(url, 'http://x').searchParams.get('offset') ?? 0) / PER_PAGE,
        ids: (r) => ({
            orders: r.map((p: any) => String(p.order.externalOrderId)),
            lines: r.flatMap((p: any) => p.order.items.map((l: any) => String(l.externalLineItemId))),
        }),
        packageShapeOk: (r) => r.length > 0 && r.every((p: any) => typeof p.order?.externalOrderId === 'string' && typeof p.customer === 'object'),
        driftBody: () => pageBody(0, 1, 2, { orderId: { bozuk: true } }),
        missingIdBody: () => ({ items: Array.from({ length: 4 }, () => ({ status: 'Open', lineItems: [] })), totalCount: 4 }),
        unknownEnumBody: (raw) => pageBody(0, 1, 2, { status: raw }),
        statusesOf: (r) => r.map((p: any) => p.order.externalStatus),
        pii: PII,
    },
    write: {
        call: (a) => a.platform.updateProductStock([{ payload: { _id: 'v1', barcode: 'BC-1' }, stockcode: 'SKU-1', productId: 'P-1', stock: 5 } as any]),
        respond: (_req, mode) => {
            if (mode === 'write') return { status: 200, body: { id: 'JOB-CONF-1' } };
            if (mode === 'batch-done') return { status: 200, body: { status: 'Done', items: [{ barcode: 'BC-1', status: 'Uploaded' }] } };
            return { status: 200, body: { status: 'IN_PROGRESS', items: [] } };
        },
        shapeOk: (r) => r?.result === true && typeof r.trackingId === 'string' && Array.isArray(r.variantList) && r.variantList.length > 0,
    },
};

runAdapterConformance(spec);
