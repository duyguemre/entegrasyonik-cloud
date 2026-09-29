import { AxiosResponse } from 'axios';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { integrationCode } from '../constants';
import { readMockConfig, assertMockSafeUrl } from '@integration/modules/common/mock/MockMode';
import { getSetting } from '@integration/config/ConfigResolver';

// ADR-0006 Karar 1 (Aşama B3): `axios-rate-limit` + çıplak `axios` kaldırıldı; tüm HTTP çağrıları
// paylaşımlı ResilientHttpClient üzerinden geçer (retry/backoff/circuit breaker/timeout/
// AbortController/metrik). Önceki `rateLimit(axios.create(), { maxRequests: 5, perMilliseconds: 1000 })`
// davranışı `ratePerMin: 300` (5 istek/sn) ile korunmuştur.
// [ADR-0006 adım 1] ÖNCEKİ DAVRANIŞ (retry/timeout/circuit breaker YOK, hata generic Error'a
// sarılırdı, code/retryable kaybolurdu) artık YOK; bkz.
// tests/characterization/common/Bizimhesap.resilience.contract.test.ts.
export default class Service {
    private http: ResilientHttpClient;
    private baseUrl: string;
    private clientId: string;

    constructor(private params: any) {
        this.clientId = params.clientId || 'UnknownClient';
        this.http = new ResilientHttpClient(integrationCode, this.clientId, {
            // BIZIMHESAP_HTTP_TIMEOUT_MS: SADECE TEST/operasyonel ayar amaçlı; verilmezse ADR-0020 kataloğu (30sn).
            // [ADR-0020 Aşama A] Kaynak: integrationHttp.ts `resilience.timeoutMs` (bizimhesap=30000).
            timeoutMs: Number(process.env.BIZIMHESAP_HTTP_TIMEOUT_MS) || getSetting<number>('resilience.timeoutMs', { integrationCode: 'bizimhesap' }),
            // [ADR-0020 Aşama A] Kaynak: `resilience.ratePerMin` (bizimhesap=300). önceki
            // axios-rate-limit(5 istek/1000ms) değeri korunuyor.
            ratePerMin: getSetting<number>('resilience.ratePerMin', { integrationCode: 'bizimhesap' }),
            // [ADR-0020 Aşama A] Önceden HİÇ verilmiyordu (ResilientHttpClient dahili varsayılanı 10
            // kullanılıyordu); katalogdaki bizimhesap varsayılanı da 10 — davranış değişmez.
            maxConcurrent: getSetting<number>('resilience.maxConcurrent', { integrationCode: 'bizimhesap' }),
        });
        this.baseUrl = this.resolveBaseUrl();
    }

    private resolveBaseUrl(): string {
        const mock = readMockConfig('BIZIMHESAP', 'http://localhost:6015/bizimhesap');
        if (mock.enabled) {
            return mock.baseUrl;
        }
        return this.params.integrationSettings?.urls?.baseUrl || 'https://api.bizimhesap.com';
    }

    private getAuthHeaders() {
        const s = this.params.integrationSettings?.settings || {};
        const key = (s.key || s.APIKEY || s.apikey || '').trim();
        const token = (s.secret || s.APISECRET || s.token || '').trim();
        return { key, token, 'Content-Type': 'application/json' };
    }

    private resolveUrl(path: string): string {
        if (path.startsWith('http')) {
            // [BACKLOG C19] Mock AÇIKKEN mutlak URL yalnızca mock tabanı/loopback olabilir (fail-closed).
            assertMockSafeUrl(readMockConfig('BIZIMHESAP', 'http://localhost:6015/bizimhesap'), path, { integrationCode, clientId: this.clientId });
            return path;
        }
        return `${this.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
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
