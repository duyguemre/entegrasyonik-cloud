/**
 * ADR-0006 Aşama B3 sözleşme testi (Protokol 13): "mockserver 500/429/timeout döndürür ->
 * IntegrationError fırlatılır, [] dönmez / generic Error'a sarılmaz". Gerçek Ideasoft Service ->
 * OrderService/CategoryService zincirinden, gerçek axios ile 127.0.0.1'deki geçici HTTP sunucusuna
 * (tests/helpers/localHttpServer.ts) istek atılır. GERÇEK Ideasoft hostuna hiçbir istek YOK.
 *
 * Ideasoft'a özgü: token akışı BİLİNÇLİ OLARAK dokunulmadı (BACKLOG C10, ayrı takip) — bu testlerde
 * `Service.setCurrentToken(...)` doğrudan çağrılarak sanki token zaten alınmış gibi kurulur (yalnızca
 * bu testin odağı retry/timeout/breaker/hata sözleşmesi olduğu için); token akışının KENDİSİ
 * `tests/characterization/stubs/Ideasoft.brokenTokenFlow.characterization.test.ts`'te sabitlenmiştir.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import Service from '@integration/modules/ecommerce/ideasoft/services/Service';
import { OrderService } from '@integration/modules/ecommerce/ideasoft/services/OrderService';
import { CategoryService } from '@integration/modules/ecommerce/ideasoft/services/CategoryService';
import { ProductService } from '@integration/modules/ecommerce/ideasoft/services/ProductService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';
import { PLATFORM_PROCESS } from '@interfaces/index';

/**
 * [QA Faz2 madde 1 tamamlama, 2026-09-27] Bu dosyaya 3 senaryo daha eklendi (7 -> 10; diğer Ideasoft
 * dosyalarıyla (brokenTokenFlow 3, sendOrderInvoice.stub 1, IntegrationCallMetrics.adapters 1 başarılı)
 * birlikte toplam ~15 senaryo, ≥8 eşiğini rahatça geçer):
 *  8. [saf başarı] 200 (tek sayfa, retry yok) -> fetchOrders başarıyla döner
 *  9. [kısmi başarı, GERÇEK davranış] updateProductStock (processBatch) - productId eşlemesi olan
 *     varyant PUT ile başarılı, olmayan varyant senkron hata ile failedVariants'a düşer (HTTP isteği
 *     hiç atılmaz) - bu, Ideasoft'ta transferProducts/updateProduct* metotlarının GERÇEK per-item
 *     try/catch davranışıdır (Pazarama/Bizimhesap'taki checkBatchProduct-tabanlı kısmi başarıdan farklı
 *     bir mekanizma, ama aynı derecede gerçek).
 *  10. [BULGU] checkBatchProduct HER ZAMAN `undefined` döner (Bizimhesap'takiyle aynı bulgu paterni,
 *      bkz. BACKLOG.md) - Ideasoft'ta da batch/toplu-işlem takip mekanizması implemente edilmemiş.
 */

let srv: LocalServerHandle | undefined;

const params = (baseUrl: string) => ({
    clientId: 71,
    integrationSettings: {
        settings: { storeName: 'test', key: 'k', secret: 's' },
        urls: { baseUrl, orderListUrl: `${baseUrl}/orders`, updateOrderUrl: `${baseUrl}/orders/<ORDERID>`, categoryListUrl: `${baseUrl}/categories` },
    },
});

function buildService(baseUrl: string): Service {
    const svc = new Service(params(baseUrl));
    svc.setCurrentToken('already-obtained-token'); // token akışı bu testin kapsamı DIŞINDA (bkz. üst yorum)
    return svc;
}

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); delete process.env.IDEASOFT_HTTP_TIMEOUT_MS; });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    ResilientHttpClient.resetAllState();
});
afterEach(async () => {
    jest.restoreAllMocks();
    if (srv) { await srv.close(); srv = undefined; }
    delete process.env.IDEASOFT_HTTP_TIMEOUT_MS;
});

// [INT-05 adım 3] 500/429/timeout/401 okuma senaryoları ortak conformance kitine taşındı (tests/conformance/ideasoft.conformance.test.ts C1-C4); burada yalnız kitte olmayan
// yollar (CategoryService, OrderService yazma sarmalayıcıları, per-öğe kısmi başarı) kalır.
describe('Ideasoft okuma (fetchCategories) - gerçek yerel sunucu ile sözleşme testi', () => {
    it('500 -> CategoryService.fetchCategories IntegrationError(UNAVAILABLE) fırlatır, [] DÖNMEZ ve generic Error\'a SARILMAZ', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'sunucu hatası' }));
        });
        const p = params(srv.baseUrl);
        const svc = buildService(srv.baseUrl);
        const categoryService = new CategoryService(p, svc);
        await expect(categoryService.fetchCategories()).rejects.toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE' });
    });
});

describe('Ideasoft yazma (approveOrder/rejectOrder) - gerçek yerel sunucu ile sözleşme testi', () => {
    it('[ADR-0006 Karar 1] PUT 500 (yazma: approveOrder) -> IntegrationError(UNKNOWN_OUTCOME), otomatik retry YOK (tam 1 çağrı)', async () => {
        let calls = 0;
        srv = await startLocalServer((_req, res) => {
            calls++;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'sunucu hatası' }));
        });
        const p = params(srv.baseUrl);
        const svc = buildService(srv.baseUrl);
        const orderService = new OrderService(p, svc);
        await expect(orderService.approveOrder('ORD-1')).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        expect(calls).toBe(1);
    });

    it('429 (Retry-After küçük) -> yazma da olsa RATE_LIMITED akışına göre yeniden denenir ve sonunda başarılı olur', async () => {
        let calls = 0;
        srv = await startLocalServer((_req, res) => {
            calls++;
            if (calls === 1) {
                res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '0' });
                res.end(JSON.stringify({ message: 'rate limited' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: 1 }));
        });
        const p = params(srv.baseUrl);
        const svc = buildService(srv.baseUrl);
        const orderService = new OrderService(p, svc);
        await expect(orderService.approveOrder('ORD-1')).resolves.toBe(true);
        expect(calls).toBe(2);
    });
});

describe('Ideasoft - saf başarı (retry olmadan tek denemede 200)', () => {
    it('[saf başarı] 200 (tek sayfa, items.length<100) -> fetchOrders retry OLMADAN başarılı döner (tek istek)', async () => {
        let calls = 0;
        srv = await startLocalServer((_req, res) => {
            calls++;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([{ orderNumber: 'ID-100', status: 'Open' }]));
        });
        const p = params(srv.baseUrl);
        const svc = buildService(srv.baseUrl);
        const orderService = new OrderService(p, svc);
        const orders = await orderService.fetchOrders({});
        expect(calls).toBe(1);
        expect(orders).toHaveLength(1);
        expect((orders[0] as any).order.externalOrderId).toBe('ID-100'); // [C9b] IOrderPackage
    });
});

describe('Ideasoft - kısmi başarı (updateProductStock/processBatch, gerçek per-item hata izolasyonu)', () => {
    it('[kısmi başarı, GERÇEK davranış] updateProductStock - productId eşlemesi olan varyant PUT ile başarılı, olmayan varyant senkron hata ile failedVariants\'a düşer (HTTP isteği ATILMAZ)', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({}));
        });
        const p = params(srv.baseUrl);
        (p.integrationSettings.urls as any).updateUrl = `${srv.baseUrl}/products/<PRODUCTID>`;
        const svc = buildService(srv.baseUrl);
        const productService = new ProductService(p, svc);
        const staged = [
            { payload: { _id: 'v1', barcode: 'BC1', stock: 5, platforms: { ideasoft: { mappings: { productId: 100 } } } } },
            { payload: { _id: 'v2', barcode: 'BC2', stock: 3 } }, // platforms eşlemesi yok -> 'Ürün ID bulunamadı' ile senkron hata
        ] as any[];
        const result = await productService.updateProductStock(staged);
        expect(result.result).toBe(true);
        expect(result.variantList).toEqual([{ variantId: 'v1', barcode: 'BC1' }]);
        expect(result.failedVariants).toEqual([{ variantId: 'v2', barcode: 'BC2', reason: 'Ürün ID bulunamadı' }]);
        // Yalnızca başarılı varyant için gerçek HTTP isteği atıldı; başarısız varyant HTTP'ye hiç değmedi.
        expect(srv.requestCount()).toBe(1);
    });

    // [BULGU - incelenmesi gereken davranış, characterization-testing skill madde 5 uyarınca DÜZELTİLMEDİ,
    // yalnızca sabitlendi] Ideasoft.ProductService.checkBatchProduct her zaman `undefined` döner;
    // gövde/mode FARK ETMEZ, hiçbir HTTP isteği atılmaz (Bizimhesap'taki checkBatchProduct bulgusuyla
    // BİREBİR AYNI patern - bkz. Bizimhesap.resilience.contract.test.ts). Ideasoft'ta transferProducts/
    // updateProduct* zaten senkron sonuç (variantList/failedVariants) döndüğü için batch/toplu-işlem
    // SONRASI ayrı bir durum sorgulama uç noktasına ihtiyaç duyulmuyor olabilir (bilinçli tasarım) ya da
    // hiç implemente edilmemiş olabilir - nedeni doğrulanamadı. BACKLOG.md'ye "incelenmesi gereken
    // davranış" olarak eklendi. KOD DÜZELTİLMEDİ (kapsam dışı).
    it('[faz4-conf-fix C8b] checkBatchProduct NOT_SUPPORTED fırlatır (batch kavramı yok; `undefined` yalnız "sonuçlanmadı" içindir, HTTP isteği atılmaz)', async () => {
        const p = params('http://127.0.0.1:1'); // hiçbir sunucu yok; HTTP isteği atılsaydı ECONNREFUSED alırdık
        const svc = buildService('http://127.0.0.1:1');
        const productService = new ProductService(p, svc);
        await expect(productService.checkBatchProduct({ trackingId: 'ANY', mode: PLATFORM_PROCESS.UPDATE_STOCK })).rejects.toMatchObject({ name: 'IntegrationError', code: 'NOT_SUPPORTED' });
    });
});
