/**
 * ============================================================================================
 * BU DOSYA GERÇEK LOCAL MONGODB'YE BAĞLANIR (mock DEĞİL). ADR-0021 Karar 5.2: "her göç dosyası için
 * ... gerçek Mongo testi (`up` → `down` → `up`)". `backend/migrations/0000-example.js` (çerçeve iskeleti)
 * GERÇEK `entegrasyonikDB`'ye (izinli DB) bağlanır ama YALNIZ bu dosyanın ürettiği `zzTest_` önekli/rastgele
 * self-test koleksiyonuna dokunur (ctx.collectionName/indexName override) — ÜRETİM ŞEMASINA DOKUNMAZ.
 * `SchemaMigrations`/`JobLeases` store'ları da AYNI şekilde `zzTest_` önekli koleksiyon adlarıyla izole edilir
 * (gerçek `SchemaMigrations`/`JobLeases` koleksiyonlarına YAZILMAZ). `afterAll` tüm sentetik koleksiyonları
 * düşürür ve kalıntı 0 doğrulanır (mongoLease.realmongo.test.ts / StockAllocator.concurrency.test.ts ile
 * AYNI disiplin).
 * ============================================================================================
 */
import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const example = require('../../migrations/0000-example');
// @utils/mongoLease OLDUĞU GİBİ tüketilir (D3 zaten bu dosyada düzeltilmiş; bkz. mongoLease.ts JSDoc).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { acquireLease, releaseLease } = require('../../src/utils/mongoLease');

jestGlobal.setTimeout(30000);

// NOT: bu test entegrasyonikClient_1 DEĞİL, entegrasyonikDB'ye bağlanır (0000-example.js scope='app').
// `realMongoTestDb.ts` yardımcısı YALNIZ entegrasyonikClient_1'i hedeflediği için burada AYRI (ama AYNI
// disiplinli: zzTest_ önek + rastgele + cleanup + yalnız izinli DB) minimal bir bağlantı kurulur.
import path from 'path';
import crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withDbName } = require('../../src/database/tenantConnection');

const APP_DB_NAME = 'entegrasyonikDB'; // izinli 7 DB'den biri (CLAUDE.md kural 2)
const SUITE_PREFIX = `zzTest_MigrateExample_${crypto.randomBytes(4).toString('hex')}_`;

let connection: mongoose.Connection;
let beforeCollectionCount = -1;

function makeStore(schemaMigrationsCollectionName: string) {
    const col = () => connection.db!.collection(schemaMigrationsCollectionName);
    return {
        async getRecord(id: string) { return col().findOne({ _id: id } as any); },
        async startRun(doc: any) {
            await col().updateOne(
                { _id: doc.id } as any,
                { $set: { checksum: doc.checksum, kind: doc.kind, scope: doc.scope, status: doc.status, startedAt: doc.startedAt, appliedBy: doc.appliedBy, backupRef: doc.backupRef, tenants: doc.tenants } },
                { upsert: true },
            );
        },
        async finishRun(id: string, patch: any) {
            await col().updateOne({ _id: id } as any, { $set: patch });
        },
        async upsertTenantProgress() { /* scope=app göçünde tenant yok */ },
    };
}

beforeAll(async () => {
    require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../../.env') });
    const rawUrl = process.env.DB_URL;
    if (!rawUrl) throw new Error('[migrate.exampleMigration.realmongo] DB_URL tanımlı değil.');
    const url = withDbName(rawUrl, APP_DB_NAME)
        .replace('{{USER}}', encodeURIComponent(process.env.DB_USER || ''))
        .replace('{{PASSWORD}}', encodeURIComponent(process.env.DB_PASSWORD || ''))
        .replace('{{DBNAME}}', APP_DB_NAME);
    if (!/^mongodb:\/\/([^@/]*@)?(127\.0\.0\.1)(:\d+)?(\/|\?|$)/.test(url)) {
        throw new Error('[migrate.exampleMigration.realmongo] Yalnızca 127.0.0.1 kabul edilir.');
    }
    connection = await mongoose.createConnection(url, { serverSelectionTimeoutMS: 5000 }).asPromise();
    expect(connection.db!.databaseName).toBe(APP_DB_NAME);
    const all = await connection.db!.listCollections().toArray();
    beforeCollectionCount = all.length;
});

afterAll(async () => {
    if (!connection || !connection.db) return;
    const found = await connection.db.listCollections({ name: { $regex: `^${SUITE_PREFIX}` } }).toArray();
    for (const c of found) {
        await connection.db.dropCollection(c.name).catch(() => undefined);
    }
    console.log(`[migrate.exampleMigration.realmongo] silinen koleksiyonlar: ${found.map((c) => c.name).join(',') || '(yok)'}`);
    const after = await connection.db.listCollections().toArray();
    expect(after.length).toBe(beforeCollectionCount); // kalıntı 0
    await connection.close();
});

describe('0000-example.js — gerçek Mongo (entegrasyonikDB, izole zzTest_ koleksiyon)', () => {
    it('discoverMigrations gerçek dosyayı bulur ve checksum tutarlıdır', () => {
        const migrations = migrate.discoverMigrations();
        const found = migrations.find((m: any) => m.id === example.id);
        expect(found).toBeDefined();
        expect(found.__checksum).toBe(migrate.computeChecksum(require('fs').readFileSync(found.__path)));
    });

    it('plan (DRY-RUN) diffIndexes ile GERÇEK DB\'den okur, hiçbir şey YAZMAZ', async () => {
        const collectionName = `${SUITE_PREFIX}Probe`;
        const ctx = { connection, collectionName, indexName: 'probe_1' };
        const report = await example.plan(ctx);
        expect(report.collection).toBe(collectionName);
        expect(report.toCreate.map((i: any) => i)).toContain('probe_1');

        const cols = await connection.db!.listCollections({ name: collectionName }).toArray();
        expect(cols.length).toBe(1); // plan createCollection() ile koleksiyonu GARANTİ eder ama İNDEKS YAZMAZ
        const idx = await connection.db!.collection(collectionName).indexes();
        expect(idx.find((i: any) => i.name === 'probe_1')).toBeUndefined(); // henüz kurulmadı
    });

    it('up → down → up (gerçek indeks kur/kaldır/tekrar kur) + SchemaMigrations kaydı (izole koleksiyon)', async () => {
        const schemaMigrationsCollectionName = `${SUITE_PREFIX}SchemaMigrations`;
        const store = makeStore(schemaMigrationsCollectionName);
        const collectionName = `${SUITE_PREFIX}Up`;
        const targets = [{ ctx: { scope: 'app', dbname: APP_DB_NAME, connection, collectionName, indexName: 'probe_1' } }];
        // discoverMigrations() ile yüklenen nesne kullanılır ki `__checksum` DOLU olsun (checksum mandalı gerçek).
        const loaded = migrate.findMigration(migrate.discoverMigrations(), example.id);

        const up1 = await migrate.runUp(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(up1.status).toBe('done');
        let idx = await connection.db!.collection(collectionName).indexes();
        expect(idx.some((i: any) => i.name === 'probe_1')).toBe(true);

        const rec1: any = await store.getRecord(example.id);
        expect(rec1?.status).toBe('done');
        expect(rec1?.checksum).toBe(loaded.__checksum);

        const down1 = await migrate.runDown(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(down1.status).toBe('done');
        idx = await connection.db!.collection(collectionName).indexes();
        expect(idx.some((i: any) => i.name === 'probe_1')).toBe(false);

        const up2 = await migrate.runUp(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(up2.status).toBe('done');
        idx = await connection.db!.collection(collectionName).indexes();
        expect(idx.some((i: any) => i.name === 'probe_1')).toBe(true); // yeniden kuruldu (idempotent döngü)
    });

    it('checksum mandalı: kayıtlı checksum dosyayla uyuşmuyorsa up ÇALIŞMADAN durur (gerçek DB okuması)', async () => {
        const schemaMigrationsCollectionName = `${SUITE_PREFIX}SchemaMigrationsMandal`;
        const store = makeStore(schemaMigrationsCollectionName);
        await connection.db!.collection(schemaMigrationsCollectionName).insertOne({ _id: example.id, checksum: 'BASKA-BIR-CHECKSUM' } as any);
        const migrationWithLoadedChecksum = migrate.findMigration(migrate.discoverMigrations(), example.id);
        const targets = [{ ctx: { scope: 'app', dbname: APP_DB_NAME, connection, collectionName: `${SUITE_PREFIX}Mandal`, indexName: 'probe_1' } }];
        await expect(migrate.runUp(migrationWithLoadedChecksum, targets, { store, appliedBy: 'jest-realmongo' })).rejects.toThrow(/checksum/);
    });
});

describe('JobLease tabanlı eşzamanlı-çalıştırma kilidi — gerçek Mongo (@utils/mongoLease OLDUĞU GİBİ)', () => {
    it('iki eşzamanlı acquireRunnerLease çağrısından yalnız biri kazanır; release sonrası tekrar alınabilir', async () => {
        const jobLeasesCollectionName = `${SUITE_PREFIX}JobLeases`;
        const jobLeaseCollection = connection.db!.collection(jobLeasesCollectionName);
        const migrationId = 'migrate-lease-test';

        const [a, b] = await Promise.all([
            migrate.acquireRunnerLease(jobLeaseCollection, migrationId, 'owner-A', { acquireLease, ttlMs: 60000 }),
            migrate.acquireRunnerLease(jobLeaseCollection, migrationId, 'owner-B', { acquireLease, ttlMs: 60000 }),
        ]);
        const winners = [a, b].filter((x) => x !== null);
        expect(winners.length).toBe(1);

        const winnerOwner = a ? 'owner-A' : 'owner-B';
        await migrate.releaseRunnerLease(jobLeaseCollection, migrationId, winnerOwner, { releaseLease });

        const doc: any = await jobLeaseCollection.findOne({ name: `schema-migration:${migrationId}` } as any);
        expect(doc.leaseOwner).toBeNull(); // bırakıldı -> null (eski $lt filtresi bunu HİÇ alamazdı, C23)

        const c = await migrate.acquireRunnerLease(jobLeaseCollection, migrationId, 'owner-C', { acquireLease, ttlMs: 60000 });
        expect(c).not.toBeNull();
        expect(c.leaseOwner).toBe('owner-C');
    });
});
