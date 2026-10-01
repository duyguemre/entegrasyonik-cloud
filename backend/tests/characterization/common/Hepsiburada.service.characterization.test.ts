/**
 * INT-05 (HB) karakterizasyon: HB `Service` HTTP katmanı (taban sınıfa geçişten ÖNCE yazıldı, geçişten sonra AYNEN yeşil kalmalı).
 * Gerçek ağ YOK: 127.0.0.1'deki geçici sunucu. Kapsam: kimlik başlıkları (Basic + User-Agent + Content-Type), ek başlık ezmesi
 * (multipart import), okuma/yazma idempotency (POST 5xx => UNKNOWN_OUTCOME, tek çağrı), anahtar alias sırası.
 * URL yönlendirme (BASEURL/LISTINGBASEURL/mock) zaten `MockMode.failOpen` + `K7.tenantUrlOverride` testlerinde.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import Service from '@integration/modules/marketplace/hepsiburada/services/Service';
import { ProductConnector } from '@integration/modules/marketplace/hepsiburada/api/ProductConnector';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';

let srv: LocalServerHandle | undefined;
const seen: Array<{ method?: string; url?: string; headers: Record<string, any>; body: string }> = [];

const respondJson = (status = 200, body: any = {}) => (req: any, res: any) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString(); });
    req.on('end', () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body: raw });
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
    });
};

const params = (baseUrl: string, settings: Record<string, any> = { APIKEY: 'key-1', APISECRET: 'sec-1', SELLERID: 'M-1' }) => ({
    clientId: 91,
    integrationSettings: { settings, urls: { BASEURL: baseUrl } },
});
const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    seen.length = 0;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    ResilientHttpClient.resetAllState();
});
afterEach(async () => {
    jest.restoreAllMocks();
    if (srv) { await srv.close(); srv = undefined; }
});

describe('Hepsiburada Service - kimlik başlıkları', () => {
    it('GET: Basic auth (APIKEY:APISECRET), User-Agent=entegrasyonik, Content-Type=application/json', async () => {
        srv = await startLocalServer(respondJson());
        await new Service(params(srv.baseUrl)).get('orders/merchantid/M-1', { limit: 1 });
        expect(seen).toHaveLength(1);
        expect(seen[0].method).toBe('GET');
        expect(seen[0].url).toBe('/orders/merchantid/M-1?limit=1');
        expect(seen[0].headers.authorization).toBe(basic('key-1', 'sec-1'));
        expect(seen[0].headers['user-agent']).toBe('entegrasyonik');
        expect(seen[0].headers['content-type']).toBe('application/json');
    });

    it('alias sırası: USERNAME/PASSWORD, APIKEY/APISECRET\'ten önce gelir; değerler trim edilir', async () => {
        srv = await startLocalServer(respondJson());
        await new Service(params(srv.baseUrl, { USERNAME: '  u-1 ', PASSWORD: ' p-1  ', APIKEY: 'k', APISECRET: 's' })).get('x');
        expect(seen[0].headers.authorization).toBe(basic('u-1', 'p-1'));
    });

    it('küçük harfli alias (username/password) de okunur', async () => {
        srv = await startLocalServer(respondJson());
        await new Service(params(srv.baseUrl, { username: 'lu', password: 'lp' })).get('x');
        expect(seen[0].headers.authorization).toBe(basic('lu', 'lp'));
    });

    it('ek başlık (multipart import) varsayılan Content-Type\'ı ezer; User-Agent korunur', async () => {
        srv = await startLocalServer(respondJson(200, { success: true, data: { trackingId: 'T-1' } }));
        const p = params(srv.baseUrl);
        const r = await new ProductConnector(new Service(p), p).importProducts([{ barcode: 'BC-1' }]);
        expect(r).toEqual({ success: true, data: { trackingId: 'T-1' } });
        expect(seen[0].method).toBe('POST');
        expect(seen[0].url).toBe('/product/api/products/import');
        expect(seen[0].headers['content-type']).toMatch(/^multipart\/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW/);
        expect(seen[0].headers['user-agent']).toBe('entegrasyonik');
        expect(seen[0].body).toContain('filename="integrator.json"');
    });
});

describe('Hepsiburada Service - okuma/yazma semantiği', () => {
    it('POST 500 -> IntegrationError UNKNOWN_OUTCOME, tam 1 çağrı (yazma otomatik retry edilmez)', async () => {
        srv = await startLocalServer(respondJson(500, { message: 'hata' }));
        await expect(new Service(params(srv.baseUrl)).post('packages/merchantid/M-1', { lineItemRequests: [] }))
            .rejects.toMatchObject({ name: 'IntegrationError', code: 'UNKNOWN_OUTCOME' });
        expect(srv.requestCount()).toBe(1);
    });

    it('GET 500 -> okuma retry edilir (1\'den fazla çağrı) ve UNAVAILABLE', async () => {
        srv = await startLocalServer(respondJson(500, { message: 'hata' }));
        await expect(new Service(params(srv.baseUrl)).get('orders/merchantid/M-1'))
            .rejects.toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE' });
        expect(srv.requestCount()).toBeGreaterThan(1);
    });

    it('PUT ve DELETE de yazma sayılır (500 -> UNKNOWN_OUTCOME, tek çağrı)', async () => {
        srv = await startLocalServer(respondJson(500, {}));
        const svc = new Service(params(srv.baseUrl));
        await expect(svc.put('a', {})).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        ResilientHttpClient.resetAllState();
        await expect(svc.delete('a')).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        expect(srv.requestCount()).toBe(2);
    });
});
