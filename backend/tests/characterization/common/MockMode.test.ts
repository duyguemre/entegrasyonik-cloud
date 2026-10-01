/**
 * BACKLOG C19 — mock modu fail-closed: ortak yardımcı (`common/mock/MockMode.ts`) birim testleri ve
 * N11 OrderService'in mock modundaki REST->SOAP yedek yolu. Tamamen mock'lu; ağ/DB/Redis YOK.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import {
    readMockConfig, isEndpointMockable, isMockSafeUrl, assertEndpointMockable, assertMockSafeUrl,
    mockNotMockedError, MOCK_ENDPOINT_NOT_MOCKED,
} from '@integration/modules/common/mock/MockMode';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import N11Service from '@integration/modules/marketplace/n11/services/Service';
import { OrderService } from '@integration/modules/marketplace/n11/services/OrderService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { http, resetHttp } from '../stubs/_axiosMock';

const KEYS = ['TY_MOCK_MODE', 'TY_MOCK_BASE_URL', 'TY_MOCKABLE_ENDPOINTS', 'N11_MOCK_MODE', 'N11_MOCK_BASE_URL', 'N11_MOCKABLE_ENDPOINTS'];
const saved: Record<string, string | undefined> = {};
const ctx = { integrationCode: 'x', clientId: 'c1' };

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetHttp();
    ResilientHttpClient.resetAllState();
});
afterEach(() => {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    jest.restoreAllMocks();
});

describe('readMockConfig (bayraklar TEK yerde, çağrı anında okunur)', () => {
    it('hiçbir env yokken: kapalı, varsayılan taban, boş liste', () => {
        expect(readMockConfig('TY', 'http://d/x')).toEqual({ prefix: 'TY', enabled: false, baseUrl: 'http://d/x', mockableEndpoints: [] });
    });

    it('yalnızca tam olarak "true" mock modunu açar ("TRUE"/"1"/"yes" AÇMAZ)', () => {
        for (const v of ['TRUE', '1', 'yes', 'false', '']) {
            process.env.TY_MOCK_MODE = v;
            expect(readMockConfig('TY', 'http://d').enabled).toBe(false);
        }
        process.env.TY_MOCK_MODE = 'true';
        expect(readMockConfig('TY', 'http://d').enabled).toBe(true);
    });

    it('liste trim edilir ve BOŞ girdiler atılır; MOCK_BASE_URL varsayılanı ezer; env çağrı anında okunur (cache yok)', () => {
        process.env.TY_MOCKABLE_ENDPOINTS = ' a/b , ,c,, ';
        process.env.TY_MOCK_BASE_URL = 'http://mock:1';
        expect(readMockConfig('TY', 'http://d')).toMatchObject({ baseUrl: 'http://mock:1', mockableEndpoints: ['a/b', 'c'] });
        process.env.TY_MOCKABLE_ENDPOINTS = 'z';
        expect(readMockConfig('TY', 'http://d').mockableEndpoints).toEqual(['z']);
    });
});

describe('isEndpointMockable / assertEndpointMockable', () => {
    const cfg = (list: string) => { process.env.TY_MOCKABLE_ENDPOINTS = list; return readMockConfig('TY', 'http://d'); };

    it('varsayılan eşleştirme candidate.includes(entry); boş liste HİÇBİR ŞEYİ eşleştirmez (joker YOK)', () => {
        expect(isEndpointMockable(cfg('order,claims'), 'https://h/x/order/y')).toBe(true);
        expect(isEndpointMockable(cfg('order,claims'), 'webhooks/x')).toBe(false);
        expect(isEndpointMockable(cfg(''), 'anything')).toBe(false);
        expect(isEndpointMockable(cfg(' , '), 'anything')).toBe(false);
    });

    it('özel matcher kullanılabilir', () => {
        expect(isEndpointMockable(cfg('abc'), 'ABC', (m, c) => m.toLowerCase() === c.toLowerCase())).toBe(true);
    });

    it('assertEndpointMockable: listede yoksa NOT_SUPPORTED/MOCK_ENDPOINT_NOT_MOCKED, retryable=false; listedeyse sessiz', () => {
        const c = cfg('order');
        expect(() => assertEndpointMockable(c, 'order/x', ctx)).not.toThrow();
        let err: any;
        try { assertEndpointMockable(c, 'webhooks/x', ctx); } catch (e) { err = e; }
        expect(IntegrationError.isIntegrationError(err)).toBe(true);
        expect(err).toMatchObject({ code: 'NOT_SUPPORTED', retryable: false, platformCode: MOCK_ENDPOINT_NOT_MOCKED, integrationCode: 'x', clientId: 'c1' });
        expect(err.message).toContain('TY_MOCKABLE_ENDPOINTS');
        expect(err.message).toContain('fail-closed');
    });

    it('hata mesajı sorgu dizesini (olası sır) İÇERMEZ, yalnızca origin+path gösterir', () => {
        const err = mockNotMockedError(cfg('order'), 'https://api.x.com/p/q?apikey=SUPERSECRET&a=1', ctx);
        expect(err.message).not.toContain('SUPERSECRET');
        expect(err.message).toContain('https://api.x.com/p/q');
    });
});

describe('isMockSafeUrl / assertMockSafeUrl', () => {
    const enabled = (base?: string) => {
        process.env.TY_MOCK_MODE = 'true';
        if (base) process.env.TY_MOCK_BASE_URL = base;
        return readMockConfig('TY', 'http://localhost:3005/integration');
    };

    it('loopback host\'lar (localhost/127.0.0.1/[::1]) ve mock tabanının host\'u güvenli; gerçek/yabancı host güvensiz', () => {
        const c = enabled('http://mockserver:3005/integration');
        expect(isMockSafeUrl(c, 'http://localhost:1/x')).toBe(true);
        expect(isMockSafeUrl(c, 'http://127.0.0.1:1/x')).toBe(true);
        expect(isMockSafeUrl(c, 'http://[::1]:1/x')).toBe(true);
        expect(isMockSafeUrl(c, 'http://mockserver:9/x')).toBe(true);
        expect(isMockSafeUrl(c, 'https://api.trendyol.com/x')).toBe(false);
        expect(isMockSafeUrl(c, 'https://localhost.evil.com/x')).toBe(false);
        expect(isMockSafeUrl(c, 'not a url')).toBe(false);
    });

    it('assertMockSafeUrl: mock KAPALIYKEN hiçbir şey yapmaz (gerçek mod değişmez); AÇIKKEN gerçek host için foreign-host hatası', () => {
        expect(() => assertMockSafeUrl(readMockConfig('TY', 'http://d'), 'https://api.trendyol.com/x', ctx)).not.toThrow();
        const c = enabled();
        let err: any;
        try { assertMockSafeUrl(c, 'https://api.trendyol.com/x', ctx); } catch (e) { err = e; }
        expect(err).toMatchObject({ code: 'NOT_SUPPORTED', retryable: false, platformCode: MOCK_ENDPOINT_NOT_MOCKED });
        expect(err.message).toContain('mock tabanına/loopback');
    });
});

describe('N11 OrderService.fetchOrders — mock modunda REST listede yoksa NOT_SUPPORTED -> SOAP yedek yolu (ADR-0006 Karar 2)', () => {
    const SOAP_EMPTY = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><sch:OrderListResponse><result><status>success</status></result></sch:OrderListResponse></soapenv:Body></soapenv:Envelope>';
    const params = { clientId: 'c1', integrationSettings: { settings: { APIKEY: 'k', APISECRET: 's' }, urls: {} } };

    it('REST shipmentPackages mock listesinde YOK -> gerçek api.n11.com\'a GİDİLMEZ; SOAP (listede) mock tabanından çağrılır', async () => {
        process.env.N11_MOCK_MODE = 'true';
        process.env.N11_MOCK_BASE_URL = 'http://localhost:6015/n11';
        process.env.N11_MOCKABLE_ENDPOINTS = 'ws/OrderService.wsdl';
        http.post.mockResolvedValue({ data: SOAP_EMPTY } as never);
        const svc = new N11Service(params);
        await new OrderService(params, svc).fetchOrders({}).catch(() => undefined);
        // REST (get) hiç atılmadı; tek dış çağrı mock SOAP.
        expect(http.get).not.toHaveBeenCalled();
        expect(http.post).toHaveBeenCalledTimes(1);
        expect((http.post.mock.calls[0] as any[])[0]).toBe('http://localhost:6015/n11/ws/OrderService.wsdl');
        // Hiçbir çağrı gerçek n11 host'una gitmedi.
        const allUrls = [...http.get.mock.calls, ...http.post.mock.calls].map((c: any[]) => String(c[0]));
        expect(allUrls.some(u => u.includes('api.n11.com'))).toBe(false);
    });

    it('SOAP da listede değilse: SOAP NOT_SUPPORTED ile reddedilir, HİÇ ağ çağrısı yok (fail-closed uçtan uca)', async () => {
        process.env.N11_MOCK_MODE = 'true';
        process.env.N11_MOCKABLE_ENDPOINTS = 'ms/product';
        const svc = new N11Service(params);
        await expect(new OrderService(params, svc).fetchOrders({})).rejects.toMatchObject({ code: 'NOT_SUPPORTED', platformCode: MOCK_ENDPOINT_NOT_MOCKED, retryable: false });
        expect(http.get).not.toHaveBeenCalled();
        expect(http.post).not.toHaveBeenCalled();
    });
});
