// [BO B8a] Redis durumu (salt okuma). İzinli komutlar: INFO, SCAN, SLOWLOG GET. KEYS/MONITOR/CONFIG/FLUSH*/DEBUG ASLA çağrılmaz.
// Anahtar adı ve değer dönmez: yalnız önek AİLESİ (ilk segment; `bull:<kuyruk>`) bazında sayı. SCAN: <=10.000 anahtar, COUNT 500, 200 ms bütçe.
export const SCAN_MAX_KEYS = 10_000;
export const SCAN_COUNT = 500;
export const SCAN_BUDGET_MS = 200;
const SLOWLOG_LIMIT = 20;

export interface RedisReadOnly {
    info(section?: string): Promise<string>;
    scan(cursor: string, ...args: (string | number)[]): Promise<[string, string[]]>;
    call(command: string, ...args: (string | number)[]): Promise<unknown>;
}

/** `INFO` çıktısını `{ alan: değer }` düzleştirir. */
export function parseInfo(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
        if (!line || line.startsWith('#')) continue;
        const i = line.indexOf(':');
        if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
    }
    return out;
}

const num = (v: string | undefined): number | null => { if (v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/** Anahtar -> aile: ilk segment (güvenli ad kalıbı değilse 'other'); `bull` için `bull:<kuyruk>`. */
export function familyOfRedisKey(key: string): string {
    const parts = key.split(':');
    const safe = (s: string | undefined) => !!s && /^[A-Za-z0-9_-]{1,40}$/.test(s);
    if (!safe(parts[0])) return 'other';
    if (parts[0] === 'bull' && safe(parts[1])) return `bull:${parts[1]}`;
    return parts[0];
}

export async function getRedisStatus(redis: RedisReadOnly, now: () => number = Date.now) {
    const info = parseInfo(await redis.info());
    const keyspace: Array<{ db: string; keys: number; expires: number }> = [];
    for (const [k, v] of Object.entries(info)) {
        if (!/^db\d+$/.test(k)) continue;
        const kv = Object.fromEntries(v.split(',').map((p) => p.split('=')));
        keyspace.push({ db: k, keys: Number(kv.keys) || 0, expires: Number(kv.expires) || 0 });
    }

    // SCAN örneklemesi (bütçeli)
    const families: Record<string, number> = {};
    let scanned = 0, cursor = '0', truncated = false;
    const t0 = now();
    do {
        const [next, batch] = await redis.scan(cursor, 'COUNT', SCAN_COUNT);
        cursor = next;
        for (const k of batch) { const f = familyOfRedisKey(k); families[f] = (families[f] ?? 0) + 1; scanned++; }
        if (cursor !== '0' && (scanned >= SCAN_MAX_KEYS || now() - t0 >= SCAN_BUDGET_MS)) { truncated = true; break; }
    } while (cursor !== '0');

    // SLOWLOG: yalnız komut adı + süre (argüman/anahtar yok)
    let slowlog: Array<{ command: string; durationMicros: number; at: string }> = [];
    try {
        const raw = (await redis.call('SLOWLOG', 'GET', SLOWLOG_LIMIT)) as any[];
        slowlog = (Array.isArray(raw) ? raw : []).slice(0, SLOWLOG_LIMIT).map((e) => ({
            command: String(Array.isArray(e?.[3]) ? e[3][0] ?? '' : '').toUpperCase().replace(/[^A-Z_|-]/g, '').slice(0, 30) || 'UNKNOWN',
            durationMicros: Number(e?.[2]) || 0,
            at: new Date((Number(e?.[1]) || 0) * 1000).toISOString(),
        }));
    } catch { /* SLOWLOG kısıtlıysa boş döner */ }

    return {
        server: { version: info.redis_version ?? null, uptimeSeconds: num(info.uptime_in_seconds) },
        memory: {
            usedBytes: num(info.used_memory), peakBytes: num(info.used_memory_peak), maxBytes: num(info.maxmemory),
            fragmentationRatio: num(info.mem_fragmentation_ratio), evictionPolicy: info.maxmemory_policy ?? null,
        },
        clients: { connected: num(info.connected_clients), blocked: num(info.blocked_clients) },
        stats: {
            opsPerSec: num(info.instantaneous_ops_per_sec), keyspaceHits: num(info.keyspace_hits), keyspaceMisses: num(info.keyspace_misses),
            expiredKeys: num(info.expired_keys), evictedKeys: num(info.evicted_keys),
        },
        keyspace,
        keyFamilies: { sampled: scanned, truncated, items: Object.entries(families).sort((a, b) => b[1] - a[1]).slice(0, 200).map(([family, count]) => ({ family, count })) },
        slowlog,
    };
}
