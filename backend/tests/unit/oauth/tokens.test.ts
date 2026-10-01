/**
 * MCP-1: OAuth access token / PKCE / aud ayrimi (ADR-0010 madde 4/8, ADR-0035 Karar 2). DB/Redis/ag YOK.
 * Kanit: ayri sir + kid; ga/imp claim'i yok (uretimde yok, dogrulayicida REDDEDILIR); aud karismasi (web cerezi Bearer'da, aud:mcp token cerez hattinda gecmez);
 * 15 dk omur; onceki sir (kid oa0) ile rotasyon; MCP kapaliyken dogrulama reddi.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import Security from '../../../src/api/Security';
import {
    OAUTH_ACCESS_TTL_SECONDS, OAUTH_KID_CURRENT, OAUTH_KID_PREVIOUS, isMcpEnabled, pkceS256Matches, signOAuthAccessToken, verifyOAuthAccessToken,
} from '../../../src/platform/core/security/oauthTokens';
import { API, RESOURCE, pkce, setMcpEnv } from '../../helpers/oauthHarness';
import { resetConfigForTests } from '@config';

let restore: () => void;
beforeEach(() => { restore = setMcpEnv(); });
afterEach(() => restore());

const claims = { sub: 'u1', tid: 7, role: 'admin', tv: 3, cid: 'ec_x', scope: ['mcp:read' as const], fam: 'fam1', aud: RESOURCE };
const decode = (t: string) => jwt.decode(t, { complete: true }) as { header: { kid?: string; alg: string }; payload: Record<string, unknown> };

describe('PKCE S256', () => {
    it('dogru verifier eslesir; yanlis verifier / bos / plain (challenge=verifier) eslesmez', () => {
        const { verifier, challenge } = pkce();
        expect(pkceS256Matches(verifier, challenge)).toBe(true);
        expect(pkceS256Matches(verifier + 'x', challenge)).toBe(false);
        expect(pkceS256Matches('', challenge)).toBe(false);
        expect(pkceS256Matches(verifier, verifier)).toBe(false); // plain: challenge = verifier kabul edilmez
    });
});

describe('access token icerigi', () => {
    it('HS256 + kid oa1; ga/imp YOK; aud = kaynak URI; 15 dk omur; iss yapilandirmadan', () => {
        const t = signOAuthAccessToken(claims, Date.UTC(2026, 0, 1));
        const { header, payload } = decode(t);
        expect(header.alg).toBe('HS256');
        expect(header.kid).toBe(OAUTH_KID_CURRENT);
        expect(payload).toMatchObject({ sub: 'u1', tid: 7, tv: 3, cid: 'ec_x', scope: 'mcp:read', fam: 'fam1', aud: RESOURCE });
        expect('ga' in payload).toBe(false);
        expect('imp' in payload).toBe(false);
        expect((payload.exp as number) - (payload.iat as number)).toBe(OAUTH_ACCESS_TTL_SECONDS);
        expect(OAUTH_ACCESS_TTL_SECONDS).toBe(900);
    });

    it('dogrulama basarili; sure dolunca reddedilir (15 dk + 1 sn)', () => {
        const now = Date.now();
        const t = signOAuthAccessToken(claims, now);
        expect(verifyOAuthAccessToken(t, RESOURCE)).toMatchObject({ sub: 'u1', tid: 7, scope: ['mcp:read'], fam: 'fam1', cid: 'ec_x' });
        const old = signOAuthAccessToken(claims, now - (OAUTH_ACCESS_TTL_SECONDS + 1) * 1000);
        expect(() => verifyOAuthAccessToken(old, RESOURCE)).toThrow('Token not verified');
    });
});

describe('aud / sir ayrimi (passthrough yasagi)', () => {
    it('yanlis aud reddedilir', () => {
        const t = signOAuthAccessToken({ ...claims, aud: API + '/baska' });
        expect(() => verifyOAuthAccessToken(t, RESOURCE)).toThrow();
    });

    it('web cerez JWT aud:web Bearer dogrulayicida GECMEZ (farkli sir + kid yok)', () => {
        const web = Security.getInstance().signSession({ sub: 'u1', tid: 7, role: 'admin', ga: false, tv: 3 });
        expect(() => Security.getInstance().verifyBearer(web, RESOURCE)).toThrow('Token not verified');
    });

    it('aud:mcp OAuth token cerez hattinda (Security.verifyToken) GECMEZ', () => {
        const t = signOAuthAccessToken(claims);
        expect(() => Security.getInstance().verifyToken(t)).toThrow('Token not verified');
    });

    it('web sirriyla imzali ama aud:mcp token (sir karismasi) reddedilir', () => {
        const forged = jwt.sign({ sub: 'u1', tid: 7, tv: 3, cid: 'c', scope: 'mcp:read', fam: 'f', aud: RESOURCE, iss: process.env.JWT_ISSUER }, process.env.JWT_SECRET as string, { algorithm: 'HS256', keyid: OAUTH_KID_CURRENT, expiresIn: 60 });
        expect(() => verifyOAuthAccessToken(forged, RESOURCE)).toThrow();
    });

    it('ga veya imp claim tasiyan OAuth token (dogru sirla imzali olsa da) reddedilir', () => {
        const secret = process.env.JWT_OAUTH_SECRET as string;
        const base = { sub: 'u1', tid: 7, tv: 3, cid: 'c', scope: 'mcp:read', fam: 'f', aud: RESOURCE, iss: process.env.JWT_ISSUER };
        for (const extra of [{ ga: true }, { imp: true }, { ga: false }]) {
            const t = jwt.sign({ ...base, ...extra }, secret, { algorithm: 'HS256', keyid: OAUTH_KID_CURRENT, expiresIn: 60 });
            expect(() => verifyOAuthAccessToken(t, RESOURCE)).toThrow();
        }
    });

    it('alg:none ve bilinmeyen/eksik kid reddedilir', () => {
        const none = jwt.sign({ sub: 'u1', tid: 7, tv: 3, cid: 'c', scope: 'mcp:read', fam: 'f', aud: RESOURCE }, '', { algorithm: 'none' as never });
        expect(() => verifyOAuthAccessToken(none, RESOURCE)).toThrow();
        const secret = process.env.JWT_OAUTH_SECRET as string;
        const payload = { sub: 'u1', tid: 7, tv: 3, cid: 'c', scope: 'mcp:read', fam: 'f', aud: RESOURCE, iss: process.env.JWT_ISSUER };
        expect(() => verifyOAuthAccessToken(jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: 60 }), RESOURCE)).toThrow(); // kid yok
        expect(() => verifyOAuthAccessToken(jwt.sign(payload, secret, { algorithm: 'HS256', keyid: 'zzz', expiresIn: 60 }), RESOURCE)).toThrow();
    });

    it('bilinmeyen kapsamli token reddedilir; yalniz taninan kapsamlar okunur', () => {
        const secret = process.env.JWT_OAUTH_SECRET as string;
        const payload = { sub: 'u1', tid: 7, tv: 3, cid: 'c', fam: 'f', aud: RESOURCE, iss: process.env.JWT_ISSUER };
        const mk = (scope: string) => jwt.sign({ ...payload, scope }, secret, { algorithm: 'HS256', keyid: OAUTH_KID_CURRENT, expiresIn: 60 });
        expect(() => verifyOAuthAccessToken(mk('admin:all'), RESOURCE)).toThrow();
        expect(verifyOAuthAccessToken(mk('mcp:read admin:all'), RESOURCE).scope).toEqual(['mcp:read']);
    });
});

describe('sir rotasyonu ve kapali MCP', () => {
    it('onceki sirla (kid oa0) imzali token, JWT_OAUTH_SECRET_PREVIOUS tanimliyken dogrulanir; tanimsizken reddedilir', () => {
        const oldSecret = 'p'.repeat(48);
        const payload = { sub: 'u1', tid: 7, tv: 3, cid: 'c', scope: 'mcp:read', fam: 'f', aud: RESOURCE, iss: process.env.JWT_ISSUER };
        const t = jwt.sign(payload, oldSecret, { algorithm: 'HS256', keyid: OAUTH_KID_PREVIOUS, expiresIn: 60 });
        expect(() => verifyOAuthAccessToken(t, RESOURCE)).toThrow();
        process.env.JWT_OAUTH_SECRET_PREVIOUS = oldSecret;
        expect(verifyOAuthAccessToken(t, RESOURCE).sub).toBe('u1');
    });

    it('MCP_ENABLED=false veya sir yok/kisa: imza ve dogrulama kapali (MCP kapali)', () => {
        const t = signOAuthAccessToken(claims);
        process.env.MCP_ENABLED = 'false';
        expect(isMcpEnabled()).toBe(false);
        expect(() => verifyOAuthAccessToken(t, RESOURCE)).toThrow();
        expect(() => signOAuthAccessToken(claims)).toThrow();
        process.env.MCP_ENABLED = 'true';
        process.env.JWT_OAUTH_SECRET = 'short';
        expect(isMcpEnabled()).toBe(false);
        delete process.env.JWT_OAUTH_SECRET;
        expect(isMcpEnabled()).toBe(false);
        resetConfigForTests();
    });
});
