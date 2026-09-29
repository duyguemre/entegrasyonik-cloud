import axios from 'axios';
import * as xml2js from 'xml2js';
import RestService from './RestService';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';
import { readMockConfig, assertEndpointMockable, assertMockSafeUrl } from '@integration/modules/common/mock/MockMode';
import { getSetting } from '@integration/config/ConfigResolver';

export const N11_DEFAULT_URLS = {
    "orderService": "/ws/OrderService.wsdl",
    "productService": "/ws/ProductService.wsdl",
    "categoryService": "/ws/CategoryService.wsdl",
    "returnService": "/ws/ReturnService.wsdl",
    "shipmentService": "/ws/ShipmentService.wsdl",
    "shipmentCompanyService": "/ws/ShipmentCompanyService.wsdl",
    "sellerInvoiceService": "/ws/SellerInvoiceService.wsdl",
    "settlementService": "/ws/SettlementService.wsdl",
    "ticketService": "/ws/TicketService.wsdl",
    "categoryListUrl": "cdn/categories",
    "baseUrl": "https://api.n11.com",
    "orderListUrl": "rest/delivery/v1/shipmentPackages",
    "productListUrl": "ms/product-query",
    "warehouseAddressList": "suppliers/<SELLERID>/addresses",
    "categoryAttributeListUrl": "cdn/category/<CATEGORYID>/attribute",
    "transferUrl": "ms/product/tasks/product-create",
    "checkTransferUrl": "ms/product/task-details/page-query",
    "updatePriceUrl": "ms/product/tasks/price-stock-update",
    "updateStockUrl": "ms/product/tasks/price-stock-update",
    "updateUrl": "ms/product/tasks/product-update"
};

// ADR-0006 Karar 1/2: p-limit/özel hata sarma kaldırıldı. REST çağrıları (RestService.ts) ve SOAP
// çağrıları (bu dosyadaki soapRequest) paylaşımlı ResilientHttpClient katmanından geçer, AMA
// BİLİNÇLİ OLARAK İKİ AYRI ÖRNEK (breaker/limiter/bulkhead durumu) kullanır:
// BULGU (bu görevde keşfedildi/karar verildi, ADR'de açık değil): N11'in REST->SOAP yedek yolu
// (Karar 2, "yalnızca UNAVAILABLE'ta SOAP'a düş") tek bir paylaşımlı breaker ile ANLAMSIZ hale gelir
// -- REST'in art arda hataları "read" devresini açar açmaz, AYNI anahtarı paylaşan SOAP yedek çağrısı
// da gerçek istek atmadan `UNAVAILABLE(circuitOpen:true)` ile hemen reddedilir (yedek yol hiç
// çalışmaz). Bu yüzden REST ve SOAP için integrationCode alanı farklılaştırılmış iki
// ResilientHttpClient örneği kullanılır (`n11` / `n11-soap`); `IntegrationError.integrationCode`
// alanı SOAP çağrılarında `n11-soap` olarak görünür (hiçbir tüketici bu alana literal 'n11' eşitliğiyle
// bağımlı değil, doğrulandı). clientId/kod/retryable sözleşmesi değişmez.
// [ADR-0006 adım 1] SOAP çağrısı `ResilientHttpClient.executeCustom` (B1'de hazırlanan, N11'e ÖZGÜ
// olarak bu görevde bağlanan varyant) üzerinden geçer: axios.post enjekte edilir, retry/circuit
// breaker/timeout/AbortController/metrik zinciri SOAP'a da uygulanır.
export default class Service {
    private clientId: string;
    private builder = new xml2js.Builder({ headless: true });
    private http: ResilientHttpClient;
    private soapHttp: ResilientHttpClient;
    public rest: RestService;

    public static getInstance(integrationParameters: any): Service {
        return new Service(integrationParameters);
    }

    constructor(private params: any) {
        this.clientId = params.clientId || "UnknownClient";
        const sharedPolicy = {
            // N11_HTTP_TIMEOUT_MS: SADECE TEST/operasyonel ayar amaçlı; verilmezse ADR-0020 kataloğu (30sn).
            // [ADR-0020 Aşama A] Kaynak: integrationHttp.ts `resilience.timeoutMs` (n11=30000).
            timeoutMs: Number(process.env.N11_HTTP_TIMEOUT_MS) || getSetting<number>('resilience.timeoutMs', { integrationCode: 'n11' }),
            // [ADR-0020 Aşama A] Kaynak: `resilience.maxConcurrent` (n11=10). önceki pLimit(10) (SOAP) /
            // axios-rate-limit(5 req/1000ms=300/dk) (REST) değerleri korunmuyor; tek ortak limit olarak
            // pLimit(10)'un eşzamanlılık değeri esas alındı.
            maxConcurrent: getSetting<number>('resilience.maxConcurrent', { integrationCode: 'n11' }),
            // [ADR-0020 Aşama A] Kaynak: `resilience.ratePerMin` (n11=1000). 1f: N11 REST fiyat-stok servisi
            // resmi limiti 1000 istek/dk. SOAP için resmi limit dokümante edilmedi; aynı üst sınır iki
            // protokol için de uygulanır (BULGU).
            ratePerMin: getSetting<number>('resilience.ratePerMin', { integrationCode: 'n11' }),
        };
        this.http = new ResilientHttpClient(integrationCode, this.clientId, sharedPolicy);
        this.soapHttp = new ResilientHttpClient(`${integrationCode}-soap`, this.clientId, sharedPolicy);
        this.rest = new RestService(params, this.http);
    }

    private getAuthObject() {
        const { APIKEY, APISECRET } = this.params.integrationSettings.settings;
        return {
            appKey: APIKEY,
            appSecret: APISECRET
        };
    }

    private getTargetUrl(url: string): string {
        // [BACKLOG C19] Mock modu FAIL-CLOSED (bkz. common/mock/MockMode.ts): mock AÇIKKEN listede
        // olmayan WSDL/endpoint gerçek adrese GİTMEZ, NOT_SUPPORTED fırlatılır. Eşleştirme (çift yönlü,
        // küçük harf, kenar '/' kırpılmış) korunmuştur; boş liste girdisi artık eşleşmez.
        const mock = readMockConfig('N11', 'http://localhost:6015/n11');
        const errCtx = { integrationCode: `${integrationCode}-soap`, clientId: this.clientId };
        const cleanUrl = url.replace(/^\/+|\/+$/g, '').toLowerCase();
        if (mock.enabled) {
            assertEndpointMockable(mock, url, errCtx, (m) => {
                const cleanM = m.replace(/^\/+|\/+$/g, '').toLowerCase();
                return cleanM === cleanUrl || cleanM.includes(cleanUrl) || cleanUrl.includes(cleanM);
            });
        }
        const isMockActive = mock.enabled;
        const mockBaseUrl = mock.baseUrl.replace(/\/$/, '');

        const baseUrlFromConfig = this.params.integrationSettings.urls?.baseUrl || N11_DEFAULT_URLS.baseUrl;

        if (!url.startsWith('http')) {
            const finalUrlSuffix = url.replace(/^\//, ''); // Always use relative suffix for joining
            const base = isMockActive ? mockBaseUrl : `${baseUrlFromConfig.replace(/\/$/, '')}/ws/`;
            return `${base}/${finalUrlSuffix}`;
        }

        if (isMockActive) {
            let transformedUrl = url.replace(/https:\/\/api\.n11\.com\/ws\//g, mockBaseUrl + '/');
            // Host mock tabanına çevrilemediyse gerçek/yabancı adrese SIZMASIN.
            assertMockSafeUrl(mock, transformedUrl, errCtx);
            return transformedUrl;
        }

        return url;
    }

    public getWsdlUrl(key: string): string {
        return this.params.integrationSettings.urls?.[key] || (N11_DEFAULT_URLS as any)[key] || key;
    }

    /**
     * Executes a SOAP request via the shared resilience layer (`ResilientHttpClient.executeCustom`).
     * @param urlKey The key in integrationSettings.urls or the default WSDL name.
     * @param rootElementName The root element of the body, e.g. 'sch:GetCityListRequest'
     * @param payload The body payload.
     * @param opts.idempotent true => okuma (retry ağ/timeout/5xx/429'da); varsayılan false (yazma).
     */
    public async soapRequest(urlKey: string, rootElementName: string, payload: any = {}, opts?: { idempotent?: boolean }): Promise<any> {
        const wsdl = this.getWsdlUrl(urlKey);
        const fullUrl = this.getTargetUrl(wsdl);

        // Append auth object to every payload as required by N11
        const fullPayload = {
            auth: this.getAuthObject(),
            ...payload
        };

        const bodyXml = this.builder.buildObject({ [rootElementName]: fullPayload });

        const envelope = `
                <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas">
                   <soapenv:Header/>
                   <soapenv:Body>
                      ${bodyXml}
                   </soapenv:Body>
                </soapenv:Envelope>
            `;

        const idempotent = opts?.idempotent ?? false;
        const operation = `SOAP ${rootElementName}`;

        const response = await this.soapHttp.executeCustom<{ data: string }>(
            { operation, idempotent, url: fullUrl },
            (signal) => axios.post(fullUrl, envelope, {
                headers: {
                    'Content-Type': 'text/xml;charset=UTF-8',
                    'User-Agent': `${this.clientId} - Entegrasyonik N11 Client`,
                    'appkey': this.params.integrationSettings.settings.APIKEY,
                    'appsecret': this.params.integrationSettings.settings.APISECRET
                },
                signal,
            }),
        );

        return await this.parseSoapResponse(response.data, operation);
    }

    private async parseSoapResponse(xmlString: string, operation: string): Promise<any> {
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        const result = await parser.parseStringPromise(xmlString);

        // Extract body
        const body = result['soapenv:Envelope']?.['soapenv:Body'] || result['SOAP-ENV:Envelope']?.['SOAP-ENV:Body'];
        if (!body) return result;

        // Extract the first child of the body (the actual response object)
        const responseKey = Object.keys(body)[0];
        const responseData = body[responseKey];

        // Check for N11 specific error format. Bir SOAP business fault'u (HTTP 200 ama işlem
        // reddedildi) IntegrationError('VALIDATION') olarak fırlatılır -> [ADR-0006 Karar 2] sözleşmesi
        // (generic Error değil; retry/breaker'ı etkilemez, çünkü executeCustom tamamlandıktan SONRA
        // ayrıştırılır).
        if (responseData?.result && responseData.result.status === 'failure') {
            throw new IntegrationError('VALIDATION', responseData.result.errorMessage || 'N11 SOAP API hatası', {
                integrationCode: `${integrationCode}-soap`, operation, clientId: this.clientId,
            });
        }

        return responseData;
    }
}
