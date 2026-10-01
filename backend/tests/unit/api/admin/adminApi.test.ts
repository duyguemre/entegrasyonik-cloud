// ADR-0026 Asama 2-BE: `/admin-api` uctan uca (gercek express + gercek router; DB/Redis/ag YOK, bellek-ici sahteler).
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';

jest.mock('../../../../src/api/RunOperation', () => ({ __esModule: true, default: jest.fn(async () => ({ ok: true })) }));

import run from '../../../../src/api/RunOperation';
import { createAdminRouter } from '../../../../src/api/admin/AdminApiManager';
import { ADMIN_COOKIE_NAME, signAdminSession, verifyAdminToken } from '../../../../src/api/admin/adminSession';
import { totpAt } from '../../../../src/api/admin/totp';
import Security from '../../../../src/api/Security';
import { AuditLogger } from '../../../../src/services/audit/AuditLogger';
import { Clock, makeDeps, makeUser } from '../../../helpers/adminFakes';
import { signedToken } from '../../../characterization/auth/_helpers';

const ADMIN_ORIGIN = 'https://admin.example.test';
const APP_ORIGIN = 'https://app.example.test';
const runMock = run as unknown as jest.Mock<any>;

const ENV_KEYS = ['ADMIN_CORS_ORIGINS', 'ADMIN_IP_ALLOWLIST', 'CORS_ORIGINS', 'PUBLIC_APP_URL', 'LOGIN_RATE_LIMIT_MAX', 'NODE_ENV'];
let savedEnv: Record<string, string | undefined> = {};
let server: Server;
let base: string;
let h: ReturnType<typeof makeDeps>;
let audits: Array<Record<string, any>>;

async function boot(deps = h.deps) {
    const app = express();
    app.use(express.json());
    app.use('/admin-api', createAdminRouter(deps));
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as any).port}/admin-api`;
}

class Client {
    cookie?: string;
    lastSetCookie?: string;
    constructor(public origin: string | null = ADMIN_ORIGIN) { }
    async call(method: 'GET' | 'POST' | 'OPTIONS', path: string, body?: any, extra: Record<string, string> = {}) {
        const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
        if (this.origin && headers.origin === undefined) headers.origin = this.origin;
        if (this.cookie) headers.cookie = `${ADMIN_COOKIE_NAME}=${this.cookie}`;
        const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        const sc = (res.headers as any).getSetCookie?.() as string[] | undefined;
        const admin = sc?.find(c => c.startsWith(ADMIN_COOKIE_NAME + '='));
        if (admin) {
            this.lastSetCookie = admin;
            const value = admin.split(';')[0].slice(ADMIN_COOKIE_NAME.length + 1);
            this.cookie = value === 'Signout' ? undefined : value;
        }
        const text = await res.text();
        let json: any; try { json = JSON.parse(text); } catch { json = text; }
        return { status: res.status, body: json, headers: res.headers };
    }
    post(path: string, body?: any, extra?: Record<string, string>) { return this.call('POST', path, body ?? {}, extra); }
}

const secretOf = (uri: string) => new URL(uri).searchParams.get('secret') as string;

/** Parola -> TOTP kaydi -> tam oturum. */
async function enrolledSession(c: Client) {
    expect((await c.post('/BackofficeAuthService/login', { email: 'admin@example.test', password: 'S3cret-Pass!' })).body).toEqual({ mfaRequired: false, enrollRequired: true });
    const { body: { otpauthUri } } = await c.post('/BackofficeAuthService/enrollTotp');
    const secret = secretOf(otpauthUri);
    const res = await c.post('/BackofficeAuthService/confirmTotp', { code: totpAt(secret, h.clock.now()) });
    expect(res.status).toBe(200);
    return { secret, recoveryCodes: res.body.recoveryCodes as string[] };
}

/** Sonraki 30 sn adimina gecip yeni kodu uretir (son kullanilan adim tekrar kabul edilmez). */
const nextCode = (secret: string) => { h.clock.advance(30_000); return totpAt(secret, h.clock.now()); };

beforeAll(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
});
beforeEach(async () => {
    process.env.ADMIN_CORS_ORIGINS = ADMIN_ORIGIN;
    process.env.CORS_ORIGINS = APP_ORIGIN;
    process.env.PUBLIC_APP_URL = APP_ORIGIN;
    process.env.LOGIN_RATE_LIMIT_MAX = '1000';
    delete process.env.ADMIN_IP_ALLOWLIST;
    h = makeDeps();
    runMock.mockClear();
    audits = [];
    AuditLogger.setSink(async r => { audits.push(r); });
    await boot();
});
afterEach(async () => {
    AuditLogger.setSink(undefined);
    await new Promise<void>(resolve => server.close(() => resolve()));
});
afterAll(() => {
    for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
});

describe('giris akisi ve cerez ozellikleri', () => {
    it('login -> enroll -> confirm -> tam oturum; cerez HttpOnly + Secure + SameSite=Strict + Path=/admin-api + Domain YOK', async () => {
        const c = new Client();
        await enrolledSession(c);
        const sc = c.lastSetCookie as string;
        expect(sc).toMatch(/HttpOnly/i);
        expect(sc).toMatch(/Secure/i);
        expect(sc).toMatch(/SameSite=Strict/i);
        expect(sc).toMatch(/Path=\/admin-api/i);
        expect(sc).not.toMatch(/Domain=/i);
        const p = verifyAdminToken(c.cookie as string, h.clock.now());
        expect(p).toMatchObject({ ga: true, mfa: true, stg: 'full' });
        expect(jwt.decode(c.cookie as string)).toMatchObject({ aud: 'backoffice' });
    });

    it('kayit tamamlaninca TOTP sirri Users belgesine DEGIL AdminMfa kaydina, alan sifrelemesiyle (enc:v1) yazilir; 10 kurtarma ozeti (duz kod yok)', async () => {
        const c = new Client();
        const { recoveryCodes } = await enrolledSession(c);
        const rec = (await h.mfaStore.get('a1b2c3d4e5f6a7b8c9d0e1f2'))!;
        expect(rec.secret).toMatch(/^enc:v1:/);
        expect(rec.pendingSecret).toBeUndefined();
        expect(rec.recoveryHashes).toHaveLength(10);
        expect(recoveryCodes).toHaveLength(10);
        expect(JSON.stringify(rec)).not.toContain(recoveryCodes[0]);
        expect(h.users.users[0].mfa).toBeUndefined();
    });

    it('sonraki giris: parola -> yarim oturum (mfaRequired) -> verifyTotp -> tam oturum; yarim oturum RPC cagiramaz (403 MFA_REQUIRED)', async () => {
        const c = new Client();
        const { secret } = await enrolledSession(c);
        await c.post('/BackofficeAuthService/logout');
        expect(c.cookie).toBeUndefined();

        const c2 = new Client();
        expect((await c2.post('/BackofficeAuthService/login', { email: 'admin@example.test', password: 'S3cret-Pass!' })).body).toEqual({ mfaRequired: true, enrollRequired: false });
        expect(verifyAdminToken(c2.cookie as string, h.clock.now())).toMatchObject({ stg: 'pwd', mfa: false });
        const blocked = await c2.post('/AdminService/getGlobalMetrics');
        expect(blocked.status).toBe(403);
        expect(blocked.body.code).toBe('MFA_REQUIRED');
        expect(runMock).not.toHaveBeenCalled();
        const ok = await c2.post('/BackofficeAuthService/verifyTotp', { code: nextCode(secret) });
        expect(ok.status).toBe(200);
        expect((await c2.post('/AdminService/getGlobalMetrics')).status).toBe(200);
    });

    it('yarim oturum 5 dk sonra gecersiz', async () => {
        const c = new Client();
        await c.post('/BackofficeAuthService/login', { email: 'admin@example.test', password: 'S3cret-Pass!' });
        h.clock.advance(5 * 60_000 + 1000);
        expect((await c.post('/BackofficeAuthService/enrollTotp')).status).toBe(401);
    });

    it('yanlis parola / olmayan kullanici AYNI genel hata (numaralandirma yok)', async () => {
        const a = await new Client().post('/BackofficeAuthService/login', { email: 'admin@example.test', password: 'yanlis' });
        const b = await new Client().post('/BackofficeAuthService/login', { email: 'yok@example.test', password: 'yanlis' });
        expect(a.status).toBe(401);
        expect(b.status).toBe(401);
        expect(a.body.error).toBe(b.body.error);
    });
});

describe('platform katmani: tenant kullanicisi /admin-api\'ye erisemez', () => {
    it('tenant kullanicisi dogru parolayla bile giremez (genel 401, oturum cerezi basilmaz)', async () => {
        h = makeDeps({ users: [makeUser({ _id: 'tenantuser000000000000001', email: 'owner@example.test', isGlobalAdmin: false, owner: true, order: 5 })] });
        await new Promise<void>(r => server.close(() => r()));
        await boot(h.deps);
        const c = new Client();
        const res = await c.post('/BackofficeAuthService/login', { email: 'owner@example.test', password: 'S3cret-Pass!' });
        expect(res.status).toBe(401);
        expect(c.cookie).toBeUndefined();
    });

    it('musteri JWT_TOKEN (aud:web) hicbir uc icin kabul edilmez: cerez adi da farkli, EK_ADMIN icine konsa aud uyusmaz', async () => {
        const customer = signedToken({ ga: true, tid: undefined, sub: 'a1b2c3d4e5f6a7b8c9d0e1f2' });
        // 1) yalniz musteri cerezi (JWT_TOKEN) gonderilir: /admin-api onu HIC okumaz
        const r1 = await fetch(base + '/AdminService/getGlobalMetrics', { method: 'POST', headers: { 'content-type': 'application/json', origin: ADMIN_ORIGIN, cookie: `JWT_TOKEN=${customer}` }, body: '{}' });
        expect(r1.status).toBe(401);
        // 2) musteri token'i EK_ADMIN adiyla sunulur: aud takasi reddedilir
        const c = new Client();
        c.cookie = customer;
        expect((await c.post('/AdminService/getGlobalMetrics')).status).toBe(401);
        expect(runMock).not.toHaveBeenCalled();
    });

    it('admin token\'i musteri dogrulayicisinda (/api) gecersiz: aud:backoffice != web', () => {
        const t = signAdminSession({ sub: 'a1b2c3d4e5f6a7b8c9d0e1f2', tv: 0, stg: 'full' });
        expect(() => Security.getInstance().verifyToken(t)).toThrow('Token not verified');
    });

    it('token gecerli olsa da DB\'de isGlobalAdmin artik false ise reddedilir (claim tek basina yetmez)', async () => {
        const c = new Client();
        await enrolledSession(c);
        h.users.users[0].isGlobalAdmin = false;
        expect((await c.post('/AdminService/getGlobalMetrics')).status).toBe(401);
    });

    it('tokenVersion artinca (baska yerden oturum kapatma) eski oturum dusar', async () => {
        const c = new Client();
        await enrolledSession(c);
        h.users.users[0].tokenVersion = 1;
        expect((await c.post('/AdminService/getGlobalMetrics')).status).toBe(401);
    });
});

describe('TOTP: yeniden oynatma ve kurtarma kodu', () => {
    it('ayni kod (ayni adim) ikinci kez KABUL EDILMEZ; +-1 adim kabul', async () => {
        const c = new Client();
        const { secret } = await enrolledSession(c);
        const c2 = new Client();
        await c2.post('/BackofficeAuthService/login', { email: 'admin@example.test', password: 'S3cret-Pass!' });
        // kayitta kullanilan adim tekrar denenir -> red (yeniden oynatma)
        const replay = await c2.post('/BackofficeAuthService/verifyTotp', { code: totpAt(secret, h.clock.now()) });
        expect(replay.status).toBe(401);
        // bir sonraki adim gecerli (saat +-1 adim toleransi: 30 sn ileri kod)
        const ok = await c2.post('/BackofficeAuthService/verifyTotp', { code: totpAt(secret, h.clock.now() + 30_000) });
        expect(ok.status).toBe(200);
        // ayni kodun tekrari yine red
        const c3 = new Client();
        await c3.post('/BackofficeAuthService/login', { email: 'admin@example.test', password: 'S3cret-Pass!' });
        expect((await c3.post('/BackofficeAuthService/verifyTotp', { code: totpAt(secret, h.clock.now() + 30_000) })).status).toBe(401);
    });

    it('5 hatali kod -> hesap kilitlenir (429); kilitteyken dogru kod de kabul edilmez', async () => {
        const c = new Client();
        const { secret } = await enrolledSession(c);
        const c2 = new Client();
        await c2.post('/BackofficeAuthService/login', { email: 'admin@example.test', password: 'S3cret-Pass!' });
        for (let i = 0; i < 5; i++) expect((await c2.post('/BackofficeAuthService/verifyTotp', { code: '000000' })).status).toBe(401);
        expect((await c2.post('/BackofficeAuthService/verifyTotp', { code: nextCode(secret) })).status).toBe(429);
    });

    it('kurtarma kodu TEK KULLANIMLIK: ilk kullanim tam oturum (9 kaldi), ikinci kullanim red', async () => {
        const c = new Client();
        const { recoveryCodes } = await enrolledSession(c);
        const c2 = new Client();
        await c2.post('/BackofficeAuthService/login', { email: 'admin@example.test', password: 'S3cret-Pass!' });
        const ok = await c2.post('/BackofficeAuthService/verifyTotp', { recoveryCode: recoveryCodes[3].toLowerCase() });
        expect(ok.status).toBe(200);
        expect(ok.body.recoveryCodesRemaining).toBe(9);
        const c3 = new Client();
        await c3.post('/BackofficeAuthService/login', { email: 'admin@example.test', password: 'S3cret-Pass!' });
        expect((await c3.post('/BackofficeAuthService/verifyTotp', { recoveryCode: recoveryCodes[3] })).status).toBe(401);
        // baska bir kod hala calisir
        expect((await c3.post('/BackofficeAuthService/verifyTotp', { recoveryCode: recoveryCodes[4] })).status).toBe(200);
        expect(audits.some(a => a.event === 'backoffice.recovery_code_used')).toBe(true);
    });
});

describe('oturum suresi: 30 dk kayan, 8 sa mutlak', () => {
    it('her basarili istek token\'i yeniler; 30 dk bosta kalinca oturum duser', async () => {
        const c = new Client();
        await enrolledSession(c);
        const before = c.cookie;
        h.clock.advance(20 * 60_000);
        expect((await c.post('/AdminService/getGlobalMetrics')).status).toBe(200);
        expect(c.cookie).not.toBe(before);
        const t = jwt.decode(c.cookie as string) as any;
        expect(t.exp - Math.floor(h.clock.now() / 1000)).toBe(30 * 60);
        h.clock.advance(31 * 60_000); // 31 dk bosta
        expect((await c.post('/AdminService/getGlobalMetrics')).status).toBe(401);
    });

    it('surekli aktif olsa bile auth_time\'dan 8 saat sonra oturum biter; yenilenen token 8 sa sinirini asamaz', async () => {
        const c = new Client();
        await enrolledSession(c);
        const authTime = (jwt.decode(c.cookie as string) as any).auth_time as number;
        let last = 200;
        for (let i = 0; i < 40 && last === 200; i++) {
            h.clock.advance(25 * 60_000);
            const r = await c.post('/AdminService/getGlobalMetrics');
            last = r.status;
            if (last === 200) {
                const exp = (jwt.decode(c.cookie as string) as any).exp as number;
                expect(exp).toBeLessThanOrEqual(authTime + 8 * 3600);
            }
        }
        expect(last).toBe(401);
        expect(Math.floor(h.clock.now() / 1000) - authTime).toBeGreaterThan(8 * 3600 - 25 * 60);
    });

    it('logout yalniz o oturumu kapatir (tokenVersion ARTMAZ); ayni token tekrar kullanilamaz; logoutAllSessions tokenVersion++', async () => {
        const c = new Client();
        await enrolledSession(c);
        const stolen = c.cookie as string;
        await c.post('/BackofficeAuthService/logout');
        expect(h.users.users[0].tokenVersion).toBe(0);
        const replayClient = new Client();
        replayClient.cookie = stolen;
        expect((await replayClient.post('/AdminService/getGlobalMetrics')).status).toBe(401);

        const c2 = new Client();
        const { secret } = await enrolledSessionAgain(c2);
        await c2.post('/BackofficeAuthService/logoutAllSessions');
        expect(h.users.users[0].tokenVersion).toBe(1);
        expect(secret).toBeTruthy();
    });
});

/** Ikinci oturum: kayit zaten var -> parola + TOTP. */
async function enrolledSessionAgain(c: Client) {
    const rec = (await h.mfaStore.get('a1b2c3d4e5f6a7b8c9d0e1f2'))!;
    expect(rec.enabledAt).toBeTruthy();
    // sir sifreli; testte yeniden tuketmek icin yeni kayit: TOTP sirri sifirlayip yeniden kaydet
    await h.mfaStore.reset('a1b2c3d4e5f6a7b8c9d0e1f2');
    return enrolledSession(c);
}

describe('CORS + Origin (CSRF)', () => {
    it('yazma istegi: izinli admin origin -> gecer; musteri origin\'i, yabanci origin ve Origin/Referer YOK -> 403', async () => {
        const body = { email: 'admin@example.test', password: 'S3cret-Pass!' };
        expect((await new Client(ADMIN_ORIGIN).post('/BackofficeAuthService/login', body)).status).toBe(200);
        expect((await new Client(APP_ORIGIN).post('/BackofficeAuthService/login', body)).status).toBe(403);
        expect((await new Client('https://evil.example.test').post('/BackofficeAuthService/login', body)).status).toBe(403);
        expect((await new Client(null).post('/BackofficeAuthService/login', body)).status).toBe(403);
        // Referer yedegi: izinli admin origin'i Referer'da olabilir
        expect((await new Client(null).post('/BackofficeAuthService/login', body, { referer: ADMIN_ORIGIN + '/login' })).status).toBe(200);
        expect((await new Client(null).post('/BackofficeAuthService/login', body, { referer: 'https://evil.example.test/x' })).status).toBe(403);
    });

    it('preflight: yalniz ADMIN_CORS_ORIGINS icin Access-Control-Allow-Origin + credentials; musteri origin\'i icin baslik YOK', async () => {
        const ok = await new Client(null).call('OPTIONS', '/AdminService/getClients', undefined, { origin: ADMIN_ORIGIN, 'access-control-request-method': 'POST' });
        expect(ok.status).toBe(204);
        expect(ok.headers.get('access-control-allow-origin')).toBe(ADMIN_ORIGIN);
        expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
        const bad = await new Client(null).call('OPTIONS', '/AdminService/getClients', undefined, { origin: APP_ORIGIN, 'access-control-request-method': 'POST' });
        expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('ADMIN_CORS_ORIGINS bossa hicbir origin izinli degil', async () => {
        process.env.ADMIN_CORS_ORIGINS = '';
        expect((await new Client(ADMIN_ORIGIN).post('/BackofficeAuthService/login', { email: 'x@y.z', password: 'p' })).status).toBe(403);
    });
});

describe('IP allowlist (opsiyonel)', () => {
    it('bos = kapali; dolu ve eslesmezse 403; eslesirse gecer', async () => {
        const body = { email: 'admin@example.test', password: 'S3cret-Pass!' };
        expect((await new Client().post('/BackofficeAuthService/login', body)).status).toBe(200);
        process.env.ADMIN_IP_ALLOWLIST = '10.0.0.0/8,203.0.113.7';
        expect((await new Client().post('/BackofficeAuthService/login', body)).status).toBe(403);
        process.env.ADMIN_IP_ALLOWLIST = '10.0.0.0/8,127.0.0.1';
        expect((await new Client().post('/BackofficeAuthService/login', body)).status).toBe(200);
    });
});

describe('jenerik RPC: yalniz platformAdmin yetenekleri + step-up + gerekce', () => {
    it('platformAdmin okuma gecer; RunOperation surface:backoffice ile ve userContext/principal SUNUCUDA kurulur', async () => {
        const c = new Client();
        await enrolledSession(c);
        const res = await c.post('/AdminService/getGlobalMetrics', { userContext: { hacked: true }, principal: { ga: false } });
        expect(res.status).toBe(200);
        const [userContext, service, operation, , principal, meta] = runMock.mock.calls[0] as any[];
        expect([service, operation]).toEqual(['AdminService', 'getGlobalMetrics']);
        expect(principal).toMatchObject({ sub: 'a1b2c3d4e5f6a7b8c9d0e1f2', ga: true, imp: false, aud: 'backoffice' });
        expect(principal.tid).toBeUndefined();
        expect(userContext.password).toBeUndefined();
        expect(userContext.isGlobalAdmin).toBe(true);
        expect(meta).toMatchObject({ surface: 'backoffice' });
    });

    it('tenant kademeli / kayitsiz / selectStore / prototip uyeleri 403; servis calismaz', async () => {
        const c = new Client();
        await enrolledSession(c);
        for (const p of ['/ProductService/getProducts', '/SecurityService/selectStore', '/NoSuch/op', '/AdminService/__proto__', '/AdminService/constructor', '/AdminService/init']) {
            expect((await c.post(p)).status).toBe(403);
        }
        expect(runMock).not.toHaveBeenCalled();
    });

    it('destructive islem: reauth_at 5 dk\'yi asinca 401 REAUTH_REQUIRED; reauth (parola+yeni TOTP) sonrasi gerekce zorunlu; gerekce audit\'e gider', async () => {
        const c = new Client();
        const { secret } = await enrolledSession(c);
        // taze girisle reauth_at = simdi: gerekce yoksa 400
        const noReason = await c.post('/AdminService/deleteClient', { clientId: 5 });
        expect(noReason.status).toBe(400);
        expect(noReason.body.code).toBe('VALIDATION');

        h.clock.advance(5 * 60_000 + 5_000);
        const stale = await c.post('/AdminService/deleteClient', { clientId: 5, reason: 'TICKET-1234 musteri talebi' });
        expect(stale.status).toBe(401);
        expect(stale.body.code).toBe('REAUTH_REQUIRED');
        expect(runMock).not.toHaveBeenCalled();

        // yanlis parola -> reauth olmaz
        expect((await c.post('/BackofficeAuthService/reauth', { password: 'yanlis', code: nextCode(secret) })).status).toBe(401);
        const re = await c.post('/BackofficeAuthService/reauth', { password: 'S3cret-Pass!', code: nextCode(secret) });
        expect(re.status).toBe(200);
        expect(re.body.reauthValidUntil - re.body.reauthAt).toBe(300);

        expect((await c.post('/AdminService/deleteClient', { clientId: 5, reason: 'kisa' })).status).toBe(400);
        const ok = await c.post('/AdminService/deleteClient', { clientId: 5, reason: 'TICKET-1234 musteri talebi' });
        expect(ok.status).toBe(200);
        expect(runMock.mock.calls[0][5]).toMatchObject({ surface: 'backoffice', reason: 'TICKET-1234 musteri talebi' });
    });

    it('destructive OLMAYAN ama listedeki islem (IntegrationConfigService/setIntake, publish) de step-up ister; salt okuma istemez', async () => {
        const c = new Client();
        await enrolledSession(c);
        h.clock.advance(6 * 60_000);
        expect((await c.post('/AdminService/getSystemHealth')).status).toBe(200); // okuma: step-up yok (oturum kayan 30 dk icinde)
        for (const op of ['publish', 'rollback', 'setIntake']) {
            const r = await c.post(`/IntegrationConfigService/${op}`, { reason: 'TICKET-1 gerekce metni' });
            expect([op, r.status, r.body.code]).toEqual([op, 401, 'REAUTH_REQUIRED']);
        }
    });

    it('reauth suresi kayan yenilemeyle UZAMAZ (reauth_at korunur)', async () => {
        const c = new Client();
        await enrolledSession(c);
        for (let i = 0; i < 3; i++) { h.clock.advance(2 * 60_000); expect((await c.post('/AdminService/getSystemHealth')).status).toBe(200); }
        // 6 dk gecti; sliding yenileme reauth'u tazelemedi
        expect((await c.post('/AdminService/deleteClient', { clientId: 5, reason: 'TICKET-1 gerekce metni' })).body.code).toBe('REAUTH_REQUIRED');
    });
});

describe('impersonation bileti (startImpersonation)', () => {
    async function setup() {
        const c = new Client();
        const s = await enrolledSession(c);
        return { c, ...s };
    }

    it('step-up + gerekce ister; basarida fragment URL (#t=) ve 60 sn bilet; audit impersonation.start (tid, gerekce, actor platform, surface backoffice)', async () => {
        const { c } = await setup();
        expect((await c.post('/BackofficeTenantService/startImpersonation', { tid: 5 })).status).toBe(400); // gerekce yok
        const res = await c.post('/BackofficeTenantService/startImpersonation', { tid: 5, reason: 'TICKET-77 destek talebi' });
        expect(res.status).toBe(200);
        expect(res.body.expiresInSeconds).toBe(60);
        expect(res.body.url).toMatch(/^https:\/\/app\.example\.test\/impersonate#t=[A-Za-z0-9_-]{43}$/);
        expect(res.body.url).not.toContain('?');
        const start = audits.find(a => a.event === 'impersonation.start');
        expect(start).toMatchObject({ result: 'ok', tid: 5, onBehalfOf: 5, surface: 'backoffice', actorType: 'platform', sub: 'a1b2c3d4e5f6a7b8c9d0e1f2' });
        expect(start!.meta.reason).toBe('TICKET-77 destek talebi');
        // bilet Redis'te DUZ saklanmaz (yalniz ozet)
        const ticket = res.body.url.split('#t=')[1];
        expect([...(h.redis as any).kv.keys()].every((k: string) => !k.includes(ticket))).toBe(true);
    });

    it('step-up suresi dolmussa reddedilir; gecersiz/pasif tenant reddedilir', async () => {
        const { c } = await setup();
        expect((await c.post('/BackofficeTenantService/startImpersonation', { tid: 999, reason: 'TICKET-77 destek talebi' })).status).toBe(400);
        h.clients.clients.push({ order: 6, clientId: 'c6', title: 'X', status: 'SUSPENDED' });
        expect((await c.post('/BackofficeTenantService/startImpersonation', { tid: 6, reason: 'TICKET-77 destek talebi' })).status).toBe(400);
        h.clock.advance(6 * 60_000);
        const r = await c.post('/BackofficeTenantService/startImpersonation', { tid: 5, reason: 'TICKET-77 destek talebi' });
        expect(r.status).toBe(401);
        expect(r.body.code).toBe('REAUTH_REQUIRED');
    });

    it('[B3] askida / silme bekleyen / silinen tenant icin bilet URETILMEZ (yalniz ACTIVE)', async () => {
        const { c } = await setup();
        for (const [order, status] of [[7, 'SUSPENDED'], [8, 'DELETION_PENDING'], [9, 'PURGING'], [10, 'PURGED']] as const) {
            h.clients.clients.push({ order, clientId: 'c' + order, title: 'X', status });
            expect((await c.post('/BackofficeTenantService/startImpersonation', { tid: order, reason: 'TICKET-77 destek talebi' })).status).toBe(400);
        }
        expect([...(h.redis as any).kv.keys()].filter((k: string) => k.startsWith('imp:'))).toHaveLength(0);
    });

    it('[B3] bilet uretimi hiz sinirlidir (IP basina; asinca 429, bilet uretilmez)', async () => {
        await new Promise<void>(r => server.close(() => r()));
        process.env.LOGIN_RATE_LIMIT_MAX = '3';
        h = makeDeps();
        await boot(h.deps);
        const { c } = await setup();
        const codes: number[] = [];
        for (let i = 0; i < 5; i++) codes.push((await c.post('/BackofficeTenantService/startImpersonation', { tid: 5, reason: 'TICKET-77 destek talebi' })).status);
        expect(codes).toContain(429);
        expect(codes.filter(x => x === 200).length).toBeLessThan(5);
    });

    it('Redis yoksa bilet URETILMEZ (503 IMPERSONATION_UNAVAILABLE)', async () => {
        await new Promise<void>(r => server.close(() => r()));
        h = makeDeps({ redis: null });
        await boot(h.deps);
        const { c } = await setup();
        const res = await c.post('/BackofficeTenantService/startImpersonation', { tid: 5, reason: 'TICKET-77 destek talebi' });
        expect(res.status).toBe(503);
        expect(res.body.code).toBe('IMPERSONATION_UNAVAILABLE');
        expect(audits.find(a => a.event === 'impersonation.start')).toMatchObject({ result: 'error' });
    });
});

describe('audit alanlari (backoffice)', () => {
    it('login / mfa / reauth olaylari surface:backoffice + actorType:platform + sub tasir; hatali giris sub olmadan da yazilir', async () => {
        const c = new Client();
        await enrolledSession(c);
        await new Client().post('/BackofficeAuthService/login', { email: 'yok@example.test', password: 'x' });
        const ok = audits.find(a => a.event === 'backoffice.login' && a.result === 'ok');
        expect(ok).toMatchObject({ surface: 'backoffice', actorType: 'platform', sub: 'a1b2c3d4e5f6a7b8c9d0e1f2', ip: expect.any(String) });
        expect(audits.find(a => a.event === 'backoffice.mfa_enroll' && a.result === 'ok')).toBeTruthy();
        expect(audits.find(a => a.event === 'backoffice.login' && a.result === 'fail')).toMatchObject({ surface: 'backoffice' });
        // sir/parola/kod HICBIR audit kaydina girmez
        const dump = JSON.stringify(audits);
        expect(dump).not.toContain('S3cret-Pass!');
        expect(dump).not.toMatch(/secret=/);
    });
});

describe('me', () => {
    it('tam oturumda profil + oturum bilgisi + kurtarma kodu sayisi; parola ozeti/sir DONMEZ', async () => {
        const c = new Client();
        await enrolledSession(c);
        const res = await c.call('GET', '/BackofficeAuthService/me');
        expect(res.status).toBe(200);
        expect(res.body.user).toEqual({ sub: 'a1b2c3d4e5f6a7b8c9d0e1f2', email: 'admin@example.test', name: 'Ada', surname: 'Yonetici' });
        expect(res.body.mfa).toEqual({ enabled: true, recoveryCodesRemaining: 10 });
        expect(res.body.session.reauthFresh).toBe(true);
        expect(JSON.stringify(res.body)).not.toMatch(/password|secret|hash/i);
    });

    it('oturumsuz 401; bilinmeyen yol 404', async () => {
        expect((await new Client().call('GET', '/BackofficeAuthService/me')).status).toBe(401);
        expect((await new Client().call('GET', '/nope/nope/nope')).status).toBe(404);
    });
});
