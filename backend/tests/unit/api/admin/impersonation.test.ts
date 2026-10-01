// ADR-0026 Karar 4.9: impersonation bileti (Redis, tek kullanim, 60 sn), musteri tarafinda tuketim (redeemImpersonation) ve
// sabit omurlu oturum.
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

const appDb: any = {};
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => ({}) } }));
const redisHolder: { redis: any } = { redis: undefined };
jest.mock('@services/redis', () => ({ RedisService: { isReady: () => !!redisHolder.redis, getInstance: () => redisHolder.redis } }));

import { issueImpersonationTicket, redeemImpersonationTicket, hashTicket, IMPERSONATION_SESSION_SECONDS } from '../../../../src/api/admin/impersonationTicket';
import SecurityService from '../../../../src/api/rpc/handlers/security-service';
import Security, { SESSION_COOKIE_NAME } from '../../../../src/platform/core/security/Security';
import { AuditLogger } from '../../../../src/services/audit/AuditLogger';
import { Clock, FakeRedis, FakeUserModel, FakeClientModel, makeUser } from '../../../helpers/adminFakes';
import { makeRes } from '../../../characterization/auth/_helpers';

const P = { sub: 'a1b2c3d4e5f6a7b8c9d0e1f2', tid: 5, tv: 0, reason: 'TICKET-9 destek talebi' };

describe('bilet: uretim ve tuketim', () => {
    it('32 bayt rastgele; Redis anahtari yalniz SHA-256 ozeti; NX EX 60', async () => {
        const clock = new Clock();
        const redis = new FakeRedis(clock);
        const spy = jest.spyOn(redis, 'set');
        const t = await issueImpersonationTicket(redis, P, clock.now());
        expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(spy).toHaveBeenCalledWith('imp:' + hashTicket(t), expect.any(String), 'EX', 60, 'NX');
        expect([...redis.kv.keys()].join()).not.toContain(t);
        const t2 = await issueImpersonationTicket(redis, P, clock.now());
        expect(t2).not.toBe(t);
    });

    it('TEK KULLANIMLIK: ilk tuketim yuk doner, ikincisi undefined (es zamanli iki tuketimden yalniz biri kazanir)', async () => {
        const clock = new Clock();
        const redis = new FakeRedis(clock);
        const t = await issueImpersonationTicket(redis, P, clock.now());
        const [a, b] = await Promise.all([redeemImpersonationTicket(redis, t), redeemImpersonationTicket(redis, t)]);
        expect([a, b].filter(Boolean)).toHaveLength(1);
        expect((a ?? b)).toMatchObject({ sub: P.sub, tid: 5, tv: 0, reason: P.reason });
        expect(await redeemImpersonationTicket(redis, t)).toBeUndefined();
    });

    it('60 sn sonra suresi dolar', async () => {
        const clock = new Clock();
        const redis = new FakeRedis(clock);
        const t = await issueImpersonationTicket(redis, P, clock.now());
        clock.advance(61_000);
        expect(await redeemImpersonationTicket(redis, t)).toBeUndefined();
    });

    it('Redis yoksa: uretim 503 IMPERSONATION_UNAVAILABLE ile reddedilir, tuketim undefined', async () => {
        await expect(issueImpersonationTicket(undefined, P)).rejects.toMatchObject({ statusCode: 503, code: 'IMPERSONATION_UNAVAILABLE' });
        expect(await redeemImpersonationTicket(undefined, 'A'.repeat(43))).toBeUndefined();
    });

    it('bicimsiz/uydurma bilet Redis tarafina hic gitmez ya da bulunamaz', async () => {
        const clock = new Clock();
        const redis = new FakeRedis(clock);
        const spy = jest.spyOn(redis, 'getdel');
        for (const bad of [undefined, null, 42, '', 'kisa', 'A'.repeat(44), 'A'.repeat(42) + '!', { $ne: 1 }]) {
            expect(await redeemImpersonationTicket(redis, bad)).toBeUndefined();
        }
        expect(spy).not.toHaveBeenCalled();
        expect(await redeemImpersonationTicket(redis, 'A'.repeat(43))).toBeUndefined();
    });
});

describe('SecurityService.redeemImpersonation (musteri /api)', () => {
    let clock: Clock; let redis: FakeRedis; let users: FakeUserModel; let audits: any[];
    beforeEach(() => {
        clock = new Clock(Date.now());
        redis = new FakeRedis(clock);
        redisHolder.redis = redis;
        users = new FakeUserModel([makeUser({ roleCode: 'ROLE_ADMIN' })]);
        appDb.getUserModel = () => users;
        appDb.getClientModel = () => new FakeClientModel([{ order: 5, clientId: 'c5', title: 'Magaza', status: 'ACTIVE' }, { order: 6, clientId: 'c6', title: 'Pasif', status: 'SUSPENDED' }]);
        audits = [];
        AuditLogger.setSink(async r => { audits.push(r); });
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => { AuditLogger.setSink(undefined); redisHolder.redis = undefined; jest.restoreAllMocks(); });

    const svc = async (ticket: unknown) => { const s: any = new SecurityService(undefined as any, { ticket, requestMeta: { ip: '1.2.3.4' } }); await s.init(); return s; };

    it('gecerli bilet: {sub, tid, ga, imp} oturumu, 30 dk SABIT omur (fx; K41), profil DTO parola/tokenVersion icermez; audit impersonation.redeem', async () => {
        const t = await issueImpersonationTicket(redis, P, clock.now());
        const r = await (await svc(t)).redeemImpersonation();
        expect(r.sessionClaims).toMatchObject({ sub: P.sub, tid: 5, ga: true, imp: true, fixedTtlSeconds: IMPERSONATION_SESSION_SECONDS });
        expect(r.body.store).toEqual({ clientId: 'c5', title: 'Magaza' });
        expect(JSON.stringify(r.body)).not.toMatch(/password|tokenVersion/);
        expect(audits[0]).toMatchObject({ event: 'impersonation.redeem', result: 'ok', sub: P.sub, tid: 5, onBehalfOf: 5, actorType: 'impersonator', surface: 'app', imp: true });
        expect(audits[0].meta.reason).toBe(P.reason);

        const token = Security.getInstance().signSession(r.sessionClaims);
        const p = Security.getInstance().verifyToken(token);
        expect(p).toMatchObject({ imp: true, ga: true, tid: 5, fx: true });
        expect(p.exp - p.iat).toBe(1800);
        expect(IMPERSONATION_SESSION_SECONDS).toBe(1800);
    });

    it('cerez omru 30 dk ve token UZATILMAZ: sliding yenileme fx oturumda ASLA tetiklenmez (eski imp oturumu icin davranis ayni)', () => {
        const now = Math.floor(Date.now() / 1000);
        const fxNear = { sub: 'u', ga: true, tv: 0, imp: true, fx: true, auth_time: now, iat: now - 3300, exp: now + 300, iss: 'i', aud: 'web' } as any;
        expect(Security.shouldRefresh(fxNear)).toBe(false);
        expect(Security.shouldRefresh({ ...fxNear, fx: undefined, exp: now + 300 })).toBe(true); // fx olmayan imp: mevcut davranis
        const res = makeRes();
        Security.setSessionCookie(res as any, { sub: 'u', tid: 5, ga: true, imp: true, fixedTtlSeconds: 1800 });
        expect(res.cookies[0].name).toBe(SESSION_COOKIE_NAME);
        expect(res.cookies[0].options.maxAge).toBe(1800_000);
        const plain = makeRes();
        Security.setSessionCookie(plain as any, { sub: 'u', tid: 5, ga: true, imp: true });
        expect(plain.cookies[0].options.maxAge).toBe(28_800_000);
    });

    it('TEK KULLANIM: ikinci tuketim 401 (genel hata); uydurma/suresi dolmus bilet 401; her biri audit fail', async () => {
        const t = await issueImpersonationTicket(redis, P, clock.now());
        await (await svc(t)).redeemImpersonation();
        await expect((await svc(t)).redeemImpersonation()).rejects.toMatchObject({ statusCode: 401 });
        const t2 = await issueImpersonationTicket(redis, P, clock.now());
        clock.advance(61_000);
        await expect((await svc(t2)).redeemImpersonation()).rejects.toMatchObject({ statusCode: 401 });
        await expect((await svc('A'.repeat(43))).redeemImpersonation()).rejects.toMatchObject({ statusCode: 401 });
        expect(audits.filter(a => a.event === 'impersonation.redeem' && a.result === 'fail')).toHaveLength(3);
    });

    it('Redis hazir degilse tuketilemez (401)', async () => {
        const t = await issueImpersonationTicket(redis, P, clock.now());
        redisHolder.redis = undefined;
        await expect((await svc(t)).redeemImpersonation()).rejects.toMatchObject({ statusCode: 401 });
    });

    it('bilet sonrasi yonetici gecersizlesmisse (tokenVersion degisti / pasif / artik ga degil) ya da tenant ACTIVE degilse reddedilir', async () => {
        for (const mutate of [
            () => { users.users[0].tokenVersion = 1; },
            () => { users.users[0].isActive = false; },
            () => { users.users[0].isGlobalAdmin = false; },
        ]) {
            users.users[0] = makeUser({ roleCode: 'ROLE_ADMIN' });
            const t = await issueImpersonationTicket(redis, P, clock.now());
            mutate();
            await expect((await svc(t)).redeemImpersonation()).rejects.toMatchObject({ statusCode: 401 });
        }
        users.users[0] = makeUser();
        const t = await issueImpersonationTicket(redis, { ...P, tid: 6 }, clock.now());
        await expect((await svc(t)).redeemImpersonation()).rejects.toMatchObject({ statusCode: 401 });
    });

    it('token gercek JWT: aud web, imp true (mevcut selectStore imp akisiyla ayni claim seti + fx)', async () => {
        const t = await issueImpersonationTicket(redis, P, clock.now());
        const r = await (await svc(t)).redeemImpersonation();
        const decoded: any = jwt.decode(Security.getInstance().signSession(r.sessionClaims));
        expect(decoded).toMatchObject({ aud: 'web', imp: true, ga: true, tid: 5, fx: true });
    });
});

describe('SecurityService.login + ADMIN_API_ONLY (Asama 3 bayragi)', () => {
    const prev = process.env.ADMIN_API_ONLY;
    afterEach(() => { if (prev === undefined) delete process.env.ADMIN_API_ONLY; else process.env.ADMIN_API_ONLY = prev; jest.restoreAllMocks(); });

    const loginAs = async (user: any) => {
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const doc = { ...user, toObject: () => ({ ...user }) };
        appDb.getUserModel = () => ({ findOne: async () => doc, updateOne: async () => ({}) });
        appDb.getClientModel = () => ({ find: () => ({ lean: async () => [] }) });
        const s: any = new SecurityService(undefined as any, { username: 'admin@example.test', password: 'S3cret-Pass!' });
        await s.init();
        return s.login();
    };

    it('kapali (varsayilan): platform yoneticisi /api girisi eskisi gibi (mağaza secimi ister)', async () => {
        delete process.env.ADMIN_API_ONLY;
        const r: any = await loginAs(makeUser());
        expect(r.body.requireStoreSelection).toBe(true);
    });

    it('acik: platform yoneticisi /api girisi 403 ADMIN_API_ONLY; tenant kullanicisi etkilenmez', async () => {
        process.env.ADMIN_API_ONLY = 'true';
        await expect(loginAs(makeUser())).rejects.toMatchObject({ statusCode: 403, code: 'ADMIN_API_ONLY' });
        const r: any = await loginAs(makeUser({ isGlobalAdmin: false, order: 5, owner: true }));
        expect(r.sessionClaims).toMatchObject({ tid: 5, ga: false });
    });
});
