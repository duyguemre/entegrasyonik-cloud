/**
 * ADR-0029 NB5 -- e-posta outbox gondericisi: kira/yaris (tek gonderim), retry cizelgesi, dead, bayrak kapali, dogrulanmamis adres,
 * ozet toplama, sessiz saat, tercih opt-out, abonelik ucu (HTTP, 127.0.0.1). `mongodb-memory-server` (izole/gecici; gercek DB YOK).
 * Tasiyici MOCK: gercek SMTP'ye baglanilmaz.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';
import express from 'express';
import type { AddressInfo } from 'net';

jestGlobal.setTimeout(120000);

import { NotificationDeliverySchema } from '@database/application/models/NotificationDelivery';
import { NotificationPreferencesSchema } from '@database/application/models/NotificationPreferences';
import { EmailDispatcher, type DispatcherDeps, type OutgoingMail } from '@operations/notifications/delivery/EmailDispatcher';
import { MongoDeliveryStore } from '@operations/notifications/delivery/deliveryStore';
import { RETRY_DELAYS_MS, MAX_ATTEMPTS } from '@operations/notifications/delivery/retry';
import { signUnsubscribeToken } from '@operations/notifications/delivery/unsubscribeToken';
import { normalizeDigest, normalizeQuiet } from '@operations/notifications/delivery/schedule';
import { configureNotificationUnsubscribeRoutes } from '@api/http/notificationUnsubscribe';
import { NOTIFICATION_CATALOG, getDefinition } from '@operations/notifications/catalog';

const SECRET = 'k'.repeat(48);
const APP = 'https://app.example.test';
const MIN = 60_000;
const T0 = new Date('2026-09-30T10:00:00Z');
const oid = () => new mongoose.Types.ObjectId();

const INSTANT = NOTIFICATION_CATALOG.find((d) => d.surface === 'tenant' && !d.legacy && !d.mandatory && d.defaultChannels.email === 'instant')!;
const DIGEST_A = getDefinition('ORDER_SYNC_FAILED')!;
const MANDATORY = getDefinition('SECURITY_PASSWORD_CHANGED')!;

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let Deliveries: mongoose.Model<any>;
let Prefs: mongoose.Model<any>;

let clock = T0;
let sent: OutgoingMail[] = [];
let users: Record<string, any>;
let prefsByUser: Record<string, any>;
let sendImpl: (m: OutgoingMail) => Promise<{ messageId?: string }>;

function mk(over: Partial<DispatcherDeps> = {}, flags = { v2Enabled: true, emailEnabled: true }): EmailDispatcher {
    return new EmailDispatcher({
        store: new MongoDeliveryStore(Deliveries as any),
        flags: () => flags,
        loadUser: async (id) => users[id] ?? null,
        loadPrefs: async (_t, id) => prefsByUser[id] ?? {},
        loadEvents: async (ids) => new Map(ids.map((i) => [String(i), { params: { ...(INSTANT.example as object) }, count: 1 }])),
        transport: { send: async (m) => sendImpl(m) },
        appUrl: APP, unsubSecret: SECRET, now: () => clock,
        ...over,
    });
}

async function enqueue(o: Partial<any> = {}) {
    return Deliveries.create({
        eventId: oid(), tid: 7, userId: 'u1', code: INSTANT.code, channel: 'email', mode: 'instant', status: 'pending',
        attempts: 0, nextAttemptAt: T0, createdAt: T0, expAt: new Date(T0.getTime() + 30 * 86400000), locale: 'tr', ...o,
    });
}
const get = (id: any) => Deliveries.findById(id).lean() as Promise<any>;

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'notify_email_test').asPromise();
    Deliveries = conn.model('notification_delivery', NotificationDeliverySchema);
    Prefs = conn.model('notification_preferences', NotificationPreferencesSchema);
    jestGlobal.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(async () => { await conn?.dropDatabase(); await conn?.close(); await mongod?.stop(); });
beforeEach(async () => {
    clock = T0; sent = []; prefsByUser = {};
    users = { u1: { email: 'kisi@example.test', emailVerified: true, isActive: true }, u2: { email: 'diger@example.test', emailVerified: true, isActive: true } };
    sendImpl = async (m) => { sent.push(m); return { messageId: `<m${sent.length}@x>` }; };
    await Deliveries.deleteMany({}); await Prefs.deleteMany({});
});

describe('anlik gonderim', () => {
    it('gonderir: adres Users tarafindan cozulur, List-Unsubscribe + One-Click basliklari, durum sent', async () => {
        const d = await enqueue();
        const r = await mk().runOnce();
        expect(r.result.sent).toBe(1);
        expect(sent).toHaveLength(1);
        expect(sent[0].to).toBe('kisi@example.test');
        expect(sent[0].headers['List-Unsubscribe']).toMatch(/^<https:\/\/app\.example\.test\/api\/notifications\/unsubscribe\?t=.+>$/);
        expect(sent[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
        const doc = await get(d._id);
        expect(doc.status).toBe('sent'); expect(doc.providerMessageId).toBe('<m1@x>'); expect(doc.attempts).toBe(1); expect(doc.leaseUntil).toBeUndefined();
        expect(JSON.stringify(doc)).not.toContain('example.test'); // outbox'ta adres yok
    });

    it('YARIS: iki isci ayni anda -> her kayit TEK kez gonderilir', async () => {
        for (let i = 0; i < 12; i++) await enqueue();
        sendImpl = async (m) => { await new Promise((r) => setTimeout(r, 5)); sent.push(m); return { messageId: 'x' }; };
        const rs = await Promise.all([mk().runOnce(), mk().runOnce(), mk().runOnce()]);
        expect(sent).toHaveLength(12);
        expect(new Set(sent.map((s) => s.headers['X-Entegrasyonik-Delivery'])).size).toBe(12);
        expect(rs.reduce((a, r) => a + r.result.sent, 0)).toBe(12);
        expect(await Deliveries.countDocuments({ status: 'sent' })).toBe(12);
    });

    it('ikinci tur ayni kaydi tekrar gondermez (idempotent); kirasi dolmayan sending yeniden alinmaz', async () => {
        const d = await enqueue();
        await mk().runOnce();
        await mk().runOnce();
        expect(sent).toHaveLength(1);
        await Deliveries.updateOne({ _id: d._id }, { $set: { status: 'sending', leaseUntil: new Date(T0.getTime() + 5 * MIN) } });
        await mk().runOnce();
        expect(sent).toHaveLength(1);
        clock = new Date(T0.getTime() + 6 * MIN); // kira doldu (cokme) -> yeniden alinir
        await mk().runOnce();
        expect(sent).toHaveLength(2);
    });

    it('vadesi gelmemis kayit gonderilmez', async () => {
        await enqueue({ nextAttemptAt: new Date(T0.getTime() + 10 * MIN) });
        await mk().runOnce();
        expect(sent).toHaveLength(0);
    });
});

describe('retry ve dead', () => {
    it('gecici hata: cizelgeye gore ertelenir (1dk, 5dk, 30dk, 2sa, 12sa), 6. denemede dead', async () => {
        const d = await enqueue();
        sendImpl = async () => { throw Object.assign(new Error('secret host detail'), { responseCode: 451 }); };
        for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
            const r = await mk().runOnce();
            expect(r.result.retried).toBe(1);
            const doc = await get(d._id);
            expect(doc.status).toBe('pending');
            expect(doc.attempts).toBe(i + 1);
            expect(doc.nextAttemptAt.getTime()).toBe(clock.getTime() + RETRY_DELAYS_MS[i]);
            expect(doc.lastErrorCode).toBe('smtp_4xx');
            expect(JSON.stringify(doc)).not.toContain('secret host');
            clock = new Date(doc.nextAttemptAt.getTime());
        }
        const r = await mk().runOnce();
        expect(r.result.dead).toBe(1);
        const doc = await get(d._id);
        expect(doc.status).toBe('dead'); expect(doc.attempts).toBe(MAX_ATTEMPTS);
        await mk().runOnce();
        expect(await get(d._id)).toMatchObject({ status: 'dead', attempts: MAX_ATTEMPTS }); // olu mektup yeniden alinmaz
    });

    it('kalici hata (5xx) ilk denemede dead', async () => {
        const d = await enqueue();
        sendImpl = async () => { throw Object.assign(new Error('x'), { responseCode: 550 }); };
        const r = await mk().runOnce();
        expect(r.result.dead).toBe(1);
        expect(await get(d._id)).toMatchObject({ status: 'dead', attempts: 1, lastErrorCode: 'smtp_5xx' });
    });
});

describe('bayrak, dogrulanmamis adres, tercih', () => {
    it('NOTIFY_EMAIL_ENABLED=false: hic gondermez, kayitlara DOKUNMAZ; V2 kapaliyken de', async () => {
        const d = await enqueue();
        for (const flags of [{ v2Enabled: true, emailEnabled: false }, { v2Enabled: false, emailEnabled: true }]) {
            const r = await mk({}, flags).runOnce();
            expect(r.skipped).toBe('disabled');
        }
        expect(sent).toHaveLength(0);
        expect(await get(d._id)).toMatchObject({ status: 'pending', attempts: 0 });
    });

    it('dogrulanmamis adres: zorunlu-olmayan skipped:unverified; zorunlu security gider (hizmet bildirimi, abonelik yok)', async () => {
        users.u1.emailVerified = false;
        const a = await enqueue();
        const b = await enqueue({ code: MANDATORY.code });
        await mk().runOnce();
        expect(await get(a._id)).toMatchObject({ status: 'skipped', lastErrorCode: 'unverified' });
        expect(await get(b._id)).toMatchObject({ status: 'sent' });
        expect(sent).toHaveLength(1);
        expect(sent[0].headers['List-Unsubscribe']).toBeUndefined();
    });

    it('kullanici yok/pasif -> skipped:no_recipient; kategori tercihi off -> skipped:opt_out', async () => {
        const a = await enqueue({ userId: 'yok' });
        const b = await enqueue();
        prefsByUser.u1 = { user: { [INSTANT.category]: { email: 'off' } } };
        await mk().runOnce();
        expect(await get(a._id)).toMatchObject({ status: 'skipped', lastErrorCode: 'no_recipient' });
        expect(await get(b._id)).toMatchObject({ status: 'skipped', lastErrorCode: 'opt_out' });
        expect(sent).toHaveLength(0);
    });

    it('sessiz saat: zorunlu-olmayan ertelenir (deneme harcanmaz), zorunlu aninda gider', async () => {
        prefsByUser.u1 = { quiet: normalizeQuiet({ start: '12:00', end: '18:00', tz: 'UTC' }) }; // 10:00Z disinda -> 13:00Z'de icinde
        clock = new Date('2026-09-30T13:00:00Z');
        const a = await enqueue({ nextAttemptAt: new Date('2026-09-30T09:00:00Z') });
        const b = await enqueue({ code: MANDATORY.code, nextAttemptAt: new Date('2026-09-30T09:00:00Z') });
        await mk().runOnce();
        expect(sent).toHaveLength(1);
        const doc = await get(a._id);
        expect(doc).toMatchObject({ status: 'pending', attempts: 0, lastErrorCode: 'quiet_hours' });
        expect(doc.nextAttemptAt.toISOString()).toBe('2026-09-30T18:00:00.000Z');
        expect((await get(b._id)).status).toBe('sent');
    });

    it('abonelik anahtari/APP_URL eksikse zorunlu-olmayan gonderilmez, ertelenir', async () => {
        const d = await enqueue();
        await mk({ unsubSecret: undefined }).runOnce();
        expect(sent).toHaveLength(0);
        expect(await get(d._id)).toMatchObject({ status: 'pending', attempts: 0, lastErrorCode: 'misconfigured' });
    });
});

describe('ozet (digest)', () => {
    const digestRow = (o: Partial<any> = {}) => enqueue({ mode: 'digest', code: DIGEST_A.code, ...o });

    it('vadesi gelmeden gonderilmez; saatlik ozet: kullanici basina TEK e-posta, tum satirlar sent', async () => {
        prefsByUser.u1 = { digest: normalizeDigest({ cadence: 'hourly', hourLocal: 9 }) };
        const rows = [await digestRow(), await digestRow({ createdAt: new Date(T0.getTime() + 5 * MIN) }), await digestRow({ userId: 'u2' })];
        prefsByUser.u2 = { digest: normalizeDigest({ cadence: 'hourly', hourLocal: 9 }) };
        clock = new Date(T0.getTime() + 20 * MIN);
        await mk().runOnce();
        expect(sent).toHaveLength(0);
        clock = new Date('2026-09-30T11:00:00Z');
        const r = await mk().runOnce();
        expect(r.result.digests).toBe(2);
        expect(sent).toHaveLength(2);
        const forU1 = sent.find((s) => s.to === 'kisi@example.test')!;
        expect(forU1.subject).toContain('Bildirim özeti (2)');
        expect(forU1.headers['List-Unsubscribe']).toBeDefined();
        for (const row of rows) expect((await get(row._id)).status).toBe('sent');
    });

    it('gunluk ozet varsayilani 09:00 Istanbul; yaris: iki isci ozeti bir kez gonderir', async () => {
        for (let i = 0; i < 3; i++) await digestRow();
        clock = new Date('2026-10-01T05:59:00Z'); await mk().runOnce(); expect(sent).toHaveLength(0); // 08:59 yerel: vade yok
        clock = new Date('2026-10-01T06:00:00Z'); // 09:00 Istanbul
        await Promise.all([mk().runOnce(), mk().runOnce()]);
        expect(sent.filter((s) => s.subject.includes('özeti'))).toHaveLength(1);
        expect(await Deliveries.countDocuments({ status: 'sent' })).toBe(3);
    });

    it('ozet gonderim hatasi: satirlar retry politikasina girer', async () => {
        prefsByUser.u1 = { digest: normalizeDigest({ cadence: 'hourly', hourLocal: 9 }) };
        const a = await digestRow();
        sendImpl = async () => { throw Object.assign(new Error('x'), { responseCode: 421 }); };
        clock = new Date('2026-09-30T11:00:00Z');
        await mk().runOnce();
        const doc = await get(a._id);
        expect(doc.status).toBe('pending'); expect(doc.nextAttemptAt.getTime()).toBe(clock.getTime() + RETRY_DELAYS_MS[0]);
    });
});

describe('abonelik ucu (RFC 8058)', () => {
    let server: import('http').Server; let base: string; let now = T0;
    beforeAll(async () => {
        const app = express();
        configureNotificationUnsubscribeRoutes(app, { secret: () => SECRET, prefs: async () => Prefs as any, now: () => now });
        await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/notifications/unsubscribe`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));
    const tok = (category: string, at = T0) => signUnsubscribeToken(SECRET, { tid: 7, userId: 'u1', category }, at);

    it('GET yalniz onay sayfasi (tercih DEGISMEZ); POST one-click tercihi kapatir; tekrar idempotent', async () => {
        const t = tok(INSTANT.category);
        const g = await fetch(`${base}?t=${encodeURIComponent(t)}`);
        expect(g.status).toBe(200); expect(await g.text()).toContain('<form');
        expect(await Prefs.countDocuments({})).toBe(0);
        for (let i = 0; i < 2; i++) {
            const p = await fetch(`${base}?t=${encodeURIComponent(t)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
            expect(p.status).toBe(200);
        }
        const doc: any = await Prefs.findOne({ tid: 7, userId: 'u1' }).lean();
        expect(doc.matrix[INSTANT.category].email).toBe('off');
        expect(doc.updatedBy).toBe('unsubscribe');
        expect(await Prefs.countDocuments({})).toBe(1);
    });

    it('bu tercih sonrasi gonderici o kategoriyi opt_out sayar (uctan uca)', async () => {
        await fetch(`${base}?t=${encodeURIComponent(tok(INSTANT.category))}`, { method: 'POST' });
        const stored: any = await Prefs.findOne({ tid: 7, userId: 'u1' }).lean();
        prefsByUser.u1 = { user: stored.matrix };
        const d = await enqueue();
        await mk().runOnce();
        expect(await get(d._id)).toMatchObject({ status: 'skipped', lastErrorCode: 'opt_out' });
    });

    it('sahte / suresi gecmis / eksik belirtec reddedilir, tercih yazilmaz; zorunlu kategori kapatilamaz', async () => {
        const post = (t?: string) => fetch(t === undefined ? base : `${base}?t=${encodeURIComponent(t)}`, { method: 'POST' });
        expect((await post(tok(INSTANT.category) + 'x')).status).toBe(400);
        expect((await post('abc.def')).status).toBe(400);
        expect((await post()).status).toBe(400);
        now = new Date(T0.getTime() + 90 * 86400000);
        expect((await post(tok(INSTANT.category))).status).toBe(410);
        now = T0;
        const m = await post(tok('security'));
        expect(m.status).toBe(200); expect(await m.text()).toContain('kapatılamaz');
        expect(await Prefs.countDocuments({})).toBe(0);
    });

    it("'*' (ozet abonelik): zorunlu-olmayan tum kategoriler kapanir, zorunlu kategoriler etkilenmez", async () => {
        await fetch(`${base}?t=${encodeURIComponent(tok('*'))}`, { method: 'POST' });
        const doc: any = await Prefs.findOne({ tid: 7, userId: 'u1' }).lean();
        expect(doc.matrix.order.email).toBe('off');
        expect(doc.matrix.security).toBeUndefined();
    });
});
