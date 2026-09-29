import { AxiosResponse } from 'axios';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { IntegrationError, fromHttpError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';
import { readMockConfig, assertEndpointMockable, assertMockSafeUrl } from '@integration/modules/common/mock/MockMode';
import { getSetting } from '@integration/config/ConfigResolver';

// ADR-0006 Karar 1: p-limit/özel retry/backoff mantığı kaldırıldı; tüm HTTP çağrıları paylaşımlı
// ResilientHttpClient üzerinden geçer (retry/backoff/circuit breaker/timeout/AbortController/metrik).
// [ADR-0006 adım 1] ÖNCEKİ DAVRANIŞ (429'da manuel exponential backoff, 401'de sınırsız kendi kendine
// retry) artık YOK; bkz. tests/characterization/common/Pazarama.resilience.contract.test.ts.
//
// BULGU (1f): Pazarama'nın resmi rate limit/eşzamanlılık bilgisi doğrulanamadı (panel/PDF 403 döndü).
// maxConcurrent önceki pLimit(11) değeri korunmuştur; ratePerMin BİLİNMEDİĞİ için ayarlanmamıştır
// (limiter devre dışı, yalnızca eşzamanlılık/circuit breaker/timeout korumaları aktif). Canlıya
// geçmeden panel dokümanından teyit edilmeli (BACKLOG'a not düşülmüştür).
export default class Service {
    private clientId: string;
    private http: ResilientHttpClient;
    private accessToken: string | null = null;
    private tokenExpiresAt: number = 0;

    public static getInstance(integrationParameters: any): Service {
        return new Service(integrationParameters);
    }

    constructor(private params: any) {
        this.clientId = params.clientId || "UnknownClient";
        this.http = new ResilientHttpClient(integrationCode, this.clientId, {
            // PAZARAMA_HTTP_TIMEOUT_MS: SADECE TEST/operasyonel ayar amaçlı; verilmezse ADR-0020 kataloğu (30sn).
            // [ADR-0020 Aşama A] Kaynak: integrationHttp.ts `resilience.timeoutMs` (pazarama=30000).
            timeoutMs: Number(process.env.PAZARAMA_HTTP_TIMEOUT_MS) || getSetting<number>('resilience.timeoutMs', { integrationCode: 'pazarama' }),
            // [ADR-0020 Aşama A] Kaynak: `resilience.maxConcurrent` (pazarama=11). önceki pLimit(11) değeri korunuyor.
            maxConcurrent: getSetting<number>('resilience.maxConcurrent', { integrationCode: 'pazarama' }),
            // ratePerMin: BİLİNÇLİ OLARAK AYARLANMADI (bkz. yukarıdaki BULGU notu — resmi rate limit
            // doğrulanamadı; katalogda `_` yedeği 0/"tanımsız" olsa da bu ADR-0020 Aşama A görevi
            // BİLİNÇLİ OLARAK bu alanı kataloğa köprülemedi, ta ki resmi değer doğrulanana kadar).
        });
    }

    private getTokenUrl(): string {
        const mock = readMockConfig('PAZARAMA', 'http://localhost:6011/apigateway');
        const isMockActive = mock.enabled;
        const mockBaseUrl = mock.baseUrl;
        let tokenUrl = this.params.integrationSettings.urls?.tokenUrl || "https://isortagimgiris.pazarama.com/connect/token";

        if (isMockActive) {
            // Mock base URL genellikle /apigateway ile biter, token ise root altındadır
            const rootUrl = mockBaseUrl.split('/apigateway')[0];
            tokenUrl = `${rootUrl}/connect/token`;
        }
        return tokenUrl;
    }

    /**
     * OAuth2 Token Alır. Token isteği de paylaşımlı dayanıklılık katmanından geçer (ADR-0006 Karar 1:
     * "tüm dış çağrılar" istisnasız). Yan etkisiz/tekrarı güvenli olduğu için idempotent (okuma) sayılır.
     */
    public async getAccessToken(forceRefresh = false): Promise<string> {
        // Token geçerliyse (5 dk pay bırakarak) mevcut olanı dön
        if (!forceRefresh && this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
            return this.accessToken;
        }

        const { APIKEY, APISECRET } = this.params.integrationSettings.settings;
        const tokenUrl = this.getTokenUrl();

        try {
            const response = await this.http.post(
                tokenUrl,
                `grant_type=client_credentials&client_id=${APIKEY}&client_secret=${APISECRET}`,
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    idempotent: true,
                    operation: 'getAccessToken',
                },
            );

            this.accessToken = response.data.access_token;
            // expires_in saniye cinsinden döner
            this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);

            return this.accessToken!;
        } catch (error: any) {
            throw fromHttpError(error, {
                integrationCode, operation: 'getAccessToken', clientId: this.clientId, idempotent: true,
            });
        }
    }

    private async getAuthHeaders() {
        const token = await this.getAccessToken();
        return {
            'Authorization': `Bearer ${token}`,
            'User-Agent': `${this.clientId} - Entegrasyonik`,
            'Content-Type': 'application/json'
        };
    }

    private getTargetUrl(url: string): string {
        // [BACKLOG C19] Mock modu FAIL-CLOSED (bkz. common/mock/MockMode.ts): mock AÇIKKEN listede
        // olmayan endpoint gerçek adrese GİTMEZ, NOT_SUPPORTED fırlatılır.
        // NOT: getTokenUrl'in varsayılan mock tabanı (6011) bununkinden (3006) FARKLIDIR — mevcut
        // (tutarsız) davranış korunmuştur; BACKLOG'a not düşüldü.
        const mock = readMockConfig('PAZARAMA', 'http://localhost:3006/apigateway');
        const errCtx = { integrationCode, clientId: this.clientId };
        if (mock.enabled) assertEndpointMockable(mock, url, errCtx);
        const isMockActive = mock.enabled;
        const mockBaseUrl = mock.baseUrl;

        if (!url.startsWith('http')) {
            const base = isMockActive ? mockBaseUrl : this.params.integrationSettings.urls.baseUrl;
            return `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
        }

        if (isMockActive) {
            let transformedUrl = url.replace(/https:\/\/(isortagim|isortagimapi)\.pazarama\.com(\/api|\/apigateway)?/g, mockBaseUrl);
            // Host mock tabanına çevrilemediyse gerçek/yabancı adrese SIZMASIN.
            assertMockSafeUrl(mock, transformedUrl, errCtx);
            return transformedUrl;
        }

        return url;
    }

    private async request(method: 'get' | 'post' | 'put', url: string, dataOrParams?: any, opts?: { idempotent?: boolean; operation?: string }, authRetried = false): Promise<AxiosResponse> {
        const fullUrl = this.getTargetUrl(url);
        try {
            const headers = await this.getAuthHeaders();
            if (method === 'get') return await this.http.get(fullUrl, dataOrParams, { headers, ...opts });
            if (method === 'post') return await this.http.post(fullUrl, dataOrParams, { headers, ...opts });
            return await this.http.put(fullUrl, dataOrParams, { headers, ...opts });
        } catch (error: any) {
            // [ADR-0006 Karar 1] "auth hook": Pazarama 401 -> token'ı geçersiz say, BİR KEZ yeniden dene.
            // Bu davranış tek adaptöre özgü olduğu için (paylaşımlı ResilientHttpClient'ta jenerik bir
            // auth-hook arayüzü YOK, B1'de eklenmedi) burada adaptör seviyesinde uygulanmıştır (BULGU:
            // N11/Ideasoft gibi başka token-yenileme gerektiren adaptörler eklenirse ortak bir hook
            // noktası düşünülmeli).
            if (!authRetried && IntegrationError.isIntegrationError(error) && error.code === 'AUTH') {
                this.accessToken = null;
                await this.getAccessToken(true);
                return this.request(method, url, dataOrParams, opts, true);
            }
            throw error;
        }
    }

    /** GET => okuma (idempotent varsayılan true), ADR-0006: ağ/timeout/5xx/429'da retry edilir. */
    public async get<T = any>(url: string, params?: any, extra?: { idempotent?: boolean; operation?: string }) {
        return this.request('get', url, params, { idempotent: true, ...extra });
    }
    /** POST/PUT => yazma varsayılan (idempotent:false); adaptör bazı POST'ları okuma sayar (liste/sorgu
     *  uçları) ve `idempotent:true` ile çağırır (bkz. connector'lar, 1f: "Pazarama sipariş sorgusu"). */
    public async post<T = any>(url: string, data?: any, extra?: { idempotent?: boolean; operation?: string }) {
        return this.request('post', url, data, { idempotent: false, ...extra });
    }
    public async put<T = any>(url: string, data?: any, extra?: { idempotent?: boolean; operation?: string }) {
        return this.request('put', url, data, { idempotent: false, ...extra });
    }
}
