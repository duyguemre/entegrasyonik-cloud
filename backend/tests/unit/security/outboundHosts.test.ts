/**
 * [K7 2026-09-28] assertAllowedOutboundHost + tenantSettingsGuard birim testleri. DB/ağ YOK (saf fonksiyon + axios spy'sız).
 * Loopback davranışı açıkça `allowLoopback` ile sınanır (varsayılan yalnızca NODE_ENV==='test').
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import { assertAllowedOutboundHost, hostMatchesPattern, ALLOWED_OUTBOUND_HOSTS, OUTBOUND_HOST_NOT_ALLOWED } from '../../../src/integration/modules/common/security/outboundHosts';
import { ResilientHttpClient } from '../../../src/integration/modules/common/http/ResilientHttpClient';
import { stripTenantUrlFields, isTenantUrlLikeKey, isValidStoreName, hasInvalidStoreName } from '../../../src/platform/core/security/tenantSettingsGuard';

const ENVS = ['TY_MOCK_MODE', 'HEPSIBURADA_MOCK_MODE', 'N11_MOCK_MODE', 'PAZARAMA_MOCK_MODE', 'IDEASOFT_MOCK_MODE', 'BIZIMHESAP_MOCK_MODE', 'HEPSIBURADA_MOCK_BASE_URL'];
beforeEach(() => { for (const k of ENVS) delete process.env[k]; });
afterEach(() => { jest.restoreAllMocks(); });

const ok = (code: string, url: string, allowLoopback = false) => assertAllowedOutboundHost(code, url, 1, { allowLoopback });
const bad = (code: string, url: string, allowLoopback = false) => {
    try { ok(code, url, allowLoopback); } catch (e: any) { expect(e.name).toBe('IntegrationError'); expect(e.code).toBe('VALIDATION'); expect(e.platformCode).toBe(OUTBOUND_HOST_NOT_ALLOWED); return; }
    throw new Error(`İZİN VERİLDİ (beklenen: ret): ${url}`);
};

describe('assertAllowedOutboundHost: gerçek platform host\'ları geçer', () => {
    it.each([
        ['trendyol', 'https://apigw.trendyol.com/integration/order/sellers/1/v2/orders?size=1'],
        ['trendyol', 'https://api.trendyol.com/sapigw/suppliers/1/products'],
        ['trendyol', 'https://stageapigw.trendyol.com/integration/x'], // C22: STAGE
        ['hepsiburada', 'https://mpop.hepsiburada.com/product/api/categories/get-all-categories'],
        ['hepsiburada', 'https://listing-external.hepsiburada.com/listings/merchantid/x'],
        ['hepsiburada', 'https://accounting-external.hepsiburada.com/x'],
        ['hepsiburada', 'https://ticket-api.hepsiburada.com/x'],
        ['n11', 'https://api.n11.com/ws/ProductService.wsdl'],
        ['n11-soap', 'https://api.n11.com/ws/ProductService.wsdl'],
        ['pazarama', 'https://isortagimapi.pazarama.com/brand/getBrands'],
        ['pazarama', 'https://isortagimgiris.pazarama.com/connect/token'],
        ['ideasoft', 'https://magazam.myideasoft.com/admin-api/products'],
        ['ideasoft', 'https://magazam.ideasoft.com.tr/oauth/authorize'],
        ['bizimhesap', 'https://bizimhesap.com/api/b2b/products'],
        ['bizimhesap', 'https://api.bizimhesap.com/x'],
        ['hepsiburada', 'https://MPOP.Hepsiburada.com./x'], // büyük harf + sondaki nokta normalize edilir
        ['hepsiburada', 'https://mpop.hepsiburada.com:443/x'],
    ])('%s %s', (code, url) => { expect(() => ok(code, url)).not.toThrow(); });
});

describe('assertAllowedOutboundHost: LLM saglayicilari (ADR-0034 BR-5)', () => {
    it.each([
        ['llm-anthropic', 'https://api.anthropic.com/v1/messages'],
        ['llm-openai', 'https://api.openai.com/v1/chat/completions'],
        ['llm-google', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse'],
    ])('%s %s gecer', (code, url) => { expect(() => ok(code, url)).not.toThrow(); });
    it('capraz saglayici ve yabanci host reddedilir', () => {
        bad('llm-openai', 'https://api.anthropic.com/v1/messages');
        bad('llm-anthropic', 'https://evil.example/v1/messages');
        bad('llm-google', 'https://generativelanguage.googleapis.com.evil.example/x');
        bad('llm-openai', 'http://api.openai.com/v1/models');
    });
});

describe('assertAllowedOutboundHost: saldırı girdileri reddedilir', () => {
    it.each([
        ['yabancı host', 'hepsiburada', 'https://evil.example/x'],
        ['http (şifresiz)', 'hepsiburada', 'http://mpop.hepsiburada.com/x'],
        ['IPv4 literal', 'trendyol', 'https://127.0.0.1/x'],
        ['iç ağ IPv4', 'trendyol', 'https://10.0.0.5/x'],
        ['bulut metadata IP', 'trendyol', 'https://169.254.169.254/latest/meta-data'],
        ['ondalık IP (2130706433)', 'trendyol', 'https://2130706433/x'],
        ['onaltılık IP', 'trendyol', 'https://0x7f000001/x'],
        ['IPv6 literal', 'trendyol', 'https://[::1]/x'],
        ['IPv6 eşlenmiş', 'trendyol', 'https://[::ffff:127.0.0.1]/x'],
        ['localhost', 'trendyol', 'https://localhost/x'],
        ['alt localhost', 'trendyol', 'https://a.localhost/x'],
        ['tek etiketli iç host', 'trendyol', 'https://intranet/x'],
        ['userinfo ile host karışıklığı', 'hepsiburada', 'https://mpop.hepsiburada.com@evil.example/x'],
        ['userinfo (izinli host)', 'hepsiburada', 'https://user:pw@mpop.hepsiburada.com/x'],
        ['izinli host öneki sahte', 'hepsiburada', 'https://mpop.hepsiburada.com.evil.example/x'],
        ['izinli host soneki sahte', 'hepsiburada', 'https://evilmpop.hepsiburada.com/x'],
        ['izinsiz port', 'hepsiburada', 'https://mpop.hepsiburada.com:8443/x'],
        ['ters eğik çizgi (ayrıştırıcı farkı)', 'hepsiburada', 'https://evil.example\\@mpop.hepsiburada.com/x'],
        ['boşluk/kontrol karakteri', 'hepsiburada', 'https://mpop.hepsiburada.com\t.evil.example/x'],
        ['başka adaptörün host\'u', 'hepsiburada', 'https://apigw.trendyol.com/x'],
        ['bilinmeyen adaptör', 'bilinmeyen', 'https://mpop.hepsiburada.com/x'],
        ['file:', 'trendyol', 'file:///etc/passwd'],
        ['javascript:', 'trendyol', 'javascript:alert(1)'],
        ['göreli/boş', 'trendyol', '/relative/path'],
        ['boş dize', 'trendyol', ''],
        ['ideasoft joker kökü (etiket yok)', 'ideasoft', 'https://myideasoft.com/x'],
        ['ideasoft joker sahte', 'ideasoft', 'https://evil.example/.myideasoft.com'],
        ['ideasoft joker: nokta içeren sahte etiket', 'ideasoft', 'https://a_b.myideasoft.com/x'],
    ])('%s', (_n, code, url) => { bad(code as string, url as string); });

    it('hata mesajı yalnızca host gösterir: sorgu/kimlik bilgisi/yol SIZMAZ', () => {
        try { ok('hepsiburada', 'https://evil.example/x?token=GIZLI&apikey=GIZLI2'); } catch (e: any) {
            expect(e.message).toContain('evil.example');
            expect(e.message).not.toContain('GIZLI');
            expect(e.message).not.toContain('token');
        }
    });
});

describe('assertAllowedOutboundHost: loopback ve mock modu', () => {
    it('loopback yalnızca açıkça izin verilirse (varsayılan = NODE_ENV test); üretimde (allowLoopback:false) reddedilir', () => {
        expect(() => ok('hepsiburada', 'http://127.0.0.1:6015/x', true)).not.toThrow();
        expect(() => ok('hepsiburada', 'http://localhost:6015/x', true)).not.toThrow();
        bad('hepsiburada', 'http://127.0.0.1:6015/x', false);
        bad('hepsiburada', 'http://localhost:6015/x', false);
    });
    it('loopback izni özel ağ/metadata IP\'sini KAPSAMAZ', () => {
        bad('hepsiburada', 'http://169.254.169.254/x', true);
        bad('hepsiburada', 'http://10.0.0.1/x', true);
    });
    it('mock modu AÇIK: yalnızca loopback / mock tabanı host\'u; gerçek platform host\'u da REDDEDİLİR (fail-closed, assertMockSafeUrl ile aynı kural)', () => {
        process.env.HEPSIBURADA_MOCK_MODE = 'true';
        process.env.HEPSIBURADA_MOCK_BASE_URL = 'http://mockserver:6015/hepsiburada';
        expect(() => ok('hepsiburada', 'http://mockserver:6015/hepsiburada/x')).not.toThrow();
        expect(() => ok('hepsiburada', 'http://127.0.0.1:6015/x')).not.toThrow();
        bad('hepsiburada', 'https://mpop.hepsiburada.com/x');
        bad('hepsiburada', 'https://evil.example/x');
    });
    it('izin listesi: her adaptör için tanımlı ve yalnız host (şema/yol/sır yok)', () => {
        for (const [code, hosts] of Object.entries(ALLOWED_OUTBOUND_HOSTS)) {
            expect(hosts.length).toBeGreaterThan(0);
            for (const h of hosts) expect(h).toMatch(/^(\*\.)?[a-z0-9.-]+$/);
            expect(code).toBe(code.toLowerCase());
        }
        expect(ALLOWED_OUTBOUND_HOSTS.trendyol).toContain('stageapigw.trendyol.com');
    });
    it('hostMatchesPattern: joker en az bir etiket ister', () => {
        expect(hostMatchesPattern('a.b.myideasoft.com', '*.myideasoft.com')).toBe(true);
        expect(hostMatchesPattern('myideasoft.com', '*.myideasoft.com')).toBe(false);
        expect(hostMatchesPattern('x.myideasoft.com.evil', '*.myideasoft.com')).toBe(false);
    });
});

describe('ResilientHttpClient: host koruması istek başlamadan devreye girer (ağ/retry/breaker YOK)', () => {
    it('izinsiz host -> axios ÇAĞRILMAZ, IntegrationError(VALIDATION); breaker sayacı etkilenmez', async () => {
        ResilientHttpClient.resetAllState();
        const get = jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: {} } as any);
        const http = new ResilientHttpClient('trendyol', 9, { timeoutMs: 500 });
        for (let i = 0; i < 8; i++) {
            await expect(http.get('https://evil.example/x')).rejects.toMatchObject({ code: 'VALIDATION', platformCode: OUTBOUND_HOST_NOT_ALLOWED });
        }
        expect(get).not.toHaveBeenCalled();
        await expect(http.get('https://apigw.trendyol.com/ok')).resolves.toBeDefined(); // 8 ret sonrası devre kesici AÇILMADI
        expect(get).toHaveBeenCalledTimes(1);
    });
    it('N11 SOAP kodu (`n11-soap`) executeCustom({url}) ile aynı denetimi uygular', async () => {
        const http = new ResilientHttpClient('n11-soap', 9, { timeoutMs: 500 });
        const fn = jest.fn(async () => ({ data: '' }));
        await expect(http.executeCustom({ operation: 'SOAP X', url: 'https://evil.example/ws/' }, fn as any)).rejects.toMatchObject({ code: 'VALIDATION' });
        expect(fn).not.toHaveBeenCalled();
        await expect(http.executeCustom({ operation: 'SOAP X', url: 'https://api.n11.com/ws/ProductService.wsdl' }, fn as any)).resolves.toBeDefined();
    });
});

describe('tenantSettingsGuard', () => {
    it.each(['urls', 'url', 'baseUrl', 'BASEURL', 'base_url', 'base-url', 'tokenUrl', 'orderListUrl', 'LISTINGBASEURL', 'host', 'Host', 'hostname', 'apiHost',
        'endpoint', 'Endpoints', 'wsdl', 'wsdlUrl', 'proxy', 'proxyUrl', 'uri', 'webhookUrl', 'callbackUrl', 'domain', 'urlBase'])
        ('URL-benzeri anahtar: %s', (k) => { expect(isTenantUrlLikeKey(k)).toBe(true); });
    it.each(['SELLERID', 'APIKEY', 'APISECRET', 'status', 'storeName', 'storename', 'MATCHKEY', 'taxPercentage', 'shippingaddress', 'returnaddress',
        'stockPolicy', 'catalog', 'auth', 'cities', 'invoiceType', 'barcode', 'username', 'password', 'key', 'secret', 'branch'])
        ('meşru anahtar düşmez: %s', (k) => { expect(isTenantUrlLikeKey(k)).toBe(false); });

    it('stripTenantUrlFields girdiyi DEĞİŞTİRMEZ, üst düzeyi süzer, iç içe alanlara dokunmaz', () => {
        const input = { SELLERID: '1', urls: { BASEURL: 'x' }, catalog: { brands: [{ logoUrl: 'https://cdn.example/l.png' }] } };
        const snapshot = JSON.parse(JSON.stringify(input));
        const { settings, removedKeys } = stripTenantUrlFields(input);
        expect(input).toEqual(snapshot);
        expect(removedKeys).toEqual(['urls']);
        expect(settings).toEqual({ SELLERID: '1', catalog: snapshot.catalog });
    });
    it('nesne olmayan girdi olduğu gibi döner', () => {
        expect(stripTenantUrlFields(undefined)).toEqual({ settings: undefined, removedKeys: [] });
        expect(stripTenantUrlFields('x')).toEqual({ settings: 'x', removedKeys: [] });
    });
    it('storeName: tek DNS etiketi', () => {
        for (const v of ['magazam', 'a', 'my-shop-1', 'A1']) expect(isValidStoreName(v)).toBe(true);
        for (const v of ['evil.example', 'evil.example/#', 'a@b', '-x', 'x-', 'a b', '', 123, null, 'a'.repeat(64)]) expect(isValidStoreName(v as any)).toBe(false);
        expect(hasInvalidStoreName({})).toBe(false);
        expect(hasInvalidStoreName({ storeName: '' })).toBe(false);
        expect(hasInvalidStoreName({ storeName: 'x.y' })).toBe(true);
    });
});
