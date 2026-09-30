import type { AxiosResponse } from 'axios';
import { ADAPTER_KEYS } from '@integration/modules/adapterKeys';
import { AdapterHttpService, type AuthConfig, type CallOpts } from '@integration/modules/common/adapter/AdapterHttpService';
import { OAuthTokenCache } from '@integration/modules/common/adapter/OAuthTokenCache';
import { IntegrationError, fromHttpError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';

// ADR-0033 INT-05: Pazarama Service, ortak `AdapterHttpService` + `OAuthTokenCache` tabanına geçti (ResilientHttpClient kurulumu,
// mock/gerçek URL çözümleme ve get/post/put/delete sarmalayıcıları tabandan; token önbelleği single-flight). Davranış karakterizasyonla
// birebir (tests/characterization/common/Pazarama.service.characterization.test.ts + MockMode.failOpen + Pazarama.resilience.contract):
//   - ADR-0006/0020: timeout PAZARAMA_HTTP_TIMEOUT_MS || katalog (30sn), maxConcurrent 11; `ratePerMin` BİLİNÇLİ ayarlanmamış (resmi limit
//     doğrulanamadı, panel/PDF 403; katalogda 0 = sınırsız) — canlıya geçmeden panel dokümanından teyit edilmeli.
//   - okuma idempotent:true; POST/PUT idempotent:false (5xx/timeout'ta retry YOK => UNKNOWN_OUTCOME); sorgu amaçlı POST'lar çağıranda
//     `idempotent:true` ile işaretlenir (connector'lar).
//   - [BACKLOG C19] mock AÇIKKEN yalnız PAZARAMA_MOCKABLE_ENDPOINTS listesindeki uçlar çağrılabilir (enforceMockableEndpoints) ve mutlak
//     Pazarama adresleri mock tabanına çevrilir; çevrilemeyen yabancı host fail-closed.
// BİLİNÇLİ DÜZELTMELER (INT-05): (1) token istek gövdesi URLSearchParams ile KODLANIR (ham birleştirme `&`/`=` içeren sırrı bozuyordu);
// (2) eşzamanlı çağrılar TEK token isteği paylaşır (single-flight); (3) token ucunun varsayılan mock portu (6011) ADAPTER_KEYS'teki
// tek değere (3006) bağlandı.
// Platforma özgü kalan: OAuth2 client_credentials token alımı, Bearer+User-Agent başlığı ve 401 -> token yenile -> BİR KEZ tekrar ("auth hook";
// ortak tabanda jenerik hook yok, adaptör seviyesinde kalır).
const KEY = ADAPTER_KEYS.find(k => k.code === 'pazarama')!;
const DEFAULT_TOKEN_URL = 'https://isortagimgiris.pazarama.com/connect/token';

export default class Service extends AdapterHttpService {
    protected readonly mockHostPattern = /https:\/\/(isortagim|isortagimapi)\.pazarama\.com(\/api|\/apigateway)?/g;
    protected readonly enforceMockableEndpoints = true;
    private readonly tokens = new OAuthTokenCache(() => this.fetchToken());

    public static getInstance(integrationParameters: any): Service {
        return new Service(integrationParameters);
    }

    constructor(params: any) {
        super(KEY, params);
    }

    private tokenUrl(): string {
        const mock = this.mockConfig();
        if (mock.enabled) {
            // Mock base URL genellikle /apigateway ile biter, token ise root altındadır
            return `${mock.baseUrl.split('/apigateway')[0]}/connect/token`;
        }
        return this.params.integrationSettings?.urls?.tokenUrl || DEFAULT_TOKEN_URL;
    }

    /**
     * OAuth2 token alır (OAuthTokenCache'in getirici işlevi). Token isteği de paylaşımlı dayanıklılık katmanından geçer (ADR-0006 Karar 1:
     * "tüm dış çağrılar" istisnasız); yan etkisiz/tekrarı güvenli olduğu için idempotent (okuma) sayılır.
     */
    private async fetchToken(): Promise<{ token: string; expiresInSec: number }> {
        const { APIKEY, APISECRET } = this.params.integrationSettings?.settings || {};
        try {
            const response = await this.http.post(
                this.tokenUrl(),
                new URLSearchParams({ grant_type: 'client_credentials', client_id: String(APIKEY ?? ''), client_secret: String(APISECRET ?? '') }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    idempotent: true,
                    operation: 'getAccessToken',
                },
            );
            const token = response.data?.access_token;
            if (!token) {
                throw new IntegrationError('AUTH', 'Pazarama token yanıtı access_token içermiyor.', {
                    integrationCode, operation: 'getAccessToken', clientId: this.clientId, platformCode: 'TOKEN_RESPONSE_INVALID',
                });
            }
            const expiresIn = Number(response.data?.expires_in);
            return { token, expiresInSec: Number.isFinite(expiresIn) ? expiresIn : 0 };
        } catch (error: any) {
            throw fromHttpError(error, {
                integrationCode, operation: 'getAccessToken', clientId: this.clientId, idempotent: true,
            });
        }
    }

    /** Geçerli token'ı döner (süre sonuna 5 dk kala yeniler); `forceRefresh` önbelleği atlar. Eşzamanlı çağrılar tek istek paylaşır. */
    public async getAccessToken(forceRefresh = false): Promise<string> {
        return this.tokens.get(forceRefresh);
    }

    protected async authConfig(): Promise<AuthConfig> {
        const token = await this.tokens.get();
        return {
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': `${this.clientId} - Entegrasyonik`,
                'Content-Type': 'application/json',
            },
        };
    }

    // [ADR-0006 Karar 1] "auth hook": Pazarama 401/403 (AUTH) -> token'ı geçersiz say, BİR KEZ yeniden dene. Paylaşımlı
    // ResilientHttpClient'ta/tabanda jenerik bir auth-hook arayüzü YOK; bu davranış burada adaptör seviyesinde uygulanır.
    private async withAuthRetry<T>(call: () => Promise<T>, authRetried = false): Promise<T> {
        try {
            return await call();
        } catch (error: any) {
            if (!authRetried && IntegrationError.isIntegrationError(error) && error.code === 'AUTH') {
                this.tokens.invalidate();
                await this.tokens.get(true);
                return this.withAuthRetry(call, true);
            }
            throw error;
        }
    }

    /** GET => okuma (idempotent varsayılan true), ADR-0006: ağ/timeout/5xx/429'da retry edilir. */
    public override async get<T = any>(url: string, params?: any, opts?: CallOpts): Promise<AxiosResponse<T>> {
        return this.withAuthRetry(() => super.get<T>(url, params, opts));
    }
    /** POST/PUT => yazma varsayılan (idempotent:false); adaptör bazı POST'ları okuma sayar (liste/sorgu uçları) ve `idempotent:true` ile çağırır. */
    public override async post<T = any>(url: string, data?: any, opts?: CallOpts): Promise<AxiosResponse<T>> {
        return this.withAuthRetry(() => super.post<T>(url, data, opts));
    }
    public override async put<T = any>(url: string, data?: any, opts?: CallOpts): Promise<AxiosResponse<T>> {
        return this.withAuthRetry(() => super.put<T>(url, data, opts));
    }
    public override async delete<T = any>(url: string, opts?: CallOpts): Promise<AxiosResponse<T>> {
        return this.withAuthRetry(() => super.delete<T>(url, opts));
    }
}
