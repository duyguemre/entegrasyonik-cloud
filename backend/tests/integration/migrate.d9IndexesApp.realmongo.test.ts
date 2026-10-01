/**
 * ============================================================================================
 * BU DOSYA GERÇEK LOCAL MONGODB'YE BAĞLANIR (mock DEĞİL). ADR-0021 Karar 5.2: her göç dosyası için gerçek
 * Mongo testi (`up` → `down` → `up`) + Karar 5.1 (`zzTest_` önekli izole koleksiyon).
 *
 * `backend/migrations/0001-d9-indexes-app.js` (scope='app') GERÇEK `entegrasyonikDB`'ye (izinli DB) bağlanır:
 *   1) `up`/`down`/`up` KANITI yalnız bu dosyanın ürettiği `zzTest_` önekli/rastgele SENTETİK koleksiyonlarda
 *      (`ctx.collectionOverrides`) — ÜRETİM `AuditLogs`/`Users` koleksiyonlarına HİÇ YAZILMAZ.
 *   2) AYRICA, GERÇEK üretim `AuditLogs`/`Users` koleksiyonlarına karşı YALNIZ `plan` (SALT-OKUMA,
 *      `diffIndexes()`) çalıştırılır ve raporun mantıklı olduğu doğrulanır — bu adım HİÇBİR ŞEY YAZMAZ
 *      (CLAUDE.md kural 1-3; görev sınırı: "GERÇEK üretim/App/tenant koleksiyonlarına HİÇBİR YAZMA").
 *
 * Çalıştırma: `DOTENV_CONFIG_PATH=<ana repo>/backend/.env npx jest ...` (worktree'de `backend/.env` yok —
 * `migrate.exampleMigration.realmongo.test.ts` / `mongoLease.realmongo.test.ts` ile AYNI desen).
 * ============================================================================================
 */
import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';
import path from 'path';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require('../../migrations/0001-d9-indexes-app');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withDbName } = require('../../src/database/tenantConnection');

jestGlobal.setTimeout(30000);

const APP_DB_NAME = 'entegrasyonikDB'; // izinli 7 DB'den biri (CLAUDE.md kural 2)
const SUITE_PREFIX = `zzTest_D9IndexesApp_${crypto.randomBytes(4).toString('hex')}_`;

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
    if (!rawUrl) throw new Error('[migrate.d9IndexesApp.realmongo] DB_URL tanımlı değil.');
    const url = withDbName(rawUrl, APP_DB_NAME)
        .replace('{{USER}}', encodeURIComponent(process.env.DB_USER || ''))
        .replace('{{PASSWORD}}', encodeURIComponent(process.env.DB_PASSWORD || ''))
        .replace('{{DBNAME}}', APP_DB_NAME);
    if (!/^mongodb:\/\/([^@/]*@)?(127\.0\.0\.1)(:\d+)?(\/|\?|$)/.test(url)) {
        throw new Error('[migrate.d9IndexesApp.realmongo] Yalnızca 127.0.0.1 kabul edilir.');
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
    console.log(`[migrate.d9IndexesApp.realmongo] silinen koleksiyonlar: ${found.map((c) => c.name).join(',') || '(yok)'}`);
    const after = await connection.db.listCollections().toArray();
    expect(after.length).toBe(beforeCollectionCount); // kalıntı 0
    await connection.close();
});

describe('0001-d9-indexes-app.js — gerçek Mongo, İZOLE zzTest_ koleksiyonlarda up/down/up', () => {
    it('discoverMigrations gerçek dosyayı bulur ve checksum tutarlıdır', () => {
        const migrations = migrate.discoverMigrations();
        const found = migrations.find((m: any) => m.id === migration.id);
        expect(found).toBeDefined();
        expect(found.__checksum).toBe(migrate.computeChecksum(require('fs').readFileSync(found.__path)));
    });

    it('up → down → up (gerçek indeks kur/kaldır/tekrar kur, İKİ koleksiyon) + SchemaMigrations kaydı (izole)', async () => {
        const schemaMigrationsCollectionName = `${SUITE_PREFIX}SchemaMigrations`;
        const store = makeStore(schemaMigrationsCollectionName);
        const collectionOverrides = { auditLogs: `${SUITE_PREFIX}AuditLogs`, users: `${SUITE_PREFIX}Users` };
        const targets = [{ ctx: { scope: 'app', dbname: APP_DB_NAME, connection, collectionOverrides } }];
        const loaded = migrate.findMigration(migrate.discoverMigrations(), migration.id);

        const up1 = await migrate.runUp(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(up1.status).toBe('done');
        let auditIdx = await connection.db!.collection(collectionOverrides.auditLogs).indexes();
        let userIdx = await connection.db!.collection(collectionOverrides.users).indexes();
        expect(auditIdx.some((i: any) => i.name === 'tid_1_at_-1')).toBe(true);
        expect(userIdx.some((i: any) => i.name === 'clientId_1')).toBe(true);

        const rec1: any = await store.getRecord(migration.id);
        expect(rec1?.status).toBe('done');
        expect(rec1?.checksum).toBe(loaded.__checksum);

        const down1 = await migrate.runDown(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(down1.status).toBe('done');
        auditIdx = await connection.db!.collection(collectionOverrides.auditLogs).indexes();
        userIdx = await connection.db!.collection(collectionOverrides.users).indexes();
        expect(auditIdx.some((i: any) => i.name === 'tid_1_at_-1')).toBe(false);
        expect(userIdx.some((i: any) => i.name === 'clientId_1')).toBe(false);

        const up2 = await migrate.runUp(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(up2.status).toBe('done');
        auditIdx = await connection.db!.collection(collectionOverrides.auditLogs).indexes();
        userIdx = await connection.db!.collection(collectionOverrides.users).indexes();
        expect(auditIdx.some((i: any) => i.name === 'tid_1_at_-1')).toBe(true); // yeniden kuruldu (idempotent döngü)
        expect(userIdx.some((i: any) => i.name === 'clientId_1')).toBe(true);
    });

    it('up İKİNCİ kez aynı zzTest_ koleksiyonda hata vermeden İDEMPOTENT çalışır (createIndex no-op)', async () => {
        const schemaMigrationsCollectionName = `${SUITE_PREFIX}SchemaMigrationsIdem`;
        const store = makeStore(schemaMigrationsCollectionName);
        const collectionOverrides = { auditLogs: `${SUITE_PREFIX}AuditLogsIdem`, users: `${SUITE_PREFIX}UsersIdem` };
        const targets = [{ ctx: { scope: 'app', dbname: APP_DB_NAME, connection, collectionOverrides } }];
        const loaded = migrate.findMigration(migrate.discoverMigrations(), migration.id);

        const first = await migrate.runUp(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(first.status).toBe('done');
        // checksum kaydı DEĞİŞMEDEN aynı ctx ile TEKRAR up çağrısı (mandal engellemez, aynı checksum) — idempotent.
        const second = await migrate.runUp(loaded, targets, { store, appliedBy: 'jest-realmongo' });
        expect(second.status).toBe('done');
        const idx = await connection.db!.collection(collectionOverrides.auditLogs).indexes();
        expect(idx.filter((i: any) => i.name === 'tid_1_at_-1')).toHaveLength(1); // tekrar YOK
    });
});

describe('0001-d9-indexes-app.js — plan GERÇEK entegrasyonikDB üzerinde (SALT-OKUMA, ÜRETİM koleksiyonuna YAZMA YOK)', () => {
    it('plan üretim AuditLogs/Users koleksiyonlarına karşı çalışır, anlamlı rapor üretir, HİÇBİR ŞEY YAZMAZ', async () => {
        const beforeAuditIdx = await connection.db!.collection('AuditLogs').indexes().catch(() => []);
        const beforeUserIdx = await connection.db!.collection('Users').indexes().catch(() => []);

        const ctx = { connection }; // collectionOverrides YOK -> GERÇEK 'AuditLogs'/'Users' (yalnız plan çağrılır, YAZMAZ)
        const report = await migration.plan(ctx);

        expect(report.collections).toHaveLength(2);
        const auditReport = report.collections.find((c: any) => c.collection === 'AuditLogs');
        const userReport = report.collections.find((c: any) => c.collection === 'Users');
        expect(auditReport).toBeDefined();
        expect(userReport).toBeDefined();
        // Rapor biçimi tutarlı: toCreate/toDrop dizileri (değer basmaz, yalnız indeks ADLARI).
        expect(Array.isArray(auditReport.toCreate)).toBe(true);
        expect(Array.isArray(auditReport.toDrop)).toBe(true);
        expect(Array.isArray(userReport.toCreate)).toBe(true);
        expect(Array.isArray(userReport.toDrop)).toBe(true);
        // Rapor mevcut GERÇEK duruma göre TUTARLI olmalı: indeks HÂLİHAZIRDA varsa toCreate'te GÖRÜNMEMELİ,
        // yoksa GÖRÜNMELİ (diffIndexes doğruluğu — bu görev üretim ortamının önceki durumunu VARSAYMAZ; bu
        // ortamda `--apply` hiç çalıştırılmadı, dolayısıyla durum ya "eksik" ya da bu testin KENDİSİNDEN ÖNCE
        // bambaşka bir yoldan zaten kurulmuş olabilir -- her iki durumda da rapor GERÇEK DB durumunu doğru
        // yansıtmalı).
        const auditAlreadyHasIndex = beforeAuditIdx.some((i: any) => i.name === 'tid_1_at_-1');
        const userAlreadyHasIndex = beforeUserIdx.some((i: any) => i.name === 'clientId_1');
        if (auditAlreadyHasIndex) expect(auditReport.toCreate).not.toContain('tid_1_at_-1');
        else expect(auditReport.toCreate).toEqual(expect.arrayContaining(['tid_1_at_-1']));
        if (userAlreadyHasIndex) expect(userReport.toCreate).not.toContain('clientId_1');
        else expect(userReport.toCreate).toEqual(expect.arrayContaining(['clientId_1']));

        // YAZMA YOK kanıtı: plan öncesi/sonrası GERÇEK koleksiyonların indeks listesi BİREBİR AYNI.
        const afterAuditIdx = await connection.db!.collection('AuditLogs').indexes().catch(() => []);
        const afterUserIdx = await connection.db!.collection('Users').indexes().catch(() => []);
        expect(afterAuditIdx.map((i: any) => i.name).sort()).toEqual(beforeAuditIdx.map((i: any) => i.name).sort());
        expect(afterUserIdx.map((i: any) => i.name).sort()).toEqual(beforeUserIdx.map((i: any) => i.name).sort());
    });
});
