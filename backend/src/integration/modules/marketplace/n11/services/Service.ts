import * as xml2js from 'xml2js';
import { ADAPTER_KEYS } from '@integration/modules/adapterKeys';
import { AdapterHttpService, type AuthConfig } from '@integration/modules/common/adapter/AdapterHttpService';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { N11_READ_OPERATIONS } from '@integration/modules/common/security/liveReadonlyPolicy';
import { config } from '@config';
import { assertEndpointMockable, assertMockSafeUrl } from '@integration/modules/common/mock/MockMode';
import { integrationCode } from '../constants';

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

const KEY = ADAPTER_KEYS.find(k => k.code === 'n11')!;
const SOAP_CODE = `${integrationCode}-soap`;

// ADR-0033 INT-05: N11 artık ortak `AdapterHttpService` tabanında. Ortak olan (ResilientHttpClient kurulumu, timeout/ratePerMin/maxConcurrent
// politikası katalogdan, mock fail-closed + giden-host denetimi, get/post/put sarmalayıcıları) tabandan; N11'e özgü kalan: kimlik başlıkları,
// varsayılan taban adres, SOAP zarfı/ayrıştırma ve SOAP adres çözümlemesi.
//
// REST / SOAP AYRI İSTEMCİ (breaker/limiter/bulkhead ayrı): `Service` (kod `n11`) REST, `N11SoapTransport` (kod `n11-soap`, tabanın
// `clientSuffix:'soap'` seçeneği) SOAP içindir. Gerekçe (ADR-0006 Karar 2 BULGUSU): REST->SOAP yedek yolu tek paylaşımlı breaker ile
// anlamsız olur (REST'in art arda hataları "read" devresini açınca AYNI anahtarlı SOAP yedek çağrısı da gerçek istek atmadan reddedilir).
// `IntegrationError.integrationCode` SOAP çağrılarında `n11-soap` görünür (hiçbir tüketici literal 'n11'e bağlı değil).
//
// SOAP HTTP'si ARTIK tabanın `post`'undan geçer (XML gövde + `Content-Type: text/xml;charset=UTF-8` CallOpts.headers ile); eski doğrudan
// `axios.post` (executeCustom içinde enjekte) KALKTI (INT-04 P9). BİLİNÇLİ DÜZELTME: taban istemcisi yönlendirmeyi TAKİP ETMEZ
// (maxRedirects:0, ADR-0022) ve yanıt boyut tavanı uygular; eski SOAP çağrısında ikisi de yoktu. Davranış birebir korunanlar: politika değerleri,
// okuma/yazma idempotency (okuma: ağ/timeout/5xx/429 retry; yazma: 5xx'te retry YOK => UNKNOWN_OUTCOME), SOAP business fault => VALIDATION.

/** SOAP taşıma istemcisi: tabanın ikinci örneği (`n11-soap`); adres çözümlemesi (WSDL yolu, kendi mock eşleştirmesi) N11 SOAP'a özgüdür. */
class N11SoapTransport extends AdapterHttpService {
    constructor(params: any) {
        super(KEY, params, { clientSuffix: 'soap' });
    }

    protected authConfig(): AuthConfig {
        const s = this.params.integrationSettings?.settings || {};
        return {
            headers: {
                'User-Agent': `${this.clientId} - Entegrasyonik N11 Client`,
                'appkey': s.APIKEY,
                'appsecret': s.APISECRET,
            },
        };
    }

    /**
     * [BACKLOG C19] Mock modu FAIL-CLOSED: mock AÇIKKEN listede olmayan WSDL/endpoint gerçek adrese GİTMEZ, NOT_SUPPORTED fırlatılır.
     * Eşleştirme (çift yönlü, küçük harf, kenar '/' kırpılmış) korunmuştur; boş liste girdisi eşleşmez.
     */
    public override resolveUrl(url: string): string {
        const mock = this.mockConfig();
        const errCtx = { integrationCode: SOAP_CODE, clientId: this.clientId };
        const cleanUrl = url.replace(/^\/+|\/+$/g, '').toLowerCase();
        if (mock.enabled) {
            assertEndpointMockable(mock, url, errCtx, (m) => {
                const cleanM = m.replace(/^\/+|\/+$/g, '').toLowerCase();
                return cleanM === cleanUrl || cleanM.includes(cleanUrl) || cleanUrl.includes(cleanM);
            });
        }
        const mockBaseUrl = mock.baseUrl.replace(/\/$/, '');
        const baseUrlFromConfig = this.params.integrationSettings?.urls?.baseUrl || N11_DEFAULT_URLS.baseUrl;

        if (!url.startsWith('http')) {
            // Göreli yol `<base>/ws/` tabanına eklenir (BİLİNEN tuhaflık: `/ws/X.wsdl` anahtarı `ws//ws/X.wsdl` olur; karakterizasyonla korunur).
            const base = mock.enabled ? mockBaseUrl : `${baseUrlFromConfig.replace(/\/$/, '')}/ws/`;
            return `${base}/${url.replace(/^\//, '')}`;
        }
        if (mock.enabled) {
            const transformed = url.replace(/https:\/\/api\.n11\.com\/ws\//g, mockBaseUrl + '/');
            assertMockSafeUrl(mock, transformed, errCtx); // host mock tabanına çevrilemediyse gerçek/yabancı adrese SIZMASIN
            return transformed;
        }
        return url;
    }
}

export default class Service extends AdapterHttpService {
    protected readonly mockHostPattern = /https:\/\/api\.n11\.com/g;
    protected readonly enforceMockableEndpoints = true; // C19: REST mock modunda yalnız N11_MOCKABLE_ENDPOINTS listesindeki uçlar
    private builder = new xml2js.Builder({ headless: true });
    private soap: N11SoapTransport;

    public static getInstance(integrationParameters: any): Service {
        return new Service(integrationParameters);
    }

    constructor(params: any) {
        super(KEY, params);
        this.soap = new N11SoapTransport(params);
    }

    protected authConfig(): AuthConfig {
        const s = this.params.integrationSettings?.settings || {};
        const appKey = String(s.APIKEY || s.apikey || s.appKey || s.AppKey || '').trim();
        const appSecret = String(s.APISECRET || s.apisecret || s.apiSecret || s.AppSecret || '').trim();
        return { headers: { 'appkey': appKey, 'appsecret': appSecret, 'Content-Type': 'application/json' } };
    }

    protected override baseUrlFor(_path: string): string {
        const mock = this.mockConfig();
        if (mock.enabled) return mock.baseUrl;
        return this.params.integrationSettings?.urls?.baseUrl || N11_DEFAULT_URLS.baseUrl;
    }

    /**
     * REST cephesi (bağlayıcılar `service.rest.*` çağırır): yanıtın `data` alanını döner. GET okuma (idempotent), POST/PUT yazma varsayılan;
     * sorgu amaçlı POST'lar `opts.idempotent:true` ile çağrılmalıdır.
     */
    public readonly rest = {
        get: async (endpoint: string, params: any = {}, opts?: { operation?: string }): Promise<any> => (await this.get(endpoint, params, opts)).data,
        post: async (endpoint: string, data: any = {}, opts?: { idempotent?: boolean; operation?: string }): Promise<any> => (await this.post(endpoint, data, opts)).data,
        put: async (endpoint: string, data: any = {}, opts?: { idempotent?: boolean; operation?: string }): Promise<any> => (await this.put(endpoint, data, opts)).data,
        /**
         * Kategori CDN'i: mock KAPALIYKEN cdnBaseUrl/baseUrl'e gider. [C19] mock AÇIKKEN diğer uçlarla AYNI kural: listedeyse mock tabanına
         * (mockserver `cdn/categories` sunar), değilse NOT_SUPPORTED; asla gerçek host.
         */
        getReal: async (endpoint: string, params: any = {}, opts?: { operation?: string }): Promise<any> => {
            let target = endpoint;
            if (!this.mockConfig().enabled) {
                const urls = this.params.integrationSettings?.urls || {};
                const base = urls.cdnBaseUrl || urls.baseUrl || N11_DEFAULT_URLS.baseUrl;
                target = `${base.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
            }
            return (await this.get(target, params, opts)).data;
        },
    };

    public getWsdlUrl(key: string): string {
        return this.params.integrationSettings?.urls?.[key] || (N11_DEFAULT_URLS as any)[key] || key;
    }

    /**
     * SOAP isteği (tabanın `post`'u üzerinden, `n11-soap` istemcisiyle).
     * @param urlKey integrationSettings.urls içindeki anahtar ya da varsayılan WSDL adı.
     * @param rootElementName gövde kök elemanı, ör. 'sch:GetCityListRequest'
     * @param opts.idempotent true => okuma (retry ağ/timeout/5xx/429'da); varsayılan false (yazma).
     */
    public async soapRequest(urlKey: string, rootElementName: string, payload: any = {}, opts?: { idempotent?: boolean }): Promise<any> {
        // [LIVE-RO] Canlı salt-okuma kipinde SOAP yazma operasyonu BAĞLANTI KURULMADAN reddedilir (ağ katmanı gövdeyi ayrıca denetler: ikinci kilit).
        if (config.liveReadonly.enabled && !N11_READ_OPERATIONS.includes(rootElementName.replace(/^[\w.-]+:/, ''))) {
            throw new IntegrationError('NOT_SUPPORTED', `Canlı salt-okuma kipi: N11 SOAP '${rootElementName}' operasyonu okuma allowlist'inde değil; istek ATILMADI.`, {
                integrationCode: SOAP_CODE, operation: `SOAP ${rootElementName}`, clientId: this.clientId, platformCode: 'LIVE_READONLY',
            });
        }
        const s = this.params.integrationSettings?.settings || {};
        // N11 her yükte kimlik nesnesi ister
        const bodyXml = this.builder.buildObject({ [rootElementName]: { auth: { appKey: s.APIKEY, appSecret: s.APISECRET }, ...payload } });
        const envelope = `
                <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas">
                   <soapenv:Header/>
                   <soapenv:Body>
                      ${bodyXml}
                   </soapenv:Body>
                </soapenv:Envelope>
            `;
        const operation = `SOAP ${rootElementName}`;
        const response = await this.soap.post<string>(this.getWsdlUrl(urlKey), envelope, {
            operation,
            idempotent: opts?.idempotent ?? false,
            headers: { 'Content-Type': 'text/xml;charset=UTF-8' },
        });
        return this.parseSoapResponse(response.data, operation);
    }

    private async parseSoapResponse(xmlString: string, operation: string): Promise<any> {
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        const result = await parser.parseStringPromise(xmlString);

        const body = result['soapenv:Envelope']?.['soapenv:Body'] || result['SOAP-ENV:Envelope']?.['SOAP-ENV:Body'];
        if (!body) return result;

        // Gövdenin ilk çocuğu asıl yanıt nesnesidir
        const responseData = body[Object.keys(body)[0]];

        // N11'e özgü hata biçimi. SOAP business fault (HTTP 200 ama işlem reddedildi) IntegrationError('VALIDATION') olarak fırlatılır
        // (ADR-0006 Karar 2; retry/breaker'ı etkilemez: ayrıştırma çağrı tamamlandıktan SONRA).
        if (responseData?.result && responseData.result.status === 'failure') {
            throw new IntegrationError('VALIDATION', responseData.result.errorMessage || 'N11 SOAP API hatası', {
                integrationCode: SOAP_CODE, operation, clientId: this.clientId,
            });
        }
        return responseData;
    }
}
