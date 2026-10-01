/**
 * ADR-0006 sözleşme testi (Protokol 13) - Pazarama'ya ÖZGÜ kalan senaryolar. Gerçek Service -> OrderConnector -> OrderService /
 * ProductService zincirinden, 127.0.0.1'deki geçici HTTP sunucusuna istek atılır; GERÇEK dış/Pazarama hostuna istek YOK.
 *
 * [INT-05, 2026-09-30] Ortak dayanıklılık senaryoları (500 -> UNAVAILABLE, 429 -> RATE_LIMITED, timeout -> UNAVAILABLE, 401/403 -> AUTH,
 * yazma 500 -> UNKNOWN_OUTCOME, saf başarı) conformance kitine TAŞINDI ve bu dosyadan SİLİNDİ: tests/conformance/pazarama.conformance.test.ts
 * (C1, C2a/C2b, C3, C4, C5, C6a/C9a). "401 -> token yenile -> BİR KEZ tekrar" (auth hook) token/istek sayılarıyla
 * Pazarama.service.characterization.test.ts'te. Burada Pazarama'ya özgü kalanlar: AUTH hatasının OrderService katmanında `[AUTH]` mesaj önekini
 * koruması (tüketici sözleşmesi), ECONNREFUSED ve kısmi başarı (checkBatchProduct: COMPLETED/FAILED ayrımı, iki yanıt biçimi).
 *
 * Pazarama'ya özgü: her istekten önce OAuth2 token alınır; test sunucusu `/connect/token` ve sipariş uç noktasını req.url'e göre ayırt eder.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import Service from '@integration/modules/marketplace/pazarama/services/Service';
import { OrderService } from '@integration/modules/marketplace/pazarama/services/OrderService';
import { ProductService } from '@integration/modules/marketplace/pazarama/services/ProductService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';
import type { IncomingMessage, ServerResponse } from 'http';
import { PLATFORM_PROCESS } from '@interfaces/index';

let srv: LocalServerHandle | undefined;

function tokenAwareHandler(orderHandler: (req: IncomingMessage, res: ServerResponse) => void) {
    return (req: IncomingMessage, res: ServerResponse) => {
        if (req.url?.includes('/connect/token')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
            return;
        }
        orderHandler(req, res);
    };
}

const params = (baseUrl: string) => ({
    clientId: 51,
    integrationSettings: {
        settings: { APIKEY: 'k', APISECRET: 's' },
        urls: { tokenUrl: `${baseUrl}/connect/token`, orderListUrl: `${baseUrl}/order/getOrdersForApi` },
    },
});

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); delete process.env.PAZARAMA_HTTP_TIMEOUT_MS; });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    ResilientHttpClient.resetAllState();
});
afterEach(async () => {
    jest.restoreAllMocks();
    if (srv) { await srv.close(); srv = undefined; }
    delete process.env.PAZARAMA_HTTP_TIMEOUT_MS;
});

describe('Pazarama - gerçek yerel sunucu ile sözleşme testi (AUTH mesaj öneki / ağ hatası)', () => {
    it('IntegrationError, OrderConnector -> OrderService katmanında generic Error nesnesine sarılmaz (code/retryable korunur)', async () => {
        // Auth hook bir kez yeniden dener; her iki denemede de 401 dönerse sonunda AUTH fırlatılmalı.
        srv = await startLocalServer(tokenAwareHandler((_req, res) => {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'yetkisiz' }));
        }));
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
            // [ADR-0006 Karar 2] Tüketici sözleşmesi: mesaj `[CODE]` öneki taşır (OrderErrorHandler/
            // Publisher bunu ayrıştırarak code/retryable'a göre karar verir, metin eşleşmesi değil).
            expect(e.message).toMatch(/^\[AUTH\]/);
        }
    });

    it('ECONNREFUSED (bağlantı reddedildi, DNS/ağ hatası, HTTP durum kodu yok) -> IntegrationError(UNAVAILABLE)', async () => {
        // Bilinçli olarak açılıp hemen kapatılan bir sunucu: dinleyen yok -> bağlantı reddi kesin (gerçek ağa istek YOK).
        const tmp = await startLocalServer((_req, res) => { res.writeHead(200); res.end('{}'); });
        const deadBaseUrl = tmp.baseUrl;
        await tmp.close();

        const p = params(deadBaseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        await expect(orderService.fetchOrders({})).rejects.toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE' });
    });
});

describe('Pazarama - kısmi başarı (checkBatchProduct, gerçek batch/toplu işlem uç noktası)', () => {
    it('[kısmi başarı, GERÇEK davranış] checkBatchProduct (UPDATE_STOCK, Lake Projections formatı) - bazı SKU COMPLETED bazıları FAILED olarak ayrılır', async () => {
        srv = await startLocalServer(tokenAwareHandler((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                data: {
                    data: [
                        { code: 'SKU-1', barcode: 'BC-1', price: { status: 0 }, operationStatusText: 'Başarılı' },
                        { code: 'SKU-2', barcode: 'BC-2', price: { status: 1 }, operationStatusText: 'Stok yetersiz' },
                    ],
                },
            }));
        }));
        const p = params(srv.baseUrl);
        (p.integrationSettings.urls as any).checkUpdateBatchUrl = `${srv.baseUrl}/listing-state/batch-id/<BATCHID>/lake-projections`;
        const svc = new Service(p);
        const productService = new ProductService(p, svc);
        const results = await productService.checkBatchProduct({ trackingId: 'BATCH-1', mode: PLATFORM_PROCESS.UPDATE_STOCK });
        expect(results).toEqual([
            { matchValue: 'SKU-1', barcode: 'BC-1', status: 'COMPLETED', messages: ['Başarılı'] },
            { matchValue: 'SKU-2', barcode: 'BC-2', status: 'FAILED', messages: ['Stok yetersiz'] },
        ]);
    });

    it('[kısmi başarı, GERÇEK davranış] checkBatchProduct (TRANSFER, Product Batch formatı) - batchResult (başarılı) + failedProducts (FAILED) birleştirilir', async () => {
        srv = await startLocalServer(tokenAwareHandler((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                data: {
                    batchResult: [{ productCode: 'SKU-10', barcode: 'BC-10' }],
                    failedProducts: [{ productCode: 'SKU-11', barcode: 'BC-11', errorReason: 'Kategori eşleşmedi' }],
                },
            }));
        }));
        const p = params(srv.baseUrl);
        (p.integrationSettings.urls as any).checkBatchUrl = `${srv.baseUrl}/product/getProductBatchResult?BatchRequestId=<BATCHID>`;
        const svc = new Service(p);
        const productService = new ProductService(p, svc);
        const results = await productService.checkBatchProduct({ trackingId: 'BATCH-2', mode: PLATFORM_PROCESS.TRANSFER });
        expect(results).toEqual([
            { matchValue: 'SKU-10', barcode: 'BC-10', status: 'COMPLETED', messages: ['Başarılı'] },
            { matchValue: 'SKU-11', barcode: 'BC-11', status: 'FAILED', messages: ['Kategori eşleşmedi'] },
        ]);
    });
});
