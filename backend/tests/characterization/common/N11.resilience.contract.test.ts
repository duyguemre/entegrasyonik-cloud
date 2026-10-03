/**
 * ADR-0006 Aşama B2 sözleşme testi (Protokol 13): "mockserver 500/429/timeout döndürür ->
 * IntegrationError fırlatılır, [] dönmez". Gerçek N11 Service (REST + SOAP) -> Connector -> Service
 * zincirinden, gerçek axios ile 127.0.0.1'deki geçici HTTP sunucusuna (tests/helpers/localHttpServer.ts)
 * istek atılır. GERÇEK dış/N11 hostuna hiçbir istek YOK.
 *
 * Kapsar: (1) REST katmanı (Service.rest) ResilientHttpClient sözleşmesi, (2) SOAP katmanı
 * (Service.soapRequest -> executeCustom) AYNI dayanıklılık zincirinden geçiyor mu, (3) OrderService
 * REST->SOAP yedek yolu [ADR-0006 Karar 2]: yalnızca UNAVAILABLE/NOT_SUPPORTED'ta ve loglanarak.
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import Service from '@integration/modules/marketplace/n11/services/Service';
import { OrderConnector } from '@integration/modules/marketplace/n11/api/OrderConnector';
import { OrderService } from '@integration/modules/marketplace/n11/services/OrderService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, LocalServerHandle } from '../../helpers/localHttpServer';
import type { IncomingMessage, ServerResponse } from 'http';

let srv: LocalServerHandle | undefined;

const SOAP_EMPTY_ORDER_LIST = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas">
  <soapenv:Body>
    <sch:OrderListResponse>
      <result><status>success</status></result>
    </sch:OrderListResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

const SOAP_FAULT = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas">
  <soapenv:Body>
    <sch:MakeOrderItemShipmentResponse>
      <result><status>failure</status><errorMessage>Kargo firması bulunamadı</errorMessage></result>
    </sch:MakeOrderItemShipmentResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

const params = (baseUrl: string) => ({
    clientId: 61,
    integrationSettings: {
        settings: { APIKEY: 'k', APISECRET: 's' },
        urls: { baseUrl, orderListUrl: `${baseUrl}/rest/delivery/v1/shipmentPackages`, orderService: `${baseUrl}/ws/OrderService.wsdl`, shipmentCompanyService: `${baseUrl}/ws/ShipmentCompanyService.wsdl` },
    },
});

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); delete process.env.N11_HTTP_TIMEOUT_MS; });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    cap = captureLogs();
    ResilientHttpClient.resetAllState();
});
afterEach(async () => {
    jest.restoreAllMocks();
    if (srv) { await srv.close(); srv = undefined; }
    delete process.env.N11_HTTP_TIMEOUT_MS;
});

// 500/429/timeout senaryoları (C1/C2b/C3) INT-05'te conformance kitine (tests/conformance/n11.conformance.test.ts) taşındı; burada yalnız kitte OLMAYAN mesaj öneki sözleşmesi kaldı.
describe('N11 REST (Service.rest) - gerçek yerel sunucu ile sözleşme testi', () => {
    it('401 -> IntegrationError(AUTH), generic Error nesnesine sarılmaz', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'yetkisiz' }));
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const connector = new OrderConnector(svc, p);
        try {
            await connector.fetchOrdersRest({});
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
});

describe('N11 SOAP (Service.soapRequest -> executeCustom) - gerçek yerel sunucu ile sözleşme testi', () => {
    it('[ADR-0006 adım 1] SOAP 500 (yazma: makeOrderItemShipment) -> IntegrationError(UNKNOWN_OUTCOME), [] DÖNMEZ', async () => {
        let calls = 0;
        srv = await startLocalServer((_req, res) => {
            calls++;
            res.writeHead(500, { 'Content-Type': 'text/xml' });
            res.end('<error>sunucu hatası</error>');
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        await expect(orderService.sendOrderShipping({ orderId: 'ORD-1', trackingCode: 'TRK1', carrierCode: '1' } as any)).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        // Yazma: 5xx'te otomatik retry YOK (ADR-0006 Karar 1) -> tam olarak 1 çağrı.
        expect(calls).toBe(1);
    });

    it('[ADR-0006 adım 1] SOAP 429 -> IntegrationError(RATE_LIMITED)', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(429, { 'Content-Type': 'text/xml', 'Retry-After': '3600' });
            res.end('<error>rate limited</error>');
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        await expect(orderService.sendOrderShipping({ orderId: 'ORD-1', trackingCode: 'TRK1', carrierCode: '1' } as any)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('[ADR-0006 Karar 2] SOAP business fault (HTTP 200, status=failure) -> IntegrationError(VALIDATION), retry/breaker tetiklenmez', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end(SOAP_FAULT);
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        await expect(orderService.sendOrderShipping({ orderId: 'ORD-1', trackingCode: 'TRK1', carrierCode: '1' } as any)).rejects.toMatchObject({ code: 'VALIDATION' });
        expect(srv.requestCount()).toBe(1); // business fault retry'ı tetiklemez (4xx sayılmaz)
    });

    it('SOAP başarılı yanıt (OrderListRequest, okuma) doğru ayrıştırılır', async () => {
        srv = await startLocalServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end(SOAP_EMPTY_ORDER_LIST);
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const connector = new OrderConnector(svc, p);
        const result = await connector.fetchOrdersFromPlatform({});
        expect(result?.result?.status).toBe('success');
    });
});

describe('N11 OrderService.fetchOrders REST->SOAP yedek yolu [ADR-0006 Karar 2]', () => {
    it('REST 401 (AUTH) -> yedeğe DÜŞÜLMEZ, hata doğrudan fırlatılır, SOAP hiç çağrılmaz', async () => {
        let soapCalled = false;
        srv = await startLocalServer((req, res) => {
            if (req.url?.includes('shipmentPackages')) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'yetkisiz' }));
            } else {
                soapCalled = true;
                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.end(SOAP_EMPTY_ORDER_LIST);
            }
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        await expect(orderService.fetchOrders({})).rejects.toMatchObject({ code: 'AUTH' });
        expect(soapCalled).toBe(false);
    });

    it('REST 500 (UNAVAILABLE, retry tükendi) -> SOAP\'a düşülür (loglanarak) ve sonuç SOAP\'tan döner', async () => {
        let soapCalled = false;
        srv = await startLocalServer((req, res) => {
            if (req.url?.includes('shipmentPackages')) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'sunucu hatası' }));
            } else {
                soapCalled = true;
                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.end(SOAP_EMPTY_ORDER_LIST);
            }
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        const orders = await orderService.fetchOrders({});
        expect(Array.isArray(orders)).toBe(true);
        expect(soapCalled).toBe(true);
    });

    /**
     * [N11 REST şekil düzeltmesi, 2026-09-29] Kaynak: `n11APISoapREFERANSDOKUMANTASYONU_v9_0.docx` §3.7
     * (GetShipmentPackages) — REST 200 yanıtı GERÇEKTE `{totalElements, totalPages, page, size, content:[...]}`
     * şeklindedir, `shipmentPackages` alanı hiçbir örnekte YOK. Bu test REST'in bu GERÇEKÇİ şeklini döndürür.
     */
    const REST_REALISTIC_CONTENT_SHAPE = JSON.stringify({
        totalElements: 1,
        totalPages: 1,
        page: 0,
        size: 100,
        content: [{
            billingAddress: { address: 'Adres', city: 'İstanbul', district: 'Kadıköy', fullName: 'Ahmet Yılmaz', gsm: '5551112233', postalCode: '34000', taxId: null, taxHouse: null, invoiceType: 1 },
            shippingAddress: { address: 'Adres', city: 'İstanbul', district: 'Kadıköy', fullName: 'Ahmet Yılmaz', gsm: '5551112233', postalCode: '34000' },
            orderNumber: '203872347637',
            id: '112999455244259',
            customerEmail: 'ahmet@mock.com',
            customerfullName: 'Ahmet Yılmaz',
            customerId: 12345678,
            lines: [{
                quantity: 2, productId: 123456789, productName: 'Ürün', stockCode: 'SKU1',
                price: 100, sellerDiscount: 0, totalSellerDiscountPrice: 0, orderLineId: 415490391,
                orderItemLineItemStatusName: 'Picking',
            }],
            lastModifiedDate: 1724323386203,
            totalAmount: 200,
            totalDiscountAmount: 0,
            packageHistories: [{ createdDate: 1724274054460, status: 'Created' }],
            shipmentPackageStatus: 'Picking',
            sellerId: 9876543,
        }],
    });

    it('[N11 REST şekil düzeltmesi, 2026-09-29] TERS ÇEVRİLDİ: REST 200 gerçekçi {totalElements,content:[...]} şekli döner -> artık DOĞRU ayrıştırılır (`content` kontrolü), SOAP\'a HİÇ düşülmez', async () => {
        let soapCalled = false;
        srv = await startLocalServer((req, res) => {
            if (req.url?.includes('shipmentPackages')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(REST_REALISTIC_CONTENT_SHAPE);
            } else {
                soapCalled = true;
                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.end(SOAP_EMPTY_ORDER_LIST);
            }
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        const orders = await orderService.fetchOrders({});
        expect(soapCalled).toBe(false);
        expect(orders).toHaveLength(1);
        const [pkg] = orders;
        expect(pkg.order.externalOrderId).toBe('112999455244259'); // paket no (id) — Trendyol'daki shipmentPackageId deseniyle AYNI
        expect(pkg.order.orderNumber).toBe('203872347637');
        expect(pkg.order.externalStatus).toBe('Picking');
        expect(pkg.order.internalStatus).toBe('APPROVED');
        expect(pkg.order.billingAddress.city).toBe('İstanbul');
        expect(pkg.order.items).toHaveLength(1);
        expect(pkg.order.items[0].sku).toBe('SKU1');
        expect(pkg.order.items[0].totalPrice).toBe(200); // (price*quantity)-totalSellerDiscountPrice = 100*2-0
        expect(pkg.customer.email).toBe('ahmet@mock.com');
        // Sessiz düşüş DÜZELTİLDİ — REST başarıyla ayrıştığı için hiç uyarı da gerekmez.
        expect(cap.filter((l) => l.level === 'warn')).toHaveLength(0);
    });

    it('[N11 REST şekil düzeltmesi, 2026-09-29] YENİ: REST 200 ama beklenmeyen şekil (content[] yok) -> SESSİZCE yutulmaz, console.warn ile bilinçli SOAP düşüşü', async () => {
        let soapCalled = false;
        srv = await startLocalServer((req, res) => {
            if (req.url?.includes('shipmentPackages')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ someUnexpectedField: true }));
            } else {
                soapCalled = true;
                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.end(SOAP_EMPTY_ORDER_LIST);
            }
        });
        const p = params(srv.baseUrl);
        const svc = new Service(p);
        const orderService = new OrderService(p, svc);
        const orders = await orderService.fetchOrders({});
        expect(soapCalled).toBe(true);
        expect(orders).toEqual([]);
        // F-09: sözleşme gözlemcisi bu bozuk REST yanıtı için ayrıca API_SCHEMA_DRIFT üretir (yanıt yine reddedilmez); bilinçli düşüş uyarısı değişmedi.
        expect(cap.filter((l) => l.code === 'API_SCHEMA_DRIFT').map((l) => l.field)).toEqual(['content']);
        const warns = cap.filter((l) => l.level === 'warn' && l.code !== 'API_SCHEMA_DRIFT');
        expect(warns).toHaveLength(1);
        expect(warns[0].code).toBe('N11_REST_UNEXPECTED_SHAPE');
        expect(warns[0].msg).toMatch(/REST yanıtı beklenen şekilde değil/);
    });
});
