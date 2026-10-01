/**
 * MCP-1: DCR (RFC 7591) kisitlari + yonlendirme adresi kurallari + SSRF yok (ADR-0035 Karar 2). DB/Redis/ag YOK.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import http from 'http';
import https from 'https';
import net from 'net';
import { knownClientName } from '../../../src/api/oauth/knownClients';
import { redirectMatches, validateRedirectUri } from '../../../src/api/oauth/redirect';
import { MAX_CLIENT_NAME } from '../../../src/api/oauth/service';
import { REDIRECT, buildHarness, setMcpEnv, type Harness } from '../../helpers/oauthHarness';

let restore: () => void;
let h: Harness;
beforeEach(() => { restore = setMcpEnv(); h = buildHarness(); });
afterEach(() => { restore(); jest.restoreAllMocks(); });

describe('redirect_uri dogrulama (kayit)', () => {
    it.each([
        ['https://client.example.test/callback', true],
        ['https://a.b.example.test/cb?x=1', true],
        ['http://127.0.0.1:53682/callback', true],
        ['http://127.0.0.1/callback', false],          // port zorunlu
        ['http://localhost:3000/cb', false],           // localhost adi
        ['http://[::1]:3000/cb', false],
        ['http://client.example.test/cb', false],      // duz http
        ['https://localhost/cb', false],
        ['https://127.0.0.1/cb', false],               // https + IP
        ['https://10.0.0.5/cb', false],
        ['https://intranet/cb', false],                // nitelikli alan adi degil
        ['https://*.example.test/cb', false],          // joker
        ['https://client.example.test/cb#frag', false],
        ['https://user:pw@client.example.test/cb', false],
        ['javascript:alert(1)', false],
        ['data:text/html,x', false],
        ['myapp://callback', false],                   // ozel sema (kayit kapsaminda degil)
        ['https://client.example.test/ cb', false],    // bosluk
        ['', false],
    ])('%s -> %s', (uri, ok) => {
        expect(validateRedirectUri(uri).ok).toBe(ok);
    });

    it('string olmayan girdi reddedilir', () => {
        expect(validateRedirectUri(undefined).ok).toBe(false);
        expect(validateRedirectUri({ a: 1 }).ok).toBe(false);
        expect(validateRedirectUri('https://a.example.test/' + 'x'.repeat(2100)).ok).toBe(false);
    });
});

describe('redirect_uri BIREBIR eslesme (authorize)', () => {
    const reg = ['https://client.example.test/callback', 'http://127.0.0.1:53682/callback'];
    it('birebir esit kabul; sonek/alt yol/farkli port/query eki/buyuk harf/slash eki/localhost adi reddedilir', () => {
        expect(redirectMatches(reg, 'https://client.example.test/callback')).toBe(true);
        expect(redirectMatches(reg, 'http://127.0.0.1:53682/callback')).toBe(true);
        for (const bad of [
            'https://client.example.test/callback/', 'https://client.example.test/callback/x', 'https://client.example.test/callbackx',
            'https://client.example.test/callback?a=1', 'https://client.example.test:444/callback', 'https://evil.client.example.test/callback',
            'https://CLIENT.example.test/callback', 'http://127.0.0.1:53683/callback', 'http://127.0.0.1:53682/callback/x',
            'http://localhost:53682/callback', 'https://client.example.test/callback#', undefined, '', 5,
        ]) expect(redirectMatches(reg, bad as never)).toBe(false);
    });

    it('authorize: kayitli olmayan redirect_uri YONLENDIRME YAPMAZ (page_error); gecersiz client_id de', async () => {
        const reg2 = await h.service.register({ redirect_uris: [REDIRECT] }) as { client_id: string };
        const base = { response_type: 'code', code_challenge: 'A'.repeat(43), code_challenge_method: 'S256', state: 's', resource: 'x' };
        expect(await h.service.authorize({ ...base, client_id: reg2.client_id, redirect_uri: REDIRECT + '/evil' })).toEqual({ type: 'page_error' });
        expect(await h.service.authorize({ ...base, client_id: 'ec_yok', redirect_uri: REDIRECT })).toEqual({ type: 'page_error' });
        expect(await h.service.authorize({ ...base, redirect_uri: REDIRECT })).toEqual({ type: 'page_error' });
    });
});

describe('bilinen istemci rozeti (host tabanli)', () => {
    it('yalniz tum adresleri listedeki https hostlarinda ise taninir; loopback ve taklit host taninmaz', () => {
        expect(knownClientName(['https://claude.ai/api/mcp/auth_callback'])).toBe('Claude');
        expect(knownClientName(['https://claude.ai/a', 'https://claude.com/b'])).toBe('Claude');
        expect(knownClientName(['https://claude.ai/a', 'https://evil.example.test/b'])).toBeUndefined();
        expect(knownClientName(['https://claude.ai.evil.example.test/cb'])).toBeUndefined();
        expect(knownClientName(['http://127.0.0.1:1234/cb'])).toBeUndefined();
        expect(knownClientName(['https://client.example.test/cb'])).toBeUndefined();
    });
});

describe('DCR kisitlari (RFC 7591)', () => {
    const ok = { redirect_uris: [REDIRECT], client_name: 'Uygulama' };
    const rejects = async (body: unknown) => expect(h.service.register(body)).rejects.toMatchObject({ oauthError: 'invalid_client_metadata', status: 400 });

    it('gecerli kayit: client_id + sir YOK + yalniz public client + varsayilanlar', async () => {
        const r = await h.service.register(ok);
        expect(r).toMatchObject({ client_name: 'Uygulama', redirect_uris: [REDIRECT], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'mcp:read' });
        expect(String(r.client_id)).toMatch(/^ec_[A-Za-z0-9_-]{24}$/);
        expect('client_secret' in r).toBe(false);
        const stored = await h.store.getClient(r.client_id as string);
        expect(stored?.unusedExpireAt).toBeInstanceOf(Date); // hic yetki alinmamis: 30 gun TTL
    });

    it('sir istenmesi / client_secret / token_endpoint_auth_method != none reddedilir', async () => {
        await rejects({ ...ok, token_endpoint_auth_method: 'client_secret_basic' });
        await rejects({ ...ok, token_endpoint_auth_method: 'private_key_jwt' });
        await rejects({ ...ok, client_secret: 'x' });
    });

    it('grant_types: client_credentials/implicit/password reddedilir; yalniz refresh_token (code yok) reddedilir', async () => {
        await rejects({ ...ok, grant_types: ['client_credentials'] });
        await rejects({ ...ok, grant_types: ['authorization_code', 'implicit'] });
        await rejects({ ...ok, grant_types: ['password'] });
        await rejects({ ...ok, grant_types: ['refresh_token'] });
        await rejects({ ...ok, grant_types: [] });
        await rejects({ ...ok, response_types: ['token'] });
    });

    it('redirect_uris: yok/bos/6+/joker/http/localhost reddedilir; 5 kabul', async () => {
        await rejects({});
        await rejects({ redirect_uris: [] });
        await rejects({ redirect_uris: 'https://client.example.test/cb' });
        await rejects({ redirect_uris: Array.from({ length: 6 }, (_, i) => `https://c${i}.example.test/cb`) });
        await rejects({ redirect_uris: ['https://*.example.test/cb'] });
        await rejects({ redirect_uris: ['http://client.example.test/cb'] });
        await rejects({ redirect_uris: ['http://localhost:8080/cb'] });
        await rejects({ redirect_uris: [REDIRECT, 'http://evil.example.test/cb'] });
        await expect(h.service.register({ redirect_uris: Array.from({ length: 5 }, (_, i) => `https://c${i}.example.test/cb`) })).resolves.toBeDefined();
    });

    it('client_name: uzun/kontrol karakteri/tip hatasi reddedilir; eksikse host kullanilir', async () => {
        await rejects({ ...ok, client_name: 'x'.repeat(MAX_CLIENT_NAME + 1) });
        await rejects({ ...ok, client_name: 'a' + String.fromCharCode(10) + 'b' });
        await rejects({ ...ok, client_name: 'a' + String.fromCharCode(0) });
        await rejects({ ...ok, client_name: '' });
        await rejects({ ...ok, client_name: 5 });
        await expect(h.service.register({ ...ok, client_name: 'x'.repeat(MAX_CLIENT_NAME) })).resolves.toBeDefined();
        expect((await h.service.register({ redirect_uris: [REDIRECT] })).client_name).toBe('client.example.test');
    });

    it('scope yalniz mcp:read/mcp:write; govde nesne degilse reddedilir', async () => {
        await rejects({ ...ok, scope: 'admin' });
        await rejects({ ...ok, scope: 'mcp:read offline_access' });
        await rejects(null);
        await rejects([]);
        await rejects('x');
        expect((await h.service.register({ ...ok, scope: 'mcp:read mcp:write' })).scope).toBe('mcp:read mcp:write');
    });

    it('logo_uri / client_uri / jwks_uri / policy_uri verilse de sunucu DIS ISTEK ATMAZ ve saklamaz (SSRF yok)', async () => {
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((() => { throw new Error('dis istek'); }) as never);
        const httpSpy = jest.spyOn(http, 'request').mockImplementation((() => { throw new Error('dis istek'); }) as never);
        const httpsSpy = jest.spyOn(https, 'request').mockImplementation((() => { throw new Error('dis istek'); }) as never);
        const connSpy = jest.spyOn(net, 'connect').mockImplementation((() => { throw new Error('dis istek'); }) as never);
        const r = await h.service.register({
            ...ok, logo_uri: 'http://169.254.169.254/latest/meta-data', client_uri: 'http://127.0.0.1:9/x', jwks_uri: 'http://10.0.0.1/jwks',
            policy_uri: 'https://evil.example.test/p', tos_uri: 'https://evil.example.test/t', software_statement: 'eyJ',
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(httpSpy).not.toHaveBeenCalled();
        expect(httpsSpy).not.toHaveBeenCalled();
        expect(connSpy).not.toHaveBeenCalled();
        const stored = await h.store.getClient(r.client_id as string);
        expect(JSON.stringify(stored)).not.toMatch(/169\.254|logo|jwks|evil/);
        expect(Object.keys(r).sort()).toEqual(['client_id', 'client_id_issued_at', 'client_name', 'grant_types', 'redirect_uris', 'response_types', 'scope', 'token_endpoint_auth_method']);
    });
});
