// INT-05: Ideasoft conformance bağlantısı (e-ticaret; AdapterHttpService tabanında). Gerçek ağ YOK (yerel sunucu).
// OAuth akışı bu kitin kapsamı DIŞINDA (token elle verilir; OAuth: tests/characterization/stubs/Ideasoft.oauthAndPaging.test.ts).
import Ideasoft from '@integration/modules/ecommerce/ideasoft';
import Service from '@integration/modules/ecommerce/ideasoft/services/Service';
import { runAdapterConformance, type ConformanceSpec } from './kit';

const KEY = 'IDKEY-conf-3b7a';
const SECRET = 'IDSECRET-conf-91c4';
const TOKEN = 'IDTOKEN-conf-5e20';
const PII = ['pii.id@example.invalid', 'Ayse Demir', '05553334455'];
const PAGE_SIZE = 100; // Ideasoft sayfa boyutu 100 (`<100` kayıt = son sayfa)

const order = (i: number, j: number, over: Record<string, unknown> = {}) => ({
    id: `ID-${i}-${j}`, orderNumber: `IDN-${i}-${j}`, status: 'new', createdAt: '2026-09-01T10:00:00Z',
    customer: { name: PII[1], email: PII[0], phone: PII[2] },
    shippingAddress: { firstName: 'Ayse', lastName: 'Demir', address: 'Test Mah. 1', city: 'Istanbul', phone: PII[2] },
    orderLines: [{ id: `IL-${i}-${j}`, product: { name: 'Urun', barcode: 'BC-1', sku: 'SKU-1' }, quantity: 1, price: 10 }],
    totalPrice: 10,
    ...over,
});
// Son sayfa kısa (2 kayıt) => Ideasoft sayfalaması durur; aksi halde tam sayfa (100).
const pageBody = (i: number, count: number, per: number, over: Record<string, unknown> = {}) =>
    Array.from({ length: i >= count - 1 ? Math.min(per, 2) : per }, (_, j) => order(i, j, over));

const params = (baseUrl: string) => ({
    clientId: 84,
    integrationSettings: {
        settings: { storeName: 'test', key: KEY, secret: SECRET },
        // Mutlak uç adresi: mock/host denetimleri (C10) adresle ilerler
        urls: { baseUrl, orderListUrl: `${baseUrl}/orders` },
    },
});
const flat = (r: any[]) => r.map(p => p.order ?? p);

const spec: ConformanceSpec = {
    code: 'ideasoft',
    mock: { prefix: 'IDEASOFT' },
    timeoutEnv: 'IDEASOFT_HTTP_TIMEOUT_MS',
    secrets: [KEY, SECRET, TOKEN],
    // Sonsuz-sayfa testi adaptör tavanında (IDEASOFT_MAX_PAGES) kısa sürede bitsin (oran sınırlayıcı gerçek zamanlı)
    env: { IDEASOFT_MAX_PAGES: '12' },
    build: (baseUrl) => {
        const platform = new Ideasoft(params(baseUrl));
        (platform as any).service.setCurrentToken(TOKEN);
        const raw = new Service(params(baseUrl));
        raw.setCurrentToken(TOKEN);
        return { platform, raw };
    },
    read: {
        call: (a) => a.platform.retrieveOrders({}),
        page: (i, count, per) => pageBody(i, count, per),
        pageIndexOf: (url) => Number(new URL(url, 'http://x').searchParams.get('page') ?? 1) - 1, // Ideasoft page 1 tabanlı
        pageSize: PAGE_SIZE,
        c6aTotal: 2 * PAGE_SIZE + 2,
        ids: (r) => ({
            orders: flat(r).map((o: any) => String(o.externalOrderId)),
            lines: flat(r).flatMap((o: any) => (o.items ?? o.lines ?? []).map((l: any) => String(l.externalLineItemId ?? l.externalLineId))),
        }),
        packageShapeOk: (r) => r.length > 0 && r.every((p: any) => typeof p.order?.externalOrderId === 'string' && typeof p.customer === 'object'),
        driftBody: () => pageBody(0, 1, 2, { totalPrice: { bozuk: true } }),
        missingIdBody: () => Array.from({ length: 4 }, () => ({ status: 'new', orderLines: [] })),
        unknownEnumBody: (raw) => pageBody(0, 1, 2, { status: raw }),
        statusesOf: (r) => flat(r).map((o: any) => o.externalStatus),
        pii: PII,
    },
    write: {
        call: (a) => a.platform.updateProductStock([{ payload: { _id: 'v1', barcode: 'BC-1', stock: 5, platforms: { ideasoft: { mapping: { productId: 100 } } } } } as any]),
        respond: () => ({ status: 200, body: {} }),
        shapeOk: (r) => r?.result === true && Array.isArray(r.variantList) && r.variantList.length > 0,
    },
    noBatch: true, // yazmalar senkron (processBatch variantList/failedVariants); batch takibi yok => checkBatchProduct NOT_SUPPORTED (C8b)
    // C5: processBatch per-öğe hatayı failedVariants'a koyar (fırlatmaz); dış-etkili yazmanın taban davranışı ham servis PUT'u üzerinden
    rawWrite: (a) => a.raw.put('products/1', { stockAmount: 1 }, { operation: 'products.stock' }),
};

runAdapterConformance(spec);
