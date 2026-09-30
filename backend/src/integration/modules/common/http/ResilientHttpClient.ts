// ADR-0006 Karar 1: tek paylaşımlı HTTP dayanıklılık katmanı.
// cockatiel tabanlı (retry + circuit breaker + timeout + bulkhead); 429 özel davranışı ve
// okuma/yazma retry ayrımı, UNKNOWN_OUTCOME sınıflandırması cockatiel'in native karşılamadığı
// kısımlar olduğu için bu dosyada ince bir sarmalayıcı ile eklenmiştir (ADR'nin izin verdiği yaklaşım).
import axios, { AxiosResponse } from 'axios';
import {
    retry, handleWhen, ExponentialBackoff, fullJitterGenerator,
    circuitBreaker, ConsecutiveBreaker, CircuitState,
    timeout, TimeoutStrategy,
    wrap, bulkhead,
    CircuitBreakerPolicy, BulkheadPolicy,
    IBackoff, IBackoffFactory, IHalfOpenAfterBackoffContext,
} from 'cockatiel';
import { IntegrationError, fromHttpError } from '../IntegrationError';
import { IntegrationCallMetrics } from './IntegrationCallMetrics';
import { RateLimiter, sleep } from './RateLimiter';
import { assertAllowedOutboundHost } from '../security/outboundHosts';
// [ADR-0018 Karar 2a] Yalnız TİP içe aktarımı: `import type` derleme sırasında ERİLİR (çalışma-zamanında
// hiçbir kod üretmez), bu yüzden ResilientHttpClient <-> ContractGuard <-> IntegrationDescriptorRegistry <->
// adaptör descriptor.ts <-> limits.ts <-> ResilientHttpClient DÖNGÜSEL bağımlılığı OLUŞMAZ. Gerçek modül
// çağrı ANINDA dinamik `import()` ile yüklenir (bkz. `observeCompliance`).
import type { ContractRef } from '@integration/compliance/ContractGuard';
// [F-06] Çağrı başına süre/durum/hata sınıfı log'u + platform/operasyon metrik sayaçları (tenant etiketi YOK) + bağlam taşıma.
import { eventLog } from '@platform/core/logger';
import { withContextPatch } from '@platform/core/context';
import { recordIntegrationOperationMetric, recordRateBucketMetric } from '@platform/runtime/metrics';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';
type Kind = 'read' | 'write';

export interface RetryPolicyConfig {
    maxAttempts?: number;      // varsayılan 4 (toplam 5 deneme)
    baseDelayMs?: number;      // varsayılan 1000
    maxDelayMs?: number;       // varsayılan 30000
}

export interface BreakerPolicyConfig {
    consecutiveFailures?: number; // varsayılan 5
    openMs?: number;              // varsayılan 30000
    maxOpenMs?: number;           // varsayılan 300000 (5 dk)
}

export interface ResilientPolicyConfig {
    timeoutMs?: number;       // varsayılan 30000
    maxConcurrent?: number;   // varsayılan 10
    ratePerMin?: number;      // varsayılan yok (sınırsız)
    /** [ADR-0030 X1] Servis grubu başına AYRI kova (dk başı istek). `group` etiketli çağrılar YALNIZ kendi grup kovasından geçer
     *  (adaptörün genel `ratePerMin` kovasını bekletmez/tüketmez => okuma seli yazmayı aç bırakmaz; toplam tavan = grup kovaları
     *  toplamı). Etiketsiz veya tablosu olmayan gruplu çağrı bugünkü genel kovaya düşer. Bir gruptaki 429 yalnız o grubu yavaşlatır. */
    groupRatePerMin?: Record<string, number>;
    /** [ADR-0022] Yanıt/istek gövdesi üst sınırı (bayt). Varsayılan 20 MB (`DEFAULT_MAX_CONTENT_BYTES`). */
    maxContentBytes?: number;
    retry?: RetryPolicyConfig;
    breaker?: BreakerPolicyConfig;
}

export interface ResilientRequestOptions {
    method: HttpMethod;
    url: string;
    data?: any;
    params?: any;
    headers?: Record<string, any>;
    auth?: { username: string; password: string };
    /** true => okuma (retry: ağ/timeout/5xx/429). false (varsayılan yazmalarda) => yalnızca 429 ve
     *  kesin-gönderilmedi bağlantı hatası retry edilir. Belirtilmezse method==='get' => true. */
    idempotent?: boolean;
    /** Metrik/log için işlem adı; verilmezse `${METHOD} ${url}` kullanılır. */
    operation?: string;
    /** Bu çağrıya özel timeout (adaptör varsayılanını ezer). */
    timeoutMs?: number;
    /** [ADR-0018 Karar 2a] Verilirse yanıt gövdesi, ayrı bir zod sözleşmesine karşı GÖZLEMLENİR (asenkron,
     *  hataya dayanıklı, yanıtı ASLA değiştirmez/geciktirmez/reddetmez — yalnız bulgu üretir). */
    contract?: ContractRef;
    /** [ADR-0030 X1] Servis grubu etiketi (örn. 'product_read'). Verilmezse eski davranış (tek genel kova). */
    group?: string;
}

function mapCircuitState(state: CircuitState): 'closed' | 'open' | 'half_open' {
    if (state === CircuitState.Open || state === CircuitState.Isolated) return 'open';
    if (state === CircuitState.HalfOpen) return 'half_open';
    return 'closed';
}

// --- Hata sınıflandırma yardımcıları ---
const DNS_OR_REFUSED_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

function isTimeoutLike(err: any): boolean {
    return !!err && (
        err.isTaskCancelledError === true ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ETIMEDOUT' ||
        err.name === 'AbortError' ||
        err.code === 'ERR_CANCELED'
    );
}
function isNetworkError(err: any): boolean {
    // [ADR-0022] Kendi sınıflandırdığımız IntegrationError (yönlendirme/boyut reddi) ağ hatası DEĞİLDİR: retry/breaker sayılmaz.
    return !!err && !err.response && !!err.code && !err.isBrokenCircuitError && !IntegrationError.isIntegrationError(err);
}
function httpStatusOf(err: any): number | undefined { return err?.response?.status; }
function is5xxOr408(err: any): boolean {
    const s = httpStatusOf(err);
    return s === 408 || (s !== undefined && s >= 500);
}
function is429(err: any): boolean { return httpStatusOf(err) === 429; }
function isDnsOrRefused(err: any): boolean { return !!err?.code && DNS_OR_REFUSED_CODES.has(err.code); }

/** Circuit breaker'ın SAYDIĞI hatalar: 5xx, timeout, ağ hatası, 408 (429 ve diğer 4xx hariç). */
function isBreakerCountable(err: any): boolean {
    if (is429(err)) return false;
    return is5xxOr408(err) || isTimeoutLike(err) || isNetworkError(err);
}

/** Okuma retry: ağ hatası, timeout, 5xx, 408 (429 bu katmanda ayrı ele alınır, breaker açıksa da retry yapılmaz). */
function isReadRetryable(err: any): boolean {
    if (err?.isBrokenCircuitError) return false;
    if (is429(err)) return false;
    return is5xxOr408(err) || isTimeoutLike(err) || isNetworkError(err);
}

/** Yazma retry: yalnızca kesin-gönderilmedi bağlantı hataları (ECONNREFUSED/DNS). 429 ayrı ele alınır. */
function isWriteRetryable(err: any): boolean {
    if (err?.isBrokenCircuitError) return false;
    if (is429(err)) return false;
    return isDnsOrRefused(err);
}

function parseRetryAfter(headerValue: any): number | undefined {
    if (headerValue === undefined || headerValue === null) return undefined;
    const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const asNumber = Number(raw);
    if (!Number.isNaN(asNumber) && String(raw).trim() !== '') return Math.max(0, asNumber * 1000);
    const asDate = new Date(raw);
    if (!Number.isNaN(asDate.getTime())) {
        const diff = asDate.getTime() - Date.now();
        return diff > 0 ? diff : 0;
    }
    return undefined;
}

/** Devre yarı-açık bekleme süresi: 30sn -> art arda başarısızlıkta 2x, üst sınır 5dk. Başarıyla kapanınca resetlenir (cockatiel attempt sayacı). */
class EscalatingHalfOpenBackoff implements IBackoffFactory<IHalfOpenAfterBackoffContext> {
    constructor(private readonly baseMs: number, private readonly maxMs: number) { }
    next(context: IHalfOpenAfterBackoffContext): IBackoff<IHalfOpenAfterBackoffContext> {
        const attempt = Math.max(1, context.attempt);
        const duration = Math.min(this.maxMs, this.baseMs * Math.pow(2, attempt - 1));
        const self = this;
        return {
            duration,
            next(ctx: IHalfOpenAfterBackoffContext) { return self.next(ctx); },
        };
    }
}

interface AdapterState {
    bulkhead: BulkheadPolicy;
    breakers: Map<Kind, CircuitBreakerPolicy>;
    limiter: RateLimiter;
    groupLimiters: Map<string, RateLimiter>;
    /** [BO B6] Devre kesicinin en son 'open' durumuna geçtiği an (epoch ms); yalnız gözlem. */
    lastOpenedAt?: number;
}

const MAX_429_RETRIES = 4;

/** [ADR-0022] Varsayılan yanıt/istek gövdesi tavanı (20 MB). */
export const DEFAULT_MAX_CONTENT_BYTES = 20 * 1024 * 1024;

const OVERSIZE_CODES = new Set(['ERR_FR_MAX_BODY_LENGTH_EXCEEDED']);
function isOversizeError(err: any): boolean {
    if (!err || err.response) return false;
    if (OVERSIZE_CODES.has(err.code)) return true;
    return err.code === 'ERR_BAD_RESPONSE' && /maxContentLength size of/i.test(String(err.message ?? ''));
}
/** Location başlığından yalnız HOST (sorgu/sır sızmasın). */
function safeLocationHost(loc: any): string {
    try { return new URL(String(loc)).hostname || '(göreli)'; } catch { return '(göreli)'; }
}

export class ResilientHttpClient {
    private static adapterStates = new Map<string, AdapterState>();
    /** SADECE TEST: retry backoff + breaker açık süresi oranını küçültür (varsayılan 1 = üretim davranışı
     *  değişmez). Adaptörler kendi retry/breaker sayısal DEĞERLERİNİ hardcode ettiği için (örn. Trendyol
     *  Service.ts), sözleşme testlerinde saniyelerce beklememek için kullanılır; oran/şekil (1/2/4/8, jitter,
     *  doubling) AYNI kalır, sadece gerçek zamanı ölçeklenir. */
    private static testDelayScale = 1;

    constructor(
        private readonly integrationCode: string,
        private readonly clientId: string | number,
        private readonly policyConfig: ResilientPolicyConfig = {},
    ) { }

    /** Testlerde temiz durumdan başlamak için (breaker/limiter/bulkhead belleği süreç-içidir). */
    public static resetAllState(): void {
        ResilientHttpClient.adapterStates.clear();
    }

    /**
     * [BO B6] Süreç-içi dayanıklılık durumunun ANLIK GÖRÜNTÜSÜ (salt okuma): entegrasyon başına devre kesici durumları (tenant SAYISI olarak),
     * hız sınırı bütçesi ve son açılma anı. Tenant kimliği/istek verisi dönmez. (`resilienceSnapshot.ts` Redis'e yazar.)
     */
    public static snapshotState(): Array<{ integrationCode: string; circuits: { closed: number; open: number; half_open: number }; rate: { limited: number; tenants: number; minRatio: number | null }; lastOpenedAt: number | null }> {
        const by = new Map<string, { circuits: { closed: number; open: number; half_open: number }; limited: number; tenants: number; minRatio: number | null; lastOpenedAt: number | null }>();
        for (const [key, st] of ResilientHttpClient.adapterStates) {
            const code = key.slice(key.indexOf('::') + 2);
            let e = by.get(code);
            if (!e) { e = { circuits: { closed: 0, open: 0, half_open: 0 }, limited: 0, tenants: 0, minRatio: null, lastOpenedAt: null }; by.set(code, e); }
            e.tenants++;
            for (const b of st.breakers.values()) e.circuits[mapCircuitState(b.state)]++;
            const base = st.limiter.getBaseRatePerMin();
            if (base) {
                const ratio = st.limiter.getEffectiveRatePerMin() / base;
                if (ratio < 1) e.limited++;
                e.minRatio = e.minRatio === null ? ratio : Math.min(e.minRatio, ratio);
            }
            if (st.lastOpenedAt && (e.lastOpenedAt === null || st.lastOpenedAt > e.lastOpenedAt)) e.lastOpenedAt = st.lastOpenedAt;
        }
        return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([integrationCode, e]) => ({
            integrationCode, circuits: e.circuits, rate: { limited: e.limited, tenants: e.tenants, minRatio: e.minRatio === null ? null : Math.round(e.minRatio * 100) / 100 }, lastOpenedAt: e.lastOpenedAt,
        }));
    }

    /** SADECE TEST: bkz. `testDelayScale`. `1` üretim/varsayılan davranıştır. */
    public static setTestDelayScale(scale: number): void {
        ResilientHttpClient.testDelayScale = scale > 0 ? scale : 1;
    }

    /** Adaptörlerin kendi (istemci dışı) bekleme aralıklarını test ölçeğiyle küçültmesi için; üretimde (scale=1) ms aynen döner. */
    public static scaleDelayMs(ms: number): number {
        return ms * ResilientHttpClient.testDelayScale;
    }

    private stateKey(): string { return `${this.clientId}::${this.integrationCode}`; }

    private getAdapterState(): AdapterState {
        const key = this.stateKey();
        let state = ResilientHttpClient.adapterStates.get(key);
        if (!state) {
            const maxConcurrent = this.policyConfig.maxConcurrent ?? 10;
            state = {
                bulkhead: bulkhead(maxConcurrent, maxConcurrent * 50),
                breakers: new Map(),
                limiter: new RateLimiter(this.policyConfig.ratePerMin),
                groupLimiters: new Map(),
            };
            ResilientHttpClient.adapterStates.set(key, state);
        }
        return state;
    }

    /** Grup için AYRI limiter (yalnız tabloda tanımlı gruplar); yoksa undefined => genel kova. */
    private getGroupLimiter(state: AdapterState, group?: string): RateLimiter | undefined {
        if (!group) return undefined;
        const rate = this.policyConfig.groupRatePerMin?.[group];
        if (!rate) return undefined;
        let l = state.groupLimiters.get(group);
        if (!l) { l = new RateLimiter(rate); state.groupLimiters.set(group, l); }
        return l;
    }

    private getBreaker(kind: Kind): CircuitBreakerPolicy {
        const state = this.getAdapterState();
        let breaker = state.breakers.get(kind);
        if (!breaker) {
            const consecutiveFailures = this.policyConfig.breaker?.consecutiveFailures ?? 5;
            const openMs = (this.policyConfig.breaker?.openMs ?? 30000) * ResilientHttpClient.testDelayScale;
            const maxOpenMs = (this.policyConfig.breaker?.maxOpenMs ?? 5 * 60 * 1000) * ResilientHttpClient.testDelayScale;
            breaker = circuitBreaker(handleWhen(isBreakerCountable), {
                breaker: new ConsecutiveBreaker(consecutiveFailures),
                halfOpenAfter: new EscalatingHalfOpenBackoff(openMs, maxOpenMs),
            });
            try { breaker.onStateChange((st) => { if (st === CircuitState.Open) state.lastOpenedAt = Date.now(); }); } catch { /* gözlem ana akışı etkilemez */ }
            state.breakers.set(kind, breaker);
        }
        return breaker;
    }

    private buildOperation(opts: ResilientRequestOptions): string {
        if (opts.operation) return opts.operation;
        try {
            const u = new URL(opts.url);
            return `${opts.method.toUpperCase()} ${u.pathname}`;
        } catch {
            return `${opts.method.toUpperCase()} ${String(opts.url).split('?')[0]}`;
        }
    }

    public async request<T = any>(opts: ResilientRequestOptions): Promise<AxiosResponse<T>> {
        const method = opts.method;
        const idempotent = opts.idempotent ?? (method === 'get');
        const operation = this.buildOperation(opts);
        const response = await this.executeCustom<AxiosResponse<T>>(
            { operation, idempotent, timeoutMs: opts.timeoutMs, url: opts.url, group: opts.group },
            (signal) => this.performAxios<T>(opts, method, signal),
        );
        this.observeCompliance(opts, operation, response);
        return response;
    }

    /**
     * [ADR-0006 adım 1] SOAP (N11) veya diğer XML/özel protokol adaptörleri için varyant: axios.get/post
     * varsaymadan, çağıranın enjekte ettiği KEYFİ bir `fn(signal)` isteğini aynı dayanıklılık zincirinden
     * (rate limiter -> bulkhead -> retry -> circuit breaker -> timeout/AbortController -> 429 döngüsü ->
     * metrik -> IntegrationError sınıflandırması) geçirir. `fn` axios/http/soap istemcisini kendisi
     * çağırır (örn. `axios.post(soapUrl, xmlBody, { signal, headers })`) ve ham yanıtı döner; hata
     * sınıflandırması için axios-benzeri `{ response: { status, headers, data } }` veya `{ code }`
     * şekilli bir hata fırlatması yeterlidir (SOAP fault'ları adaptör tarafında bu şekle çevrilmelidir).
     * NOT: Bu görevde YALNIZCA arayüz/altyapı hazırdır; N11 SOAP'ın buna taşınması ADR-0006 Aşama B2'dedir.
     */
    public executeCustom<T>(
        opts: { operation: string; idempotent?: boolean; timeoutMs?: number; url?: string; group?: string },
        fn: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
        // [F-06] Aynı correlation id korunur; log/metrik bağlamı bu çağrı için entegrasyon + işlemle zenginleşir.
        // (Pazaryerine correlation BAŞLIĞI eklenmez -- yalnız kendi servislerimize, bkz. platform/core/context.)
        const tenant = typeof this.clientId === 'number' ? this.clientId : Number(this.clientId);
        return withContextPatch({
            integrationCode: this.integrationCode,
            operation: opts.operation,
            source: `adapter-${this.integrationCode}`,
            ...(Number.isFinite(tenant) ? { tenantId: tenant } : {}),
        }, () => this.executeCustomInner<T>(opts, fn));
    }

    /** [F-06] Tek çağrının sonucunu (süre, durum, retry, hata sınıfı) loglar ve metrik sayaçlarına yazar. Asla fırlatmaz. */
    private observeOutcome(operation: string, kind: Kind, status: 'ok' | 'error', durationMs: number, retries: number, extra: { errorClass?: string; httpStatus?: number; circuitState?: string }): void {
        try {
            recordIntegrationOperationMetric({ integrationCode: this.integrationCode, operation, kind, status, errorClass: extra.errorClass, durationMs, retries });
            const log = eventLog(`adapter-${this.integrationCode}`, 'ResilientHttpClient');
            const fields = { operation, integrationCode: this.integrationCode, durationMs, retries, kind, httpStatus: extra.httpStatus, circuitState: extra.circuitState, errorClass: extra.errorClass };
            if (status === 'ok') log.debug('HTTP_CALL_OK', 'Dış çağrı başarılı', fields);
            else log.warn('HTTP_CALL_FAILED', 'Dış çağrı başarısız', fields);
        } catch { /* gözlem ana akışı ASLA etkilemez */ }
    }

    private async executeCustomInner<T>(
        opts: { operation: string; idempotent?: boolean; timeoutMs?: number; url?: string; group?: string },
        fn: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
        // [K7 2026-09-28] Tek giden-host koruması: hedef URL bilinen platform host'una (https, izin listesi) ait değilse istek
        // HİÇ başlamaz (rate limiter/bulkhead/retry/breaker'a girmez). `url` verilmezse (özel protokol çağıranı) denetim çağıranın
        // sorumluluğundadır; N11 SOAP `url`'yi geçirir.
        if (opts.url !== undefined) assertAllowedOutboundHost(this.integrationCode, opts.url, this.clientId, {}, opts.operation);
        const idempotent = opts.idempotent ?? false;
        const kind: Kind = idempotent ? 'read' : 'write';
        const operation = opts.operation;
        const timeoutMs = opts.timeoutMs ?? this.policyConfig.timeoutMs ?? 30000;

        const state = this.getAdapterState();
        const breaker = this.getBreaker(kind);
        const groupLimiter = this.getGroupLimiter(state, opts.group);
        const limiter = groupLimiter ?? state.limiter;
        const bucket = groupLimiter ? (opts.group as string) : 'default';

        const maxAttempts = this.policyConfig.retry?.maxAttempts ?? 4;
        const baseDelayMs = (this.policyConfig.retry?.baseDelayMs ?? 1000) * ResilientHttpClient.testDelayScale;
        const maxDelayMs = (this.policyConfig.retry?.maxDelayMs ?? 30000) * ResilientHttpClient.testDelayScale;
        const shouldRetry = idempotent ? isReadRetryable : isWriteRetryable;

        const start = Date.now();
        let attempts429 = 0;

        for (; ;) {
            const waitedMs = await limiter.throttle();
            if (waitedMs > 0) recordRateBucketMetric({ integrationCode: this.integrationCode, group: bucket, event: 'wait', waitMs: waitedMs });

            const retryPolicy = retry(handleWhen(shouldRetry), {
                maxAttempts,
                backoff: new ExponentialBackoff({
                    generator: fullJitterGenerator,
                    initialDelay: baseDelayMs,
                    maxDelay: maxDelayMs,
                    exponent: 2,
                }),
            });
            const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
            const core = wrap(state.bulkhead, retryPolicy, breaker, timeoutPolicy);

            let invocations = 0;
            try {
                const response = await core.execute((context) => {
                    invocations++;
                    return fn(context.signal);
                });
                limiter.onSuccess();
                void IntegrationCallMetrics.record({
                    integrationCode: this.integrationCode, operation, clientId: this.clientId,
                    status: 'ok', durationMs: Date.now() - start, retries: Math.max(0, invocations - 1),
                    circuitState: mapCircuitState(breaker.state),
                });
                this.observeOutcome(operation, kind, 'ok', Date.now() - start, Math.max(0, invocations - 1), { httpStatus: (response as any)?.status, circuitState: mapCircuitState(breaker.state) });
                return response;
            } catch (err: any) {
                if (is429(err) && !err?.isBrokenCircuitError) {
                    attempts429++;
                    const retryAfterMs = parseRetryAfter(err?.response?.headers?.['retry-after']);
                    limiter.onRateLimited();

                    if (retryAfterMs !== undefined && retryAfterMs <= 60000 && attempts429 <= MAX_429_RETRIES) {
                        await sleep(retryAfterMs);
                        continue;
                    }

                    recordRateBucketMetric({ integrationCode: this.integrationCode, group: bucket, event: 'reject' });
                    const rateLimitedErr = new IntegrationError('RATE_LIMITED', err?.response?.data?.message || 'Hız sınırı aşıldı (429)', {
                        integrationCode: this.integrationCode, operation, clientId: this.clientId,
                        httpStatus: 429, retryAfterMs,
                    });
                    void IntegrationCallMetrics.record({
                        integrationCode: this.integrationCode, operation, clientId: this.clientId,
                        status: 'error', durationMs: Date.now() - start, retries: Math.max(0, invocations - 1),
                        circuitState: mapCircuitState(breaker.state), code: 'RATE_LIMITED', httpStatus: 429,
                    });
                    this.observeOutcome(operation, kind, 'error', Date.now() - start, Math.max(0, invocations - 1), { errorClass: 'RATE_LIMITED', httpStatus: 429, circuitState: mapCircuitState(breaker.state) });
                    throw rateLimitedErr;
                }

                const circuitOpen = !!err?.isBrokenCircuitError;
                const integrationErr = fromHttpError(err, {
                    integrationCode: this.integrationCode, operation, clientId: this.clientId,
                    idempotent, circuitOpen,
                });
                void IntegrationCallMetrics.record({
                    integrationCode: this.integrationCode, operation, clientId: this.clientId,
                    status: 'error', durationMs: Date.now() - start, retries: Math.max(0, invocations - 1),
                    circuitState: mapCircuitState(breaker.state), code: integrationErr.code, httpStatus: integrationErr.httpStatus,
                });
                this.observeOutcome(operation, kind, 'error', Date.now() - start, Math.max(0, invocations - 1), { errorClass: integrationErr.code, httpStatus: integrationErr.httpStatus, circuitState: mapCircuitState(breaker.state) });
                throw integrationErr;
            }
        }
    }

    private async performAxios<T>(opts: ResilientRequestOptions, method: HttpMethod, signal: AbortSignal): Promise<AxiosResponse<T>> {
        const maxBytes = this.policyConfig.maxContentBytes ?? DEFAULT_MAX_CONTENT_BYTES;
        const config: any = {
            headers: opts.headers,
            auth: opts.auth,
            signal,
            // [ADR-0022] Yönlendirme TAKİP EDİLMEZ (kimlik başlıklı isteğin izinsiz host'a taşınmasını önler) ve gövde tavanı.
            maxRedirects: 0,
            maxContentLength: maxBytes,
            maxBodyLength: maxBytes,
        };
        try {
            if (method === 'get' || method === 'delete') {
                config.params = opts.params;
                return await (method === 'get' ? axios.get(opts.url, config) : axios.delete(opts.url, config));
            }
            if (method === 'post') return await axios.post(opts.url, opts.data, config);
            if (method === 'put') return await axios.put(opts.url, opts.data, config);
            return await axios.patch(opts.url, opts.data, config);
        } catch (err: any) {
            const status: number | undefined = err?.response?.status;
            const ctx = { integrationCode: this.integrationCode, operation: this.buildOperation(opts), clientId: this.clientId };
            if (status !== undefined && status >= 300 && status < 400) {
                throw new IntegrationError('VALIDATION',
                    `Yönlendirme reddedildi (HTTP ${status} -> ${safeLocationHost(err.response?.headers?.location)}); ADR-0022: yönlendirme takip edilmez.`,
                    { ...ctx, httpStatus: status });
            }
            if (isOversizeError(err)) {
                throw new IntegrationError('VALIDATION', `Gövde boyut tavanı (${maxBytes} bayt) aşıldı; ADR-0022.`, ctx);
            }
            throw err;
        }
    }

    /**
     * [ADR-0018 Karar 2a] Pasif sözleşme bekçisi kancası: yanıt başlıkları (`Deprecation`/`Sunset`/`Warning`)
     * ve (verildiyse) `contract` seçeneği GÖZLEMLENİR. KESİN KURAL: bu metot yanıtı ASLA değiştirmez, geciktirmez
     * veya fırlatmaz — `ContractGuard` DİNAMİK içe aktarılır (döngüsel bağımlılık önlenir) ve kendi içinde
     * `Promise.resolve().then(...)` ile ERTELENMİŞ olarak çalışır; buradaki `void` çağrısı ana akışı beklemez.
     * `CONTRACT_GUARD=off` ile tamamen kapatılabilir (ADR-0018 Karar 4 "Geri alma").
     */
    private observeCompliance<T>(opts: ResilientRequestOptions, operation: string, response: AxiosResponse<T>): void {
        if (process.env.CONTRACT_GUARD === 'off') return;
        const tenantId = typeof this.clientId === 'number' ? this.clientId : Number(this.clientId);
        const tenantIdHint = Number.isFinite(tenantId) ? tenantId : undefined;
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
        void Promise.resolve(require('@integration/compliance/ContractGuard') as typeof import('@integration/compliance/ContractGuard')).then((guard) => {
            guard.observeResponseHeaders(this.integrationCode, tenantIdHint, operation, response.headers as any);
            if (opts.contract) guard.observeContract(opts.contract, this.integrationCode, tenantIdHint, response.data);
        }).catch(() => { /* bekçi hiçbir koşulda iş akışını bozmaz */ });
    }

    public get<T = any>(url: string, params?: any, extra?: Partial<ResilientRequestOptions>) {
        return this.request<T>({ method: 'get', url, params, ...extra });
    }
    public post<T = any>(url: string, data?: any, extra?: Partial<ResilientRequestOptions>) {
        return this.request<T>({ method: 'post', url, data, ...extra });
    }
    public put<T = any>(url: string, data?: any, extra?: Partial<ResilientRequestOptions>) {
        return this.request<T>({ method: 'put', url, data, ...extra });
    }
    public delete<T = any>(url: string, extra?: Partial<ResilientRequestOptions>) {
        return this.request<T>({ method: 'delete', url, ...extra });
    }
}
