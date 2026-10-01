// Characterization: @Cache decorator (backend/src/utils/decorator/cache.ts)
// ADR-0002 adım 3-5 (faz4-int-wp3): eski `@Cache(ttl, ctx, keyFn)` imzası KASITLI OLARAK kaldırıldı; anahtar biçimi,
// boş/falsy semantiği, eşzamanlı çağrı ve TTL davranışı yeni sözleşmeye çevrildi. Değişen her davranış
// `[KASITLI DEĞİŞTİ]` ile işaretlidir; değişmeyenler `[MEVCUT DAVRANIŞ]` olarak korunur. DB/Redis/ağ YOK.
import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import { Cache, nodeCache, configureCache, resetCacheForTests } from '@utils/decorator/cache';

const calls: any[][] = [];

class Probe {
    constructor(public clientId: string = 'probe-client') { }

    @Cache({ scope: 'tenant', ttlSeconds: 300, context: 'ctx' })
    async plain(...args: any[]): Promise<any> {
        calls.push(args);
        return { echoed: args.length };
    }

    @Cache({ scope: 'tenant', ttlSeconds: 300, context: 'ctx' })
    async withExtra(a?: any): Promise<any> {
        calls.push([this.clientId, a]);
        return { by: this.clientId };
    }

    @Cache({ scope: 'tenant', ttlSeconds: 300, context: 'ctx' })
    async returns(value: any): Promise<any> {
        calls.push([value]);
        return value;
    }

    @Cache({ scope: 'tenant', ttlSeconds: 300, context: 'ctx' })
    async throws(_a?: any): Promise<any> {
        calls.push([_a]);
        throw new Error('synthetic failure');
    }

    @Cache({ scope: 'tenant', ttlSeconds: 45, context: 'ttl' })
    async ttl45(): Promise<any> {
        return { v: 1 };
    }

    @Cache({ scope: 'tenant', ttlSeconds: 2, context: 'ttl' })
    async ttl2(): Promise<any> {
        calls.push([]);
        return { v: 2 };
    }

    @Cache({ scope: 'tenant', ttlSeconds: 300, context: 'ctx' })
    async slow(): Promise<any> {
        calls.push([]);
        await new Promise<void>((r) => setTimeout(r, 20));
        return { slow: true };
    }
}

class OtherProbe {
    constructor(public clientId: string = 'probe-client') { }
    @Cache({ scope: 'tenant', ttlSeconds: 300, context: 'ctx' })
    async plain(...args: any[]): Promise<any> {
        calls.push(['other', ...args]);
        return { other: true };
    }
}

beforeEach(() => {
    resetCacheForTests();
    configureCache({ jitter: 0 });
    calls.length = 0;
});

afterEach(() => {
    jest.restoreAllMocks();
});

afterAll(() => {
    nodeCache.flushAll();
    nodeCache.close();
});

const HASH = /^[0-9a-f]{20}$/;

describe('@Cache anahtar biçimi', () => {
    it('[KASITLI DEĞİŞTİ] anahtar `t:<tenant>:<integrationKey>:<context>.<Sınıf>.<metot>:<argHash>` biçimindedir', async () => {
        await new Probe('c1').plain('a', 2, true);
        const [key] = nodeCache.keys();
        expect(key.startsWith('t:c1:-:ctx.Probe.plain:')).toBe(true);
        expect(key.split(':').pop()).toMatch(HASH);
    });

    it('[MEVCUT DAVRANIŞ] sınıf adı anahtara dahildir: aynı context+metot adı farklı sınıflarda çakışmaz', async () => {
        await new Probe().plain('x');
        await new OtherProbe().plain('x');
        expect(nodeCache.keys()).toHaveLength(2);
        expect(calls).toHaveLength(2);
    });

    it('[KASITLI DEĞİŞTİ] tenant kimliği artık this.clientId üzerinden OTOMATİK ve zorunlu okunur (keyFn yok)', async () => {
        const r1 = await new Probe('tenant-A').withExtra('q');
        const r2 = await new Probe('tenant-B').withExtra('q');
        const r3 = await new Probe('tenant-A').withExtra('q');
        expect(r1).toEqual({ by: 'tenant-A' });
        expect(r2).toEqual({ by: 'tenant-B' });
        expect(r3).toEqual({ by: 'tenant-A' });
        expect(calls).toHaveLength(2);
    });

    it('[KASITLI DEĞİŞTİ] ESKİ: keyFn yoksa tenantlar arası paylaşım vardı. ŞİMDİ: aynı argümanla bile farklı tenant farklı girdi', async () => {
        await new Probe('tenant-A').plain('q');
        await new Probe('tenant-B').plain('q');
        expect(calls).toHaveLength(2);
    });

    it('[KASITLI DEĞİŞTİ] ("a|b") ile ("a","b") ARTIK farklı anahtar (argümanlar dizi olarak hashlenir)', async () => {
        await new Probe().plain('a|b');
        await new Probe().plain('a', 'b');
        expect(calls).toHaveLength(2);
    });

    it('[KASITLI DEĞİŞTİ] number 1 ve string "1" ARTIK farklı anahtar', async () => {
        await new Probe().plain(1);
        await new Probe().plain('1');
        expect(calls).toHaveLength(2);
    });

    it('[MEVCUT DAVRANIŞ, C3] farklı düz nesne sorguları farklı anahtar; anahtar sırası önemsiz', async () => {
        const p = new Probe();
        await p.returns({ a: 1, b: 2 });
        await p.returns({ b: 2, a: 1 });
        expect(calls).toHaveLength(1);
        await p.returns({ a: 1, b: 3 });
        expect(calls).toHaveLength(2);
    });

    it('[MEVCUT DAVRANIŞ, C3] iç içe nesne/dizi/Date içerikleri anahtara girer', async () => {
        const p = new Probe();
        await p.returns({ f: { s: ['SALE', 'REFUND'], r: { from: new Date('2025-01-01T00:00:00Z') } } });
        await p.returns({ f: { s: ['SALE'], r: { from: new Date('2025-01-01T00:00:00Z') } } });
        await p.returns({ f: { s: ['SALE'], r: { from: new Date('2025-02-01T00:00:00Z') } } });
        expect(calls).toHaveLength(3);
    });
});

describe('@Cache önbellekleme kuralları', () => {
    it('[MEVCUT DAVRANIŞ] ikinci aynı çağrı orijinal metodu çalıştırmadan önbellekten döner', async () => {
        const p = new Probe();
        const r1 = await p.plain('k');
        const r2 = await p.plain('k');
        expect(r2).toEqual(r1);
        expect(calls).toHaveLength(1);
    });

    it('[MEVCUT DAVRANIŞ] useClones: hit ile dönen nesne çağıranın değişikliğinden etkilenmez', async () => {
        const p = new Probe();
        await p.plain('k');
        const r2: any = await p.plain('k');
        r2.mutated = true;
        const r3: any = await p.plain('k');
        expect(r3.mutated).toBeUndefined();
        expect(r2).not.toBe(r3);
    });

    it('[KASITLI DEĞİŞTİ] boş dizi ARTIK KISA TTL ile cachelenir (varsayılan min(ttl,30 sn))', async () => {
        const p = new Probe();
        await p.returns([]);
        await p.returns([]);
        expect(calls).toHaveLength(1);
        const ttl = nodeCache.getTtl(nodeCache.keys()[0])!;
        expect(ttl - Date.now()).toBeLessThanOrEqual(30_000);
    });

    it('[KASITLI DEĞİŞTİ] falsy sonuçlar 0, "", false ARTIK cachelenir (has() semantiği); null/undefined varsayılan cachelenmez', async () => {
        const p = new Probe();
        for (const v of [0, '', false]) {
            calls.length = 0;
            nodeCache.flushAll();
            expect(await p.returns(v)).toBe(v);
            expect(await p.returns(v)).toBe(v);
            expect(calls).toHaveLength(1);
        }
        nodeCache.flushAll();
        for (const v of [null, undefined]) {
            expect(await p.returns(v)).toBe(v);
        }
        expect(nodeCache.keys()).toEqual([]);
    });

    it('[MEVCUT DAVRANIŞ] hata fırlatan metot: hata aynen yayılır ve önbelleğe hiçbir şey yazılmaz', async () => {
        const p = new Probe();
        await expect(p.throws('a')).rejects.toThrow('synthetic failure');
        await expect(p.throws('a')).rejects.toThrow('synthetic failure');
        expect(calls).toHaveLength(2);
        expect(nodeCache.keys()).toEqual([]);
    });

    it('[KASITLI DEĞİŞTİ] eşzamanlı çağrılar ARTIK birleştirilir (single-flight): metot bir kez çalışır', async () => {
        const p = new Probe();
        await Promise.all([p.slow(), p.slow()]);
        expect(calls).toHaveLength(1);
    });

    it('[MEVCUT DAVRANIŞ] decorator metodu her zaman async (Promise) yapar', () => {
        const ret = new Probe().plain('a');
        expect(ret).toBeInstanceOf(Promise);
        return ret;
    });
});

describe('@Cache TTL', () => {
    it('[MEVCUT DAVRANIŞ] ttlSeconds node-cache set() TTL olarak kullanılır (jitter kapalıyken tam 45 sn)', async () => {
        const now = 1_700_000_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        await new Probe().ttl45();
        expect(nodeCache.getTtl(nodeCache.keys()[0])).toBe(now + 45_000);
    });

    it('[KASITLI DEĞİŞTİ] ESKİ: ttl=0 süresiz kayıt üretirdi. ŞİMDİ: TTL<=0 dekorasyon anında hata (süresiz kayıt yok)', () => {
        expect(() => Cache({ scope: 'tenant', ttlSeconds: 0, context: 'x' })).toThrow(/TTL/);
    });

    it('[MEVCUT DAVRANIŞ] TTL dolunca kayıt düşer ve metot yeniden çalışır', async () => {
        const start = 1_700_000_000_000;
        const spy = jest.spyOn(Date, 'now').mockReturnValue(start);
        const p = new Probe();
        await p.ttl2();
        await p.ttl2();
        expect(calls).toHaveLength(1);
        spy.mockReturnValue(start + 2_500);
        await p.ttl2();
        expect(calls).toHaveLength(2);
    });

    it('[MEVCUT DAVRANIŞ] tek bir NodeCache örneği tüm sınıf/tenantlar için ortaktır (anahtar önekiyle ayrışır)', async () => {
        expect(nodeCache.options.stdTTL).toBe(300);
        await Promise.all([new Probe('tenant-Z').plain('s'), new Probe('tenant-Y').plain('s')]);
        expect(nodeCache.keys().map((k) => k.slice(0, 10)).sort()).toEqual(['t:tenant-Y', 't:tenant-Z']);
    });
});
