/**
 * MCP-1: OAuth HTTP katmani (gercek Express + loopback; DB/Redis YOK). Metadata (RFC 8414/9728), DCR 429, authorize yonlendirme/hata sayfasi,
 * token/revoke bicimi ve basliklari, CORS, MCP kapaliyken 404, cerezli onay uclari, sizinti testi (belirtec/kod/ozet hicbir log/denetim satirinda yok).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import bodyParser from 'body-parser';
import express from 'express';
import type http from 'http';
import type { AddressInfo } from 'net';
import { configureOAuthConsentRoutes, configureOAuthPublicRoutes } from '../../../src/api/oauth/routes';
import { defaultOAuthAudit } from '../../../src/api/oauth/audit';
import { OAuthService } from '../../../src/api/oauth/service';
import { FamilyGate } from '../../../src/api/oauth/familyGate';
import { errorHandler, notFoundHandler } from '../../../src/api/http/errorEnvelope';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import { isMcpEnabled } from '../../../src/platform/core/security/oauthTokens';
import { captureLogs, type LogCapture } from '../../helpers/logCapture';
import { API, APP, REDIRECT, RESOURCE, buildHarness, pkce, setAccess, setMcpEnv, type Harness } from '../../helpers/oauthHarness';

let restore: () => void;
let h: Harness;
let server: http.Server;
let base: string;
let enabled = true;
let svc: OAuthService;

async function start(service: OAuthService) {
    const app = express();
    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
    configureOAuthPublicRoutes(app, { service: () => service, enabled: () => enabled && isMcpEnabled() });
    // `authenticate` yerine test middleware'i (kendi testlerinde kanitli): x-test-principal basligi
    app.use((req, res, next) => {
        const raw = req.headers['x-test-principal'];
        if (typeof raw === 'string') res.locals.principal = JSON.parse(raw);
        next();
    });
    configureOAuthConsentRoutes(app, '/api', { service: () => service, enabled: () => enabled && isMcpEnabled() });
    app.use(notFoundHandler);
    app.use(errorHandler);
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
    restore = setMcpEnv();
    enabled = true;
    h = buildHarness();
    h.identity.add('u1', [[1, 'Magaza Bir', 'owner']]);
    setAccess('readwrite');
    svc = h.service;
    await start(svc);
});
afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    restore();
    jest.restoreAllMocks();
    AuditLogger.setSink(undefined);
});

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
});
const principal = (p: object) => ({ 'x-test-principal': JSON.stringify(p) });

describe('metadata', () => {
    it('RFC 8414: S256, yalniz code+refresh_token, auth method none, register/authorize/token/revoke uclari yayimciya (PUBLIC_API_URL) bagli', async () => {
        const r = await fetch(base + '/.well-known/oauth-authorization-server');
        expect(r.status).toBe(200);
        expect(r.headers.get('access-control-allow-origin')).toBe('*');
        const m = await r.json() as Record<string, unknown>;
        expect(m).toMatchObject({
            issuer: API, authorization_endpoint: API + '/oauth/authorize', token_endpoint: API + '/oauth/token', registration_endpoint: API + '/oauth/register',
            revocation_endpoint: API + '/oauth/revoke', response_types_supported: ['code'], code_challenge_methods_supported: ['S256'],
            grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['mcp:read', 'mcp:write'],
        });
    });

    it('RFC 9728: /.well-known/oauth-protected-resource/mcp kaynak URI + yetkilendirme sunucusu + kapsamlar (koke de ayni yanit)', async () => {
        for (const p of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
            const m = await (await fetch(base + p)).json() as Record<string, unknown>;
            expect(m).toMatchObject({ resource: RESOURCE, authorization_servers: [API], scopes_supported: ['mcp:read', 'mcp:write'], bearer_methods_supported: ['header'] });
        }
    });

    it('MCP kapaliyken (MCP_ENABLED=false / sir yok) tum OAuth uclari 404 NOT_FOUND', async () => {
        enabled = false;
        for (const [m, p] of [['GET', '/.well-known/oauth-authorization-server'], ['GET', '/.well-known/oauth-protected-resource/mcp'], ['POST', '/oauth/register'],
            ['GET', '/oauth/authorize'], ['POST', '/oauth/token'], ['POST', '/oauth/revoke'], ['GET', '/api/oauth/requests/abc'], ['POST', '/api/oauth/requests/abc/decision']] as const) {
            const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'POST' ? '{}' : undefined });
            expect(r.status).toBe(404);
            expect(await r.json()).toMatchObject({ code: 'NOT_FOUND' });
        }
    });
});

describe('DCR /oauth/register', () => {
    it('201 + no-store + CORS; 11. kayit 429 (10/saat/IP) + Retry-After', async () => {
        const body = { redirect_uris: [REDIRECT], client_name: 'App' };
        const first = await post('/oauth/register', body);
        expect(first.status).toBe(201);
        expect(first.headers.get('cache-control')).toBe('no-store');
        expect(first.headers.get('access-control-allow-origin')).toBe('*');
        expect(await first.json()).toMatchObject({ token_endpoint_auth_method: 'none', scope: 'mcp:read' });
        for (let i = 2; i <= 10; i++) expect((await post('/oauth/register', body)).status).toBe(201);
        const eleventh = await post('/oauth/register', body);
        expect(eleventh.status).toBe(429);
        expect(eleventh.headers.get('retry-after')).toBeTruthy();
    });

    it('gecersiz metadata 400 invalid_client_metadata (RFC 7591 hata bicimi); sir istemi ve joker redirect reddedilir', async () => {
        for (const body of [{ redirect_uris: ['https://*.x.example.test/cb'] }, { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_basic' }, { redirect_uris: [REDIRECT], grant_types: ['client_credentials'] }]) {
            const r = await post('/oauth/register', body);
            expect(r.status).toBe(400);
            expect(await r.json()).toMatchObject({ error: 'invalid_client_metadata' });
        }
    });

    it('CORS preflight (OPTIONS) kimliksiz 204 ve izinli', async () => {
        const r = await fetch(base + '/oauth/token', { method: 'OPTIONS', headers: { Origin: 'https://claude.ai', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
        expect(r.status).toBe(204);
        expect(r.headers.get('access-control-allow-origin')).toBe('*');
        expect(r.headers.get('access-control-allow-credentials')).toBeNull(); // cerezsiz
    });
});

describe('authorize + token + revoke (HTTP)', () => {
    async function dcr() {
        return (await (await post('/oauth/register', { redirect_uris: [REDIRECT], client_name: 'App', scope: 'mcp:read mcp:write' })).json() as { client_id: string }).client_id;
    }
    const q = (o: Record<string, string>) => '/oauth/authorize?' + new URLSearchParams(o).toString();

    it('gecerli istek 302 -> APP_PUBLIC_URL/oauth/consent?req=; kayitsiz redirect/client 400 HTML hata sayfasi ve Location YOK (acik yonlendirici yok)', async () => {
        const clientId = await dcr();
        const { challenge } = pkce();
        const good = { response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 's', resource: RESOURCE };
        const ok = await fetch(base + q(good), { redirect: 'manual' });
        expect(ok.status).toBe(302);
        expect(ok.headers.get('location')).toMatch(new RegExp('^' + APP.replace(/\./g, '\\.') + '/oauth/consent\\?req=[A-Za-z0-9_-]{32}$'));
        for (const bad of [{ ...good, redirect_uri: 'https://evil.example.test/cb' }, { ...good, client_id: 'ec_yok' }, { ...good, redirect_uri: REDIRECT + '/' }]) {
            const r = await fetch(base + q(bad), { redirect: 'manual' });
            expect(r.status).toBe(400);
            expect(r.headers.get('location')).toBeNull();
            expect(r.headers.get('content-type')).toMatch(/text\/html/);
            expect(await r.text()).not.toContain('evil.example.test'); // girdi yansitilmaz
        }
        const noPkce = await fetch(base + q({ ...good, code_challenge_method: 'plain' }), { redirect: 'manual' });
        expect(noPkce.status).toBe(302);
        expect(noPkce.headers.get('location')).toContain(REDIRECT);
        expect(noPkce.headers.get('location')).toContain('error=invalid_request');
    });

    it('authorize IP basina 10/dk (giris limiti paylasilir): 11. istek 429', async () => {
        const responses: number[] = [];
        for (let i = 0; i < 11; i++) responses.push((await fetch(base + q({ client_id: 'x' }), { redirect: 'manual' })).status);
        expect(responses.slice(0, 10).every((s) => s === 400)).toBe(true);
        expect(responses[10]).toBe(429);
    });

    it('tam akis: authorize -> onay (cerezli uc) -> token (form) -> refresh -> revoke; basliklar no-store; hatalar RFC 6749 bicimi', async () => {
        const clientId = await dcr();
        const { verifier, challenge } = pkce();
        const au = await fetch(base + q({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', resource: RESOURCE, scope: 'mcp:read mcp:write' }), { redirect: 'manual' });
        const reqId = new URL(au.headers.get('location') as string).searchParams.get('req') as string;

        // oturumsuz: 401
        expect((await fetch(base + '/api/oauth/requests/' + reqId)).status).toBe(401);
        const view = await fetch(base + '/api/oauth/requests/' + reqId, { headers: principal({ sub: 'u1', tid: 1 }) });
        expect(view.status).toBe(200);
        expect(view.headers.get('cache-control')).toBe('no-store');
        expect(await view.json()).toMatchObject({ id: reqId, client: { name: 'App', known: false, redirectHost: 'client.example.test' }, tenants: [{ tid: 1, name: 'Magaza Bir', mcpAccess: 'readwrite', writeAvailable: true }] });

        const dec = await post('/api/oauth/requests/' + reqId + '/decision', { approve: true, tid: 1 }, principal({ sub: 'u1', tid: 1 }));
        expect(dec.status).toBe(200);
        const redirectTo = new URL((await dec.json() as { redirectTo: string }).redirectTo);
        expect(redirectTo.searchParams.get('state')).toBe('xyz');
        const code = redirectTo.searchParams.get('code') as string;

        const tok = await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: REDIRECT }));
        expect(tok.status).toBe(200);
        expect(tok.headers.get('cache-control')).toBe('no-store');
        expect(tok.headers.get('pragma')).toBe('no-cache');
        const t = await tok.json() as { access_token: string; refresh_token: string; token_type: string; expires_in: number; scope: string };
        expect(t).toMatchObject({ token_type: 'Bearer', expires_in: 900, scope: 'mcp:read mcp:write' });

        // kod ikinci kullanim: 400 invalid_grant
        const again = await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: REDIRECT }));
        expect(again.status).toBe(400);
        expect(await again.json()).toMatchObject({ error: 'invalid_grant' });
        // aile iptal oldu: refresh de reddedilir
        const dead = await post('/oauth/token', form({ grant_type: 'refresh_token', client_id: clientId, refresh_token: t.refresh_token }));
        expect(dead.status).toBe(400);
        expect(await dead.json()).toMatchObject({ error: 'invalid_grant' });
    });

    it('token: bilinmeyen client 401 invalid_client + WWW-Authenticate; eksik parametre 400; dizi/nesne parametre reddedilir; revoke her zaman 200', async () => {
        const r1 = await post('/oauth/token', form({ grant_type: 'refresh_token', client_id: 'ec_yok', refresh_token: 'x' }));
        expect(r1.status).toBe(401);
        expect(r1.headers.get('www-authenticate')).toMatch(/invalid_client/);
        expect(await r1.json()).toMatchObject({ error: 'invalid_client' });
        const clientId = await dcr();
        expect((await post('/oauth/token', form({ client_id: clientId }))).status).toBe(400);
        const nested = await post('/oauth/token', 'grant_type=refresh_token&client_id[$ne]=x&refresh_token=y');
        expect(nested.status).toBe(400);
        expect(await nested.json()).toMatchObject({ error: 'invalid_request' });
        const rv = await post('/oauth/revoke', form({ token: 'bilinmeyen' }));
        expect(rv.status).toBe(200);
        expect(await rv.text()).toBe('');
        expect((await post('/oauth/revoke', form({}))).status).toBe(200);
    });

    it('token IP basina 30/dk: 31. istek 429', async () => {
        const out: number[] = [];
        for (let i = 0; i < 31; i++) out.push((await post('/oauth/token', form({ grant_type: 'password', client_id: 'x' }))).status);
        expect(out.slice(0, 30).every((s) => s === 401)).toBe(true);
        expect(out[30]).toBe(429);
    });

    it('revoke (HTTP): refresh ile aile kapanir; sonraki refresh 400 invalid_grant', async () => {
        const clientId = await dcr();
        const { verifier, challenge } = pkce();
        const au = await fetch(base + q({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 's', resource: RESOURCE }), { redirect: 'manual' });
        const reqId = new URL(au.headers.get('location') as string).searchParams.get('req') as string;
        const dec = await (await post('/api/oauth/requests/' + reqId + '/decision', { approve: true, tid: 1 }, principal({ sub: 'u1' }))).json() as { redirectTo: string };
        const code = new URL(dec.redirectTo).searchParams.get('code') as string;
        const t = await (await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: REDIRECT }))).json() as { refresh_token: string };
        expect((await post('/oauth/revoke', form({ token: t.refresh_token, token_type_hint: 'refresh_token', client_id: clientId }))).status).toBe(200);
        const r = await post('/oauth/token', form({ grant_type: 'refresh_token', client_id: clientId, refresh_token: t.refresh_token }));
        expect(r.status).toBe(400);
        expect(await r.json()).toMatchObject({ error: 'invalid_grant' });
    });
});

describe('cerezli onay uclari (HTTP)', () => {
    async function pendingId() {
        const c = await h.service.register({ redirect_uris: [REDIRECT] }) as { client_id: string };
        const out = await h.service.authorize({ response_type: 'code', client_id: c.client_id, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: 'S256', state: 's', resource: RESOURCE });
        return new URL((out as { url: string }).url).searchParams.get('req') as string;
    }

    it('katalog zarfi: imp/ga 403 IMPERSONATION_FORBIDDEN; MCP kapali tenant 403 MCP_TENANT_OFF; uye olunmayan 403 OAUTH_ACCESS_DENIED; gecersiz govde 400 OAUTH_INVALID_REQUEST; yok 404', async () => {
        const id = await pendingId();
        const hdr = principal({ sub: 'u1', tid: 1 });
        for (const p of [{ sub: 'u1', imp: true }, { sub: 'u1', ga: true }]) {
            const r = await post('/api/oauth/requests/' + id + '/decision', { approve: true, tid: 1 }, principal(p));
            expect(r.status).toBe(403);
            expect(await r.json()).toMatchObject({ code: 'IMPERSONATION_FORBIDDEN' });
            expect((await fetch(base + '/api/oauth/requests/' + id, { headers: principal(p) })).status).toBe(403);
        }
        expect(await (await post('/api/oauth/requests/' + id + '/decision', { approve: true, tid: 99 }, hdr)).json()).toMatchObject({ code: 'OAUTH_ACCESS_DENIED' });
        expect(await (await post('/api/oauth/requests/' + id + '/decision', { approve: 'x' }, hdr)).json()).toMatchObject({ code: 'OAUTH_INVALID_REQUEST' });
        setAccess('off');
        const off = await post('/api/oauth/requests/' + id + '/decision', { approve: true, tid: 1 }, hdr);
        expect(off.status).toBe(403);
        expect(await off.json()).toMatchObject({ code: 'MCP_TENANT_OFF' });
        expect((await fetch(base + '/api/oauth/requests/' + 'A'.repeat(32), { headers: hdr })).status).toBe(404);
    });

    it('ret: 200 redirectTo error=access_denied', async () => {
        const id = await pendingId();
        const r = await post('/api/oauth/requests/' + id + '/decision', { approve: false }, principal({ sub: 'u1', tid: 1 }));
        expect(r.status).toBe(200);
        expect(new URL((await r.json() as { redirectTo: string }).redirectTo).searchParams.get('error')).toBe('access_denied');
    });
});

describe('sizinti testi: belirtec/kod/verifier/ozet hicbir log satirinda ve denetim kaydinda yok', () => {
    it('tam akis + hatalar + reuse iptali sirasinda stdout/stderr/console ve AuditLogs kayitlari gizli degerleri icermez', async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const cap: LogCapture = captureLogs();
        const consoleSpy = [jest.spyOn(console, 'log'), jest.spyOn(console, 'error'), jest.spyOn(console, 'warn')].map((s) => s.mockImplementation(() => undefined));
        const records: Array<Record<string, unknown>> = [];
        AuditLogger.setSink(async (rec) => { records.push(rec); });
        const gate = new FamilyGate(h.store, 60_000, () => h.clock.t);
        const real = new OAuthService({
            store: h.store, kv: () => h.kv, identity: h.identity, gate, audit: defaultOAuthAudit, now: () => h.clock.t,
            urls: () => ({ issuer: API, resource: RESOURCE, appOrigin: APP }),
        });
        await start(real);

        const secrets: string[] = [];
        const reg = await (await post('/oauth/register', { redirect_uris: [REDIRECT], client_name: 'App', scope: 'mcp:read mcp:write' })).json() as { client_id: string };
        const { verifier, challenge } = pkce();
        secrets.push(verifier);
        const au = await fetch(base + '/oauth/authorize?' + new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'state-gizli-degil', resource: RESOURCE }), { redirect: 'manual' });
        const reqId = new URL(au.headers.get('location') as string).searchParams.get('req') as string;
        const dec = await (await post('/api/oauth/requests/' + reqId + '/decision', { approve: true, tid: 1 }, principal({ sub: 'u1' }))).json() as { redirectTo: string };
        const code = new URL(dec.redirectTo).searchParams.get('code') as string;
        secrets.push(code);
        const t = await (await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: reg.client_id, code, code_verifier: verifier, redirect_uri: REDIRECT }))).json() as { access_token: string; refresh_token: string };
        secrets.push(t.access_token, t.refresh_token);
        const t2 = await (await post('/oauth/token', form({ grant_type: 'refresh_token', client_id: reg.client_id, refresh_token: t.refresh_token }))).json() as { access_token: string; refresh_token: string };
        secrets.push(t2.access_token, t2.refresh_token);
        h.advance(11_000);
        await post('/oauth/token', form({ grant_type: 'refresh_token', client_id: reg.client_id, refresh_token: t.refresh_token })); // reuse -> aile iptal
        await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: reg.client_id, code, code_verifier: verifier, redirect_uri: REDIRECT })); // kod yeniden kullanim
        await post('/oauth/revoke', form({ token: t2.refresh_token }));
        await new Promise((r) => setTimeout(r, 20)); // audit mikro gorevleri

        // depoda saklanan ozetler de sizmamali
        for (const r of h.store.refresh.values()) secrets.push(r.tokenHash);
        for (const c of h.store.codes.values()) secrets.push(c.codeHash);

        const haystack = JSON.stringify(cap.lines) + JSON.stringify(records) + consoleSpy.map((s) => JSON.stringify(s.mock.calls)).join('');
        for (const s of secrets) expect(haystack).not.toContain(s);
        cap.restore();
        expect(records.length).toBeGreaterThanOrEqual(6);
        const events = records.map((r) => r.event);
        expect(events).toEqual(expect.arrayContaining(['oauth.register', 'oauth.consent_granted', 'oauth.token_issued', 'oauth.refresh', 'oauth.refresh_reuse', 'oauth.code_reuse']));
        for (const r of records) expect(r.surface).toBe('mcp');
    });
});
