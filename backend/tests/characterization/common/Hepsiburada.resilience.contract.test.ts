/**
 * ADR-0006 sözleşme testi (Protokol 13) - Hepsiburada'ya ÖZGÜ kalan senaryolar. Gerçek Service -> ProductService zincirinden, 127.0.0.1'deki
 * geçici HTTP sunucusuna istek atılır; GERÇEK dış hosta istek YOK.
 *
 * [INT-05, 2026-09-30] Ortak dayanıklılık senaryoları (500 -> UNAVAILABLE, 429 -> RATE_LIMITED, timeout -> UNAVAILABLE, 401 -> AUTH sarılmadan,
 * saf başarı/tek istek) conformance kitine TAŞINDI ve bu dosyadan SİLİNDİ: tests/conformance/hepsiburada.conformance.test.ts
 * (C1, C2a/C2b, C3, C4, C6a/C9a). Burada yalnız HB'ye özgü kısmi başarı (checkBatchProduct: COMPLETED/FAILED ayrımı) kalır.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import Service from '@integration/modules/marketplace/hepsiburada/services/Service';
import { ProductService } from '@integration/modules/marketplace/hepsiburada/services/ProductService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';
import { PLATFORM_PROCESS } from '@interfaces/index';

let srv: LocalServerHandle | undefined;
const params = (baseUrl: string) => ({
    clientId: 43,
    integrationSettings: {
        settings: { APIKEY: 'k', APISECRET: 's', SELLERID: 'M-1' },
        urls: { orderListUrl: `${baseUrl}/orders/merchantid/M-1` },
    },
});

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); delete process.env.HB_HTTP_TIMEOUT_MS; });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    ResilientHttpClient.resetAllState();
});
afterEach(async () => {
    jest.restoreAllMocks();
    if (srv) { await srv.close(); srv = undefined; }
    delete process.env.HB_HTTP_TIMEOUT_MS;
});

describe('Hepsiburada - kısmi başarı (checkBatchProduct, gerçek batch/toplu işlem uç noktaları)', () => {
    it('[kısmi başarı, GERÇEK davranış] checkBatchProduct (UPDATE_STOCK, checkUploadJobStatus) - bazı barkodlar COMPLETED bazıları FAILED olarak ayrılır', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'Done',
                items: [
                    { barcode: 'BC-1', status: 'Uploaded' },
                    { barcode: 'BC-2', status: 'FAILED', message: 'Stok tutarsız' },
                ],
            }));
        });
        const p = params(srv.baseUrl);
        (p.integrationSettings.urls as any).stockStatusUrl = `${srv.baseUrl}/stock-uploads/<TRACKINGID>`;
        const svc = new Service(p);
        const productService = new ProductService(p, svc);
        const results = await productService.checkBatchProduct({ trackingId: 'JOB-1', mode: PLATFORM_PROCESS.UPDATE_STOCK });
        expect(results).toEqual([
            { matchValue: 'BC-1', barcode: 'BC-1', status: 'COMPLETED', messages: ['İşlem tamamlandı.'] },
            { matchValue: 'BC-2', barcode: 'BC-2', status: 'FAILED', messages: ['Stok tutarsız'] },
        ]);
    });

    it('[kısmi başarı, GERÇEK davranış] checkBatchProduct (TRANSFER, fetchBatchResults/productStatus formatı) - REJECTED -> FAILED, "Satışa Hazır" -> COMPLETED', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                data: [
                    { barcode: 'BC-10', productStatus: 'Satışa Hazır' },
                    { barcode: 'BC-11', productStatus: 'REJECTED', statusDescription: 'Kategori uyuşmuyor' },
                ],
            }));
        });
        const p = params(srv.baseUrl);
        (p.integrationSettings.urls as any).checkBatchUrl = `${srv.baseUrl}/product/api/products/status/<TRACKINGID>`;
        const svc = new Service(p);
        const productService = new ProductService(p, svc);
        const results = await productService.checkBatchProduct({ trackingId: 'BATCH-2', mode: PLATFORM_PROCESS.TRANSFER });
        expect(results).toEqual([
            { matchValue: 'BC-10', barcode: 'BC-10', status: 'COMPLETED', messages: ['Statü: Satışa Hazır'] },
            { matchValue: 'BC-11', barcode: 'BC-11', status: 'FAILED', messages: ['Kategori uyuşmuyor'] },
        ]);
    });
});
