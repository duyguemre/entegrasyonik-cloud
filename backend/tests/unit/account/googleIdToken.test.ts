import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Google ID token doğrulaması + JWKS önbelleği + signupToken. AĞ YOK: JWKS çekicisi sahte, test anahtar çifti testte üretilir.
import {
    GoogleJwksCache, verifyGoogleIdToken, signGoogleSignupToken, verifyGoogleSignupToken, parseMaxAgeSeconds, GOOGLE_JWKS_URL,
} from '../../../src/operations/account/googleIdToken';
import Security from '../../../src/platform/core/security/Security';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const KID = 'kid-1';

function makeKey() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    return { privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' } as any };
}
const KEY = makeKey();
const OTHER = makeKey();

const nowSec = () => Math.floor(Date.now() / 1000);
function idToken(over: Record<string, any> = {}, opts: { key?: crypto.KeyObject; kid?: string; alg?: any } = {}): string {
    const now = nowSec();
    const payload: any = {
        iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1234567890', email: 'Ali@Example.com', email_verified: true,
        name: 'Ali Veli', given_name: 'Ali', family_name: 'Veli', picture: 'https://lh3.example/p.png', iat: now - 10, exp: now + 3600, ...over,
    };
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
    return jwt.sign(payload, (opts.key ?? KEY.privateKey) as any, { algorithm: opts.alg ?? 'RS256', keyid: opts.kid ?? KID });
}
const fetcherFor = (keys: any[], cacheControl = 'public, max-age=3600') =>
    jest.fn(async (_u: string) => ({ status: 200, body: JSON.stringify({ keys }), cacheControl }));
const jwksWith = (keys = [KEY.jwk]) => new GoogleJwksCache(fetcherFor(keys));
const verify = (token: unknown, jwks = jwksWith()) => verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks });
const rejects = async (p: Promise<any>, code: string, status: number) => {
    await expect(p).rejects.toMatchObject({ code, statusCode: status });
};

describe('verifyGoogleIdToken', () => {
    it('geçerli token: kimlik döner (e-posta küçük harfe normalize)', async () => {
        const id = await verify(idToken());
        expect(id).toEqual({ sub: '1234567890', email: 'ali@example.com', name: 'Ali Veli', givenName: 'Ali', familyName: 'Veli', picture: 'https://lh3.example/p.png' });
    });
    it('iss "accounts.google.com" (şemasız) da kabul edilir', async () => {
        await expect(verify(idToken({ iss: 'accounts.google.com' }))).resolves.toMatchObject({ sub: '1234567890' });
    });
    it('yanlış aud reddedilir', async () => { await rejects(verify(idToken({ aud: 'baska-istemci' })), 'GOOGLE_TOKEN_INVALID', 401); });
    it('yanlış iss reddedilir', async () => { await rejects(verify(idToken({ iss: 'https://evil.example' })), 'GOOGLE_TOKEN_INVALID', 401); });
    it('süresi dolmuş token reddedilir (tolerans 60 sn dışında)', async () => {
        await rejects(verify(idToken({ exp: nowSec() - 120, iat: nowSec() - 3700 })), 'GOOGLE_TOKEN_INVALID', 401);
    });
    it('küçük saat kayması tolere edilir (exp 30 sn önce, iat 30 sn sonra)', async () => {
        await expect(verify(idToken({ exp: nowSec() - 30, iat: nowSec() + 30 }))).resolves.toBeDefined();
    });
    it('gelecekte iat (> tolerans) reddedilir', async () => { await rejects(verify(idToken({ iat: nowSec() + 600, exp: nowSec() + 4000 })), 'GOOGLE_TOKEN_INVALID', 401); });
    it('email_verified=false -> GOOGLE_EMAIL_UNVERIFIED (403); string "true" ve eksik de reddedilir', async () => {
        await rejects(verify(idToken({ email_verified: false })), 'GOOGLE_EMAIL_UNVERIFIED', 403);
        await rejects(verify(idToken({ email_verified: 'true' })), 'GOOGLE_EMAIL_UNVERIFIED', 403);
        await rejects(verify(idToken({ email_verified: undefined })), 'GOOGLE_EMAIL_UNVERIFIED', 403);
    });
    it('bilinmeyen kid reddedilir', async () => { await rejects(verify(idToken({}, { kid: 'yok' })), 'GOOGLE_TOKEN_INVALID', 401); });
    it('başka anahtarla imzalı (imza bozuk) token reddedilir', async () => { await rejects(verify(idToken({}, { key: OTHER.privateKey })), 'GOOGLE_TOKEN_INVALID', 401); });
    it('imza baytları değiştirilmiş token reddedilir', async () => {
        const t = idToken();
        const [h, p, s] = t.split('.');
        const sig = Buffer.from(s, 'base64url'); sig[5] ^= 0xff;
        await rejects(verify(`${h}.${p}.${sig.toString('base64url')}`), 'GOOGLE_TOKEN_INVALID', 401);
    });
    it('payload değiştirilmiş (imza eski) token reddedilir', async () => {
        const [h, , s] = idToken().split('.');
        const evil = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'saldirgan', email: 'ceo@example.com', email_verified: true, iat: nowSec(), exp: nowSec() + 600 })).toString('base64url');
        await rejects(verify(`${h}.${evil}.${s}`), 'GOOGLE_TOKEN_INVALID', 401);
    });
    it('alg=none / HS256 (anahtar karışıklığı) reddedilir', async () => {
        const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
        const payload = { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 's', email: 'a@b.c', email_verified: true, iat: nowSec(), exp: nowSec() + 600 };
        await rejects(verify(`${b64({ alg: 'none', kid: KID })}.${b64(payload)}.`), 'GOOGLE_TOKEN_INVALID', 401);
        const hs = jwt.sign(payload, JSON.stringify(KEY.jwk), { algorithm: 'HS256', keyid: KID });
        await rejects(verify(hs), 'GOOGLE_TOKEN_INVALID', 401);
    });
    it.each([[undefined], [''], ['a.b'], [123], ['x'.repeat(9000)], ['a.b.c']])('biçim dışı girdi (%s) reddedilir', async (bad) => {
        await rejects(verify(bad), 'GOOGLE_TOKEN_INVALID', 401);
    });
    it('hata iletisi token içeriği taşımaz', async () => {
        const t = idToken({ aud: 'x' });
        const err: any = await verify(t).catch((e) => e);
        expect(err.message).not.toContain(t.slice(10, 40));
        expect(err.message).toBe('Google doğrulaması başarısız.');
    });
});

describe('GoogleJwksCache', () => {
    it('Cache-Control max-age süresince önbellekten verir (tek çekim)', async () => {
        let now = 1_000_000;
        const f = fetcherFor([KEY.jwk]);
        const c = new GoogleJwksCache(f, GOOGLE_JWKS_URL, () => now);
        await c.getKey(KID); now += 1000_000; await c.getKey(KID);
        expect(f).toHaveBeenCalledTimes(1);
        now += 3_700_000; await c.getKey(KID);
        expect(f).toHaveBeenCalledTimes(2);
    });
    it('bilinmeyen kid dakikada en çok bir yeniden çekim tetikler', async () => {
        let now = 1_000_000;
        const f = fetcherFor([KEY.jwk]);
        const c = new GoogleJwksCache(f, GOOGLE_JWKS_URL, () => now);
        await c.getKey('a'); await c.getKey('b'); await c.getKey('c');
        expect(f).toHaveBeenCalledTimes(1);
        now += 61_000; await c.getKey('d');
        expect(f).toHaveBeenCalledTimes(2);
    });
    it('çekim hatası / 200 dışı / bozuk gövde GOOGLE_TOKEN_INVALID', async () => {
        await rejects(new GoogleJwksCache(jest.fn(async () => { throw new Error('ağ'); })).getKey(KID), 'GOOGLE_TOKEN_INVALID', 401);
        await rejects(new GoogleJwksCache(jest.fn(async () => ({ status: 500, body: '' }))).getKey(KID), 'GOOGLE_TOKEN_INVALID', 401);
        await rejects(new GoogleJwksCache(jest.fn(async () => ({ status: 200, body: 'x' }))).getKey(KID), 'GOOGLE_TOKEN_INVALID', 401);
    });
    it('izinli olmayan URL için istek ATILMAZ (K7 izin listesi)', async () => {
        const f = fetcherFor([KEY.jwk]);
        await expect(new GoogleJwksCache(f, 'https://evil.example/certs').getKey(KID)).rejects.toMatchObject({ platformCode: 'OUTBOUND_HOST_NOT_ALLOWED' });
        expect(f).not.toHaveBeenCalled();
    });
    it('max-age sınırlanır / varsayılan', () => {
        expect(parseMaxAgeSeconds('public, max-age=10')).toBe(60);
        expect(parseMaxAgeSeconds('max-age=99999999')).toBe(86400);
        expect(parseMaxAgeSeconds(undefined)).toBe(3600);
    });
});

describe('signupToken (aud/typ google-signup)', () => {
    const id = { sub: 'g-sub', email: 'ali@example.com', name: 'Ali Veli', givenName: 'Ali', familyName: 'Veli' };

    it('imzala -> doğrula: email/name/sub döner', () => {
        expect(verifyGoogleSignupToken(signGoogleSignupToken(id))).toMatchObject({ email: 'ali@example.com', name: 'Ali Veli', sub: 'g-sub' });
    });
    it('oturum belirteci OLARAK reddedilir (Security.verifyToken)', () => {
        expect(() => Security.getInstance().verifyToken(signGoogleSignupToken(id))).toThrow('Token not verified');
    });
    it('oturum belirteci signupToken olarak reddedilir', () => {
        const session = Security.getInstance().signSession({ sub: 'u1', tid: 1, role: 'ROLE_OWNER' });
        expect(() => verifyGoogleSignupToken(session)).toThrow();
    });
    it('15 dk sonra süresi dolar; bozuk/başka sırlı belirteç reddedilir', () => {
        const t = signGoogleSignupToken(id, Date.now() - 16 * 60 * 1000);
        expect(() => verifyGoogleSignupToken(t)).toThrow();
        const forged = jwt.sign({ typ: 'google-signup', email: 'x@y.z', gsub: 's', aud: 'google-signup', iss: process.env.JWT_ISSUER }, 'baska-sir-' + Math.random(), { algorithm: 'HS256', expiresIn: 600 });
        expect(() => verifyGoogleSignupToken(forged)).toThrow();
        expect(() => verifyGoogleSignupToken(undefined)).toThrow();
    });
    it('Google ID token signupToken olarak kabul edilmez', () => {
        expect(() => verifyGoogleSignupToken(idToken())).toThrow();
    });
});
