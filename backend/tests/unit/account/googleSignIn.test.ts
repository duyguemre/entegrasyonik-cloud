import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// SecurityService.googleSignIn + register(googleSignupToken) + ApiManager rotaları. DB/ağ YOK: sahte merkezi DB, sahte JWKS çekicisi.
// Gerçek tenant OLUŞTURULMAZ (CLAUDE.md kural 5): provisioning sahte DB'lere yazar.

const appDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
    DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => (global as any).__tenantDb },
}));
jest.mock('../../../src/api/index', () => ({
    __esModule: true,
    default: { SecurityService: require('../../../src/api/services/security-service').default },
}));

import SecurityService from '../../../src/api/services/security-service';
import { configureApis } from '../../../src/api/ApiManager';
import { GoogleJwksCache, setGoogleJwksCacheForTests, setGoogleTokenPosterForTests, signGoogleSignupToken } from '../../../src/operations/account/googleIdToken';
import { toProfileDto } from '../../../src/api/profileDto';
import { OPEN_OPERATIONS, getRequiredTier } from '../../../src/api/operationPolicy';
import { isOpenRoute } from '../../../src/api/authenticate';
import { makeCentralDb, makeTenantDb } from '../../characterization/tenant/_fakes';
import { makeFakeApp, makeReq, makeRes } from '../../characterization/auth/_helpers';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' } as any;
const nowSec = () => Math.floor(Date.now() / 1000);

function idToken(over: Record<string, any> = {}): string {
    return jwt.sign({
        iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-sub-1', email: 'Ali@Example.com', email_verified: true,
        name: 'Ali Veli', given_name: 'Ali', family_name: 'Veli', iat: nowSec() - 5, exp: nowSec() + 3600, ...over,
    }, privateKey as any, { algorithm: 'RS256', keyid: 'k1' });
}

let central: ReturnType<typeof makeCentralDb>;

function userDoc(fields: any) {
    const u: any = { isActive: true, failedLoginAttempts: 0, tokenVersion: 0, password: '$2b$10$fakehash', ...fields };
    return u;
}

beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = CLIENT_ID;
    setGoogleJwksCacheForTests(new GoogleJwksCache(async () => ({ status: 200, body: JSON.stringify({ keys: [JWK] }), cacheControl: 'max-age=3600' })));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    central = makeCentralDb({ clients: [{ order: 3, clientId: 3, status: 'ACTIVE', dbConfig: { dbname: 'x3' } }], plans: [{ code: 'starter', version: 1 }] });
    (global as any).__tenantDb = makeTenantDb().db;
    Object.assign(appDb, central.appDb);
});
afterEach(() => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    setGoogleJwksCacheForTests(undefined);
    setGoogleTokenPosterForTests(undefined);
    jest.restoreAllMocks();
});

async function svc(request: any, db: any = appDb) {
    const s: any = new SecurityService(undefined as any, request);
    s.applicationDB = db;
    await s.init?.();
    s.applicationDB = db;
    return s;
}

/** Sahte User modeli: findOne(email) + updateOne; mongoose doc benzeri toObject. */
function fakeUserModel(initial: any[]) {
    const rows = initial.map((r) => ({ ...r }));
    const wrap = (d: any) => (d ? Object.defineProperty({ ...d }, 'toObject', { value: () => ({ ...d }), enumerable: false }) : null);
    const model: any = {
        rows,
        findOne: jest.fn(async (f: any) => wrap(rows.find((r) => r.email === f.email))),
        updateOne: jest.fn(async (f: any, u: any) => {
            const d = rows.find((r) => r._id === f._id);
            if (!d) return { matchedCount: 0 };
            if (f.$or && d.googleSub) return { matchedCount: 0 };
            Object.assign(d, u.$set ?? {});
            for (const k of Object.keys(u.$unset ?? {})) delete d[k];
            return { matchedCount: 1 };
        }),
    };
    return model;
}
const dbWith = (model: any) => ({ getUserModel: () => model, getClientModel: () => ({ find: () => ({ lean: async () => [] }) }) });

describe('SecurityService.googleSignIn', () => {
    it('GOOGLE_OAUTH_CLIENT_ID yoksa GOOGLE_DISABLED (503)', async () => {
        delete process.env.GOOGLE_OAUTH_CLIENT_ID;
        const m = fakeUserModel([]);
        await expect((await svc({ credential: idToken() }, dbWith(m))).googleSignIn()).rejects.toMatchObject({ code: 'GOOGLE_DISABLED', statusCode: 503 });
    });

    it('geçersiz credential -> GOOGLE_TOKEN_INVALID; DB\'ye dokunulmaz', async () => {
        const m = fakeUserModel([]);
        await expect((await svc({ credential: 'x.y.z' }, dbWith(m))).googleSignIn()).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID', statusCode: 401 });
        await expect((await svc({}, dbWith(m))).googleSignIn()).rejects.toMatchObject({ statusCode: 400 });
        expect(m.findOne).not.toHaveBeenCalled();
    });

    it('e-posta doğrulanmamış -> GOOGLE_EMAIL_UNVERIFIED (403)', async () => {
        const m = fakeUserModel([]);
        await expect((await svc({ credential: idToken({ email_verified: false }) }, dbWith(m))).googleSignIn()).rejects.toMatchObject({ code: 'GOOGLE_EMAIL_UNVERIFIED', statusCode: 403 });
    });

    it('var olan kullanıcı: oturum (parola girişiyle aynı biçim + status ok), googleSub bağlanır, e-posta doğrulanmış olur; DTO googleSub içermez', async () => {
        const m = fakeUserModel([userDoc({ _id: 'u1', email: 'ali@example.com', name: 'Ali', surname: 'Veli', order: 3, roleCode: 'ROLE_OWNER' })]);
        const r: any = await (await svc({ credential: idToken() }, dbWith(m))).googleSignIn();
        expect(r.sessionClaims).toMatchObject({ sub: 'u1', tid: 3, role: 'ROLE_OWNER', ga: false, imp: false });
        expect(r.body).toMatchObject({ _id: 'u1', email: 'ali@example.com', status: 'ok' });
        expect(JSON.stringify(r)).not.toContain('g-sub-1');
        expect(JSON.stringify(r.body)).not.toContain('fakehash');
        expect(m.rows[0]).toMatchObject({ googleSub: 'g-sub-1', emailVerified: true });
        expect(Object.keys(toProfileDto({ ...m.rows[0] }))).not.toContain('googleSub');
    });

    it('googleSub zaten aynıysa tekrar bağlanmadan oturum açılır', async () => {
        const m = fakeUserModel([userDoc({ _id: 'u1', email: 'ali@example.com', order: 3, googleSub: 'g-sub-1', emailVerified: true })]);
        const r: any = await (await svc({ credential: idToken() }, dbWith(m))).googleSignIn();
        expect(r.body.status).toBe('ok');
        expect(m.updateOne.mock.calls.some((c: any[]) => c[1].$set?.googleSub)).toBe(false);
    });

    it('googleSub farklıysa GOOGLE_ACCOUNT_MISMATCH (409); oturum yok', async () => {
        const m = fakeUserModel([userDoc({ _id: 'u1', email: 'ali@example.com', order: 3, googleSub: 'baska-sub' })]);
        await expect((await svc({ credential: idToken() }, dbWith(m))).googleSignIn()).rejects.toMatchObject({ code: 'GOOGLE_ACCOUNT_MISMATCH', statusCode: 409 });
        expect(m.rows[0].googleSub).toBe('baska-sub');
    });

    it('pasif veya kilitli kullanıcı: parola girişindeki genel hata (401)', async () => {
        for (const extra of [{ isActive: false }, { lockUntil: new Date(Date.now() + 60000) }]) {
            const m = fakeUserModel([userDoc({ _id: 'u1', email: 'ali@example.com', order: 3, ...extra })]);
            await expect((await svc({ credential: idToken() }, dbWith(m))).googleSignIn()).rejects.toMatchObject({ message: 'E-posta veya parola hatalı', statusCode: 401 });
            expect(m.rows[0].googleSub).toBeUndefined();
        }
    });

    it('kullanıcı yok: oturum AÇILMAZ; signup_required + signupToken + profil (picture dahil)', async () => {
        const m = fakeUserModel([]);
        const r: any = await (await svc({ credential: idToken({ picture: 'https://lh3.example/p.png' }) }, dbWith(m))).googleSignIn();
        expect(r.sessionClaims).toBeUndefined();
        expect(r).toMatchObject({ status: 'signup_required', profile: { email: 'ali@example.com', name: 'Ali Veli', picture: 'https://lh3.example/p.png' } });
        expect(typeof r.signupToken).toBe('string');
        expect(m.updateOne).not.toHaveBeenCalled();
    });
});

describe('SecurityService.googleSignIn: code (popup authorization code) akisi', () => {
    const SECRET = 'test-secret-ZZZ-' + Math.random();
    const CODE = '4/0Atest-code-' + Math.random();
    const withUser = () => fakeUserModel([userDoc({ _id: 'u1', email: 'ali@example.com', name: 'Ali', surname: 'Veli', order: 3, roleCode: 'ROLE_OWNER' })]);

    it('code -> token degisimi: dogru form alanlari, id_token mevcut dogrulamadan gecer, oturum + status ok; access/refresh token donmez', async () => {
        process.env.GOOGLE_OAUTH_CLIENT_SECRET = SECRET;
        const poster = jest.fn(async (_u: string, _f: string) => ({ status: 200, body: JSON.stringify({ id_token: idToken(), access_token: 'AT-secret', refresh_token: 'RT-secret' }) }));
        setGoogleTokenPosterForTests(poster);
        const m = withUser();
        const r: any = await (await svc({ code: CODE }, dbWith(m))).googleSignIn();
        expect(poster).toHaveBeenCalledTimes(1);
        const [url, form] = poster.mock.calls[0];
        expect(url).toBe('https://oauth2.googleapis.com/token');
        const p = new URLSearchParams(form);
        expect(Object.fromEntries(p)).toEqual({ code: CODE, client_id: CLIENT_ID, client_secret: SECRET, redirect_uri: 'postmessage', grant_type: 'authorization_code' });
        expect(r.body.status).toBe('ok');
        expect(r.sessionClaims.sub).toBe('u1');
        expect(JSON.stringify(r)).not.toMatch(/AT-secret|RT-secret/);
        expect(m.rows[0].googleSub).toBe('g-sub-1');
    });

    it('code ile kullanici yoksa signup_required', async () => {
        process.env.GOOGLE_OAUTH_CLIENT_SECRET = SECRET;
        setGoogleTokenPosterForTests(async () => ({ status: 200, body: JSON.stringify({ id_token: idToken({ email: 'yeni@example.com', sub: 's9' }) }) }));
        const r: any = await (await svc({ code: CODE }, dbWith(fakeUserModel([])))).googleSignIn();
        expect(r).toMatchObject({ status: 'signup_required', profile: { email: 'yeni@example.com' } });
    });

    it('token ucu 400 (invalid_grant) / ag hatasi / id_token yok -> GOOGLE_TOKEN_INVALID; code ve secret hata ve loglara girmez', async () => {
        process.env.GOOGLE_OAUTH_CLIENT_SECRET = SECRET;
        const spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error')];
        for (const poster of [
            async () => ({ status: 400, body: JSON.stringify({ error: 'invalid_grant', error_description: 'Bad ' + CODE }) }),
            async () => { throw new Error('ECONNRESET ' + SECRET); },
            async () => ({ status: 200, body: JSON.stringify({ access_token: 'x' }) }),
            async () => ({ status: 200, body: 'html' }),
        ]) {
            setGoogleTokenPosterForTests(poster as any);
            const err: any = await (await svc({ code: CODE }, dbWith(fakeUserModel([])))).googleSignIn().catch((e: any) => e);
            expect(err).toMatchObject({ code: 'GOOGLE_TOKEN_INVALID', statusCode: 401 });
            const dump = JSON.stringify([err.message, err.details, err.code]);
            expect(dump).not.toContain(CODE);
            expect(dump).not.toContain(SECRET);
        }
        for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toMatch(new RegExp(CODE.slice(0, 12) + '|' + SECRET.slice(0, 16)));
    });

    it('token ucundan donen id_token bozuk/yanlis aud ise reddedilir', async () => {
        process.env.GOOGLE_OAUTH_CLIENT_SECRET = SECRET;
        setGoogleTokenPosterForTests(async () => ({ status: 200, body: JSON.stringify({ id_token: idToken({ aud: 'baska' }) }) }));
        await expect((await svc({ code: CODE }, dbWith(fakeUserModel([])))).googleSignIn()).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
    });

    it('secret yoksa code yolu GOOGLE_DISABLED (503) ve token ucuna istek atilmaz; credential yolu calisir', async () => {
        delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        const poster = jest.fn(async () => ({ status: 200, body: '{}' }));
        setGoogleTokenPosterForTests(poster);
        await expect((await svc({ code: CODE }, dbWith(fakeUserModel([])))).googleSignIn()).rejects.toMatchObject({ code: 'GOOGLE_DISABLED', statusCode: 503 });
        expect(poster).not.toHaveBeenCalled();
        const r: any = await (await svc({ credential: idToken() }, dbWith(withUser()))).googleSignIn();
        expect(r.body.status).toBe('ok');
    });

    it('ne credential ne code -> 400', async () => {
        process.env.GOOGLE_OAUTH_CLIENT_SECRET = SECRET;
        await expect((await svc({}, dbWith(fakeUserModel([])))).googleSignIn()).rejects.toMatchObject({ statusCode: 400 });
        await expect((await svc({ code: 123 }, dbWith(fakeUserModel([])))).googleSignIn()).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('ApiManager rotaları', () => {
    function setup(result: any) {
        const app = makeFakeApp();
        configureApis(app as any, '/api');
        return app;
    }
    it('authConfig: kimliksiz GET; istemci kimliği + önbellek başlığı; yoksa null', async () => {
        const app = setup(null);
        const h = app.routes['GET /api/SecurityService/authConfig'];
        expect(h).toBeDefined();
        const res: any = makeRes(); res.setHeader = (k: string, v: string) => { res.headers = { ...(res.headers ?? {}), [k]: v }; };
        await h(makeReq(), res);
        expect(res.body).toEqual({ googleClientId: CLIENT_ID });
        expect(res.headers['Cache-Control']).toMatch(/max-age/);
        delete process.env.GOOGLE_OAUTH_CLIENT_ID;
        const res2: any = makeRes(); res2.setHeader = () => undefined;
        await h(makeReq(), res2);
        expect(res2.body).toEqual({ googleClientId: null });
        expect(isOpenRoute('GET', 'SecurityService/authConfig')).toBe(true);
    });

    it('googleSignIn açık operasyon listesinde; jenerik rota reddeder; özel rota kayıtlı', () => {
        expect(OPEN_OPERATIONS).toContain('SecurityService/googleSignIn');
        expect(isOpenRoute('POST', 'SecurityService/googleSignIn')).toBe(true);
        const app = setup(null);
        expect(app.routes['POST /api/SecurityService/googleSignIn']).toBeDefined();
        expect(getRequiredTier('SecurityService', 'googleSignIn')).toBeUndefined(); // politika kaydında YOK: yalnız açık liste
    });

    it('googleSignIn rotası: mevcut kullanıcıda çerez basılır; yeni kullanıcıda çerez YOK ve signupToken döner; hata zarfında code', async () => {
        const model = fakeUserModel([userDoc({ _id: 'u1', email: 'ali@example.com', order: 3, roleCode: 'ROLE_OWNER' })]);
        Object.assign(appDb, dbWith(model));
        const app = setup(null);
        const h = app.routes['POST /api/SecurityService/googleSignIn'];

        const res1: any = makeRes();
        await h(makeReq({ body: { credential: idToken() }, method: 'POST' }), res1);
        expect(res1.statusCode).toBe(200);
        expect(res1.body.status).toBe('ok');
        expect(res1.cookies.map((c: any) => c.name)).toEqual(['JWT_TOKEN']);
        expect(res1.cookies[0].options.httpOnly).toBe(true);

        const res2: any = makeRes();
        await h(makeReq({ body: { credential: idToken({ email: 'yeni@example.com', sub: 's2' }) }, method: 'POST' }), res2);
        expect(res2.body.status).toBe('signup_required');
        expect(res2.cookies).toHaveLength(0);

        const res3: any = makeRes(); (res3 as any).setHeader = () => undefined; (res3 as any).getHeader = () => undefined; (res3 as any).type = () => res3;
        await h(makeReq({ body: { credential: 'bozuk' }, method: 'POST' }), res3);
        expect(res3.statusCode).toBe(401);
        expect(JSON.stringify(res3.body)).toContain('GOOGLE_TOKEN_INVALID');
        expect(res3.cookies).toHaveLength(0);
    });
});

describe('register + googleSignupToken (mock DB; gerçek tenant YOK)', () => {
    const idOf = { sub: 'g-sub-1', email: 'ali@example.com', name: 'Ali Veli', givenName: 'Ali', familyName: 'Veli' };
    const reg = async (body: any) => {
        const s: any = new SecurityService(undefined as any, body);
        s.applicationDB = central.appDb;
        return s.register();
    };

    it('belirteçle kayıt: e-posta belirteçten, parola gerekmez, googleSub kaydedilir, e-posta doğrulanmış; oturum + profil DTO', async () => {
        const r: any = await reg({ registerValues: { name: 'Ali', surname: 'Veli', storeName: 'Magaza' }, googleSignupToken: signGoogleSignupToken(idOf) });
        expect(r.sessionClaims).toMatchObject({ role: 'ROLE_OWNER', ga: false });
        expect(r.body.email).toBe('ali@example.com');
        expect(JSON.stringify(r.body)).not.toContain('g-sub-1');
        const stored = central.state.users.find((u: any) => u.email === 'ali@example.com');
        expect(stored).toMatchObject({ googleSub: 'g-sub-1', emailVerified: true, owner: true });
        expect(typeof stored.password).toBe('string'); // kullanılmaz rastgele parola özeti
        expect(stored.password).not.toBe('');
    });

    it('belirteç registerValues içinde de kabul edilir; ad/soyad verilmezse Google profilinden', async () => {
        const r: any = await reg({ registerValues: { googleSignupToken: signGoogleSignupToken(idOf) } });
        expect(r.body).toMatchObject({ email: 'ali@example.com', name: 'Ali', surname: 'Veli' });
    });

    it('gövdedeki e-posta belirteçtekinden farklıysa reddedilir; kullanıcı oluşmaz', async () => {
        await expect(reg({ registerValues: { name: 'A', surname: 'B', email: 'baska@example.com' }, googleSignupToken: signGoogleSignupToken(idOf) })).rejects.toMatchObject({ statusCode: 400 });
        expect(central.state.users).toHaveLength(0);
    });

    it('geçersiz / süresi dolmuş / oturum belirteci signupToken olarak reddedilir', async () => {
        await expect(reg({ registerValues: { name: 'A', surname: 'B' }, googleSignupToken: 'bozuk' })).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
        await expect(reg({ registerValues: { name: 'A', surname: 'B' }, googleSignupToken: signGoogleSignupToken(idOf, Date.now() - 16 * 60000) })).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
        expect(central.state.users).toHaveLength(0);
    });

    it('aynı belirteçle ikinci kayıt: mevcut "e-posta kullanımda" hatası (409)', async () => {
        const token = signGoogleSignupToken(idOf);
        await reg({ registerValues: { name: 'A', surname: 'B' }, googleSignupToken: token });
        await expect(reg({ registerValues: { name: 'A', surname: 'B' }, googleSignupToken: token })).rejects.toMatchObject({ statusCode: 409, message: 'Bu e-posta adresi ile kayıt oluşturulamıyor.' });
        expect(central.state.users).toHaveLength(1);
    });

    it('belirteçsiz kayıt: parola hâlâ zorunlu (mevcut davranış)', async () => {
        await expect(reg({ registerValues: { name: 'A', surname: 'B', email: 'x@y.z' } })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('parola da verilirse (isteğe bağlı) parola girişi de çalışsın diye o parola kullanılır', async () => {
        await reg({ registerValues: { name: 'A', surname: 'B', password: 'Sifre-12345' }, googleSignupToken: signGoogleSignupToken(idOf) });
        const stored = central.state.users.find((u: any) => u.email === 'ali@example.com');
        expect(await (await import('bcrypt')).compare('Sifre-12345', stored.password)).toBe(true);
    });
});
