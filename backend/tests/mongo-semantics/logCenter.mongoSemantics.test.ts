/**
 * ADR-0026 WP-LOG L1: LogEvents sorgu servisi + ErrorEvents gruplama (tenant sayisi, gunluk trend) BELLEK-ICI (gecici) MongoDB'ye karsi.
 * Gercek/yerel DB'ye BAGLANMAZ (mongodb-memory-server izole surec). Veriler sentetiktir.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';
import { LogEventSchema } from '@database/application/models/LogEvent';
import { ErrorEventSchema } from '@database/application/models/ErrorEvent';
import { buildErrorEventUpsertOp, tenantBucketOf } from '@platform/runtime/metrics/errorEvents';
import { LogWriter } from '@platform/runtime/logs/LogWriter';
import { listLogs, getIssueGroups, getIssueTrend, getTrace, getVolumeByCategory, QUERY_MAX_TIME_MS, MAX_PAGE_SIZE, LogQueryError } from '@platform/runtime/logs/logQuery';

jestGlobal.setTimeout(120000);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mig = require('../../migrations/0005-log-events-app');

let mongod: any; let conn: mongoose.Connection; let Log: any; let Err: any;
const NOW = new Date('2026-09-30T12:00:00Z');
const deps = () => ({ logModel: Log, errorModel: Err, now: () => NOW });
const at = (minAgo: number) => new Date(NOW.getTime() - minAgo * 60_000);
const doc = (o: any) => ({ level: 'error', ts: at(1), expAt: new Date(NOW.getTime() + 864e5), ...o });

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'zzTest_logcenter').asPromise();
    Log = conn.model('log_event', LogEventSchema);
    Err = conn.model('error_event', ErrorEventSchema);
});
afterAll(async () => { await conn?.dropDatabase(); await conn?.close(); await mongod?.stop(); });

describe('LogEvents sorgu servisi', () => {
    beforeAll(async () => {
        const rows: any[] = [];
        for (let i = 0; i < 260; i++) rows.push(doc({ ts: at(i % 50 + 1), msg: `siparis alinamadi ${i}`, source: i % 2 ? 'engine' : 'api', level: i % 5 === 0 ? 'warn' : 'error', tenantId: i % 3, correlationId: i < 3 ? 'corr-trace-1' : `c${i}`, fingerprint: 'fpA', errorClass: 'TypeError' }));
        rows.push(doc({ ts: at(2), msg: 'stok esitleme basarisiz', source: 'adapter-trendyol', integrationCode: 'trendyol', operation: 'stock.sync', fingerprint: 'fpB' }));
        rows.push(doc({ ts: at(60 * 24 * 3), msg: 'eski kayit', source: 'api' })); // aralik disi
        await Log.insertMany(rows);
    });

    it('filtreler: seviye/kaynak/tenant/entegrasyon/fingerprint/metin oneki', async () => {
        expect((await listLogs({ integrationCode: 'trendyol' }, undefined, deps())).items).toHaveLength(1);
        expect((await listLogs({ textPrefix: 'stok es' }, undefined, deps())).items.map((x) => x.fingerprint)).toEqual(['fpB']);
        const w = await listLogs({ level: ['warn'], source: ['engine'], limit: 200 }, undefined, deps());
        expect(w.items.every((x) => x.level === 'warn' && x.source === 'engine')).toBe(true);
        expect((await listLogs({ tenantId: 1, fingerprint: 'fpA', limit: 200 }, undefined, deps())).items.every((x) => x.tenantId === 1)).toBe(true);
        expect((await listLogs({ operation: 'stock.sync' }, undefined, deps())).items).toHaveLength(1);
    });

    it('varsayilan aralik son 24 saat (eski kayit gelmez); sayfa <=200; imlec ile tam tarama, tekrarsiz', async () => {
        const seen = new Set<string>(); let cursor: string | undefined; let pages = 0;
        do {
            const p = await listLogs({ limit: 100 }, cursor, deps());
            expect(p.items.length).toBeLessThanOrEqual(100);
            for (const it of p.items) { expect(seen.has(it._id)).toBe(false); seen.add(it._id); expect(it.msg).not.toBe('eski kayit'); }
            cursor = p.nextCursor; pages++;
        } while (cursor && pages < 10);
        expect(seen.size).toBe(261);
        expect((await listLogs({ limit: 99999 }, undefined, deps())).items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
        // sirali: ts azalan
        const p = await listLogs({ limit: 50 }, undefined, deps());
        const ts = p.items.map((x) => +x.ts); expect([...ts].sort((a, b) => b - a)).toEqual(ts);
    });

    it('enjeksiyon/gecersiz girdi reddedilir (operator nesnesi, bozuk imlec, ters aralik)', async () => {
        await expect(listLogs({ correlationId: { $ne: null } as any }, undefined, deps())).rejects.toThrow(LogQueryError);
        await expect(listLogs({ level: [{ $ne: 'x' }] as any }, undefined, deps())).rejects.toThrow(LogQueryError);
        await expect(listLogs({}, 'not-a-cursor', deps())).rejects.toThrow(LogQueryError);
        await expect(listLogs({ from: at(1), to: at(10) }, undefined, deps())).rejects.toThrow(LogQueryError);
        await expect(getTrace({ $ne: 1 } as any, deps())).rejects.toThrow(LogQueryError);
    });

    it('getTrace: correlationId ile zaman sirali iz', async () => {
        const t = await getTrace('corr-trace-1', deps());
        expect(t).toHaveLength(3);
        expect(t.map((x) => +x.ts)).toEqual([...t.map((x) => +x.ts)].sort((a, b) => a - b));
    });

    it('getVolumeByCategory: kaynak x seviye hacmi', async () => {
        const v = await getVolumeByCategory({}, deps());
        expect(v.reduce((s, x) => s + x.count, 0)).toBe(261);
        expect(v.find((x) => x.source === 'adapter-trendyol')).toMatchObject({ level: 'error', count: 1 });
        expect(v[0].count).toBeGreaterThanOrEqual(v[v.length - 1].count);
    });

    it('her sorgu maxTimeMS tasir (find + aggregate)', async () => {
        const calls: Array<[string, number | undefined]> = [];
        const realFind = Log.find.bind(Log); const realAgg = Log.aggregate.bind(Log);
        const spyFind = jestGlobal.spyOn(Log, 'find').mockImplementation(((...a: any[]) => {
            const q = realFind(...a); const orig = q.maxTimeMS.bind(q);
            q.maxTimeMS = (ms: number) => { calls.push(['find', ms]); return orig(ms); }; return q;
        }) as any);
        const spyAgg = jestGlobal.spyOn(Log, 'aggregate').mockImplementation(((...a: any[]) => {
            const q = realAgg(...a); const orig = q.option.bind(q);
            q.option = (o: any) => { calls.push(['agg', o.maxTimeMS]); return orig(o); }; return q;
        }) as any);
        try {
            await listLogs({}, undefined, deps());
            await getTrace('corr-trace-1', deps());
            await getVolumeByCategory({}, deps());
        } finally { spyFind.mockRestore(); spyAgg.mockRestore(); }
        expect(calls.length).toBe(3);
        expect(calls.every(([, ms]) => ms === QUERY_MAX_TIME_MS)).toBe(true);
    });
});

describe('ErrorEvents gruplama: tenant sayisi + gunluk trend (pipeline upsert)', () => {
    const input = (tenantId: number | undefined) => ({ source: 'server' as const, module: 'M', code: 'C', message: 'hata', tenantId });
    async function upsert(fp: string, tenantIds: Array<number | undefined>, inc: number, now: Date, base: any = input(undefined)) {
        const buckets = tenantIds.filter((t): t is number => t !== undefined).map(tenantBucketOf);
        const op = buildErrorEventUpsertOp(fp, base, inc, now, buckets);
        await Err.collection.findOneAndUpdate(op.filter, op.pipeline as any, { upsert: true });
    }

    it('tenant kimligi SAKLANMAZ; tahmini sayi ~ gercek; ayni tenant tekrari sayiyi artirmaz', async () => {
        for (let t = 1; t <= 40; t++) await upsert('server::A', [t], 1, at(5));
        await upsert('server::A', [1, 2, 3], 3, at(4)); // tekrar
        const d: any = await Err.collection.findOne({ fp: 'server::A' });
        expect(d.count).toBe(43);
        expect(d.tenantCount).toBeGreaterThanOrEqual(36);
        expect(d.tenantCount).toBeLessThanOrEqual(44);
        expect(JSON.stringify(d)).not.toMatch(/"tenantId"\s*:\s*[1-9]/);
        expect(d.tenantBuckets.length).toBeLessThanOrEqual(256);
    });

    it('tenantsiz hata: tenantCount 0', async () => {
        await upsert('server::B', [], 1, at(5));
        expect(((await Err.collection.findOne({ fp: 'server::B' })) as any).tenantCount).toBe(0);
    });

    it('gunluk kovalar: ayni gun toplanir, yeni gun eklenir, 30 gunden eski kovalar atilir; ilk/son gorulme + resolved->open korunur', async () => {
        const d0 = new Date('2026-08-01T10:00:00Z'); const d1 = new Date('2026-09-29T10:00:00Z'); const d2 = new Date('2026-09-30T09:00:00Z');
        await upsert('server::C', [], 2, d0);
        await Err.collection.updateOne({ fp: 'server::C' }, { $set: { status: 'resolved' } });
        await upsert('server::C', [], 3, d1);
        await upsert('server::C', [], 4, d1);
        await upsert('server::C', [], 1, d2);
        const d: any = await Err.collection.findOne({ fp: 'server::C' });
        expect(d.daily).toEqual([{ d: '2026-09-29', n: 7 }, { d: '2026-09-30', n: 1 }]);
        expect(d.count).toBe(10);
        expect(d.firstSeen).toEqual(d0);
        expect(d.lastSeen).toEqual(d2);
        expect(d.status).toBe('open');
    });

    it('getIssueGroups: siralama (lastSeen/count/tenantCount/firstSeen), aralik, filtre, sonuc siniri; tenantBuckets sizmaz', async () => {
        const g = await getIssueGroups({ sort: 'tenantCount', from: at(60 * 24) }, deps());
        expect(g[0].fp).toBe('server::A');
        expect(g[0]).not.toHaveProperty('tenantBuckets');
        expect(g.map((x) => x.fp)).toContain('server::B');
        const byCount = await getIssueGroups({ sort: 'count', from: at(60 * 24) }, deps());
        expect(byCount[0].fp).toBe('server::A');
        expect((await getIssueGroups({ status: 'open', from: at(60 * 24), limit: 1 }, deps()))).toHaveLength(1);
        expect((await getIssueGroups({ source: 'client', from: at(60 * 24) }, deps()))).toHaveLength(0);
        await expect(getIssueGroups({ sort: 'x' as any }, deps())).rejects.toThrow(LogQueryError);
        const c = (await getIssueGroups({ from: new Date('2026-09-29T00:00:00Z') }, deps())).find((x) => x.fp === 'server::C')!;
        expect(c.rangeCount).toBe(8); // 29 + 30 Eylul kovalari
    });

    it('getIssueTrend: ErrorEvents.daily -> bos gunler 0; kayit yoksa LogEvents.fingerprint toplamasi', async () => {
        const t = await getIssueTrend('server::C', { from: new Date('2026-09-28T00:00:00Z') }, deps());
        expect(t).toEqual([{ day: '2026-09-28', count: 0 }, { day: '2026-09-29', count: 7 }, { day: '2026-09-30', count: 1 }]);
        const fromLogs = await getIssueTrend('fpA', { from: new Date('2026-09-29T00:00:00Z') }, deps());
        expect(fromLogs.reduce((s, x) => s + x.count, 0)).toBe(260);
    });
});

describe('uctan uca: LogWriter -> LogEvents (gercek insertMany) -> listLogs', () => {
    it('yazici belgesi semaya uyar (strict) ve sorguda bulunur', async () => {
        const w = new LogWriter({ model: Log });
        w.offer({ level: 'error', msg: 'uctan uca ali@example.com', fields: { code: 'E2E', tenantId: 7, correlationId: 'e2e-corr-1', fingerprint: 'fpE2E', durationMs: 12, extra: 1 }, bindings: { module: 'X' } });
        await w.close(2000);
        if (w.stats().failed) throw new Error('insert failed: ' + JSON.stringify(w.stats()));
        const t = await getTrace('e2e-corr-1', { ...deps(), now: () => new Date() });
        expect(t).toHaveLength(1);
        expect(t[0]).toMatchObject({ code: 'E2E', tenantId: 7, module: 'X', durationMs: 12 });
        expect(t[0].msg).not.toContain('ali@example.com');
        expect(+t[0].expAt - +t[0].ts).toBe(14 * 864e5);
    });
});

describe('0005-log-events-app gocu (up -> down -> up)', () => {
    it('indeksler (TTL dahil) kurulur/duser, idempotent; sema autoIndex kapali', async () => {
        const c2 = await mongoose.createConnection(mongod.getUri() + 'zzTest_logmig').asPromise();
        try {
            const c = { connection: c2, collectionOverrides: { logEvents: 'zzTest_LogEvents' } };
            const names = async () => (await c2.db!.collection('zzTest_LogEvents').indexes()).map((i: any) => i.name).sort();
            await mig.up(c); await mig.up(c);
            expect(await names()).toEqual(['_id_', 'correlationId_1', 'expAt_1', 'fingerprint_1_ts_-1', 'source_1_level_1_ts_-1', 'tenantId_1_ts_-1', 'ts_-1']);
            const ttl = (await c2.db!.collection('zzTest_LogEvents').indexes()).find((i: any) => i.name === 'expAt_1');
            expect(ttl!.expireAfterSeconds).toBe(0);
            await mig.down(c);
            expect(await names()).toEqual(['_id_']);
            await mig.up(c);
            expect((await mig.plan(c)).collections.every((x: any) => x.toCreate.length === 0)).toBe(true);
        } finally { await c2.dropDatabase(); await c2.close(); }
        expect(LogEventSchema.get('autoIndex')).toBe(false);
    });
});

describe('0007-error-events-ttl-90d-app gocu (RET-01: up -> down -> up)', () => {
    it('TTL 30g -> 90g (collMod) -> 30g -> 90g; yoksa olusturur; sema autoIndex degismedi', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mig7 = require('../../migrations/0007-error-events-ttl-90d-app');
        const c2 = await mongoose.createConnection(mongod.getUri() + 'zzTest_errttl').asPromise();
        try {
            const c = { connection: c2, collectionOverrides: { errorEvents: 'zzTest_ErrorEvents' } };
            const col = c2.db!.collection('zzTest_ErrorEvents');
            const ttl = async () => (await col.indexes()).find((i: any) => i.name === 'lastSeen_1')?.expireAfterSeconds;
            // mevcut durum: eski 30 gunluk indeks
            await c2.createCollection('zzTest_ErrorEvents');
            await col.createIndex({ lastSeen: 1 }, { name: 'lastSeen_1', expireAfterSeconds: 2592000 });
            expect((await mig7.plan(c)).collections[0]).toMatchObject({ current: 2592000, target: 7776000, action: 'collMod' });
            await mig7.up(c); await mig7.up(c); // idempotent
            expect(await ttl()).toBe(7776000);
            expect((await mig7.plan(c)).collections[0].action).toBe('noop');
            await mig7.down(c);
            expect(await ttl()).toBe(2592000);
            await mig7.up(c);
            expect(await ttl()).toBe(7776000);
            // indeks hic yoksa olusturur
            await col.dropIndex('lastSeen_1');
            expect((await mig7.up(c)).collections[0].action).toBe('created');
            expect(await ttl()).toBe(7776000);
        } finally { await c2.dropDatabase(); await c2.close(); }
        expect(ErrorEventSchema.indexes().find(([f]: any) => f.lastSeen === 1 && Object.keys(f).length === 1)![1]!.expireAfterSeconds).toBe(7776000);
    });
});
