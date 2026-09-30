// ADR-0033 Karar 1 (INT-01): F-08 ince adaptör HTTP tabanı. Tek düzey kalıtım: adaptör `Service extends AdapterHttpService`.
// Ortak olan burada (ResilientHttpClient kurulumu, mock/gerçek URL çözümleme, get/post/put/delete sarmalayıcıları, hata sarma);
// platforma özgü olan hook'larda (authConfig / baseUrlFor / mockHostPattern) kalır. Politika değerleri BUGÜNKÜ adaptör
// davranışıyla birebir: `<ENV>_HTTP_TIMEOUT_MS` (config) -> getSetting('resilience.*', { integrationCode }).
import type { AxiosResponse } from 'axios';
import { getConfig } from '@config';
import { getSetting } from '@integration/config/ConfigResolver';
import { ResilientHttpClient, type ResilientPolicyConfig, type ResilientRequestOptions } from '../http/ResilientHttpClient';
import { fromHttpError, type IntegrationError } from '../IntegrationError';
import { readMockConfig, assertMockSafeUrl, assertEndpointMockable, type MockConfig } from '../mock/MockMode';
import type { AdapterKey } from '../../adapterKeys';

export interface AdapterParams {
    clientId?: string | number;
    integrationSettings?: { settings?: Record<string, any>; urls?: { baseUrl?: string } & Record<string, any> } & Record<string, any>;
    [k: string]: any;
}

export interface AdapterOptions {
    /** İkinci istemci için ek (örn. 'soap' -> ResilientHttpClient kodu `n11-soap`); aynı taban, ayrı kova/breaker. */
    clientSuffix?: string;
    /** Taban politikanın üzerine yazılır (örn. groupRatePerMin). */
    policy?: Partial<ResilientPolicyConfig>;
}

/** Çağrı başına seçenekler. Okumada idempotent:true, yazmada false varsayılır. `headers` kimlik başlıklarının ÜZERİNE birleştirilir (ör. multipart Content-Type). */
export type CallOpts = Pick<Partial<ResilientRequestOptions>, 'idempotent' | 'operation' | 'group' | 'contract' | 'timeoutMs'> & { headers?: Record<string, string> };

export interface AuthConfig {
    headers?: Record<string, string>;
    auth?: { username: string; password: string };
}

export abstract class AdapterHttpService {
    protected readonly http: ResilientHttpClient;
    protected readonly clientId: string | number;
    /** Mock modunda gerçek host'lu mutlak URL'yi mock tabanına yeniden yazan tek regex (verilmezse mutlak URL mock-güvenli olmak zorunda). */
    protected readonly mockHostPattern?: RegExp;
    /** true => mock modunda yalnız `<PREFIX>_MOCKABLE_ENDPOINTS` listesindeki uçlar çağrılabilir (fail-closed, C19). Varsayılan false. */
    protected readonly enforceMockableEndpoints: boolean = false;

    constructor(protected readonly key: AdapterKey, protected readonly params: AdapterParams, opts: AdapterOptions = {}) {
        this.clientId = params.clientId || 'UnknownClient';
        const code = opts.clientSuffix ? `${key.code}-${opts.clientSuffix}` : key.code;
        this.http = new ResilientHttpClient(code, this.clientId, { ...this.basePolicy(), ...opts.policy });
    }

    private basePolicy(): ResilientPolicyConfig {
        const ctx = { integrationCode: this.key.code };
        const envTimeout = (getConfig().httpTimeoutMs as Record<string, number | undefined>)[this.key.code];
        const rate = getSetting<number>('resilience.ratePerMin', ctx);
        return {
            timeoutMs: envTimeout || getSetting<number>('resilience.timeoutMs', ctx),
            ratePerMin: rate > 0 ? rate : undefined, // 0 = adaptörde tanımlı değil (sınırsız)
            maxConcurrent: getSetting<number>('resilience.maxConcurrent', ctx),
        };
    }

    /** Kimlik doğrulama başlık/basic-auth üretimi (her istekte çağrılır; token yenilenebilir). */
    protected abstract authConfig(): Promise<AuthConfig> | AuthConfig;

    protected mockConfig(): MockConfig {
        return readMockConfig(this.key.mockPrefix, this.key.mockDefaultBase, this.key.mockDefaultEndpoints);
    }

    /** Göreli yolun taban adresi. Varsayılan: mock açıkken mock tabanı, değilse Integrations.urls.baseUrl || fallbackBaseUrl. */
    protected baseUrlFor(_path: string): string {
        const mock = this.mockConfig();
        if (mock.enabled) return mock.baseUrl;
        return this.params.integrationSettings?.urls?.baseUrl || this.key.fallbackBaseUrl || '';
    }

    /** Mock fail-closed doğrulamalı URL çözümleme. Mutlak URL aynen (mock güvenliyse) geçer; göreli yol tabana eklenir. */
    public resolveUrl(url: string): string {
        const mock = this.mockConfig();
        const ctx = { integrationCode: this.key.code, clientId: this.clientId };
        let target = url;
        if (/^https?:\/\//i.test(url)) {
            if (mock.enabled && this.mockHostPattern) target = url.replace(this.mockHostPattern, mock.baseUrl.replace(/\/$/, ''));
        } else {
            target = `${this.baseUrlFor(url).replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
        }
        if (mock.enabled) {
            if (this.enforceMockableEndpoints) assertEndpointMockable(mock, url, ctx);
            assertMockSafeUrl(mock, target, ctx);
        }
        return target;
    }

    protected async merged(method: 'get' | 'post' | 'put' | 'delete', opts?: CallOpts): Promise<Partial<ResilientRequestOptions>> {
        const auth = await this.authConfig();
        const { headers: extra, ...rest } = opts ?? {};
        const headers = auth.headers || extra ? { ...auth.headers, ...extra } : undefined;
        return { headers, auth: auth.auth, idempotent: method === 'get', ...rest };
    }

    public async get<T = any>(url: string, params?: any, opts?: CallOpts): Promise<AxiosResponse<T>> {
        const u = this.resolveUrl(url);
        return this.http.get<T>(u, params, await this.merged('get', opts));
    }
    public async post<T = any>(url: string, body: any = {}, opts?: CallOpts): Promise<AxiosResponse<T>> {
        const u = this.resolveUrl(url);
        return this.http.post<T>(u, body, await this.merged('post', opts));
    }
    public async put<T = any>(url: string, body: any = {}, opts?: CallOpts): Promise<AxiosResponse<T>> {
        const u = this.resolveUrl(url);
        return this.http.put<T>(u, body, await this.merged('put', opts));
    }
    public async delete<T = any>(url: string, opts?: CallOpts): Promise<AxiosResponse<T>> {
        const u = this.resolveUrl(url);
        return this.http.delete<T>(u, await this.merged('delete', opts));
    }

    /** Hatayı IntegrationError'a çevirip FIRLATIR; zaten IntegrationError ise aynen geçer (çift sarma yok). */
    protected fail(operation: string, err: unknown, idempotent = true): never {
        const e: IntegrationError = fromHttpError(err, { integrationCode: this.key.code, operation, clientId: this.clientId, idempotent });
        throw e;
    }
}
