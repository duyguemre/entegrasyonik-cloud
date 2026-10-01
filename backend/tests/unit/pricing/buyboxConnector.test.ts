/**
 * PRC-R1 — Trendyol buybox bağlayıcısı: TEK eşleme noktası (fikstür), ≤10 barkod, salt-okuma çağrı seçenekleri, URL/başlık çözümü.
 * Fikstür alanları resmi sayfanın arama dizini özetinden gelir (doğrudan teyit edilemedi; yerelde doğrulanacak).
 */
import { describe, it, expect } from '@jest/globals';
import fixture from '../../fixtures/trendyol/buybox-information.json';
import { BuyboxConnector, mapBuyboxResponse, BUYBOX_DEFAULT_PATH } from '@integration/modules/marketplace/trendyol/api/BuyboxConnector';
import { TRENDYOL_BUYBOX_CONTRACT } from '@integration/modules/marketplace/trendyol/contracts/products.buybox';
import { getIntegrationDescriptor, listIntegrationDescriptors } from '@integration/catalog/IntegrationDescriptorRegistry';

const params = (extra: any = {}) => ({ clientId: 7, integrationSettings: { settings: { SELLERID: '123', ...extra.settings }, urls: extra.urls ?? {} } });

describe('mapBuyboxResponse (fikstür)', () => {
    it('fikstür sözleşmeden geçer ve kaynağı belgeli', () => {
        expect(fixture._source.url).toMatch(/developers\.trendyol\.com/);
        expect(TRENDYOL_BUYBOX_CONTRACT.schema.safeParse(fixture.response).success).toBe(true);
    });
    it('istenen her barkod için bir gözlem; yanıtta olmayan found:false (sessiz atlama yok)', () => {
        const r = mapBuyboxResponse(fixture.response, fixture.request.barcodes);
        expect(r).toEqual([
            { barcode: '1111111111111', found: true, buyboxOrder: 1, buyboxPrice: 600, hasMultipleSeller: false },
            { barcode: '2222222222', found: true, buyboxOrder: 3, buyboxPrice: 299.9, hasMultipleSeller: true },
            { barcode: '3333333333333', found: false, buyboxOrder: null, buyboxPrice: null, hasMultipleSeller: null },
        ]);
    });
    it('bozuk yanıt: hepsi found:false', () => {
        expect(mapBuyboxResponse({ foo: 1 }, ['A']).every((x) => !x.found)).toBe(true);
    });
});

describe('BuyboxConnector.readBuybox', () => {
    const fakeService = () => {
        const calls: any[] = [];
        return { calls, svc: { post: async (url: string, body: any, opts: any) => { calls.push({ url, body, opts }); return { data: fixture.response }; } } as any };
    };
    it('POST gövdesi barkod listesi; salt-okuma seçenekleri (idempotent, product_read, sözleşme, storeFrontCode)', async () => {
        const f = fakeService();
        const r = await new BuyboxConnector(f.svc, params()).readBuybox(['1111111111111', '1111111111111', '2222222222']);
        expect(r).toHaveLength(2);
        expect(f.calls[0].url).toBe(BUYBOX_DEFAULT_PATH.replace('<SELLERID>', '123'));
        expect(f.calls[0].body).toEqual({ barcodes: ['1111111111111', '2222222222'] });
        expect(f.calls[0].opts).toMatchObject({ idempotent: true, group: 'product_read', operation: 'products.buybox', headers: { storeFrontCode: 'TR' } });
        expect(f.calls[0].opts.contract.id).toBe('trendyol.products.buybox@v1');
    });
    it('platform URL ayarı ve STOREFRONTCODE varsa onlar kullanılır', async () => {
        const f = fakeService();
        await new BuyboxConnector(f.svc, params({ urls: { buyboxUrl: 'x/<SELLERID>/bb' }, settings: { STOREFRONTCODE: 'AZ' } })).readBuybox(['1']);
        expect(f.calls[0].url).toBe('x/123/bb');
        expect(f.calls[0].opts.headers).toEqual({ storeFrontCode: 'AZ' });
    });
    it('>10 barkod reddedilir, boş liste çağrı yapmaz', async () => {
        const f = fakeService();
        await expect(new BuyboxConnector(f.svc, params()).readBuybox(Array.from({ length: 11 }, (_, i) => `b${i}`))).rejects.toThrow(/VALIDATION/);
        expect(await new BuyboxConnector(f.svc, params()).readBuybox([])).toEqual([]);
        expect(f.calls).toHaveLength(0);
    });
});

describe('manifesto: pricing.buybox.read', () => {
    it('Trendyol limited + not + doğrulama tarihi BOŞ; diğer pazaryerlerinde yok (= not_supported)', () => {
        const ty = getIntegrationDescriptor('trendyol')!;
        const e = ty.capabilities['pricing.buybox.read']!;
        expect(e.level).toBe('limited');
        expect(e.methods).toEqual(['readBuybox']);
        expect(e.note).toMatch(/doğrudan teyit edilemedi/);
        expect(e.lastVerifiedAt).toBeUndefined();
        expect(ty.contracts).toContain('trendyol.products.buybox@v1');
        for (const d of listIntegrationDescriptors()) if (d.code !== 'trendyol') expect(d.capabilities['pricing.buybox.read']).toBeUndefined();
    });
});
