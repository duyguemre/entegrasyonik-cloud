// B12: platform yoneticisi yonetimi (AdminUserManager + yetenek kaydi + step-up + davet kabul ucu). DB/Redis/SMTP YOK (bellek-ici sahteler).
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import type { Server } from 'http';
import { AdminUserManager } from '../../../../src/api/admin/adminUserManager';
import { resolveBackofficeBaseUrl } from '../../../../src/api/rpc/handlers/backoffice-admin-user-service';
import { requiresStepUp, REAUTH_RPCS } from '../../../../src/api/admin/stepUp';
import { getRequiredTier } from '../../../../src/api/rpc/operationPolicy';
import { BACKOFFICE_RPC_INPUT } from '../../../../src/capabilities/rpc-input/backoffice';
import { CAPABILITY_BY_RPC } from '../../../../src/capabilities';
import { AuditLogger } from '../../../../src/services/audit/AuditLogger';
import { hashToken } from '../../../../src/operations/account/accountTokens';
import { createAdminRouter } from '../../../../src/api/admin/AdminApiManager';
import { Clock, InMemoryMfaStore, makeDeps } from '../../../helpers/adminFakes';

const ME = 'a1b2c3d4e5f6a7b8c9d0e1f2';
const OTHER = 'b1b2c3d4e5f6a7b8c9d0e1f3';
const THIRD = 'c1b2c3d4e5f6a7b8c9d0e1f4';
const STRONG = 'Kl0nk-Mavi-Bulut-77';

// ---- minimal bellek-ici Mongo benzeri koleksiyon ----
const isMissing = (v: any) => v === undefined || v === null;
function matchOne(doc: any, k: string, cond: any): boolean {
    const v = doc[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
        if ('$ne' in cond) return v !== cond.$ne;
        if ('$in' in cond) return cond.$in.map(String).includes(String(v));
        if ('$gt' in cond) return v !== undefined && new Date(v).getTime() > new Date(cond.$gt).getTime();
        return false;
    }
    if (cond === null) return isMissing(v);
    return String(v) === String(cond);
}
const matches = (doc: any, f: any) => Object.entries(f).every(([k, c]) => matchOne(doc, k, c));
function applyUpdate(doc: any, u: any) {
    for (const [k, v] of Object.entries(u.$set ?? {})) doc[k] = v;
    for (const k of Object.keys(u.$unset ?? {})) delete doc[k];
    for (const [k, v] of Object.entries(u.$inc ?? {})) doc[k] = (doc[k] ?? 0) + (v as number);
}
class Coll {
    seq = 0;
    failDup = false;
    aggResult: any[] = [];
    constructor(public docs: any[] = []) { }
    find(f: any) {
        const out = this.docs.filter(d => matches(d, f)).map(d => ({ ...d }));
        const chain: any = { sort: () => chain, limit: () => chain, lean: async () => out };
        return chain;
    }
    findOne(f: any) { const d = this.docs.find(x => matches(x, f)); return { lean: async () => (d ? { ...d } : null) }; }
    findOneAndUpdate(f: any, u: any) { const d = this.docs.find(x => matches(x, f)); const before = d ? { ...d } : null; if (d) applyUpdate(d, u); return { lean: async () => before }; }
    async updateOne(f: any, u: any) { const d = this.docs.find(x => matches(x, f)); if (d) applyUpdate(d, u); return { modifiedCount: d ? 1 : 0 }; }
    async updateMany(f: any, u: any) { let n = 0; for (const d of this.docs.filter(x => matches(x, f))) { applyUpdate(d, u); n++; } return { modifiedCount: n }; }
    async deleteOne(f: any) { const i = this.docs.findIndex(x => matches(x, f)); if (i >= 0) this.docs.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; }
    async countDocuments(f: any) { return this.docs.filter(d => matches(d, f)).length; }
    async create(doc: any) {
        if (this.failDup) { const e: any = new Error('dup'); e.code = 11000; throw e; }
        const d = { _id: doc._id ?? `f${String(++this.seq).padStart(23, '0')}`, ...doc };
        this.docs.push(d);
        return { ...d };
    }
    aggregate() { return { option: async () => this.aggResult }; }
}

const admin = (sub: string, over: any = {}) => ({ _id: sub, email: `${sub.slice(0, 2)}@example.test`, name: 'Ad', surname: 'Soyad', password: 'HASH-SECRET', isGlobalAdmin: true, isActive: true, tokenVersion: 0, createdAt: new Date('2026-01-01'), ...over });

let users: Coll; let tokens: Coll; let mfaColl: Coll; let auditColl: Coll; let mfa: InMemoryMfaStore;
let mails: any[]; let audits: any[]; let clock: Clock; let base: string | null;
const settle = () => new Promise(r => setTimeout(r, 5));
const make = () => new AdminUserManager({
    applicationDB: { getUserModel: () => users, getAccountTokenModel: () => tokens, getAdminMfaModel: () => mfaColl, getAuditLogModel: () => auditColl } as any,
    mfaStore: mfa, now: clock.now, backofficeBaseUrl: () => base,
    mailSender: async (to, subject, text) => { mails.push({ to, subject, text }); },
});
const actor = { sub: ME, ip: '1.1.1.1' };
const tokenFromMail = (i: number) => /#t=([A-Za-z0-9_-]+)/.exec(mails[i].text)![1];

beforeEach(() => {
    clock = new Clock(); base = 'https://admin.example.test'; mails = []; audits = [];
    users = new Coll([admin(ME), admin(OTHER)]); tokens = new Coll(); mfaColl = new Coll(); auditColl = new Coll(); mfa = new InMemoryMfaStore();
    AuditLogger.setSink(async (r: any) => { audits.push(r); });
});
afterEach(() => { AuditLogger.setSink(undefined); });

describe('yetenek kaydi + step-up + semalar', () => {
    const RPCS = ['list', 'invite', 'disable', 'enable', 'resetMfa'].map(o => 'BackofficeAdminUserService/' + o);
    it('bes uc de platformAdmin kademeli, yetenekli ve semali', () => {
        for (const rpc of RPCS) {
            const [s, o] = rpc.split('/');
            expect(getRequiredTier(s, o)).toBe('platformAdmin');
            expect(CAPABILITY_BY_RPC.get(rpc)).toBeDefined();
            expect(BACKOFFICE_RPC_INPUT[rpc as any]).toBeDefined();
        }
    });
    it('yazan dort uc STEP-UP ister; list istemez', () => {
        for (const o of ['invite', 'disable', 'enable', 'resetMfa']) expect(requiresStepUp('BackofficeAdminUserService/' + o)).toBe(true);
        expect(requiresStepUp('BackofficeAdminUserService/list')).toBe(false);
        expect(REAUTH_RPCS.has('BackofficeAdminUserService/enable')).toBe(true);
    });
    it('girdi: strict, sub ObjectId, e-posta bicimi, gerekce zorunlu', () => {
        const s = BACKOFFICE_RPC_INPUT;
        expect(s['BackofficeAdminUserService/invite']!.safeParse({ email: 'a@b.co', reason: 'yeni yonetici' }).success).toBe(true);
        expect(s['BackofficeAdminUserService/invite']!.safeParse({ email: 'yok', reason: 'yeni yonetici' }).success).toBe(false);
        expect(s['BackofficeAdminUserService/invite']!.safeParse({ email: 'a@b.co' }).success).toBe(false);
        expect(s['BackofficeAdminUserService/disable']!.safeParse({ sub: { $ne: 1 }, reason: 'xxxxxxxxxx' }).success).toBe(false);
        expect(s['BackofficeAdminUserService/disable']!.safeParse({ sub: ME, reason: 'xxxxxxxxxx', isGlobalAdmin: false }).success).toBe(false);
        expect(s['BackofficeAdminUserService/resetMfa']!.safeParse({ sub: ME, reason: 'xxxxxxxxxx' }).success).toBe(true);
        expect(s['BackofficeAdminUserService/list']!.safeParse({ x: 1 }).success).toBe(false);
    });
    it('backoffice taban adresi: ilk ADMIN_CORS_ORIGINS; https ya da yerel http', () => {
        expect(resolveBackofficeBaseUrl(['https://admin.example.test'])).toBe('https://admin.example.test');
        expect(resolveBackofficeBaseUrl(['http://localhost:3020'])).toBe('http://localhost:3020');
        expect(resolveBackofficeBaseUrl(['http://evil.example.test'])).toBeNull();
        expect(resolveBackofficeBaseUrl([])).toBeNull();
    });
});

describe('list', () => {
    it('beyaz liste: sir/parola/kurtarma YOK; durum/MFA/son giris/kilit dogru', async () => {
        users.docs.push(admin(THIRD, { isActive: false, lockUntil: new Date(clock.now() + 60_000) }));
        users.docs.push({ ...admin('d1b2c3d4e5f6a7b8c9d0e1f5'), adminInvitePending: true, isActive: false });
        users.docs.push({ _id: 'e1', email: 'tenant@example.test', isGlobalAdmin: false });
        mfaColl.docs.push({ sub: ME, enabledAt: new Date(), secret: 'enc:v1:SECRET', recoveryHashes: [{ hash: 'RECOVERY-HASH' }] });
        auditColl.aggResult = [{ _id: ME, at: new Date('2026-09-29T10:00:00Z') }];
        const out = await make().list();
        const json = JSON.stringify(out);
        for (const leak of ['HASH-SECRET', 'enc:v1', 'RECOVERY-HASH', 'secret', 'password']) expect(json).not.toContain(leak);
        expect(out.items).toHaveLength(4); // tenant kullanicisi listede yok
        const by: Record<string, any> = Object.fromEntries(out.items.map((i: any) => [i.sub, i]));
        expect(by[ME]).toMatchObject({ status: 'active', mfaEnabled: true, locked: false, lastLoginAt: new Date('2026-09-29T10:00:00Z') });
        expect(by[OTHER]).toMatchObject({ mfaEnabled: false, lastLoginAt: null });
        expect(by[THIRD]).toMatchObject({ status: 'disabled', locked: true });
        expect(by['d1b2c3d4e5f6a7b8c9d0e1f5'].status).toBe('invited');
        expect(Object.keys(by[ME]).sort()).toEqual(['createdAt', 'email', 'lastLoginAt', 'locked', 'mfaEnabled', 'name', 'status', 'sub', 'surname']);
    });
});

describe('invite', () => {
    it('yeni yonetici: bekleyen taslak + tek kullanimlik 256-bit token (yalniz hash saklanir) + backoffice baglantisi', async () => {
        const r = await make().invite(actor, { email: 'Yeni@Example.test', reason: 'yeni ekip uyesi' });
        expect(r).toMatchObject({ status: 'invited', renewed: false });
        const draft = users.docs.find(u => u.email === 'yeni@example.test');
        expect(draft).toMatchObject({ isGlobalAdmin: true, isActive: false, adminInvitePending: true });
        expect(mails).toHaveLength(1);
        expect(mails[0].text).toContain('https://admin.example.test/accept-invite#t=');
        const token = tokenFromMail(0);
        expect(token).toHaveLength(43);
        expect(tokens.docs[0]).toMatchObject({ purpose: 'admin_invite', tokenHash: hashToken(token), sub: draft._id });
        expect(JSON.stringify(tokens.docs)).not.toContain(token);
        await settle();
        expect(JSON.stringify(audits)).not.toContain(token);
        expect(audits.find(a => a.event === 'backoffice.admin.invite')).toMatchObject({ result: 'ok', sub: ME, surface: 'backoffice', meta: { targetSub: draft._id, renewed: false } });
    });
    it('mevcut kullanici e-postasi (tenant ya da yonetici) REDDEDILIR; hicbir sey yazilmaz/gonderilmez', async () => {
        users.docs.push({ _id: 'e1', email: 'tenant@example.test', isGlobalAdmin: false, order: 5 });
        const before = users.docs.length;
        await expect(make().invite(actor, { email: 'tenant@example.test' })).rejects.toMatchObject({ statusCode: 409, code: 'ADMIN_INVITE_EXISTING_USER' });
        await expect(make().invite(actor, { email: users.docs[1].email })).rejects.toMatchObject({ code: 'ADMIN_INVITE_EXISTING_USER' });
        expect(users.docs).toHaveLength(before); expect(tokens.docs).toHaveLength(0); expect(mails).toHaveLength(0);
        expect(users.docs.find(u => u._id === 'e1').isGlobalAdmin).toBe(false);
    });
    it('yarisma (E11000) -> ayni 409; bicim hatasi 400; taban adres yoksa 503 ve hicbir sey yazilmaz', async () => {
        users.failDup = true;
        await expect(make().invite(actor, { email: 'x@example.test' })).rejects.toMatchObject({ code: 'ADMIN_INVITE_EXISTING_USER' });
        users.failDup = false;
        await expect(make().invite(actor, { email: 'bozuk' })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
        base = null;
        await expect(make().invite(actor, { email: 'x@example.test' })).rejects.toMatchObject({ statusCode: 503, code: 'ADMIN_INVITE_UNAVAILABLE' });
        expect(users.docs).toHaveLength(2);
    });
    it('bekleyen davet yeniden gonderilince yenilenir: eski token olur, yeni calisir, taslak cogalmaz', async () => {
        await make().invite(actor, { email: 'yeni@example.test' });
        const t1 = tokenFromMail(0);
        const r = await make().invite(actor, { email: 'yeni@example.test' });
        expect(r.renewed).toBe(true);
        expect(users.docs.filter(u => u.email === 'yeni@example.test')).toHaveLength(1);
        const t2 = tokenFromMail(1);
        await expect(make().acceptInvite({ token: t1, name: 'Ali', surname: 'Veli', password: STRONG })).rejects.toMatchObject({ code: 'ADMIN_INVITE_INVALID' });
        await expect(make().acceptInvite({ token: t2, name: 'Ali', surname: 'Veli', password: STRONG })).resolves.toEqual({ accepted: true });
    });
    it('e-posta gonderilemezse 503 (taslak kalir, ayni cagriyla yeniden gonderilir)', async () => {
        const m = new AdminUserManager({
            applicationDB: { getUserModel: () => users, getAccountTokenModel: () => tokens } as any, mfaStore: mfa, now: clock.now, backofficeBaseUrl: () => base,
            mailSender: async () => { throw new Error('smtp'); },
        });
        await expect(m.invite(actor, { email: 'yeni@example.test' })).rejects.toMatchObject({ statusCode: 503, code: 'ADMIN_INVITE_UNAVAILABLE' });
        await expect(make().invite(actor, { email: 'yeni@example.test' })).resolves.toMatchObject({ renewed: true });
    });
});

describe('acceptInvite', () => {
    async function invited() {
        await make().invite(actor, { email: 'yeni@example.test' });
        return { token: tokenFromMail(0), id: users.docs.find(u => u.email === 'yeni@example.test')._id as string };
    }
    it('basarili: etkinlesir, parola yazilir, tokenVersion++, tek kullanim', async () => {
        const { token, id } = await invited();
        await make().acceptInvite({ token, name: 'Ali', surname: 'Veli', password: STRONG });
        const u = users.docs.find(x => x._id === id);
        expect(u).toMatchObject({ isActive: true, name: 'Ali', surname: 'Veli', emailVerified: true, tokenVersion: 1 });
        expect(u.adminInvitePending).toBeUndefined();
        expect(u.password).toMatch(/^\$2[aby]\$/);
        await expect(make().acceptInvite({ token, name: 'A', surname: 'B', password: STRONG })).rejects.toMatchObject({ code: 'ADMIN_INVITE_INVALID' });
    });
    it('zayif parola token YAKMAZ; gecersiz/sureli/bicimsiz token hep ayni genel hata', async () => {
        const { token } = await invited();
        await expect(make().acceptInvite({ token, name: 'Ali', surname: 'Veli', password: '12345678' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
        await expect(make().acceptInvite({ token: 'x', name: 'Ali', surname: 'Veli', password: STRONG })).rejects.toMatchObject({ statusCode: 400, code: 'ADMIN_INVITE_INVALID' });
        await expect(make().acceptInvite({ token: { $ne: 1 }, name: 'Ali', surname: 'Veli', password: STRONG })).rejects.toMatchObject({ code: 'ADMIN_INVITE_INVALID' });
        clock.advance(49 * 3600_000);
        await expect(make().acceptInvite({ token, name: 'Ali', surname: 'Veli', password: STRONG })).rejects.toMatchObject({ code: 'ADMIN_INVITE_INVALID' });
    });
    it('iptal edilen (kapatilan) davet kabul edilemez', async () => {
        const { token, id } = await invited();
        await make().disable(actor, { sub: id });
        await expect(make().acceptInvite({ token, name: 'Ali', surname: 'Veli', password: STRONG })).rejects.toMatchObject({ code: 'ADMIN_INVITE_INVALID' });
    });
});

describe('disable / enable', () => {
    it('kendini kapatamaz; gecersiz sub 400; yonetici olmayan 404', async () => {
        await expect(make().disable(actor, { sub: ME })).rejects.toMatchObject({ statusCode: 403, code: 'ADMIN_SELF_ACTION' });
        await expect(make().disable(actor, { sub: { $ne: 'x' } })).rejects.toMatchObject({ statusCode: 400 });
        users.docs.push({ _id: THIRD, email: 't@example.test', isGlobalAdmin: false });
        await expect(make().disable(actor, { sub: THIRD })).rejects.toMatchObject({ statusCode: 404 });
    });
    it('kapatma: isActive=false, tokenVersion++, audit; ikinci cagri idempotent', async () => {
        await expect(make().disable(actor, { sub: OTHER, reason: 'isten ayrildi kisi' })).resolves.toEqual({ sub: OTHER, status: 'disabled' });
        expect(users.docs.find(u => u._id === OTHER)).toMatchObject({ isActive: false, tokenVersion: 1 });
        await make().disable(actor, { sub: OTHER });
        expect(users.docs.find(u => u._id === OTHER).tokenVersion).toBe(1);
        await settle();
        expect(audits.find(a => a.event === 'backoffice.admin.disable')).toMatchObject({ result: 'ok', meta: { targetSub: OTHER, reason: 'isten ayrildi kisi' } });
    });
    it('SON aktif yonetici kapatilamaz (409 LAST_PLATFORM_ADMIN): aktorun kendisi artik aktif degilse', async () => {
        users.docs.find(u => u._id === ME).isActive = false;
        await expect(make().disable(actor, { sub: OTHER })).rejects.toMatchObject({ statusCode: 409, code: 'LAST_PLATFORM_ADMIN' });
        expect(users.docs.find(u => u._id === OTHER).isActive).toBe(true);
    });
    it('yarisma: on kontrol gecse de sonrasi sayim sifirsa kapatma GERI ALINIR', async () => {
        const original = users.countDocuments.bind(users);
        let calls = 0;
        users.countDocuments = async (f: any) => { calls++; return calls === 1 ? 1 : original(f); };
        users.docs.find(u => u._id === ME).isActive = false; // es zamanli baska kapatma
        await expect(make().disable(actor, { sub: OTHER })).rejects.toMatchObject({ code: 'LAST_PLATFORM_ADMIN' });
        expect(users.docs.find(u => u._id === OTHER).isActive).toBe(true);
    });
    it('bekleyen davet "kapatilinca" taslak silinir, token kullanilmis sayilir (revoked)', async () => {
        await make().invite(actor, { email: 'yeni@example.test' });
        const id = users.docs.find(u => u.email === 'yeni@example.test')._id;
        await expect(make().disable(actor, { sub: id })).resolves.toEqual({ sub: id, status: 'revoked' });
        expect(users.docs.find(u => u._id === id)).toBeUndefined();
        expect(tokens.docs.every(t => t.usedAt)).toBe(true);
    });
    it('enable: kapali yonetici acilir (kilit temizlenir); aktif idempotent; bekleyen davet 409', async () => {
        users.docs.find(u => u._id === OTHER).isActive = false;
        users.docs.find(u => u._id === OTHER).lockUntil = new Date();
        await expect(make().enable(actor, { sub: OTHER })).resolves.toEqual({ sub: OTHER, status: 'active' });
        expect(users.docs.find(u => u._id === OTHER)).toMatchObject({ isActive: true, tokenVersion: 1 });
        expect(users.docs.find(u => u._id === OTHER).lockUntil).toBeUndefined();
        await expect(make().enable(actor, { sub: OTHER })).resolves.toEqual({ sub: OTHER, status: 'active' });
        await make().invite(actor, { email: 'yeni@example.test' });
        const id = users.docs.find(u => u.email === 'yeni@example.test')._id;
        await expect(make().enable(actor, { sub: id })).rejects.toMatchObject({ statusCode: 409 });
        expect(users.docs.find(u => u._id === id).isActive).toBe(false);
    });
});

describe('resetMfa', () => {
    it('hedefin AdminMfa kaydi silinir + oturumlari kapanir; baskasinin kaydina dokunmaz; audit', async () => {
        await mfa.setPending(OTHER, 'enc:v1:x'); await mfa.activate(OTHER, 'enc:v1:x', 1, ['h']);
        await mfa.setPending(ME, 'enc:v1:y'); await mfa.activate(ME, 'enc:v1:y', 1, ['h']);
        await expect(make().resetMfa(actor, { sub: OTHER, reason: 'cihaz kayboldu' })).resolves.toEqual({ sub: OTHER, mfaEnabled: false });
        expect(await mfa.get(OTHER)).toBeNull();
        expect(await mfa.get(ME)).not.toBeNull();
        expect(users.docs.find(u => u._id === OTHER).tokenVersion).toBe(1);
        await settle();
        expect(audits.find(a => a.event === 'backoffice.admin.mfa_reset')).toMatchObject({ result: 'ok', sub: ME, meta: { targetSub: OTHER, reason: 'cihaz kayboldu' } });
    });
    it('kendi MFA kaydini sifirlayamaz; yonetici olmayan 404', async () => {
        await mfa.setPending(ME, 'enc:v1:y'); await mfa.activate(ME, 'enc:v1:y', 1, ['h']);
        await expect(make().resetMfa(actor, { sub: ME })).rejects.toMatchObject({ statusCode: 403, code: 'ADMIN_SELF_ACTION' });
        expect(await mfa.get(ME)).not.toBeNull();
        await expect(make().resetMfa(actor, { sub: THIRD })).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('POST /admin-api/BackofficeAuthService/acceptInvite (kimliksiz uc)', () => {
    let server: Server; let url: string; let saved: string | undefined;
    beforeEach(async () => {
        saved = process.env.ADMIN_CORS_ORIGINS;
        process.env.ADMIN_CORS_ORIGINS = 'https://admin.example.test';
        const h = makeDeps({ clock });
        (h.deps as any).getApplicationDB = async () => ({ getUserModel: () => users, getClientModel: () => ({}), getAccountTokenModel: () => tokens });
        const app = express(); app.use(express.json()); app.use('/admin-api', createAdminRouter(h.deps));
        await new Promise<void>(r => { server = app.listen(0, '127.0.0.1', () => r()); });
        url = `http://127.0.0.1:${(server.address() as any).port}/admin-api/BackofficeAuthService/acceptInvite`;
    });
    afterEach(async () => {
        await new Promise(r => server.close(() => r(null)));
        if (saved === undefined) delete process.env.ADMIN_CORS_ORIGINS; else process.env.ADMIN_CORS_ORIGINS = saved;
    });
    const post = (body: any, origin: string | null = 'https://admin.example.test') => fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
    });
    it('gecerli davet: 200, oturum cerezi BASILMAZ; ikinci kullanim 400', async () => {
        await make().invite(actor, { email: 'yeni@example.test' });
        const token = tokenFromMail(0);
        const ok = await post({ token, name: 'Ali', surname: 'Veli', password: STRONG });
        expect(ok.status).toBe(200);
        expect(ok.headers.get('set-cookie')).toBeNull();
        const again = await post({ token, name: 'Ali', surname: 'Veli', password: STRONG });
        expect(again.status).toBe(400);
        expect((await again.json()).code).toBe('ADMIN_INVITE_INVALID');
    });
    it('Origin yok/yabanci ise 403 (CSRF), token yoksa 400', async () => {
        expect((await post({}, null)).status).toBe(403);
        expect((await post({}, 'https://evil.example.test')).status).toBe(403);
        expect((await post({})).status).toBe(400);
    });
});
