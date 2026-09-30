// ADR-0034 Karar 5 / BR-1: sohbet gecici durumunun (calisma bellegi, tur kilidi, tekrar korumasi) anahtar-deger soyutlamasi.
// Uretim: Redis. Redis hazir degilken (yerel gelistirme) surec-ici bellek: yalniz tek surec icin gecerli, kalicilik zaten yok (K38).
import { RedisService } from '@services/redis';

export interface AgentKv {
    get(key: string): Promise<string | null>;
    /** Anahtari `ttlSec` saniye omurle yazar (var olani ezer). */
    set(key: string, value: string, ttlSec: number): Promise<void>;
    /** Yalniz yoksa yazar (SET NX EX). true = alindi. */
    setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
    del(key: string): Promise<void>;
    /** Deger eslesirse siler (kilit birakma; baskasinin kilidini silmez). */
    delIfEquals(key: string, value: string): Promise<boolean>;
    /** Kayan TTL: omru yeniler (anahtar yoksa etkisiz). */
    expire(key: string, ttlSec: number): Promise<void>;
}

export class MemoryKv implements AgentKv {
    private readonly map = new Map<string, { value: string; exp: number }>();
    private writes = 0;
    constructor(private readonly now: () => number = Date.now) { }

    private live(key: string) {
        const e = this.map.get(key);
        if (!e) return undefined;
        if (e.exp <= this.now()) { this.map.delete(key); return undefined; }
        return e;
    }
    private sweepMaybe() {
        if (++this.writes % 256 !== 0) return;
        const t = this.now();
        for (const [k, e] of this.map) if (e.exp <= t) this.map.delete(k);
    }

    async get(key: string) { return this.live(key)?.value ?? null; }
    async set(key: string, value: string, ttlSec: number) { this.map.set(key, { value, exp: this.now() + ttlSec * 1000 }); this.sweepMaybe(); }
    async setNx(key: string, value: string, ttlSec: number) {
        if (this.live(key)) return false;
        this.map.set(key, { value, exp: this.now() + ttlSec * 1000 });
        this.sweepMaybe();
        return true;
    }
    async del(key: string) { this.map.delete(key); }
    async delIfEquals(key: string, value: string) {
        const e = this.live(key);
        if (!e || e.value !== value) return false;
        this.map.delete(key);
        return true;
    }
    async expire(key: string, ttlSec: number) {
        const e = this.live(key);
        if (e) e.exp = this.now() + ttlSec * 1000;
    }
    /** Test: canli anahtar sayisi. */
    size(): number { const t = this.now(); let n = 0; for (const e of this.map.values()) if (e.exp > t) n++; return n; }
    keys(): string[] { const t = this.now(); return [...this.map.entries()].filter(([, e]) => e.exp > t).map(([k]) => k); }
}

/** ioredis'in kullandigimiz altkumesi (test sahtesi icin yapisal tip). */
export interface RedisLike {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
    del(key: string): Promise<unknown>;
    expire(key: string, seconds: number): Promise<unknown>;
    eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

const DEL_IF_EQUALS = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export class RedisKv implements AgentKv {
    constructor(private readonly redis: RedisLike) { }
    get(key: string) { return this.redis.get(key); }
    async set(key: string, value: string, ttlSec: number) { await this.redis.set(key, value, 'EX', ttlSec); }
    async setNx(key: string, value: string, ttlSec: number) { return (await this.redis.set(key, value, 'EX', ttlSec, 'NX')) === 'OK'; }
    async del(key: string) { await this.redis.del(key); }
    async delIfEquals(key: string, value: string) { return Number(await this.redis.eval(DEL_IF_EQUALS, 1, key, value)) === 1; }
    async expire(key: string, ttlSec: number) { await this.redis.expire(key, ttlSec); }
}

const processKv = new MemoryKv();
let redisKv: { client: unknown; kv: RedisKv } | undefined;

/** Redis hazirsa Redis, degilse surec-ici bellek. */
export function getAgentKv(): AgentKv {
    if (RedisService.isReady()) {
        const client = RedisService.getInstance();
        if (!redisKv || redisKv.client !== client) redisKv = { client, kv: new RedisKv(client as unknown as RedisLike) };
        return redisKv.kv;
    }
    return processKv;
}
