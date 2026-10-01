// Backoffice B5/B6/B6b + B8a-d + B9: yetenek kaydi/sema/kademe, Redis/cache/resilience/yavas-sorgu mantigi, sizinti kurallari. DB/Redis YOK (sahte bagimliliklar).
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BACKOFFICE_INFRA_RPC_INPUT } from '../../../../src/capabilities/rpc-input/backoffice-infra';
import { getRequiredTier } from '../../../../src/api/operationPolicy';
import { requiresStepUp } from '../../../../src/api/admin/stepUp';
import { CAPABILITY_BY_RPC } from '../../../../src/capabilities';
import { getRedisStatus, familyOfRedisKey, parseInfo } from '../../../../src/operations/backoffice/redisStatus';
import { readResilienceState } from '../../../../src/operations/backoffice/resilienceState';
import { p95FromBuckets } from '../../../../src/operations/backoffice/apiHealth';
import { buildSlowQueries, p95OfHistogram } from '../../../../src/operations/backoffice/slowQueries';
import { isBackofficeDbAllowed, resolveTargetDbName, getMongoStatus } from '../../../../src/operations/backoffice/mongoStatus';
import { writeResilienceSnapshot, buildResilienceSnapshot } from '../../../../src/integration/modules/common/http/resilienceSnapshot';
import { ResilientHttpClient } from '../../../../src/integration/modules/common/http/ResilientHttpClient';
import { recordSlowQuery, SLOW_QUERY_METRIC, setSlowQueryAppDbName } from '../../../../src/platform/runtime/metrics/slowQueryPlugin';
import { metricsRegistry } from '../../../../src/platform/runtime/metrics/MetricsRegistry';
import { nodeCache, resetCacheForTests } from '../../../../src/utils/decorator/cache';
import BackofficeInfraService from '../../../../src/api/services/backoffice-infra-service';
import IntegrationConfigService from '../../../../src/api/services/integration-config-service';

const RPCS = [
    'BackofficeIntegrationService/getApiHealth', 'BackofficeIntegrationService/getResilienceState', 'IntegrationConfigService/getCatalog',
    'BackofficeInfraService/getRedisStatus', 'BackofficeInfraService/getMongoStatus', 'BackofficeInfraService/getMongoCollections',
    'BackofficeInfraService/getSlowQueries', 'BackofficeInfraService/getCacheMetrics', 'BackofficeInfraService/flushCacheFamily',
];

describe('yetenek kaydi + sema', () => {
    it('tum uclar platformAdmin, backoffice semali, MCP kapali', () => {
        for (const rpc of RPCS) {
            const [s, o] = rpc.split('/');
            expect(getRequiredTier(s, o)).toBe('platformAdmin');
            expect(BACKOFFICE_INFRA_RPC_INPUT[rpc as any]).toBeDefined();
            expect((CAPABILITY_BY_RPC.get(rpc)?.mcp as any).notExposed.reason).toBe('platform_admin');
        }
    });
    it('flushCacheFamily step-up ister; okumalar istemez', () => {
        expect(requiresStepUp('BackofficeInfraService/flushCacheFamily')).toBe(true);
        for (const rpc of RPCS.filter((r) => !r.endsWith('flushCacheFamily'))) expect(requiresStepUp(rpc)).toBe(false);
    });
    it('sema: bilinmeyen alan, operator nesnesi, sayfa>200, bos gerekce reddedilir', () => {
        const S = BACKOFFICE_INFRA_RPC_INPUT;
        expect(S['BackofficeIntegrationService/getApiHealth']!.safeParse({ range: '24h', integrationCode: 'trendyol' }).success).toBe(true);
        expect(S['BackofficeIntegrationService/getApiHealth']!.safeParse({ range: '99d' }).success).toBe(false);
        expect(S['BackofficeIntegrationService/getApiHealth']!.safeParse({ range: '1h', integrationCode: { $ne: 1 } }).success).toBe(false);
        expect(S['BackofficeIntegrationService/getApiHealth']!.safeParse({ range: '1h', evil: 1 }).success).toBe(false);
        expect(S['BackofficeInfraService/getMongoCollections']!.safeParse({ db: 'app', limit: 200 }).success).toBe(true);
        expect(S['BackofficeInfraService/getMongoCollections']!.safeParse({ db: 7 }).success).toBe(true);
        expect(S['BackofficeInfraService/getMongoCollections']!.safeParse({ db: 'admin' }).success).toBe(false);
        expect(S['BackofficeInfraService/getMongoCollections']!.safeParse({ db: 'app', limit: 201 }).success).toBe(false);
        expect(S['BackofficeInfraService/flushCacheFamily']!.safeParse({ family: 'a.B.c', reason: 'x' }).success).toBe(true);
        expect(S['BackofficeInfraService/flushCacheFamily']!.safeParse({ family: 'a.B.c' }).success).toBe(false);
        expect(S['BackofficeInfraService/flushCacheFamily']!.safeParse({ family: 'a:b', reason: 'x' }).success).toBe(false);
        expect(S['BackofficeInfraService/getSlowQueries']!.safeParse({ range: '30d' }).success).toBe(true);
    });
});

describe('B6b getCatalog', () => {
    it('metaveri doner; zod semasi, consumers ve deger yok; target filtreler', async () => {
        const svc: any = new (IntegrationConfigService as any)();
        svc.request = {};
        const all = await svc.getCatalog();
        expect(all.catalogVersion).toBeTruthy();
        expect(all.items.length).toBeGreaterThan(50);
        const first = all.items[0];
        expect(first.label.tr).toBeTruthy();
        for (const it of all.items) { expect(it.schema).toBeUndefined(); expect(it.consumers).toBeUndefined(); }
        svc.request = { target: '_platform' };
        const plat = await svc.getCatalog();
        expect(plat.items.length).toBeGreaterThan(0);
        expect(plat.items.every((i: any) => i.scope === 'platform')).toBe(true);
        svc.request = { target: 'yok-boyle-bir-hedef' };
        await expect(svc.getCatalog()).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('B8a Redis', () => {
    const INFO = ['# Server', 'redis_version:7.2.4', 'uptime_in_seconds:1000', '# Memory', 'used_memory:1000', 'used_memory_peak:2000', 'maxmemory:0', 'mem_fragmentation_ratio:1.1', 'maxmemory_policy:noeviction',
        '# Clients', 'connected_clients:3', 'blocked_clients:0', '# Stats', 'instantaneous_ops_per_sec:5', 'keyspace_hits:10', 'keyspace_misses:2', 'expired_keys:1', 'evicted_keys:0',
        'requirepass_secret:SHOULD_NOT_LEAK', '# Keyspace', 'db0:keys=5,expires=2,avg_ttl=0'].join('\r\n');
    const makeRedis = (keys: string[], opts: { pages?: number } = {}) => {
        const calls: string[] = [];
        let page = 0;
        const per = Math.ceil(keys.length / (opts.pages ?? 1));
        return {
            calls,
            info: async () => { calls.push('INFO'); return INFO; },
            scan: async (_c: string, ..._a: any[]) => { calls.push('SCAN'); const b = keys.slice(page * per, (page + 1) * per); page++; return [page * per >= keys.length ? '0' : String(page), b] as [string, string[]]; },
            call: async (cmd: string, ...a: any[]) => { calls.push(`${cmd} ${a[0]}`); return [[1, 1700000000, 1234, ['KEYS', 'tenant:secret:*']]]; },
        };
    };
    it('izinli alanlar + aile sayilari; anahtar adi/slowlog argumani sizmaz; yalniz INFO/SCAN/SLOWLOG GET', async () => {
        const r = makeRedis(['bull:order-sync-queue:1', 'bull:order-sync-queue:2', 'lock:tenant:5', 'cache:abc', 'weird key:1']);
        const out: any = await getRedisStatus(r);
        expect(out.server).toEqual({ version: '7.2.4', uptimeSeconds: 1000 });
        expect(out.keyspace).toEqual([{ db: 'db0', keys: 5, expires: 2 }]);
        expect(out.keyFamilies.items).toEqual(expect.arrayContaining([{ family: 'bull:order-sync-queue', count: 2 }, { family: 'lock', count: 1 }, { family: 'cache', count: 1 }, { family: 'other', count: 1 }]));
        expect(out.slowlog).toEqual([{ command: 'KEYS', durationMicros: 1234, at: '2023-11-14T22:13:20.000Z' }]);
        const json = JSON.stringify(out);
        expect(json).not.toContain('SHOULD_NOT_LEAK'); expect(json).not.toContain('tenant:secret'); expect(json).not.toContain('order-sync-queue:1');
        expect(new Set(r.calls)).toEqual(new Set(['INFO', 'SCAN', 'SLOWLOG GET']));
    });
    it('SCAN butcesi: 10.000 anahtar ustu kesilir (truncated)', async () => {
        const keys = Array.from({ length: 12000 }, (_, i) => `k${i % 3}:${i}`);
        const out: any = await getRedisStatus(makeRedis(keys, { pages: 24 }));
        expect(out.keyFamilies.truncated).toBe(true);
        expect(out.keyFamilies.sampled).toBeLessThanOrEqual(10500);
    });
    it('SCAN zaman butcesi (200 ms) asilinca durur', async () => {
        let t = 0;
        const out: any = await getRedisStatus(makeRedis(Array.from({ length: 100 }, (_, i) => `a:${i}`), { pages: 10 }), () => (t += 150));
        expect(out.keyFamilies.truncated).toBe(true);
    });
    it('parseInfo/familyOfRedisKey', () => {
        expect(parseInfo('# x\r\na:1\r\nb:2:3')).toEqual({ a: '1', b: '2:3' });
        expect(familyOfRedisKey('bull:q:1')).toBe('bull:q');
        expect(familyOfRedisKey(':x')).toBe('other');
    });
});

describe('B6 dayaniklilik', () => {
    beforeEach(() => { ResilientHttpClient.resetAllState(); });
    it('snapshotState: tenant kimligi yok, sayilar var', async () => {
        const c = new ResilientHttpClient('trendyol', 77, { ratePerMin: 60 });
        // durum olusturmak icin dahili getAdapterState/getBreaker cagrilir
        (c as any).getBreaker('read');
        (c as any).getAdapterState().limiter.onRateLimited();
        const snap = ResilientHttpClient.snapshotState();
        expect(snap).toHaveLength(1);
        expect(snap[0]).toMatchObject({ integrationCode: 'trendyol', circuits: { closed: 1, open: 0, half_open: 0 }, rate: { limited: 1, tenants: 1, minRatio: 0.5 }, lastOpenedAt: null });
        expect(JSON.stringify(buildResilienceSnapshot())).not.toContain('77');
    });
    it('writeResilienceSnapshot: resilience:<pod> anahtari, 60 sn TTL; Redis yoksa/hatada false', async () => {
        const set = jest.fn(async () => 'OK');
        expect(await writeResilienceSnapshot({ set } as any, new Date('2026-09-30T10:00:00Z'), 'pod-a')).toBe(true);
        expect(set).toHaveBeenCalledWith('resilience:pod-a', expect.any(String), 'EX', 60);
        expect(await writeResilienceSnapshot(undefined)).toBe(false);
        expect(await writeResilienceSnapshot({ set: async () => { throw new Error('x'); } } as any)).toBe(false);
    });
    it('readResilienceState: podlar birlestirilir, eksik pod icin varsayilan, bozuk kayit atlanir', async () => {
        const snapA = { pod: 'a', at: '2026-09-30T10:00:00.000Z', integrations: [{ integrationCode: 'trendyol', circuits: { closed: 1, open: 1, half_open: 0 }, rate: { limited: 0, tenants: 2, minRatio: 1 }, lastOpenedAt: 1780000000000 }], intake: { trendyol: 'drain', _engine: 'off' } };
        const snapB = { pod: 'b', at: '2026-09-30T10:00:05.000Z', integrations: [], intake: {} };
        const store: Record<string, string> = { 'resilience:a': JSON.stringify(snapA), 'resilience:b': JSON.stringify(snapB), 'resilience:c': '{bozuk' };
        const redis = { scan: async () => ['0', Object.keys(store)] as [string, string[]], mget: async (...k: string[]) => k.map((x) => store[x] ?? null) };
        const out = await readResilienceState(redis);
        expect(out.pods.map((p) => p.pod)).toEqual(['a', 'b']);
        expect(out.pods[0].engineIntake).toBe('off');
        expect(out.items).toHaveLength(1);
        expect(out.items[0].pods[0]).toMatchObject({ pod: 'a', intake: 'drain', circuits: { open: 1 } });
        expect(out.items[0].pods[1]).toMatchObject({ pod: 'b', intake: 'on', circuits: { closed: 0, open: 0, half_open: 0 }, lastOpenedAt: null });
        expect(await readResilienceState({ scan: async () => ['0', []], mget: async () => [] })).toEqual({ pods: [], items: [] });
    });
});

describe('B5 p95', () => {
    it('kova ust siniri; bos -> null; acik uclu kova -> null', () => {
        expect(p95FromBuckets([96, 4, 0, 0, 0, 0, 0, 0, 0, 0], 100)).toBe(50);
        expect(p95FromBuckets([50, 40, 10, 0, 0, 0, 0, 0, 0, 0], 100)).toBe(250);
        expect(p95FromBuckets([0, 0, 0, 0, 0, 0, 0, 0, 0, 10], 10)).toBeNull();
        expect(p95FromBuckets([], 0)).toBeNull();
    });
});

describe('B8b/c izinli DB kapisi', () => {
    it('kesin 7 ad; baskalari reddedilir', () => {
        for (const n of ['entegrasyonik', 'entegrasyonik_client', 'entegrasyonik_client_2', 'entegrasyonik_client_24', 'entegrasyonik_client_25', 'entegrasyonikClient_1', 'entegrasyonikDB']) expect(isBackofficeDbAllowed(n)).toBe(true);
        for (const n of ['admin', 'local', 'config', 'baska_proje', 'entegrasyonikClient_2', 'entegrasyonik_test', undefined, '']) expect(isBackofficeDbAllowed(n)).toBe(false);
    });
    it('getMongoStatus: izinsiz tenant DB adi ne okunur ne listelenir (yalniz sayac); listDatabases yok', async () => {
        const used: string[] = [];
        const conn = {
            db: { admin: () => ({ command: async (c: any) => { used.push(Object.keys(c)[0]); return { version: '8.0.0', uptime: 5, connections: { current: 1, available: 9, totalCreated: 3 }, opcounters: { insert: 1 }, wiredTiger: { cache: { 'bytes currently in the cache': 50, 'maximum bytes configured': 100 } } }; } }) },
            useDb: (name: string) => { used.push('useDb:' + name); return { db: { command: async () => ({ collections: 2, objects: 10, dataSize: 100 }) } }; },
        };
        const clientModel = { find: () => ({ limit: () => ({ maxTimeMS: () => ({ lean: async () => [
            { clientId: 1, dbConfig: { dbname: 'entegrasyonikClient_1' } }, { clientId: 2, dbConfig: { dbname: 'baska_proje_db' } }, { clientId: 3, dbConfig: { dbname: 'entegrasyonikClient_9' } },
        ] }) }) }) };
        const out: any = await getMongoStatus({ conn: conn as any, appDbName: 'entegrasyonikDB', appPoolSize: 20, openTenantHandles: 1, clientModel: clientModel as any });
        expect(out.server.cache.fillRatio).toBe(0.5);
        expect(out.databases.map((d: any) => d.label)).toEqual(['app', 'tenant #1']);
        expect(out.skippedNotAllowlisted).toBe(2);
        expect(JSON.stringify(out)).not.toContain('baska_proje');
        expect(used.filter((u) => u.startsWith('useDb:'))).toEqual(['useDb:entegrasyonikDB', 'useDb:entegrasyonikClient_1']);
        expect(used).not.toContain('listDatabases');
    });
    it('resolveTargetDbName: app -> yalniz izinliyse; tenant izinsiz ad -> null', async () => {
        const mk = (dbname: string) => ({ find: () => ({ limit: () => ({ maxTimeMS: () => ({ lean: async () => [{ dbConfig: { dbname } }] }) }) }) }) as any;
        expect(await resolveTargetDbName('app', { appDbName: 'entegrasyonikDB', clientModel: mk('x') })).toBe('entegrasyonikDB');
        expect(await resolveTargetDbName('app', { appDbName: 'baska', clientModel: mk('x') })).toBeNull();
        expect(await resolveTargetDbName(5, { appDbName: 'entegrasyonikDB', clientModel: mk('admin') })).toBeNull();
        expect(await resolveTargetDbName(5, { appDbName: 'entegrasyonikDB', clientModel: mk('entegrasyonikClient_1') })).toBe('entegrasyonikClient_1');
    });
});

describe('B8d yavas sorgu', () => {
    beforeEach(() => { metricsRegistry.resetForTests(); setSlowQueryAppDbName('entegrasyonikDB'); });
    it('esik altinda yazmaz; ustunde yalniz db/collection/op etiketiyle histogram', () => {
        recordSlowQuery('entegrasyonikDB', 'Clients', 'find', 1000, 1150);
        expect(metricsRegistry.drain()).toEqual([]);
        recordSlowQuery('entegrasyonikDB', 'Clients', 'find', 1000, 1300);
        recordSlowQuery('entegrasyonikClient_1', 'Orders', 'aggregate', 1000, 2500);
        const snap = metricsRegistry.drain().filter((s) => s.metric === SLOW_QUERY_METRIC);
        expect(snap.map((s) => s.labels)).toEqual([{ db: 'app', collection: 'Clients', op: 'find' }, { db: 'tenant', collection: 'Orders', op: 'aggregate' }]);
        expect(JSON.stringify(snap)).not.toContain('entegrasyonikClient_1');
    });
    it('buildSlowQueries: rollup serilerini birlestirir, p95 kova siniri, en cok sayi ustte', async () => {
        const docs = [
            { series: { a: { labels: { db: 'app', collection: 'X', op: 'find' }, c: 3, h: { 2: 3 } }, b: { labels: { db: 'tenant', collection: 'Y', op: 'find' }, c: 1, h: { 5: 1 } } } },
            { series: { a: { labels: { db: 'app', collection: 'X', op: 'find' }, c: 2, h: { 2: 1, 3: 1 } } } },
        ];
        const applicationDB = { getMetricRollupModel: () => ({ find: () => ({ limit: () => ({ maxTimeMS: () => ({ lean: async () => docs }) }) }) }) };
        const out = await buildSlowQueries({ applicationDB, range: '24h', now: () => new Date('2026-09-30T12:00:00Z') });
        expect(out.thresholdMs).toBe(200);
        expect(out.items[0]).toEqual({ db: 'app', collection: 'X', op: 'find', count: 5, p95Ms: 500 });
        expect(out.items[1]).toMatchObject({ db: 'tenant', count: 1, p95Ms: 2500 });
        expect(p95OfHistogram([], 0)).toBeNull();
    });
});

describe('B9 cache', () => {
    beforeEach(() => { resetCacheForTests(); });
    const svc = () => { const s: any = new (BackofficeInfraService as any)(); s.request = {}; return s; };
    it('getCacheMetrics: aile bazli, ham anahtar yok, scope:pod', async () => {
        nodeCache.set('t:5:trendyol:orders.OrderSvc.list:abcdef', { v: 1 });
        nodeCache.set('g:trendyol:cats.CatSvc.get:123456', { v: 1 });
        const out = await svc().getCacheMetrics();
        expect(out.scope).toBe('pod');
        expect(out.breakdown.map((b: any) => b.name).sort()).toEqual(['cats.CatSvc.get', 'orders.OrderSvc.list']);
        const json = JSON.stringify(out);
        expect(json).not.toContain('abcdef'); expect(json).not.toContain('t:5');
    });
    it('flushCacheFamily: yalniz tam eslesen aile bosalir; bilinmeyen 404', async () => {
        nodeCache.set('t:5:trendyol:orders.OrderSvc.list:aaa', { v: 1 });
        nodeCache.set('t:6:trendyol:orders.OrderSvc.list:bbb', { v: 1 });
        nodeCache.set('t:5:trendyol:orders.OrderSvc.listAll:ccc', { v: 1 });
        const s = svc(); s.request = { family: 'orders.OrderSvc.list' };
        const out = await s.flushCacheFamily();
        expect(out).toMatchObject({ family: 'orders.OrderSvc.list', removed: 2, scope: 'pod' });
        expect(nodeCache.keys()).toEqual(['t:5:trendyol:orders.OrderSvc.listAll:ccc']);
        s.request = { family: 'yok.Boyle.aile' };
        await expect(s.flushCacheFamily()).rejects.toMatchObject({ statusCode: 404 });
    });
});
