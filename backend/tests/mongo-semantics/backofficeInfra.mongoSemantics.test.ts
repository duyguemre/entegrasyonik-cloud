/**
 * Backoffice B5 (API sagligi aggregate), B8b/B8c (serverStatus/dbStats/$collStats/$indexStats/listIndexes) ve B8d (mongoose yavas sorgu eklentisi)
 * GERCEK Mongo semantigi ile. `mongodb-memory-server` (izole/gecici; proje-ici indirme dizini) -- gercek/Atlas/yerel DB'ye DOKUNMAZ.
 * Bellek-ici sunucudaki DB adi izinli listeden secilir (allowlist kapisi kodu test edilsin diye).
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';
import { IntegrationCallMetricSchema } from '@database/application/models/IntegrationCallMetric';
import { buildApiHealth } from '../../src/operations/backoffice/apiHealth';
import { getMongoCollections, getMongoStatus } from '../../src/operations/backoffice/mongoStatus';
import { slowQueryPlugin, SLOW_QUERY_METRIC, setSlowQueryAppDbName } from '../../src/platform/runtime/metrics/slowQueryPlugin';
import { metricsRegistry } from '../../src/platform/runtime/metrics/MetricsRegistry';

jestGlobal.setTimeout(120000);

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
const DB = 'entegrasyonikDB';

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + DB).asPromise();
});
afterAll(async () => { await conn?.dropDatabase(); await conn?.close(); await mongod?.stop(); });

describe('B5 buildApiHealth (gercek aggregate)', () => {
    it('cagri/hata/kod/p95/etkilenen tenant sayisi; tenant kimligi sizmaz; aralik disi dislanir', async () => {
        const Model = conn.model('IntegrationCallMetric', IntegrationCallMetricSchema);
        const now = new Date('2026-09-30T12:00:00Z');
        const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000);
        const mk = (o: any) => ({ operation: 'GET /x', retries: 0, circuitState: 'closed', status: 'ok', durationMs: 40, at: at(5), ...o });
        await Model.insertMany([
            ...Array.from({ length: 8 }, () => mk({ integrationCode: 'trendyol', clientId: '901' })),
            mk({ integrationCode: 'trendyol', clientId: '902', status: 'error', code: 'UNAVAILABLE', durationMs: 4000 }),
            mk({ integrationCode: 'trendyol', clientId: '901', status: 'error', code: 'RATE_LIMITED', durationMs: 90 }),
            mk({ integrationCode: 'n11', clientId: '903', durationMs: 120 }),
            mk({ integrationCode: 'trendyol', clientId: '904', status: 'error', code: 'AUTH', at: at(60 * 48) }), // aralik disi
        ]);
        const out = await buildApiHealth({ applicationDB: { getIntegrationCallMetricModel: () => Model }, range: '24h', now: () => now });
        const t = out.items.find((i) => i.integrationCode === 'trendyol')!;
        expect(t).toMatchObject({ total: 10, errors: 2, errorRate: 0.2, affectedTenants: 2 });
        expect(t.errorsByCode.map((c) => c.code).sort()).toEqual(['RATE_LIMITED', 'UNAVAILABLE']);
        expect(t.p95Ms).toBe(5000); // 10 cagri: 95. yuzdelik 4000 ms -> (2500,5000] kovasi
        expect(out.items.find((i) => i.integrationCode === 'n11')).toMatchObject({ total: 1, errors: 0, p95Ms: 250 });
        expect(JSON.stringify(out)).not.toMatch(/90[1-4]/);
        const one = await buildApiHealth({ applicationDB: { getIntegrationCallMetricModel: () => Model }, range: '24h', integrationCode: 'n11', now: () => now });
        expect(one.items).toHaveLength(1);
    });
});

describe('B8b/B8c (gercek serverStatus/dbStats/collStats)', () => {
    it('getMongoStatus + getMongoCollections: sayaclar var, belge icerigi yok, partialFilter degeri sizmaz', async () => {
        const coll = conn.collection('Sample');
        await coll.insertMany([{ secretField: 'GIZLI-DEGER-1', n: 1 }, { secretField: 'GIZLI-DEGER-2', n: 2 }]);
        await coll.createIndex({ n: 1 }, { name: 'n_partial', partialFilterExpression: { secretField: 'GIZLI-DEGER-1' } });
        await coll.find({ n: 1 }).toArray();

        const clientModel = { find: () => ({ limit: () => ({ maxTimeMS: () => ({ lean: async () => [] }) }) }) } as any;
        const status: any = await getMongoStatus({ conn: conn as any, appDbName: DB, appPoolSize: 5, openTenantHandles: 0, clientModel });
        expect(typeof status.server.version).toBe('string');
        expect(status.server.connections.current).toBeGreaterThan(0);
        expect(status.databases[0]).toMatchObject({ scope: 'app', available: true });
        expect(status.databases[0].objects).toBeGreaterThanOrEqual(2);

        const cols = await getMongoCollections(conn as any, DB, { limit: 50 });
        const sample: any = cols.items.find((i) => i.name === 'Sample');
        expect(sample.documents).toBe(2);
        expect(sample.indexes.map((i: any) => i.name)).toEqual(expect.arrayContaining(['_id_', 'n_partial']));
        expect(sample.indexes.find((i: any) => i.name === 'n_partial')).toMatchObject({ partial: true, keys: ['n:1'] });
        expect(JSON.stringify({ status, cols })).not.toContain('GIZLI-DEGER');
        // imlec: limit 1
        const p1 = await getMongoCollections(conn as any, DB, { limit: 1 });
        expect(p1.items).toHaveLength(1);
        expect(p1.nextCursor).toBe(p1.items[0].name);
        // izinsiz DB adi kapida durur
        await expect(getMongoCollections(conn as any, 'admin', { limit: 1 })).rejects.toThrow();
    });
});

describe('B8d mongoose yavas sorgu eklentisi (gercek sorgu)', () => {
    it('esik ustu sorgu histograma db/collection/op ile yazilir; deger yazilmaz; hizli sorgu yazilmaz', async () => {
        setSlowQueryAppDbName(DB);
        metricsRegistry.resetForTests();
        const schema = new mongoose.Schema({ k: String });
        schema.plugin(slowQueryPlugin);
        let slow = false;
        schema.pre('find', async function () { if (slow) await new Promise((r) => setTimeout(r, 250)); }); // eklentinin pre'sinden sonra calisir
        const M = conn.model('SlowProbe', schema);
        await M.create({ k: 'DEGER-SIZMAMALI' });

        await M.find({ k: 'DEGER-SIZMAMALI' }); // hizli
        expect(metricsRegistry.drain().filter((s) => s.metric === SLOW_QUERY_METRIC)).toEqual([]);

        slow = true; // sonraki sorgu, eklentinin pre kancasindan SONRA 250 ms bekler
        await M.find({ k: 'DEGER-SIZMAMALI' });
        slow = false;
        const snap = metricsRegistry.drain().filter((s) => s.metric === SLOW_QUERY_METRIC);
        expect(snap.length).toBeGreaterThanOrEqual(1);
        expect(snap[0].labels).toEqual({ db: 'app', collection: 'slowprobes', op: 'find' });
        expect(JSON.stringify(snap)).not.toContain('DEGER-SIZMAMALI');
    });
});
