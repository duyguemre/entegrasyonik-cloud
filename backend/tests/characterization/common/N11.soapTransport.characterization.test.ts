/**
 * INT-05 (N11) karakterizasyon: SOAP taşıma katmanının axios'a GEÇİRDİĞİ adres + yapılandırma (axios taklit; gerçek ağ YOK).
 * Bugünkü davranış sabitlenir: göreli WSDL anahtarının çözümlenmiş adresi (göreli `/ws/...` yolu `<baseUrl>/ws/` tabanına eklendiğinden
 * `ws//ws` çift yol segmenti alır: BİLİNEN tuhaflık, geçişte korunur) ve SOAP çağrısının yönlendirme/gövde tavanı (ADR-0022: eskiden doğrudan axios ile YOKTU, geçişte bilinçli eklendi).
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/marketplace/n11/services/Service';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { http, resetHttp } from '../stubs/_axiosMock';

const SOAP_OK = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><X><result><status>success</status></result></X></soapenv:Body></soapenv:Envelope>';
const ENV_KEYS = ['N11_MOCK_MODE', 'N11_MOCK_BASE_URL', 'N11_MOCKABLE_ENDPOINTS'];
const saved: Record<string, string | undefined> = {};
const p = (urls: Record<string, any> = {}) => ({ clientId: 'c1', integrationSettings: { settings: { APIKEY: 'k', APISECRET: 's' }, urls } });

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetHttp();
    ResilientHttpClient.resetAllState();
    http.post.mockResolvedValue({ data: SOAP_OK } as never);
});
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } jest.restoreAllMocks(); });

describe('N11 SOAP adres çözümleme (mock kapalı)', () => {
    it('göreli WSDL anahtarı: varsayılan taban + `/ws/` + yol (çift `ws//ws` segmenti bugünkü davranış)', async () => {
        await new Service(p()).soapRequest('orderService', 'sch:OrderListRequest', {}, { idempotent: true });
        expect(http.post.mock.calls[0][0]).toBe('https://api.n11.com/ws//ws/OrderService.wsdl');
    });

    it('urls.baseUrl verilirse onun altına; mutlak urls.<anahtar> verilirse AYNEN', async () => {
        await new Service(p({ baseUrl: 'https://api.n11.com/alt/' })).soapRequest('orderService', 'sch:R', {}, { idempotent: true });
        expect(http.post.mock.calls[0][0]).toBe('https://api.n11.com/alt/ws//ws/OrderService.wsdl');
        await new Service(p({ orderService: 'https://api.n11.com/ws/orderService/' })).soapRequest('orderService', 'sch:R', {}, { idempotent: true });
        expect(http.post.mock.calls[1][0]).toBe('https://api.n11.com/ws/orderService/');
    });

    it('bilinmeyen anahtar yol gibi kullanılır (getWsdlUrl yedeği)', async () => {
        await new Service(p()).soapRequest('/ws/Custom.wsdl', 'sch:R', {}, { idempotent: true });
        expect(http.post.mock.calls[0][0]).toBe('https://api.n11.com/ws//ws/Custom.wsdl');
    });
});

describe('N11 SOAP axios yapılandırması', () => {
    it('başlıklar + signal iletilir; [BİLİNÇLİ DÜZELTME - ADR-0022 / P9] artık maxRedirects:0 + gövde boyut tavanı var (eskiden YOKTU)', async () => {
        await new Service(p()).soapRequest('orderService', 'sch:R', {}, { idempotent: true });
        const cfg: any = http.post.mock.calls[0][2];
        expect(cfg.headers['Content-Type']).toBe('text/xml;charset=UTF-8');
        expect(cfg.headers.appkey).toBe('k');
        expect(cfg.signal).toBeDefined();
        expect(cfg.maxRedirects).toBe(0);
        expect(cfg.maxContentLength).toBeGreaterThan(0);
    });
});
