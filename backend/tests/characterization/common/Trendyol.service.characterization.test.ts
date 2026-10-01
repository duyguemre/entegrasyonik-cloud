/**
 * INT-05 (Trendyol) karakterizasyon: Trendyol `Service` HTTP katmani (taban sinifa gecisten ONCE yazildi; gecis sonrasi AYNEN yesil).
 * Gercek ag YOK: 127.0.0.1'deki gecici sunucu. Mock yonlendirme/fail-closed ayrintisi `MockMode.failOpen` ve
 * `Trendyol.defaultUrlsAndUserAgent` testlerinde; burada kimlik/baslik/idempotency/politika/taban cozumleme.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import Service, { TRENDYOL_FALLBACK_BASE_URL } from '@integration/modules/marketplace/trendyol/services/Service';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';

let srv: LocalServerHandle | undefined;
type Seen = { method?: string; url?: string; headers: Record<string, any>; body: string };
const seen: Seen[] = [];
let status = 200;
const handler = (req: any, res: any) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString(); });
    req.on('end', () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body: raw });
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status === 200 ? { ok: true } : { message: 'hata' }));
    });
};
const params = (baseUrl?: string, settings: Record<string, any> = { APIKEY: 'key-1', APISECRET: 'sec-1', SELLERID: '778899' }) => ({
    clientId: 'c-ty',
    integrationSettings: { settings, urls: baseUrl === undefined ? {} : { baseUrl } },
});

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    seen.length = 0; status = 200;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    ResilientHttpClient.resetAllState();
});
afterEach(async () => {
    jest.restoreAllMocks();
    delete process.env.TY_HTTP_TIMEOUT_MS; delete process.env.TY_RATE_PER_MIN;
    if (srv) { await srv.close(); srv = undefined; }
});

describe('Trendyol Service - kimlik ve basliklar', () => {
    it('Basic auth (APIKEY:APISECRET) + User-Agent="<SELLERID> - Entegrasyonik"', async () => {
        srv = await startLocalServer(handler);
        await new Service(params(srv.baseUrl)).get('order/sellers/1/orders', { page: 0 });
        expect(seen[0].method).toBe('GET');
        expect(seen[0].url).toBe('/order/sellers/1/orders?page=0');
        expect(seen[0].headers.authorization).toBe(`Basic ${Buffer.from('key-1:sec-1').toString('base64')}`);
        expect(seen[0].headers['user-agent']).toBe('778899 - Entegrasyonik');
    });

    it('cagriya ozgu basliklar (storeFrontCode) varsayilanlarla birlesir, ayni anahtarda cagri kazanir', async () => {
        srv = await startLocalServer(handler);
        await new Service(params(srv.baseUrl)).get('finance/x', undefined, { headers: { storeFrontCode: 'TR', 'User-Agent': 'ozel' } });
        expect(seen[0].headers.storefrontcode).toBe('TR');
        expect(seen[0].headers['user-agent']).toBe('ozel');
        expect(seen[0].headers.authorization).toMatch(/^Basic /);
    });

    it('POST/PUT govdesi JSON gider', async () => {
        srv = await startLocalServer(handler);
        const s = new Service(params(srv.baseUrl));
        await s.post('a/b', { x: 1 });
        await s.put('a/c', { y: 2 });
        expect(seen.map(r => r.method)).toEqual(['POST', 'PUT']);
        expect(JSON.parse(seen[0].body)).toEqual({ x: 1 });
        expect(JSON.parse(seen[1].body)).toEqual({ y: 2 });
    });

    it('SELLERID yoksa duz Error (IntegrationError DEGIL) ve istek atilmaz', async () => {
        srv = await startLocalServer(handler);
        const p = params(srv.baseUrl, { APIKEY: 'k', APISECRET: 's' });
        const e: any = await new Service(p).get('x').catch(er => er);
        expect(e.name).toBe('Error');
        expect(e.message).toMatch(/SELLERID/);
        expect(seen).toHaveLength(0);
    });
});

describe('Trendyol Service - taban adres cozumleme (mock kapali)', () => {
    it('goreli yol Integrations.urls.baseUrl e eklenir (bas/son egik cizgi tekil)', async () => {
        srv = await startLocalServer(handler);
        await new Service(params(`${srv.baseUrl}/`)).get('/order/sellers/1/orders');
        expect(seen[0].url).toBe('/order/sellers/1/orders');
    });
    it('baseUrl bos ise fallback apigw.trendyol.com/integration', () => {
        expect(TRENDYOL_FALLBACK_BASE_URL).toBe('https://apigw.trendyol.com/integration');
    });
    it('mutlak URL aynen kullanilir (baseUrl yok sayilir)', async () => {
        srv = await startLocalServer(handler);
        await new Service(params('http://10.255.255.1:9')).get(`${srv.baseUrl}/abs/path`);
        expect(seen[0].url).toBe('/abs/path');
    });
});

describe('Trendyol Service - idempotency ve yeniden deneme', () => {
    it('GET 500 -> yeniden denenir (idempotent:true varsayilan)', async () => {
        srv = await startLocalServer(handler); status = 500;
        await expect(new Service(params(srv.baseUrl)).get('x')).rejects.toBeDefined();
        expect(seen.length).toBeGreaterThan(1);
    });
    it('POST 500 -> yeniden DENENMEZ (idempotent:false varsayilan)', async () => {
        srv = await startLocalServer(handler); status = 500;
        await expect(new Service(params(srv.baseUrl)).post('x', {})).rejects.toBeDefined();
        expect(seen).toHaveLength(1);
    });
    it('PUT 500 -> yeniden DENENMEZ', async () => {
        srv = await startLocalServer(handler); status = 500;
        await expect(new Service(params(srv.baseUrl)).put('x', {})).rejects.toBeDefined();
        expect(seen).toHaveLength(1);
    });
    it('cagri idempotent:true ile yazmada acikca yeniden denemeyi acabilir', async () => {
        srv = await startLocalServer(handler); status = 500;
        await expect(new Service(params(srv.baseUrl)).post('x', {}, { idempotent: true })).rejects.toBeDefined();
        expect(seen.length).toBeGreaterThan(1);
    });
});

describe('Trendyol Service - ResilientHttpClient politikasi', () => {
    const policy = (s: Service) => (s as any).http.policyConfig;
    it('varsayilan: timeout 30sn, maxConcurrent 10, ratePerMin 200 (global), grup kovalari X1 + finance', () => {
        const p = policy(new Service(params('http://x')));
        expect(p.timeoutMs).toBe(30000);
        expect(p.maxConcurrent).toBe(10);
        expect(p.ratePerMin).toBe(200);
        expect(p.groupRatePerMin).toEqual({ product_read: 1000, product_write: 200, inventory_price_write: 350, finance: 100 });
    });
    it('TY_HTTP_TIMEOUT_MS ve TY_RATE_PER_MIN env gecersiz kilar', () => {
        process.env.TY_HTTP_TIMEOUT_MS = '1234'; process.env.TY_RATE_PER_MIN = '77';
        const p = policy(new Service(params('http://x')));
        expect(p.timeoutMs).toBe(1234);
        expect(p.ratePerMin).toBe(77);
    });
    it('getInstance yeni Service doner', () => {
        expect(Service.getInstance(params('http://x'))).toBeInstanceOf(Service);
    });
});
