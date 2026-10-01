/**
 * ============================================================================================
 * BU DOSYA GERÇEK LOCAL MONGODB'YE BAĞLANIR (mock DEĞİL). ADR-0021 Karar 5.1/5.2: `tests/helpers/realMongoTestDb.ts`
 * ortak yardımcısıyla (yalnız izinli `entegrasyonikClient_1`, `zzTest_` önekli izole koleksiyonlar) `backend/
 * migrations/0002-d9-indexes-tenant.js` (scope='tenant') için gerçek Mongo kanıtı:
 *   1) `up`/`down`/`up` KANITI yalnız `zzTest_` önekli SENTETİK koleksiyonlarda (`ctx.collectionOverrides`) —
 *      ÜRETİM `Orders`/`ExportStagedProducts` koleksiyonlarına HİÇ YAZILMAZ.
 *   2) AYRICA, GERÇEK üretim `Orders`/`ExportStagedProducts` koleksiyonlarına karşı YALNIZ `plan`
 *      (SALT-OKUMA, `diffIndexes()`) çalıştırılır — HİÇBİR ŞEY YAZMAZ.
 * ============================================================================================
 */
import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import { openRealMongoTestDb, RealMongoTestDb, REAL_MONGO_TEST_DB_NAME } from '../helpers/realMongoTestDb';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require('../../migrations/0002-d9-indexes-tenant');

jestGlobal.setTimeout(30000);

let helper: RealMongoTestDb;
let beforeCollectionCount = -1;

function makeStore(collectionName: string) {
    const col = () => helper.connection.db!.collection(collectionName);
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
        async upsertTenantProgress(id: string, clientId: number, patch: any) {
            await col().updateOne(
                { _id: id, 'tenants.clientId': clientId } as any,
                { $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`tenants.$.${k}`, v])) },
            );
        },
    };
}

beforeAll(async () => {
    helper = await openRealMongoTestDb('D9IndexesTenant');
    expect(helper.dbName).toBe(REAL_MONGO_TEST_DB_NAME);
    const all = await helper.connection.db!.listCollections().toArray();
    beforeCollectionCount = all.length;
});

afterAll(async () => {
    if (!helper) return;
    const { dropped } = await helper.cleanup();
    console.log(`[migrate.d9IndexesTenant.realmongo] silinen koleksiyonlar: ${dropped.join(',') || '(yok)'}`);
    const after = await helper.connection.db!.listCollections().toArray();
    expect(after.length).toBe(beforeCollectionCount); // kalıntı 0
    await helper.close();
});

describe('0002-d9-indexes-tenant.js — gerçek Mongo (entegrasyonikClient_1), İZOLE zzTest_ koleksiyonlarda up/down/up', () => {
    it('discoverMigrations gerçek dosyayı bulur ve checksum tutarlıdır', () => {
        const migrations = migrate.discoverMigrations();
        const found = migrations.find((m: any) => m.id === migration.id);
        expect(found).toBeDefined();
        expect(found.__checksum).toBe(migrate.computeChecksum(require('fs').readFileSync(found.__path)));
    });

    it('up → down → up (gerçek indeks kur/kaldır/tekrar kur, İKİ koleksiyon, Orders 2 + ExportStagedProducts 1 indeks)', async () => {
        const schemaMigrationsCollectionName = helper.collectionName('SchemaMigrations');
        const store = makeStore(schemaMigrationsCollectionName);
        const collectionOverrides = { orders: helper.collectionName('Orders'), exportStagedProducts: helper.collectionName('ExportStagedProducts') };
        const targets = [{ ctx: { scope: 'tenant', clientId: 1, dbname: REAL_MONGO_TEST_DB_NAME, connection: helper.connection, collectionOverrides } }];
        const loaded = migrate.findMigration(migrate.discoverMigrations(), migration.id);

        const up1 = await migrate.runUp(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(up1.status).toBe('done');
        let ordersIdx = await helper.connection.db!.collection(collectionOverrides.orders).indexes();
        let exportIdx = await helper.connection.db!.collection(collectionOverrides.exportStagedProducts).indexes();
        expect(ordersIdx.some((i: any) => i.name === 'internalStatus_1_dates.orderDate_-1')).toBe(true);
        expect(ordersIdx.some((i: any) => i.name === 'integrationCode_1_dates.orderDate_-1')).toBe(true);
        expect(exportIdx.some((i: any) => i.name === 'integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1')).toBe(true);

        const rec1: any = await store.getRecord(migration.id);
        expect(rec1?.status).toBe('done');
        expect(rec1?.tenants?.[0]?.status).toBe('done');

        const down1 = await migrate.runDown(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(down1.status).toBe('done');
        ordersIdx = await helper.connection.db!.collection(collectionOverrides.orders).indexes();
        exportIdx = await helper.connection.db!.collection(collectionOverrides.exportStagedProducts).indexes();
        expect(ordersIdx.some((i: any) => i.name === 'internalStatus_1_dates.orderDate_-1')).toBe(false);
        expect(ordersIdx.some((i: any) => i.name === 'integrationCode_1_dates.orderDate_-1')).toBe(false);
        expect(exportIdx.some((i: any) => i.name === 'integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1')).toBe(false);

        const up2 = await migrate.runUp(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(up2.status).toBe('done');
        ordersIdx = await helper.connection.db!.collection(collectionOverrides.orders).indexes();
        expect(ordersIdx.some((i: any) => i.name === 'internalStatus_1_dates.orderDate_-1')).toBe(true); // yeniden kuruldu (idempotent döngü)
    });

    it('checksum mandalı: kayıtlı checksum dosyayla uyuşmuyorsa up ÇALIŞMADAN durur (gerçek DB okuması)', async () => {
        const schemaMigrationsCollectionName = helper.collectionName('SchemaMigrationsMandal');
        const store = makeStore(schemaMigrationsCollectionName);
        await helper.connection.db!.collection(schemaMigrationsCollectionName).insertOne({ _id: migration.id, checksum: 'BASKA-BIR-CHECKSUM' } as any);
        const loaded = migrate.findMigration(migrate.discoverMigrations(), migration.id);
        const collectionOverrides = { orders: helper.collectionName('OrdersMandal'), exportStagedProducts: helper.collectionName('ExportStagedProductsMandal') };
        const targets = [{ ctx: { scope: 'tenant', clientId: 1, dbname: REAL_MONGO_TEST_DB_NAME, connection: helper.connection, collectionOverrides } }];
        await expect(migrate.runUp(loaded, targets, { store, appliedBy: 'jest-realmongo' })).rejects.toThrow(/checksum/);
    });
});

describe('0002-d9-indexes-tenant.js — plan GERÇEK entegrasyonikClient_1 üzerinde (SALT-OKUMA, ÜRETİM koleksiyonuna YAZMA YOK)', () => {
    it('plan üretim Orders/ExportStagedProducts koleksiyonlarına karşı çalışır, anlamlı rapor üretir, HİÇBİR ŞEY YAZMAZ', async () => {
        const beforeOrdersIdx = await helper.connection.db!.collection('Orders').indexes().catch(() => []);
        const beforeExportIdx = await helper.connection.db!.collection('ExportStagedProducts').indexes().catch(() => []);

        const ctx = { connection: helper.connection }; // collectionOverrides YOK -> GERÇEK 'Orders'/'ExportStagedProducts' (yalnız plan, YAZMAZ)
        const report = await migration.plan(ctx);

        expect(report.collections).toHaveLength(2);
        const ordersReport = report.collections.find((c: any) => c.collection === 'Orders');
        const exportReport = report.collections.find((c: any) => c.collection === 'ExportStagedProducts');
        expect(ordersReport).toBeDefined();
        expect(exportReport).toBeDefined();
        expect(Array.isArray(ordersReport.toCreate)).toBe(true);
        expect(Array.isArray(ordersReport.toDrop)).toBe(true);
        // Rapor mevcut GERÇEK duruma göre TUTARLI olmalı: indeks HÂLİHAZIRDA varsa toCreate'te GÖRÜNMEMELİ,
        // yoksa GÖRÜNMELİ (diffIndexes doğruluğu — bu görev üretim ortamının önceki durumunu VARSAYMAZ).
        const ordersIdxNames = beforeOrdersIdx.map((i: any) => i.name);
        const exportIdxNames = beforeExportIdx.map((i: any) => i.name);
        for (const name of ['internalStatus_1_dates.orderDate_-1', 'integrationCode_1_dates.orderDate_-1']) {
            if (ordersIdxNames.includes(name)) expect(ordersReport.toCreate).not.toContain(name);
            else expect(ordersReport.toCreate).toContain(name);
        }
        if (exportIdxNames.includes('integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1')) {
            expect(exportReport.toCreate).not.toContain('integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1');
        } else {
            expect(exportReport.toCreate).toContain('integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1');
        }

        // YAZMA YOK kanıtı: plan öncesi/sonrası GERÇEK koleksiyonların indeks listesi BİREBİR AYNI.
        const afterOrdersIdx = await helper.connection.db!.collection('Orders').indexes().catch(() => []);
        const afterExportIdx = await helper.connection.db!.collection('ExportStagedProducts').indexes().catch(() => []);
        expect(afterOrdersIdx.map((i: any) => i.name).sort()).toEqual(beforeOrdersIdx.map((i: any) => i.name).sort());
        expect(afterExportIdx.map((i: any) => i.name).sort()).toEqual(beforeExportIdx.map((i: any) => i.name).sort());
    });
});
