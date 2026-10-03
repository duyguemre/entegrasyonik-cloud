/**
 * ADR-0029 NB4 -- tenant bildirim API'si GERCEK Mongo semantigiyle (`mongodb-memory-server`, izole/gecici; kural 1-2 kapsami DISI,
 * bkz. notify.mongoSemantics dosya basi). N-01 regresyonu, eski kayit uyumu, sayfalama, tercih, impersonation, izin suzmesi.
 * Indeks/koleksiyon kalici olusturulmaz (gecici sunucu).
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

jestGlobal.setTimeout(120000);

import NotificationService from '@api/services/notification-service';
import { NotificationSchema } from '@database/client/models/Notification';
import { NotificationPreferencesSchema } from '@database/application/models/NotificationPreferences';
import { createNotifierDeps } from '@operations/notifications/createNotifier';
import { resolveRecipients } from '@operations/notifications/audience';
import { NOTIFICATION_CATALOG } from '@operations/notifications/catalog';
import type { Member } from '@operations/notifications/audience';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let Notif: mongoose.Model<any>;
let Prefs: mongoose.Model<any>;

const A = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const B = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const ADMIN_SUB = 'aaaaaaaaaaaaaaaaaaaaaaa9';

function svc(sub: string, body: any = {}, principal: any = {}, userContext: any = {}) {
    const s: any = new NotificationService(7, { ...body, principal: { sub, tid: 7, ...principal }, userContext });
    s.clientDB = { getNotificationModel: () => Notif };
    s.applicationDB = { getNotificationPreferencesModel: () => Prefs };
    return s;
}

let seq = 0;
async function add(userId: string | undefined, over: Record<string, any> = {}) {
    seq += 1;
    return Notif.collection.insertOne({
        ...(userId ? { userId: new mongoose.Types.ObjectId(userId) } : {}),
        type: 'INFO', severity: 'info', title: `t${seq}`, message: 'm', isRead: false, isDeleted: false, isArchived: false,
        createdAt: new Date(1_700_000_000_000 + seq), ...over,
    }).then((r) => String(r.insertedId));
}

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'notify_api_test').asPromise();
    Notif = conn.model('notification', NotificationSchema.clone());
    Prefs = conn.model('notification_preferences', NotificationPreferencesSchema);
});
afterAll(async () => { await conn?.dropDatabase(); await conn?.close(); await mongod?.stop(); });
beforeEach(async () => { await Notif.deleteMany({}); await Prefs.deleteMany({}); });

describe('N-01: kullanici kapsami', () => {
    it('A, B\'nin bildirimini goremez (liste + sayac)', async () => {
        await add(A, { title: 'A-1' });
        await add(B, { title: 'B-1' });
        const res = await svc(A).get();
        expect(res.data.map((n: any) => n.title)).toEqual(['A-1']);
        expect(res.unreadCount).toBe(1);
        expect((await svc(B).getUnreadCount()).unreadCount).toBe(1);
    });

    it('A, B\'nin bildirimini isaretleyemez/silemez/arsivleyemez (404) ve B\'nin kaydi degismez', async () => {
        const bId = await add(B);
        for (const op of ['markAsRead', 'delete', 'archive']) {
            await expect(svc(A, { notificationIds: [bId] })[op]()).rejects.toMatchObject({ statusCode: 404 });
        }
        const doc = await Notif.collection.findOne({ _id: new mongoose.Types.ObjectId(bId) });
        expect(doc).toMatchObject({ isRead: false, isDeleted: false, isArchived: false });
    });

    it('delete {all} YALNIZ cagiranin bildirimlerini siler', async () => {
        await add(A); await add(A); await add(B);
        await svc(A, { all: true }).delete();
        expect(await Notif.countDocuments({ userId: A, isDeleted: true })).toBe(2);
        expect(await Notif.countDocuments({ userId: B, isDeleted: false })).toBe(1);
        expect((await svc(B).get()).data).toHaveLength(1);
    });

    it('markAsRead {all} yalniz kendi belgelerini okundu yapar', async () => {
        await add(A); await add(B);
        await svc(A, { all: true }).markAsRead();
        expect((await svc(A).getUnreadCount()).unreadCount).toBe(0);
        expect((await svc(B).getUnreadCount()).unreadCount).toBe(1);
    });

    it('arsiv: arsivlenen listeden ve sayactan duser; archived:true ile gorunur; unarchive geri getirir', async () => {
        const id = await add(A);
        await svc(A, { notificationIds: [id] }).archive();
        expect((await svc(A).get()).data).toHaveLength(0);
        expect((await svc(A).getUnreadCount()).unreadCount).toBe(0);
        expect((await svc(A, { archived: true }).get()).data).toHaveLength(1);
        await svc(A, { notificationIds: [id] }).unarchive();
        expect((await svc(A).get()).data).toHaveLength(1);
    });

    it('kategori filtresi + kategori kirilimi', async () => {
        await add(A, { category: 'order' }); await add(A, { category: 'order' }); await add(A, { category: 'stock' });
        expect((await svc(A, { category: 'order' }).get()).data).toHaveLength(2);
        const r = await svc(A, { byCategory: true }).get();
        expect(r.unreadByCategory).toEqual({ order: 2, stock: 1 });
    });
});

describe('eski (userId\'siz) kayit uyumu', () => {
    it('listede salt-okunur/okunmus gorunur (legacy:true), okunmamis sayisina girmez, hic kimse degistiremez', async () => {
        const legacyId = await add(undefined, { title: 'ESKI' });
        await add(A, { title: 'A-1' });
        const res = await svc(A).get();
        const legacy = res.data.find((n: any) => n.title === 'ESKI');
        expect(legacy).toMatchObject({ legacy: true, isRead: true });
        expect(res.unreadCount).toBe(1);
        expect((await svc(A, { onlyUnread: true }).get()).data.map((n: any) => n.title)).toEqual(['A-1']);
        // B de gorur (tenant geneli), ama degistiremez
        expect((await svc(B).get()).data.map((n: any) => n.title)).toEqual(['ESKI']);
        await expect(svc(B, { notificationIds: [legacyId] }).delete()).rejects.toMatchObject({ statusCode: 404 });
        await svc(A, { all: true }).delete();
        expect((await svc(B).get()).data.map((n: any) => n.title)).toEqual(['ESKI']);
    });
});

describe('sayfalama', () => {
    it('imlec: 5 kayit, limit 2 -> 3 sayfa, tekrar/eksik yok, son sayfada nextCursor null', async () => {
        for (let i = 0; i < 5; i++) await add(A, { title: `n${i}` });
        const titles: string[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
            const r = await svc(A, { limit: 2, ...(cursor ? { cursor } : {}) }).get();
            titles.push(...r.data.map((n: any) => n.title));
            cursor = r.nextCursor ?? undefined;
            pages++;
        } while (cursor && pages < 10);
        expect(pages).toBe(3);
        expect(titles).toEqual(['n4', 'n3', 'n2', 'n1', 'n0']);
    });

    it('afterId: verilen kimlikten YENI kayitlar', async () => {
        const first = await add(A, { title: 'eski' });
        await add(A, { title: 'yeni1' }); await add(A, { title: 'yeni2' });
        const r = await svc(A, { afterId: first }).get();
        expect(r.data.map((n: any) => n.title)).toEqual(['yeni2', 'yeni1']);
    });
});

describe('impersonation', () => {
    const imp = { ga: true, imp: true };
    it('liste tenant birlesik + eventId tekillestirilir; unreadCount 0', async () => {
        await add(A, { title: 'x', eventId: 'e1' }); await add(B, { title: 'x', eventId: 'e1' }); await add(B, { title: 'y', eventId: 'e2' });
        const r = await svc(ADMIN_SUB, {}, imp).get();
        expect(r.data).toHaveLength(2);
        expect(r.unreadCount).toBe(0);
    });

    it('yazma islemleri 403 IMPERSONATION_READ_ONLY ve veri degismez', async () => {
        const id = await add(A);
        const ops: Array<[string, any]> = [
            ['markAsRead', { all: true }], ['delete', { all: true }], ['archive', { notificationIds: [id] }], ['unarchive', { notificationIds: [id] }],
            ['updatePreferences', { locale: 'en' }], ['updateTenantDefaults', { locale: 'en' }],
        ];
        for (const [op, body] of ops) {
            await expect(svc(ADMIN_SUB, body, imp)[op]()).rejects.toMatchObject({ statusCode: 403, code: 'IMPERSONATION_READ_ONLY' });
        }
        expect(await Notif.countDocuments({ isRead: false, isDeleted: false, isArchived: false })).toBe(1);
        expect(await Prefs.countDocuments({})).toBe(0);
    });
});

describe('tercihler', () => {
    it('kaydet/getir (kendi) + tenant varsayilani ayri; baska kullanici gormez', async () => {
        await svc(A, { locale: 'en', matrix: { order: { inApp: false, email: 'digest' } }, digest: { cadence: 'daily', hourLocal: 9 } }).updatePreferences();
        await svc(ADMIN_SUB, { matrix: { stock: { email: 'instant' } } }, {}, { roleCode: 'ROLE_ADMIN' }).updateTenantDefaults();
        const mine = await svc(A).getPreferences();
        expect(mine.data).toMatchObject({ locale: 'en', matrix: { order: { inApp: false, email: 'digest' } }, digest: { cadence: 'daily', hourLocal: 9 } });
        expect(mine.tenantDefaults.matrix).toEqual({ stock: { email: 'instant' } });
        expect((await svc(B).getPreferences()).data.matrix).toEqual({});
        expect((await svc(ADMIN_SUB).getTenantDefaults()).data.matrix).toEqual({ stock: { email: 'instant' } });
    });

    it('zorunlu kategori (security) kapatilamaz: 400 MANDATORY_CATEGORY; kayit olusmaz; instant->digest serbest', async () => {
        await expect(svc(A, { matrix: { security: { inApp: false } } }).updatePreferences()).rejects.toMatchObject({ statusCode: 400, code: 'MANDATORY_CATEGORY' });
        await expect(svc(A, { matrix: { security: { email: 'off' } } }).updatePreferences()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc(ADMIN_SUB, { matrix: { security: { inApp: false } } }).updateTenantDefaults()).rejects.toMatchObject({ statusCode: 400 });
        expect(await Prefs.countDocuments({})).toBe(0);
        await svc(A, { matrix: { security: { email: 'digest' } } }).updatePreferences();
        expect(await Prefs.countDocuments({})).toBe(1);
    });

    it('quietHours null kaldirir; ikinci kayit ayni belgeyi gunceller (upsert)', async () => {
        await svc(A, { quietHours: { start: '22:00', end: '08:00', tz: 'Europe/Istanbul' } }).updatePreferences();
        await svc(A, { quietHours: null, matrix: { order: { inApp: true } } }).updatePreferences();
        expect(await Prefs.countDocuments({})).toBe(1);
        const doc: any = await Prefs.findOne({}).lean();
        expect(doc.quietHours).toBeUndefined();
        expect(doc.matrix.order).toEqual({ inApp: true });
    });

    it('katalog: tenant yuzeyi + kilit tablosu (security kilitli)', async () => {
        const r = await svc(A).getCatalog();
        expect(r.data.every((d: any) => d.surface === 'tenant')).toBe(true);
        expect(r.data.some((d: any) => 'params' in d)).toBe(false);
        expect(r.locks.find((l: any) => l.category === 'security').locked).toBe(true);
        expect(r.locks.find((l: any) => l.category === 'order').locked).toBe(false);
    });
});

describe('izin suzmesi: NotifyDeps.hasPermission -> can()', () => {
    const owner: Member = { userId: 'o', owner: true };
    const admin: Member = { userId: 'a', roleCode: 'ROLE_ADMIN' };
    const member: Member = { userId: 'm' };
    const deps = createNotifierDeps();

    it('hasPermission baglidir ve izin katalogundan (can) karar verir', () => {
        expect(typeof deps.hasPermission).toBe('function');
        expect(deps.hasPermission!(member, 'self:manage')).toBe(true);
        expect(deps.hasPermission!(member, 'users:read')).toBe(false);
        expect(deps.hasPermission!(admin, 'users:read')).toBe(true);
    });

    it('her tenant katalog kodu icin alici kumesi izin katalogu ile tutarli: rol izni yoksa alici degil', () => {
        const members = [owner, admin, member];
        for (const def of NOTIFICATION_CATALOG.filter((d) => d.surface === 'tenant' && !d.audience.actorOnly)) {
            const got = resolveRecipients(def, {}, members, deps.hasPermission).map((m) => m.userId);
            for (const m of members) expect(got.includes(m.userId)).toBe(deps.hasPermission!(m, def.audience.permission));
        }
    });
});
