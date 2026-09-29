import { AxiosResponse } from 'axios';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { readMockConfig, assertEndpointMockable, assertMockSafeUrl } from '@integration/modules/common/mock/MockMode';
import { trendyolGlobalRatePerMin } from '../limits';
import { getSetting } from '@integration/config/ConfigResolver';
// [ADR-0018 Karar 2a] Yalnız TİP: `import type` çalışma-zamanında hiçbir kod üretmez (döngüsel bağımlılık yok).
import type { ContractRef } from '@integration/compliance/ContractGuard';

/** `OrderConnector`/`ClaimConnector` çağırırken `contract` seçeneğini geçirebilsin diye ortak opsiyon tipi. */
type CallOpts = { idempotent?: boolean; operation?: string; timeoutMs?: number; contract?: ContractRef };

/**
 * [C22, 2026-09-28] Göreli URL'ler için genel fallback taban (spec §1: resmi PROD tabanı `apigw.trendyol.com/integration`).
 * ESKİ değer `https://api.trendyol.com/sapigw` eski gateway'di (host + yol öneki yanlış, bkz. BACKLOG C11). Yalnızca
 * `settings.urls.baseUrl` boşken ve URL göreliyken kullanılır; DB'de baseUrl varsa o önceliklidir.
 */
export const TRENDYOL_FALLBACK_BASE_URL = 'https://apigw.trendyol.com/integration';

// ADR-0006 Karar 1: p-limit/özel retry mantığı kaldırıldı; tüm HTTP çağrıları paylaşımlı
// ResilientHttpClient üzerinden geçer (retry/backoff/circuit breaker/timeout/AbortController/metrik).
// [ADR-0006 adım 1] Önceki davranış (POST/PUT dahil ağ hatasında retry) artık YOK; bkz.
// tests/characterization/stubs/Trendyol.errorSwallow.stub.test.ts ve
// tests/characterization/common/Trendyol.resilience.test.ts.
export default class Service {
    private clientId: string;
    private http: ResilientHttpClient;

    public static getInstance(integrationParameters: any): Service {
        return new Service(integrationParameters);
    }

    constructor(private params: any) {
        this.clientId = params.clientId || "UnknownClient";
        this.http = new ResilientHttpClient('trendyol', this.clientId, {
            // TY_HTTP_TIMEOUT_MS: SADECE TEST/operasyonel ayar amaçlı; verilmezse ADR-0020 kataloğu (varsayılan 30sn).
            // [ADR-0020 Aşama A] Kaynak: integrationHttp.ts `resilience.timeoutMs` (per-integration varsayılan
            // trendyol=30000, ENV YOK bu anahtar için — TY_HTTP_TIMEOUT_MS ayrı, adaptöre özgü test/operasyon
            // düğmesi olarak KORUNUR, ConfigResolver bunu okumaz).
            timeoutMs: Number(process.env.TY_HTTP_TIMEOUT_MS) || getSetting<number>('resilience.timeoutMs', { integrationCode: 'trendyol' }),
            // [ADR-0020 Aşama A] Kaynak: integrationHttp.ts `resilience.maxConcurrent` (trendyol=10).
            maxConcurrent: getSetting<number>('resilience.maxConcurrent', { integrationCode: 'trendyol' }),
            // [C22] ESKİ: 1800 (tüm resmi kademelerin çok üstünde; 14.09.2026'dan beri 429 fırtınası riski, spec R8).
            // Tek yerde sabit + env override: bkz. ../limits.ts ([ADR-0020 Aşama A] artık admin panelden
            // yönetilebilecek kataloğa köprülendi: `resilience.ratePerMin`, env override TY_RATE_PER_MIN korunur).
            // Sipariş çekme bu tavandan ayrıca (30/dk) sınırlanır: OrderConnector + limits.orderListPacer.
            ratePerMin: trendyolGlobalRatePerMin(),
        });
    }

    /**
     * Auth Config: Her istekte API KEY ve SECRET ekler.
     *
     * [Trendyol URL/UA düzeltmesi, 2026-09-27, docs/research/2026-09-27-api-verification.md,
     * BACKLOG.md C11] User-Agent ÖNCEDEN `${this.clientId} - Entegrasyonik` üretiyordu —
     * `clientId` Entegrasyonik'in kendi iç tenant kimliğidir, Trendyol'un satıcı ID'si
     * (SELLERID) DEĞİLDİR. Resmi format çok kaynaklı doğrulandı: "{sellerId} - {EntegratörAdı}";
     * yanlış/eksik User-Agent 403 ile reddedilir. `SELLERID` zaten `requiredSettings` (index.ts)
     * ile zorunlu kılındığı ve `IntegrationFactory.validateSettings` bu değer olmadan instance'ı
     * hiç kullanılabilir hale getirmediği için (bkz. IntegrationFactory.ts:73-82,204) bu satıra
     * SELLERID'siz ulaşılması normal akışta OLMAMALI. Yine de savunmacı: eski clientId
     * fallback'ına SESSİZCE DÜŞÜLMEZ (bu, hatayı gizler ve sessizce 403 riski taşırdı) —
     * bunun yerine ADR-0006'nın "sahte başarı yok" ilkesiyle tutarlı biçimde hızlı ve
     * anlaşılır bir hata fırlatılır (FinancialConnector.getFormattedUrl'daki AYNI desen).
     */
    private getAuthConfig() {
        const { APIKEY, APISECRET, SELLERID } = this.params.integrationSettings.settings;
        if (!SELLERID) {
            throw new Error('[Trendyol Service] User-Agent için SELLERID ayarı bulunamadı (requiredSettings ile zorunlu olmalıydı).');
        }
        return {
            auth: { username: APIKEY, password: APISECRET },
            headers: { 'User-Agent': `${SELLERID} - Entegrasyonik` }
        };
    }

    /**
     * URL Yönlendirici: Mock modu açıksa isteği yerel simülatöre yönlendirir.
     */
    private getTargetUrl(url: string): string {
        // [BACKLOG C19] Mock modu FAIL-CLOSED: bayraklar tek yerde okunur (common/mock/MockMode.ts);
        // mock AÇIKKEN listede olmayan endpoint gerçek adrese GİTMEZ, NOT_SUPPORTED fırlatılır.
        const mock = readMockConfig('TY', 'http://localhost:3005/integration');
        const errCtx = { integrationCode: 'trendyol', clientId: this.clientId };
        if (mock.enabled) assertEndpointMockable(mock, url, errCtx);
        const isMockActive = mock.enabled;
        const mockBaseUrl = mock.baseUrl;

        // Eğer URL tam bir HTTP adresi değilse başına base URL ekle (Geriye dönük uyumluluk)
        if (!url.startsWith('http')) {
            const base = (isMockActive ? mockBaseUrl : this.params.integrationSettings.urls?.baseUrl) || TRENDYOL_FALLBACK_BASE_URL;
            return `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
        }

        // Eğer zaten tam URL gelmişse ve mock aktifse, sadece domaini değiştir
        if (isMockActive) {
            // Trendyol hem api. hem de apigw. kullanabiliyor
            let transformedUrl = url.replace(/https:\/\/(api|apigw)\.trendyol\.com/g, mockBaseUrl);

            // Eğer mockBaseUrl ve orijinal path her ikisi de /integration içeriyorsa (örn: Trendyol Gateway),
            // çiftleşmeyi (integration/integration) engelle.
            if (transformedUrl.includes('/integration/integration')) {
                transformedUrl = transformedUrl.replace('/integration/integration', '/integration');
            }
            // Host mock tabanına çevrilemediyse (ör. farklı/yabancı host) gerçek adrese SIZMASIN.
            assertMockSafeUrl(mock, transformedUrl, errCtx);
            return transformedUrl;
        }

        return url;
    }

    private async request(method: 'get' | 'post' | 'put', url: string, dataOrParams?: any, opts?: CallOpts): Promise<AxiosResponse> {
        const fullUrl = this.getTargetUrl(url);
        const config = this.getAuthConfig();

        if (method === 'get') {
            return this.http.get(fullUrl, dataOrParams, { headers: config.headers, auth: config.auth, ...opts });
        }
        if (method === 'post') {
            return this.http.post(fullUrl, dataOrParams, { headers: config.headers, auth: config.auth, ...opts });
        }
        return this.http.put(fullUrl, dataOrParams, { headers: config.headers, auth: config.auth, ...opts });
    }

    /** GET => okuma (idempotent varsayılan true), ADR-0006: ağ/timeout/5xx/429'da retry edilir. */
    public async get(url: string, params?: any, opts?: CallOpts) {
        return this.request('get', url, params, { idempotent: true, ...opts });
    }
    /** POST/PUT => yazma varsayılan (idempotent:false), ADR-0006: yalnızca 429/ECONNREFUSED/DNS'de retry edilir. */
    public async post(url: string, data: any, opts?: CallOpts) {
        return this.request('post', url, data, { idempotent: false, ...opts });
    }
    public async put(url: string, data: any, opts?: CallOpts) {
        return this.request('put', url, data, { idempotent: false, ...opts });
    }
}
