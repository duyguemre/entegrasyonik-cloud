/**
 * INT-05 (Pazarama) karakterizasyon: liste uçlarının sayfalama davranışı. Önce BUGÜNKÜ davranış sabitlendi (ortak `paginate` geçişinden
 * ÖNCE); adım 3'te "[DÜZELTME]" etiketli testler bilinçli olarak ters çevrildi, gerisi AYNEN yeşil kaldı:
 *  - Sipariş listesi (POST order/getOrdersForApi): ESKİ tek istek (sayfa alanı yok; 100 kayıtta bile devam edilmezdi => sessiz eksik);
 *    ŞİMDİ pageNumber/pageSize ile tüm sayfalar, tavanda (50 sayfa / 5000 kayıt) `incomplete` işareti.
 *  - İade listesi (POST order/getRefund): ESKİ tek istek; ŞİMDİ aynı döngü.
 *  - streamProducts: `dönen < 100` ile durur; ESKİ tavan YOKTU (her sayfa dolu dönerse sonsuz); ŞİMDİ tavan/tekrar => FAILED.
 * Gerçek ağ YOK (127.0.0.1 geçici sunucu).
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import Pazarama from '@integration/modules/marketplace/pazarama';
import Service from '@integration/modules/marketplace/pazarama/services/Service';
import { OrderConnector } from '@integration/modules/marketplace/pazarama/api/OrderConnector';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';

let srv: LocalServerHandle | undefined;
type Seen = { method?: string; url?: string; body: any };
const seen: Seen[] = [];
let route: (s: Seen) => { status?: number; body: any } = () => ({ body: {} });

const handler = (req: any, res: any) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString(); });
    req.on('end', () => {
        if (req.url?.includes('/connect/token')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
            return;
        }
        let body: any; try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
        const s = { method: req.method, url: req.url, body };
        seen.push(s);
        const r = route(s);
        res.writeHead(r.status ?? 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r.body));
    });
};

const params = (baseUrl: string) => ({
    clientId: 93,
    integrationSettings: {
        settings: { APIKEY: 'k', APISECRET: 's' },
        urls: { baseUrl, tokenUrl: `${baseUrl}/connect/token`, productListUrl: 'product/products' },
    },
});
const order = (n: number) => ({ OrderNumber: `PZ-${n}`, OrderStatus: 3, Items: [{ OrderItemId: `L-${n}`, Quantity: 1 }] });

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    seen.length = 0; route = () => ({ body: {} });
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    ResilientHttpClient.resetAllState();
});
afterEach(async () => {
    jest.restoreAllMocks();
    if (srv) { await srv.close(); srv = undefined; }
});

describe('Pazarama sipariş listesi - bugünkü davranış', () => {
    it('POST order/getOrdersForApi; gövde {startDate,endDate,pageNumber:1,pageSize:100}; son 24 saat penceresi', async () => {
        route = () => ({ body: { data: [order(1)], success: true } });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveOrders({});
        expect(r).toHaveLength(1);
        expect(r[0].order.externalOrderId).toBe('PZ-1');
        expect(seen).toHaveLength(1);
        expect(seen[0].method).toBe('POST');
        expect(seen[0].url).toBe('/order/getOrdersForApi');
        expect(Object.keys(seen[0].body).sort()).toEqual(['endDate', 'pageNumber', 'pageSize', 'startDate']);
        expect(seen[0].body).toMatchObject({ pageNumber: 1, pageSize: 100 });
        const span = new Date(seen[0].body.endDate).getTime() - new Date(seen[0].body.startDate).getTime();
        expect(Math.abs(span - 24 * 3600 * 1000)).toBeLessThan(5000);
    });

    it('lastSyncTimestamp verilirse startDate o andır', async () => {
        route = () => ({ body: { data: [] } });
        srv = await startLocalServer(handler);
        await new Pazarama(params(srv.baseUrl)).retrieveOrders({ lastSyncTimestamp: '2026-09-01T10:00:00.000Z' });
        expect(seen[0].body.startDate).toBe('2026-09-01T10:00:00.000Z');
    });

    it('yanıt { data: [...] } ya da doğrudan dizi olabilir', async () => {
        route = () => ({ body: [order(7)] });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveOrders({});
        expect(r.map((p: any) => p.order.externalOrderId)).toEqual(['PZ-7']);
    });

    // DÜZELTME (INT-05): ESKİ: 100 kayıtlık dolu yanıtta DA ikinci sayfa istenmezdi (sessiz eksik).
    it('[DÜZELTME] dolu sayfa (100) sonrası sonraki sayfa istenir; kısa sayfada durur; hepsi birleşir', async () => {
        route = (s) => {
            const n = s.body.pageNumber;
            return { body: { data: n === 1 ? Array.from({ length: 100 }, (_, i) => order(i)) : Array.from({ length: 3 }, (_, i) => order(100 + i)) } };
        };
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveOrders({});
        expect(r).toHaveLength(103);
        expect(new Set(r.map((p: any) => p.order.externalOrderId)).size).toBe(103);
        expect(seen.map(s => s.body.pageNumber)).toEqual([1, 2]);
        expect(getIncomplete(r)).toBeUndefined();
    });

    it('tam 100 kayıtlık tek sayfa + boş ikinci sayfa -> 2 istek, 100 kayıt', async () => {
        route = (s) => ({ body: { data: s.body.pageNumber === 1 ? Array.from({ length: 100 }, (_, i) => order(i)) : [] } });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveOrders({});
        expect(r).toHaveLength(100);
        expect(seen).toHaveLength(2);
    });

    it('bağlayıcıda çağıranın pageNumber/pageSize değeri başlangıç olarak korunur (pageSize=10: 10 kayıt dolu sayfa, 4 kayıt son sayfa)', async () => {
        route = (s) => ({ body: { data: Array.from({ length: s.body.pageNumber === 3 ? 4 : 10 }, (_, i) => order(s.body.pageNumber * 100 + i)) } });
        srv = await startLocalServer(handler);
        const p = params(srv.baseUrl);
        const r = await new OrderConnector(new Service(p), p).fetchOrdersFromPlatform({ pageSize: 10, pageNumber: 2 });
        expect(r).toHaveLength(14);
        expect(seen.map(s => [s.body.pageNumber, s.body.pageSize])).toEqual([[2, 10], [3, 10]]);
    });

    it('sayfa tavanı (50): sonsuz dolu sayfa -> KESİLİR ve sonuç `incomplete` (PAGINATION_PAGE_CAP) işaretlenir; 50 istekten fazla atılmaz', async () => {
        route = (s) => ({ body: { data: Array.from({ length: 100 }, (_, i) => order(s.body.pageNumber * 1000 + i)) } });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveOrders({});
        expect(seen.length).toBeLessThanOrEqual(50);
        expect(getIncomplete(r)).toMatchObject({ incomplete: true });
    });

    it('sunucu sayfa numarasını yok sayar (hep aynı dolu sayfa) -> tekrar eden sayfada durur, incomplete (PAGINATION_REPEATED_PAGE)', async () => {
        route = () => ({ body: { data: Array.from({ length: 100 }, (_, i) => order(i)) } });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveOrders({});
        expect(seen).toHaveLength(2);
        expect(r).toHaveLength(100);
        expect(getIncomplete(r)).toMatchObject({ incomplete: true, reason: 'PAGINATION_REPEATED_PAGE' });
    });

    it('ara sayfa hatası YUTULMAZ: 2. sayfa 400 -> IntegrationError fırlar (kısmi sonuç sessizce dönmez)', async () => {
        route = (s) => (s.body.pageNumber === 1 ? { body: { data: Array.from({ length: 100 }, (_, i) => order(i)) } } : { status: 400, body: { message: 'kötü' } });
        srv = await startLocalServer(handler);
        await expect(new Pazarama(params(srv.baseUrl)).retrieveOrders({})).rejects.toMatchObject({ name: 'IntegrationError' });
    });

    // DÜZELTME (INT-05, playbook §4.2 / C7b): ESKİ: kimliksiz sipariş boş externalOrderId + "undefined" satır kimliğiyle SESSİZCE kaydedilirdi.
    it('[DÜZELTME] kimliksiz sipariş atlanır (geçerli kardeşi korunur); hepsi kimliksizse (>=3) VALIDATION', async () => {
        route = () => ({ body: { data: [{ OrderStatus: 3, Items: [{ Quantity: 1 }] }, order(9)] } });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveOrders({});
        expect(r.map((p: any) => p.order.externalOrderId)).toEqual(['PZ-9']);
        await srv.close();
        route = () => ({ body: { data: [1, 2, 3].map(() => ({ OrderStatus: 3, Items: [{ Quantity: 1 }] })) } });
        srv = await startLocalServer(handler);
        await expect(new Pazarama(params(srv.baseUrl)).retrieveOrders({})).rejects.toMatchObject({ name: 'IntegrationError', code: 'VALIDATION', platformCode: 'ORDER_SCHEMA_DRIFT' });
    });

    it('[BUGÜN, BULGU] siparişi kimlikli ama SATIRI kimliksiz kayıt "undefined" satır kimliğiyle geçer (satır düzeyi doğrulama yok)', async () => {
        route = () => ({ body: { data: [{ OrderNumber: 'PZ-5', OrderStatus: 3, Items: [{ Quantity: 1 }] }] } });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveOrders({});
        expect(r[0].order.externalOrderId).toBe('PZ-5');
        expect(r[0].order.items[0].externalLineItemId).toBe('undefined');
    });
});

describe('Pazarama iade listesi', () => {
    const refunds = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ RefundId: `R-${from + i}`, RefundStatus: 1, orderItem: [] }));

    it('POST order/getRefund; gövde pageNumber=1, pageSize=100 + süzgeçler; kısa sayfada durur', async () => {
        route = () => ({ body: { data: { refundList: refunds(2) } } });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveClaims({ startDate: '2026-09-01 00:00:00', endDate: '2026-09-02 00:00:00' });
        expect(r).toHaveLength(2);
        expect(seen).toHaveLength(1);
        expect(seen[0].url).toBe('/order/getRefund');
        expect(seen[0].body).toMatchObject({ pageNumber: 1, pageSize: 100, requestStartDate: '2026-09-01 00:00:00', requestEndDate: '2026-09-02 00:00:00' });
    });

    // DÜZELTME (INT-05): ESKİ: tek istek; 100 iadelik dolu yanıtta ikinci sayfa çekilmezdi.
    it('[DÜZELTME] dolu sayfa (100) sonrası sonraki sayfa çekilir ve birleşir', async () => {
        route = (s) => ({ body: { data: { refundList: s.body.pageNumber === 1 ? refunds(100) : refunds(5, 100) } } });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveClaims({});
        expect(r).toHaveLength(105);
        expect(seen.map(s => s.body.pageNumber)).toEqual([1, 2]);
    });

    it('sayfa tavanı: sonsuz dolu sayfa -> KESİLİR, sonuç `incomplete` işaretli', async () => {
        route = (s) => ({ body: { data: { refundList: refunds(100, s.body.pageNumber * 1000) } } });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).retrieveClaims({});
        expect(seen.length).toBeLessThanOrEqual(50);
        expect(getIncomplete(r)).toMatchObject({ incomplete: true });
    });
});

describe('Pazarama streamProducts - bugünkü davranış (WP4 C-5: Page/Size PascalCase)', () => {
    const list = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ code: `SKU-${from + i}`, barcode: `BC-${from + i}` }));

    it('kısa sayfa (< 100) son sayfadır: 1 liste isteği + kayıt başına detay POST; sonuç COMPLETED', async () => {
        route = (s) => (s.method === 'GET' ? { body: { data: list(3) } } : { body: { code: s.body.Code, detail: true } });
        srv = await startLocalServer(handler);
        const chunks: any[][] = [];
        const r = await new Pazarama(params(srv.baseUrl)).streamProducts(async (c) => { chunks.push(c); });
        expect(r).toEqual({ totalElements: 3, totalProcessed: 3, totalPages: 1, status: 'COMPLETED' });
        expect(chunks).toHaveLength(1);
        expect(chunks[0].map((d: any) => d.code)).toEqual(['SKU-0', 'SKU-1', 'SKU-2']);
        const gets = seen.filter(s => s.method === 'GET');
        expect(gets).toHaveLength(1);
        expect(gets[0].url).toBe('/product/products?Page=1&Size=100');
    });

    it('dolu sayfa (100) sonrası sonraki sayfa istenir; boş/kısa sayfada durur', async () => {
        route = (s) => {
            if (s.method === 'GET') return { body: { data: s.url!.includes('Page=1') ? list(100) : list(2, 100) } };
            return { body: { code: s.body.Code } };
        };
        srv = await startLocalServer(handler);
        const chunks: any[][] = [];
        const r = await new Pazarama(params(srv.baseUrl)).streamProducts(async (c) => { chunks.push(c); });
        expect(r).toEqual({ totalElements: 102, totalProcessed: 102, totalPages: 2, status: 'COMPLETED' });
        expect(chunks.map(c => c.length)).toEqual([100, 2]);
        expect(seen.filter(s => s.method === 'GET').map(s => s.url)).toEqual(['/product/products?Page=1&Size=100', '/product/products?Page=2&Size=100']);
    });

    it('detay çekilemeyen kayıt liste verisiyle devam eder (kayıt düşmez)', async () => {
        route = (s) => (s.method === 'GET' ? { body: { data: list(2) } } : { status: 404, body: { message: 'yok' } });
        srv = await startLocalServer(handler);
        const chunks: any[][] = [];
        const r = await new Pazarama(params(srv.baseUrl)).streamProducts(async (c) => { chunks.push(c); });
        expect(r.status).toBe('COMPLETED');
        expect(chunks[0].map((d: any) => d.code)).toEqual(['SKU-0', 'SKU-1']);
    });

    // DÜZELTME (INT-05): ESKİ: tavan YOKTU, her sayfa dolu dönerse sonsuz döngü. ŞİMDİ: tekrar eden sayfa => FAILED (tavan sinyali).
    it('[DÜZELTME] sunucu hep aynı dolu sayfayı dönerse sonsuz döngü YOK: ikinci sayfada durur, status FAILED + açıklama', async () => {
        route = (s) => (s.method === 'GET' ? { body: { data: list(100) } } : { body: { code: s.body.Code } });
        srv = await startLocalServer(handler);
        const chunks: any[][] = [];
        const r = await new Pazarama(params(srv.baseUrl)).streamProducts(async (c) => { chunks.push(c); });
        expect(r.status).toBe('FAILED');
        expect(r.error).toContain('PAGINATION_REPEATED_PAGE');
        expect(r.totalProcessed).toBe(100);
        expect(chunks).toHaveLength(1);
    });

    it('liste isteği hata verirse fırlatmaz: status FAILED + error mesajı (işlenen sayı korunur)', async () => {
        route = () => ({ status: 400, body: { message: 'kötü istek' } });
        srv = await startLocalServer(handler);
        const r = await new Pazarama(params(srv.baseUrl)).streamProducts(async () => undefined);
        expect(r).toMatchObject({ status: 'FAILED', totalProcessed: 0, totalElements: 0 });
        expect(typeof r.error).toBe('string');
    });
});
