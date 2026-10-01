// ADR-0020 Karar 2.2/1.5 (Aşama B) — host/IP/özel ağ/http/emekli-uç reddi tablo testleri. Saf fonksiyonlar; DB/ağ YOK.
import { describe, it, expect } from '@jest/globals';
import { assertSafeHostOverride, assertHttpsOnly, assertNotRetiredEndpoint, findMatchingRetiredEndpoint, HostGuardError } from '@integration/config/urlGuard';

const ALLOWED = ['apigw.trendyol.com', 'api.trendyol.com', '*.ideasoft.com.tr'];

describe('ADR-0020 Karar 2.2 — assertSafeHostOverride', () => {
    it('izinli listedeki tam host kabul edilir', () => {
        expect(() => assertSafeHostOverride('apigw.trendyol.com', ALLOWED)).not.toThrow();
    });

    it('izinli listedeki joker desenle eşleşen alt alan kabul edilir', () => {
        expect(() => assertSafeHostOverride('magaza.ideasoft.com.tr', ALLOWED)).not.toThrow();
    });

    it.each([
        ['izinli listede olmayan host', 'evil.example.com'],
        ['IP literal (IPv4)', '203.0.113.9'],
        ['IP literal (IPv6 köşeli parantez)', '[::1]'],
        ['localhost', 'localhost'],
        ['tek etiketli host', 'intranet'],
        ['özel ağ 10.0.0.0/8', '10.1.2.3'],
        ['özel ağ 172.16.0.0/12', '172.16.5.5'],
        ['özel ağ 192.168.0.0/16', '192.168.1.1'],
        ['bulut metadata (link-local 169.254.0.0/16)', '169.254.169.254'],
        ['loopback 127.0.0.0/8', '127.0.0.1'],
        ['boş host', ''],
        ['kontrol karakteri içeren host', 'evil\ncom'],
        ['userinfo benzeri @ işareti', 'user@apigw.trendyol.com'],
    ])('reddeder: %s (%s)', (_label, host) => {
        expect(() => assertSafeHostOverride(host, ALLOWED)).toThrow(HostGuardError);
    });

    it('allowLoopback:true iken yalnız test amaçlı localhost/127.0.0.1 kabul edilir (varsayılan kapalı)', () => {
        expect(() => assertSafeHostOverride('localhost', ALLOWED, { allowLoopback: true })).not.toThrow();
        expect(() => assertSafeHostOverride('localhost', ALLOWED)).toThrow(HostGuardError);
    });
});

describe('ADR-0020 Karar 2.2 — assertHttpsOnly', () => {
    it('http:// önekli değer reddedilir', () => {
        expect(() => assertHttpsOnly('http://apigw.trendyol.com')).toThrow(HostGuardError);
    });
    it('https:// önekli değer kabul edilir (fırlatmaz)', () => {
        expect(() => assertHttpsOnly('https://apigw.trendyol.com')).not.toThrow();
    });
});

describe('ADR-0020 Karar 1.5 — emekli uç desen reddi', () => {
    const RETIRED = [
        { pattern: 'order/sellers/<SELLERID>/orders', retiredAt: '2026-10-15', replacementKey: 'order/sellers/<SELLERID>/v2/orders' },
    ];

    it('emekli desenle eşleşen bir değer bulunur ve reddedilir', () => {
        const hit = findMatchingRetiredEndpoint('order/sellers/12345/orders', RETIRED);
        expect(hit?.replacementKey).toBe('order/sellers/<SELLERID>/v2/orders');
        expect(() => assertNotRetiredEndpoint('order/sellers/12345/orders', RETIRED)).toThrow(HostGuardError);
    });

    it('emekli desenle eşleşmeyen (V2) bir değer kabul edilir', () => {
        expect(findMatchingRetiredEndpoint('order/sellers/12345/v2/orders', RETIRED)).toBeUndefined();
        expect(() => assertNotRetiredEndpoint('order/sellers/12345/v2/orders', RETIRED)).not.toThrow();
    });
});
