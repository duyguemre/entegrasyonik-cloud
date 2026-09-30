import { ADAPTER_KEYS } from '@integration/modules/adapterKeys';
import { AdapterHttpService, type AuthConfig, type CallOpts } from '@integration/modules/common/adapter/AdapterHttpService';
import { integrationCode } from '../constants';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { isValidStoreName } from '@platform/core/security/tenantSettingsGuard';

// ADR-0033 INT-05 (adım 3): Ideasoft Service ortak `AdapterHttpService` tabanına geçti. Ortak olan (ResilientHttpClient kurulumu,
// mock fail-closed URL çözümleme, get/post/put/delete) tabanda; burada yalnız platforma özgü kısım kalır: mağaza (`storeName`)
// host şablonu, Bearer başlığı, tembel token alımı + 401'de bir kez yenile-tekrar, OAuth token uç noktası için form POST.
// Politika değerleri birebir korunur: timeout (IDEASOFT_HTTP_TIMEOUT_MS || ADR-0020 kataloğu 30sn), ratePerMin 300, maxConcurrent 10;
// okuma idempotent:true, yazma idempotent:false (timeout/5xx'te otomatik retry YOK => UNKNOWN_OUTCOME).
//
// [C10 / ADR-0022] Token akışı: `Service` çıplak kullanıldığında (tokenProvider bağlı değil) ESKİ ham davranış korunur
// (tests/characterization/stubs/Ideasoft.brokenTokenFlow.characterization.test.ts). `Ideasoft` sınıfı ise
// `setTokenProvider(SecurityService)` ile bağlar: istekler token'ı TEMBEL alır/yeniler, tenant başına single-flight
// (OAuthTokenCache), süre dolmadan skew payıyla, 401'de bir kez yenile-tekrar. Token yoksa boş Bearer gönderilmez, AUTH
// IntegrationError fırlar. Mock modunda sağlayıcı devre dışıdır.
const KEY = ADAPTER_KEYS.find(k => k.code === 'ideasoft')!;

export default class Service extends AdapterHttpService {
    /** [C10c] mock AÇIKKEN yalnız mock uç listesindeki uçlar (kod içi varsayılan adapterKeys ∪ IDEASOFT_MOCKABLE_ENDPOINTS) çağrılabilir. */
    protected readonly enforceMockableEndpoints = true;
    private baseUrl: string;
    private currentToken: string = '';
    /** [C10] SecurityService bağlanınca istekler token'ı tembel (lazy) alır/yeniler; bağlı değilse eski (ham) davranış. */
    private tokenProvider?: { ensureToken(force?: boolean): Promise<string> };

    constructor(params: any) {
        super(KEY, params);
        this.baseUrl = this.resolveBaseUrl();
    }

    private resolveBaseUrl(): string {
        const mock = this.mockConfig();
        if (mock.enabled) return mock.baseUrl;
        const storeName = this.params.integrationSettings?.settings?.storeName || '';
        // [K7 2026-09-28] storeName host şablonuna gömülür: yalnızca tek DNS etiketi (aksi halde `evil.example/#` gibi bir değer host'u değiştirirdi).
        if (storeName !== '' && !isValidStoreName(storeName)) {
            throw new IntegrationError('VALIDATION', 'Ideasoft storeName geçersiz (yalnızca harf/rakam/tire içeren tek bir alt alan adı olmalı).', {
                integrationCode, operation: 'resolveBaseUrl', clientId: this.clientId,
            });
        }
        return (this.params.integrationSettings?.urls?.baseUrl || 'https://<STORENAME>.ideasoft.com.tr')
            .replace('<STORENAME>', storeName);
    }

    protected baseUrlFor(_path: string): string {
        const mock = this.mockConfig();
        return mock.enabled ? mock.baseUrl : this.baseUrl;
    }

    public getTokenUrl(): string {
        const mock = this.mockConfig();
        if (mock.enabled) return `${mock.baseUrl}/oauth/authorize`;
        return this.params.integrationSettings?.urls?.tokenUrl || `${this.baseUrl}/oauth/authorize`;
    }

    public setTokenProvider(p: { ensureToken(force?: boolean): Promise<string> }): void {
        this.tokenProvider = p;
    }

    /** Mock modunda (yerel mock sunucu) OAuth yoktur; sağlayıcı yalnızca gerçek modda devrededir. */
    private authActive(): boolean {
        return !!this.tokenProvider && !this.mockConfig().enabled;
    }

    /** İstek öncesi token'ı garanti et; 401'de token'ı zorla yenileyip İSTEĞİ BİR KEZ tekrarla (401 = işlenmedi, yazmada da güvenli). */
    private async withAuth<T>(call: () => Promise<T>): Promise<T> {
        if (!this.authActive()) return call();
        await this.tokenProvider!.ensureToken();
        try {
            return await call();
        } catch (err: any) {
            if (IntegrationError.isIntegrationError(err) && err.code === 'AUTH' && err.httpStatus === 401) {
                await this.tokenProvider!.ensureToken(true);
                return call();
            }
            throw err;
        }
    }

    /** OAuth token uç noktası için: Bearer YOK, 401-yenile döngüsü YOK, gövde application/x-www-form-urlencoded. */
    public async postForm<T = any>(url: string, form: string, extra?: { operation?: string }) {
        const target = this.resolveUrl(url);
        return this.http.post<T>(target, form, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            idempotent: false, ...extra,
        });
    }

    public setCurrentToken(token: string): void {
        this.currentToken = token;
    }

    public getCurrentToken(): string {
        return this.currentToken;
    }

    protected authConfig(): AuthConfig {
        return { headers: { Authorization: `Bearer ${this.currentToken}`, 'Content-Type': 'application/json' } };
    }

    /** GET => okuma (idempotent varsayılan true); ADR-0006: ağ/timeout/5xx/429'da retry edilir. */
    public override async get<T = any>(path: string, params: any = {}, extra?: CallOpts) {
        return this.withAuth(() => super.get<T>(path, params, extra));
    }

    /** POST => yazma varsayılan (idempotent:false); timeout/5xx'te otomatik retry YOK (UNKNOWN_OUTCOME). */
    public override async post<T = any>(path: string, data: any = {}, extra?: CallOpts) {
        return this.withAuth(() => super.post<T>(path, data, extra));
    }

    /** PUT => yazma varsayılan (idempotent:false); timeout/5xx'te otomatik retry YOK (UNKNOWN_OUTCOME). */
    public override async put<T = any>(path: string, data: any = {}, extra?: CallOpts) {
        return this.withAuth(() => super.put<T>(path, data, extra));
    }

    public override async delete<T = any>(path: string, extra?: CallOpts) {
        return this.withAuth(() => super.delete<T>(path, extra));
    }
}
