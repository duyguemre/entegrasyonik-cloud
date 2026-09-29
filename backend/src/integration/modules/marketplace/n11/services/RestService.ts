import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { readMockConfig, assertEndpointMockable } from '@integration/modules/common/mock/MockMode';

// ADR-0006 Karar 1: axios-rate-limit + kendi axios.create() örneği kaldırıldı; REST çağrıları
// Service.ts'nin oluşturduğu (SOAP ile PAYLAŞILAN) ResilientHttpClient örneği üzerinden geçer.
export default class RestService {
    constructor(private params: any, private http: ResilientHttpClient) { }

    private getAuthHeaders() {
        const s = this.params.integrationSettings?.settings || {};
        const appKey = (s.APIKEY || s.apikey || s.appKey || s.AppKey || "").trim();
        const appSecret = (s.APISECRET || s.apisecret || s.apiSecret || s.AppSecret || "").trim();

        return {
            'appkey': appKey,
            'appsecret': appSecret,
            'Content-Type': 'application/json'
        };
    }

    private mockCtx() {
        return { integrationCode: 'n11', clientId: this.params.clientId || 'UnknownClient' };
    }

    private getTargetUrl(endpoint: string): string {
        // [BACKLOG C19] Mock modu FAIL-CLOSED (bkz. common/mock/MockMode.ts): mock AÇIKKEN listede
        // olmayan endpoint (canlıda gözlenen: rest/delivery/v1/shipmentPackages) gerçek api.n11.com'a
        // GİTMEZ, NOT_SUPPORTED fırlatılır (OrderService bunu REST->SOAP yedek yolu için kullanır).
        const mock = readMockConfig('N11', 'http://localhost:6015/n11');
        if (mock.enabled) assertEndpointMockable(mock, endpoint, this.mockCtx());

        const urls = this.params.integrationSettings.urls || {};
        const baseUrl = urls.baseUrl || 'https://api.n11.com';

        const base = mock.enabled ? mock.baseUrl : baseUrl;

        return `${base.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
    }

    /** GET => okuma (idempotent varsayılan true), ADR-0006: ağ/timeout/5xx/429'da retry edilir. */
    public async get(endpoint: string, params: any = {}, opts?: { operation?: string }): Promise<any> {
        const url = this.getTargetUrl(endpoint);
        const response = await this.http.get(url, params, { headers: this.getAuthHeaders(), operation: opts?.operation });
        return response.data;
    }

    // Kategori CDN'i: mock KAPALIYKEN gerçek N11 CDN'e gider (cdnBaseUrl/baseUrl).
    // [BACKLOG C19] ÖNCEKİ davranış mock modunda da BİLİNÇLİ olarak mock'u atlayıp gerçek CDN'e giderdi
    // (fail-open). Artık mock AÇIKKEN diğer endpoint'lerle AYNI kural geçerlidir: listedeyse mock
    // tabanına (mockserver `cdn/categories` sunar), değilse NOT_SUPPORTED — asla gerçek host.
    public async getReal(endpoint: string, params: any = {}, opts?: { operation?: string }): Promise<any> {
        const mock = readMockConfig('N11', 'http://localhost:6015/n11');
        let url: string;
        if (mock.enabled) {
            assertEndpointMockable(mock, endpoint, this.mockCtx());
            url = `${mock.baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
        } else {
            const urls = this.params.integrationSettings?.urls || {};
            const baseUrl = urls.cdnBaseUrl || urls.baseUrl || 'https://api.n11.com';
            url = `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
        }
        const response = await this.http.get(url, params, { headers: this.getAuthHeaders(), operation: opts?.operation });
        return response.data;
    }

    /** POST => yazma varsayılan (idempotent:false); okuma amaçlı POST'lar `opts.idempotent:true` ile çağrılmalı. */
    public async post(endpoint: string, data: any = {}, opts?: { idempotent?: boolean; operation?: string }): Promise<any> {
        const url = this.getTargetUrl(endpoint);
        const response = await this.http.post(url, data, { headers: this.getAuthHeaders(), ...opts });
        return response.data;
    }

    public async put(endpoint: string, data: any = {}, opts?: { idempotent?: boolean; operation?: string }): Promise<any> {
        const url = this.getTargetUrl(endpoint);
        const response = await this.http.put(url, data, { headers: this.getAuthHeaders(), ...opts });
        return response.data;
    }
}
