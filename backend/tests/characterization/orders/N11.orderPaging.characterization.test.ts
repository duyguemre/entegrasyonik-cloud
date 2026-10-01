// Protokol 13 karakterizasyon + faz4-int-wp1/F-02: N11 REST sipariş çekimi (sayfalama + zaman penceresi).
// Bağlayıcı sahte (ağ YOK). (A) ESKİ davranışta da yeşildir; (B) yeni davranıştır.
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OrderService } from '@integration/modules/marketplace/n11/services/OrderService';
import { OrderMapper } from '@integration/modules/marketplace/n11/transformers/OrderMapper';

const mkPkg = (i: number) => ({ id: i, orderNumber: `N${i}`, shipmentPackageStatus: 'Created', lines: [], lastModifiedDate: 1780000000000 });
const mkPage = (n: number, from = 0, total?: number) => ({ totalElements: total, content: Array.from({ length: n }, (_, i) => mkPkg(from + i)) });

function build(pages: any[]) {
    const svc = new OrderService({ clientId: 5, integrationSettings: { settings: {}, urls: {} } }, {} as any);
    const rest = jest.fn(async (_p: any) => {
        const next = pages.shift();
        if (next instanceof Error) throw next;
        return next;
    });
    const soap = jest.fn(async (_p: any) => ({ orderList: { order: [] } }));
    (svc as any).connector = { fetchOrdersRest: rest, fetchOrdersFromPlatform: soap };
    return { svc, rest, soap };
}

beforeEach(() => { cap = captureLogs(); });
afterEach(() => { cap.restore(); });

describe('(A) karakterizasyon — mevcut davranış korunur', () => {
    it('tek sayfa (<100) -> tek REST isteği, pageSize:100 currentPage:0, SOAP çağrılmaz', async () => {
        const { svc, rest, soap } = build([mkPage(3)]);
        const r = await svc.fetchOrders();
        expect(r).toHaveLength(3);
        expect(rest).toHaveBeenCalledTimes(1);
        expect(rest.mock.calls[0][0]).toMatchObject({ pageSize: 100, currentPage: 0 });
        expect(soap).not.toHaveBeenCalled();
    });
    it('content[] yoksa SOAP yedeğine düşülür', async () => {
        const { svc, soap } = build([{ foo: 1 }]);
        await svc.fetchOrders();
        expect(soap).toHaveBeenCalledTimes(1);
    });
    it('AUTH hatası SOAP\'a düşmeden fırlatılır', async () => {
        const { IntegrationError } = (require('@integration/modules/common/IntegrationError') as typeof import('@integration/modules/common/IntegrationError'));
        const { svc, soap } = build([new IntegrationError('AUTH', 'x', { integrationCode: 'n11', operation: 'o', clientId: 5 })]);
        await expect(svc.fetchOrders()).rejects.toMatchObject({ code: 'AUTH' });
        expect(soap).not.toHaveBeenCalled();
    });
});

describe('(B) sayfalama + zaman penceresi (F-02)', () => {
    it('100+100+20 -> 3 istek, currentPage 0/1/2, 220 paket', async () => {
        const { svc, rest } = build([mkPage(100), mkPage(100, 100), mkPage(20, 200)]);
        expect(await svc.fetchOrders()).toHaveLength(220);
        expect(rest.mock.calls.map(c => c[0].currentPage)).toEqual([0, 1, 2]);
    });
    it('totalElements varsa ona göre durur (fazladan istek yok)', async () => {
        const { svc, rest } = build([mkPage(100, 0, 200), mkPage(100, 100, 200)]);
        expect(await svc.fetchOrders()).toHaveLength(200);
        expect(rest).toHaveBeenCalledTimes(2);
    });
    it('tam dolu sayfa sonrası boş sayfa -> durur', async () => {
        const { svc, rest } = build([mkPage(100), mkPage(0, 100)]);
        expect(await svc.fetchOrders()).toHaveLength(100);
        expect(rest).toHaveBeenCalledTimes(2);
    });
    it('lastSyncTimestamp -> startDate/endDate epoch ms olarak REST isteğine girer (her sayfada)', async () => {
        const ts = new Date('2026-09-01T00:00:00.000Z');
        const { svc, rest } = build([mkPage(100), mkPage(1, 100)]);
        await svc.fetchOrders({ lastSyncTimestamp: ts });
        for (const c of rest.mock.calls) {
            expect(c[0].startDate).toBe(ts.getTime());
            expect(typeof c[0].endDate).toBe('number');
            expect(c[0].endDate).toBeGreaterThan(ts.getTime());
        }
        expect(rest.mock.calls[0][0].endDate).toBe(rest.mock.calls[1][0].endDate);
    });
    it('lastSyncTimestamp yoksa tarih parametresi gönderilmez (mevcut davranış)', async () => {
        const { svc, rest } = build([mkPage(1)]);
        await svc.fetchOrders();
        expect(rest.mock.calls[0][0]).not.toHaveProperty('startDate');
    });
    it('sayfa tavanı (50) aşılırsa yapılandırılmış uyarı, sessiz kesme yok', async () => {
        const { svc, rest } = build(Array.from({ length: 60 }, (_, i) => mkPage(100, i * 100)));
        expect(await svc.fetchOrders()).toHaveLength(5000);
        expect(rest).toHaveBeenCalledTimes(50);
        expect(cap.find((l) => l.code === 'PAGINATION_PAGE_CAP')).toMatchObject({ level: 'warn', integrationCode: 'n11', code: 'PAGINATION_PAGE_CAP' }) // kaynak artık ortak paginate (adapter-common);
    });
    it('sunucu sayfa parametresini yok sayıp aynı paketleri dönerse durur ve uyarır', async () => {
        const same = mkPage(100);
        const { svc, rest } = build([same, same, same]);
        expect(await svc.fetchOrders()).toHaveLength(100);
        expect(rest).toHaveBeenCalledTimes(2);
        expect(cap.lines.some((l) => l.code === 'PAGINATION_REPEATED_PAGE')).toBe(true);
    });
    it('ara sayfada AUTH hatası -> fırlatılır (kısmi sonuç dönmez, SOAP\'a düşülmez)', async () => {
        const { IntegrationError } = (require('@integration/modules/common/IntegrationError') as typeof import('@integration/modules/common/IntegrationError'));
        const { svc, soap } = build([mkPage(100), new IntegrationError('AUTH', 'x', { integrationCode: 'n11', operation: 'o', clientId: 5 })]);
        await expect(svc.fetchOrders()).rejects.toMatchObject({ code: 'AUTH' });
        expect(soap).not.toHaveBeenCalled();
    });
    it('ara sayfada content[] bozuksa hata fırlatılır (sessiz kesme yok)', async () => {
        const { svc } = build([mkPage(100), { oops: true }]);
        await expect(svc.fetchOrders()).rejects.toThrow(/sayfa 1/);
    });
});

describe('(C) SOAP yedek yolu kimliksiz sipariş (C7b)', () => {
    const soapSvc = (order: any) => {
        const { svc, soap } = build([{ foo: 1 }]); // content[] yok => SOAP'a düşülür
        soap.mockResolvedValue({ orderList: { order } } as never);
        return svc;
    };
    it('TÜMÜ (>=3) kimliksiz -> VALIDATION', async () => {
        await expect(soapSvc([{ status: 'New' }, { status: 'New' }, { status: 'New' }]).fetchOrders()).rejects.toMatchObject({ code: 'VALIDATION', platformCode: 'ORDER_SCHEMA_DRIFT' });
    });
    it('kısmen kimliksiz -> geçerli olan döner; tek nesne (dizi değil) de işlenir', async () => {
        const r = await soapSvc([{ orderNumber: 'S1', status: 'New' }, { status: 'New' }]).fetchOrders();
        expect(r.map(o => o.order.externalOrderId)).toEqual(['S1']);
        const one = await soapSvc({ orderNumber: 'S2', status: 'New' }).fetchOrders();
        expect(one.map(o => o.order.externalOrderId)).toEqual(['S2']);
    });
});

describe('N11 REST yanıt tarihi ayrıştırma', () => {
    const mapper = new OrderMapper();
    const one = (extra: any) => mapper.toInternalOrderPackagesFromRest({ content: [{ id: 1, orderNumber: 'N1', lines: [], ...extra }] })[0].order.dates as any;
    it('epoch ms (birincil doküman biçimi) doğru ayrışır', () => {
        expect(one({ lastModifiedDate: 1780000000000 }).externalUpdatedAt.getTime()).toBe(1780000000000);
    });
    it('"DD-MM-YYYY HH:MM:SS" (ikincil kaynak) GMT+3 kabul edilip doğru ayrışır', () => {
        // 15-09-2026 12:30:45 GMT+3 == 09:30:45Z
        expect(one({ lastModifiedDate: '15-09-2026 12:30:45' }).externalUpdatedAt.toISOString()).toBe('2026-09-15T09:30:45.000Z');
    });
    it('çözülemeyen değer undefined kalır (uydurma tarih üretilmez)', () => {
        expect(one({ lastModifiedDate: 'abc' }).externalUpdatedAt).toBeUndefined();
    });
});
