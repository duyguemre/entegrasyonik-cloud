// LIVE-RO Katman A: saf politika (ağ YOK). Canlı salt-okuma kipinde hangi giden istek geçer / bloklanır.
import { describe, it, expect } from '@jest/globals';
import {
    evaluateLiveRequest, soapOperationsOf, adapterOfHost, isAllowedLiveHost, isLocalDbUrl, dbUrlHosts, redactPathForLog,
    liveReadHostPatterns, N11_READ_OPERATIONS, LiveRequest,
} from '../../../src/integration/modules/common/security/liveReadonlyPolicy';
import { ALLOWED_OUTBOUND_HOSTS } from '../../../src/integration/modules/common/security/outboundHosts';

const req = (o: Partial<LiveRequest>): LiveRequest => ({ protocol: 'https:', host: 'apigw.trendyol.com', method: 'GET', path: '/x', ...o });
const soap = (op: string, extra = '') => `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas"><soapenv:Header/><soapenv:Body><sch:${op}><auth><appKey>k</appKey></auth>${extra}</sch:${op}></soapenv:Body></soapenv:Envelope>`;

describe('liveReadonlyPolicy.evaluateLiveRequest', () => {
    it('izinli host + GET/HEAD geçer', () => {
        expect(evaluateLiveRequest(req({ method: 'GET' })).action).toBe('allow');
        expect(evaluateLiveRequest(req({ method: 'HEAD', host: 'mpop.hepsiburada.com' })).action).toBe('allow');
        expect(evaluateLiveRequest(req({ host: 'shop.myideasoft.com' })).action).toBe('allow');
    });
    it('POST/PUT/PATCH/DELETE (ürün/fiyat/stok/sipariş/soru yazmaları) bloklu', () => {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
            expect(evaluateLiveRequest(req({ method, path: '/integration/product/sellers/1/products' })).action).toBe('block');
        }
        expect(evaluateLiveRequest(req({ host: 'mpop.hepsiburada.com', method: 'POST', path: '/orders/merchantid/1/cancel' })).action).toBe('block');
        expect(evaluateLiveRequest(req({ host: 'isortagimapi.pazarama.com', method: 'POST', path: '/order/updateOrderStatus' })).action).toBe('block');
        expect(evaluateLiveRequest(req({ host: 'isortagimapi.pazarama.com', method: 'POST', path: '/product/create' })).action).toBe('block');
        expect(evaluateLiveRequest(req({ host: 'isortagimapi.pazarama.com', method: 'PUT', path: '/order/getOrdersForApi' })).action).toBe('block'); // okuma yolu ama PUT
        expect(evaluateLiveRequest(req({ host: 'api.n11.com', method: 'POST', path: '/ms/product/tasks/product-create' })).action).toBe('block'); // N11 REST POST
    });
    it('token ucu: Pazarama client_credentials POST geçer; Ideasoft token VARSAYILAN bloklu, allowTokenRefresh=ideasoft ile geçer', () => {
        expect(evaluateLiveRequest(req({ host: 'isortagimgiris.pazarama.com', method: 'POST', path: '/connect/token' })).action).toBe('allow');
        const ide = req({ host: 'magaza.myideasoft.com', method: 'POST', path: '/oauth/v2/token' });
        expect(evaluateLiveRequest(ide)).toMatchObject({ action: 'block', reason: 'token-refresh-disabled' });
        expect(evaluateLiveRequest(ide, { allowTokenRefresh: ['ideasoft'] }).action).toBe('allow');
        expect(evaluateLiveRequest(req({ host: 'magaza.myideasoft.com', method: 'POST', path: '/admin-api/orders' }), { allowTokenRefresh: ['ideasoft'] }).action).toBe('block');
        // Pazarama token yolu başka host'ta (ör. Trendyol) geçerli değil
        expect(evaluateLiveRequest(req({ method: 'POST', path: '/connect/token' })).action).toBe('block');
    });
    it('Pazarama filtreli listeleme POST uçları (okuma) geçer', () => {
        for (const path of ['/order/getOrdersForApi', '/order/getRefund', '/finance/getsettlements', '/order/paymentAgreement', '/product/getProductDetail', '/QuestionAnswer/getApprovalAnswersByMerchantSearch']) {
            expect(evaluateLiveRequest(req({ host: 'isortagimapi.pazarama.com', method: 'POST', path })).action).toBe('allow');
        }
        expect(evaluateLiveRequest(req({ host: 'isortagimapi.pazarama.com', method: 'POST', path: '/QuestionAnswer/sellerAnswer' })).action).toBe('block');
        expect(evaluateLiveRequest(req({ host: 'isortagimapi.pazarama.com', method: 'POST', path: '/order/updateRefund' })).action).toBe('block');
    });
    it('N11 SOAP: gövde yokken inspect-body; okuma operasyonu geçer; yazma operasyonu bloklu', () => {
        const base = req({ host: 'api.n11.com', method: 'POST', path: '/ws/productService.wsdl' });
        expect(evaluateLiveRequest(base).action).toBe('inspect-body');
        for (const op of N11_READ_OPERATIONS) expect(evaluateLiveRequest({ ...base, body: soap(op) }).action).toBe('allow');
        for (const op of ['SaveProductRequest', 'UpdateProductPriceBySellerCodeRequest', 'UpdateProductStockBySellerCodeRequest', 'SaveProductAnswerRequest', 'ClaimReturnApproveRequest', 'ClaimReturnRejectRequest', 'SaveLinkSellerInvoiceRequest', 'MakeOrderItemShipmentRequest', 'DeleteProductBySellerCodeRequest']) {
            expect(evaluateLiveRequest({ ...base, body: soap(op) })).toMatchObject({ action: 'block', operation: op });
        }
    });
    it('N11 SOAP kaçırma girişimleri: okuma+yazma karışık gövde, operasyonsuz gövde, yanlış yol', () => {
        const base = req({ host: 'api.n11.com', method: 'POST', path: '/ws/productService.wsdl' });
        expect(evaluateLiveRequest({ ...base, body: soap('GetProductListRequest', '<sch:SaveProductRequest></sch:SaveProductRequest>') }).action).toBe('block');
        expect(evaluateLiveRequest({ ...base, body: '<a>yok</a>' }).action).toBe('block');
        expect(evaluateLiveRequest({ ...base, path: '/ms/product/tasks', body: soap('GetProductListRequest') }).action).toBe('block');
    });
    it('bilinmeyen host, http, port bloklu; loopback serbest', () => {
        expect(evaluateLiveRequest(req({ host: 'evil.example.com' }))).toMatchObject({ action: 'block', reason: 'host-not-allowed' });
        expect(evaluateLiveRequest(req({ host: 'cdn.dsmcdn.com' })).action).toBe('block'); // görsel CDN bilinçli dışarıda
        expect(evaluateLiveRequest(req({ host: 'accountid.r2.cloudflarestorage.com' })).action).toBe('block');
        expect(evaluateLiveRequest(req({ protocol: 'http:' }))).toMatchObject({ action: 'block', reason: 'https-required' });
        expect(evaluateLiveRequest(req({ port: 8443 })).action).toBe('block');
        expect(evaluateLiveRequest(req({ host: '127.0.0.1', protocol: 'http:', method: 'POST' })).action).toBe('allow');
        expect(evaluateLiveRequest(req({ host: 'localhost', method: 'DELETE' })).action).toBe('allow');
    });
});

describe('liveReadonlyPolicy: LLM saglayicilari (ADR-0034 BR-5)', () => {
    const llm = (host: string, method: string, path: string) => evaluateLiveRequest(req({ host, method, path }));
    it("uc saglayici host'u izinli listede (tek K7 listesi); GET (model dogrulama) serbest", () => {
        for (const h of ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com']) {
            expect(isAllowedLiveHost(h)).toBe(true);
            expect(llm(h, 'GET', '/v1/models/x').action).toBe('allow');
        }
        expect(adapterOfHost('api.openai.com')).toBe('llm-openai');
    });
    it('POST YALNIZ cikarim uclari icin izinli', () => {
        expect(llm('api.anthropic.com', 'POST', '/v1/messages')).toMatchObject({ action: 'allow', reason: 'llm-inference' });
        expect(llm('api.openai.com', 'POST', '/v1/chat/completions')).toMatchObject({ action: 'allow', reason: 'llm-inference' });
        expect(llm('generativelanguage.googleapis.com', 'POST', '/v1beta/models/gemini-2.5-flash:streamGenerateContent')).toMatchObject({ action: 'allow' });
    });
    it('diger her POST/yol/yontem bloklu (dosya yukleme, ince ayar, batch, silme); baska saglayicinin yolu capraz gecmez', () => {
        expect(llm('api.openai.com', 'POST', '/v1/files').action).toBe('block');
        expect(llm('api.openai.com', 'POST', '/v1/fine_tuning/jobs').action).toBe('block');
        expect(llm('api.openai.com', 'POST', '/v1/chat/completions/extra').action).toBe('block');
        expect(llm('api.openai.com', 'DELETE', '/v1/models/ft-x').action).toBe('block');
        expect(llm('api.anthropic.com', 'POST', '/v1/messages/batches').action).toBe('block');
        expect(llm('api.anthropic.com', 'POST', '/v1/chat/completions').action).toBe('block');
        expect(llm('generativelanguage.googleapis.com', 'POST', '/v1beta/files').action).toBe('block');
        expect(llm('generativelanguage.googleapis.com', 'POST', '/v1beta/models/x/../../files:streamGenerateContent').action).toBe('block');
        expect(evaluateLiveRequest(req({ host: 'api.openai.com', method: 'POST', path: '/v1/chat/completions', protocol: 'http:' })).action).toBe('block');
    });
    it("baska host reddedilir; pazaryeri host'una LLM yolu izni SIZMAZ", () => {
        expect(llm('api.evil.example', 'POST', '/v1/messages').action).toBe('block');
        expect(llm('api.openai.com.evil.example', 'POST', '/v1/chat/completions').action).toBe('block');
        expect(llm('apigw.trendyol.com', 'POST', '/v1/messages').action).toBe('block');
    });
});

describe('liveReadonlyPolicy yardımcıları', () => {
    it('host listesi = K7 ALLOWED_OUTBOUND_HOSTS (ikinci liste yok)', () => {
        expect(new Set(liveReadHostPatterns())).toEqual(new Set(Object.values(ALLOWED_OUTBOUND_HOSTS).flat()));
        expect(adapterOfHost('api.trendyol.com')).toBe('trendyol');
        expect(isAllowedLiveHost('x.myideasoft.com')).toBe(true);
        expect(isAllowedLiveHost('myideasoft.com')).toBe(false);
        expect(isAllowedLiveHost('mongodbcluster.4ndov.mongodb.net')).toBe(false);
    });
    it('soapOperationsOf', () => {
        expect(soapOperationsOf(soap('OrderListRequest'))).toEqual(['OrderListRequest']);
    });
    it('DB_URL yalnız yerel ise geçer (Atlas/SRV/boş/karışık host bloklu)', () => {
        expect(isLocalDbUrl('mongodb://127.0.0.1:27017/{{DBNAME}}')).toBe(true);
        expect(isLocalDbUrl('mongodb://user' + ':pa%40ss@localhost:27017/x?authSource=admin')).toBe(true);
        expect(isLocalDbUrl('mongodb://[::1]:27017/x')).toBe(true);
        expect(isLocalDbUrl('mongodb+srv://u:p@mongodbcluster.4ndov.mongodb.net/x')).toBe(false);
        expect(isLocalDbUrl('mongodb+srv://localhost/x')).toBe(false);
        expect(isLocalDbUrl('mongodb://127.0.0.1:27017,atlas-shard-00.mongodb.net:27017/x')).toBe(false);
        expect(isLocalDbUrl('')).toBe(false);
        expect(isLocalDbUrl(undefined)).toBe(false);
        expect(isLocalDbUrl('not-a-url')).toBe(false);
        expect(JSON.stringify(dbUrlHosts('mongodb://u' + ':secretpw@127.0.0.1/x'))).not.toContain('secretpw');
    });
    it('log yolu sayısal kimlikleri maskeler, sorguyu atar', () => {
        expect(redactPathForLog('/orders/merchantid/123456789/items?token=abc')).toBe('/orders/merchantid/:n/items');
    });
});
