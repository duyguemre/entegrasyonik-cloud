/**
 * ADR-0029 NB2 -- `notify` cekirdegi: idempotency, gruplama, SURECLERARASI kisma, alici basina belge, izin suzmesi, PII/hata
 * mesaji temizligi, e-posta outbox, bayrak kapali davranisi. `mongodb-memory-server` (izole/gecici; kural 1-2 kapsami DISI,
 * bkz. integrationConfigRevisions.mongoSemantics dosya basi); gercek/paylasilan DB'ye DOKUNMAZ. Indeksler test icinde kurulur
 * (modeller `autoIndex:false`; uretimde yalniz onayli gocle -- S1).
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

jestGlobal.setTimeout(120000);

import { Notifier, NotifyDeps } from '@operations/notifications/notify';
import type { Member } from '@operations/notifications/audience';
import { NotificationEventSchema, NOTIFICATION_EVENT_INDEXES } from '@database/application/models/NotificationEvent';
import { NotificationDeliverySchema, NOTIFICATION_DELIVERY_INDEXES } from '@database/application/models/NotificationDelivery';
import { NotificationSchema } from '@database/client/models/Notification';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let Ledger: mongoose.Model<any>;
let Deliveries: mongoose.Model<any>;
const tenantModels = new Map<number, mongoose.Model<any>>();

const OWNER: Member = { userId: 'aaaaaaaaaaaaaaaaaaaaaaa1', owner: true, emailVerified: true };
const ADMIN: Member = { userId: 'aaaaaaaaaaaaaaaaaaaaaaa2', roleCode: 'ROLE_ADMIN', emailVerified: true };
const M1: Member = { userId: 'aaaaaaaaaaaaaaaaaaaaaaa3', emailVerified: true };
const M2: Member = { userId: 'aaaaaaaaaaaaaaaaaaaaaaa4', emailVerified: false };
let members: Record<number, Member[]>;

function tenantModel(tid: number) {
    let m = tenantModels.get(tid);
    if (!m) { m = conn.useDb(`notify_tenant_${tid}`).model('notification', NotificationSchema.clone()); tenantModels.set(tid, m); }
    return m;
}

function mkDeps(over: Partial<NotifyDeps> = {}, flags = { v2Enabled: true, emailEnabled: false }): NotifyDeps {
    return {
        ledgerModel: Ledger as any,
        deliveryModel: Deliveries as any,
        tenantNotificationModel: async (tid) => (members[tid] ? (tenantModel(tid) as any) : undefined),
        listMembers: async (tid) => members[tid] ?? [],
        flags: () => flags,
        ...over,
    };
}

const HOUR = 3_600_000;
const T0 = new Date('2026-09-30T10:00:00Z');

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'notify_app_test').asPromise();
    Ledger = conn.model('notification_event', NotificationEventSchema);
    Deliveries = conn.model('notification_delivery', NotificationDeliverySchema);
    for (const i of NOTIFICATION_EVENT_INDEXES) await Ledger.collection.createIndex(i.fields as any, i.options as any);
    for (const i of NOTIFICATION_DELIVERY_INDEXES) await Deliveries.collection.createIndex(i.fields as any, i.options as any);
    jestGlobal.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
    await mongod?.stop();
});

beforeEach(async () => {
    members = { 7: [OWNER, ADMIN, M1, M2], 8: [{ userId: 'aaaaaaaaaaaaaaaaaaaaaaa5', owner: true, emailVerified: true }] };
    await Ledger.deleteMany({});
    await Deliveries.deleteMany({});
    for (const tid of [7, 8]) await tenantModel(tid).deleteMany({});
});

describe('idempotency', () => {
    it('ayni dedupeKey iki kez -> tek olay, alici basina tek belge; ikinci cagri duplicate, sayac 1', async () => {
        const n = new Notifier(mkDeps());
        const p = { announcementId: 'AN-1', kind: 'info' as const };
        const a = await n.notify('SYSTEM_ANNOUNCEMENT', 7, p, { occurredAt: T0 });
        const b = await n.notify('SYSTEM_ANNOUNCEMENT', 7, p, { occurredAt: T0 });
        expect(a.status).toBe('created');
        expect(b.status).toBe('duplicate');
        expect(await tenantModel(7).countDocuments({})).toBe(4);
        const ev = await Ledger.find({}).lean();
        expect(ev).toHaveLength(1);
        expect(ev[0].dupCount).toBe(1);
    });

    it('acik idempotencyKey: ayni anahtar tek belge; farkli tenant ayni anahtarla cakismaz', async () => {
        const n = new Notifier(mkDeps());
        const p = { lineId: 'L-1', orderId: 'O-1' };
        const o = { idempotencyKey: 'K-1', occurredAt: T0 };
        expect((await n.notify('STOCK_LINE_AUTO_CANCELLED', 7, p, o)).status).toBe('created');
        expect((await n.notify('STOCK_LINE_AUTO_CANCELLED', 7, { ...p, lineId: 'L-2' }, o)).status).toBe('duplicate');
        expect((await n.notify('STOCK_LINE_AUTO_CANCELLED', 8, p, o)).status).toBe('created');
    });

    it('dedupeKey + grup birlikte (STOCK_OVERSOLD): ayni satir tekrar -> duplicate; farkli satir ayni pencerede -> grouped', async () => {
        const n = new Notifier(mkDeps());
        const p = { integ: 'trendyol', lineId: 'L-1' };
        expect((await n.notify('STOCK_OVERSOLD', 7, p, { occurredAt: T0 })).status).toBe('created');
        expect((await n.notify('STOCK_OVERSOLD', 7, p, { occurredAt: T0 })).status).toBe('duplicate');
        expect((await n.notify('STOCK_OVERSOLD', 7, { ...p, lineId: 'L-2' }, { occurredAt: T0 })).status).toBe('grouped');
        const docs = await tenantModel(7).find({ userId: 'aaaaaaaaaaaaaaaaaaaaaaa3' }).lean();
        expect(docs).toHaveLength(1);
        expect(docs[0].count).toBe(2);
    });
});

describe('gruplama / kisma', () => {
    const p = { integ: 'trendyol', reason: 'window_overflow' };

    it('23 olay tek belge (alici basina) ve count=23; pencere disi yeni belge', async () => {
        const n = new Notifier(mkDeps());
        for (let i = 0; i < 23; i++) await n.notify('ORDER_SYNC_WINDOW_OVERFLOW', 7, p, { occurredAt: new Date(T0.getTime() + i * 1000) });
        const docs = await tenantModel(7).find({ userId: 'aaaaaaaaaaaaaaaaaaaaaaa3' }).lean();
        expect(docs).toHaveLength(1);
        expect(docs[0].count).toBe(23);
        expect(docs[0].isRead).toBe(false);
        const ev = await Ledger.find({}).lean();
        expect(ev).toHaveLength(1);
        expect(ev[0].count).toBe(23);
        // 2 saat sonra yeni pencere -> yeni belge
        await n.notify('ORDER_SYNC_WINDOW_OVERFLOW', 7, p, { occurredAt: new Date(T0.getTime() + 2 * HOUR) });
        expect(await tenantModel(7).countDocuments({ userId: 'aaaaaaaaaaaaaaaaaaaaaaa3' })).toBe(2);
    });

    it('tekrar gelen olay okunmus belgeyi yeniden okunmamis yapar', async () => {
        const n = new Notifier(mkDeps());
        await n.notify('ORDER_SYNC_WINDOW_OVERFLOW', 7, p, { occurredAt: T0 });
        await tenantModel(7).updateMany({}, { $set: { isRead: true } });
        await n.notify('ORDER_SYNC_WINDOW_OVERFLOW', 7, p, { occurredAt: new Date(T0.getTime() + 1000) });
        expect(await tenantModel(7).countDocuments({ isRead: false })).toBe(4);
    });

    it('SURECLER ARASI kisma: iki Notifier ornegi ayni defteri paylasir -> saatte tek belge (surec-ici Map yok)', async () => {
        const a = new Notifier(mkDeps());
        const b = new Notifier(mkDeps()); // "ikinci surec"
        expect((await a.notify('ORDER_SYNC_WINDOW_OVERFLOW', 7, p, { occurredAt: T0 })).status).toBe('created');
        expect((await b.notify('ORDER_SYNC_WINDOW_OVERFLOW', 7, p, { occurredAt: new Date(T0.getTime() + 5000) })).status).toBe('grouped');
        expect(await tenantModel(7).countDocuments({ userId: 'aaaaaaaaaaaaaaaaaaaaaaa1' })).toBe(1);
    });

    it('eszamanli 10 cagri (iki ornek): tam olarak bir created, geri kalani grouped, tek belge', async () => {
        const a = new Notifier(mkDeps());
        const b = new Notifier(mkDeps());
        const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).notify('ORDER_SYNC_WINDOW_OVERFLOW', 7, p, { occurredAt: T0 })));
        expect(rs.filter((r) => r.status === 'created')).toHaveLength(1);
        expect(rs.filter((r) => r.status === 'grouped')).toHaveLength(9);
        const docs = await tenantModel(7).find({ userId: 'aaaaaaaaaaaaaaaaaaaaaaa3' }).lean();
        expect(docs).toHaveLength(1);
        expect(docs[0].count).toBe(10);
    });

    it('farkli grup anahtari (entegrasyon) ayri belge uretir', async () => {
        const n = new Notifier(mkDeps());
        await n.notify('ORDER_SYNC_WINDOW_OVERFLOW', 7, p, { occurredAt: T0 });
        await n.notify('ORDER_SYNC_WINDOW_OVERFLOW', 7, { ...p, integ: 'n11' }, { occurredAt: T0 });
        expect(await tenantModel(7).countDocuments({ userId: 'aaaaaaaaaaaaaaaaaaaaaaa3' })).toBe(2);
    });
});

describe('alici cozumu', () => {
    it('alici BASINA belge, hepsinde userId dolu (N-01) ve tenant izole', async () => {
        const n = new Notifier(mkDeps());
        const r = await n.notify('ORDER_SYNC_FAILED', 7, { integ: 'trendyol', errorCode: 'UPSTREAM_TIMEOUT' }, { occurredAt: T0, corrId: 'c-1' });
        expect(r).toMatchObject({ status: 'created', recipients: 4 });
        const docs = await tenantModel(7).find({}).lean();
        expect(docs.map((d: any) => String(d.userId)).sort()).toEqual(['aaaaaaaaaaaaaaaaaaaaaaa1', 'aaaaaaaaaaaaaaaaaaaaaaa2', 'aaaaaaaaaaaaaaaaaaaaaaa3', 'aaaaaaaaaaaaaaaaaaaaaaa4']);
        expect(docs.every((d: any) => !!d.userId && String(d.userId).length === 24)).toBe(true);
        expect(await tenantModel(8).countDocuments({})).toBe(0);
        expect(docs[0]).toMatchObject({ code: 'ORDER_SYNC_FAILED', category: 'order', severity: 'error', count: 1 });
        expect(docs[0].expiresAt.getTime() - docs[0].createdAt.getTime()).toBe(30 * 24 * 3600 * 1000);
    });

    it('kademe yedegi: finans -> yalniz owner+admin; billing -> yalniz owner', async () => {
        const n = new Notifier(mkDeps());
        await n.notify('FINANCE_RECONCILIATION_MISMATCH', 7, { mismatchCount: 2 }, { occurredAt: T0 });
        expect((await tenantModel(7).find({}).lean()).map((d: any) => String(d.userId)).sort()).toEqual(['aaaaaaaaaaaaaaaaaaaaaaa1', 'aaaaaaaaaaaaaaaaaaaaaaa2']);
        await tenantModel(7).deleteMany({});
        await n.notify('BILLING_TRIAL_ENDED', 7, { trialEnd: '2026-10-05' }, { occurredAt: T0 });
        expect((await tenantModel(7).find({}).lean()).map((d: any) => String(d.userId))).toEqual(['aaaaaaaaaaaaaaaaaaaaaaa1']);
    });

    it('izin suzmesi: hasPermission portu (ADR-0028) kademenin yerine gecer -- finance:read olmayan kullanici finans bildirimini ALMAZ', async () => {
        const has = (m: Member, perm: string) => (perm === 'finance:read' ? m.userId === 'aaaaaaaaaaaaaaaaaaaaaaa3' : true);
        const n = new Notifier(mkDeps({ hasPermission: has as any }));
        await n.notify('FINANCE_RECONCILIATION_MISMATCH', 7, { mismatchCount: 2 }, { occurredAt: T0 });
        expect((await tenantModel(7).find({}).lean()).map((d: any) => String(d.userId))).toEqual(['aaaaaaaaaaaaaaaaaaaaaaa3']);
    });

    it('actorOnly: yalniz islemi baslatan; destek (impersonation) aktoruyse sahip/yoneticilere ve e-posta YOK', async () => {
        const n = new Notifier(mkDeps({}, { v2Enabled: true, emailEnabled: true }));
        const p = { integ: 'trendyol', mode: 'TRANSFER', batchId: 'B-1', itemCount: 3, hasWarnings: false };
        await n.notify('CATALOG_BATCH_SUBMITTED', 7, p, { occurredAt: T0, actorUserId: 'aaaaaaaaaaaaaaaaaaaaaaa3' });
        expect((await tenantModel(7).find({}).lean()).map((d: any) => String(d.userId))).toEqual(['aaaaaaaaaaaaaaaaaaaaaaa3']);
        await tenantModel(7).deleteMany({});
        await n.notify('CATALOG_BATCH_SUBMITTED', 7, { ...p, batchId: 'B-2' }, { occurredAt: T0, actorUserId: 'aaaaaaaaaaaaaaaaaaaaaaa3', actorImpersonating: true });
        expect((await tenantModel(7).find({}).lean()).map((d: any) => String(d.userId)).sort()).toEqual(['aaaaaaaaaaaaaaaaaaaaaaa1', 'aaaaaaaaaaaaaaaaaaaaaaa2']);
    });

    it('opts.recipients: yalniz bu tenanta ait uyeler; yabanci kimlik sessizce elenir', async () => {
        const n = new Notifier(mkDeps());
        await n.notify('SECURITY_PASSWORD_CHANGED', 7, { passwordChangedAt: '2026-09-30T10:00:00Z' }, { occurredAt: T0, recipients: { userIds: ['aaaaaaaaaaaaaaaaaaaaaaa3', 'aaaaaaaaaaaaaaaaaaaaaaa5'] } });
        expect((await tenantModel(7).find({}).lean()).map((d: any) => String(d.userId))).toEqual(['aaaaaaaaaaaaaaaaaaaaaaa3']);
    });

    it('alici yoksa suppressed, belge yok', async () => {
        members[7] = [];
        const r = await new Notifier(mkDeps()).notify('ORDER_SYNC_FAILED', 7, { integ: 'x', errorCode: 'E_X' }, { occurredAt: T0 });
        expect(r.status).toBe('suppressed');
        expect(await tenantModel(7).countDocuments({})).toBe(0);
    });
});

describe('PII ve ham hata mesaji (N-05)', () => {
    it('params icindeki Error nesnesi guvenli koda cevrilir; ham ileti hicbir yere (belge, defter) yazilmaz', async () => {
        const n = new Notifier(mkDeps());
        const secret = new Error('Bearer sk-live-SECRET123 musteri ali@ornek.com adres: Ataturk cad. 5');
        (secret as any).stack = 'at secret/path.ts:1';
        const r = await n.notify('ORDER_SYNC_FAILED', 7, { integ: 'trendyol', error: secret } as any, { occurredAt: T0 });
        expect(r.status).toBe('created');
        const blob = JSON.stringify([await tenantModel(7).find({}).lean(), await Ledger.find({}).lean()]);
        expect(blob).not.toMatch(/SECRET123|ali@ornek|Ataturk|secret\/path/);
        expect(blob).toContain('UNEXPECTED_ERROR');
    });

    it('hata nesnesinin .code degeri (SCREAMING_SNAKE) korunur', async () => {
        const e = Object.assign(new Error('ham'), { code: 'UPSTREAM_TIMEOUT' });
        await new Notifier(mkDeps()).notify('CATALOG_IMPORT_FAILED', 7, { integ: 't', jobId: 'J', err: e } as any, { occurredAt: T0, corrId: 'c-9' });
        const d: any = await tenantModel(7).findOne({}).lean();
        expect(d.params).toMatchObject({ errorCode: 'UPSTREAM_TIMEOUT', corrId: 'c-9' });
        expect(d.message).not.toContain('ham');
    });

    it('yasak/bilinmeyen alan (email, phone, message) -> failed, hicbir yazim yok', async () => {
        const n = new Notifier(mkDeps());
        for (const bad of [{ email: 'a@b.c' }, { phone: '555' }, { message: 'ham ileti' }]) {
            const r = await n.notify('ORDER_SYNC_FAILED', 7, { integ: 'x', errorCode: 'E_X', ...bad }, { occurredAt: T0 });
            expect(r.status).toBe('failed');
        }
        expect(await tenantModel(7).countDocuments({})).toBe(0);
        expect(await Ledger.countDocuments({})).toBe(0);
    });

    it('bilinmeyen kod -> failed (firlatmaz)', async () => {
        expect((await new Notifier(mkDeps()).notify('NO_SUCH_CODE', 7, {})).status).toBe('failed');
    });
});

describe('e-posta outbox (gonderici NB5)', () => {
    const p = { lineId: 'L-9', integ: 'trendyol' };

    it('NOTIFY_EMAIL_ENABLED=false: teslim kaydi skipped:disabled, e-posta ADRESI saklanmaz', async () => {
        const n = new Notifier(mkDeps({}, { v2Enabled: true, emailEnabled: false }));
        await n.notify('STOCK_OVERSOLD', 7, p, { occurredAt: T0 });
        const ds = await Deliveries.find({}).lean();
        expect(ds.length).toBeGreaterThan(0);
        expect(ds.every((d: any) => d.status === 'skipped' && d.lastErrorCode === 'disabled')).toBe(true);
        expect(JSON.stringify(ds)).not.toMatch(/@/);
    });

    it('etkinken: dogrulanmis alici pending; dogrulanmamis + zorunlu-olmayan skipped:unverified; zorunlu security/billing dogrulanmamisa da pending', async () => {
        const n = new Notifier(mkDeps({}, { v2Enabled: true, emailEnabled: true }));
        await n.notify('ORDER_SYNC_LAGGING', 7, { integ: 't', lagMinutes: 90, level: 'warning' }, { occurredAt: T0 });
        const by = async (uid: string, code: string) => (await Deliveries.findOne({ userId: uid, code }).lean()) as any;
        expect((await by('aaaaaaaaaaaaaaaaaaaaaaa3', 'ORDER_SYNC_LAGGING')).status).toBe('pending');
        expect((await by('aaaaaaaaaaaaaaaaaaaaaaa4', 'ORDER_SYNC_LAGGING'))).toMatchObject({ status: 'skipped', lastErrorCode: 'unverified' });
        members[7] = [{ userId: 'aaaaaaaaaaaaaaaaaaaaaaa6', owner: true, emailVerified: false }];
        await n.notify('BILLING_TRIAL_ENDED', 7, { trialEnd: '2026-10-05' }, { occurredAt: T0 });
        expect((await by('aaaaaaaaaaaaaaaaaaaaaaa6', 'BILLING_TRIAL_ENDED')).status).toBe('pending');
        const ev: any = await Ledger.findOne({ code: 'BILLING_TRIAL_ENDED' }).lean();
        expect(ev.emailQueued).toBe(1);
    });

    it('e-posta "off" kodlarda teslim kaydi yok; grouped tekrar yeni teslim uretmez', async () => {
        const n = new Notifier(mkDeps({}, { v2Enabled: true, emailEnabled: true }));
        await n.notify('ORDER_SYNC_WINDOW_OVERFLOW', 7, { integ: 'a', reason: 'r' }, { occurredAt: T0 });
        expect(await Deliveries.countDocuments({})).toBe(0);
        await n.notify('ORDER_SYNC_FAILED', 7, { integ: 'a', errorCode: 'E_X' }, { occurredAt: T0 });
        const c = await Deliveries.countDocuments({});
        await n.notify('ORDER_SYNC_FAILED', 7, { integ: 'a', errorCode: 'E_X' }, { occurredAt: new Date(T0.getTime() + 1000) });
        expect(await Deliveries.countDocuments({})).toBe(c);
    });
});

describe('bayrak, dayaniklilik, zil', () => {
    it('NOTIFY_V2_ENABLED=false: skipped, defter/belge/outbox YAZILMAZ', async () => {
        const r = await new Notifier(mkDeps({}, { v2Enabled: false, emailEnabled: true })).notify('ORDER_SYNC_FAILED', 7, { integ: 'x', errorCode: 'E_X' }, { occurredAt: T0 });
        expect(r).toMatchObject({ status: 'skipped', reason: 'disabled' });
        expect(await Ledger.countDocuments({})).toBe(0);
        expect(await tenantModel(7).countDocuments({})).toBe(0);
    });

    it('defter hatasi -> failed, FIRLATMAZ', async () => {
        const bad: any = { create: async () => { throw new Error('boom'); }, updateOne: async () => undefined, findOneAndUpdate: async () => undefined, deleteOne: async () => undefined };
        const r = await new Notifier(mkDeps({ ledgerModel: bad })).notify('ORDER_SYNC_FAILED', 7, { integ: 'x', errorCode: 'E_X' }, { occurredAt: T0 });
        expect(r.status).toBe('failed');
    });

    it('tenant modeli bulunamazsa failed ve defter geri alinir (ayni olay yeniden denenebilir)', async () => {
        const p = { announcementId: 'AN-7', kind: 'info' as const };
        let missing = true;
        const n = new Notifier(mkDeps({ tenantNotificationModel: async (tid) => (missing ? undefined : (tenantModel(tid) as any)) }));
        expect((await n.notify('SYSTEM_ANNOUNCEMENT', 7, p, { occurredAt: T0 })).status).toBe('failed');
        expect(await Ledger.countDocuments({})).toBe(0);
        missing = false;
        expect((await n.notify('SYSTEM_ANNOUNCEMENT', 7, p, { occurredAt: T0 })).status).toBe('created');
    });

    it('uygulama ici yazim hatasi -> defter geri alinir, sonraki deneme calisir', async () => {
        let fail = true;
        const deps = mkDeps({ tenantNotificationModel: async () => ({ insertMany: async (d: any[]) => { if (fail) throw new Error('db'); return tenantModel(7).insertMany(d); }, updateMany: async () => ({}) }) as any });
        const n = new Notifier(deps);
        const p = { announcementId: 'AN-8', kind: 'info' as const };
        expect((await n.notify('SYSTEM_ANNOUNCEMENT', 7, p, { occurredAt: T0 })).status).toBe('failed');
        fail = false;
        expect((await n.notify('SYSTEM_ANNOUNCEMENT', 7, p, { occurredAt: T0 })).status).toBe('created');
    });

    it('publish: yalniz alici kimlikleri + kategori/onem (baslik/metin/param YOK); publish hatasi bildirimi bozmaz', async () => {
        const seen: any[] = [];
        const n = new Notifier(mkDeps({ publish: (e) => { seen.push(e); } }));
        await n.notify('ORDER_SYNC_FAILED', 7, { integ: 'x', errorCode: 'E_X' }, { occurredAt: T0 });
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ tid: 7, kind: 'notification', meta: { category: 'order', severity: 'error' } });
        expect(JSON.stringify(seen[0])).not.toMatch(/E_X|title|message/);
        const n2 = new Notifier(mkDeps({ publish: () => { throw new Error('bus'); } }));
        expect((await n2.notify('ORDER_SYNC_FAILED', 7, { integ: 'y', errorCode: 'E_X' }, { occurredAt: T0 })).status).toBe('created');
    });

    it('platform kodu tenant yolunda skipped (NB8)', async () => {
        expect((await new Notifier(mkDeps()).notify('PLATFORM_ALERT_FIRING', 7, { ruleId: 'R1', alertId: 'A', level: 'critical' })).status).toBe('skipped');
    });
});

describe('notifyLegacy (sendClientNotification koprusu)', () => {
    it('LEGACY_<type>: duz title/message korunur, tenant tum uyelerine, userId dolu, mode aynen', async () => {
        const n = new Notifier(mkDeps());
        const r = await n.notifyLegacy(7, { type: 'BATCH_PROCESS', mode: 'TRANSFER', severity: 'success', title: 'T', message: 'M', actionUrl: '/logs', metaData: { batchId: 'B' } });
        expect(r.status).toBe('created');
        const docs: any[] = await tenantModel(7).find({}).lean();
        expect(docs).toHaveLength(4);
        expect(docs[0]).toMatchObject({ type: 'BATCH_PROCESS', mode: 'TRANSFER', severity: 'success', title: 'T', message: 'M', actionUrl: '/logs', metaData: { batchId: 'B' } });
        expect(docs.every((d) => !!d.userId)).toBe(true);
        expect(JSON.stringify(await Ledger.find({}).lean())).not.toMatch(/"M"|"T"/); // defter ham metin tutmaz
    });

    it('metaData.code + params katalogdaysa o kodla uretilir', async () => {
        await new Notifier(mkDeps()).notifyLegacy(7, { type: 'SYSTEM', severity: 'info', title: 'x', message: 'y', metaData: { code: 'BILLING_SUSPENDED', params: { suspendAt: '2026-10-12' } } });
        const d: any = await tenantModel(7).findOne({}).lean();
        expect(d).toMatchObject({ code: 'BILLING_SUSPENDED', category: 'billing' });
    });
});
