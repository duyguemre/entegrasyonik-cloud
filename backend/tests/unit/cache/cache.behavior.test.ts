// ADR-0002 adım 3-5 (faz4-int-wp3, F-05): @Cache davranış testleri. DB/Redis/ağ YOK.
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';
import * as fs from 'fs';
import { captureLogs } from '../../helpers/logCapture';
import * as path from 'path';
import {
    Cache, nodeCache, configureCache, resetCacheForTests, getCacheMetrics, snapshot, setCacheMetricSink,
    invalidateTenantCache, invalidateCache, InvalidatesTenantCache, durationToSeconds,
} from '@utils/decorator/cache';

let runs = 0;
const gate: { release?: () => void } = {};

class Svc {
    constructor(public clientId: any, public integrationCode?: string) { }

    @Cache({ scope: 'tenant', ttl: '5m', context: 'svc' })
    async list(q?: any): Promise<any> { runs++; return [{ owner: this.clientId, q }]; }

    @Cache({ scope: 'tenant', ttl: '5m', context: 'svc' })
    async count(): Promise<number> { runs++; return 0; }

    @Cache({ scope: 'tenant', ttl: '5m', context: 'svc' })
    async flag(): Promise<boolean> { runs++; return false; }

    @Cache({ scope: 'tenant', ttl: '5m', context: 'svc' })
    async empty(): Promise<any[]> { runs++; return []; }

    @Cache({ scope: 'tenant', ttl: '5m', context: 'svc', negativeTtl: '10s' })
    async maybe(v: any): Promise<any> { runs++; return v; }

    @Cache({ scope: 'tenant', ttl: '5m', context: 'svc' })
    async gated(): Promise<any> {
        runs++;
        await new Promise<void>((r) => { gate.release = r; });
        return { ok: runs };
    }

    @Cache({ scope: 'tenant', ttl: '5m', context: 'svc' })
    async boom(): Promise<any> {
        runs++;
        await new Promise((r) => setTimeout(r, 5));
        throw new Error('upstream');
    }

    @Cache({ scope: 'tenant', ttl: '5m', context: 'svc' })
    async withFn(_f: any): Promise<any> { runs++; return 1; }

    @Cache({ scope: 'global', ttl: '6h', context: 'mk-catalog' })
    async tree(): Promise<any> { runs++; return { tree: true }; }

    @Cache({ scope: 'tenant', ttl: '5m', context: 'other' })
    async otherFamily(): Promise<any> { runs++; return 1; }

    @InvalidatesTenantCache('svc')
    async write(): Promise<string> { return 'done'; }
}

beforeEach(() => {
    resetCacheForTests();
    configureCache({ jitter: 0 });
    runs = 0;
});
afterAll(() => { nodeCache.flushAll(); nodeCache.close(); });

describe('tenant izolasyonu', () => {
    it('A ve B aynı argümanla ayrı girdi; birbirlerinin sonucunu ASLA görmez (cross-tenant sızıntı)', async () => {
        const a = await new Svc('A').list({ p: 1 });
        const b = await new Svc('B').list({ p: 1 });
        expect(a[0].owner).toBe('A');
        expect(b[0].owner).toBe('B');
        expect((await new Svc('A').list({ p: 1 }))[0].owner).toBe('A');
        expect((await new Svc('B').list({ p: 1 }))[0].owner).toBe('B');
        expect(runs).toBe(2);
        expect(nodeCache.keys().every((k) => k.startsWith('t:A:') || k.startsWith('t:B:'))).toBe(true);
    });

    it('sayısal 1 ve string "1" tenant kimliği aynı tenanttır; tenant yoksa ATLANIR ve paylaşılan anahtar üretilmez', async () => {
        const cap = captureLogs(); // F-06: uyarı eventLog ile (CACHE_WARN)
        for (const bad of [undefined, null, '', 'UnknownClient']) {
            await new Svc(bad).list();
            await new Svc(bad).list();
        }
        expect(runs).toBe(8);                 // hiçbiri cache'lenmedi
        expect(nodeCache.keys()).toEqual([]); // hiçbir anahtar üretilmedi
        expect(getCacheMetrics().families['svc.Svc.list'].skip).toBe(8);
        expect(cap.find((l) => l.code === 'CACHE_WARN' && l.level === 'warn')).toBeDefined();
        cap.restore();
    });

    it('entegrasyon kimliği (integrationCode) anahtara girer: aynı tenant farklı pazaryeri karışmaz', async () => {
        await new Svc('A', 'trendyol').list();
        await new Svc('A', 'hepsiburada').list();
        expect(runs).toBe(2);
    });

    it('scope zorunlu: eksik/yanlış scope dekorasyon anında hata verir', () => {
        expect(() => Cache({ ttl: '1m', context: 'x' } as any)).toThrow(/scope/);
        expect(() => Cache({ scope: 'shared', ttl: '1m', context: 'x' } as any)).toThrow(/scope/);
    });

    it('TTL üst sınırları: tenant <= 600 sn, global <= 24 sa', () => {
        expect(() => Cache({ scope: 'tenant', ttl: '11m', context: 'x' })).toThrow(/üst sınır/);
        expect(() => Cache({ scope: 'global', ttl: '25h', context: 'x' })).toThrow(/üst sınır/);
        expect(() => Cache({ scope: 'global', ttl: '24h', context: 'x' })).not.toThrow();
    });

    it('global kapsam: tüm tenantlar için tek girdi, anahtar tenant içermez', async () => {
        await new Svc('A').tree();
        await new Svc('B').tree();
        expect(runs).toBe(1);
        expect(nodeCache.keys()[0].startsWith('g:')).toBe(true);
    });

    it('serileştirilemeyen argüman (fonksiyon / döngüsel) cache atlanır, metot yine çalışır', async () => {
        const cap = captureLogs();
        const cyc: any = {}; cyc.self = cyc;
        const s = new Svc('A');
        await s.withFn(() => 1);
        await s.withFn(cyc);
        expect(runs).toBe(2);
        expect(nodeCache.keys()).toEqual([]);
        cap.restore();
    });
});

describe('değer semantiği', () => {
    it('0, false ve boş dizi doğru cachelenir', async () => {
        const s = new Svc('A');
        expect(await s.count()).toBe(0); expect(await s.count()).toBe(0);
        expect(await s.flag()).toBe(false); expect(await s.flag()).toBe(false);
        expect(await s.empty()).toEqual([]); expect(await s.empty()).toEqual([]);
        expect(runs).toBe(3);
    });

    it('boş dizi kısa TTL ile (<=30 sn) tutulur; dolu dizi tam TTL ile', async () => {
        const s = new Svc('A');
        await s.empty(); await s.list();
        const ttls = nodeCache.keys().map((k) => ({ k, left: nodeCache.getTtl(k)! - Date.now() }));
        const empty = ttls.find((t) => t.k.includes('.empty:'))!;
        const full = ttls.find((t) => t.k.includes('.list:'))!;
        expect(empty.left).toBeLessThanOrEqual(30_000);
        expect(full.left).toBeGreaterThan(200_000);
    });

    it('negatif cache: null/undefined yalnız negativeTtl verilmişse ve kısa TTL ile', async () => {
        const s = new Svc('A');
        expect(await s.maybe(null)).toBeNull();
        expect(await s.maybe(null)).toBeNull();
        expect(await s.maybe(undefined)).toBeUndefined();
        expect(await s.maybe(undefined)).toBeUndefined();
        expect(runs).toBe(2);
        const left = nodeCache.getTtl(nodeCache.keys()[0])! - Date.now();
        expect(left).toBeLessThanOrEqual(10_000);
    });
});

describe('single-flight ve jitter', () => {
    it('aynı anahtara eşzamanlı istekler tek hesaplamayı bekler; sonuç sonra hit', async () => {
        const s = new Svc('A');
        const ps = [s.gated(), s.gated(), s.gated()];
        await Promise.resolve(); await Promise.resolve();
        gate.release!();
        const res = await Promise.all(ps);
        expect(runs).toBe(1);
        expect(res.every((r) => r.ok === 1)).toBe(true);
        await s.gated();
        expect(runs).toBe(1);
        const m = getCacheMetrics().families['svc.Svc.gated'];
        expect(m.join).toBe(2);
        expect(m.miss).toBe(1);
    });

    it('farklı tenantlar için single-flight paylaşılmaz', async () => {
        const a = new Svc('A').boom().catch(() => 'a');
        const b = new Svc('B').boom().catch(() => 'b');
        await Promise.all([a, b]);
        expect(runs).toBe(2);
    });

    it('hata: bekleyen herkese yayılır, cachelenmez, inflight temizlenir (sonraki çağrı yeniden dener)', async () => {
        const s = new Svc('A');
        const r = await Promise.allSettled([s.boom(), s.boom()]);
        expect(r.every((x) => x.status === 'rejected')).toBe(true);
        expect(runs).toBe(1);
        await expect(s.boom()).rejects.toThrow('upstream');
        expect(runs).toBe(2);
        expect(nodeCache.keys()).toEqual([]);
        expect(getCacheMetrics().inflight).toBe(0);
    });

    it('TTL jitter yalnız AŞAĞI oynatır: kayıt TTL tavanını aşmaz, en az %90', async () => {
        configureCache({ jitter: 0.1 });
        const now = 1_700_000_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        const lefts = new Set<number>();
        for (let i = 0; i < 20; i++) {
            await new Svc('A').list(i);
        }
        for (const k of nodeCache.keys()) lefts.add(nodeCache.getTtl(k)! - now);
        for (const l of lefts) { expect(l).toBeLessThanOrEqual(300_000); expect(l).toBeGreaterThanOrEqual(270_000 - 1000); }
        expect(lefts.size).toBeGreaterThan(1);
        jest.restoreAllMocks();
    });
});

describe('LRU / maxKeys', () => {
    it('sınır aşılınca en az kullanılan girdi atılır; erişilen kalır; evict sayılır', async () => {
        configureCache({ maxKeys: 3 });
        const s = new Svc('A');
        await s.list(1); await s.list(2); await s.list(3);
        await s.list(1);            // 1 yeniden kullanıldı
        await s.list(4);            // 2 atılmalı
        expect(nodeCache.keys()).toHaveLength(3);
        runs = 0;
        await s.list(1); await s.list(3); await s.list(4);
        expect(runs).toBe(0);
        await s.list(2);
        expect(runs).toBe(1);
        expect(getCacheMetrics().families['svc.Svc.list'].evict).toBeGreaterThanOrEqual(1);
        expect(getCacheMetrics().size).toBeLessThanOrEqual(3);
    });
});

describe('metrikler', () => {
    it('aile bazında hit/miss/set/error sayaçları, hitRatio ve snapshot() takma adı', async () => {
        const s = new Svc('A');
        await s.count(); await s.count(); await s.count();
        await s.boom().catch(() => undefined);
        const m = getCacheMetrics();
        expect(m.families['svc.Svc.count']).toMatchObject({ hit: 2, miss: 1, set: 1 });
        expect(m.families['svc.Svc.count'].hitRatio).toBeCloseTo(2 / 3);
        expect(m.families['svc.Svc.boom'].error).toBe(1);
        expect(m.totals.hit).toBe(2);
        expect(snapshot().maxKeys).toBeGreaterThan(0);
    });

    it('metrik sink (MetricsRegistry köprüsü) olayları alır; sink hatası ana akışı bozmaz', async () => {
        const events: string[] = [];
        setCacheMetricSink((f, e) => { events.push(`${f}:${e}`); });
        await new Svc('A').count(); await new Svc('A').count();
        expect(events).toEqual(expect.arrayContaining(['svc.Svc.count:miss', 'svc.Svc.count:set', 'svc.Svc.count:hit']));
        setCacheMetricSink(() => { throw new Error('sink down'); });
        await expect(new Svc('A').flag()).resolves.toBe(false);
        setCacheMetricSink(undefined);
    });
});

describe('invalidation', () => {
    it('invalidateTenantCache yalnız o tenantın kayıtlarını düşer (bağlam öneki ile daraltılabilir)', async () => {
        await new Svc('A').list(); await new Svc('A').otherFamily(); await new Svc('B').list();
        expect(invalidateTenantCache('A', 'svc')).toBe(1);
        expect(nodeCache.keys().some((k) => k.startsWith('t:A:') && k.includes('other'))).toBe(true);
        expect(invalidateTenantCache('A')).toBe(1);
        expect(nodeCache.keys().every((k) => k.startsWith('t:B:'))).toBe(true);
    });

    it('invalidateCache(family, tenant): aile bazlı ve tenant kapsamlı; globali etkilemez', async () => {
        await new Svc('A').list(); await new Svc('B').list(); await new Svc('A').tree();
        expect(invalidateCache('svc.Svc.list', 'A')).toBe(1);
        expect(invalidateCache('svc.Svc.list')).toBe(1); // B
        expect(nodeCache.keys().some((k) => k.startsWith('g:'))).toBe(true);
    });

    it('yazma yolu dekoratörü: başarıdan SONRA o tenantın ailesini düşer', async () => {
        const s = new Svc('A');
        await s.list();
        expect(await s.write()).toBe('done');
        await s.list();
        expect(runs).toBe(2);
    });

    it('uçuştaki hesaplamanın bayat sonucu invalidation sonrası cachelenmez', async () => {
        const s = new Svc('A');
        const p = s.gated();
        await Promise.resolve(); await Promise.resolve();
        invalidateTenantCache('A');
        gate.release!();
        await p;
        expect(nodeCache.keys()).toEqual([]);
    });
});

describe('yardımcılar', () => {
    it('durationToSeconds birimleri', () => {
        expect(durationToSeconds('30s')).toBe(30);
        expect(durationToSeconds('10m')).toBe(600);
        expect(durationToSeconds('12h')).toBe(43200);
        expect(durationToSeconds(45)).toBe(45);
    });
});

describe('kaynak ağacı mandalları (ADR-0002 Karar 5)', () => {
    function walk(dir: string, out: string[] = []): string[] {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p, out); else if (p.endsWith('.ts')) out.push(p);
        }
        return out;
    }
    const files = walk(path.resolve(__dirname, '../../../src'));
    const uses: { file: string; method: string; scope: string }[] = [];
    for (const f of files) {
        if (f.replace(/\\/g, '/').endsWith('utils/decorator/cache.ts')) continue;
        const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        lines.forEach((l, i) => {
            if (!/^\s*@Cache\(/.test(l)) return;
            const scope = /scope:\s*'(tenant|global)'/.exec(l)?.[1] ?? 'YOK';
            const next = lines.slice(i + 1, i + 4).join(' ');
            const m = /(?:async|private|public)\s+(?:async\s+)?([A-Za-z0-9_]+)\s*\(/.exec(next);
            uses.push({ file: path.relative(path.resolve(__dirname, '../../..'), f).replace(/\\/g, '/'), method: m?.[1] ?? '?', scope });
        });
    }

    it('her @Cache kullanımı açık scope taşır ve eski imza (sayısal ilk argüman) kalmamıştır', () => {
        expect(uses.length).toBeGreaterThan(0);
        expect(uses.filter((u) => u.scope === 'YOK')).toEqual([]);
    });

    it('sipariş/iade/müşteri/mesaj/finans/fatura/stok/fiyat/kullanıcı metotları cachelenemez', () => {
        const forbidden = /(order|claim|customer|message|financ|invoice|stock|price|user)/i;
        expect(uses.filter((u) => forbidden.test(u.method))).toEqual([]);
    });

    it('global kapsam yalnız pazaryeri katalog (CategoryService) dosyalarında kullanılır', () => {
        const globals = uses.filter((u) => u.scope === 'global');
        expect(globals.length).toBeGreaterThan(0);
        expect(globals.every((u) => /marketplace\/[a-z0-9]+\/services\/CategoryService\.ts$/.test(u.file))).toBe(true);
    });
});
