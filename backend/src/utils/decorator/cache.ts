import NodeCache from 'node-cache';
import { createHash } from 'crypto';
import { eventLog } from '@platform/core/logger';

// ADR-0002 adım 3-5 (faz4-int-wp3, F-05): zorunlu kapsamlı (`scope`) @Cache.
//  - tenant kapsamı: anahtar `t:<tenantId>:<integrationKey>:<family>:<argHash>`; tenant kimliği yoksa cache ATLANIR
//    (fail-closed: metot yine çalışır, ASLA paylaşılan anahtar üretilmez).
//  - global kapsam: `g:<integrationKey>:<family>:<argHash>`; yalnız tenant'tan bağımsız pazaryeri katalog verisi.
//  - has()/zarf semantiği (falsy sonuç doğru cache'lenir), tekil-uçuş (single-flight), TTL jitter, LRU sınırı,
//    aile bazında sayaçlar, invalidation API'si.

export const nodeCache = new NodeCache({ stdTTL: 300 }); // yalnız depo; kayıtlar decorator TTL'iyle yazılır

// ---------------------------------------------------------------- tipler

/** TTL birimi tip düzeyinde açıktır: `'30s' | '10m' | '12h'`. */
export type CacheDuration = `${number}${'s' | 'm' | 'h'}`;
export type CacheScope = 'tenant' | 'global';

type TtlSpec =
    | { ttl: CacheDuration; ttlSeconds?: never }
    | { ttlSeconds: number; ttl?: never };

export type CacheOptions = TtlSpec & {
    /** Zorunlu, varsayılanı yok. */
    scope: CacheScope;
    /** Anahtar ailesi öneki (metrik/invalidation birimi). Global'de pazaryerine özgü olmalı (ör. 'trendyol-catalog'). */
    context: string;
    /** Yalnız ARGÜMAN kısmını daraltmak için; tenant/entegrasyon öneki ezilemez. */
    key?: (that: any, args: any[]) => string;
    /** null/undefined sonuç için negatif cache TTL'i (yoksa null/undefined cache'lenmez). */
    negativeTtl?: CacheDuration | number;
    /** Boş dizi sonucu için TTL üst sınırı (sn); varsayılan min(ttl, 30). 0 => boş dizi cache'lenmez. */
    emptyTtlSeconds?: number;
};

export const TENANT_MAX_TTL_SECONDS = 600;      // ADR-0002 Karar 7
export const GLOBAL_MAX_TTL_SECONDS = 24 * 3600;
const DEFAULT_EMPTY_TTL_SECONDS = 30;
const DEFAULT_JITTER = 0.1; // TTL'i yalnız AŞAĞI oynatır (üst sınır aşılmaz)
const INVALID_TENANTS = new Set(['', 'undefined', 'null', 'UnknownClient']);

export function durationToSeconds(d: CacheDuration | number): number {
    if (typeof d === 'number') return d;
    const m = /^(\d+(?:\.\d+)?)([smh])$/.exec(d);
    if (!m) throw new Error(`[Cache] Geçersiz süre: ${d}`);
    return Number(m[1]) * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1);
}

// ---------------------------------------------------------------- yapılandırma (test/ops)

const cfg = {
    maxKeys: 5000, // ayar: configureCache({ maxKeys }) (env okuması yok: process.env mandalı)
    jitter: DEFAULT_JITTER,
};
export function configureCache(o: { maxKeys?: number; jitter?: number }): void {
    if (o.maxKeys !== undefined) cfg.maxKeys = o.maxKeys;
    if (o.jitter !== undefined) cfg.jitter = o.jitter;
}

// ---------------------------------------------------------------- metrik

export type CacheEvent = 'hit' | 'miss' | 'set' | 'error' | 'skip' | 'join' | 'evict' | 'invalidated';
type Counters = Record<CacheEvent, number>;
const EVENTS: CacheEvent[] = ['hit', 'miss', 'set', 'error', 'skip', 'join', 'evict', 'invalidated'];
const metrics = new Map<string, Counters>();
let metricSink: ((family: string, event: CacheEvent, delta: number) => void) | undefined;

/** ADR-0017: MetricsRegistry köprüsü buraya bağlanır (utils yaprak katman; platform'u içe aktaramaz). */
export function setCacheMetricSink(sink?: (family: string, event: CacheEvent, delta: number) => void): void {
    metricSink = sink;
}

function count(family: string, event: CacheEvent, delta = 1): void {
    let c = metrics.get(family);
    if (!c) {
        c = Object.fromEntries(EVENTS.map((e) => [e, 0])) as Counters;
        metrics.set(family, c);
    }
    c[event] += delta;
    try { metricSink?.(family, event, delta); } catch { /* metrik ana akışı etkilemez */ }
}

export function getCacheMetrics() {
    const families: Record<string, Counters & { hitRatio: number }> = {};
    const totals = Object.fromEntries(EVENTS.map((e) => [e, 0])) as Counters;
    for (const [f, c] of metrics) {
        const looks = c.hit + c.miss;
        families[f] = { ...c, hitRatio: looks ? c.hit / looks : 0 };
        EVENTS.forEach((e) => { totals[e] += c[e]; });
    }
    return { size: lru.size, maxKeys: cfg.maxKeys, inflight: inflight.size, totals, families };
}
/** @alias getCacheMetrics */
export const snapshot = getCacheMetrics;

// ---------------------------------------------------------------- LRU + depo

const lru = new Map<string, true>(); // ekleme/erişim sırası: ilk eleman en eski
const familyOf = new Map<string, string>();
nodeCache.on('del', (k: string) => { lru.delete(k); familyOf.delete(k); });
nodeCache.on('expired', (k: string) => { lru.delete(k); familyOf.delete(k); });
nodeCache.on('flush', () => { lru.clear(); familyOf.clear(); });

function touch(key: string): void { lru.delete(key); lru.set(key, true); }

function store(key: string, family: string, entry: { v: any }, ttlSeconds: number): void {
    nodeCache.set(key, entry, ttlSeconds);
    familyOf.set(key, family);
    touch(key);
    while (lru.size > cfg.maxKeys) {
        const oldest = lru.keys().next().value as string;
        const fam = familyOf.get(oldest) ?? 'unknown';
        nodeCache.del(oldest); // 'del' olayı lru/familyOf'u temizler
        lru.delete(oldest);
        count(fam, 'evict');
    }
}

// ---------------------------------------------------------------- anahtar üretimi

function stableStringify(value: any, seen: WeakSet<object> = new WeakSet()): string {
    if (value === undefined) return '"__undefined"';
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
        throw new Error('unserializable-arg');
    }
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (seen.has(value)) throw new Error('unserializable-arg'); // döngüsel
    seen.add(value);
    try {
        if (typeof value.toJSON === 'function') return stableStringify(value.toJSON(), seen);
        if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v, seen)).join(',')}]`;
        const keys = Object.keys(value).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k], seen)}`).join(',')}}`;
    } finally {
        seen.delete(value);
    }
}

function argHash(args: any[]): string {
    return createHash('sha1').update(stableStringify(args)).digest('hex').slice(0, 20);
}

const seg = (v: any): string => String(v).replace(/[:\s]/g, '_');

const warnedAt = new Map<string, number>();
function warnOnce(family: string, msg: string): void {
    const now = Date.now();
    if ((warnedAt.get(family) ?? 0) + 60_000 > now) return;
    warnedAt.set(family, now);
    eventLog('api', 'cache').warn('CACHE_WARN', `[Cache] ${family}: ${msg}`, { family });
}

// ---------------------------------------------------------------- decorator

const inflight = new Map<string, Promise<any>>();
let epoch = 0; // invalidation sayacı: uçuştaki hesaplamanın bayat sonucu yazılmasını engeller

interface Envelope { v: any }

export function Cache(options: CacheOptions) {
    if (!options || (options.scope !== 'tenant' && options.scope !== 'global')) {
        throw new Error("[Cache] `scope` ('tenant' | 'global') zorunludur.");
    }
    const ttlSeconds = options.ttlSeconds ?? durationToSeconds(options.ttl as CacheDuration);
    if (!(ttlSeconds > 0)) throw new Error('[Cache] TTL > 0 olmalıdır (süresiz kayıt yok).');
    const maxTtl = options.scope === 'tenant' ? TENANT_MAX_TTL_SECONDS : GLOBAL_MAX_TTL_SECONDS;
    if (ttlSeconds > maxTtl) throw new Error(`[Cache] ${options.scope} kapsamı için TTL üst sınırı ${maxTtl} sn (ADR-0002).`);
    const negativeTtl = options.negativeTtl === undefined ? 0 : Math.min(durationToSeconds(options.negativeTtl), ttlSeconds);
    const emptyTtl = Math.min(options.emptyTtlSeconds ?? DEFAULT_EMPTY_TTL_SECONDS, ttlSeconds);

    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        const family = `${options.context}.${target.constructor.name}.${propertyKey}`;

        descriptor.value = async function (this: any, ...args: any[]) {
            let prefix: string;
            if (options.scope === 'tenant') {
                const tid = this?.clientId;
                if (tid === null || tid === undefined || INVALID_TENANTS.has(String(tid))) {
                    count(family, 'skip');
                    warnOnce(family, 'tenant kimliği (clientId) yok: önbellek ATLANDI');
                    return originalMethod.apply(this, args);
                }
                prefix = `t:${seg(tid)}:${seg(this?.integrationId ?? this?.integrationCode ?? '-')}:${family}:`;
            } else {
                prefix = `g:${seg(this?.integrationId ?? this?.integrationCode ?? '-')}:${family}:`;
            }

            let cacheKey: string;
            try {
                const argPart = options.key ? options.key(this, args) : argHash(args);
                cacheKey = prefix + (options.key ? createHash('sha1').update(String(argPart)).digest('hex').slice(0, 20) : argPart);
            } catch {
                count(family, 'skip');
                warnOnce(family, 'serileştirilemeyen argüman: önbellek ATLANDI');
                return originalMethod.apply(this, args);
            }

            if (nodeCache.has(cacheKey)) {
                const entry = nodeCache.get<Envelope>(cacheKey);
                if (entry) {
                    touch(cacheKey);
                    count(family, 'hit');
                    return entry.v;
                }
            }

            const pending = inflight.get(cacheKey);
            if (pending) {
                count(family, 'join');
                const shared = await pending;
                // Cache'e yazıldıysa klonlanmış kopya; yazılmadıysa (negatif/atlanan) paylaşılan sonuç.
                const entry = nodeCache.has(cacheKey) ? nodeCache.get<Envelope>(cacheKey) : undefined;
                return entry ? entry.v : shared;
            }

            count(family, 'miss');
            const startEpoch = epoch;
            let run!: Promise<any>;
            run = (async () => {
                await null; // inflight.set'in önce çalışmasını garanti eder (eşzamanlı fırlatma)
                try {
                    const result = await originalMethod.apply(this, args);
                    let ttl = 0;
                    if (result === null || result === undefined) ttl = negativeTtl;
                    else if (Array.isArray(result) && result.length === 0) ttl = emptyTtl;
                    else ttl = ttlSeconds;
                    if (ttl > 0 && epoch === startEpoch) {
                        const jittered = Math.max(1, ttl * (1 - Math.random() * cfg.jitter));
                        store(cacheKey, family, { v: result }, cfg.jitter > 0 ? jittered : ttl);
                        count(family, 'set');
                    }
                    return result;
                } catch (e) {
                    count(family, 'error');
                    throw e;
                } finally {
                    if (inflight.get(cacheKey) === run) inflight.delete(cacheKey);
                }
            })();
            inflight.set(cacheKey, run);
            return run;
        };
        return descriptor;
    };
}

// ---------------------------------------------------------------- invalidation

function dropWhere(pred: (key: string) => boolean): number {
    epoch++;
    const doomed: string[] = [];
    for (const k of nodeCache.keys()) if (pred(k)) doomed.push(k);
    for (const k of Array.from(inflight.keys())) if (pred(k)) inflight.delete(k);
    doomed.forEach((k) => { count(familyOf.get(k) ?? 'unknown', 'invalidated'); nodeCache.del(k); });
    return doomed.length;
}

/**
 * ADR-0002 Karar 7: bir tenant'ın önbelleğini (isteğe bağlı yalnız `contextPrefix` ile başlayan aileleri) geçersiz kılar.
 * Yazma yollarından çağrılır. Pod-yereldir. Silinen kayıt sayısını döner.
 */
export function invalidateTenantCache(tenantId: string | number, contextPrefix?: string | string[]): number {
    const p = `t:${seg(tenantId)}:`;
    const ctxs = contextPrefix === undefined ? undefined : Array.isArray(contextPrefix) ? contextPrefix : [contextPrefix];
    return dropWhere((k) => {
        if (!k.startsWith(p)) return false;
        if (!ctxs) return true;
        // t:<tid>:<integrationKey>:<context>.<Class>.<method>:<hash>
        const rest = k.slice(p.length).split(':').slice(1).join(':');
        return ctxs.some((c) => rest.startsWith(c));
    });
}

/** Aile (context.Class.method ya da yalnız context öneki) bazlı; `tenantId` verilirse yalnız o tenant. */
export function invalidateCache(family: string, tenantId?: string | number): number {
    return dropWhere((k) => {
        if (tenantId !== undefined && !k.startsWith(`t:${seg(tenantId)}:`)) return false;
        return k.includes(`:${family}`);
    });
}

/** Yalnız testler. */
export function resetCacheForTests(): void {
    nodeCache.flushAll();
    inflight.clear();
    metrics.clear();
    warnedAt.clear();
    epoch = 0;
    cfg.maxKeys = 5000;
    cfg.jitter = DEFAULT_JITTER;
}

/**
 * Yazma metotları için: metot başarıyla bittikten SONRA `this.clientId` tenant'ının verilen aileleri düşer.
 * Kullanım: `@InvalidatesTenantCache('PlatformMappingProvider')`.
 */
export function InvalidatesTenantCache(...contextPrefixes: string[]) {
    return function (_target: any, _key: string, descriptor: PropertyDescriptor) {
        const original = descriptor.value;
        descriptor.value = async function (this: any, ...args: any[]) {
            const result = await original.apply(this, args);
            if (this?.clientId !== undefined && this?.clientId !== null) {
                invalidateTenantCache(this.clientId, contextPrefixes.length ? contextPrefixes : undefined);
            }
            return result;
        };
        return descriptor;
    };
}
