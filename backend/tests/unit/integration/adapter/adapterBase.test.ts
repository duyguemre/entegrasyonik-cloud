// ADR-0033 INT-01: ortak adaptör yardımcıları (AdapterHttpService, OAuthTokenCache, paginate, buildInternalOrder). Ağ yok:
// yalnız 127.0.0.1 yerel sunucu (tests/helpers/localHttpServer.ts).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { AdapterHttpService, type AuthConfig } from '@integration/modules/common/adapter/AdapterHttpService';
import { OAuthTokenCache } from '@integration/modules/common/adapter/OAuthTokenCache';
import { paginate } from '@integration/modules/common/adapter/paginate';
import { buildInternalOrder } from '@integration/modules/common/adapter/buildInternalOrder';
import { ADAPTER_KEYS } from '@integration/modules/adapterKeys';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { OrderInternalStatusEnum } from '@interfaces/order';
import { startLocalServer, type LocalServerHandle } from '../../../helpers/localHttpServer';

const KEY = ADAPTER_KEYS.find(k => k.code === 'bizimhesap')!;

class TestService extends AdapterHttpService {
    constructor(params: any) { super(KEY, params); }
    protected authConfig(): AuthConfig { return { headers: { key: 'k', token: 't' } }; }
    failPublic(op: string, e: unknown): never { return this.fail(op, e); }
}
class RewriteService extends TestService {
    protected readonly mockHostPattern = /^https:\/\/api\.bizimhesap\.com/;
    protected readonly enforceMockableEndpoints = true;
}

let srv: LocalServerHandle | undefined;
const ENV = ['BIZIMHESAP_MOCK_MODE', 'BIZIMHESAP_MOCK_BASE_URL', 'BIZIMHESAP_MOCKABLE_ENDPOINTS'];
beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => { ResilientHttpClient.resetAllState(); });
afterEach(async () => {
    jest.restoreAllMocks();
    ENV.forEach(k => delete process.env[k]);
    if (srv) { await srv.close(); srv = undefined; }
});

describe('AdapterHttpService', () => {
    it('göreli yol: urls.baseUrl varsa o, yoksa key.fallbackBaseUrl', () => {
        expect(new TestService({ integrationSettings: { urls: { baseUrl: 'https://x.test/api/' } } }).resolveUrl('/a/b')).toBe('https://x.test/api/a/b');
        expect(new TestService({}).resolveUrl('a')).toBe('https://api.bizimhesap.com/a');
    });

    it('mock AÇIK: göreli yol mock tabanına gider; yabancı mutlak URL fail-closed reddedilir', () => {
        process.env.BIZIMHESAP_MOCK_MODE = 'true';
        process.env.BIZIMHESAP_MOCK_BASE_URL = 'http://127.0.0.1:6015/bizimhesap';
        const s = new TestService({});
        expect(s.resolveUrl('orders')).toBe('http://127.0.0.1:6015/bizimhesap/orders');
        expect(() => s.resolveUrl('https://api.bizimhesap.com/orders')).toThrow(IntegrationError);
    });

    it('mockHostPattern: mock açıkken gerçek host mock tabanına yeniden yazılır; enforceMockableEndpoints boş listede reddeder', () => {
        process.env.BIZIMHESAP_MOCK_MODE = 'true';
        process.env.BIZIMHESAP_MOCK_BASE_URL = 'http://127.0.0.1:6015/bizimhesap';
        const s = new RewriteService({});
        process.env.BIZIMHESAP_MOCKABLE_ENDPOINTS = '!'; // C10c: '!' = kod içi varsayılan uç listesini yok say (boş liste)
        expect(() => s.resolveUrl('https://api.bizimhesap.com/orders')).toThrow(/MOCKABLE_ENDPOINTS/);
        process.env.BIZIMHESAP_MOCKABLE_ENDPOINTS = '/orders';
        expect(s.resolveUrl('https://api.bizimhesap.com/orders')).toBe('http://127.0.0.1:6015/bizimhesap/orders');
    });

    it('GET auth başlıklarını gönderir ve 500 -> UNAVAILABLE; POST 500 -> UNKNOWN_OUTCOME (yazma retry YOK)', async () => {
        const seen: any[] = [];
        srv = await startLocalServer((req, res) => { seen.push(req.headers); res.writeHead(500); res.end('{}'); });
        const s = new TestService({ clientId: 5, integrationSettings: { urls: { baseUrl: srv.baseUrl } } });
        await expect(s.get('x', {}, { operation: 'g' })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(seen[0].key).toBe('k');
        const before = srv.requestCount();
        await expect(s.post('x', {}, { operation: 'p' })).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        expect(srv.requestCount() - before).toBe(1);
    });

    it('fail(): IntegrationError aynen geçer (çift sarma yok), diğerleri IntegrationError olur', () => {
        const s = new TestService({});
        const ie = new IntegrationError('AUTH', 'm', { integrationCode: 'bizimhesap', operation: 'o', clientId: 1 });
        expect(() => s.failPublic('op', ie)).toThrow(ie);
        let caught: unknown;
        try { s.failPublic('op', new Error('boom')); } catch (e) { caught = e; }
        expect(IntegrationError.isIntegrationError(caught)).toBe(true);
    });
});

describe('OAuthTokenCache', () => {
    it('single-flight: eşzamanlı get() tek token isteği', async () => {
        const fetchToken = jest.fn(async () => { await new Promise(r => setTimeout(r, 5)); return { token: 'T', expiresInSec: 3600 }; });
        const c = new OAuthTokenCache(fetchToken);
        expect(await Promise.all([c.get(), c.get(), c.get()])).toEqual(['T', 'T', 'T']);
        expect(fetchToken).toHaveBeenCalledTimes(1);
        await c.get();
        expect(fetchToken).toHaveBeenCalledTimes(1);
    });
    it('süre sonu (skew) yenilenir; force ve invalidate yeniler', async () => {
        let n = 0;
        const fetchToken = jest.fn(async () => ({ token: `T${++n}`, expiresInSec: 600 }));
        const c = new OAuthTokenCache(fetchToken, 300_000);
        const now = Date.now();
        const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
        expect(await c.get()).toBe('T1');
        spy.mockReturnValue(now + 200_000);
        expect(await c.get()).toBe('T1');
        spy.mockReturnValue(now + 400_000); // 600s - 300s skew = 300s eşiği aşıldı
        expect(await c.get()).toBe('T2');
        expect(await c.get(true)).toBe('T3');
        c.invalidate();
        expect(await c.get()).toBe('T4');
    });
    it('prime(): dışarıdan elde edilmiş token ağa çıkmadan döner; süre skew içindeyse yine yenilenir', async () => {
        const fetchToken = jest.fn(async () => ({ token: 'YENI', expiresInSec: 3600 }));
        const c = new OAuthTokenCache(fetchToken, 120_000);
        c.prime('HAZIR', 3600);
        expect(await c.get()).toBe('HAZIR');
        expect(fetchToken).not.toHaveBeenCalled();
        c.prime('YAKINDA-BITER', 60); // 60s < 120s skew
        expect(await c.get()).toBe('YENI');
    });
    it('hata önbelleğe alınmaz: sonraki çağrı yeniden dener', async () => {
        const fetchToken = jest.fn<() => Promise<{ token: string; expiresInSec: number }>>()
            .mockRejectedValueOnce(new Error('x')).mockResolvedValue({ token: 'OK', expiresInSec: 3600 });
        const c = new OAuthTokenCache(fetchToken);
        await expect(c.get()).rejects.toThrow('x');
        expect(await c.get()).toBe('OK');
    });
});

describe('paginate', () => {
    const mk = (n: number, base = 0) => Array.from({ length: n }, (_, i) => ({ id: base + i }));
    it('offset: kısa sayfada durur, tam sonuç işaretsiz', async () => {
        const data = mk(250);
        const r = await paginate(async ({ offset, limit }) => ({ items: data.slice(offset, offset + limit) }), { kind: 'offset', maxPages: 10, limit: 100, operation: 't' });
        expect(r).toHaveLength(250);
        expect(getIncomplete(r)).toBeUndefined();
    });
    it('page + total: total dolunca durur', async () => {
        const data = mk(200);
        const calls: number[] = [];
        const r = await paginate(async ({ page, limit }) => { calls.push(page); return { items: data.slice(page * limit, page * limit + limit), total: 200 }; }, { kind: 'page', maxPages: 10, limit: 100, operation: 't' });
        expect(r).toHaveLength(200);
        expect(calls).toEqual([0, 1]);
    });
    it('cursor: next null olunca durur; cursor sonraki çağrıya geçer', async () => {
        const cursors: any[] = [];
        const r = await paginate<{ id: number }>(async ({ cursor }) => {
            cursors.push(cursor);
            return cursor === undefined ? { items: mk(2), next: 'c1' } : cursor === 'c1' ? { items: mk(2, 10), next: null } : { items: [] };
        }, { kind: 'cursor', maxPages: 5, operation: 't' });
        expect(r).toHaveLength(4);
        expect(cursors).toEqual([undefined, 'c1']);
    });
    it('sayfa tavanı: sessiz kesme YOK, incomplete işaretli (PAGINATION_PAGE_CAP)', async () => {
        const r = await paginate(async ({ page, limit }) => ({ items: mk(limit, page * limit) }), { kind: 'page', maxPages: 3, limit: 10, operation: 't' });
        expect(r).toHaveLength(30);
        expect(getIncomplete(r)).toMatchObject({ incomplete: true, reason: 'PAGINATION_PAGE_CAP', collected: 30 });
    });
    it('kayıt tavanı ve tekrar eden sayfa işaretlenir', async () => {
        const cap = await paginate(async ({ page, limit }) => ({ items: mk(limit, page * limit) }), { kind: 'page', maxPages: 50, limit: 10, maxRecords: 25, operation: 't' });
        expect(getIncomplete(cap)?.reason).toBe('PAGINATION_RECORD_CAP');
        const rep = await paginate(async ({ limit }) => ({ items: mk(limit) }), { kind: 'offset', maxPages: 50, limit: 10, operation: 't' });
        expect(getIncomplete(rep)?.reason).toBe('PAGINATION_REPEATED_PAGE');
    });
    it('ara sayfa hatası yutulmaz', async () => {
        await expect(paginate(async ({ page }) => { if (page === 1) throw new Error('mid'); return { items: mk(10, page * 10) }; },
            { kind: 'page', maxPages: 5, limit: 10, operation: 't' })).rejects.toThrow('mid');
    });
});

describe('buildInternalOrder', () => {
    it('ortak varsayılanlar doldurulur, verilen alanlar korunur', () => {
        const o = buildInternalOrder({
            integrationCode: 'x', externalOrderId: '1', orderNumber: 'N1', externalStatus: 'Created', dates: { orderDate: new Date(0) },
            billingAddress: { firstName: 'A', city: 'C' }, financials: { grandTotal: 10 },
        });
        expect(o.internalStatus).toBe(OrderInternalStatusEnum.UNAPPROVED);
        expect(o.items).toEqual([]);
        expect(o.fulfillment).toEqual([]);
        expect(o.flags).toEqual({ isAllocated: false, isInvoiceGenerated: false, isMetricsProcessed: false });
        expect(o.billingAddress).toMatchObject({ firstName: 'A', city: 'C', addressLine1: '', state: '' });
        expect(o.shippingAddress).toMatchObject({ firstName: 'A' });
        expect(o.financials).toMatchObject({ subTotal: 0, grandTotal: 10 });
        expect(o.meta).toEqual({});
    });
    it('adaptörün verdiği status ve flags ezilmez', () => {
        const o = buildInternalOrder({
            integrationCode: 'x', externalOrderId: '1', orderNumber: 'N1', externalStatus: 'S', dates: { orderDate: new Date(0) },
            internalStatus: OrderInternalStatusEnum.SHIPPED, flags: { isAllocated: true },
        });
        expect(o.internalStatus).toBe('SHIPPED');
        expect(o.flags).toMatchObject({ isAllocated: true, isInvoiceGenerated: false });
    });
});
