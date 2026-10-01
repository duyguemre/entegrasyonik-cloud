/**
 * MCP-1: authorize + onay + token + refresh rotasyonu + revoke akisi (ADR-0010 + ADR-0035 Karar 2). Uretim `OAuthService` + bellek deposu; DB/Redis/ag YOK.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { verifyOAuthAccessToken } from '../../../src/platform/core/security/oauthTokens';
import { FamilyGate } from '../../../src/api/oauth/familyGate';
import { ConsentError, REFRESH_GRACE_MS } from '../../../src/api/oauth/service';
import { sha256Hex } from '../../../src/platform/core/security/oauthTokens';
import { API, APP, REDIRECT, RESOURCE, authorizeToCode, buildHarness, pkce, session, setAccess, setMcpEnv, type Harness } from '../../helpers/oauthHarness';

let restore: () => void;
let h: Harness;
beforeEach(() => {
    restore = setMcpEnv();
    h = buildHarness();
    h.identity.add('u1', [[1, 'Magaza Bir', 'owner']]);
    setAccess('readwrite');
});
afterEach(() => restore());

const DAY = 24 * 60 * 60 * 1000;
const tokenForm = (c: { clientId: string; code: string; verifier: string; redirectUri: string }, over: Record<string, string> = {}) =>
    ({ grant_type: 'authorization_code', client_id: c.clientId, code: c.code, code_verifier: c.verifier, redirect_uri: c.redirectUri, ...over });
const refreshForm = (clientId: string, refresh_token: string, over: Record<string, string> = {}) => ({ grant_type: 'refresh_token', client_id: clientId, refresh_token, ...over });
const oauthErr = (e: unknown) => (e as { oauthError?: string }).oauthError;

async function registered() {
    const r = await h.service.register({ redirect_uris: [REDIRECT], client_name: 'App', scope: 'mcp:read mcp:write' }) as { client_id: string };
    return r.client_id;
}
const authQuery = (clientId: string, over: Record<string, unknown> = {}) => ({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: 'S256', state: 'st', resource: RESOURCE, ...over,
});
async function redirectError(q: Record<string, unknown>) {
    const out = await h.service.authorize(q);
    if (out.type !== 'redirect') throw new Error('redirect bekleniyordu');
    const u = new URL(out.url);
    return { error: u.searchParams.get('error'), state: u.searchParams.get('state'), origin: u.origin + u.pathname };
}

describe('authorize dogrulama', () => {
    it('PKCE eksik / plain / gecersiz challenge -> kayitli redirect\'e invalid_request (state korunur)', async () => {
        const c = await registered();
        const noChallenge = { ...authQuery(c) } as Record<string, unknown>; delete noChallenge.code_challenge;
        expect(await redirectError(noChallenge)).toMatchObject({ error: 'invalid_request', state: 'st', origin: REDIRECT });
        expect(await redirectError(authQuery(c, { code_challenge_method: 'plain' }))).toMatchObject({ error: 'invalid_request' });
        const noMethod = { ...authQuery(c) } as Record<string, unknown>; delete noMethod.code_challenge_method;
        expect(await redirectError(noMethod)).toMatchObject({ error: 'invalid_request' });
        expect(await redirectError(authQuery(c, { code_challenge: 'kisa' }))).toMatchObject({ error: 'invalid_request' });
    });

    it('state zorunlu; response_type=code zorunlu', async () => {
        const c = await registered();
        const noState = { ...authQuery(c) } as Record<string, unknown>; delete noState.state;
        expect(await redirectError(noState)).toMatchObject({ error: 'invalid_request' });
        expect(await redirectError(authQuery(c, { response_type: 'token' }))).toMatchObject({ error: 'unsupported_response_type' });
    });

    it('resource eksik veya yanlis -> invalid_target (RFC 8707); denetime yazilir', async () => {
        const c = await registered();
        const noRes = { ...authQuery(c) } as Record<string, unknown>; delete noRes.resource;
        expect(await redirectError(noRes)).toMatchObject({ error: 'invalid_target' });
        expect(await redirectError(authQuery(c, { resource: API + '/baska' }))).toMatchObject({ error: 'invalid_target' });
        expect(await redirectError(authQuery(c, { resource: RESOURCE + '/' }))).toMatchObject({ error: 'invalid_target' });
        expect(h.audit.filter((a) => a.event === 'oauth.resource_rejected')).toHaveLength(3);
    });

    it('kayitli olmayan kapsam -> invalid_scope; gecerli istek onay sayfasina (APP_PUBLIC_URL) yonlenir ve istek Redis/KV\'ye 10 dk yazilir', async () => {
        const reg = await h.service.register({ redirect_uris: [REDIRECT] }) as { client_id: string }; // yalniz mcp:read kayitli
        expect(await redirectError(authQuery(reg.client_id, { scope: 'mcp:read mcp:write' }))).toMatchObject({ error: 'invalid_scope' });
        expect(await redirectError(authQuery(reg.client_id, { scope: 'foo' }))).toMatchObject({ error: 'invalid_scope' });
        const out = await h.service.authorize(authQuery(reg.client_id, { scope: 'mcp:read' }));
        expect(out.type).toBe('redirect');
        const u = new URL((out as { url: string }).url);
        expect(u.origin).toBe(APP);
        expect(u.pathname).toBe('/oauth/consent');
        const id = u.searchParams.get('req') as string;
        expect(id).toMatch(/^[A-Za-z0-9_-]{32}$/);
        expect(h.kv.keys()).toContain('oauth:req:' + id);
        h.advance(10 * 60 * 1000 + 1);
        expect(h.kv.keys()).toHaveLength(0); // 10 dk sonra yok
    });
});

describe('onay ekrani (GET request / POST decision)', () => {
    async function pending(scope = 'mcp:read mcp:write') {
        const c = await registered();
        const out = await h.service.authorize(authQuery(c, { scope }));
        return { c, id: new URL((out as { url: string }).url).searchParams.get('req') as string };
    }

    it('GET: istemci adi/rozet/host + kullanicinin tenant\'lari + mcpAccess/writeAvailable + surumlu bilgilendirme', async () => {
        h.identity.add('u2', [[1, 'Bir', 'owner'], [2, 'Iki', 'operator']]);
        setAccess((tid) => (tid === 1 ? 'readwrite' : 'off'));
        const { id } = await pending();
        const v = await h.service.getConsentRequest(id, session('u2'));
        expect(v).toMatchObject({ id, state: 'pending', client: { name: 'App', known: false, redirectHost: 'client.example.test' }, requestedScopes: ['mcp:read', 'mcp:write'] });
        expect(v.tenants).toEqual([
            { tid: 1, name: 'Bir', role: 'owner', mcpAccess: 'readwrite', writeAvailable: true },
            { tid: 2, name: 'Iki', role: 'operator', mcpAccess: 'off', writeAvailable: false },
        ]);
        expect(v.notice.textVersion).toBe('mcp-consent-v1');
        expect(typeof v.notice.text).toBe('string');
        expect(Date.parse(v.expiresAt)).toBeGreaterThan(h.clock.t);
    });

    it('bilinmeyen/suresi dolmus/biçimsiz istek kimligi 404 NOT_FOUND', async () => {
        const { id } = await pending();
        await expect(h.service.getConsentRequest('x', session('u1'))).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
        await expect(h.service.getConsentRequest('A'.repeat(32), session('u1'))).rejects.toMatchObject({ status: 404 });
        h.advance(10 * 60 * 1000 + 1);
        await expect(h.service.getConsentRequest(id, session('u1'))).rejects.toMatchObject({ status: 404 });
    });

    it('imp (impersonation) ve ga (platform yoneticisi) oturumunda GET ve karar 403 IMPERSONATION_FORBIDDEN', async () => {
        const { id } = await pending();
        for (const s of [session('u1', { imp: true }), session('u1', { ga: true }), session('u1', { ga: true, imp: true })]) {
            await expect(h.service.getConsentRequest(id, s)).rejects.toMatchObject({ status: 403, code: 'IMPERSONATION_FORBIDDEN' });
            await expect(h.service.decide(id, s, { approve: true, tid: 1 })).rejects.toMatchObject({ status: 403, code: 'IMPERSONATION_FORBIDDEN' });
        }
        expect(h.kv.keys()).toContain('oauth:req:' + id); // reddedilen karar istegi tuketmez
    });

    it('tenant MCP kapali (off) -> karar 403 MCP_TENANT_OFF; istek tuketilmez (sahip acinca ayni istek devam eder)', async () => {
        setAccess('off');
        const { id } = await pending();
        await expect(h.service.decide(id, session('u1'), { approve: true, tid: 1 })).rejects.toMatchObject({ status: 403, code: 'MCP_TENANT_OFF' });
        setAccess('read');
        await expect(h.service.decide(id, session('u1'), { approve: true, tid: 1 })).resolves.toHaveProperty('redirectTo');
    });

    it('uye olunmayan tenant / pasif tenant / gecersiz tid -> 403 OAUTH_ACCESS_DENIED veya 400 OAUTH_INVALID_REQUEST', async () => {
        const { id } = await pending();
        await expect(h.service.decide(id, session('u1'), { approve: true, tid: 99 })).rejects.toMatchObject({ status: 403, code: 'OAUTH_ACCESS_DENIED' });
        await expect(h.service.decide(id, session('bilinmeyen'), { approve: true, tid: 1 })).rejects.toMatchObject({ status: 403, code: 'OAUTH_ACCESS_DENIED' });
        await expect(h.service.decide(id, session('u1'), { approve: true })).rejects.toMatchObject({ status: 400, code: 'OAUTH_INVALID_REQUEST' });
        await expect(h.service.decide(id, session('u1'), { approve: true, tid: '1' })).rejects.toMatchObject({ status: 400 });
        await expect(h.service.decide(id, session('u1'), { approve: 'yes' })).rejects.toMatchObject({ status: 400 });
        await expect(h.service.decide(id, session('u1'), { approve: true, tid: 1, scopes: ['mcp:admin'] })).rejects.toMatchObject({ status: 400 });
        h.identity.users.get('u1')!.tenants.get(1)!.active = false;
        await expect(h.service.decide(id, session('u1'), { approve: true, tid: 1 })).rejects.toMatchObject({ status: 403, code: 'OAUTH_ACCESS_DENIED' });
    });

    it('ret: redirectTo error=access_denied + state; istek tuketilir; ikinci karar 404', async () => {
        const { id } = await pending();
        const r = await h.service.decide(id, session('u1'), { approve: false });
        const u = new URL(r.redirectTo);
        expect(u.origin + u.pathname).toBe(REDIRECT);
        expect(u.searchParams.get('error')).toBe('access_denied');
        expect(u.searchParams.get('state')).toBe('st');
        expect(u.searchParams.has('code')).toBe(false);
        await expect(h.service.decide(id, session('u1'), { approve: true, tid: 1 })).rejects.toMatchObject({ status: 404 });
    });

    it('onay: redirectTo code + state; istek TEK KULLANIMLIK (es zamanli iki karardan yalniz biri kod uretir)', async () => {
        const { id } = await pending();
        const [a, b] = await Promise.allSettled([
            h.service.decide(id, session('u1'), { approve: true, tid: 1 }),
            h.service.decide(id, session('u1'), { approve: true, tid: 1 }),
        ]);
        const ok = [a, b].filter((x) => x.status === 'fulfilled');
        expect(ok).toHaveLength(1);
        const u = new URL((ok[0] as PromiseFulfilledResult<{ redirectTo: string }>).value.redirectTo);
        expect(u.searchParams.get('state')).toBe('st');
        expect(u.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(h.store.codes.size).toBe(1);
        const stored = [...h.store.codes.values()][0];
        expect(stored.codeHash).toBe(sha256Hex(u.searchParams.get('code') as string)); // yalniz ozet
        expect(JSON.stringify(stored)).not.toContain(u.searchParams.get('code') as string);
    });

    it('kapsam: yazma YALNIZ tenant readwrite + rol yazma yetenegine sahipse; aksi halde SESSIZCE dusurulur; okuma her zaman', async () => {
        const probe = async (access: 'read' | 'readwrite', role: 'owner' | 'admin' | 'operator', picks?: string[]) => {
            h.identity.add('p', [[5, 'P', role]]);
            setAccess(access);
            const cc = await authorizeToCode(h, { sub: 'p', tid: 5, approveScopes: picks });
            const t = await h.service.token(tokenForm(cc));
            return t.scope;
        };
        expect(await probe('readwrite', 'owner')).toBe('mcp:read mcp:write');
        expect(await probe('read', 'owner')).toBe('mcp:read');               // tenant salt-okuma: write dusurulur
        expect(await probe('readwrite', 'owner', ['mcp:read'])).toBe('mcp:read'); // kullanici write'i kaldirdi
        expect(await probe('readwrite', 'owner', ['mcp:write'])).toBe('mcp:read mcp:write'); // okuma her zaman eklenir
    });

    it('iki tenant\'li kullanici B\'yi secince token tid=B ve baglanti B\'ye baglidir', async () => {
        h.identity.add('u3', [[1, 'A', 'owner'], [2, 'B', 'admin']]);
        const cc = await authorizeToCode(h, { sub: 'u3', tid: 2 });
        const t = await h.service.token(tokenForm(cc));
        const p = verifyOAuthAccessToken(t.access_token, RESOURCE);
        expect(p.tid).toBe(2);
        expect(p.role).toBe('admin');
        const rec = [...h.store.refresh.values()][0];
        expect(rec.tid).toBe(2);
        expect(rec.clientName).toBe('Test App');
    });
});

describe('token: authorization_code + PKCE', () => {
    it('basari: access (15 dk, aud, fam, ga/imp yok) + refresh (yalniz ozet saklanir) + Bearer + scope; istemci ilk yetki alir (TTL kalkar)', async () => {
        const cc = await authorizeToCode(h);
        const t = await h.service.token(tokenForm(cc));
        expect(t).toMatchObject({ token_type: 'Bearer', expires_in: 900, scope: 'mcp:read mcp:write' });
        const p = verifyOAuthAccessToken(t.access_token, RESOURCE);
        expect(p).toMatchObject({ sub: 'u1', tid: 1, cid: cc.clientId });
        expect(p.exp - p.iat).toBe(900);
        const rec = [...h.store.refresh.values()][0];
        expect(rec.tokenHash).toBe(sha256Hex(t.refresh_token));
        expect(JSON.stringify(rec)).not.toContain(t.refresh_token);
        expect(rec.familyId).toBe(p.fam);
        expect(rec.familyExpiresAt.getTime() - rec.familyCreatedAt.getTime()).toBe(90 * DAY);
        expect(rec.idleExpiresAt.getTime() - rec.createdAt.getTime()).toBe(30 * DAY);
        const client = await h.store.getClient(cc.clientId);
        expect(client?.lastGrantAt).toBeInstanceOf(Date);
        expect(client?.unusedExpireAt).toBeUndefined();
        expect(h.audit.find((a) => a.event === 'oauth.token_issued')).toMatchObject({ result: 'ok', sub: 'u1', tid: 1, clientId: cc.clientId, fam: p.fam });
    });

    it('yanlis / eksik / cok kisa verifier ve yanlis redirect_uri reddedilir (invalid_grant / invalid_request)', async () => {
        const c1 = await authorizeToCode(h);
        await expect(h.service.token(tokenForm(c1, { code_verifier: pkce().verifier }))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        const c2 = await authorizeToCode(h);
        await expect(h.service.token(tokenForm(c2, { redirect_uri: REDIRECT + '/x' }))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        const c3 = await authorizeToCode(h);
        const f = tokenForm(c3) as Record<string, string>; delete f.code_verifier;
        await expect(h.service.token(f)).rejects.toMatchObject({ oauthError: 'invalid_request' });
        const c4 = await authorizeToCode(h);
        await expect(h.service.token(tokenForm(c4, { code_verifier: 'kisa' }))).rejects.toMatchObject({ oauthError: 'invalid_request' });
    });

    it('baska istemcinin kodu / bilinmeyen client / yanlis resource reddedilir', async () => {
        const c1 = await authorizeToCode(h);
        const other = await registered();
        await expect(h.service.token(tokenForm(c1, { client_id: other }))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        const c2 = await authorizeToCode(h);
        await expect(h.service.token(tokenForm(c2, { client_id: 'ec_yok' }))).rejects.toMatchObject({ oauthError: 'invalid_client', status: 401 });
        const c3 = await authorizeToCode(h);
        await expect(h.service.token(tokenForm(c3, { resource: API + '/x' }))).rejects.toMatchObject({ oauthError: 'invalid_target' });
    });

    it('kod 60 sn sonra gecersiz', async () => {
        const cc = await authorizeToCode(h);
        h.advance(61_000);
        await expect(h.service.token(tokenForm(cc))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
    });

    it('kod TEK KULLANIMLIK: ikinci kullanim reddedilir ve o koddan verilmis AILEYI iptal eder', async () => {
        const cc = await authorizeToCode(h);
        const t = await h.service.token(tokenForm(cc));
        const fam = verifyOAuthAccessToken(t.access_token, RESOURCE).fam;
        expect(await h.gate.isActive(fam)).toBe(true);
        await expect(h.service.token(tokenForm(cc))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        expect(h.store.familyDocs(fam).every((r) => r.revokedAt && r.revokedBy === 'code_reuse')).toBe(true);
        expect(await h.gate.isActive(fam)).toBe(false); // surec-ici LRU ANINDA dusurulur
        await expect(h.service.token(refreshForm(cc.clientId, t.refresh_token))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        expect(h.audit.some((a) => a.event === 'oauth.code_reuse' && a.fam === fam)).toBe(true);
    });

    it('es zamanli iki kod degisimi: yalniz biri token alir', async () => {
        const cc = await authorizeToCode(h);
        const r = await Promise.allSettled([h.service.token(tokenForm(cc)), h.service.token(tokenForm(cc))]);
        expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    });

    it('kod uretildikten sonra kullanici tokenVersion artarsa (parola degisimi) kod reddedilir', async () => {
        const cc = await authorizeToCode(h);
        h.identity.users.get('u1')!.tv = 1;
        await expect(h.service.token(tokenForm(cc))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
    });

    it('desteklenmeyen grant (client_credentials/password) ve govde tip hatasi', async () => {
        const c = await registered();
        await expect(h.service.token({ grant_type: 'client_credentials', client_id: c })).rejects.toMatchObject({ oauthError: 'unsupported_grant_type' });
        await expect(h.service.token({ grant_type: 'password', client_id: c })).rejects.toMatchObject({ oauthError: 'unsupported_grant_type' });
        await expect(h.service.token({ client_id: c })).rejects.toMatchObject({ oauthError: 'invalid_request' });
        await expect(h.service.token({ grant_type: 'authorization_code', client_id: { $ne: null } as never })).rejects.toMatchObject({ oauthError: 'invalid_request' });
    });
});

describe('refresh rotasyonu ve yeniden kullanim tespiti', () => {
    async function connected() {
        const cc = await authorizeToCode(h);
        const t = await h.service.token(tokenForm(cc));
        return { cc, t, fam: verifyOAuthAccessToken(t.access_token, RESOURCE).fam };
    }

    it('rotasyon: yeni refresh + yeni access; eski isaretlenir (usedAt); ayni aile; mutlak omur uzamaz, bosta omru tazelenir', async () => {
        const { cc, t, fam } = await connected();
        h.advance(3600_000);
        const t2 = await h.service.token(refreshForm(cc.clientId, t.refresh_token));
        expect(t2.refresh_token).not.toBe(t.refresh_token);
        expect(verifyOAuthAccessToken(t2.access_token, RESOURCE).fam).toBe(fam);
        const docs = h.store.familyDocs(fam);
        expect(docs).toHaveLength(2);
        const [oldDoc, newDoc] = [docs.find((d) => d.tokenHash === sha256Hex(t.refresh_token))!, docs.find((d) => d.tokenHash === sha256Hex(t2.refresh_token))!];
        expect(oldDoc.usedAt).toBeInstanceOf(Date);
        expect(newDoc.usedAt).toBeUndefined();
        expect(newDoc.familyExpiresAt.getTime()).toBe(oldDoc.familyExpiresAt.getTime()); // mutlak omur yenilemeyle UZAMAZ
        expect(newDoc.idleExpiresAt.getTime()).toBe(h.clock.t + 30 * DAY);
        expect(h.audit.some((a) => a.event === 'oauth.refresh' && a.fam === fam)).toBe(true);
    });

    it('yeniden kullanim > 10 sn: ayni istemci bile olsa AILE iptal (refresh_reuse denetimi); yeni zincir de olur', async () => {
        const { cc, t, fam } = await connected();
        const t2 = await h.service.token(refreshForm(cc.clientId, t.refresh_token));
        h.advance(REFRESH_GRACE_MS + 1);
        await expect(h.service.token(refreshForm(cc.clientId, t.refresh_token))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        expect(h.store.familyDocs(fam).every((d) => d.revokedAt && d.revokedBy === 'reuse')).toBe(true);
        await expect(h.service.token(refreshForm(cc.clientId, t2.refresh_token))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        expect(h.audit.some((a) => a.event === 'oauth.refresh_reuse' && a.fam === fam && a.result === 'fail')).toBe(true);
    });

    it('yeniden kullanim <= 10 sn ayni client: GRACE (aile yasar, yeni access+refresh, oauth.refresh_grace denetimi)', async () => {
        const { cc, t, fam } = await connected();
        await h.service.token(refreshForm(cc.clientId, t.refresh_token));
        h.advance(REFRESH_GRACE_MS); // tam sinirda hala grace
        const t3 = await h.service.token(refreshForm(cc.clientId, t.refresh_token));
        expect(verifyOAuthAccessToken(t3.access_token, RESOURCE).fam).toBe(fam);
        expect(h.store.familyDocs(fam).some((d) => d.revokedAt)).toBe(false);
        expect(await h.gate.isActive(fam)).toBe(true);
        expect(h.audit.filter((a) => a.event === 'oauth.refresh_grace' && a.fam === fam)).toHaveLength(1);
        // grace ile verilen yeni refresh de calisir
        await expect(h.service.token(refreshForm(cc.clientId, t3.refresh_token))).resolves.toBeDefined();
    });

    it('es zamanli iki yenileme (ayni refresh): ikisi de grace icinde basarili olur, aile yasar', async () => {
        const { cc, t, fam } = await connected();
        const r = await Promise.allSettled([h.service.token(refreshForm(cc.clientId, t.refresh_token)), h.service.token(refreshForm(cc.clientId, t.refresh_token))]);
        expect(r.every((x) => x.status === 'fulfilled')).toBe(true);
        expect(h.store.familyDocs(fam).some((d) => d.revokedAt)).toBe(false);
    });

    it('FARKLI client_id ile sunulan refresh (grace icinde bile): aile iptal + client_mismatch denetimi', async () => {
        const { cc, t, fam } = await connected();
        const other = await registered();
        await expect(h.service.token(refreshForm(other, t.refresh_token))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        expect(h.store.familyDocs(fam).every((d) => d.revokedBy === 'client_mismatch')).toBe(true);
        await expect(h.service.token(refreshForm(cc.clientId, t.refresh_token))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        expect(h.audit.some((a) => a.event === 'oauth.client_mismatch')).toBe(true);
    });

    it('tokenVersion artisi (parola/rol degisimi/"tum oturumlari kapat"): yenileme reddedilir ve aile iptal olur', async () => {
        const { cc, t, fam } = await connected();
        h.identity.users.get('u1')!.tv = 1;
        await expect(h.service.token(refreshForm(cc.clientId, t.refresh_token))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        expect(h.store.familyDocs(fam).every((d) => d.revokedBy === 'tv')).toBe(true);
    });

    it('pasif kullanici / pasif tenant / silinen uyelik: yenileme reddedilir, aile iptal olur', async () => {
        for (const mutate of [
            () => { h.identity.users.get('u1')!.active = false; },
            () => { h.identity.users.get('u1')!.tenants.get(1)!.active = false; },
            () => { h.identity.users.get('u1')!.tenants.delete(1); },
        ]) {
            const { cc, t, fam } = await connected();
            mutate();
            await expect(h.service.token(refreshForm(cc.clientId, t.refresh_token))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
            expect(h.store.familyDocs(fam).every((d) => d.revokedAt)).toBe(true);
            h.identity.add('u1', [[1, 'Magaza Bir', 'owner']]);
        }
    });

    it('bosta 30 gun: dolunca reddedilir; her yenileme bosta sayacini sifirlar', async () => {
        const { cc, t } = await connected();
        h.advance(29 * DAY);
        const t2 = await h.service.token(refreshForm(cc.clientId, t.refresh_token));
        h.advance(29 * DAY);
        const t3 = await h.service.token(refreshForm(cc.clientId, t2.refresh_token)); // 58. gun, hala aktif (bosta 29 gun)
        h.advance(30 * DAY + 1000);
        await expect(h.service.token(refreshForm(cc.clientId, t3.refresh_token))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
    });

    it('mutlak 90 gun: surekli yenilense bile aile 90. gunde biter', async () => {
        const { cc, t } = await connected();
        let cur = t.refresh_token;
        for (let i = 0; i < 8; i++) { // 8 x 10 gun = 80 gun
            h.advance(10 * DAY);
            cur = (await h.service.token(refreshForm(cc.clientId, cur))).refresh_token;
        }
        h.advance(10 * DAY + 1000); // 90 gunu asar
        await expect(h.service.token(refreshForm(cc.clientId, cur))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
    });

    it('kapsam yalniz DARALTILIR; genisletme invalid_scope; daralma kalicidir', async () => {
        const { cc, t } = await connected();
        await expect(h.service.token(refreshForm(cc.clientId, t.refresh_token, { scope: 'mcp:read mcp:write admin' }))).rejects.toMatchObject({ oauthError: 'invalid_scope' });
        const t2 = await h.service.token(refreshForm(cc.clientId, t.refresh_token, { scope: 'mcp:read' }));
        expect(t2.scope).toBe('mcp:read');
        await expect(h.service.token(refreshForm(cc.clientId, t2.refresh_token, { scope: 'mcp:read mcp:write' }))).rejects.toMatchObject({ oauthError: 'invalid_scope' });
    });

    it('bilinmeyen/cop refresh invalid_grant; aile basina hiz siniri 429', async () => {
        const c = await registered();
        await expect(h.service.token(refreshForm(c, 'yok'))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        const lim = buildHarness({ familyLimit: () => false });
        lim.identity.add('u1', [[1, 'M', 'owner']]);
        const cc = await authorizeToCode(lim);
        const t = await lim.service.token(tokenForm(cc));
        await expect(lim.service.token(refreshForm(cc.clientId, t.refresh_token))).rejects.toMatchObject({ oauthError: 'rate_limited', status: 429 });
    });
});

describe('revoke (RFC 7009) ve iptal <= 60 sn', () => {
    async function connected() {
        const cc = await authorizeToCode(h);
        const t = await h.service.token(tokenForm(cc));
        return { cc, t, fam: verifyOAuthAccessToken(t.access_token, RESOURCE).fam };
    }

    it('refresh ile revoke TUM aileyi iptal eder; sonraki yenileme reddedilir; aile kapisi anlik kapanir', async () => {
        const { cc, t, fam } = await connected();
        expect(await h.gate.isActive(fam)).toBe(true);
        await h.service.revokeToken({ token: t.refresh_token, client_id: cc.clientId });
        expect(h.store.familyDocs(fam).every((d) => d.revokedBy === 'client')).toBe(true);
        expect(await h.gate.isActive(fam)).toBe(false);
        await expect(h.service.token(refreshForm(cc.clientId, t.refresh_token))).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        expect(h.audit.some((a) => a.event === 'oauth.revoke' && a.fam === fam)).toBe(true);
    });

    it('access token ile revoke de aileyi iptal eder', async () => {
        const { t, fam } = await connected();
        await h.service.revokeToken({ token: t.access_token });
        expect(h.store.familyDocs(fam).every((d) => d.revokedAt)).toBe(true);
    });

    it('bilinmeyen/cop/bos token icin sessiz basari (bilgi sizdirmaz, hata yok); baska istemci iptal edemez', async () => {
        const { cc, t, fam } = await connected();
        const other = await registered();
        await expect(h.service.revokeToken({ token: 'yok' })).resolves.toBeUndefined();
        await expect(h.service.revokeToken({ token: 'a.b.c' })).resolves.toBeUndefined();
        await expect(h.service.revokeToken({})).resolves.toBeUndefined();
        await expect(h.service.revokeToken({ token: t.refresh_token, client_id: other })).resolves.toBeUndefined();
        expect(h.store.familyDocs(fam).some((d) => d.revokedAt)).toBe(false);
        await h.service.revokeToken({ token: t.refresh_token, client_id: cc.clientId });
        expect(await h.gate.isActive(fam)).toBe(false);
    });

    it('iptal <= 60 sn etkili: baska surecteki onbellekli kapi en gec 60 sn sonra kapanir (kalici kayit revokedAt)', async () => {
        const { t, fam } = await connected();
        const peer = new FamilyGate(h.store, 60_000, () => h.clock.t); // baska replika
        expect(await peer.isActive(fam)).toBe(true);
        await h.service.revokeToken({ token: t.refresh_token });
        expect(await peer.isActive(fam)).toBe(true); // onbellekte
        h.advance(59_000);
        expect(await peer.isActive(fam)).toBe(true);
        h.advance(1_001);
        expect(await peer.isActive(fam)).toBe(false);
    });

    it('kullanici/tenant geneli iptal depo islemleri (MCP-2 hazirligi): revokeBySub / revokeByTenant aileleri kapatir', async () => {
        const { fam } = await connected();
        expect(await h.gate.isActive(fam)).toBe(true);
        expect(await h.store.revokeByTenant(1, 'admin', new Date(h.clock.t))).toBe(1);
        expect(await h.gate.isActive(fam)).toBe(true); // yerel LRU (60 sn) -- invalidate cagrilmadi
        h.advance(60_001);
        expect(await h.gate.isActive(fam)).toBe(false);
    });
});

describe('ConsentError', () => {
    it('durum + katalog kodu tasir', () => {
        const e = new ConsentError(403, 'MCP_TENANT_OFF');
        expect(e).toMatchObject({ status: 403, code: 'MCP_TENANT_OFF' });
        expect(oauthErr(e)).toBeUndefined();
    });
});
