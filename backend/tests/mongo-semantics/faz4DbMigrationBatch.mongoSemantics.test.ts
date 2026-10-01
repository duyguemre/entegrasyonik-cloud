/**
 * DB göç partisi 0008-0013 (DB-11/10/15/12/14): BELLEK-İÇİ (geçici) MongoDB'ye karşı up -> up(no-op) -> down -> up davranışı.
 * Gerçek/yerel DB'ye BAĞLANMAZ (mongodb-memory-server izole süreç, `zzTest_` önekli koleksiyonlar). Veriler sentetiktir.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

jestGlobal.setTimeout(180000);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const m8 = require('../../migrations/0008-variants-stockdirty-partial-tenant');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const m9 = require('../../migrations/0009-notifications-metricrollups-indexes-app');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const m10 = require('../../migrations/0010-messages-external-id-drift-tenant');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const m11 = require('../../migrations/0011-d10-clients-users-unique-app');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const m12 = require('../../migrations/0012-export-staged-archive-ttl-tenant');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const m13 = require('../../migrations/0013-exportflag-clientid-number-app');

let mongod: any; let conn: mongoose.Connection;
const col = (n: string) => conn.db!.collection(n);
const idx = async (n: string) => (await col(n).indexes().catch(() => [])) as any[];
const byName = async (n: string, name: string) => (await idx(n)).find((i) => i.name === name);
const names = async (n: string) => (await idx(n)).map((i) => i.name).filter((x) => x !== '_id_').sort();
const flat = (r: any) => r.collections.flatMap((c: any) => c.indexes.map((i: any) => `${i.name}:${i.action}`));
// connection tembelce okunur (describe gövdeleri beforeAll'dan ÖNCE çalışır)
const ctx = (overrides: Record<string, string>, extra: object = {}) => ({ get connection() { return conn; }, collectionOverrides: overrides, ...extra });
const dupKeyCode = async (p: Promise<unknown>) => p.then(() => null, (e: any) => e.code);

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'zzTest_faz4dbbatch').asPromise();
});
afterAll(async () => { await conn?.dropDatabase(); await conn?.close(); await mongod?.stop(); });

describe('0008 Variants stockDirty_true (DB-11)', () => {
    const C = ctx({ variants: 'zzTest_Variants' });
    it('plan create -> up created -> up noop -> down dropped -> up created; kısmi indeks yalnız stockDirty:true sorgusunda IXSCAN', async () => {
        await col('zzTest_Variants').insertMany([{ stockDirty: true, a: 1 }, { stockDirty: false }, { a: 2 }]);
        expect(flat(await m8.plan(C))).toEqual(['stockDirty_true:create']);
        expect(await names('zzTest_Variants')).toEqual([]); // plan yazmadı
        expect(flat(await m8.up(C))).toEqual(['stockDirty_true:created']);
        expect(flat(await m8.up(C))).toEqual(['stockDirty_true:noop']);
        expect(flat(await m8.plan(C))).toEqual(['stockDirty_true:noop']);
        const spec = await byName('zzTest_Variants', 'stockDirty_true');
        expect(spec).toMatchObject({ key: { stockDirty: 1 }, partialFilterExpression: { stockDirty: true } });
        const ex: any = await col('zzTest_Variants').find({ stockDirty: true }).explain('queryPlanner');
        expect(JSON.stringify(ex.queryPlanner.winningPlan)).toMatch(/IXSCAN/);
        expect(flat(await m8.down(C))).toEqual(['stockDirty_true:dropped']);
        expect(flat(await m8.down(C))).toEqual(['stockDirty_true:absent']);
        expect(flat(await m8.up(C))).toEqual(['stockDirty_true:created']);
    });
});

describe('0009 bildirim defteri + MetricRollups (DB-10)', () => {
    const O = { notificationEvents: 'zzTest_NotificationEvents', notificationDeliveries: 'zzTest_NotificationDeliveries', notificationPreferences: 'zzTest_NotificationPreferences', metricRollups: 'zzTest_MetricRollups' };
    const C = ctx(O);
    it('eski bucketStart_1 (5m TTL) düşer; iki TTL AYRI adlarla kurulur; ikinci up no-op; down geri alır; up tekrar', async () => {
        await col(O.metricRollups).createIndex({ bucketStart: 1 }, { name: 'bucketStart_1', expireAfterSeconds: 604800, partialFilterExpression: { resolution: '5m' } });
        const plan = flat(await m9.plan(C));
        expect(plan).toContain('bucketStart_1:drop-legacy');
        expect(plan).toContain('ttl_bucket_5m:create');
        expect(plan).toContain('ttl_bucket_1h:create');
        expect(plan).toContain('uniq_idem_key:create');

        await m9.up(C);
        expect(await names(O.metricRollups)).toEqual(['metric_1_resolution_1_bucketStart_1', 'ttl_bucket_1h', 'ttl_bucket_5m']);
        expect(await byName(O.metricRollups, 'ttl_bucket_5m')).toMatchObject({ expireAfterSeconds: 604800, partialFilterExpression: { resolution: '5m' } });
        expect(await byName(O.metricRollups, 'ttl_bucket_1h')).toMatchObject({ expireAfterSeconds: 7776000, partialFilterExpression: { resolution: '1h' } });
        expect(await names(O.notificationEvents)).toEqual(['code_1_createdAt_-1', 'tid_1_createdAt_-1', 'ttl_exp_at', 'uniq_idem_key']);
        expect(await names(O.notificationDeliveries)).toEqual(['eventId_1', 'status_1_nextAttemptAt_1', 'tid_1_createdAt_-1', 'ttl_exp_at']);
        expect(await names(O.notificationPreferences)).toEqual(['uniq_tid_userId']);

        const again = flat(await m9.up(C));
        expect(again.every((x: string) => /:(noop|absent)$/.test(x))).toBe(true); // ikinci up: hiçbir şey yapmaz
        expect(flat(await m9.plan(C)).every((x: string) => /:(noop|absent)$/.test(x))).toBe(true);

        await m9.down(C);
        expect(await names(O.notificationEvents)).toEqual([]);
        expect(await names(O.notificationDeliveries)).toEqual([]);
        expect(await names(O.metricRollups)).toEqual(['bucketStart_1', 'metric_1_resolution_1_bucketStart_1']); // unique korunur, legacy geri
        await m9.up(C);
        expect(await names(O.metricRollups)).toEqual(['metric_1_resolution_1_bucketStart_1', 'ttl_bucket_1h', 'ttl_bucket_5m']);
    });

    it('bildirim uniq_idem_key: aynı idemKey ikinci kez E11000 (tekilleştirme indekse dayanır); tercih {tid,userId} de tekil', async () => {
        const ev = col(O.notificationEvents);
        await ev.insertOne({ idemKey: 'code:1:d', tid: 1 });
        expect(await dupKeyCode(ev.insertOne({ idemKey: 'code:1:d', tid: 1 }))).toBe(11000);
        await ev.insertOne({ idemKey: 'code:1:e', tid: 1 }); // farklı anahtar geçer
        const pr = col(O.notificationPreferences);
        await pr.insertOne({ tid: 1, userId: null });
        expect(await dupKeyCode(pr.insertOne({ tid: 1, userId: null }))).toBe(11000);
    });

    it('MetricRollups: iki çözünürlük için iki AYRI TTL indeksi birlikte var (ikinci artık kurulabiliyor)', async () => {
        const list = (await idx(O.metricRollups)).filter((i) => i.expireAfterSeconds !== undefined);
        expect(list.map((i) => i.name).sort()).toEqual(['ttl_bucket_1h', 'ttl_bucket_5m']);
    });
});

describe('0010 Messages externalMessageId_1 drift (DB-15 / D16)', () => {
    const C = ctx({ messages: 'zzTest_Messages' });
    it('bileşik unique kurulur, tek alanlı unique düşer; kanallar arası aynı dış kimlik artık yazılır; down çakışma varken reddedilir', async () => {
        const c = col('zzTest_Messages');
        await c.createIndex({ externalMessageId: 1 }, { name: 'externalMessageId_1', unique: true });
        await c.insertOne({ integrationCode: 'trendyol', externalMessageId: 'X' });
        expect(await dupKeyCode(c.insertOne({ integrationCode: 'n11', externalMessageId: 'X' }))).toBe(11000); // drift: sessiz kayıp
        expect(flat(await m10.plan(C))).toEqual(['integrationCode_1_externalMessageId_1:create', 'externalMessageId_1:drop-unique-legacy']);

        expect(flat(await m10.up(C))).toEqual(['integrationCode_1_externalMessageId_1:created', 'externalMessageId_1:dropped']);
        expect(flat(await m10.up(C))).toEqual(['integrationCode_1_externalMessageId_1:noop', 'externalMessageId_1:absent']);
        await c.insertOne({ integrationCode: 'n11', externalMessageId: 'X' }); // artık geçer
        expect(await dupKeyCode(c.insertOne({ integrationCode: 'n11', externalMessageId: 'X' }))).toBe(11000); // bileşik tekil

        await expect(m10.down(C)).rejects.toBeDefined(); // (trendyol,X)+(n11,X) varken tek alanlı unique geri kurulamaz
        await c.deleteOne({ integrationCode: 'n11', externalMessageId: 'X' });
        expect(flat(await m10.down(C))).toEqual(['externalMessageId_1:created']);
        expect((await byName('zzTest_Messages', 'externalMessageId_1')).unique).toBe(true);
        await m10.up(C);
        expect(await names('zzTest_Messages')).toEqual(['integrationCode_1_externalMessageId_1']);
    });
});

describe('0011 Clients/Users unique (DB-15 / D10)', () => {
    const C = ctx({ clients: 'zzTest_Clients', users: 'zzTest_Users' });
    it('precheck kirliyse up HİÇBİR indeks kurmaz; temizlenince kurar; unique zorlanır; noop; down; up', async () => {
        const cl = col('zzTest_Clients'); const us = col('zzTest_Users');
        await cl.insertMany([{ order: 1, clientId: 1, dbConfig: { dbname: 'entegrasyonikClient_1' } }, { order: 1, clientId: 2, dbConfig: { dbname: 'entegrasyonikClient_1' } }, { order: 3, clientId: 3 }]);
        await us.insertMany([{ email: 'a@x.test' }, { email: 'a@x.test' }, { name: 'emailsiz-1' }, { name: 'emailsiz-2' }]);
        const p = await m11.plan(C);
        expect(p.precheckClean).toBe(false);
        expect(p.duplicateGroups).toEqual({ 'Clients.order': 1, 'Clients.clientId': 0, 'Clients.dbConfig.dbname': 1, 'Users.email': 1 });
        await expect(m11.up(C)).rejects.toThrow(/TEMIZ DEGIL/);
        expect(await names('zzTest_Clients')).toEqual([]);
        expect(await names('zzTest_Users')).toEqual([]);

        await cl.deleteOne({ clientId: 2 }); await us.deleteOne({ email: 'a@x.test' });
        expect((await m11.plan(C)).precheckClean).toBe(true);
        await m11.up(C);
        expect(await names('zzTest_Clients')).toEqual(['uniq_clientId', 'uniq_dbConfig_dbname', 'uniq_order']);
        expect(await names('zzTest_Users')).toEqual(['uniq_email']);
        expect(await dupKeyCode(cl.insertOne({ order: 1, clientId: 9 }))).toBe(11000);
        await us.insertOne({ name: 'emailsiz-3' }); // kısmi: e-postasız kayıtlar tekilliğe girmez
        expect(await dupKeyCode(us.insertOne({ email: 'b@x.test' }))).toBe(null);
        expect(await dupKeyCode(us.insertOne({ email: 'b@x.test' }))).toBe(11000);
        expect(await dupKeyCode(us.insertOne({ email: 'a@x.test' }))).toBe(11000); // mevcut a@x.test tekil

        expect(flat(await m11.up(C)).every((x: string) => x.endsWith(':noop'))).toBe(true);
        await m11.down(C);
        expect(await names('zzTest_Clients')).toEqual([]);
        expect(await names('zzTest_Users')).toEqual([]);
                await m11.up(C);
        expect(await names('zzTest_Clients')).toHaveLength(3);
    });
});

describe('0012 ESP arşiv TTL (DB-12)', () => {
    const C = ctx({ exportStagedProducts: 'zzTest_ExportStagedProducts' }, { now: () => new Date('2026-09-30T00:00:00Z') });
    it('varsayılan 30 gün: plan silinecek arşivli sayısını gösterir; up TTL+kısmi filtre; noop; süre değişince collMod; down; up', async () => {
        const c = col('zzTest_ExportStagedProducts');
        await c.insertMany([
            { isArchived: true, archivedAt: new Date('2026-08-01T00:00:00Z') },  // 60 gün önce -> hemen silinir
            { isArchived: true, archivedAt: new Date('2026-09-25T00:00:00Z') },  // 5 gün önce
            { isArchived: false, archivedAt: null },
        ]);
        const p = await m12.plan(C);
        expect(p.collections[0]).toMatchObject({ retentionDays: 30, archivedTotal: 2, wouldExpireNow: 1 });
        expect(flat(p)).toEqual(['ttl_archived_at:create']);

        expect(flat(await m12.up(C))).toEqual(['ttl_archived_at:created']);
        expect(await byName('zzTest_ExportStagedProducts', 'ttl_archived_at')).toMatchObject({ key: { archivedAt: 1 }, expireAfterSeconds: 30 * 86400, partialFilterExpression: { isArchived: true } });
        expect(flat(await m12.up(C))).toEqual(['ttl_archived_at:noop']);

        expect(flat(await m12.up({ ...C, params: { espArchiveTtlDays: 7 } }))).toEqual(['ttl_archived_at:collMod']);
        expect((await byName('zzTest_ExportStagedProducts', 'ttl_archived_at')).expireAfterSeconds).toBe(7 * 86400);
        await m12.up(C); // yeniden 30
        expect((await byName('zzTest_ExportStagedProducts', 'ttl_archived_at')).expireAfterSeconds).toBe(30 * 86400);

        expect(flat(await m12.down(C))).toEqual(['ttl_archived_at:dropped']);
        expect(await c.countDocuments({})).toBe(3); // indeks yönetimi belge silmez
        expect(flat(await m12.up(C))).toEqual(['ttl_archived_at:created']);
    });
});

describe('0013 ExportFlag.clientId String -> Number (DB-14)', () => {
    const C = ctx({ exportFlag: 'zzTest_ExportFlag' });
    it('koşullu dönüşüm (çakışma/sayısal olmayan atlanır), clientId_1 düşer; ikinci up no-op; down geri alır; up tekrar', async () => {
        const c = col('zzTest_ExportFlag');
        await c.createIndex({ clientId: 1 }, { name: 'clientId_1' });
        await c.createIndex({ clientId: 1, integrationCode: 1 }, { unique: true });
        await c.insertMany([
            { clientId: '1', integrationCode: 'trendyol', queuedCount: 4 },
            { clientId: '2', integrationCode: 'n11' },
            { clientId: 'abc', integrationCode: 'x' },          // sayısal değil -> atlanır
            { clientId: '3', integrationCode: 'hb' },           // Number ikizi var -> atlanır
            { clientId: 3, integrationCode: 'hb' },
            { clientId: '05', integrationCode: 'p' },           // '5' ile aynı hedefe -> ikisinden biri atlanır
            { clientId: '5', integrationCode: 'p' },
        ]);
        const p = (await m13.plan(C)).collections[0];
        expect(p).toMatchObject({ stringDocs: 6, numberDocs: 1, toConvert: 3, skippedNonNumeric: 1, skippedCollisions: 2, indexClientId_1: 'drop' });

        const u = (await m13.up(C)).collections[0];
        expect(u).toMatchObject({ converted: 3, skippedNonNumeric: 1, skippedCollisions: 2, indexClientId_1: 'dropped' });
        expect(await c.countDocuments({ clientId: 1, integrationCode: 'trendyol', queuedCount: 4 })).toBe(1); // yalnız clientId değişti
        expect(await c.countDocuments({ clientId: 2 })).toBe(1);
        expect(await c.countDocuments({ clientId: { $type: 'string' } })).toBe(3); // 'abc', '3', ('05'|'5')
        expect(await names('zzTest_ExportFlag')).toEqual(['clientId_1_integrationCode_1']);

        const u2 = (await m13.up(C)).collections[0]; // ikinci up: yeni dönüşüm yok (kalanlar hep atlanır), indeks yok
        expect(u2).toMatchObject({ converted: 0, indexClientId_1: 'absent' });

        // temiz, çakışmasız durumda down: tümünü String'e çevirir
        await c.deleteMany({ clientId: { $type: 'string' } });
        await c.deleteOne({ clientId: 3 });
        const d = (await m13.down(C)).collections[0];
        expect(d).toMatchObject({ converted: 3, indexClientId_1: 'created' });
        expect(await c.countDocuments({ clientId: { $type: 'number' } })).toBe(0);
        expect(await c.countDocuments({ clientId: '1', queuedCount: 4 })).toBe(1);
        expect(await names('zzTest_ExportFlag')).toEqual(['clientId_1', 'clientId_1_integrationCode_1']);

        const u3 = (await m13.up(C)).collections[0];
        expect(u3).toMatchObject({ converted: 3, indexClientId_1: 'dropped' });
    });
});
