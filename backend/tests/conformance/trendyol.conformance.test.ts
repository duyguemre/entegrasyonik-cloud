// INT-03: Trendyol conformance bağlantısı (en olgun pazaryeri adaptörü; V2 sipariş akışı). Gerçek ağ YOK (yerel sunucu).
import Trendyol from '@integration/modules/marketplace/trendyol';
import { v2Package } from '../helpers/trendyolOrderFixtures';
import { makeParams, makeVariant, staged, V2_URLS } from '../helpers/trendyolProductFixtures';
import { runAdapterConformance, type ConformanceSpec } from './kit';

const APIKEY = 'TYKEY-conf-7f3a';
const APISECRET = 'TYSECRET-conf-91bc';
const B64 = Buffer.from(`${APIKEY}:${APISECRET}`).toString('base64');
const PII = ['yeni@example.invalid', 'Yeni Mah. 1', '2222222222'];

const pkg = (i: number, j: number, over: Record<string, unknown> = {}) => {
    const base = v2Package({ shipmentPackageId: 700000 + i * 100 + j, orderNumber: `ORD-${i}-${j}`, ...over });
    base.lines = base.lines.map((l: any) => ({ ...l, lineId: 900000 + i * 100 + j }));
    return base;
};
const pageBody = (i: number, count: number, per: number, over: Record<string, unknown> = {}) => ({
    content: Array.from({ length: per }, (_, j) => pkg(i, j, over)),
    page: i, size: 200, totalPages: count, totalElements: count * per,
});

const params = (baseUrl: string) => makeParams({
    urls: { ...V2_URLS, baseUrl, orderListUrl: `${baseUrl}/order/sellers/<SELLERID>/v2/orders` },
    settings: { APIKEY, APISECRET },
});

const spec: ConformanceSpec = {
    code: 'trendyol',
    mock: { prefix: 'TY' },
    timeoutEnv: 'TY_HTTP_TIMEOUT_MS',
    secrets: [APIKEY, APISECRET, B64],
    build: (baseUrl) => ({ platform: new Trendyol(params(baseUrl)) }),
    read: {
        call: (a) => a.platform.retrieveOrders({}),
        page: (i, count, per) => pageBody(i, count, per),
        ids: (r) => ({
            orders: r.map((p: any) => String(p.order.externalOrderId)),
            lines: r.flatMap((p: any) => p.order.items.map((l: any) => String(l.externalLineItemId))),
        }),
        packageShapeOk: (r) => r.length > 0 && r.every((p: any) => typeof p.order?.externalOrderId === 'string' && typeof p.customer === 'object'),
        driftBody: () => pageBody(0, 1, 2, { giftBox: 'yes' }),
        missingIdBody: () => ({
            content: Array.from({ length: 4 }, () => v2Package({ shipmentPackageId: undefined, orderNumber: undefined })),
            page: 0, size: 200, totalPages: 1, totalElements: 4,
        }),
        unknownEnumBody: (raw) => pageBody(0, 1, 2, { status: raw }),
        statusesOf: (r) => r.map((p: any) => p.order.externalStatus),
        pii: PII,
    },
    write: {
        call: (a) => a.platform.updateProductStock([staged(makeVariant())]),
        respond: (_req, mode) => {
            if (mode === 'write') return { status: 200, body: { batchRequestId: 'B-CONF-1' } };
            if (mode === 'batch-done') return { status: 200, body: { items: [{ requestItem: { barcode: 'BC-001' }, status: 'SUCCESS' }] } };
            return { status: 200, body: { status: 'IN_PROGRESS', items: [] } };
        },
        shapeOk: (r) => r?.result === true && typeof r.trackingId === 'string' && Array.isArray(r.variantList) && r.variantList.length > 0,
    },
};

runAdapterConformance(spec);
