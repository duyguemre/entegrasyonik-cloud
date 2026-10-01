// ADR-0020 Karar 7.1 (Aşama B, göç aracı) — sınıflandırıcı saf fonksiyon testleri (5 kategori). DB/ağ YOK.
import { describe, it, expect } from '@jest/globals';
import { classifyUrlValue, classifyIntegrationDoc, buildMigrationReport, redactUrl } from '@integration/config/migrationClassifier';

const ALLOWED = ['apigw.trendyol.com', 'stageapigw.trendyol.com'];
const RETIRED = [{ pattern: 'order/sellers/<SELLERID>/orders', retiredAt: '2026-10-15', replacementKey: 'orderListUrl (v2)' }];

describe('ADR-0020 Karar 7.1 — classifyUrlValue (5 kategori)', () => {
    it('same: birincil (varsayılan, listedeki ilk) host ile eşleşir, emekli değil', () => {
        const r = classifyUrlValue({ code: 'trendyol', key: 'brandListUrl', rawValue: 'https://apigw.trendyol.com/integration/product/brands/by-name', allowedHosts: ALLOWED, retiredEndpoints: RETIRED });
        expect(r.outcome).toBe('same');
        expect(r.host).toBe('apigw.trendyol.com');
    });

    it('host_diff: izinli listede ama birincil host değil (ör. stage)', () => {
        const r = classifyUrlValue({ code: 'trendyol', key: 'brandListUrl', rawValue: 'https://stageapigw.trendyol.com/integration/product/brands/by-name', allowedHosts: ALLOWED, retiredEndpoints: RETIRED });
        expect(r.outcome).toBe('host_diff');
        expect(r.host).toBe('stageapigw.trendyol.com');
    });

    it('retired: emekli desenle eşleşir (host ne olursa olsun ÖNCE kontrol edilir)', () => {
        const r = classifyUrlValue({ code: 'trendyol', key: 'orderListUrl', rawValue: 'https://apigw.trendyol.com/integration/order/sellers/12345/orders', allowedHosts: ALLOWED, retiredEndpoints: RETIRED });
        expect(r.outcome).toBe('retired');
        expect(r.note).toContain('2026-10-15');
    });

    it('path_diff: Trendyol ısıtıcı örnek — host güncel ama bilinen versiyonlu anahtarda /v2/ yok ve emekli desene de uymuyor', () => {
        const r = classifyUrlValue({ code: 'trendyol', key: 'transferUrl', rawValue: 'https://apigw.trendyol.com/integration/product/sellers/12345/products/custom-variant', allowedHosts: ALLOWED, retiredEndpoints: RETIRED });
        expect(r.outcome).toBe('path_diff');
    });

    it('unparseable: dize değil / boş / ayrıştırılamaz / host tanınmıyor', () => {
        expect(classifyUrlValue({ code: 'trendyol', key: 'x', rawValue: undefined, allowedHosts: ALLOWED }).outcome).toBe('unparseable');
        expect(classifyUrlValue({ code: 'trendyol', key: 'x', rawValue: '', allowedHosts: ALLOWED }).outcome).toBe('unparseable');
        expect(classifyUrlValue({ code: 'trendyol', key: 'x', rawValue: 'order/sellers/<SELLERID>/v2/orders', allowedHosts: ALLOWED }).outcome).toBe('unparseable'); // göreli, mutlak URL değil
        expect(classifyUrlValue({ code: 'trendyol', key: 'x', rawValue: 'https://evil.example.com/x', allowedHosts: ALLOWED }).outcome).toBe('unparseable');
    });

    it('redactUrl: sorgu dizesi/userinfo kırpılır; dize olmayan değer tür adıyla döner', () => {
        expect(redactUrl('https://apigw.trendyol.com/x?token=abc&secret=1')).toBe('https://apigw.trendyol.com/x');
        expect(redactUrl('https://user:pass@apigw.trendyol.com/x')).toBe('https://apigw.trendyol.com/x');
        expect(redactUrl(123)).toBe('<number>');
        expect(redactUrl(undefined)).toBe('<undefined>');
    });
});

describe('ADR-0020 Karar 7.1 — classifyIntegrationDoc / buildMigrationReport', () => {
    const descriptor = { config: { hosts: ALLOWED, retiredEndpoints: RETIRED } };

    it('bir belgedeki TÜM urls anahtarlarını sınıflandırır; migratableHostOverrides yalnız host_diff anahtarlarını listeler', () => {
        const doc = {
            code: 'Trendyol', // büyük/küçük harf normalize edilir
            urls: {
                brandListUrl: 'https://apigw.trendyol.com/integration/product/brands/by-name', // same
                categoryTreeUrl: 'https://stageapigw.trendyol.com/integration/product/categories', // host_diff
                orderListUrl: 'https://apigw.trendyol.com/integration/order/sellers/1/orders', // retired
            },
            title: 'Trendyol', color: '#f27a1a', logo: 'trendyol.png',
        };
        const report = classifyIntegrationDoc(doc, descriptor);
        expect(report.code).toBe('trendyol');
        expect(report.migratableHostOverrides).toEqual(['categoryTreeUrl']);
        expect(report.viewFields).toEqual({ title: 'Trendyol', color: '#f27a1a', logo: 'trendyol.png' });
        expect(report.urls.map((u) => u.outcome).sort()).toEqual(['host_diff', 'retired', 'same']);
    });

    it('descriptor bulunamazsa (bilinmeyen kod) boş izin listesiyle çalışır -- her şey unparseable olur', () => {
        const report = classifyIntegrationDoc({ code: 'bilinmeyen', urls: { x: 'https://foo.example.com/y' } }, undefined);
        expect(report.urls).toEqual([{ key: 'x', outcome: 'unparseable', host: 'foo.example.com', note: 'host izin listesinde tanınmıyor' }]);
    });

    it('buildMigrationReport birden çok belgeyi kod->descriptor eşlemesiyle işler', () => {
        const reports = buildMigrationReport(
            [{ code: 'trendyol', urls: { a: 'https://apigw.trendyol.com/x' } }],
            { trendyol: descriptor },
        );
        expect(reports).toHaveLength(1);
        expect(reports[0].urls[0].outcome).toBe('same');
    });
});
