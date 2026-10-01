import { describe, it, expect } from '@jest/globals';
import { MemoryKv, RedisKv, type RedisLike } from '../../../src/operations/agent/kv';
import { ConversationStore, conversationKey, CONV_MAX_MESSAGES, CONV_TTL_SEC } from '../../../src/operations/agent/ConversationStore';
import { TurnGuard, TURN_DEDUP_TTL_SEC, TURN_LOCK_TTL_SEC } from '../../../src/operations/agent/TurnGuard';

function clock(start = 1_000_000) {
    let t = start;
    return { now: () => t, advance: (sec: number) => { t += sec * 1000; } };
}
const msg = (text: string, role: 'user' | 'assistant' = 'user') => ({ role, text, at: '2026-10-01T00:00:00Z' });

describe('ConversationStore (calisma bellegi)', () => {
    it('anahtar bicimi agent:conv:app:{tid}:{userId}:{convId}; ayirici iceren kimlik reddedilir', () => {
        expect(conversationKey(7, 'u1', 'c-1')).toBe('agent:conv:app:7:u1:c-1');
        expect(() => conversationKey(7, 'u1', 'a:b')).toThrow();
        expect(() => conversationKey(7, 'u:1', 'c')).toThrow();
        expect(() => conversationKey(7.5, 'u1', 'c')).toThrow();
    });
    it('60 dk kayan TTL: her eklemede omur yenilenir; sure dolunca bellek bosalir', async () => {
        const c = clock(); const kv = new MemoryKv(c.now); const store = new ConversationStore(kv);
        await store.append(1, 'u', 'c', [msg('a')]);
        c.advance(CONV_TTL_SEC - 10);
        await store.append(1, 'u', 'c', [msg('b')]); // omur yenilendi
        c.advance(CONV_TTL_SEC - 10);
        expect((await store.load(1, 'u', 'c')).map((m) => m.text)).toEqual(['a', 'b']);
        c.advance(11);
        expect(await store.load(1, 'u', 'c')).toEqual([]);
    });
    it('en fazla 40 mesaj (eskiler kirpilir)', async () => {
        const store = new ConversationStore(new MemoryKv());
        for (let i = 0; i < 45; i++) await store.append(1, 'u', 'c', [msg(`m${i}`)]);
        const all = await store.load(1, 'u', 'c');
        expect(all).toHaveLength(CONV_MAX_MESSAGES);
        expect(all[0].text).toBe('m5');
        expect(all[39].text).toBe('m44');
    });
    it('TENANT ve KULLANICI izolasyonu: ayni convId baska tenant/kullanicida ayri kayit; reset yalniz kendi kaydini siler', async () => {
        const kv = new MemoryKv(); const store = new ConversationStore(kv);
        await store.append(1, 'u', 'c', [msg('tenant-1')]);
        await store.append(2, 'u', 'c', [msg('tenant-2')]);
        await store.append(1, 'v', 'c', [msg('baska-kullanici')]);
        expect((await store.load(1, 'u', 'c'))[0].text).toBe('tenant-1');
        expect((await store.load(2, 'u', 'c'))[0].text).toBe('tenant-2');
        expect((await store.load(1, 'v', 'c'))[0].text).toBe('baska-kullanici');
        await store.reset(1, 'u', 'c');
        expect(await store.load(1, 'u', 'c')).toEqual([]);
        expect(await store.load(2, 'u', 'c')).toHaveLength(1);
        expect(kv.keys().sort()).toEqual(['agent:conv:app:1:v:c', 'agent:conv:app:2:u:c']);
    });
    it('bozuk kayit bos konusma sayilir', async () => {
        const kv = new MemoryKv(); await kv.set(conversationKey(1, 'u', 'c'), '{bozuk', 60);
        expect(await new ConversationStore(kv).load(1, 'u', 'c')).toEqual([]);
    });
});

describe('TurnGuard (kilit + tekrar)', () => {
    it('kullanici basina tek kilit; birakinca yenisi alinabilir; baska kullanici/tenant etkilenmez', async () => {
        const g = new TurnGuard(new MemoryKv());
        const a = await g.acquire(1, 'u');
        expect(a).not.toBeNull();
        expect(await g.acquire(1, 'u')).toBeNull();
        expect(await g.acquire(1, 'v')).not.toBeNull();
        expect(await g.acquire(2, 'u')).not.toBeNull();
        await a!.release();
        expect(await g.acquire(1, 'u')).not.toBeNull();
    });
    it('kilit TTL (90 sn) dolunca serbest kalir; eski sahibin release() yenisinin kilidine dokunmaz', async () => {
        const c = clock(); const g = new TurnGuard(new MemoryKv(c.now));
        const old = await g.acquire(1, 'u');
        c.advance(TURN_LOCK_TTL_SEC + 1);
        const fresh = await g.acquire(1, 'u');
        expect(fresh).not.toBeNull();
        await old!.release(); // baskasinin kilidi silinmez
        expect(await g.acquire(1, 'u')).toBeNull();
    });
    it('ayni clientTurnId 10 dk icinde ikinci kez reddedilir; sure sonra yeniden kabul', async () => {
        const c = clock(); const g = new TurnGuard(new MemoryKv(c.now));
        const id = '3f2b1c9e-8a4d-4e7b-9c11-2d5a6b7c8d9e';
        expect(await g.registerClientTurn(1, 'u', id)).toBe(true);
        expect(await g.registerClientTurn(1, 'u', id)).toBe(false);
        expect(await g.registerClientTurn(1, 'v', id)).toBe(true); // baska kullanici
        c.advance(TURN_DEDUP_TTL_SEC + 1);
        expect(await g.registerClientTurn(1, 'u', id)).toBe(true);
    });
});

describe('RedisKv (ioredis komut eslemesi; sahte istemci)', () => {
    function fake() {
        const calls: Array<unknown[]> = [];
        const store = new Map<string, string>();
        const sets = new Map<string, Set<string>>();
        const r: RedisLike = {
            async get(k) { calls.push(['get', k]); return store.get(k) ?? null; },
            async set(k, v, ...args) {
                calls.push(['set', k, v, ...args]);
                if (args.includes('NX') && store.has(k)) return null;
                store.set(k, v); return 'OK';
            },
            async del(k) { calls.push(['del', k]); store.delete(k); return 1; },
            async expire(k, s) { calls.push(['expire', k, s]); return 1; },
            async incr(k) { calls.push(['incr', k]); const n = (Number(store.get(k)) || 0) + 1; store.set(k, String(n)); return n; },
            async sadd(k, m) { calls.push(['sadd', k, m]); const set = sets.get(k) ?? new Set<string>(); const had = set.has(m); set.add(m); sets.set(k, set); return had ? 0 : 1; },
            async srem(k, m) { calls.push(['srem', k, m]); return sets.get(k)?.delete(m) ? 1 : 0; },
            async smembers(k) { calls.push(['smembers', k]); return [...(sets.get(k) ?? [])]; },
            async eval(_script, _n, key, val) {
                calls.push(['eval', key, val]);
                if (val === undefined) { const v = store.get(String(key)) ?? null; store.delete(String(key)); return v; } // GET_DEL
                if (store.get(String(key)) === val) { store.delete(String(key)); return 1; }
                return 0;
            },
        };
        return { r, calls };
    }
    it('set = SET k v EX ttl; setNx = SET k v EX ttl NX; delIfEquals = eval(KEYS[1], ARGV[1])', async () => {
        const { r, calls } = fake(); const kv = new RedisKv(r);
        await kv.set('k', 'v', 60);
        expect(calls[0]).toEqual(['set', 'k', 'v', 'EX', 60]);
        expect(await kv.setNx('lock', 't', 90)).toBe(true);
        expect(calls[1]).toEqual(['set', 'lock', 't', 'EX', 90, 'NX']);
        expect(await kv.setNx('lock', 'x', 90)).toBe(false);
        expect(await kv.delIfEquals('lock', 'yanlis')).toBe(false);
        expect(await kv.delIfEquals('lock', 't')).toBe(true);
        await kv.expire('k', 30);
        expect(calls[calls.length - 1]).toEqual(['expire', 'k', 30]);
    });
    it('getDel = tek eval (atomik); ikinci okuma null. incr: ilk artista TTL verilir', async () => {
        const { r, calls } = fake(); const kv = new RedisKv(r);
        await kv.set('pa', 'x', 300);
        expect(await kv.getDel('pa')).toBe('x');
        expect(await kv.getDel('pa')).toBeNull();
        expect(await kv.incr('q', 86400)).toBe(1);
        expect(calls.filter((c) => c[0] === 'expire' && c[1] === 'q')).toEqual([['expire', 'q', 86400]]);
        expect(await kv.incr('q', 86400)).toBe(2);
        expect(calls.filter((c) => c[0] === 'expire' && c[1] === 'q')).toHaveLength(1);
    });
});

describe('kume islemleri (MCP-4 kullanici basina bekleyen onay dizini)', () => {
    it('MemoryKv: sadd/srem/smembers, kume TTL sonunda kaybolur (sadd omru yeniler)', async () => {
        let t = 1000; const kv = new MemoryKv(() => t);
        await kv.sadd('s', 'a', 10); await kv.sadd('s', 'b', 10); await kv.sadd('s', 'a', 10);
        expect((await kv.smembers('s')).sort()).toEqual(['a', 'b']);
        await kv.srem('s', 'a');
        expect(await kv.smembers('s')).toEqual(['b']);
        t += 9_000; await kv.sadd('s', 'c', 10); t += 9_000; // ilk omur bitti ama sadd yeniledi
        expect((await kv.smembers('s')).sort()).toEqual(['b', 'c']);
        t += 2_000;
        expect(await kv.smembers('s')).toEqual([]);
    });
    it('RedisKv: sadd = SADD + EXPIRE; srem/smembers dogrudan', async () => {
        const store = new Map<string, Set<string>>(); const calls: unknown[][] = [];
        const r = {
            async sadd(k: string, m: string) { calls.push(['sadd', k, m]); (store.get(k) ?? store.set(k, new Set()).get(k)!).add(m); return 1; },
            async srem(k: string, m: string) { calls.push(['srem', k, m]); return store.get(k)?.delete(m) ? 1 : 0; },
            async smembers(k: string) { return [...(store.get(k) ?? [])]; },
            async expire(k: string, s: number) { calls.push(['expire', k, s]); return 1; },
        } as unknown as RedisLike;
        const kv = new RedisKv(r);
        await kv.sadd('s', 'x', 60);
        expect(calls).toEqual([['sadd', 's', 'x'], ['expire', 's', 60]]);
        expect(await kv.smembers('s')).toEqual(['x']);
        await kv.srem('s', 'x');
        expect(await kv.smembers('s')).toEqual([]);
    });
});

describe('MemoryKv getDel/incr', () => {
    it('getDel yalniz bir kez deger verir; incr sayar, TTL ilk artista baslar ve dolunca sifirlanir', async () => {
        let t = 1000; const kv = new MemoryKv(() => t);
        await kv.set('a', 'v', 10);
        expect(await kv.getDel('a')).toBe('v');
        expect(await kv.getDel('a')).toBeNull();
        expect(await kv.incr('c', 5)).toBe(1);
        expect(await kv.incr('c', 5)).toBe(2);
        t += 6000;
        expect(await kv.incr('c', 5)).toBe(1);
    });
});
