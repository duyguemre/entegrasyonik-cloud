/**
 * INT-05 (Pazarama) karakterizasyon: Pazarama `Service` HTTP + OAuth2 token katmanı (taban sınıfa geçişten ÖNCE yazıldı;
 * geçişten sonra dosya sonundaki "[DÜZELTME]" iki senaryo bilinçli düzeltmeyle TERS ÇEVRİLDİ, gerisi AYNEN yeşil kaldı).
 * Gerçek ağ YOK: 127.0.0.1'deki geçici sunucu. URL yönlendirme/mock fail-closed zaten `MockMode.failOpen` testinde.
 *
 * BİLİNÇLİ DÜZELTMELER (INT-05 Pazarama adım 2):
 *  - token isteği gövdesi kodlanmamış dizgiydi (`client_secret=a&b` gibi sırlar gövdeyi bozardı) -> URLSearchParams
 *  - eşzamanlı çağrılar her biri ayrı token isteği atıyordu (single-flight yok) -> tek istek paylaşılır
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import Service from '@integration/modules/marketplace/pazarama/services/Service';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';

let srv: LocalServerHandle | undefined;
type Seen = { method?: string; url?: string; headers: Record<string, any>; body: string };
const tokenReqs: Seen[] = [];
const apiReqs: Seen[] = [];
let tokenBody: any = { access_token: 'tok-1', expires_in: 3600 };
let tokenStatus = 200;
let apiStatus = 200;
let apiStatusFn: ((n: number) => number) | undefined;

const handler = (req: any, res: any) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString(); });
    req.on('end', () => {
        const seen = { method: req.method, url: req.url, headers: req.headers, body: raw };
        if (req.url?.includes('/connect/token')) {
            tokenReqs.push(seen);
            res.writeHead(tokenStatus, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(tokenStatus === 200 ? tokenBody : { error: 'invalid_client' }));
            return;
        }
        apiReqs.push(seen);
        const st = apiStatusFn ? apiStatusFn(apiReqs.length) : apiStatus;
        res.writeHead(st, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(st === 200 ? { data: [] } : { message: 'hata' }));
    });
};

const params = (baseUrl: string, settings: Record<string, any> = { APIKEY: 'key-1', APISECRET: 'sec-1' }) => ({
    clientId: 92,
    integrationSettings: { settings, urls: { baseUrl, tokenUrl: `${baseUrl}/connect/token` } },
});

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    tokenReqs.length = 0; apiReqs.length = 0;
    tokenBody = { access_token: 'tok-1', expires_in: 3600 }; tokenStatus = 200; apiStatus = 200; apiStatusFn = undefined;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    ResilientHttpClient.resetAllState();
});
afterEach(async () => {
    jest.restoreAllMocks();
    if (srv) { await srv.close(); srv = undefined; }
});

describe('Pazarama Service - kimlik başlıkları', () => {
    it('GET: Bearer token, User-Agent="<clientId> - Entegrasyonik", Content-Type=application/json', async () => {
        srv = await startLocalServer(handler);
        await new Service(params(srv.baseUrl)).get('product/products', { page: 1, size: 1 });
        expect(apiReqs).toHaveLength(1);
        expect(apiReqs[0].method).toBe('GET');
        expect(apiReqs[0].url).toBe('/product/products?page=1&size=1');
        expect(apiReqs[0].headers.authorization).toBe('Bearer tok-1');
        expect(apiReqs[0].headers['user-agent']).toBe('92 - Entegrasyonik');
        expect(apiReqs[0].headers['content-type']).toBe('application/json');
    });

    it('göreli yol integrationSettings.urls.baseUrl\'e eklenir (baştaki/sondaki eğik çizgi tekilleştirilir)', async () => {
        srv = await startLocalServer(handler);
        const p = params(srv.baseUrl); (p.integrationSettings.urls as any).baseUrl = `${srv.baseUrl}/`;
        await new Service(p).post('/order/getOrdersForApi', { a: 1 });
        expect(apiReqs[0].url).toBe('/order/getOrdersForApi');
        expect(JSON.parse(apiReqs[0].body)).toEqual({ a: 1 });
    });
});

describe('Pazarama Service - OAuth2 token isteği', () => {
    it('POST tokenUrl, Content-Type=application/x-www-form-urlencoded, client_credentials alanları', async () => {
        srv = await startLocalServer(handler);
        await new Service(params(srv.baseUrl)).get('x');
        expect(tokenReqs).toHaveLength(1);
        expect(tokenReqs[0].method).toBe('POST');
        expect(tokenReqs[0].url).toBe('/connect/token');
        expect(tokenReqs[0].headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
        const form = new URLSearchParams(tokenReqs[0].body);
        expect(form.get('grant_type')).toBe('client_credentials');
        expect(form.get('client_id')).toBe('key-1');
        expect(form.get('client_secret')).toBe('sec-1');
    });

    it('token önbelleğe alınır: ardışık çağrılar tek token isteği kullanır', async () => {
        srv = await startLocalServer(handler);
        const svc = new Service(params(srv.baseUrl));
        await svc.get('a'); await svc.get('b'); await svc.post('c', {});
        expect(tokenReqs).toHaveLength(1);
        expect(apiReqs).toHaveLength(3);
    });

    it('süre payı: expires_in <= 300 sn ise önbellek kullanılmaz (her çağrıda yeni token)', async () => {
        tokenBody = { access_token: 'tok-short', expires_in: 200 };
        srv = await startLocalServer(handler);
        const svc = new Service(params(srv.baseUrl));
        await svc.get('a'); await svc.get('b');
        expect(tokenReqs).toHaveLength(2);
    });

    it('getAccessToken(true) önbelleği atlar; getAccessToken() token metnini döner', async () => {
        srv = await startLocalServer(handler);
        const svc = new Service(params(srv.baseUrl));
        expect(await svc.getAccessToken()).toBe('tok-1');
        expect(await svc.getAccessToken()).toBe('tok-1');
        expect(tokenReqs).toHaveLength(1);
        tokenBody = { access_token: 'tok-2', expires_in: 3600 };
        expect(await svc.getAccessToken(true)).toBe('tok-2');
        expect(tokenReqs).toHaveLength(2);
        await svc.get('x');
        expect(apiReqs[0].headers.authorization).toBe('Bearer tok-2');
    });

    it('token ucu 401 -> IntegrationError(AUTH); veri ucuna istek atılmaz', async () => {
        tokenStatus = 401;
        srv = await startLocalServer(handler);
        await expect(new Service(params(srv.baseUrl)).get('x')).rejects.toMatchObject({ name: 'IntegrationError', code: 'AUTH' });
        expect(apiReqs).toHaveLength(0);
    });

    it('token ucu 500 -> okuma sayıldığı için retry edilir (1\'den fazla istek) ve UNAVAILABLE', async () => {
        tokenStatus = 500;
        srv = await startLocalServer(handler);
        await expect(new Service(params(srv.baseUrl)).get('x')).rejects.toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE' });
        expect(tokenReqs.length).toBeGreaterThan(1);
        expect(apiReqs).toHaveLength(0);
    });
});

describe('Pazarama Service - 401 "auth hook" (token sıfırla, BİR KEZ yeniden dene)', () => {
    it('ilk veri isteği 401 -> yeni token alınır ve istek bir kez tekrarlanır (2 token, 2 veri isteği)', async () => {
        apiStatusFn = (n) => (n === 1 ? 401 : 200);
        srv = await startLocalServer(handler);
        const r = await new Service(params(srv.baseUrl)).get('x');
        expect(r.status).toBe(200);
        expect(tokenReqs).toHaveLength(2);
        expect(apiReqs).toHaveLength(2);
    });

    it('iki kez 401 -> AUTH fırlatılır, üçüncü deneme YOK (2 veri isteği)', async () => {
        apiStatus = 401;
        srv = await startLocalServer(handler);
        await expect(new Service(params(srv.baseUrl)).get('x')).rejects.toMatchObject({ code: 'AUTH', retryable: false });
        expect(apiReqs).toHaveLength(2);
    });

    it('403 de AUTH sınıfıdır: aynı tek yenileme akışı', async () => {
        apiStatus = 403;
        srv = await startLocalServer(handler);
        await expect(new Service(params(srv.baseUrl)).get('x')).rejects.toMatchObject({ code: 'AUTH' });
        expect(apiReqs).toHaveLength(2);
    });
});

describe('Pazarama Service - okuma/yazma semantiği', () => {
    it('POST 500 -> UNKNOWN_OUTCOME, tam 1 veri isteği (yazma otomatik retry edilmez)', async () => {
        apiStatus = 500;
        srv = await startLocalServer(handler);
        await expect(new Service(params(srv.baseUrl)).post('order/updateOrderStatus', {})).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        expect(apiReqs).toHaveLength(1);
    });

    it('POST + idempotent:true (sorgu amaçlı POST) 500 -> retry edilir (UNAVAILABLE)', async () => {
        apiStatus = 500;
        srv = await startLocalServer(handler);
        await expect(new Service(params(srv.baseUrl)).post('order/getOrdersForApi', {}, { idempotent: true })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(apiReqs.length).toBeGreaterThan(1);
    });

    it('GET 500 -> okuma retry edilir; PUT 500 -> UNKNOWN_OUTCOME tek çağrı', async () => {
        apiStatus = 500;
        srv = await startLocalServer(handler);
        const svc = new Service(params(srv.baseUrl));
        await expect(svc.get('a')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(apiReqs.length).toBeGreaterThan(1);
        ResilientHttpClient.resetAllState(); apiReqs.length = 0;
        await expect(svc.put('a', {})).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        expect(apiReqs).toHaveLength(1);
    });
});

describe('Pazarama Service - token gövdesi ve eşzamanlılık (bilinçli düzeltmeler)', () => {
    // DÜZELTME (INT-05): gövde artık URLSearchParams ile kodlanır. ESKİ: ham birleştirme (`client_id=k&1&...`) sunucuda client_id=k olarak çözülürdü.
    it('[DÜZELTME] özel karakterli sır/anahtar (k&1, a&b=c d+%) token gövdesinde KODLANIR ve sunucuda aynen çözülür', async () => {
        srv = await startLocalServer(handler);
        await new Service(params(srv.baseUrl, { APIKEY: 'k&1', APISECRET: 'a&b=c d+%' })).get('x');
        expect(tokenReqs[0].body).not.toContain('k&1');
        const form = new URLSearchParams(tokenReqs[0].body);
        expect(form.get('client_id')).toBe('k&1');
        expect(form.get('client_secret')).toBe('a&b=c d+%');
        // [BİLİNÇLİ DÜZELTME - eslesme-fiyat WP4 C-1/D-PZ-1] `scope` eklendi (eskiden gönderilmiyordu).
        expect([...form.keys()].sort()).toEqual(['client_id', 'client_secret', 'grant_type', 'scope']);
    });

    // DÜZELTME (INT-05): OAuthTokenCache single-flight. ESKİ: 5 token isteği.
    it('[DÜZELTME] eşzamanlı 5 çağrı TEK token isteği paylaşır (single-flight)', async () => {
        srv = await startLocalServer(handler);
        const svc = new Service(params(srv.baseUrl));
        await Promise.all([1, 2, 3, 4, 5].map(i => svc.get(`x${i}`)));
        expect(tokenReqs).toHaveLength(1);
        expect(apiReqs).toHaveLength(5);
    });

    it('token hatası önbelleğe alınmaz: sonraki çağrı yeniden dener (başarılı olur)', async () => {
        tokenStatus = 401;
        srv = await startLocalServer(handler);
        const svc = new Service(params(srv.baseUrl));
        await expect(svc.get('x')).rejects.toMatchObject({ code: 'AUTH' });
        tokenStatus = 200; ResilientHttpClient.resetAllState();
        await expect(svc.get('x')).resolves.toMatchObject({ status: 200 });
    });

    it('200 ama access_token yok -> AUTH (TOKEN_RESPONSE_INVALID); "Bearer undefined" ile istek ATILMAZ', async () => {
        tokenBody = { expires_in: 3600 };
        srv = await startLocalServer(handler);
        await expect(new Service(params(srv.baseUrl)).get('x')).rejects.toMatchObject({ code: 'AUTH', platformCode: 'TOKEN_RESPONSE_INVALID' });
        expect(apiReqs).toHaveLength(0);
    });
});
