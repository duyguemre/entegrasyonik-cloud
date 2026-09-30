import { LRUCache } from 'lru-cache';

/**
 * ADR-0024 P1-CORE / ADR-0028 Karar 6: authenticate'in kullanıcı (merkezi Users) okumasını önbellekleyen kısa TTL'li kimlik önbelleği.
 *
 * Anahtar `(sub, tid, tv)`: `tv` token'daki tokenVersion'dır. Girdi YALNIZCA `Users.tokenVersion === tv` doğrulanmış bir DB okumasından
 * sonra yazılır; böylece bir tokenVersion artışından sonra yeni token (yeni tv) eski girdiyi asla bulamaz. ESKİ token ise anahtarı
 * tutmaya devam edeceğinden, tv/isActive/kilit/rol/silme yazan HER yol aynı pod'da `invalidateUser`/`invalidateTenant` çağırmak
 * ZORUNDADIR (UserService, AccountLifecycleService, SecurityService kilitleme, TenantLifecycleService purge).
 *
 * SINIR (bilinçli, ADR-0028 Karar 6'dan sapma): çok pod'lu dağıtımda başka pod'un yaptığı iptal, TTL (varsayılan 5 sn) dolana dek bu pod'da
 * görünmez. Tek pod'da iptal anlıktır. `AUTH_IDENTITY_CACHE_TTL_MS=0` önbelleği kapatır (her istek Users okur; ADR-0001 anlık iptal).
 *
 * Girdi önbelleğe alınırken donduruluk (yüzeysel) korunur; çağıran `buildUserContext` ile kopya kurar.
 */
// Orkestrator karari (2026-09-30): 30 sn yerine 5 sn — cok pod'da iptal gecikmesi kisalir, sicak yol kazanci buyuk olcude korunur.
export const IDENTITY_CACHE_TTL_MS = 5_000;

export function identityCacheTtlFromEnv(env: NodeJS.ProcessEnv = process.env): number {
    const raw = env.AUTH_IDENTITY_CACHE_TTL_MS;
    if (raw === undefined || raw === '') return IDENTITY_CACHE_TTL_MS;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : IDENTITY_CACHE_TTL_MS;
}

export class IdentityCache {
    private cache?: LRUCache<string, any>;
    private epochValue = 0; // invalidate sırasında uçuştaki okuma sonucu yazılmasın

    constructor(private ttlMs: number = identityCacheTtlFromEnv(), private max: number = 5000) {
        this.configure(ttlMs);
    }

    /** TTL değiştirir ve içeriği temizler; 0 = kapalı. */
    public configure(ttlMs: number): void {
        this.ttlMs = ttlMs;
        this.cache = ttlMs > 0 ? new LRUCache<string, any>({ max: this.max, ttl: ttlMs }) : undefined;
        this.epochValue++;
    }

    public get enabled(): boolean { return !!this.cache; }
    /** Okumadan ÖNCE alınır; `set`'e verilir. */
    public get epoch(): number { return this.epochValue; }

    private static key(sub: string, tid: number | undefined, tv: number): string {
        return `${sub}|${tid === undefined ? '-' : tid}|${tv}`;
    }

    public get(sub: string, tid: number | undefined, tv: number): any | undefined {
        return this.cache?.get(IdentityCache.key(sub, tid, tv));
    }

    public set(sub: string, tid: number | undefined, tv: number, user: any, epochAtRead: number): void {
        if (!this.cache || epochAtRead !== this.epochValue) return;
        this.cache.set(IdentityCache.key(sub, tid, tv), Object.freeze({ ...user }));
    }

    /** Kullanıcının tüm (tid, tv) girdilerini siler. */
    public invalidateUser(sub: string | { toString(): string }): void {
        this.epochValue++;
        if (!this.cache) return;
        const prefix = String(sub) + '|';
        for (const k of [...this.cache.keys()]) if (k.startsWith(prefix)) this.cache.delete(k);
    }

    /** Bir tenant'ın tüm kullanıcı girdilerini siler (kullanıcı kimliği bilinmeyen toplu yazımlar için). */
    public invalidateTenant(tid: number): void {
        this.epochValue++;
        if (!this.cache) return;
        for (const k of [...this.cache.keys()]) if (k.split('|')[1] === String(tid)) this.cache.delete(k);
    }

    public clear(): void { this.epochValue++; this.cache?.clear(); }
}

let singleton: IdentityCache | undefined;

export function getIdentityCache(): IdentityCache {
    if (!singleton) singleton = new IdentityCache();
    return singleton;
}

/** Yalnız test. */
export function resetIdentityCacheForTests(ttlMs?: number): IdentityCache {
    singleton = new IdentityCache(ttlMs ?? 0);
    return singleton;
}
