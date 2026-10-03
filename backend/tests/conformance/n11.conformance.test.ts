// INT-05: N11 conformance bağlantısı (pazaryeri; AdapterHttpService tabanında, REST + SOAP karışık). Gerçek ağ YOK (yerel sunucu).
// Okuma yolu REST `rest/delivery/v1/shipmentPackages` (sayfa 0 tabanlı `page`/`size` — WP4 C-5, sayfa boyutu 100: `dönen < 100` = son sayfa); hata durumunda
// REST->SOAP yedeği (UNAVAILABLE/NOT_SUPPORTED) kitin tüm senaryolarında ayrıca sınanır (yerel sunucu her yola aynı yanıtı verir).
import N11 from '@integration/modules/marketplace/n11';
import Service from '@integration/modules/marketplace/n11/services/Service';
import { runAdapterConformance, type ConformanceSpec } from './kit';

const APIKEY = 'N11KEY-conf-7a3f';
const APISECRET = 'N11SECRET-conf-c92e';
const PII = ['pii.n11@example.invalid', 'Ayse Demir', '05554443322'];
const PAGE_SIZE = 100;

const addr = { fullName: PII[1], address: 'Test Mah. 1', city: 'Istanbul', district: 'Kadikoy', gsm: PII[2], postalCode: '34000' };
const order = (i: number, j: number, over: Record<string, unknown> = {}) => ({
    id: `NP-${i}-${j}`, orderNumber: `N-${i}-${j}`, shipmentPackageStatus: 'Created', lastModifiedDate: 1780000000000,
    customerEmail: PII[0], customerfullName: PII[1], customerId: 12345,
    billingAddress: { ...addr, invoiceType: 1 }, shippingAddress: addr,
    totalAmount: 10, totalDiscountAmount: 0,
    lines: [{ orderLineId: `NL-${i}-${j}`, productId: 1001, productName: 'Urun', stockCode: 'SKU-1', quantity: 1, price: 10, totalSellerDiscountPrice: 0 }],
    packageHistories: [{ createdDate: 1780000000000, status: 'Created' }],
    ...over,
});
// Son sayfa (index === count-1) KISA (2 kayıt) döner: adaptör `dönen < 100` ile durur; aradaki sayfalar dolu (perPage).
const pageBody = (i: number, count: number, per: number, over: Record<string, unknown> = {}) =>
    ({ content: Array.from({ length: i === count - 1 ? Math.min(2, per) : per }, (_, j) => order(i, j, over)) });

const params = (baseUrl: string) => ({
    clientId: 88,
    integrationSettings: { settings: { APIKEY, APISECRET }, urls: { baseUrl } },
});

const spec: ConformanceSpec = {
    code: 'n11',
    mock: { prefix: 'N11' },
    timeoutEnv: 'N11_HTTP_TIMEOUT_MS',
    secrets: [APIKEY, APISECRET],
    // Sayfa tavanı 50 sayfa (N11_MAX_PAGES): sonsuz-sayfa testi bunun üstüne çıkmadan durmalı.
    maxSaneRequests: 60,
    build: (baseUrl) => ({ platform: new N11(params(baseUrl)), raw: new Service(params(baseUrl)) }),
    read: {
        call: (a) => a.platform.retrieveOrders({}),
        page: (i, count, per) => pageBody(i, count, per),
        pageSize: PAGE_SIZE,
        c6aTotal: PAGE_SIZE * 2 + 2,
        pageIndexOf: (url) => Number(new URL(url, 'http://x').searchParams.get('page') ?? 0),
        ids: (r) => ({
            orders: r.map((p: any) => String(p.order.externalOrderId)),
            lines: r.flatMap((p: any) => p.order.items.map((l: any) => String(l.externalLineItemId))),
        }),
        packageShapeOk: (r) => r.length > 0 && r.every((p: any) => typeof p.order?.externalOrderId === 'string' && typeof p.customer === 'object'),
        // zorunlu olmayan alan tipi bozuk (quantity nesne), kimlikler tamam
        driftBody: () => pageBody(0, 1, 2, { lines: [{ orderLineId: 'NL-0-0', quantity: { bozuk: true } }] }),
        missingIdBody: () => ({ content: Array.from({ length: 4 }, () => ({ id: 'X', shipmentPackageStatus: 'Created', lines: [] })), totalElements: 4 }),
        unknownEnumBody: (raw) => pageBody(0, 1, 2, { shipmentPackageStatus: raw }),
        statusesOf: (r) => r.map((p: any) => p.order.externalStatus),
        pii: PII,
    },
    write: {
        call: (a) => a.platform.updateProductStock([{ payload: { _id: 'v1', barcode: 'BC-1' }, stockcode: 'SKU-1', barcode: 'BC-1', productId: 'P-1', stock: 5 } as any]),
        respond: (_req, mode) => {
            if (mode === 'write') return { status: 200, body: { id: 4242 } };
            if (mode === 'batch-done') return { status: 200, body: { items: [{ id: 4242, status: 'COMPLETED', stockCode: 'SKU-1', barcode: 'BC-1' }] } };
            return { status: 200, body: { items: [] } };
        },
        shapeOk: (r) => r?.result === true && typeof r.trackingId === 'string' && Array.isArray(r.variantList) && r.variantList.length > 0,
    },
};

runAdapterConformance(spec);
