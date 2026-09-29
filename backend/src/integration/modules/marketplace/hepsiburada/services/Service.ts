import { AxiosResponse } from 'axios';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { readMockConfig, assertMockSafeUrl } from '@integration/modules/common/mock/MockMode';
import { getSetting } from '@integration/config/ConfigResolver';

// ADR-0006 Karar 1: p-limit/özel retry mantığı kaldırıldı; tüm HTTP çağrıları paylaşımlı
// ResilientHttpClient üzerinden geçer (retry/backoff/circuit breaker/timeout/AbortController/metrik).
// Hepsiburada için timeout ADR'de özel olarak 60sn (diğer adaptörlerin varsayılanı 30sn).
export class Service {
    private http: ResilientHttpClient;
    private clientId: string;

    constructor(private params: any) {
        this.clientId = params.clientId || "UnknownClient";
        this.http = new ResilientHttpClient('hepsiburada', this.clientId, {
            // HB_HTTP_TIMEOUT_MS: SADECE TEST/operasyonel ayar amaçlı; verilmezse ADR-0020 kataloğu (HB için 60sn).
            // [ADR-0020 Aşama A] Kaynak: integrationHttp.ts `resilience.timeoutMs` (hepsiburada=60000).
            timeoutMs: Number(process.env.HB_HTTP_TIMEOUT_MS) || getSetting<number>('resilience.timeoutMs', { integrationCode: 'hepsiburada' }),
            // [ADR-0020 Aşama A] Kaynak: integrationHttp.ts `resilience.maxConcurrent` (hepsiburada=5;
            // 1f: eşzamanlı bekleyen POST <=5).
            maxConcurrent: getSetting<number>('resilience.maxConcurrent', { integrationCode: 'hepsiburada' }),
            // [ADR-0020 Aşama A, K12] Kaynak: `resilience.ratePerMin` (hepsiburada=0 => "adaptörde tanımlı
            // değil/sınırsız" — RateLimiter 0/undefined'ı AYNI şekilde ele alır, davranış değişmez).
            ratePerMin: getSetting<number>('resilience.ratePerMin', { integrationCode: 'hepsiburada' }),
        });
    }

    private getTargetUrl(url: string): string {
        // [BACKLOG C19] Mock modu FAIL-CLOSED (bkz. common/mock/MockMode.ts). Bayraklar tek yerde okunur.
        // Not: Hepsiburada mock modunda zaten TÜM göreli yolları mock'a yönlendirir;
        // HEPSIBURADA_MOCKABLE_ENDPOINTS bu adaptörde (bilinçli olarak) UYGULANMAZ — bkz. BACKLOG C19 notu.
        const mock = readMockConfig('HEPSIBURADA', 'http://127.0.0.1:6015/hepsiburada');

        // If it's a full URL, return it as is (mock modunda yalnızca mock tabanı/loopback'e izin verilir)
        if (url.startsWith('http')) {
            assertMockSafeUrl(mock, url, { integrationCode: 'hepsiburada', clientId: this.clientId });
            return url;
        }

        // [K7 2026-09-28] Temel adresler YALNIZCA platform `Integrations.urls`'ten okunur. ÖNCEKİ davranış: tenant `settings.urls` ÖNCELİKLİYDİ
        // (tenant, kimlik bilgili isteği istediği host'a yönlendirebilirdi; ADR-0020 K7). Factory da tenant URL alanlarını zaten çıkarır.
        const urls = this.params.integrationSettings?.urls || {};
        const realBase = urls.BASEURL || 'https://mpop.hepsiburada.com';

        // ÖNCEKİ davranış: kategori endpoint'leri mock modundan bağımsız GERÇEK Hepsiburada'ya giderdi
        // (fail-open). Artık yalnızca mock KAPALIYKEN gerçeğe gider; mock AÇIKKEN mock tabanına
        // (mockserver `product/api/categories/...` sunar) yönlendirilir.
        if (!mock.enabled && url.includes('product/api/categories')) {
            return `${realBase.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
        }

        const isMockActive = mock.enabled;
        const mockBaseUrl = mock.baseUrl;

        if (isMockActive) {
            return `${mockBaseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
        }

        let base = realBase;
        if (url.includes('listings/')) {
            base = urls.LISTINGBASEURL || 'https://listing-external.hepsiburada.com';
        } else if (url.includes('settlements/')) {
            base = urls.ACCOUNTINGBASEURL || 'https://accounting-external.hepsiburada.com';
        } else if (url.includes('ticket-api/')) {
            base = urls.TICKETBASEURL || 'https://ticket-api.hepsiburada.com';
        }

        return `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
    }

    private getAuthConfig(extraHeaders?: any) {
        const s = this.params.integrationSettings.settings || {};
        const username = (s.USERNAME || s.username || s.APIKEY || s.apikey || "").trim();
        const password = (s.PASSWORD || s.password || s.APISECRET || s.apisecret || "").trim();
        return {
            auth: { username, password },
            headers: { 'User-Agent': 'entegrasyonik', 'Content-Type': 'application/json', ...extraHeaders },
        };
    }

    private async request(method: 'get' | 'post' | 'put' | 'delete', url: string, dataOrParams?: any, extraHeaders?: any, opts?: { idempotent?: boolean; operation?: string }): Promise<AxiosResponse> {
        const fullUrl = this.getTargetUrl(url);
        const config = this.getAuthConfig(extraHeaders);

        if (method === 'get') return this.http.get(fullUrl, dataOrParams, { headers: config.headers, auth: config.auth, ...opts });
        if (method === 'post') return this.http.post(fullUrl, dataOrParams, { headers: config.headers, auth: config.auth, ...opts });
        if (method === 'put') return this.http.put(fullUrl, dataOrParams, { headers: config.headers, auth: config.auth, ...opts });
        return this.http.delete(fullUrl, { headers: config.headers, auth: config.auth, ...opts });
    }

    /** GET => okuma (idempotent varsayılan true), ADR-0006: ağ/timeout/5xx/429'da retry edilir. */
    public async get(url: string, params?: any, headers?: any) { return this.request('get', url, params, headers, { idempotent: true }); }
    /** POST/PUT/DELETE => yazma varsayılan (idempotent:false), ADR-0006: yalnızca 429/ECONNREFUSED/DNS'de retry edilir. */
    public async post(url: string, data: any, headers?: any) { return this.request('post', url, data, headers, { idempotent: false }); }
    public async put(url: string, data: any, headers?: any) { return this.request('put', url, data, headers, { idempotent: false }); }
    public async delete(url: string, headers?: any) { return this.request('delete', url, undefined, headers, { idempotent: false }); }
}

export default Service;
