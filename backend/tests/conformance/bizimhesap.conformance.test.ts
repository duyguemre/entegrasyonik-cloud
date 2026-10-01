// INT-03: Bizimhesap conformance bağlantısı (ERP, okuma yönlü; AdapterHttpService tabanında). Gerçek ağ YOK (yerel sunucu).
import Bizimhesap from '@integration/modules/erp/bizimhesap';
import Service from '@integration/modules/erp/bizimhesap/services/Service';
import { runAdapterConformance, type ConformanceSpec } from './kit';

const KEY = 'BHKEY-conf-4d1e';
const SECRET = 'BHSECRET-conf-77a9';
const PII = ['pii.bh@example.invalid', 'Zeynep Kaya', '05550001122'];

const order = (i: number, j: number, over: Record<string, unknown> = {}) => ({
    id: `BH-${i}-${j}`, orderNumber: `BHN-${i}-${j}`, status: 'Created', orderDate: 1780000000000,
    customerFirstName: 'Zeynep', customerLastName: 'Kaya', customerEmail: PII[0],
    shipmentAddress: { firstName: 'Zeynep', lastName: 'Kaya', address1: 'Test Mah. 1', city: 'Istanbul', phone: PII[2] },
    lines: [{ id: `BL-${i}-${j}`, productName: 'Urun', barcode: 'BC-1', quantity: 1, amount: 10 }],
    grossAmount: 10,
    ...over,
});
const pageBody = (i: number, count: number, per: number, over: Record<string, unknown> = {}) =>
    ({ content: Array.from({ length: per }, (_, j) => order(i, j, over)), totalPages: count });

const params = (baseUrl: string) => ({
    clientId: 72,
    integrationSettings: {
        settings: { key: KEY, secret: SECRET, sellerId: '1' },
        urls: { baseUrl, orderListUrl: `${baseUrl}/orders/<SELLERID>`, productListUrl: `${baseUrl}/products/<SELLERID>` },
    },
});
const flat = (r: any[]) => r.map(p => p.order ?? p);

const spec: ConformanceSpec = {
    code: 'bizimhesap',
    mock: { prefix: 'BIZIMHESAP' },
    timeoutEnv: 'BIZIMHESAP_HTTP_TIMEOUT_MS',
    // Sonsuz-sayfa testi adaptör tavanında (BIZIMHESAP_MAX_PAGES) kısa sürede bitsin (oran sınırlayıcı gerçek zamanlı)
    env: { BIZIMHESAP_MAX_PAGES: '12' },
    secrets: [KEY, SECRET],
    build: (baseUrl) => ({ platform: new Bizimhesap(params(baseUrl)), raw: new Service(params(baseUrl)) }),
    read: {
        call: (a) => a.platform.retrieveOrders({}),
        page: (i, count, per) => pageBody(i, count, per),
        ids: (r) => ({
            orders: flat(r).map((o: any) => String(o.externalOrderId)),
            lines: flat(r).flatMap((o: any) => (o.items ?? o.lines ?? []).map((l: any) => String(l.externalLineItemId ?? l.externalLineId))),
        }),
        packageShapeOk: (r) => r.length > 0 && r.every((p: any) => typeof p.order?.externalOrderId === 'string' && typeof p.customer === 'object'),
        driftBody: () => pageBody(0, 1, 2, { grossAmount: 'on' }),
        missingIdBody: () => ({ content: Array.from({ length: 4 }, () => ({ status: 'Created', lines: [] })), totalPages: 1 }),
        unknownEnumBody: (raw) => pageBody(0, 1, 2, { status: raw }),
        statusesOf: (r) => flat(r).map((o: any) => o.externalStatus),
        pii: PII,
    },
    // Bizimhesap ERP: stok/fiyat yazma yolu yok (kaynak yön, ADR-0004); C5 taban sınıf POST'u üzerinden.
    writeNotSupported: { call: (a) => a.platform.updateProductStock([]) },
    rawWrite: (a) => a.raw.post('products/1/stock', { qty: 1 }, { operation: 'products.stock' }),
};

runAdapterConformance(spec);
