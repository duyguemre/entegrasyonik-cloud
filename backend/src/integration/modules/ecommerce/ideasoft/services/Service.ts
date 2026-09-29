import { AxiosResponse } from 'axios';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { integrationCode } from '../constants';
import { readMockConfig, assertMockSafeUrl } from '@integration/modules/common/mock/MockMode';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { isValidStoreName } from '@api/tenantSettingsGuard';
import { getSetting } from '@integration/config/ConfigResolver';

// ADR-0006 Karar 1 (Aşama B3): `axios-rate-limit` + çıplak `axios` kaldırıldı; tüm HTTP çağrıları
// paylaşımlı ResilientHttpClient üzerinden geçer (retry/backoff/circuit breaker/timeout/
// AbortController/metrik). Önceki `rateLimit(axios.create(), { maxRequests: 5, perMilliseconds: 1000 })`
// davranışı `ratePerMin: 300` (5 istek/sn) ile korunmuştur.
// [ADR-0006 adım 1] ÖNCEKİ DAVRANIŞ (retry/timeout/circuit breaker YOK, axios hatası ham haliyle
// fırlatılırdı) artık YOK; bkz. tests/characterization/common/Ideasoft.resilience.contract.test.ts.
//
// BULGU (BACKLOG C10 — bu görevde BİLİNÇLİ OLARAK DOKUNULMADI): gerçek modda token akışı kopuk.
// `IPlatform.init()` hiçbir üretim yolundan çağrılmıyor (`IntegrationFactory.getInstance` init()
// çağırmaz — bkz. backend/src/integration/modules/IntegrationFactory.ts:192-209), bu yüzden yeni bir
// `Service` örneğinde `currentToken` boş ('') başlar ve `SecurityService.refreshToken()` otomatik
// tetiklenmez; istekler boş `Authorization: Bearer ` ile gider (mevcut davranış, characterization
// testiyle sabitlenmiştir: tests/characterization/stubs/Ideasoft.brokenTokenFlow.characterization.test.ts).
// Pazarama'daki "401 -> token temizle -> 1 kez retry" auth-hook deseni BİLİNÇLİ OLARAK BURAYA
// TAŞINMADI: token zaten kurulmamışken (boş) 401'de "yeniden dene" eklemek "token yok" durumunu
// "token süresi geçti" gibi davranışsal olarak maskeler ve C10'un asıl kök nedenini (init() hiç
// çağrılmıyor) gizler. Asıl düzeltme (init() bağlanması + OAuth callback/refresh akışının üretimde
// gerçekten çalışır hale getirilmesi) ayrı ve daha büyük bir iştir (C10, bu görevin kapsamı DIŞINDA).
export default class Service {
    private clientId: string;
    private http: ResilientHttpClient;
    private baseUrl: string;
    private currentToken: string = '';

    constructor(private params: any) {
        this.clientId = params.clientId || "UnknownClient";
        this.http = new ResilientHttpClient(integrationCode, this.clientId, {
            // IDEASOFT_HTTP_TIMEOUT_MS: SADECE TEST/operasyonel ayar amaçlı; verilmezse ADR-0020 kataloğu (30sn).
            // [ADR-0020 Aşama A] Kaynak: integrationHttp.ts `resilience.timeoutMs` (ideasoft=30000).
            timeoutMs: Number(process.env.IDEASOFT_HTTP_TIMEOUT_MS) || getSetting<number>('resilience.timeoutMs', { integrationCode: 'ideasoft' }),
            // [ADR-0020 Aşama A] Kaynak: `resilience.ratePerMin` (ideasoft=300). önceki
            // axios-rate-limit(5 istek/1000ms) değeri korunuyor.
            ratePerMin: getSetting<number>('resilience.ratePerMin', { integrationCode: 'ideasoft' }),
            // [ADR-0020 Aşama A] Önceden HİÇ verilmiyordu (ResilientHttpClient dahili varsayılanı 10
            // kullanılıyordu); katalogdaki ideasoft varsayılanı da 10 — davranış değişmez, kaynağı görünür kılmak
            // için açıkça geçiriliyor.
            maxConcurrent: getSetting<number>('resilience.maxConcurrent', { integrationCode: 'ideasoft' }),
        });
        this.baseUrl = this.resolveBaseUrl();
    }

    private resolveBaseUrl(): string {
        const mock = readMockConfig('IDEASOFT', 'http://localhost:6015/ideasoft');
        if (mock.enabled) {
            return mock.baseUrl;
        }
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

    public getTokenUrl(): string {
        const mock = readMockConfig('IDEASOFT', 'http://localhost:6015/ideasoft');
        if (mock.enabled) {
            return `${mock.baseUrl}/oauth/authorize`;
        }
        return this.params.integrationSettings?.urls?.tokenUrl ||
            `${this.baseUrl}/oauth/authorize`;
    }

    public setCurrentToken(token: string): void {
        this.currentToken = token;
    }

    public getCurrentToken(): string {
        return this.currentToken;
    }

    private getAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.currentToken}`,
            'Content-Type': 'application/json'
        };
    }

    private resolveUrl(path: string): string {
        if (path.startsWith('http')) {
            // [BACKLOG C19] Mock AÇIKKEN mutlak URL yalnızca mock tabanı/loopback olabilir (fail-closed).
            assertMockSafeUrl(readMockConfig('IDEASOFT', 'http://localhost:6015/ideasoft'), path, { integrationCode, clientId: this.clientId });
            return path;
        }
        return `${this.baseUrl}/${path.replace(/^\//, '')}`;
    }

    /** GET => okuma (idempotent varsayılan true); ADR-0006: ağ/timeout/5xx/429'da retry edilir. */
    public async get<T = any>(path: string, params: any = {}, extra?: { idempotent?: boolean; operation?: string }): Promise<AxiosResponse<T>> {
        const url = this.resolveUrl(path);
        return this.http.get<T>(url, params, { headers: this.getAuthHeaders(), idempotent: true, ...extra });
    }

    /** POST => yazma varsayılan (idempotent:false); timeout/5xx'te otomatik retry YOK (UNKNOWN_OUTCOME). */
    public async post<T = any>(path: string, data: any = {}, extra?: { idempotent?: boolean; operation?: string }): Promise<AxiosResponse<T>> {
        const url = this.resolveUrl(path);
        return this.http.post<T>(url, data, { headers: this.getAuthHeaders(), idempotent: false, ...extra });
    }

    /** PUT => yazma varsayılan (idempotent:false); timeout/5xx'te otomatik retry YOK (UNKNOWN_OUTCOME). */
    public async put<T = any>(path: string, data: any = {}, extra?: { idempotent?: boolean; operation?: string }): Promise<AxiosResponse<T>> {
        const url = this.resolveUrl(path);
        return this.http.put<T>(url, data, { headers: this.getAuthHeaders(), idempotent: false, ...extra });
    }
}
