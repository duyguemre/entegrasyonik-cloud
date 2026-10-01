// [INT-03 TEKRAR İŞARETİ] Senaryo 1-4 ve 8 (500/429/timeout/401/saf başarı) conformance kitinde karşılanıyor:
// tests/conformance/bizimhesap.conformance.test.ts (C1, C2b, C3, C4, C9a). INT-05'te bu beş senaryo silinecek;
// Bizimhesap'a ÖZGÜ olanlar (updateProductStatuses 500, notSupported x2, kısmi başarı, checkBatchProduct=undefined bulgusu) KALIR.
/**
 * ADR-0006 Aşama B3 sözleşme testi (Protokol 13): "mockserver 500/429/timeout döndürür ->
 * IntegrationError fırlatılır, [] dönmez / generic Error'a sarılmaz". Gerçek Bizimhesap Service ->
 * OrderService/ProductService zincirinden, gerçek axios ile 127.0.0.1'deki geçici HTTP sunucusuna
 * (tests/helpers/localHttpServer.ts) istek atılır. GERÇEK Bizimhesap hostuna hiçbir istek YOK.
 * Bizimhesap basit API-key/token header'lı REST'tir (OAuth/token akışı yok).
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import Service from '@integration/modules/erp/bizimhesap/services/Service';
import { OrderService } from '@integration/modules/erp/bizimhesap/services/OrderService';
import { ProductService } from '@integration/modules/erp/bizimhesap/services/ProductService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';
import { PLATFORM_PROCESS } from '@interfaces/index';

/**
 * [QA Faz2 madde 3 tamamlama, 2026-09-27] Bu dosya Bizimhesap için toplam 10 senaryoyu kapsar
 * (≥8 eşiğini geçer; başarılı/≥3 hata kodu/429/timeout/yetkisiz/kısmi başarı hepsi dahil):
 *  1. 500 (okuma yolu, fetchOrders)                        -> IntegrationError(UNAVAILABLE)
 *  2. 429 (Retry-After çok büyük)                           -> IntegrationError(RATE_LIMITED)
 *  3. timeout (yanıt gecikir)                                -> IntegrationError(UNAVAILABLE)
 *  4. 401 (yetkisiz erişim)                                  -> IntegrationError(AUTH), generic Error'a sarılmaz
 *  5. 500 (ProductService.updateProductStatuses)             -> IntegrationError(UNAVAILABLE) ([] YUTULMAZ)
 *  6. ProductService.notSupported                            -> IntegrationError(NOT_SUPPORTED)
 *  7. OrderService.notSupported                              -> IntegrationError(NOT_SUPPORTED)
 *  8. Saf başarı (200, retry YOK, tek sayfa/tek istek)       -> fetchOrders başarıyla döner
 *  9. Kısmi başarı (GERÇEK): updateProductStatuses toplu ürün durum sorgusu - bazı ürünler COMPLETED
 *     (aktif) bazıları FAILED (pasif) olarak ayrılır (ProductTransformer.toInternalStatusResult)
 *  10. Kısmi başarı EKSİKLİĞİ (MEVCUT DAVRANIŞ sabitlemesi, bkz. BACKLOG.md): ProductService.checkBatchProduct
 *      payload/HTTP yanıtından BAĞIMSIZ olarak HER ZAMAN `undefined` döner - Bizimhesap'ta batch/toplu
 *      işlem takip/kısmi-başarı raporlama mekanizması hiç implemente edilmemiş.
 */

let srv: LocalServerHandle | undefined;

const params = (baseUrl: string) => ({
    clientId: 72,
    integrationSettings: {
        settings: { key: 'k', secret: 's', sellerId: '1' },
        urls: { baseUrl, orderListUrl: `${baseUrl}/orders/<SELLERID>`, productListUrl: `${baseUrl}/products/<SELLERID>` },
    },
});

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); delete process.env.BIZIMHESAP_HTTP_TIMEOUT_MS; });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    ResilientHttpClient.resetAllState();
});
afterEach(async () => {
    jest.restoreAllMocks();
    if (srv) { await srv.close(); srv = undefined; }
    delete process.env.BIZIMHESAP_HTTP_TIMEOUT_MS;
});

describe('Bizimhesap okuma (fetchOrders/updateProductStatuses) - gerçek yerel sunucu ile sözleşme testi', () => {
    it('500 -> OrderService.fetchOrders IntegrationError(UNAVAILABLE) fırlatır, [] DÖNMEZ', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'sunucu hatası' }));
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        await expect(orderService.fetchOrders({})).rejects.toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE' });
    });

    it('429 (Retry-After çok büyük) -> IntegrationError(RATE_LIMITED) fırlatır', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '3600' });
            res.end(JSON.stringify({ message: 'rate limited' }));
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        await expect(orderService.fetchOrders({})).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('timeout (BIZIMHESAP_HTTP_TIMEOUT_MS testte kısaltılır) -> IntegrationError(UNAVAILABLE)', async () => {
        srv = await startLocalServer((_req, res) => {
            setTimeout(() => { try { res.writeHead(200); res.end('{"content":[]}'); } catch { /* iptal edilmiş olabilir */ } }, 300);
        });
        process.env.BIZIMHESAP_HTTP_TIMEOUT_MS = '50';
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        await expect(orderService.fetchOrders({})).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });

    it('401 -> IntegrationError(AUTH), OrderService generic Error nesnesine SARMAZ (code/retryable korunur)', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'yetkisiz' }));
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        try {
            await orderService.fetchOrders({});
            throw new Error('beklenenden farklı: hata fırlatmadı');
        } catch (e: any) {
            expect(e.name).toBe('IntegrationError');
            expect(e.code).toBe('AUTH');
            expect(e.retryable).toBe(false);
            expect(e.message).toMatch(/^\[AUTH\]/);
        }
    });

    it('[ADR-0006 Karar 2] TERS ÇEVRİLDİ: 500 -> ProductService.updateProductStatuses artık [] YUTMAZ, IntegrationError(UNAVAILABLE) fırlatır', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'sunucu hatası' }));
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const productService = new ProductService(p, svc);
        await expect(productService.updateProductStatuses({})).rejects.toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE' });
    });
});

describe('Bizimhesap notSupported() - IntegrationError sözleşmesi', () => {
    it('[ADR-0006 Karar 2] TERS ÇEVRİLDİ: ProductService.notSupported artık generic Error değil IntegrationError(NOT_SUPPORTED) fırlatır', () => {
        const p = params('http://127.0.0.1:1');
        const svc = new Service(p);
        const productService = new ProductService(p, svc);
        expect(() => productService.notSupported('transferProducts')).toThrow(
            expect.objectContaining({ name: 'IntegrationError', code: 'NOT_SUPPORTED', retryable: false }),
        );
    });

    it('[ADR-0006 Karar 2] TERS ÇEVRİLDİ: OrderService.notSupported artık generic Error değil IntegrationError(NOT_SUPPORTED) fırlatır', () => {
        const p = params('http://127.0.0.1:1');
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        expect(() => orderService.notSupported('someOp')).toThrow(
            expect.objectContaining({ name: 'IntegrationError', code: 'NOT_SUPPORTED', retryable: false }),
        );
    });
});

describe('Bizimhesap - saf başarı (retry olmadan tek denemede 200)', () => {
    it('[saf başarı] 200 (tek sayfa, totalPages=1) -> fetchOrders retry OLMADAN başarılı döner (tek istek)', async () => {
        let calls = 0;
        srv = await startLocalServer((_req, res) => {
            calls++;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ content: [{ id: 'BH-1', orderNumber: 'BH-1' }], totalPages: 1 }));
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        const orders = await orderService.fetchOrders({});
        expect(calls).toBe(1);
        expect(orders).toHaveLength(1);
        expect((orders[0] as any).order.externalOrderId).toBe('BH-1'); // [C9b] IOrderPackage
    });
});

describe('Bizimhesap - kısmi başarı (toplu ürün durum sorgusu, gerçek uç nokta)', () => {
    it('[kısmi başarı, GERÇEK davranış] updateProductStatuses - bazı ürünler COMPLETED (aktif) bazıları FAILED (pasif) olarak ayrılır', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                data: {
                    products: [
                        { id: 1, barcode: 'BC-1', isActive: 1 },
                        { id: 2, barcode: 'BC-2', isActive: 0 },
                    ],
                },
            }));
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const productService = new ProductService(p, svc);
        const results = await productService.updateProductStatuses({});
        expect(results).toEqual([
            { matchValue: 'BC-1', barcode: 'BC-1', status: 'COMPLETED', messages: [] },
            { matchValue: 'BC-2', barcode: 'BC-2', status: 'FAILED', messages: ['Pasif'] },
        ]);
    });

    // [BULGU - incelenmesi gereken davranış, characterization-testing skill madde 5 uyarınca DÜZELTİLMEDİ,
    // yalnızca sabitlendi] Bizimhesap.ProductService.checkBatchProduct her zaman `undefined` döner;
    // gövde/mode/HTTP çağrısı FARK ETMEZ (kod içinde hiçbir HTTP isteği bile atılmaz). Diğer entegrasyonlarda
    // (örn. Pazarama) bu metot gerçek bir batch/toplu-işlem takip uç noktasına gidip COMPLETED/FAILED
    // ayrımı üretirken, Bizimhesap'ta bu iş mantığı hiç implemente edilmemiş - yani Bizimhesap'ta batch
    // gönderim sonrası "kısmi başarı" raporlama mekanizması yok. Bu bir hata olabilir (Bizimhesap'ın
    // gerçek API'sinde batch/status endpoint'i var mı belirsiz) ya da bilinçli bir tasarım kararı olabilir
    // (Bizimhesap senkron/anlık yanıt veriyor olabilir, batch takibine ihtiyaç yok). Nedeni doğrulanamadı;
    // BACKLOG.md'ye "incelenmesi gereken davranış" olarak eklendi. KOD DÜZELTİLMEDİ (kapsam dışı).
    it('[faz4-conf-fix C8b] checkBatchProduct NOT_SUPPORTED fırlatır (batch kavramı yok; `undefined` yalnız "sonuçlanmadı" içindir, HTTP isteği atılmaz)', async () => {
        const p = params('http://127.0.0.1:1'); // hiçbir sunucu yok; HTTP isteği atılsaydı ECONNREFUSED alırdık
        const svc = new Service(p);
        const productService = new ProductService(p, svc);
        await expect(productService.checkBatchProduct({ trackingId: 'ANY', mode: PLATFORM_PROCESS.UPDATE_STOCK })).rejects.toMatchObject({ name: 'IntegrationError', code: 'NOT_SUPPORTED' });
    });
});
