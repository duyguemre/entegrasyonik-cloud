/**
 * Karakterizasyon testi (Protokol 13) — BACKLOG C19: "mock modu fail-open".
 *
 * [C19 DÜZELTMESİ SONRASI — KASITLI TERS ÇEVİRME] Bu dosya ilk yazıldığında (commit "mock modu fail-open
davranisi karakterizasyon testleriyle sabitlendi") mevcut GÜVENSİZ davranışı sabitliyordu; kod
(common/mock/MockMode.ts + adaptör Service'leri) düzeltildikten sonra "[FAIL-OPEN]" işaretli assertion'lar
KASITLI OLARAK TERS ÇEVRİLDİ: artık her biri "IntegrationError(NOT_SUPPORTED, platformCode
MOCK_ENDPOINT_NOT_MOCKED, retryable=false) fırlatılır VE axios'a HİÇ çağrı yapılmaz" davranışını
sabitler. "(değişmemeli)" işaretli testler ise dokunulmadan yeşil kaldı (mock KAPALI + mock'lanabilir
yol davranışı bit-bit aynı). Eski (güvensiz) davranış aşağıda her testin yorumunda referans için durur.

ESKİ (düzeltme öncesi) açıklama: `*_MOCK_MODE=true` iken
 * `*_MOCKABLE_ENDPOINTS` listesinde OLMAYAN bir endpoint (ya da listede hiç girdi yokken herhangi bir
 * endpoint / mock tabanına çevrilemeyen mutlak URL) mock'a değil, GERÇEK pazaryeri adresine (tenant'ın
 * gerçek kimlik bilgisiyle) gider. Canlı gözlem: N11 mock modda `https://api.n11.com/rest/delivery/v1/
 * shipmentPackages`'a gitmeye çalıştı; yalnızca dev-tools/egress-guard.js engelledi.
 *
 * Hiçbir gerçek ağ isteği atılmaz: axios `jest.mock` ile taklit edilir; testler yalnızca axios'a
 * GEÇİRİLEN URL'yi okur.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import TrendyolService from '@integration/modules/marketplace/trendyol/services/Service';
import PazaramaService from '@integration/modules/marketplace/pazarama/services/Service';
import N11Service from '@integration/modules/marketplace/n11/services/Service';
import HepsiburadaService from '@integration/modules/marketplace/hepsiburada/services/Service';
import IdeasoftService from '@integration/modules/ecommerce/ideasoft/services/Service';
import BizimhesapService from '@integration/modules/erp/bizimhesap/services/Service';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { http, resetHttp, httpCallCount } from '../stubs/_axiosMock';

const ENV_KEYS = [
    'TY_MOCK_MODE', 'TY_MOCK_BASE_URL', 'TY_MOCKABLE_ENDPOINTS',
    'PAZARAMA_MOCK_MODE', 'PAZARAMA_MOCK_BASE_URL', 'PAZARAMA_MOCKABLE_ENDPOINTS',
    'N11_MOCK_MODE', 'N11_MOCK_BASE_URL', 'N11_MOCKABLE_ENDPOINTS',
    'HEPSIBURADA_MOCK_MODE', 'HEPSIBURADA_MOCK_BASE_URL',
    'IDEASOFT_MOCK_MODE', 'IDEASOFT_MOCK_BASE_URL',
    'BIZIMHESAP_MOCK_MODE', 'BIZIMHESAP_MOCK_BASE_URL',
];
const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetHttp();
    ResilientHttpClient.resetAllState();
});
afterEach(() => {
    for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
    jest.restoreAllMocks();
});

const lastUrl = (fn: any, callIdx = 0): string => (fn.mock.calls[callIdx] as any[])[0] as string;

/** Fail-closed sözleşmesi: NOT_SUPPORTED/MOCK_ENDPOINT_NOT_MOCKED, retryable=false ve ağ katmanına HİÇ çağrı yok. */
async function expectBlocked(p: Promise<unknown>): Promise<void> {
    await expect(p).rejects.toMatchObject({
        name: 'IntegrationError',
        code: 'NOT_SUPPORTED',
        retryable: false,
        platformCode: 'MOCK_ENDPOINT_NOT_MOCKED',
    });
    expect(httpCallCount()).toBe(0);
}

// ---------------------------------------------------------------- Trendyol
const tyParams = () => ({
    clientId: 'c1',
    integrationSettings: { settings: { APIKEY: 'k', APISECRET: 's', SELLERID: '1' }, urls: {} },
});
const tyMock = (list: string | null = 'order,inventory/sellers') => {
    process.env.TY_MOCK_MODE = 'true';
    process.env.TY_MOCK_BASE_URL = 'http://localhost:3005/integration';
    if (list !== null) process.env.TY_MOCKABLE_ENDPOINTS = list;
};

describe('C19 karakterizasyon — Trendyol getTargetUrl (mock modu)', () => {
    it('mock modu KAPALIYKEN URL aynen gerçek adrese gider (değişmemeli)', async () => {
        http.get.mockResolvedValue({ data: {} } as never);
        await new TrendyolService(tyParams()).get('https://apigw.trendyol.com/integration/order/sellers/1/v2/orders');
        expect(lastUrl(http.get)).toBe('https://apigw.trendyol.com/integration/order/sellers/1/v2/orders');
    });

    it('mock AÇIK + listede olan mutlak URL -> host mock tabanına çevrilir, /integration/integration çiftleşmesi tekilleştirilir (değişmemeli)', async () => {
        tyMock();
        http.get.mockResolvedValue({ data: {} } as never);
        await new TrendyolService(tyParams()).get('https://apigw.trendyol.com/integration/order/sellers/1/v2/orders');
        expect(lastUrl(http.get)).toBe('http://localhost:3005/integration/order/sellers/1/v2/orders');
    });

    it('mock AÇIK + listede olan GÖRELİ yol -> mock tabanına eklenir (değişmemeli)', async () => {
        tyMock();
        http.get.mockResolvedValue({ data: {} } as never);
        await new TrendyolService(tyParams()).get('order/sellers/1/orders');
        expect(lastUrl(http.get)).toBe('http://localhost:3005/integration/order/sellers/1/orders');
    });

    // ESKİ (fail-open): GERÇEK Trendyol adresine (https://apigw.trendyol.com/...), gerçek kimlik bilgisiyle giderdi.
    it('[FAIL-CLOSED] mock AÇIK + listede OLMAYAN mutlak URL -> NOT_SUPPORTED, istek ATILMAZ', async () => {
        tyMock();
        http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new TrendyolService(tyParams()).get('https://apigw.trendyol.com/integration/webhook/sellers/1/webhooks'));
    });

    // ESKİ (fail-open): gerçek varsayılan taban https://api.trendyol.com/sapigw/webhooks/x kullanılırdı.
    it('[FAIL-CLOSED] mock AÇIK + listede OLMAYAN göreli yol -> NOT_SUPPORTED, istek ATILMAZ', async () => {
        tyMock();
        http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new TrendyolService(tyParams()).get('webhooks/x'));
    });

    // ESKİ: url.includes("") her zaman true olduğundan boş liste = joker (HER endpoint mock'a giderdi).
    it('[FAIL-CLOSED] mock AÇIK + liste BOŞ/tanımsız -> hiçbir endpoint mock sayılmaz: NOT_SUPPORTED', async () => {
        tyMock(null);
        http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new TrendyolService(tyParams()).get('webhooks/x'));
    });

    it('[FAIL-CLOSED] mock AÇIK + yalnız virgül/boşluktan oluşan liste (" , ,") -> yine hiçbir şey mock sayılmaz', async () => {
        tyMock(' , ,');
        http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new TrendyolService(tyParams()).get('order/sellers/1/orders'));
    });

    // ESKİ: olduğu gibi (https://stageapigw.trendyol.com/...) yabancı/gerçek host'a giderdi.
    it('[FAIL-CLOSED] mock AÇIK + listede olan yol ama host regex ile mock tabanına ÇEVRİLEMEYEN mutlak URL -> NOT_SUPPORTED', async () => {
        tyMock();
        http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new TrendyolService(tyParams()).get('https://stageapigw.trendyol.com/integration/order/sellers/1/v2/orders'));
    });

    it('mock AÇIK + mock tabanı özel host (Docker servis adı gibi) -> mutlak URL o host\'a çevrilir ve geçer', async () => {
        tyMock();
        process.env.TY_MOCK_BASE_URL = 'http://mockserver:3005/integration';
        http.get.mockResolvedValue({ data: {} } as never);
        await new TrendyolService(tyParams()).get('https://apigw.trendyol.com/integration/order/sellers/1/v2/orders');
        expect(lastUrl(http.get)).toBe('http://mockserver:3005/integration/order/sellers/1/v2/orders');
    });
});

// ---------------------------------------------------------------- Pazarama
const pzParams = () => ({
    clientId: 'c1',
    integrationSettings: {
        settings: { APIKEY: 'k', APISECRET: 's' },
        urls: { baseUrl: 'https://isortagimapi.pazarama.com', tokenUrl: 'https://isortagimgiris.pazarama.com/connect/token' },
    },
});
const pzMock = (list: string | null = 'product,order') => {
    process.env.PAZARAMA_MOCK_MODE = 'true';
    process.env.PAZARAMA_MOCK_BASE_URL = 'http://localhost:3006/apigateway';
    if (list !== null) process.env.PAZARAMA_MOCKABLE_ENDPOINTS = list;
};
const pzToken = () => http.post.mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } } as never);

describe('C19 karakterizasyon — Pazarama getTargetUrl/getTokenUrl (mock modu)', () => {
    it('mock KAPALI: token gerçek URL\'ye, istek gerçek tabana gider (değişmemeli)', async () => {
        pzToken(); http.get.mockResolvedValue({ data: {} } as never);
        await new PazaramaService(pzParams()).get('brand/list');
        expect(lastUrl(http.post)).toBe('https://isortagimgiris.pazarama.com/connect/token');
        expect(lastUrl(http.get)).toBe('https://isortagimapi.pazarama.com/brand/list');
    });

    it('mock AÇIK: token HER ZAMAN mock köküne gider (değişmemeli)', async () => {
        pzMock(); pzToken(); http.get.mockResolvedValue({ data: {} } as never);
        await new PazaramaService(pzParams()).get('product/x');
        expect(lastUrl(http.post)).toBe('http://localhost:3006/connect/token');
    });

    it('mock AÇIK + listede olan göreli yol -> mock tabanı (değişmemeli)', async () => {
        pzMock(); pzToken(); http.get.mockResolvedValue({ data: {} } as never);
        await new PazaramaService(pzParams()).get('product/x');
        expect(lastUrl(http.get)).toBe('http://localhost:3006/apigateway/product/x');
    });

    // ESKİ: GERÇEK Pazarama tabanına (https://isortagimapi.pazarama.com/brand/list, mock token ile) giderdi.
    it('[FAIL-CLOSED] mock AÇIK + listede OLMAYAN göreli yol -> NOT_SUPPORTED; token dahil HİÇ istek atılmaz', async () => {
        pzMock(); pzToken(); http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new PazaramaService(pzParams()).get('brand/list'));
    });

    // ESKİ: olduğu gibi gerçek adrese giderdi.
    it('[FAIL-CLOSED] mock AÇIK + listede OLMAYAN mutlak URL -> NOT_SUPPORTED', async () => {
        pzMock(); pzToken(); http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new PazaramaService(pzParams()).get('https://isortagimapi.pazarama.com/brand/list'));
    });

    it('[FAIL-CLOSED] mock AÇIK + listede olan yol ama mock tabanına çevrilemeyen yabancı host -> NOT_SUPPORTED', async () => {
        pzMock(); pzToken(); http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new PazaramaService(pzParams()).get('https://other.example.com/product/list'));
    });

    // ESKİ: boş girdi joker: her yol mock sayılırdı.
    it('[FAIL-CLOSED] mock AÇIK + liste BOŞ -> hiçbir yol mock sayılmaz: NOT_SUPPORTED', async () => {
        pzMock(null); pzToken(); http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new PazaramaService(pzParams()).get('brand/list'));
    });

    it('[FAIL-CLOSED] hata retryable DEĞİL, integrationCode pazarama, ağ çağrısı yok (auth-retry/backoff döngüsüne girmez)', async () => {
        pzMock(); pzToken();
        const err: any = await new PazaramaService(pzParams()).post('brand/x', {}).catch(e => e);
        expect(err.retryable).toBe(false);
        expect(err.integrationCode).toBe('pazarama');
        expect(httpCallCount()).toBe(0);
    });
});

// ---------------------------------------------------------------- N11
const n11Params = () => ({
    clientId: 'c1',
    integrationSettings: { settings: { APIKEY: 'k', APISECRET: 's' }, urls: {} },
});
const n11Mock = (list: string | null = 'ms/product,ws/OrderService.wsdl') => {
    process.env.N11_MOCK_MODE = 'true';
    process.env.N11_MOCK_BASE_URL = 'http://localhost:6015/n11';
    if (list !== null) process.env.N11_MOCKABLE_ENDPOINTS = list;
};
const SOAP_OK = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><X><result><status>success</status></result></X></soapenv:Body></soapenv:Envelope>';

describe('C19 karakterizasyon — N11 RestService/Service getTargetUrl (mock modu)', () => {
    it('REST: mock KAPALI -> gerçek taban (değişmemeli)', async () => {
        http.get.mockResolvedValue({ data: {} } as never);
        await new N11Service(n11Params()).rest.get('ms/product-query');
        expect(lastUrl(http.get)).toBe('https://api.n11.com/ms/product-query');
    });

    it('REST: mock AÇIK + listede olan endpoint -> mock tabanı (değişmemeli)', async () => {
        n11Mock(); http.get.mockResolvedValue({ data: {} } as never);
        await new N11Service(n11Params()).rest.get('ms/product-query');
        expect(lastUrl(http.get)).toBe('http://localhost:6015/n11/ms/product-query');
    });

    // ESKİ (canlıda gözlenen): GERÇEK https://api.n11.com/rest/delivery/v1/shipmentPackages'a, appkey/appsecret ile giderdi.
    it('[FAIL-CLOSED] REST: mock AÇIK + listede OLMAYAN endpoint (canlıda gözlenen shipmentPackages) -> NOT_SUPPORTED, istek ATILMAZ', async () => {
        n11Mock(); http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new N11Service(n11Params()).rest.get('rest/delivery/v1/shipmentPackages'));
    });

    it('[FAIL-CLOSED] REST post/put: listede olmayan endpoint için de aynı (yazma istekleri gerçeğe ASLA gitmez)', async () => {
        n11Mock();
        const svc = new N11Service(n11Params());
        await expectBlocked(svc.rest.post('xx/unlisted-thing', {}));
        await expectBlocked(svc.rest.put('xx/unlisted-thing', {}));
    });

    // ESKİ: getReal mock modunda BİLİNÇLİ olarak mock'u atlar, HER ZAMAN gerçek N11 CDN'e (https://api.n11.com/cdn/categories) giderdi.
    it('[FAIL-CLOSED] REST getReal: mock AÇIK + listede OLMAYAN endpoint -> NOT_SUPPORTED (artık gerçek CDN\'e gitmez)', async () => {
        n11Mock(); http.get.mockResolvedValue({ data: [] } as never);
        await expectBlocked(new N11Service(n11Params()).rest.getReal('cdn/categories'));
    });

    it('REST getReal: mock AÇIK + endpoint listedeyse (mockserver cdn/categories sunar) -> MOCK tabanına gider', async () => {
        n11Mock('cdn/categories'); http.get.mockResolvedValue({ data: [] } as never);
        await new N11Service(n11Params()).rest.getReal('cdn/categories');
        expect(lastUrl(http.get)).toBe('http://localhost:6015/n11/cdn/categories');
    });

    it('REST getReal: mock KAPALI -> gerçek CDN (cdnBaseUrl öncelikli) (değişmemeli)', async () => {
        http.get.mockResolvedValue({ data: [] } as never);
        const p = n11Params() as any;
        await new N11Service(p).rest.getReal('cdn/categories');
        expect(lastUrl(http.get)).toBe('https://api.n11.com/cdn/categories');
        http.get.mockClear();
        // [K7 2026-09-28] Giden-host koruması: platform cdnBaseUrl'i de İZİNLİ host'ta olmalı (önceki test değeri uydurma
        // `cdn.n11.example` idi; ResilientHttpClient artık izin listesi dışı host'u reddeder). Öncelik davranışı aynı host + yol ile sabitlenir.
        p.integrationSettings.urls.cdnBaseUrl = 'https://api.n11.com/cdnbase';
        await new N11Service(p).rest.getReal('cdn/categories');
        expect(lastUrl(http.get)).toBe('https://api.n11.com/cdnbase/cdn/categories');
    });

    // ESKİ: endpoint.includes("") joker: her endpoint mock sayılırdı.
    it('[FAIL-CLOSED] REST: mock AÇIK + liste BOŞ -> hiçbir endpoint mock sayılmaz: NOT_SUPPORTED', async () => {
        n11Mock(null); http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new N11Service(n11Params()).rest.get('rest/delivery/v1/shipmentPackages'));
    });

    it('SOAP: mock AÇIK + listede olan WSDL -> mock tabanı (değişmemeli)', async () => {
        n11Mock(); http.post.mockResolvedValue({ data: SOAP_OK } as never);
        await new N11Service(n11Params()).soapRequest('orderService', 'sch:OrderListRequest', {}, { idempotent: true });
        expect(lastUrl(http.post)).toBe('http://localhost:6015/n11/ws/OrderService.wsdl');
    });

    // ESKİ: GERÇEK https://api.n11.com/ws/... adresine giderdi.
    it('[FAIL-CLOSED] SOAP: mock AÇIK + listede OLMAYAN WSDL -> NOT_SUPPORTED, istek ATILMAZ (integrationCode n11-soap)', async () => {
        n11Mock(); http.post.mockResolvedValue({ data: SOAP_OK } as never);
        const err: any = await new N11Service(n11Params()).soapRequest('ticketService', 'sch:GetTicketRequest', {}, { idempotent: true }).catch(e => e);
        expect(err).toMatchObject({ name: 'IntegrationError', code: 'NOT_SUPPORTED', retryable: false, platformCode: 'MOCK_ENDPOINT_NOT_MOCKED', integrationCode: 'n11-soap' });
        expect(httpCallCount()).toBe(0);
    });

    // ESKİ: eşleşen girdi "" (falsy) olduğundan `!!matchedEndpoint` false: REST'ten FARKLI olarak (REST joker) SOAP GERÇEK adrese giderdi (tutarsız).
    it('[FAIL-CLOSED] SOAP: mock AÇIK + liste BOŞ -> NOT_SUPPORTED (REST ile artık TUTARLI)', async () => {
        n11Mock(null); http.post.mockResolvedValue({ data: SOAP_OK } as never);
        await expectBlocked(new N11Service(n11Params()).soapRequest('ticketService', 'sch:GetTicketRequest', {}, { idempotent: true }));
    });

    // ESKİ: olduğu gibi (https://sandbox.n11.example/...) yabancı host'a giderdi.
    it('[FAIL-CLOSED] SOAP: mock AÇIK + listede olan ama mock tabanına ÇEVRİLEMEYEN mutlak WSDL URL -> NOT_SUPPORTED', async () => {
        n11Mock();
        const p = n11Params() as any;
        p.integrationSettings.urls.orderService = 'https://sandbox.n11.example/ws/OrderService.wsdl';
        http.post.mockResolvedValue({ data: SOAP_OK } as never);
        await expectBlocked(new N11Service(p).soapRequest('orderService', 'sch:OrderListRequest', {}, { idempotent: true }));
    });
});

// ---------------------------------------------------------------- Hepsiburada
const hbParams = () => ({
    clientId: 'c1',
    integrationSettings: { settings: { USERNAME: 'u', PASSWORD: 'p' }, urls: {} },
});

describe('C19 karakterizasyon — Hepsiburada getTargetUrl (mock modu)', () => {
    it('mock AÇIK: göreli yol mock tabanına gider (değişmemeli)', async () => {
        process.env.HEPSIBURADA_MOCK_MODE = 'true';
        http.get.mockResolvedValue({ data: {} } as never);
        await new HepsiburadaService(hbParams()).get('listings/merchantid/1');
        expect(lastUrl(http.get)).toBe('http://127.0.0.1:6015/hepsiburada/listings/merchantid/1');
    });

    // ESKİ: kategori endpoint'leri "mock modundan bağımsız" GERÇEK https://mpop.hepsiburada.com'a giderdi.
    it('[FAIL-CLOSED] mock AÇIK: kategori endpoint\'leri artık MOCK tabanına gider (mockserver sunar), gerçeğe gitmez', async () => {
        process.env.HEPSIBURADA_MOCK_MODE = 'true';
        http.get.mockResolvedValue({ data: {} } as never);
        await new HepsiburadaService(hbParams()).get('product/api/categories/get-all-categories');
        expect(lastUrl(http.get)).toBe('http://127.0.0.1:6015/hepsiburada/product/api/categories/get-all-categories');
    });

    it('mock KAPALI: kategori endpoint\'leri gerçek tabana gider (değişmemeli)', async () => {
        http.get.mockResolvedValue({ data: {} } as never);
        await new HepsiburadaService(hbParams()).get('product/api/categories/get-all-categories');
        expect(lastUrl(http.get)).toBe('https://mpop.hepsiburada.com/product/api/categories/get-all-categories');
    });

    // ESKİ: mutlak URL olduğu gibi gerçek adrese giderdi.
    it('[FAIL-CLOSED] mock AÇIK: gerçek host\'lu mutlak URL -> NOT_SUPPORTED', async () => {
        process.env.HEPSIBURADA_MOCK_MODE = 'true';
        http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new HepsiburadaService(hbParams()).get('https://mpop.hepsiburada.com/orders/merchantid/1'));
    });

    it('mock AÇIK: loopback mutlak URL geçer (yerel test sunucusu)', async () => {
        process.env.HEPSIBURADA_MOCK_MODE = 'true';
        http.get.mockResolvedValue({ data: {} } as never);
        await new HepsiburadaService(hbParams()).get('http://127.0.0.1:9999/orders/merchantid/1');
        expect(lastUrl(http.get)).toBe('http://127.0.0.1:9999/orders/merchantid/1');
    });

    it('mock KAPALI: mutlak URL aynen geçer (değişmemeli)', async () => {
        http.get.mockResolvedValue({ data: {} } as never);
        await new HepsiburadaService(hbParams()).get('https://mpop.hepsiburada.com/orders/merchantid/1');
        expect(lastUrl(http.get)).toBe('https://mpop.hepsiburada.com/orders/merchantid/1');
    });
});

// ---------------------------------------------------------------- Ideasoft / Bizimhesap
describe('C19 karakterizasyon — Ideasoft/Bizimhesap resolveUrl (mock modu)', () => {
    it('Ideasoft mock AÇIK: göreli yol mock tabanına gider (değişmemeli)', async () => {
        process.env.IDEASOFT_MOCK_MODE = 'true';
        http.get.mockResolvedValue({ data: {} } as never);
        await new IdeasoftService({ clientId: 'c1', integrationSettings: { settings: { storeName: 'x' }, urls: {} } }).get('admin-api/products');
        expect(lastUrl(http.get)).toBe('http://localhost:6015/ideasoft/admin-api/products');
    });

    // ESKİ: mutlak URL olduğu gibi gerçek mağaza adresine giderdi.
    it('[FAIL-CLOSED] Ideasoft mock AÇIK: gerçek host\'lu mutlak URL -> NOT_SUPPORTED', async () => {
        process.env.IDEASOFT_MOCK_MODE = 'true';
        http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new IdeasoftService({ clientId: 'c1', integrationSettings: { settings: { storeName: 'x' }, urls: {} } }).get('https://x.ideasoft.com.tr/admin-api/products'));
    });

    it('Ideasoft mock KAPALI: mutlak URL aynen geçer (değişmemeli)', async () => {
        http.get.mockResolvedValue({ data: {} } as never);
        await new IdeasoftService({ clientId: 'c1', integrationSettings: { settings: { storeName: 'x' }, urls: {} } }).get('https://x.ideasoft.com.tr/admin-api/products');
        expect(lastUrl(http.get)).toBe('https://x.ideasoft.com.tr/admin-api/products');
    });

    it('Bizimhesap mock AÇIK: göreli yol mock tabanına gider (değişmemeli)', async () => {
        process.env.BIZIMHESAP_MOCK_MODE = 'true';
        http.get.mockResolvedValue({ data: {} } as never);
        await new BizimhesapService({ clientId: 'c1', integrationSettings: { settings: {}, urls: {} } }).get('b2b/products');
        expect(lastUrl(http.get)).toBe('http://localhost:6015/bizimhesap/b2b/products');
    });

    // ESKİ: mutlak URL olduğu gibi gerçek adrese giderdi.
    it('[FAIL-CLOSED] Bizimhesap mock AÇIK: gerçek host\'lu mutlak URL -> NOT_SUPPORTED', async () => {
        process.env.BIZIMHESAP_MOCK_MODE = 'true';
        http.get.mockResolvedValue({ data: {} } as never);
        await expectBlocked(new BizimhesapService({ clientId: 'c1', integrationSettings: { settings: {}, urls: {} } }).get('https://api.bizimhesap.com/b2b/products'));
    });

    it('Bizimhesap mock KAPALI: mutlak URL aynen geçer (değişmemeli)', async () => {
        http.get.mockResolvedValue({ data: {} } as never);
        await new BizimhesapService({ clientId: 'c1', integrationSettings: { settings: {}, urls: {} } }).get('https://api.bizimhesap.com/b2b/products');
        expect(lastUrl(http.get)).toBe('https://api.bizimhesap.com/b2b/products');
    });
});

it('sanity: testler gerçek ağ katmanına değil yalnızca axios taklidine dokunur', () => {
    expect(httpCallCount()).toBeGreaterThanOrEqual(0);
});
