/**
 * ADR-0028 WP-A2 — üyelik göç betikleri (G0 precheck / E1 backfill / G1 cleanup) BELLEK-İÇİ (geçici) MongoDB'ye karşı.
 * Gerçek/yerel DB'ye BAĞLANMAZ (mongodb-memory-server izole süreçtir). Ad/e-postalar sentetiktir.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest as jestGlobal } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isAllowedTenantDbName as tsIsAllowed } from '@database/tenantConnection';

jestGlobal.setTimeout(120000);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const m = require('../../dev-tools/_membershipsCommon');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const up0003 = require('../../migrations/0003-memberships-app');

const APP = 'entegrasyonikDB';
const T1 = 'entegrasyonikClient_9001';
const T2 = 'entegrasyonikClient_9002';
const BC = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
const okBackup = { assertBackup: () => ({ ok: true }) };
const applyFlags = (over: any = {}) => ({ ...m.parseMembershipArgs(['--apply', '--i-have-verified-backup', '--backup-ref', 'backup/x']), ...over });

let mongod: any; let client: any; let app: any;
const tdb = (n: string) => client.db(n);
const ctx = () => ({ appDb: app, getTenantDb: tdb, appDbName: APP });

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    const { MongoClient } = require('mongodb');
    client = new MongoClient(mongod.getUri());
    await client.connect();
    app = client.db(APP);
});
afterAll(async () => { await client?.close(); await mongod?.stop(); });

async function seed() {
    for (const n of [APP, T1, T2]) await client.db(n).dropDatabase();
    await app.collection('Clients').insertMany([
        { order: 1, clientId: 1, status: 'ACTIVE', dbConfig: { dbname: T1 } },
        { order: 2, clientId: 2, status: 'ACTIVE', dbConfig: { dbname: T2 } },
        { order: 3, clientId: 3, status: 'PURGED', dbConfig: { dbname: 'entegrasyonikClient_9003' } },
        { order: 4, clientId: 4, status: 'ACTIVE', dbConfig: { dbname: 'baska_proje_db' } }, // izinsiz DB adı
    ]);
    await app.collection('Users').insertMany([
        { email: 'sahip1@example.com', order: 1, owner: true, roleCode: 'ROLE_OWNER', password: BC },
        { email: 'admin1@example.com', order: 1, owner: false, roleCode: 'ROLE_ADMIN', password: BC },
        { email: 'uye1@example.com', order: 1, owner: false, roleCode: 'ROLE_XYZ', password: BC, isActive: false },
        { email: 'sahip2a@example.com', order: 2, owner: true, password: BC },
        { email: 'sahip2b@example.com', order: 2, owner: true, password: BC },
        { email: 'orphan@example.com', password: 'duzmetin' },              // order yok + düz metin şüphesi
        { email: 'ga@example.com', isGlobalAdmin: true, password: BC },
        { email: 'purged@example.com', order: 3, password: BC },
        { email: 'izinsiz@example.com', order: 4, owner: true, password: BC },
    ]);
    await app.collection('Memberships').createIndex({ userId: 1, tid: 1 }, { unique: true, name: 'uniq_user_tid' });
    await client.db(T1).collection('Users').insertMany([
        { email: 'sahip1@example.com', roleCode: 'ROLE_OWNER', password: BC },
        { email: 'admin1@example.com', roleCode: 'ROLE_OPERATOR', password: 'plain' }, // roleCode farkı + düz metin
        { email: 'sadece-tenant@example.com', roleCode: 'ROLE_OPERATOR', password: BC },
    ]);
}
beforeEach(async () => { await seed(); });

describe('yardımcılar', () => {
    it('maskeleme: e-posta yerel kısmı/alan adı gizlenir', () => {
        expect(m.maskEmail('ayse.yilmaz@firma.com.tr')).toBe('a***@f***.tr');
        expect(m.maskEmail(undefined)).toBe('<e-posta-yok>');
    });
    it('legacyRole eşlemesi (sahip/admin/üye)', () => {
        expect(m.legacyRole({ owner: true })).toBe('owner');
        expect(m.legacyRole({ owner: false, roleCode: 'ROLE_ADMIN' })).toBe('admin');
        expect(m.legacyRole({ roleCode: 'ROLE_OWNER' })).toBe('admin');
        expect(m.legacyRole({ roleCode: 'ROLE_OPERATOR' })).toBe('operator');
        expect(m.legacyRole({ roleCode: 'ROLE_YOK' })).toBe('operator');
    });
    it('izinli tenant DB adı kuralı TS isAllowedTenantDbName ile aynı (parite)', () => {
        for (const n of [T1, 'entegrasyonik_client_2', 'entegrasyonikClient_1', 'entegrasyonikDB', 'entegrasyonik_test', 'baska', 'entegrasyonikClient_0', 'a/b', '', undefined, 'entegrasyonik']) {
            expect(m.isAllowedTenantDbName(n, APP)).toBe(tsIsAllowed(n, APP));
        }
        expect(m.isAllowedTenantDbName('baska_proje_db', APP)).toBe(false);
    });
    it('bayrak ayrıştırma: bilinmeyen bayrak toplanır', () => {
        expect(m.parseMembershipArgs(['--foo']).unknown).toEqual(['--foo']);
    });
});

describe('G0 precheck (salt-okuma)', () => {
    it('ayrışma sınıflarını sayar, e-postayı maskeler, yazmaz', async () => {
        const before = JSON.stringify(await app.collection('Users').find({}).toArray());
        const r = await m.runPrecheck(ctx());
        expect(r.central).toMatchObject({ total: 9, globalAdminsExcluded: 1, eligible: 6, noOrder: 1, orderNotInClients: 0, purgedTenant: 1, plaintextPasswordSuspects: 1 });
        expect(r.tenants).toMatchObject({ multiOwner: 1, dbNotAllowed: 1 }); // T2 iki sahip; order 4 izinsiz DB
        expect(r.drift).toMatchObject({ tenantOnly: 1, roleCodeDiff: 1, tenantPlaintextPasswordSuspects: 1 });
        expect(r.exitCode).toBe(2);
        const text = JSON.stringify(r);
        expect(text).not.toMatch(/@example\.com/);
        expect(text).not.toContain('duzmetin');
        expect(text).toContain('***@e***.com');
        expect(JSON.stringify(await app.collection('Users').find({}).toArray())).toBe(before);
        expect(await app.collection('Memberships').countDocuments()).toBe(0);
    });
    it('izinsiz tenant DB adına DOKUNMAZ (getTenantDb çağrılmaz)', async () => {
        const seen: string[] = [];
        await m.runPrecheck({ ...ctx(), getTenantDb: (n: string) => { seen.push(n); return tdb(n); } });
        expect(seen).not.toContain('baska_proje_db');
        expect(seen).not.toContain('entegrasyonikClient_9003'); // PURGED atlanır
        expect(seen.sort()).toEqual([T1, T2]);
    });
    it('sahipsiz tenant yakalanır', async () => {
        await app.collection('Users').deleteMany({ order: 1, owner: true });
        expect((await m.runPrecheck(ctx())).tenants.ownerless).toBe(1);
    });
});

describe('E1 backfill', () => {
    it('kuru koşu (varsayılan): diff raporu, HİÇ yazmaz', async () => {
        const r = await m.runBackfill({ ...ctx(), flags: m.parseMembershipArgs([]) });
        expect(r.mode).toBe('dry-run');
        expect(r.toInsert).toBe(6);
        expect(r.skipped).toMatchObject({ globalAdmin: 1, noOrder: 1, purged: 1 });
        expect(r.multiOwnerTenants).toEqual([2]);
        expect(r.divergenceRoleCodeCentralWins).toBe(1);
        expect(r.tenantDbNotAllowed).toBe(1);
        expect(await app.collection('Memberships').countDocuments()).toBe(0);
    });
    it('onay bayrağı olmadan yazmaz: --apply tek başına / yedek bayrağı yok / yedek kaydı geçersiz', async () => {
        await expect(m.runBackfill({ ...ctx(), flags: m.parseMembershipArgs(['--apply']) })).rejects.toThrow(/i-have-verified-backup/);
        await expect(m.runBackfill({ ...ctx(), flags: applyFlags({ verifiedBackup: false }) })).rejects.toThrow(/i-have-verified-backup/);
        // gerçek yedek denetimi (stub YOK): backup-ref yok/geçersiz => reddedilir
        await expect(m.runBackfill({ ...ctx(), flags: m.parseMembershipArgs(['--apply', '--i-have-verified-backup']) })).rejects.toThrow(/backup-ref/);
        await expect(m.runBackfill({ ...ctx(), flags: m.parseMembershipArgs(['--apply', '--i-have-verified-backup', '--backup-ref', '/etc/x']) })).rejects.toThrow(/backup\//);
        expect(await app.collection('Memberships').countDocuments()).toBe(0);
    });
    it('türetme doğruluğu + idempotency + mevcut üyeliğe dokunmama', async () => {
        const r1 = await m.runBackfill({ ...ctx(), flags: applyFlags(), approval: okBackup });
        expect(r1.written).toBe(6);
        const users = await app.collection('Users').find({}).toArray();
        const idOf = (e: string) => users.find((u: any) => u.email === e)._id;
        const get = (e: string, tid: number) => app.collection('Memberships').findOne({ userId: idOf(e), tid });
        expect(await get('sahip1@example.com', 1)).toMatchObject({ role: 'owner', status: 'active', createdBy: 'migration:0004' });
        expect(await get('admin1@example.com', 1)).toMatchObject({ role: 'admin', status: 'active' });
        expect(await get('uye1@example.com', 1)).toMatchObject({ role: 'operator', status: 'suspended' });
        expect(await get('sahip2a@example.com', 2)).toMatchObject({ role: 'owner' });
        expect(await get('sahip2b@example.com', 2)).toMatchObject({ role: 'owner' });
        expect(await get('izinsiz@example.com', 4)).toMatchObject({ role: 'owner' }); // üyelik app DB'de; tenant DB okunmadı
        expect(await app.collection('Memberships').countDocuments({ userId: idOf('ga@example.com') })).toBe(0);
        // sonradan uygulamada değişen üyelik korunur; ikinci koşu yeni yazmaz
        await app.collection('Memberships').updateOne({ userId: idOf('admin1@example.com'), tid: 1 }, { $set: { role: 'viewer' } });
        const r2 = await m.runBackfill({ ...ctx(), flags: applyFlags(), approval: okBackup });
        expect(r2).toMatchObject({ written: 0, toInsert: 0, existingDiffers: 1, unchanged: 5 });
        expect(await app.collection('Memberships').countDocuments()).toBe(6);
        expect(await get('admin1@example.com', 1)).toMatchObject({ role: 'viewer' });
    });
    it('sahipsiz tenant varsa --accept-ownerless olmadan yazmaz; benzersiz indeks yoksa reddeder', async () => {
        await app.collection('Users').deleteMany({ order: 1, owner: true });
        await expect(m.runBackfill({ ...ctx(), flags: applyFlags(), approval: okBackup })).rejects.toThrow(/Sahipsiz/);
        expect(await app.collection('Memberships').countDocuments()).toBe(0);
        await app.collection('Memberships').dropIndex('uniq_user_tid');
        await expect(m.runBackfill({ ...ctx(), flags: applyFlags({ acceptOwnerless: true }), approval: okBackup })).rejects.toThrow(/indeksi yok/);
        expect(await app.collection('Memberships').countDocuments()).toBe(0);
    });
    it('--down yalnız createdBy migration:0004 kayıtlarını siler', async () => {
        await m.runBackfill({ ...ctx(), flags: applyFlags(), approval: okBackup });
        await app.collection('Memberships').insertOne({ userId: 'manuel', tid: 99, role: 'admin', status: 'active', createdBy: 'user:x' });
        const dry = await m.runBackfill({ ...ctx(), flags: m.parseMembershipArgs(['--down']) });
        expect(dry.toRemove).toBe(6);
        await expect(m.runBackfill({ ...ctx(), flags: m.parseMembershipArgs(['--down', '--apply']) })).rejects.toThrow();
        const r = await m.runBackfill({ ...ctx(), flags: applyFlags({ down: true }), approval: okBackup });
        expect(r.removed).toBe(6);
        expect(await app.collection('Memberships').countDocuments()).toBe(1);
    });
});

describe('G1 cleanup (geri alınamaz)', () => {
    let dumpDir: string;
    beforeEach(() => { dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-')); });

    it('varsayılan dry-run: yazmaz, sayar', async () => {
        const r = await m.runCleanup({ ...ctx(), flags: m.parseMembershipArgs([]), dumpDir });
        expect(r.mode).toBe('dry-run');
        expect(r.tenants).toMatchObject({ dbs: 2, usersWithPassword: 3, dbNotAllowed: 1 });
        expect(await client.db(T1).collection('Users').countDocuments({ password: { $exists: true } })).toBe(3);
        expect(fs.readdirSync(dumpDir)).toHaveLength(0);
    });
    it('iki onay bayrağı + yedek + üyelik kapsaması olmadan reddeder', async () => {
        await expect(m.runCleanup({ ...ctx(), flags: applyFlags({ verifiedBackup: false }), approval: okBackup, dumpDir })).rejects.toThrow(/verified-backup/);
        await expect(m.runCleanup({ ...ctx(), flags: applyFlags(), approval: okBackup, dumpDir })).rejects.toThrow(/irreversible/);
        // backfill yapılmadı => üyeliksiz kullanıcı var
        await expect(m.runCleanup({ ...ctx(), flags: applyFlags({ confirmIrreversible: true }), approval: okBackup, dumpDir })).rejects.toThrow(/Üyeliği olmayan/);
        expect(await app.collection('Users').countDocuments({ owner: { $exists: true } })).toBeGreaterThan(0);
        expect(fs.readdirSync(dumpDir)).toHaveLength(0);
    });
    it('onaylı: önce döküm, sonra $unset; izinsiz DB atlanır', async () => {
        await m.runBackfill({ ...ctx(), flags: applyFlags(), approval: okBackup });
        const r = await m.runCleanup({ ...ctx(), flags: applyFlags({ confirmIrreversible: true }), approval: okBackup, dumpDir });
        const files = fs.readdirSync(dumpDir);
        expect(files).toHaveLength(1);
        expect(r.dumpFile).toMatch(/g1-.*\.ndjson$/);
        const dump = fs.readFileSync(path.join(dumpDir, files[0]), 'utf8');
        expect(dump).toContain('"scope":"tenant"');
        expect(dump).toContain('plain');
        expect(await app.collection('Users').countDocuments({ $or: [{ owner: { $exists: true } }, { roleCode: { $exists: true } }] })).toBe(0);
        expect(await client.db(T1).collection('Users').countDocuments({ password: { $exists: true } })).toBe(0);
        expect(await app.collection('Users').countDocuments({ password: { $exists: true } })).toBe(9); // merkezi parola KALIR
    });
});

describe('0003-memberships-app göçü (up -> down -> up)', () => {
    it('indeksler kurulur/düşer, idempotent; şema autoIndex kapalı', async () => {
        const mongoose = require('mongoose');
        const conn = await mongoose.createConnection(mongod.getUri() + 'zzTest_memb').asPromise();
        try {
            const c = { connection: conn, collectionOverrides: { memberships: 'zzTest_Memberships', invitations: 'zzTest_Invitations' } };
            const names = async (col: string) => (await conn.db.collection(col).indexes()).map((i: any) => i.name).sort();
            await up0003.up(c); await up0003.up(c);
            expect(await names('zzTest_Memberships')).toEqual(['_id_', 'tid_1_role_1', 'tid_1_status_1', 'uniq_user_tid']);
            expect(await names('zzTest_Invitations')).toEqual(['_id_', 'ttl_expires_at', 'uniq_pending_tid_email', 'uniq_token_hash']);
            await up0003.down(c);
            expect(await names('zzTest_Memberships')).toEqual(['_id_']);
            await up0003.up(c);
            expect((await up0003.plan(c)).collections.every((x: any) => x.toCreate.length === 0)).toBe(true);
        } finally { await conn.dropDatabase(); await conn.close(); }
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MembershipSchema } = require('@database/application/models/Membership');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { InvitationSchema } = require('@database/application/models/Invitation');
        expect(MembershipSchema.get('autoIndex')).toBe(false);
        expect(InvitationSchema.get('autoIndex')).toBe(false);
        expect(MembershipSchema.get('strict')).toBe(true);
    });
});
