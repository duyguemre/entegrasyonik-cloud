/**
 * INT-05 (N11) karakterizasyon: N11 `Service` HTTP katmanı, REST (RestService) ve SOAP (soapRequest) yolları AYRI (taban sınıfa geçişten ÖNCE yazıldı;
 * geçişten sonra, "BİLİNÇLİ DÜZELTME" işaretli senaryolar dışında AYNEN yeşil kalmalı). Gerçek ağ YOK: 127.0.0.1'deki geçici sunucu.
 * Kapsam: REST kimlik başlıkları (trim + alias), GET/POST/PUT idempotency, getReal CDN tabanı önceliği, SOAP zarfı/başlıkları,
 * SOAP okuma/yazma idempotency, `n11` / `n11-soap` AYRI breaker, SOAP yönlendirme (takip EDİLMEZ, ADR-0022; eskiden doğrudan axios = P9 açığı), sipariş kimliksiz kayıt, streamProducts tek sayfa.
 * Mock/URL yönlendirme (fail-closed, C19) zaten `MockMode.failOpen.characterization.test.ts`'te; varsayılan SOAP adresi `N11.soapTransport.characterization.test.ts`'te.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import Service from '@integration/modules/marketplace/n11/services/Service';
import { OrderService } from '@integration/modules/marketplace/n11/services/OrderService';
import { ProductService } from '@integration/modules/marketplace/n11/services/ProductService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';
import { captureLogs, LogCapture } from '../../helpers/logCapture';

let srv: LocalServerHandle | undefined;
let cap: LogCapture;
const seen: Array<{ method?: string; url?: string; headers: Record<string, any>; body: string }> = [];

const SOAP_OK = (root = 'OrderListResponse') => `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><sch:${root}><result><status>success</status></result></sch:${root}></soapenv:Body></soapenv:Envelope>`;

/** Gövdeyi tamponlar, isteği `seen`e yazar, sonra `reply` ile yanıtlar. */
const serveWith = (reply: (req: any, res: any) => void) => (req: any, res: any) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString(); });
    req.on('end', () => { seen.push({ method: req.method, url: req.url, headers: req.headers, body: raw }); reply(req, res); });
};
const json = (status = 200, body: any = {}) => (_req: any, res: any) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const xml = (status = 200, body = SOAP_OK()) => (_req: any, res: any) => { res.writeHead(status, { 'Content-Type': 'text/xml' }); res.end(body); };

const params = (baseUrl: string, settings: Record<string, any> = { APIKEY: 'key-1', APISECRET: 'sec-1' }, urls: Record<string, any> = {}) => ({
    clientId: 92,
    integrationSettings: {
        settings,
        urls: { baseUrl, orderService: `${baseUrl}/ws/OrderService.wsdl`, shipmentCompanyService: `${baseUrl}/ws/ShipmentCompanyService.wsdl`, ...urls },
    },
});

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    seen.length = 0;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    cap = captureLogs();
    ResilientHttpClient.resetAllState();
});
afterEach(async () => {
    cap.restore();
    jest.restoreAllMocks();
    if (srv) { await srv.close(); srv = undefined; }
});

describe('N11 REST - kimlik başlıkları', () => {
    it('GET: appkey/appsecret + Content-Type=application/json; hedef = baseUrl + göreli yol + sorgu', async () => {
        srv = await startLocalServer(serveWith(json()));
        await new Service(params(srv.baseUrl)).rest.get('ms/product-query', { page: 0, size: 1 });
        expect(seen).toHaveLength(1);
        expect(seen[0].method).toBe('GET');
        expect(seen[0].url).toBe('/ms/product-query?page=0&size=1');
        expect(seen[0].headers.appkey).toBe('key-1');
        expect(seen[0].headers.appsecret).toBe('sec-1');
        expect(seen[0].headers['content-type']).toBe('application/json');
    });

    it('alias sırası APIKEY > apikey > appKey > AppKey; değerler trim edilir', async () => {
        srv = await startLocalServer(serveWith(json()));
        await new Service(params(srv.baseUrl, { apikey: '  k-lower ', apisecret: ' s-lower  ' })).rest.get('x');
        expect(seen[0].headers.appkey).toBe('k-lower');
        expect(seen[0].headers.appsecret).toBe('s-lower');
        await new Service(params(srv.baseUrl, { AppKey: 'k-pascal', AppSecret: 's-pascal' })).rest.get('x');
        expect(seen[1].headers.appkey).toBe('k-pascal');
        expect(seen[1].headers.appsecret).toBe('s-pascal');
    });

    it('rest.get yanıtın `data` alanını döner (AxiosResponse değil)', async () => {
        srv = await startLocalServer(serveWith(json(200, { content: [1, 2] })));
        expect(await new Service(params(srv.baseUrl)).rest.get('x')).toEqual({ content: [1, 2] });
    });

    it('getReal (kategori CDN, mock kapalı): cdnBaseUrl > baseUrl önceliği', async () => {
        srv = await startLocalServer(serveWith(json(200, [])));
        await new Service(params(srv.baseUrl, undefined, { cdnBaseUrl: `${srv.baseUrl}/cdnbase` })).rest.getReal('cdn/categories');
        expect(seen[0].url).toBe('/cdnbase/cdn/categories');
        await new Service(params(srv.baseUrl)).rest.getReal('cdn/categories');
        expect(seen[1].url).toBe('/cdn/categories');
    });
});

describe('N11 REST - okuma/yazma semantiği (integrationCode n11)', () => {
    it('GET 500 -> okuma retry edilir (>1 çağrı), UNAVAILABLE, integrationCode n11', async () => {
        srv = await startLocalServer(serveWith(json(500, { message: 'hata' })));
        await expect(new Service(params(srv.baseUrl)).rest.get('ms/product-query'))
            .rejects.toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE', integrationCode: 'n11' });
        expect(srv.requestCount()).toBeGreaterThan(1);
    });

    it('POST (varsayılan yazma) 500 -> UNKNOWN_OUTCOME, tam 1 çağrı; PUT da aynı', async () => {
        srv = await startLocalServer(serveWith(json(500, {})));
        const svc = new Service(params(srv.baseUrl));
        await expect(svc.rest.post('ms/product/tasks/price-stock-update', { items: [] })).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME', integrationCode: 'n11' });
        ResilientHttpClient.resetAllState();
        await expect(svc.rest.put('ms/x', {})).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        expect(srv.requestCount()).toBe(2);
    });

    it('POST `idempotent:true` (sorgu amaçlı) 500 -> retry edilir, UNAVAILABLE', async () => {
        srv = await startLocalServer(serveWith(json(500, {})));
        await expect(new Service(params(srv.baseUrl)).rest.post('ms/q', {}, { idempotent: true })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(srv.requestCount()).toBeGreaterThan(1);
    });

    it('POST gövdesi JSON olarak iletilir', async () => {
        srv = await startLocalServer(serveWith(json(200, { id: 7 })));
        expect(await new Service(params(srv.baseUrl)).rest.post('ms/p', { a: 1 })).toEqual({ id: 7 });
        expect(seen[0].method).toBe('POST');
        expect(JSON.parse(seen[0].body)).toEqual({ a: 1 });
    });
});

describe('N11 SOAP (soapRequest) - zarf, başlıklar, semantik (integrationCode n11-soap)', () => {
    it('POST: text/xml;charset=UTF-8 + appkey/appsecret + User-Agent (zarf gövdesinde ham, trim YOK); zarf auth + kök eleman + yük içerir', async () => {
        srv = await startLocalServer(serveWith(xml()));
        const r = await new Service(params(srv.baseUrl, { APIKEY: ' k ', APISECRET: 's' })).soapRequest('orderService', 'sch:OrderListRequest', { 'sch:searchData': { period: { startDate: '01/09/2026' } } }, { idempotent: true });
        expect(r?.result?.status).toBe('success');
        expect(seen[0].method).toBe('POST');
        expect(seen[0].url).toBe('/ws/OrderService.wsdl');
        expect(seen[0].headers['content-type']).toBe('text/xml;charset=UTF-8');
        expect(seen[0].headers.appkey).toBe('k'); // HTTP katmanı baş/son boşluğu zaten atar; ham değer zarf gövdesinde
        expect(seen[0].headers.appsecret).toBe('s');
        expect(seen[0].headers['user-agent']).toBe('92 - Entegrasyonik N11 Client');
        expect(seen[0].body).toContain('<soapenv:Envelope');
        expect(seen[0].body).toContain('<sch:OrderListRequest>');
        expect(seen[0].body).toContain('<appKey> k </appKey>');
        expect(seen[0].body).toContain('<appSecret>s</appSecret>');
        expect(seen[0].body).toContain('<startDate>01/09/2026</startDate>');
    });

    it('SOAP-ENV önekli yanıt da gövde çıkarılarak ayrıştırılır', async () => {
        srv = await startLocalServer(serveWith(xml(200, '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><X><v>1</v></X></SOAP-ENV:Body></SOAP-ENV:Envelope>')));
        expect(await new Service(params(srv.baseUrl)).soapRequest('orderService', 'sch:R', {}, { idempotent: true })).toEqual({ v: '1' });
    });

    it('okuma (idempotent:true) 500 -> retry edilir (>1 çağrı), UNAVAILABLE, integrationCode n11-soap', async () => {
        srv = await startLocalServer(serveWith(xml(500, '<e/>')));
        await expect(new Service(params(srv.baseUrl)).soapRequest('orderService', 'sch:R', {}, { idempotent: true }))
            .rejects.toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE', integrationCode: 'n11-soap' });
        expect(srv.requestCount()).toBeGreaterThan(1);
    });

    it('yazma (varsayılan) 500 -> UNKNOWN_OUTCOME, tam 1 çağrı, integrationCode n11-soap', async () => {
        srv = await startLocalServer(serveWith(xml(500, '<e/>')));
        await expect(new Service(params(srv.baseUrl)).soapRequest('shipmentCompanyService', 'sch:MakeOrderItemShipmentRequest', {}))
            .rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME', integrationCode: 'n11-soap' });
        expect(srv.requestCount()).toBe(1);
    });

    it('SOAP business fault (200, status=failure) -> VALIDATION (integrationCode n11-soap), 1 çağrı', async () => {
        srv = await startLocalServer(serveWith(xml(200, '<soapenv:Envelope xmlns:soapenv="x"><soapenv:Body><R><result><status>failure</status><errorMessage>Red</errorMessage></result></R></soapenv:Body></soapenv:Envelope>')));
        await expect(new Service(params(srv.baseUrl)).soapRequest('orderService', 'sch:R', {}, { idempotent: true }))
            .rejects.toMatchObject({ code: 'VALIDATION', integrationCode: 'n11-soap' });
        expect(srv.requestCount()).toBe(1);
    });

    it('[BİLİNÇLİ DÜZELTME - ADR-0022 / INT-04 P9] SOAP yönlendirmesi TAKİP EDİLMEZ (taban istemcisi): VALIDATION, yalnız 1 istek (eskiden takip edilip başarılı dönerdi)', async () => {
        srv = await startLocalServer(serveWith((req, res) => {
            if (req.url === '/ws/OrderService.wsdl') { res.writeHead(302, { Location: '/ws/moved' }); res.end(); return; }
            xml()(req, res);
        }));
        await expect(new Service(params(srv.baseUrl)).soapRequest('orderService', 'sch:R', {}, { idempotent: true }))
            .rejects.toMatchObject({ name: 'IntegrationError', code: 'VALIDATION', integrationCode: 'n11-soap' });
        expect(seen.map(s => s.url)).toEqual(['/ws/OrderService.wsdl']);
    });
});

describe('N11 REST / SOAP AYRI breaker (n11 / n11-soap)', () => {
    it('REST okuma devresi açılınca (art arda 5xx) SOAP yedek çağrısı YİNE gerçek istek atar (paylaşımlı breaker olsaydı devre-açık reddederdi)', async () => {
        srv = await startLocalServer(serveWith((req, res) => (req.url?.startsWith('/ws/') ? xml()(req, res) : json(500, {})(req, res))));
        const svc = new Service(params(srv.baseUrl));
        await expect(svc.rest.get('ms/product-query')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        await expect(svc.rest.get('ms/product-query')).rejects.toMatchObject({ code: 'UNAVAILABLE' }); // devre açık (yeni istek gitmez)
        const before = seen.length;
        const r = await svc.soapRequest('orderService', 'sch:R', {}, { idempotent: true });
        expect(r?.result?.status).toBe('success');
        expect(seen.length).toBe(before + 1);
    });
});

describe('N11 OrderService - kimliksiz (orderNumber yok) REST kaydı', () => {
    const rest = (content: any[]) => serveWith(json(200, { totalElements: content.length, content }));
    const okPkg = (i: number) => ({ id: `ID-${i}`, orderNumber: `N-${i}`, shipmentPackageStatus: 'Created', lines: [], lastModifiedDate: 1780000000000 });

    it('[BİLİNÇLİ DÜZELTME - C7b] TÜMÜ (>=3) kimliksizse VALIDATION/ORDER_SCHEMA_DRIFT fırlatılır (eskiden sessizce [] dönerdi)', async () => {
        srv = await startLocalServer(rest([1, 2, 3, 4].map(i => ({ id: `ID-${i}`, shipmentPackageStatus: 'Created', lines: [] }))));
        const p = params(srv.baseUrl, undefined, { orderListUrl: 'rest/delivery/v1/shipmentPackages' });
        await expect(new OrderService(p, new Service(p)).fetchOrders({})).rejects.toMatchObject({ name: 'IntegrationError', code: 'VALIDATION', platformCode: 'ORDER_SCHEMA_DRIFT' });
    });

    it('kimliksiz kayıt az sayıdaysa (<3) toplu kayma sayılmaz: atlanır + loglanır, [] döner', async () => {
        srv = await startLocalServer(rest([{ id: 'X1', lines: [] }, { id: 'X2', lines: [] }]));
        const p = params(srv.baseUrl, undefined, { orderListUrl: 'rest/delivery/v1/shipmentPackages' });
        expect(await new OrderService(p, new Service(p)).fetchOrders({})).toEqual([]);
        expect(cap.find(l => l.code === 'ORDERSERVICE_N11_SIPARIS_KIMLIGI_EKSIK')).toBeDefined();
    });

    it('bir kısmı kimliksizse geçerli olanlar döner (kimliksiz atlanır)', async () => {
        srv = await startLocalServer(rest([okPkg(1), { id: 'X', lines: [] }, okPkg(2)]));
        const p = params(srv.baseUrl, undefined, { orderListUrl: 'rest/delivery/v1/shipmentPackages' });
        const r = await new OrderService(p, new Service(p)).fetchOrders({});
        expect(r.map(o => o.order.externalOrderId)).toEqual(['ID-1', 'ID-2']);
    });
});

describe('N11 ProductService.streamProducts - tüm sayfalar (F-02)', () => {
    const serve = (perPage: (cur: number) => number) => serveWith((req, res) => {
        const cur = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('currentPage') ?? 0);
        json(200, { products: Array.from({ length: perPage(cur) }, (_, i) => ({ productSellerCode: `S-${cur}-${i}` })), pagingData: { totalCount: 250 } })(req, res);
    });

    it('[BİLİNÇLİ DÜZELTME - F-02] pagingData.totalCount 250 => 3 sayfa (100+100+50), sayfa başına callback, COMPLETED (eskiden yalnız ilk 100 + COMPLETED)', async () => {
        srv = await startLocalServer(serve(cur => Math.min(100, 250 - cur * 100)));
        const p = params(srv.baseUrl);
        const chunks: any[][] = [];
        const r = await new ProductService(p, new Service(p)).streamProducts(async (c) => { chunks.push(c); });
        expect(srv.requestCount()).toBe(3);
        expect(chunks.map(c => c.length)).toEqual([100, 100, 50]);
        expect(r).toMatchObject({ status: 'COMPLETED', totalElements: 250, totalProcessed: 250, totalPages: 3 });
    });

    it('tek küçük sayfa: tek istek, COMPLETED, totalPages 1 (eski davranış korunur)', async () => {
        srv = await startLocalServer(serveWith(json(200, { products: [{ productSellerCode: 'A' }], pagingData: { totalCount: 1 } })));
        const p = params(srv.baseUrl);
        const r = await new ProductService(p, new Service(p)).streamProducts(async () => undefined);
        expect(srv.requestCount()).toBe(1);
        expect(r).toMatchObject({ status: 'COMPLETED', totalElements: 1, totalProcessed: 1, totalPages: 1 });
    });

    it('sunucu sayfa parametresini yok sayıp aynı sayfayı dönerse FAILED (sessiz COMPLETED değil), uyarı loglanır', async () => {
        srv = await startLocalServer(serveWith(json(200, { products: Array.from({ length: 100 }, (_, i) => ({ productSellerCode: `S-${i}` })), pagingData: { totalCount: 250 } })));
        const p = params(srv.baseUrl);
        const r = await new ProductService(p, new Service(p)).streamProducts(async () => undefined);
        expect(r).toMatchObject({ status: 'FAILED', totalProcessed: 100 });
        expect(cap.lines.some(l => l.code === 'PAGINATION_REPEATED_PAGE')).toBe(true);
    });
});
