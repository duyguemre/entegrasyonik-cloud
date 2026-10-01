/**
 * ADR-0028 WP-A4: davet / askıya alma / sahiplik devri yaşam döngüsü, BELLEK-İÇİ (geçici) MongoDB'ye karşı (mongodb-memory-server; gerçek/yerel DB'ye
 * BAĞLANMAZ). Üç MEMBERSHIP_SOURCE modu (legacy | dual | membership) için çekirdek akışlar parametrik koşulur. E-posta/bildirim/parola özeti mock'tur;
 * ad ve e-postalar sentetiktir.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import crypto from 'crypto';

jest.mock('@services/billing/EntitlementService', () => ({
    EntitlementService: { checkQuota: jest.fn(async () => ({ allowed: true, limit: 100, used: 0, resource: 'users' })) },
}));

import { EntitlementService } from '@services/billing/EntitlementService';
import { UserSchema } from '@database/application/models/User';
import { MembershipSchema } from '@database/application/models/Membership';
import { InvitationSchema } from '@database/application/models/Invitation';
import { AccountTokenSchema } from '@database/application/models/AccountToken';
import { ClientSchema } from '@database/application/models/Client';
import { AuditLogger } from '@services/audit/AuditLogger';
import { getIdentityCache, resetIdentityCacheForTests } from '@platform/core/security/identityCache';
import { InvitationService, INVITATION_HOURLY_LIMIT, INVITATION_TTL_MS, safeEqualHex } from '@operations/users/invitations';
import { SuspensionService } from '@operations/users/suspension';
import { OwnershipService } from '@operations/users/ownership';
import { AccountLifecycleService } from '@operations/account/AccountLifecycleService';
import { REAUTH_WINDOW_MS } from '@operations/users/reauth';
import { hashToken } from '@operations/account/accountTokens';
import { decide, loadMembership, MEMBERSHIP_CACHE_FIELD } from '../../../src/api/http/membershipAuthz';
import type { SourceMode } from '@operations/users/memberStore';

jest.setTimeout(120000);
const TID = 7;
const STRONG = 'Correct-Horse-Battery-9';
const OWNER_RANK = 3; const ADMIN_RANK = 2; const MEMBER_RANK = 1;

let mongod: any; let conn: mongoose.Connection;
let Users: mongoose.Model<any>; let TenantUsers: mongoose.Model<any>; let Memberships: mongoose.Model<any>;
let Invitations: mongoose.Model<any>; let Tokens: mongoose.Model<any>; let Clients: mongoose.Model<any>;
let appDb: any; let clientDb: any;
let nowMs = Date.now();
const mails: Array<{ to: string; subject: string; text: string; html?: string }> = [];
const notifications: Array<{ code: string; tid: number; params: any; opts: any }> = [];
let audits: any[] = [];
const mailSender = jest.fn(async (to: string, subject: string, text: string, html?: string) => { mails.push({ to, subject, text, html }); });
const notify = jest.fn(async (code: string, tid: number, params: any, opts?: any) => { notifications.push({ code, tid, params, opts }); });
const fakeSecurity: any = { hashPassword: async (p: string) => 'HASH::' + p, comparePassword: async (p: string, h: string) => h === 'HASH::' + p, getDummyHash: async () => 'HASH::dummy' };

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri()).asPromise();
    Users = conn.model('User', UserSchema.clone(), 'Users');
    const tenantSchema = UserSchema.clone(); tenantSchema.set('collection', 'TenantUsers');
    TenantUsers = conn.model('TenantUser', tenantSchema, 'TenantUsers');
    Memberships = conn.model('Membership', MembershipSchema.clone(), 'Memberships');
    Invitations = conn.model('Invitation', InvitationSchema.clone(), 'Invitations');
    Tokens = conn.model('AccountToken', AccountTokenSchema.clone(), 'AccountTokens');
    Clients = conn.model('Client', ClientSchema.clone(), 'Clients');
    // Göçle kurulacak indeksler (autoIndex kapalı) yalnızca bu GEÇİCİ sunucuda kurulur
    await Promise.all([Users.createIndexes(), Memberships.createIndexes(), Invitations.createIndexes(), Tokens.createIndexes()]);
    appDb = {
        getUserModel: () => Users, getMembershipModel: () => Memberships, getInvitationModel: () => Invitations,
        getAccountTokenModel: () => Tokens, getClientModel: () => Clients,
    };
    clientDb = { getUserModel: () => TenantUsers };
});
afterAll(async () => { await conn?.close(); await mongod?.stop(); });

beforeEach(async () => {
    await Promise.all([Users, TenantUsers, Memberships, Invitations, Tokens, Clients].map((m) => m.deleteMany({})));
    await Clients.collection.insertOne({ order: TID, clientId: TID, title: 'Acme <b>Ltd</b>', status: 'ACTIVE' });
    mails.length = 0; notifications.length = 0; audits = [];
    nowMs = Date.now();
    resetIdentityCacheForTests(60_000);
    AuditLogger.setSink(async (r) => { audits.push(r); });
    (EntitlementService.checkQuota as any).mockClear();
    (EntitlementService.checkQuota as any).mockImplementation(async () => ({ allowed: true, limit: 100, used: 0, resource: 'users' }));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

const deps = (mode: SourceMode) => ({
    applicationDB: appDb, getClientDB: async () => clientDb, mailSender, notify, mode, now: () => nowMs, baseUrl: () => 'https://app.example.test', security: fakeSecurity,
});
const inv = (mode: SourceMode) => new InvitationService(deps(mode) as any);
const susp = (mode: SourceMode) => new SuspensionService(deps(mode) as any);
const own = (mode: SourceMode) => new OwnershipService(deps(mode) as any);

/** Bir üye tohumlar: merkezi + tenant kopyası (+ dual/membership'te Membership). */
async function seedMember(mode: SourceMode, key: string, role: 'owner' | 'admin' | 'operator', extra: Record<string, unknown> = {}) {
    const legacy = { owner: role === 'owner', roleCode: role === 'owner' ? 'ROLE_OWNER' : role === 'admin' ? 'ROLE_ADMIN' : 'ROLE_OPERATOR' };
    const email = `${key}@example.test`;
    const central: any = await Users.create({ email, name: key, surname: 'T', password: 'HASH::' + STRONG, order: TID, clientId: TID, emailVerified: true, tokenVersion: 0, reauthAt: new Date(), ...legacy, ...extra });
    await TenantUsers.create({ email, name: key, surname: 'T', password: 'HASH::' + STRONG, roleCode: legacy.roleCode });
    if (mode !== 'legacy') await Memberships.create({ userId: central._id, tid: TID, role, status: 'active', createdBy: 'test' });
    return { id: String(central._id), email };
}
const tokenFrom = (mail: { text: string }) => decodeURIComponent(/#t=([A-Za-z0-9_%-]+)/.exec(mail.text)![1]);
const actorOf = (sub: string, rank: number, extra: any = {}) => ({ sub, rank, ip: '203.0.113.9', ...extra });
const flush = () => new Promise((r) => setImmediate(r));
const auditEvents = () => audits.map((a) => a.event);
const rejectsWith = async (p: Promise<any>, status: number, code?: string) => {
    await expect(p).rejects.toMatchObject(code ? { statusCode: status, code } : { statusCode: status });
};

const MODES: SourceMode[] = ['legacy', 'dual', 'membership'];

// =====================================================================================================================
describe.each(MODES)('davet yaşam döngüsü (MEMBERSHIP_SOURCE=%s)', (mode) => {
    it('inviteUser: token e-postada; DB yalnız sha256 özeti; 7 gün; yanıtta token/özet YOK; audit + limits.users sayımı', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        const r: any = await inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: '  New.User@Example.TEST ', role: 'operator' });
        expect(r).toMatchObject({ email: 'new.user@example.test', role: 'operator', status: 'pending' });
        expect(JSON.stringify(r)).not.toMatch(/token/i);
        expect(mails).toHaveLength(1);
        expect(mails[0].to).toBe('new.user@example.test');
        const token = tokenFrom(mails[0]);
        expect(mails[0].text).toContain(`https://app.example.test/invite#t=${token}`);
        const doc: any = await Invitations.findOne({}).lean();
        expect(doc.tokenHash).toBe(hashToken(token));
        expect(doc.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(doc)).not.toContain(token);
        expect(doc.expiresAt.getTime() - nowMs).toBeGreaterThan(INVITATION_TTL_MS - 5000);
        expect(doc.expiresAt.getTime() - nowMs).toBeLessThanOrEqual(INVITATION_TTL_MS + 5000);
        // limits.users: aktif üye (1) + bekleyen davet (0; yenilenen hariç) ile sorgulanır
        expect((EntitlementService.checkQuota as any).mock.calls[0].slice(0, 3)).toEqual([TID, 'users', 1]);
        await flush();
        expect(audits.find((x) => x.event === 'user.invite.create')).toMatchObject({ sub: a.id, tid: TID, result: 'ok', meta: { toRole: 'operator' } });
        expect(JSON.stringify(audits)).not.toContain(token);
    });

    it('rol tavanı: owner davetle verilemez; kendi kademesinden yüksek rol yok; bilinmeyen rol 400; admin admin verebilir', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, OWNER_RANK), { email: 'x@example.test', role: 'owner' }), 403);
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, MEMBER_RANK), { email: 'x@example.test', role: 'admin' }), 403);
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'x@example.test', role: 'superuser' }), 400);
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'not-an-email', role: 'operator' }), 400);
        await expect(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'y@example.test', role: 'admin' })).resolves.toMatchObject({ role: 'admin' });
        expect(await Invitations.countDocuments({})).toBe(1);
    });

    it('impersonation oturumu davet gönderemez (403)', async () => {
        await rejectsWith(inv(mode).invite(TID, actorOf('a1', ADMIN_RANK, { imp: true }), { email: 'x@example.test', role: 'operator' }), 403);
        expect(await Invitations.countDocuments({})).toBe(0);
    });

    it('mevcut kullanıcı: aynı mağazada 409 ALREADY_MEMBER; başka mağazadaki e-posta genel 409 (tek aktif üyelik, Aşama 1-2)', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: a.email, role: 'operator' }), 409, 'ALREADY_MEMBER');
        await Users.create({ email: 'other@example.test', name: 'O', surname: 'T', password: 'x', order: 99, clientId: 99, owner: true, roleCode: 'ROLE_OWNER' });
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'other@example.test', role: 'operator' }), 409, 'EMAIL_TAKEN');
        expect(await Invitations.countDocuments({})).toBe(0);
    });

    it('yenileme: aynı e-postaya ikinci davet AYNI kaydı yeniler; eski token geçersiz olur', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        await inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'operator' });
        await inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'admin' });
        expect(await Invitations.countDocuments({})).toBe(1);
        const [t1, t2] = mails.map(tokenFrom);
        await rejectsWith(inv(mode).getPublic(t1), 400, 'INVITATION_INVALID');
        await expect(inv(mode).getPublic(t2)).resolves.toMatchObject({ role: 'admin', tenantTitle: 'Acme <b>Ltd</b>' });
        // yenilenen davet kota sayımında çift sayılmaz
        expect((EntitlementService.checkQuota as any).mock.calls[1][2]).toBe(1);
    });

    it('resend: yeni token çalışır, eskisi ölür; revoke: kabul edilemez (410 INVITATION_REVOKED)', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        const created: any = await inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'operator' });
        await inv(mode).resend(TID, actorOf(a.id, ADMIN_RANK), created.id);
        const [t1, t2] = mails.map(tokenFrom);
        expect(t1).not.toBe(t2);
        await rejectsWith(inv(mode).getPublic(t1), 400, 'INVITATION_INVALID');
        await expect(inv(mode).getPublic(t2)).resolves.toBeTruthy();
        await expect(inv(mode).revoke(TID, actorOf(a.id, ADMIN_RANK), created.id)).resolves.toEqual({ success: true });
        await rejectsWith(inv(mode).getPublic(t2), 410, 'INVITATION_REVOKED');
        await rejectsWith(inv(mode).accept({ token: t2, name: 'N', surname: 'U', password: STRONG }), 410, 'INVITATION_REVOKED');
        await rejectsWith(inv(mode).revoke(TID, actorOf(a.id, ADMIN_RANK), created.id), 404); // bekleyen değil
        await flush();
        expect(auditEvents()).toEqual(expect.arrayContaining(['user.invite.create', 'user.invite.resend', 'user.invite.revoke']));
    });

    it('list: tokenHash dönmez; yalnız bu tenant; expired bayrağı; durum süzgeci', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        await inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'operator' });
        await Invitations.create({ tid: 99, email: 'foreign@example.test', role: 'admin', tokenHash: 'f'.repeat(64), expiresAt: new Date(nowMs + 1000), invitedBy: 'z' });
        const l: any = await inv(mode).list(TID);
        expect(l.invitations).toHaveLength(1);
        expect(JSON.stringify(l)).not.toMatch(/tokenHash|"f{64}"/);
        expect(l.invitations[0]).toMatchObject({ email: 'n@example.test', expired: false, status: 'pending' });
        nowMs += INVITATION_TTL_MS + 1000;
        expect((await inv(mode).list(TID) as any).invitations[0].expired).toBe(true);
        await rejectsWith(inv(mode).list(TID, { status: 'x' }), 400);
    });

    it('kabul: kullanıcı e-posta doğrulanmış + doğru rol; moda göre tenant kopyası/üyelik; tek kullanım; ikinci kabul 409', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        await inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'admin' });
        const token = tokenFrom(mails[0]);
        const pub: any = await inv(mode).getPublic(token);
        expect(pub).toEqual({ tenantTitle: 'Acme <b>Ltd</b>', role: 'admin', email: 'n***@example.test', expiresAt: expect.any(Date) });
        await expect(inv(mode).accept({ token, name: ' Nur ', surname: 'Usta', password: STRONG })).resolves.toEqual({ success: true });

        const u: any = await Users.findOne({ email: 'n@example.test' }).lean();
        expect(u).toMatchObject({ name: 'Nur', order: TID, clientId: TID, owner: false, roleCode: 'ROLE_ADMIN', emailVerified: true, isGlobalAdmin: false });
        expect(u.password).toBe('HASH::' + STRONG);
        expect(await TenantUsers.countDocuments({ email: 'n@example.test' })).toBe(mode === 'membership' ? 0 : 1);
        const m: any = await Memberships.findOne({ userId: u._id, tid: TID }).lean();
        if (mode === 'legacy') expect(m).toBeNull(); else expect(m).toMatchObject({ role: 'admin', status: 'active', invitedBy: a.id });
        const d: any = await Invitations.findOne({}).lean();
        expect(d).toMatchObject({ status: 'accepted', acceptedUserId: u._id });

        await rejectsWith(inv(mode).accept({ token, name: 'N', surname: 'U', password: STRONG }), 409, 'INVITATION_ACCEPTED');
        await rejectsWith(inv(mode).getPublic(token), 409, 'INVITATION_ACCEPTED');
        expect(await Users.countDocuments({ email: 'n@example.test' })).toBe(1);
        await flush();
        expect(audits.find((x) => x.event === 'user.invite.accept' && x.result === 'ok')).toMatchObject({ sub: String(u._id), tid: TID, meta: { toRole: 'admin' } });
    });

    it('eşzamanlı çifte kabul: yalnız BİRİ başarılı olur, tek kullanıcı oluşur', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        await inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'operator' });
        const token = tokenFrom(mails[0]);
        const rs = await Promise.allSettled([1, 2, 3].map(() => inv(mode).accept({ token, name: 'N', surname: 'U', password: STRONG })));
        expect(rs.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
        expect(await Users.countDocuments({ email: 'n@example.test' })).toBe(1);
    });

    it('süre dolumu: 7 gün sonra 410 INVITATION_EXPIRED (görüntüleme ve kabul); kullanıcı oluşmaz', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        await inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'operator' });
        const token = tokenFrom(mails[0]);
        nowMs += INVITATION_TTL_MS + 1000;
        await rejectsWith(inv(mode).getPublic(token), 410, 'INVITATION_EXPIRED');
        await rejectsWith(inv(mode).accept({ token, name: 'N', surname: 'U', password: STRONG }), 410, 'INVITATION_EXPIRED');
        expect(await Users.countDocuments({ email: 'n@example.test' })).toBe(0);
        // süresi dolmuş bekleyen davet yeniden gönderilerek canlandırılabilir
        const id = String((await Invitations.findOne({}).lean() as any)._id);
        await inv(mode).resend(TID, actorOf(a.id, ADMIN_RANK), id);
        await expect(inv(mode).getPublic(tokenFrom(mails[1]))).resolves.toBeTruthy();
    });

    it('zayıf parola daveti YAKMAZ (token tüketilmez); politika geçince kabul edilir', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        await inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'operator' });
        const token = tokenFrom(mails[0]);
        await rejectsWith(inv(mode).accept({ token, name: 'N', surname: 'U', password: 'short' }), 400, 'WEAK_PASSWORD');
        await rejectsWith(inv(mode).accept({ token, name: '', surname: 'U', password: STRONG }), 400);
        expect((await Invitations.findOne({}).lean() as any).status).toBe('pending');
        await expect(inv(mode).accept({ token, name: 'N', surname: 'U', password: STRONG })).resolves.toEqual({ success: true });
    });

    it('geçersiz/biçim dışı token: 400 INVITATION_INVALID, veritabanına gidilmez; nesne/dizi token reddedilir', async () => {
        for (const bad of [undefined, null, '', 'abc', 'x'.repeat(200), { $gt: '' }, ['a'], 12345]) {
            await rejectsWith(inv(mode).getPublic(bad as any), 400, 'INVITATION_INVALID');
        }
        await rejectsWith(inv(mode).getPublic('A'.repeat(43)), 400, 'INVITATION_INVALID'); // biçim doğru ama bilinmiyor
    });

    it('saatlik sınır: tenant başına 20 davet/saat, 21. davet 429', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        const docs = Array.from({ length: INVITATION_HOURLY_LIMIT }, (_, i) => ({ tid: TID, email: `p${i}@example.test`, role: 'operator', tokenHash: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(nowMs + 1e6), invitedBy: a.id }));
        await Invitations.insertMany(docs);
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'late@example.test', role: 'operator' }), 429, 'INVITATION_RATE_LIMITED');
        expect(mails).toHaveLength(0);
    });

    it('limits.users: kota dolu -> 403 PLAN_LIMIT_REACHED, hiçbir kayıt/e-posta yok; kullanım = aktif üye + bekleyen davet', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        await Invitations.create({ tid: TID, email: 'p@example.test', role: 'operator', tokenHash: 'a'.repeat(64), expiresAt: new Date(nowMs + 1e6), invitedBy: a.id });
        (EntitlementService.checkQuota as any).mockImplementation(async () => ({ allowed: false, limit: 2, used: 2, resource: 'users', reason: 'Kullanıcı sınırı doldu' }));
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'operator' }), 403, 'PLAN_LIMIT_REACHED');
        expect((EntitlementService.checkQuota as any).mock.calls[0][2]).toBe(2);
        expect(await Invitations.countDocuments({})).toBe(1);
        expect(mails).toHaveLength(0);
    });

    it('e-posta gönderilemezse: 502 MAIL_FAILED, davet kayıtlı kalır (yeniden gönderilebilir)', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        mailSender.mockImplementationOnce(async () => { throw new Error('smtp down'); });
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'operator' }), 502, 'MAIL_FAILED');
        const d: any = await Invitations.findOne({}).lean();
        expect(d.status).toBe('pending');
        await expect(inv(mode).resend(TID, actorOf(a.id, ADMIN_RANK), String(d._id))).resolves.toBeTruthy();
    });
});

it('kabul, eşzamanlı çakışan kullanıcıda geri alınır: davet yeniden pending, yarım kayıt kalmaz', async () => {
    const a = await seedMember('dual', 'admin', 'admin');
    await inv('dual').invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'n@example.test', role: 'operator' });
    const token = tokenFrom(mails[0]);
    // tenant kopyası oluşturmada hata: merkezi kullanıcı da geri alınmalı
    const spy = jest.spyOn(TenantUsers, 'create').mockRejectedValueOnce(new Error('tenant down') as never);
    await expect(inv('dual').accept({ token, name: 'N', surname: 'U', password: STRONG })).rejects.toThrow('tenant down');
    spy.mockRestore();
    expect(await Users.countDocuments({ email: 'n@example.test' })).toBe(0);
    expect(await Memberships.countDocuments({ tid: TID, role: 'operator' })).toBe(0);
    expect((await Invitations.findOne({}).lean() as any).status).toBe('pending');
    await expect(inv('dual').accept({ token, name: 'N', surname: 'U', password: STRONG })).resolves.toEqual({ success: true });
});

it('safeEqualHex: sabit-zamanlı karşılaştırma (uzunluk/tip tutarsızlığı false)', () => {
    const h = hashToken('abc');
    expect(safeEqualHex(h, hashToken('abc'))).toBe(true);
    expect(safeEqualHex(h, hashToken('abd'))).toBe(false);
    expect(safeEqualHex(h, h.slice(1))).toBe(false);
    expect(safeEqualHex(h, undefined)).toBe(false);
    expect(safeEqualHex('', '')).toBe(false);
});

// =====================================================================================================================
describe.each(MODES)('askıya alma (MEMBERSHIP_SOURCE=%s)', (mode) => {
    it('suspend: legacy isActive (merkezi + tenant kopyası) / Membership durumu, tokenVersion++, kimlik önbelleği temizlenir, audit + bildirim', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        const p = await seedMember(mode, 'op', 'operator');
        const cache = getIdentityCache();
        cache.set(p.id, TID, 0, { _id: p.id }, cache.epoch);
        expect(cache.get(p.id, TID, 0)).toBeDefined();

        await expect(susp(mode).suspend(TID, actorOf(o.id, OWNER_RANK), { userId: p.id, reason: 'politika ihlali' })).resolves.toEqual({ success: true, status: 'suspended' });

        const c: any = await Users.findById(p.id).lean();
        expect(c.tokenVersion).toBe(1);
        if (mode !== 'membership') {
            expect(c.isActive).toBe(false);
            expect((await TenantUsers.findOne({ email: p.email }).lean() as any).isActive).toBe(false);
        }
        if (mode !== 'legacy') {
            expect(await Memberships.findOne({ userId: p.id, tid: TID }).lean()).toMatchObject({ status: 'suspended', suspendedBy: o.id, suspendReason: 'politika ihlali' });
        }
        expect(cache.get(p.id, TID, 0)).toBeUndefined(); // oturum anında düşer (aynı pod)
        await flush();
        expect(audits.find((x) => x.event === 'membership.suspend')).toMatchObject({ sub: o.id, tid: TID, meta: { targetUserId: p.id, targetRole: 'operator', fromStatus: 'active', toStatus: 'suspended' } });
        expect(notifications.find((n) => n.code === 'SECURITY_MEMBER_SUSPENDED')).toMatchObject({ tid: TID, params: { targetUserId: p.id } });
        expect(JSON.stringify(notifications)).not.toContain(p.email);

        // idempotent: ikinci askı tokenVersion'ı tekrar artırmaz
        await susp(mode).suspend(TID, actorOf(o.id, OWNER_RANK), { userId: p.id });
        expect((await Users.findById(p.id).lean() as any).tokenVersion).toBe(1);

        // yeniden etkinleştirme
        await expect(susp(mode).reactivate(TID, actorOf(o.id, OWNER_RANK), { userId: p.id })).resolves.toEqual({ success: true, status: 'active' });
        const r: any = await Users.findById(p.id).lean();
        if (mode !== 'membership') expect(r.isActive).toBe(true);
        if (mode !== 'legacy') expect(await Memberships.findOne({ userId: p.id }).lean()).toMatchObject({ status: 'active' });
        await flush();
        expect(auditEvents()).toContain('membership.reactivate');
    });

    it('FE listesinin tenant kopyası _id\'si de hedef olarak kabul edilir', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        const p = await seedMember(mode, 'op', 'operator');
        if (mode === 'membership') return; // membership modunda tenant kopyası okunmaz
        const copyId = String((await TenantUsers.findOne({ email: p.email }).lean() as any)._id);
        await susp(mode).suspend(TID, actorOf(o.id, OWNER_RANK), { userId: copyId });
        expect((await Users.findById(p.id).lean() as any).isActive).toBe(false);
    });

    it('hedef kuralları: admin sahibi askıya alamaz (403), kendini askıya alamaz, başka mağazadaki/olmayan hedef 404, impersonation 403', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        const a = await seedMember(mode, 'admin', 'admin');
        await rejectsWith(susp(mode).suspend(TID, actorOf(a.id, ADMIN_RANK), { userId: o.id }), 403);
        await rejectsWith(susp(mode).suspend(TID, actorOf(a.id, ADMIN_RANK), { userId: a.id }), 403);
        await rejectsWith(susp(mode).suspend(TID, actorOf(a.id, ADMIN_RANK), { userId: '507f1f77bcf86cd799439099' }), 404);
        await rejectsWith(susp(mode).suspend(TID, actorOf(a.id, ADMIN_RANK), { userId: 'not-an-id' }), 404);
        const foreign: any = await Users.create({ email: 'f@example.test', name: 'F', surname: 'T', password: 'x', order: 99, roleCode: 'ROLE_OPERATOR' });
        await rejectsWith(susp(mode).suspend(TID, actorOf(a.id, ADMIN_RANK), { userId: String(foreign._id) }), 404);
        await rejectsWith(susp(mode).suspend(TID, actorOf(o.id, OWNER_RANK, { imp: true }), { userId: a.id }), 403);
        expect((await Users.findById(o.id).lean() as any).tokenVersion).toBe(0); // hiçbir yazma yapılmadı
    });

    it('sahip başka sahibi askıya alabilir (iki sahip varken); admin, admini askıya alabilir', async () => {
        const o1 = await seedMember(mode, 'o1', 'owner');
        const o2 = await seedMember(mode, 'o2', 'owner');
        const a1 = await seedMember(mode, 'a1', 'admin');
        const a2 = await seedMember(mode, 'a2', 'admin');
        await expect(susp(mode).suspend(TID, actorOf(a1.id, ADMIN_RANK), { userId: a2.id })).resolves.toMatchObject({ status: 'suspended' });
        await expect(susp(mode).suspend(TID, actorOf(o1.id, OWNER_RANK), { userId: o2.id })).resolves.toMatchObject({ status: 'suspended' });
    });

    it('SON SAHİP askıya alınamaz (409 LAST_OWNER); hiçbir yazma/oturum iptali yok', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        // aktör sahip kademeli ama tenant'ın tek AKTİF sahibi hedeftir (ör. platform yöneticisi / eşzamanlı askı sonrası)
        await rejectsWith(susp(mode).suspend(TID, actorOf('some-other', OWNER_RANK), { userId: o.id }), 409, 'LAST_OWNER');
        expect((await Users.findById(o.id).lean() as any).tokenVersion).toBe(0);
        if (mode !== 'membership') expect((await Users.findById(o.id).lean() as any).isActive).not.toBe(false);
    });

    it('iki sahibin eşzamanlı karşılıklı askıya alması tenant\'ı sahipsiz BIRAKMAZ (işlem sonrası sayım + telafi)', async () => {
        const o1 = await seedMember(mode, 'o1', 'owner');
        const o2 = await seedMember(mode, 'o2', 'owner');
        await Promise.allSettled([
            susp(mode).suspend(TID, actorOf(o1.id, OWNER_RANK), { userId: o2.id }),
            susp(mode).suspend(TID, actorOf(o2.id, OWNER_RANK), { userId: o1.id }),
        ]);
        const active = mode === 'membership'
            ? await Memberships.countDocuments({ tid: TID, role: 'owner', status: 'active' })
            : await Users.countDocuments({ order: TID, owner: true, isActive: { $ne: false } });
        expect(active).toBeGreaterThanOrEqual(1);
    });
});

it('askı -> oturum reddi (membership modu): Memberships durumu authenticate kararını 403 MEMBERSHIP_SUSPENDED yapar; tokenVersion artışı eski token\'ı düşürür', async () => {
    const o = await seedMember('membership', 'owner', 'owner');
    const p = await seedMember('membership', 'op', 'operator');
    const before = decide('membership', { [MEMBERSHIP_CACHE_FIELD]: await loadMembership(appDb, p.id, TID) });
    expect(before.role).toBe('operator');
    await susp('membership').suspend(TID, actorOf(o.id, OWNER_RANK), { userId: p.id });
    const snap = await loadMembership(appDb, p.id, TID);
    expect(snap).toMatchObject({ status: 'suspended' });
    expect(() => decide('membership', { [MEMBERSHIP_CACHE_FIELD]: snap })).toThrow(expect.objectContaining({ statusCode: 403, code: 'MEMBERSHIP_SUSPENDED' }));
    const u: any = await Users.findById(p.id).lean();
    expect(u.tokenVersion).toBeGreaterThan(0); // token'daki tv=0 artık uyuşmaz
});

// =====================================================================================================================
describe('adım-yükseltmesi (reauthenticate)', () => {
    const lifecycle = () => new AccountLifecycleService({ applicationDB: appDb, security: fakeSecurity, mailSender, now: () => nowMs, getClientDB: async () => clientDb });

    it('doğru parola Users.reauthAt yazar (5 dk); yanlış parola 400 + sayaç; imp 403', async () => {
        const o = await seedMember('legacy', 'owner', 'owner');
        const principal = { sub: o.id, tid: TID };
        await rejectsWith(lifecycle().reauthenticate(principal, 'wrong'), 400, 'INVALID_CURRENT_PASSWORD');
        expect((await Users.findById(o.id).lean() as any).failedLoginAttempts).toBe(1);
        const r: any = await lifecycle().reauthenticate(principal, STRONG);
        expect(r.reauthValidUntil.getTime()).toBe(nowMs + REAUTH_WINDOW_MS);
        const u: any = await Users.findById(o.id).lean();
        expect(u.reauthAt.getTime()).toBe(nowMs);
        expect(u.failedLoginAttempts).toBe(0);
        await rejectsWith(lifecycle().reauthenticate({ ...principal, imp: true }, STRONG), 403);
        await rejectsWith(lifecycle().reauthenticate(principal, { $ne: '' } as any), 400);
        await flush();
        expect(audits.filter((x) => x.event === 'reauth').map((x) => x.result)).toEqual(['fail', 'ok']);
    });
});

// =====================================================================================================================
describe.each(MODES)('sahiplik devri (MEMBERSHIP_SOURCE=%s)', (mode) => {
    const reauthed = async (id: string, ago = 1000) => { await Users.updateOne({ _id: id }, { $set: { reauthAt: new Date(nowMs - ago) } }); };

    it('adım 1: step-up yoksa/5 dk\'yı aştıysa 401 REAUTH_REQUIRED; yalnız sahip; hedef aktif + e-postası doğrulanmış üye olmalı', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        const a = await seedMember(mode, 'admin', 'admin');
        const un = await seedMember(mode, 'unv', 'admin', { emailVerified: false });
        const sp = await seedMember(mode, 'susp', 'admin');
        await susp(mode).suspend(TID, actorOf(o.id, OWNER_RANK), { userId: sp.id });
        await Users.updateOne({ _id: o.id }, { $unset: { reauthAt: 1 } }); // tohumdaki varsayılan step-up'ı sil

        await rejectsWith(own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: a.id }), 401, 'REAUTH_REQUIRED');
        await reauthed(o.id, REAUTH_WINDOW_MS + 1000);
        await rejectsWith(own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: a.id }), 401, 'REAUTH_REQUIRED');
        await reauthed(o.id);
        await rejectsWith(own(mode).initiate(TID, actorOf(a.id, ADMIN_RANK), { targetUserId: o.id }), 403);
        await rejectsWith(own(mode).initiate(TID, actorOf(o.id, OWNER_RANK, { imp: true }), { targetUserId: a.id }), 403);
        await rejectsWith(own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: o.id }), 400);
        await rejectsWith(own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: un.id }), 409, 'TARGET_EMAIL_UNVERIFIED');
        await rejectsWith(own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: sp.id }), 409, 'TARGET_NOT_ACTIVE');
        await rejectsWith(own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: '507f1f77bcf86cd799439099' }), 404);
        expect(await Tokens.countDocuments({ purpose: 'ownership_transfer' })).toBe(0);
        expect(mails.filter((m) => /sahiplik/i.test(m.subject))).toHaveLength(0);
    });

    it('adım 1 başarılı: 72 saatlik tek kullanımlık belirteç (yalnız özet), hedefe e-posta + bildirim; önceki bekleyen devir iptal olur', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        const a = await seedMember(mode, 'admin', 'admin');
        const b = await seedMember(mode, 'adm2', 'admin');
        await reauthed(o.id);
        const r1: any = await own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: a.id });
        expect(r1.expiresAt.getTime()).toBe(nowMs + 72 * 3600_000);
        const mail = mails.find((m) => m.to === a.email)!;
        const token = tokenFrom(mail);
        expect(mail.text).toContain('/accept-ownership#t=');
        const rec: any = await Tokens.findOne({ purpose: 'ownership_transfer', usedAt: null }).lean();
        expect(rec).toMatchObject({ sub: a.id, tid: TID, initiatedBy: o.id, tokenHash: hashToken(token) });
        expect(JSON.stringify(rec)).not.toContain(token);
        expect(notifications.find((n) => n.code === 'SECURITY_OWNERSHIP_TRANSFER_REQUESTED')).toMatchObject({ opts: { recipients: { userIds: [a.id] } } });
        expect(JSON.stringify(notifications)).not.toContain(token);
        await flush();
        expect(audits.find((x) => x.event === 'ownership.transfer.request')).toMatchObject({ sub: o.id, tid: TID, meta: { targetUserId: a.id, toRole: 'owner' } });

        // ikinci devir başlatılırsa ilki geçersiz (tenant başına tek bekleyen)
        await own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: b.id });
        expect(await Tokens.countDocuments({ purpose: 'ownership_transfer', usedAt: null })).toBe(1);
        await rejectsWith(own(mode).accept(TID, { sub: a.id }, { token }), 400, 'TOKEN_INVALID');
    });

    it('adım 2 kabul: önce hedef owner, sonra eski sahip admin; iki tarafın tokenVersion\'ı artar; audit + bildirim; tek kullanım', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        const a = await seedMember(mode, 'admin', 'admin');
        await reauthed(o.id);
        await own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: a.id });
        const token = tokenFrom(mails.find((m) => m.to === a.email)!);
        const cache = getIdentityCache();
        cache.set(o.id, TID, 0, { _id: o.id }, cache.epoch);

        // başkası (sahibin kendisi dahil) kabul edemez, belirteç yanmaz
        await rejectsWith(own(mode).accept(TID, { sub: o.id }, { token }), 400, 'TOKEN_INVALID');
        await rejectsWith(own(mode).accept(TID, { sub: 'someone-else' }, { token }), 400, 'TOKEN_INVALID');
        await rejectsWith(own(mode).accept(TID, { sub: a.id, imp: true }, { token }), 403);
        await rejectsWith(own(mode).accept(TID, { sub: a.id }, { token: 'short' }), 400, 'TOKEN_INVALID');

        await expect(own(mode).accept(TID, { sub: a.id, ip: '203.0.113.9' }, { token })).resolves.toEqual({ success: true });
        const [uo, ua]: any[] = await Promise.all([Users.findById(o.id).lean(), Users.findById(a.id).lean()]);
        expect(ua).toMatchObject({ owner: true, roleCode: 'ROLE_OWNER', tokenVersion: 1 });
        expect(uo).toMatchObject({ owner: false, roleCode: 'ROLE_ADMIN', tokenVersion: 1 });
        if (mode !== 'membership') {
            expect((await TenantUsers.findOne({ email: a.email }).lean() as any).roleCode).toBe('ROLE_OWNER');
            expect((await TenantUsers.findOne({ email: o.email }).lean() as any).roleCode).toBe('ROLE_ADMIN');
        }
        if (mode !== 'legacy') {
            expect(await Memberships.findOne({ userId: a.id }).lean()).toMatchObject({ role: 'owner', status: 'active' });
            expect(await Memberships.findOne({ userId: o.id }).lean()).toMatchObject({ role: 'admin', status: 'active' });
        }
        expect(cache.get(o.id, TID, 0)).toBeUndefined();
        await flush();
        expect(audits.find((x) => x.event === 'ownership.transfer.accept' && x.result === 'ok')).toMatchObject({ sub: a.id, tid: TID, meta: { targetUserId: a.id, fromRole: 'admin', toRole: 'owner', fromOwnerId: o.id, toOwnerId: a.id } });
        expect(audits.find((x) => x.event === 'membership.role_change')).toMatchObject({ meta: { targetUserId: o.id, fromRole: 'owner', toRole: 'admin' } });
        expect(notifications.some((n) => n.code === 'SECURITY_OWNERSHIP_TRANSFERRED')).toBe(true);
        // tek kullanım
        await rejectsWith(own(mode).accept(TID, { sub: a.id }, { token }), 400, 'TOKEN_INVALID');
        // tenant'ta tam bir aktif sahip
        const owners = mode === 'membership' ? await Memberships.countDocuments({ tid: TID, role: 'owner', status: 'active' }) : await Users.countDocuments({ order: TID, owner: true });
        expect(owners).toBe(1);
    });

    it('ATOMİKLİK: eski sahip yazımı başarısız olursa hedefin rolü geri alınır, sahip değişmez, belirteç yeniden kullanılabilir', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        const a = await seedMember(mode, 'admin', 'admin');
        await reauthed(o.id);
        await own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: a.id });
        const token = tokenFrom(mails.find((m) => m.to === a.email)!);

        // eski sahibi admin'e düşüren yazımı (Users.roleCode=ROLE_ADMIN / Membership.role=admin) düşür
        const realUpdate = (mode === 'membership' ? Memberships : Users).updateOne.bind(mode === 'membership' ? Memberships : Users);
        const target = mode === 'membership' ? Memberships : Users;
        const spy = jest.spyOn(target, 'updateOne').mockImplementation(((filter: any, update: any, opts: any) => {
            const set = update?.$set ?? {};
            const hitsOldOwner = String(filter?._id ?? filter?.userId) === o.id && (set.roleCode === 'ROLE_ADMIN' || set.role === 'admin');
            if (hitsOldOwner) return Promise.reject(new Error('disk hatası'));
            return realUpdate(filter, update, opts);
        }) as any);
        await expect(own(mode).accept(TID, { sub: a.id }, { token })).rejects.toThrow('disk hatası');
        spy.mockRestore();

        const [uo, ua]: any[] = await Promise.all([Users.findById(o.id).lean(), Users.findById(a.id).lean()]);
        expect(uo).toMatchObject({ owner: true, roleCode: 'ROLE_OWNER', tokenVersion: 0 });
        expect(ua).toMatchObject({ owner: false, roleCode: 'ROLE_ADMIN', tokenVersion: 0 });
        if (mode !== 'legacy') {
            expect(await Memberships.findOne({ userId: o.id }).lean()).toMatchObject({ role: 'owner' });
            expect(await Memberships.findOne({ userId: a.id }).lean()).toMatchObject({ role: 'admin' });
        }
        expect(await Tokens.countDocuments({ purpose: 'ownership_transfer', usedAt: null })).toBe(1);
        // düzelince aynı belirteçle tamamlanır
        await expect(own(mode).accept(TID, { sub: a.id }, { token })).resolves.toEqual({ success: true });
    });

    it('süre dolumu (72 saat) ve iptal: kabul edilemez', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        const a = await seedMember(mode, 'admin', 'admin');
        await reauthed(o.id);
        await own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: a.id });
        const t1 = tokenFrom(mails.find((m) => m.to === a.email)!);
        nowMs += 72 * 3600_000 + 1000;
        await rejectsWith(own(mode).accept(TID, { sub: a.id }, { token: t1 }), 400, 'TOKEN_INVALID');

        await reauthed(o.id);
        await own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: a.id });
        const t2 = tokenFrom(mails.filter((m) => m.to === a.email)[1]);
        await rejectsWith(own(mode).cancel(TID, actorOf(a.id, ADMIN_RANK)), 403);
        await expect(own(mode).cancel(TID, actorOf(o.id, OWNER_RANK))).resolves.toMatchObject({ success: true, cancelled: 1 });
        await rejectsWith(own(mode).accept(TID, { sub: a.id }, { token: t2 }), 400, 'TOKEN_INVALID');
        await flush();
        expect(auditEvents()).toContain('ownership.transfer.cancel');
        expect((await Users.findById(o.id).lean() as any).owner).toBe(true);
    });

    it('taraflar değişirse (eski sahip askıya alındı/artık sahip değil) kabul geçersiz sayılır', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        const o2 = await seedMember(mode, 'owner2', 'owner');
        const a = await seedMember(mode, 'admin', 'admin');
        await reauthed(o.id);
        await own(mode).initiate(TID, actorOf(o.id, OWNER_RANK), { targetUserId: a.id });
        const token = tokenFrom(mails.find((m) => m.to === a.email)!);
        await susp(mode).suspend(TID, actorOf(o2.id, OWNER_RANK), { userId: o.id });
        await rejectsWith(own(mode).accept(TID, { sub: a.id }, { token }), 400, 'TOKEN_INVALID');
        expect((await Users.findById(a.id).lean() as any).owner).toBe(false);
    });
});


// =====================================================================================================================
// [ADR-0028 WP-A5 / Karar 8] Adım-yükseltmesi: admin rolü verme (davet) + sahip olmayanı askıya alma. Pencere 5 dk (Users.reauthAt).
describe.each(MODES)('step-up kapsamı (MEMBERSHIP_SOURCE=%s)', (mode) => {
    const setReauth = (id: string, ago: number | null) => ago === null
        ? Users.updateOne({ _id: id }, { $unset: { reauthAt: 1 } })
        : Users.updateOne({ _id: id }, { $set: { reauthAt: new Date(nowMs - ago) } });

    it('admin rolü davetle verme: reauth yok / 5 dk geçmiş -> 401 REAUTH_REQUIRED; pencere içinde başarılı; operator daveti step-up İSTEMEZ', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        await setReauth(a.id, null);
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'x@example.test', role: 'admin' }), 401, 'REAUTH_REQUIRED');
        await setReauth(a.id, REAUTH_WINDOW_MS + 1000);
        await rejectsWith(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'x@example.test', role: 'admin' }), 401, 'REAUTH_REQUIRED');
        await expect(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'op@example.test', role: 'operator' })).resolves.toMatchObject({ role: 'operator' });
        await setReauth(a.id, REAUTH_WINDOW_MS - 1000);
        await expect(inv(mode).invite(TID, actorOf(a.id, ADMIN_RANK), { email: 'x@example.test', role: 'admin' })).resolves.toMatchObject({ role: 'admin' });
        expect(await Invitations.countDocuments({})).toBe(2);
    });

    it('sahip olmayanı askıya alma: reauth yoksa 401 (hedef DEĞİŞMEZ, tokenVersion artmaz); pencere içinde başarılı', async () => {
        const a = await seedMember(mode, 'admin', 'admin');
        const p = await seedMember(mode, 'staff', 'operator');
        await setReauth(a.id, null);
        await rejectsWith(susp(mode).suspend(TID, actorOf(a.id, ADMIN_RANK), { userId: p.id }), 401, 'REAUTH_REQUIRED');
        expect(await Users.findOne({ _id: p.id }).lean()).toMatchObject({ tokenVersion: 0 });
        await setReauth(a.id, REAUTH_WINDOW_MS + 1);
        await rejectsWith(susp(mode).suspend(TID, actorOf(a.id, ADMIN_RANK), { userId: p.id }), 401, 'REAUTH_REQUIRED');
        await setReauth(a.id, 1000);
        await expect(susp(mode).suspend(TID, actorOf(a.id, ADMIN_RANK), { userId: p.id })).resolves.toMatchObject({ status: 'suspended' });
    });

    it('askıya alma / rol değişimi sonrası hedefin ESKİ oturumu düşer: tokenVersion artar + kimlik önbelleği o kullanıcı için temizlenir', async () => {
        const o = await seedMember(mode, 'owner', 'owner');
        const p = await seedMember(mode, 'staff', 'operator');
        const before: any = await Users.findOne({ _id: p.id }).lean();
        await susp(mode).suspend(TID, actorOf(o.id, OWNER_RANK), { userId: p.id });
        const after: any = await Users.findOne({ _id: p.id }).lean();
        expect(after.tokenVersion).toBe(before.tokenVersion + 1); // eski JWT (tv=0) authenticate'te tv uyuşmazlığıyla 401 olur
    });
});
