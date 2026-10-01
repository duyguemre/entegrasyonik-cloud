import { nodeCache, getCacheMetrics } from '@utils/decorator/cache';

// WP10: yönetim paneli bellek-cache dökümü. Anahtar biçimi (utils/decorator/cache.ts, ADR-0002):
//   t:<tenant>:<integrationKey>:<context>.<Class>.<method>:<sha1>   |   g:<integrationKey>:<context>.<Class>.<method>:<sha1>
// Ham anahtar ve tenant kimliği yanıta ASLA konmaz; yalnız aile (context.Class.method) bazında sayılar döner.

export interface ICacheFamilyRow {
    name: string;
    /** Şu an cache'te tutulan kayıt sayısı (aile başına). */
    count: number;
    hit: number;
    miss: number;
    set: number;
    hitRatio: number;
}

export interface ICacheDump {
    /** Geriye uyumlu alanlar (frontend: hits/misses/keys/breakdown). */
    hits: number;
    misses: number;
    keys: number;
    sets: number;
    evictions: number;
    maxKeys: number;
    breakdown: ICacheFamilyRow[];
}

/** Anahtardan yalnız aile adını çıkarır; biçim tanınmazsa 'unknown' (ham anahtar sızmaz). */
export function familyOfKey(key: string): string {
    const parts = String(key).split(':');
    if (parts[0] === 't' && parts.length >= 5) return parts[3] || 'unknown';
    if (parts[0] === 'g' && parts.length >= 4) return parts[2] || 'unknown';
    return 'unknown';
}

export function buildCacheDump(): ICacheDump {
    const m = getCacheMetrics();
    const sizes = new Map<string, number>();
    for (const k of nodeCache.keys()) {
        const f = familyOfKey(k);
        sizes.set(f, (sizes.get(f) || 0) + 1);
    }
    const names = new Set<string>([...sizes.keys(), ...Object.keys(m.families)]);
    const breakdown: ICacheFamilyRow[] = Array.from(names).map((name) => {
        const c: any = (m.families as any)[name] || {};
        return {
            name,
            count: sizes.get(name) || 0,
            hit: c.hit || 0,
            miss: c.miss || 0,
            set: c.set || 0,
            hitRatio: c.hitRatio || 0,
        };
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return {
        hits: m.totals.hit,
        misses: m.totals.miss,
        keys: m.size,
        sets: m.totals.set,
        evictions: m.totals.evict,
        maxKeys: m.maxKeys,
        breakdown,
    };
}
