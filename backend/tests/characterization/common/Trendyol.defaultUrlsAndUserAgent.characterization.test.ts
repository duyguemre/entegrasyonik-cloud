/**
 * Karakterizasyon testi (Protokol 13) — Trendyol `Service`/`OrderConnector`'ın VARSAYILAN
 * (yani `settings.urls.*` DB'den boş/eksik geldiğinde devreye giren kod-içi fallback) URL
 * sabitleri ve `User-Agent` header'ı.
 *
 * [Trendyol URL/UA düzeltmesi, 2026-09-27] BU DOSYA İLK YAZILDIĞINDA mevcut (YANLIŞ) davranışı
 * sabitliyordu (host `api.trendyol.com/sapigw`, User-Agent `${clientId} - Entegrasyonik`).
 * Çok kaynaklı doğrulama sonrası (`docs/research/2026-09-27-api-verification.md`, BACKLOG.md
 * C11) kod düzeltildi; assertion'lar KASITLI OLARAK TERS ÇEVRİLDİ — artık DÜZELTİLMİŞ
 * davranışı sabitliyor. Eski (yanlış) değerler referans için yorumlarda tutuluyor.
 * Gerçek Trendyol'a hiçbir istek atılmaz — axios `jest.mock` ile taklit edilir.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/marketplace/trendyol/services/Service';
import { OrderConnector } from '@integration/modules/marketplace/trendyol/api/OrderConnector';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { http, resetHttp } from '../stubs/_axiosMock';

// `urls` kasıtlı olarak BOŞ bırakıldı -> connector'ın kod-içi varsayılan sabitleri devreye girer.
const paramsNoUrls = (settingsOverride: any = {}) => ({
    clientId: '65f0aaaaaaaaaaaaaaaaaaaa',
    integrationSettings: {
        settings: { APIKEY: 'k', APISECRET: 's', SELLERID: '778899', ...settingsOverride },
        urls: {},
    },
});

let service: Service;
beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHttp();
    ResilientHttpClient.resetAllState();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('[Trendyol URL/UA düzeltmesi, 2026-09-27] OrderConnector - varsayılan URL (settings.urls boşken kod-içi fallback)', () => {
    it('fetchOrdersFromPlatform: urls.orderListUrl yoksa varsayılan artık "https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders" (ESKİ: api.trendyol.com/sapigw/sellers/.../orders)', async () => {
        http.get.mockResolvedValue({ data: { content: [], totalPages: 1 } } as never);
        const p = paramsNoUrls();
        service = new Service(p);
        await new OrderConnector(service, p).fetchOrdersFromPlatform({});
        const calledUrl = (http.get.mock.calls[0] as any[])[0] as string;
        expect(calledUrl.startsWith('https://apigw.trendyol.com/integration/order/sellers/778899/v2/orders')).toBe(true);
    });

    it('rejectOrder: urls.orderRejectUrl yoksa varsayılan artık apigw.trendyol.com/integration/order/sellers/ önekini kullanır (alt-yol AYNEN korunur, resmi teyit edilmedi)', async () => {
        http.put.mockResolvedValue({ status: 200 } as never);
        const p = paramsNoUrls();
        service = new Service(p);
        await new OrderConnector(service, p).rejectOrder('EXT-1', { reasonId: '1', lineItems: [] } as any);
        const calledUrl = (http.put.mock.calls[0] as any[])[0] as string;
        expect(calledUrl).toBe('https://apigw.trendyol.com/integration/order/sellers/778899/shipment-packages/EXT-1/items/unsupplied');
    });

    it('sendOrderShipping: urls.orderShippingUrl yoksa varsayılan artık apigw.trendyol.com/integration/order/sellers/ önekini kullanır', async () => {
        http.post.mockResolvedValue({ data: {} } as never);
        const p = paramsNoUrls();
        service = new Service(p);
        await new OrderConnector(service, p).sendOrderShipping({ orderId: 'X', trackingCode: 'T1' } as any);
        const calledUrl = (http.post.mock.calls[0] as any[])[0] as string;
        expect(calledUrl).toBe('https://apigw.trendyol.com/integration/order/sellers/778899/shipment-packages/shipped');
    });

    it('sendOrderInvoice: urls.sendInvoiceLinkUrl yoksa varsayılan artık resmi yol apigw.trendyol.com/integration/sellers/<id>/seller-invoice-links ([C22 2026-09-28] ESKİ: .../integration/order/sellers/...)', async () => {
        http.post.mockResolvedValue({ data: {} } as never);
        const p = paramsNoUrls();
        service = new Service(p);
        await new OrderConnector(service, p).sendOrderInvoice({ orderId: '900001', invoiceNumber: 'INV1' } as any);
        const calledUrl = (http.post.mock.calls[0] as any[])[0] as string;
        expect(calledUrl).toBe('https://apigw.trendyol.com/integration/sellers/778899/seller-invoice-links');
    });

    it('[REGRESYON KAPISI] tüm OrderConnector varsayılan URL\'leri apigw.trendyol.com host\'unu kullanır, eski api.trendyol.com/sapigw host\'una asla geri dönmez', async () => {
        http.get.mockResolvedValue({ data: { content: [], totalPages: 1 } } as never);
        http.put.mockResolvedValue({ status: 200 } as never);
        http.post.mockResolvedValue({ data: {} } as never);
        const p = paramsNoUrls();
        service = new Service(p);
        const connector = new OrderConnector(service, p);
        await connector.fetchOrdersFromPlatform({});
        await connector.rejectOrder('EXT-1', { reasonId: '1', lineItems: [] } as any);
        await connector.sendOrderShipping({ orderId: 'X', trackingCode: 'T1' } as any);
        await connector.sendOrderInvoice({ orderId: '900001', invoiceNumber: 'INV1' } as any);
        const allCalledUrls = [
            ...http.get.mock.calls.map((c: any[]) => c[0]),
            ...http.put.mock.calls.map((c: any[]) => c[0]),
            ...http.post.mock.calls.map((c: any[]) => c[0]),
        ] as string[];
        expect(allCalledUrls.length).toBe(4);
        for (const u of allCalledUrls) {
            expect(u.startsWith('https://apigw.trendyol.com/')).toBe(true);
            expect(u).not.toContain('api.trendyol.com/sapigw');
        }
    });
});

describe('[Trendyol URL/UA düzeltmesi, 2026-09-27] Service.getAuthConfig - User-Agent header', () => {
    it('User-Agent artık "{SELLERID} - Entegrasyonik" formatında üretiliyor (ESKİ: "{clientId} - Entegrasyonik")', async () => {
        http.get.mockResolvedValue({ data: { content: [], totalPages: 1 } } as never);
        const p = paramsNoUrls();
        service = new Service(p);
        await new OrderConnector(service, p).fetchOrdersFromPlatform({});
        const config = (http.get.mock.calls[0] as any[])[1] as any;
        const userAgent = config?.headers?.['User-Agent'];
        expect(userAgent).toBe('778899 - Entegrasyonik');
        // Eski (yanlış) davranış: clientId kullanılıyordu. Artık KULLANILMIYOR.
        expect(userAgent).not.toContain(p.clientId);
        expect(userAgent).not.toBe(`${p.clientId} - Entegrasyonik`);
    });

    it('SELLERID eksik/boşsa defansif hata fırlatılır (eski clientId fallback\'ına SESSİZCE DÜŞMEZ)', async () => {
        const p = paramsNoUrls({ SELLERID: '' });
        service = new Service(p);
        await expect(new OrderConnector(service, p).fetchOrdersFromPlatform({})).rejects.toThrow(/SELLERID/);
        expect(http.get).not.toHaveBeenCalled();
    });
});
