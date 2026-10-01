/**
 * MCP-3: `/mcp` salt-okuma ucu (gercek Express + loopback; DB/Redis/ag YOK). Protokol el sikismasi, surum/Origin/boyut/yontem, 401 + resource_metadata,
 * iptal edilen aile, access off/read/readwrite, kapsam kesisimi, RBAC, 2 tenant izolasyonu, LIVE_READONLY/bakim/kill-switch/entitlement, PII ve sir
 * sizintisi yok, prompt-injection isaretleme, oran siniri/kota, denetim + metrik, impersonation yapisal yoklugu, sohbetle arac listesi esitligi.
 * Token'lar gercek OAuth akisindan (MCP-1) uretilir; arac yurutme `invokeCapability` -> sahte `run`.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import { metricsRegistry } from '../../../src/platform/runtime/metrics';
import { signOAuthAccessToken, OAUTH_KID_CURRENT } from '../../../src/platform/core/security/oauthTokens';
import { CAPABILITIES } from '../../../src/capabilities';
import { MAX_BODY_BYTES } from '../../../src/mcp/McpHttpAdapter';
import { FAMILY_PER_MINUTE, TENANT_PER_MINUTE, McpLimits } from '../../../src/mcp/McpLimits';
import { effectiveScopes } from '../../../src/mcp/McpAuth';
import { deriveTools } from '../../../src/operations/agent/tools';
import { setAccess, startMcp, RESOURCE, API, type McpHarness } from '../../helpers/mcpHarness';
import { config } from '../../../src/config';

let m: McpHarness;
let audit: Array<Record<string, any>> = [];
const flush = async () => { await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); };

const READ_TOOLS = ['integrations_health_get', 'orders_list', 'products_search', 'reports_sales_summary', 'stock_low_list'];
const ARGS: Record<string, unknown> = { products_search: { query: 'x' } };

beforeEach(async () => {
    audit = [];
    AuditLogger.setSink(async (r) => { audit.push(r); });
    metricsRegistry.drain();
    m = await startMcp({ u1: [[1, 'owner']], u2: [[2, 'owner']], op: [[1, 'operator']], adm: [[1, 'admin']] });
});
afterEach(async () => {
    await m.close();
    AuditLogger.setSink(undefined);
    jest.restoreAllMocks();
});

const body = async (r: Response) => (await r.json()) as any;

describe('protokol el sikismasi (durumsuz Streamable HTTP)', () => {
    it('initialize: surum muzakeresi, yalniz tools yetenegi, sabit talimat, OTURUM KIMLIGI YOK; notifications/initialized 202; ping', async () => {
        const c = await m.connect();
        const r = await m.rpc(c.token, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
        expect(r.status).toBe(200);
        expect(r.headers.get('content-type')).toMatch(/application\/json/);
        expect(r.headers.get('mcp-session-id')).toBeNull();
        const j = await body(r);
        expect(j).toMatchObject({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'entegrasyonik' } } });
        expect(Object.keys(j.result.capabilities)).toEqual(['tools']); // resources/prompts/sampling/completions YOK
        expect(j.result.instructions).toMatch(/DATA/);
        // eski surum aynen; bilinmeyen surum -> sunucunun en yenisi
        expect((await body(await m.rpc(c.token, 'initialize', { protocolVersion: '2025-06-18' }))).result.protocolVersion).toBe('2025-06-18');
        expect((await body(await m.rpc(c.token, 'initialize', { protocolVersion: '2099-01-01' }))).result.protocolVersion).toBe('2025-11-25');
        const n = await fetch(`${m.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${c.token}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
        expect(n.status).toBe(202);
        expect(await n.text()).toBe('');
        expect((await body(await m.rpc(c.token, 'ping'))).result).toEqual({});
    });

    it('tools/list (mcp:read baglantisi): YALNIZ okuma araclari (yazma araci listede yok), deterministik ad sirasi, inputSchema strict, outputSchema, annotations, ttl', async () => {
        const c = await m.connect({ scope: 'mcp:read' });
        const j = await body(await m.rpc(c.token, 'tools/list'));
        const names: string[] = j.result.tools.map((t: any) => t.name);
        expect(names).toEqual(READ_TOOLS);
        expect(names).not.toContain('orders_approve');
        for (const t of j.result.tools) {
            expect(t.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
            expect(t.outputSchema?.type).toBe('object');
            expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
            expect(typeof t.description).toBe('string');
        }
        expect(j.result._meta['com.entegrasyonik/ttlMs']).toBe(60_000);
        expect((await body(await m.rpc(c.token, 'tools/list'))).result.tools).toEqual(j.result.tools); // deterministik
        expect(j.result.tools.find((t: any) => t.name === 'orders_list').annotations.openWorldHint).toBe(false);
    });

    it('her core okuma araci icin tools/call: structuredContent (output semasi) + kisa metin ozeti + untrusted isareti; yurutme sahte run uzerinden', async () => {
        const c = await m.connect();
        for (const name of READ_TOOLS) {
            const { status, body: j } = await m.call(c.token, name, ARGS[name]);
            expect([name, status]).toEqual([name, 200]);
            expect([name, j.result.isError]).toEqual([name, undefined]);
            expect(j.result.structuredContent).toBeTruthy();
            const text = JSON.parse(j.result.content[0].text);
            expect(text).toMatchObject({ untrusted: true, source: name });
            expect(j.result._meta['com.entegrasyonik/untrusted'].untrusted).toBe(true);
        }
        expect(m.calls.map((x) => `${x.service}/${x.operation}`).sort()).toEqual([
            'IntegrationService/getIntegrationHealth', 'OrderService/getOrderDashboardInsights', 'OrderService/getOrders', 'ProductService/getProducts', 'StockService/listLowStock',
        ]);
    });

    it('bilinmeyen metot -32601 (resources/prompts/... YOK); gecersiz tools/call parametreleri -32602', async () => {
        const c = await m.connect();
        for (const method of ['resources/list', 'prompts/list', 'completion/complete', 'sampling/createMessage', 'tools/nope']) {
            expect((await body(await m.rpc(c.token, method))).error.code).toBe(-32601);
        }
        for (const params of [undefined, {}, { name: 5 }, { name: 'orders_list', arguments: [] }, { name: 'x'.repeat(200) }]) {
            expect((await body(await m.rpc(c.token, 'tools/call', params))).error.code).toBe(-32602);
        }
    });
});

describe('tasima: yontem, surum, Origin, boyut, govde', () => {
    it('GET/DELETE/PUT 405 + Allow; Mcp-Session-Id uretilmez', async () => {
        const c = await m.connect();
        for (const method of ['GET', 'DELETE', 'PUT']) {
            const r = await fetch(`${m.base}/mcp`, { method, headers: { authorization: `Bearer ${c.token}` } });
            expect(r.status).toBe(405);
            expect(r.headers.get('allow')).toMatch(/POST/);
        }
    });

    it('MCP-Protocol-Version: desteklenmeyen -> 400; desteklenenler ve basliksiz -> kabul', async () => {
        const c = await m.connect();
        const bad = await m.rpc(c.token, 'ping', undefined, { headers: { 'MCP-Protocol-Version': '2024-01-01' } });
        expect(bad.status).toBe(400);
        expect((await body(bad)).error).toMatch(/2025-11-25/);
        for (const v of ['2025-11-25', '2025-06-18', '2025-03-26']) expect((await m.rpc(c.token, 'ping', undefined, { headers: { 'MCP-Protocol-Version': v } })).status).toBe(200);
        expect((await m.rpc(c.token, 'ping')).status).toBe(200);
        // 2026-07-28 SDK kararli surumunde yok -> desteklenmez (versions.ts notu)
        expect((await m.rpc(c.token, 'ping', undefined, { headers: { 'MCP-Protocol-Version': '2026-07-28' } })).status).toBe(400);
    });

    it('Origin: izinli liste disi 403; izinli CORS basliklariyla; Origin yoksa denetim yok; preflight', async () => {
        const c = await m.connect();
        const evil = await m.rpc(c.token, 'ping', undefined, { headers: { Origin: 'https://evil.example.test' } });
        expect(evil.status).toBe(403);
        expect(evil.headers.get('access-control-allow-origin')).toBeNull();
        const ok = await m.rpc(c.token, 'ping', undefined, { headers: { Origin: 'https://app.example.test' } });
        expect(ok.status).toBe(200);
        expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example.test');
        expect(ok.headers.get('access-control-expose-headers')).toMatch(/WWW-Authenticate/);
        const pre = await fetch(`${m.base}/mcp`, { method: 'OPTIONS', headers: { Origin: 'https://app.example.test', 'Access-Control-Request-Method': 'POST' } });
        expect(pre.status).toBe(204);
        expect(pre.headers.get('access-control-allow-headers')).toMatch(/Authorization/);
        const preBad = await fetch(`${m.base}/mcp`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example.test', 'Access-Control-Request-Method': 'POST' } });
        expect(preBad.status).toBe(403);
        // yanlis Origin 401'den ONCE reddedilir (token gerekmez)
        expect((await m.rpc(undefined, 'ping', undefined, { headers: { Origin: 'https://evil.example.test' } })).status).toBe(403);
    });

    it('govde > 256 KB -> 413 PAYLOAD_TOO_LARGE; Content-Type json degil -> 415; bozuk JSON -> 400 -32700; batch -> 400 -32600; gecersiz zarf -> 400', async () => {
        const c = await m.connect();
        const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(MAX_BODY_BYTES + 10) } });
        const r413 = await m.rpc(c.token, 'ping', undefined, { raw: big });
        expect(r413.status).toBe(413);
        expect(await body(r413)).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
        const r415 = await fetch(`${m.base}/mcp`, { method: 'POST', headers: { 'content-type': 'text/plain', authorization: `Bearer ${c.token}` }, body: 'x' });
        expect(r415.status).toBe(415);
        const r400 = await m.rpc(c.token, 'ping', undefined, { raw: '{"jsonrpc":' });
        expect(r400.status).toBe(400);
        expect((await body(r400)).error.code).toBe(-32700);
        const batch = await m.rpc(c.token, 'ping', undefined, { raw: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]) });
        expect(batch.status).toBe(400);
        expect((await body(batch)).error.code).toBe(-32600);
        for (const raw of ['{}', '{"jsonrpc":"1.0","id":1,"method":"ping"}', '{"jsonrpc":"2.0","id":{"a":1},"method":"ping"}', '{"jsonrpc":"2.0","id":1}']) {
            expect([raw, (await m.rpc(c.token, 'ping', undefined, { raw })).status]).toEqual([raw, 400]);
        }
    });

    it('yanit > 256 KB: arac hatasi PAYLOAD_TOO_LARGE (kirpilmis veri gonderilmez); invoke sinirini asan veri de ayni', async () => {
        const c = await m.connect();
        const mk = (n: number) => ({ products: Array.from({ length: n }, (_, i) => ({ _id: `p${i}`, title: 'T'.repeat(1000), stockcode: 'S', barcode: 'B', stock: 1, prices: {}, variants: [] })), totalNumberOfRecords: n });
        m.st.raw = () => mk(400); // veri tek basina > 256 KB -> invokeCapability reddeder
        let r = await m.call(c.token, 'products_search', { query: 'x' });
        expect(r.body.result.isError).toBe(true);
        expect(r.body.result._meta['com.entegrasyonik/error'].code).toBe('PAYLOAD_TOO_LARGE');
        m.st.raw = () => mk(235); // veri < 256 KB ama veri + metin ozeti + zarf > 256 KB -> adaptor siniri
        r = await m.call(c.token, 'products_search', { query: 'x' });
        expect(r.body.result.isError).toBe(true);
        expect(r.body.result._meta['com.entegrasyonik/error'].code).toBe('PAYLOAD_TOO_LARGE');
        expect(JSON.stringify(r.body).length).toBeLessThan(2000);
    });
});

describe('kimlik: 401 + resource_metadata, aud/sir karisimi, iptal, tv, tenant, kapali yuzey', () => {
    const META = `${API}/.well-known/oauth-protected-resource/mcp`;

    it('token yok -> 401 + WWW-Authenticate: Bearer resource_metadata=...; gecersiz token -> + error="invalid_token"', async () => {
        const none = await m.rpc(undefined, 'ping');
        expect(none.status).toBe(401);
        expect(none.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${META}"`);
        expect(await body(none)).toMatchObject({ code: 'UNAUTHENTICATED' });
        const bad = await m.rpc('not-a-token', 'ping');
        expect(bad.status).toBe(401);
        expect(bad.headers.get('www-authenticate')).toBe(`Bearer error="invalid_token", resource_metadata="${META}"`);
        const basic = await fetch(`${m.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Basic abc' }, body: '{}' });
        expect(basic.status).toBe(401);
    });

    it('web cerezi JWT (JWT_SECRET, aud web) ve yanlis aud/yanlis sir/imp-ga iddiali token /mcp\'de 401', async () => {
        const c = await m.connect();
        const web = jwt.sign({ sub: 'u1', tid: 1, tv: 0, ga: false, imp: false }, process.env.JWT_SECRET as string, { algorithm: 'HS256', issuer: config.auth.jwtIssuer, audience: 'web', expiresIn: 600 });
        expect((await m.rpc(web, 'ping')).status).toBe(401);
        const apiAud = signOAuthAccessToken({ sub: 'u1', tid: 1, tv: 0, cid: c.clientId, scope: ['mcp:read'], fam: c.fam, aud: 'https://api.example.test/api' });
        expect((await m.rpc(apiAud, 'ping')).status).toBe(401);
        const secret = config.mcp.oauthSecret as string;
        const forge = (extra: object, key = secret) => jwt.sign({ sub: 'u1', tid: 1, tv: 0, cid: c.clientId, scope: 'mcp:read', fam: c.fam, ...extra }, key, { algorithm: 'HS256', keyid: OAUTH_KID_CURRENT, issuer: config.auth.jwtIssuer, audience: RESOURCE, expiresIn: 600 });
        expect((await m.rpc(forge({}), 'ping')).status).toBe(200); // kontrol: imzali gecerli token geciyor
        expect((await m.rpc(forge({ imp: true, impBy: 'admin1' }), 'ping')).status).toBe(401); // impersonation yapisal olarak yok
        expect((await m.rpc(forge({ ga: true }), 'ping')).status).toBe(401);
        expect((await m.rpc(forge({}, 'x'.repeat(48)), 'ping')).status).toBe(401);
    });

    it('impersonation yapisal olarak yok: yurutmeye giden principal daima ga:false/imp:false ve tenant yalniz token\'dan', async () => {
        const c = await m.connect();
        await m.call(c.token, 'orders_list');
        expect(m.calls[0].principal).toMatchObject({ sub: 'u1', tid: 1, ga: false, imp: false });
        const claims = jwt.decode(c.token) as Record<string, unknown>;
        expect('imp' in claims || 'ga' in claims).toBe(false);
    });

    it('iptal edilen aile: kapi invalidate edilince ANINDA, edilmediyse <= 60 sn sonra 401', async () => {
        const c = await m.connect();
        expect((await m.rpc(c.token, 'ping')).status).toBe(200);
        await m.h.store.revokeFamily(c.fam, 'user', new Date(m.h.clock.t));
        expect((await m.rpc(c.token, 'ping')).status).toBe(200); // 60 sn onbellek penceresi (diger replika durumu)
        m.h.advance(61_000);
        const r = await m.rpc(c.token, 'ping');
        expect(r.status).toBe(401);
        expect(r.headers.get('www-authenticate')).toMatch(/invalid_token/);
        const c2 = await m.connect();
        expect((await m.rpc(c2.token, 'ping')).status).toBe(200);
        await m.h.store.revokeFamily(c2.fam, 'user', new Date(m.h.clock.t));
        m.h.gate.invalidate(c2.fam); // iptal eden surec: anlik
        expect((await m.rpc(c2.token, 'ping')).status).toBe(401);
    });

    it('tv artisi (parola/rol degisimi/tum oturumlari kapat) 401; uyelik dusmesi 403; tenant aktif degil 403; kullanici pasif 401', async () => {
        const c = await m.connect();
        expect((await m.rpc(c.token, 'ping')).status).toBe(200);
        m.h.identity.users.get('u1')!.tv = 1;
        expect((await m.rpc(c.token, 'ping')).status).toBe(401);
        m.h.identity.users.get('u1')!.tv = 0;
        m.st.inactiveTenants.add(1);
        expect((await m.rpc(c.token, 'ping')).status).toBe(403);
        m.st.inactiveTenants.clear();
        m.h.identity.users.get('u1')!.tenants.get(1)!.active = false; // uyelik askida
        expect((await m.rpc(c.token, 'ping')).status).toBe(403);
    });

    it('MCP_ENABLED=false -> 404 (yuzey kapali); Redis yoksa kimlikli istek 503 + Retry-After, kimliksiz istek 401 (kesif calisir)', async () => {
        const c = await m.connect();
        m.st.redis = false;
        const r = await m.rpc(c.token, 'ping');
        expect(r.status).toBe(503);
        expect(r.headers.get('retry-after')).toBeTruthy();
        expect((await m.rpc(undefined, 'ping')).status).toBe(401);
        m.st.redis = true;
        m.st.enabled = false;
        const off = await m.rpc(c.token, 'ping');
        expect(off.status).toBe(404);
        expect(await body(off)).toMatchObject({ code: 'NOT_FOUND' });
    });
});

describe('tenant ayari (mcp.access) ve kapsam kesisimi', () => {
    it('access=off -> 403 MCP_TENANT_OFF (HER cagrida yeniden okunur: acikken calisan baglanti kapaninca aninda reddedilir, acilinca devam eder)', async () => {
        const c = await m.connect();
        expect((await m.rpc(c.token, 'tools/list')).status).toBe(200);
        setAccess('off');
        const r = await m.rpc(c.token, 'tools/list');
        expect(r.status).toBe(403);
        expect(await body(r)).toMatchObject({ code: 'MCP_TENANT_OFF' });
        expect(r.headers.get('www-authenticate')).toBeNull();
        setAccess('read');
        expect((await m.rpc(c.token, 'tools/list')).status).toBe(200);
    });

    it('tenant bazinda: A acik, B kapali (ayni kullanici baglantilari birbirini etkilemez)', async () => {
        setAccess((tid) => (tid === 1 ? 'read' : 'off'));
        const a = await m.connect({ sub: 'u1', tid: 1 });
        const b = await m.connect({ sub: 'u2', tid: 2 }).catch(() => undefined); // onay karari tenant kapali -> 403 (MCP-1); baglanti kurulamaz
        expect(b).toBeUndefined();
        expect((await m.rpc(a.token, 'ping')).status).toBe(200);
    });

    it('access=read + token mcp:write: yazma YOK (MCP-2 notu): yazma araci listede degil, cagri INSUFFICIENT_SCOPE, servis sifir cagri; readwrite + mcp:write listeler (MCP-4; yurutme yine onaysiz yok)', async () => {
        const c = await m.connect({ scope: 'mcp:read mcp:write' });
        setAccess('read');
        expect(await m.list(c.token)).not.toContain('orders_approve');
        const { body: j } = await m.call(c.token, 'orders_approve', { orderIds: ['ZZORD-1'] });
        expect(j.result.isError).toBe(true);
        expect(j.result._meta['com.entegrasyonik/error'].code).toBe('INSUFFICIENT_SCOPE');
        setAccess('readwrite');
        expect(await m.list(c.token)).toContain('orders_approve');
        expect(m.calls).toEqual([]); // yurutme/servis cagrisi YOK
    });

    it('effectiveScopes tavani: token ∩ tenant (off bos, read yazmayi dusurur, readwrite aynen)', async () => {
        expect(effectiveScopes(['mcp:read', 'mcp:write'], 'off')).toEqual([]);
        expect(effectiveScopes(['mcp:read', 'mcp:write'], 'read')).toEqual(['mcp:read']);
        expect(effectiveScopes(['mcp:read', 'mcp:write'], 'readwrite')).toEqual(['mcp:read', 'mcp:write']);
        expect(effectiveScopes(['mcp:write'], 'read')).toEqual([]);
    });

    it('yalniz mcp:write kapsamli token (read yok) tenant=read iken 403 insufficient_scope', async () => {
        const c = await m.connect({ scope: 'mcp:read mcp:write' });
        const only = signOAuthAccessToken({ sub: 'u1', tid: 1, tv: 0, cid: c.clientId, scope: ['mcp:write'], fam: c.fam, aud: RESOURCE });
        setAccess('read');
        const r = await m.rpc(only, 'tools/list');
        expect(r.status).toBe(403);
        expect(r.headers.get('www-authenticate')).toMatch(/insufficient_scope/);
        expect(await body(r)).toMatchObject({ code: 'INSUFFICIENT_SCOPE' });
    });
});

describe('RBAC, entitlement, kill-switch, LIVE_READONLY, bakim', () => {
    it('RBAC matrisi: operator integrations_health_get GORMEZ (admin kademesi); admin/owner gorur; zorla cagri isError ve servis cagrisi yok', async () => {
        const op = await m.connect({ sub: 'op', scope: 'mcp:read' });
        expect(await m.list(op.token)).toEqual(['orders_list', 'products_search', 'reports_sales_summary', 'stock_low_list']);
        const forced = await m.call(op.token, 'integrations_health_get');
        expect(forced.body.result.isError).toBe(true);
        expect(forced.body.result._meta['com.entegrasyonik/error'].code).toBe('CAPABILITY_DISABLED');
        expect(m.calls).toEqual([]);
        const adm = await m.connect({ sub: 'adm', scope: 'mcp:read' });
        expect(await m.list(adm.token)).toEqual(READ_TOOLS);
    });

    it('kill-switch (disabledCapabilities): kapatilan arac listede yok, zorla cagri isError; LIVE_READONLY ve bakimda OKUMA calisir', async () => {
        const c = await m.connect({ scope: 'mcp:read' });
        m.st.disabled = new Set(['orders.list']);
        expect(await m.list(c.token)).not.toContain('orders_list');
        expect((await m.call(c.token, 'orders_list')).body.result.isError).toBe(true);
        m.st.disabled = new Set();
        m.st.liveReadonly = true;
        expect(await m.list(c.token)).toEqual(READ_TOOLS);
        expect((await m.call(c.token, 'orders_list')).body.result.isError).toBeUndefined();
        m.st.liveReadonly = false;
        m.st.maintenance = true;
        expect(await m.list(c.token)).toEqual(READ_TOOLS);
        expect((await m.call(c.token, 'reports_sales_summary')).body.result.isError).toBeUndefined();
        // yazma araci ne LIVE_READONLY ne bakim ne kapali durumlarda listelenir / calisir
        m.st.maintenance = false;
        expect((await m.call(c.token, 'orders_approve', { orderIds: ['A1'] })).body.result.isError).toBe(true);
        expect(m.calls.some((x) => x.operation === 'approveOrders' || /approve/i.test(x.operation))).toBe(false);
    });

    it('entitlement reddi (abonelik): liste bos, zorla cagri isError', async () => {
        const c = await m.connect();
        m.st.entitled = () => false;
        expect(await m.list(c.token)).toEqual([]);
        expect((await m.call(c.token, 'orders_list')).body.result.isError).toBe(true);
        expect(m.calls).toEqual([]);
    });

    it('sohbetle arac listesi ESITLIGI (P10 okuma kismi): ayni aktor/ortam icin MCP listesi = sohbet listesinin okuma alt kumesi (3 rol)', async () => {
        const env = { liveReadonly: false, maintenance: false, disabled: new Set<string>(), imp: false };
        for (const tier of ['member', 'admin', 'owner'] as const) {
            const chat = deriveTools({ actor: { tier }, env, surface: 'chat' }).filter((t) => t.effect === 'read').map((t) => t.name);
            const mcp = deriveTools({ actor: { tier }, env, surface: 'mcp' }).map((t) => t.name);
            expect([tier, mcp]).toEqual([tier, chat]);
        }
        // uc nokta: ayni roller HTTP'de de ayni
        const adm = await m.connect({ sub: 'adm', scope: 'mcp:read' });
        expect(await m.list(adm.token)).toEqual(deriveTools({ actor: { tier: 'admin' }, env, surface: 'chat' }).filter((t) => t.effect === 'read').map((t) => t.name));
    });

    it('arac aciklamalari yalniz kayittan (tenant verisi yok): her aciklama kayittaki llm.description ile baslar ve veri icermez', async () => {
        const c = await m.connect({ sub: 'adm', scope: 'mcp:read' });
        await m.call(c.token, 'orders_list'); // tenant verisi yurutmede dolasimda
        const j = await body(await m.rpc(c.token, 'tools/list'));
        for (const t of j.result.tools) {
            const cap = CAPABILITIES.find((x) => x.id.replace(/\./g, '_') === t.name)!;
            expect(t.description).toBe(cap.llm!.description);
            expect(JSON.stringify(t)).not.toMatch(/T1-1001|Urun t1|ord-t1/);
        }
        expect(JSON.stringify(j)).not.toMatch(/Ayşe|T1-1001/);
    });
});

describe('tenant izolasyonu (2 tenant)', () => {
    it('A token\'i ile yalniz A verisi; B token\'i ile yalniz B; servise giden tenant yalniz token\'dan', async () => {
        const a = await m.connect({ sub: 'u1', tid: 1 });
        const b = await m.connect({ sub: 'u2', tid: 2 });
        const ra = JSON.stringify((await m.call(a.token, 'orders_list')).body);
        const rb = JSON.stringify((await m.call(b.token, 'orders_list')).body);
        expect(ra).toMatch(/T1-1001/);
        expect(ra).not.toMatch(/T2-1001/);
        expect(rb).toMatch(/T2-1001/);
        expect(rb).not.toMatch(/T1-1001/);
        expect(m.calls.map((x) => x.tid)).toEqual([1, 2]);
        expect(JSON.stringify((await m.call(a.token, 'products_search', { query: 'x' })).body)).not.toMatch(/p-t2/);
    });

    it('arac girdisinde tenantId/userId/tid benzeri alan strict semayla reddedilir (VALIDATION), servis cagrisi yok', async () => {
        const a = await m.connect({ sub: 'u1', tid: 1 });
        for (const extra of [{ tenantId: 2 }, { tid: 2 }, { order: 2 }, { clientId: 2 }, { userId: 'u2' }]) {
            const { body: j } = await m.call(a.token, 'orders_list', extra);
            expect(j.result.isError).toBe(true);
            expect(j.result._meta['com.entegrasyonik/error'].code).toBe('VALIDATION');
        }
        expect(m.calls).toEqual([]);
    });

    it('baglanti tek tenant\'a bagli: u1 token\'i tid=1 iken u1\'in tid=2 uyeligi yoksa baska tenant\'a erisemez (token tid\'si degistirilemez)', async () => {
        const a = await m.connect({ sub: 'u1', tid: 1 });
        const forged = signOAuthAccessToken({ sub: 'u1', tid: 2, tv: 0, cid: a.clientId, scope: ['mcp:read'], fam: a.fam, aud: RESOURCE });
        expect((await m.rpc(forged, 'ping')).status).toBe(403); // u1'in tenant 2 uyeligi yok
    });
});

describe('PII ve sir sizintisi, prompt-injection isaretleme', () => {
    it('musteri PII (tam ad/e-posta/telefon) hicbir MCP yanitinda yok, yalniz maskeli ad; apiKey/enc:v1 yok', async () => {
        const c = await m.connect({ sub: 'adm' });
        const o = await m.call(c.token, 'orders_list');
        const s = JSON.stringify(o.body);
        for (const leak of ['Ayşe', 'Yılmaz', 'ayse.yilmaz', '05551234567', 'customerEmail']) expect(s).not.toContain(leak);
        expect(o.body.result.structuredContent.items[0].customer).toMatch(/\*/);
        const h = JSON.stringify((await m.call(c.token, 'integrations_health_get')).body);
        expect(h).not.toMatch(/enc:v1|LEAK|apiKey/);
    });

    it('arac sonucu VERI olarak isaretli: serbest metin alanlari untrustedFields; enjeksiyon metni yalniz veri icinde; sunucu talimat uretmez', async () => {
        const c = await m.connect();
        const { body: j } = await m.call(c.token, 'orders_list');
        const env = JSON.parse(j.result.content[0].text);
        expect(env.untrusted).toBe(true);
        expect(env.untrustedFields).toEqual(expect.arrayContaining(['items[].customer', 'items[].tracking']));
        expect(j.result._meta['com.entegrasyonik/untrusted'].fields).toEqual(env.untrustedFields);
        // enjeksiyon dizgisi veride duruyor ama yalniz `data` alaninda (sunucu kendi metnine katmaz)
        expect(JSON.stringify(env.data)).toMatch(/Ignore previous instructions/);
        expect(JSON.stringify({ ...env, data: undefined })).not.toMatch(/Ignore previous/);
        expect(j.result.content).toHaveLength(1);
    });

    it('hata iletisi ham hata/yigin/ic ad sizdirmaz (beklenmeyen servis hatasi -> genel INTERNAL + destek kodu)', async () => {
        const c = await m.connect();
        m.st.raw = () => { throw new Error('MongoServerError: secret connection mongodb://user:pw@host/db at /srv/app/x.ts:12'); };
        const { body: j } = await m.call(c.token, 'orders_list');
        expect(j.result.isError).toBe(true);
        const s = JSON.stringify(j);
        expect(s).not.toMatch(/mongodb|MongoServerError|\/srv|\.ts:|pw@/);
        expect(j.result._meta['com.entegrasyonik/error'].code).toBe('INTERNAL');
    });

    it('token/kod hicbir yanitta ve denetim satirinda yok', async () => {
        const c = await m.connect();
        const r1 = await m.rpc('bad.token.value', 'ping');
        await m.call(c.token, 'orders_list');
        await flush();
        expect(JSON.stringify(await body(r1))).not.toContain('bad.token.value');
        expect(JSON.stringify(audit)).not.toContain(c.token);
    });
});

describe('oran siniri ve kota', () => {
    it('baglanti basina 60/dk: 61. tools/call isError RATE_LIMITED + retryAfterSec + Retry-After; pencere sonunda yeniden acilir', async () => {
        const c = await m.connect();
        for (let i = 0; i < FAMILY_PER_MINUTE; i++) expect((await m.call(c.token, 'reports_sales_summary')).body.result.isError).toBeUndefined();
        const r = await m.rpc(c.token, 'tools/call', { name: 'reports_sales_summary', arguments: {} });
        expect(r.status).toBe(200);
        expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
        const j = await body(r);
        expect(j.result.isError).toBe(true);
        expect(j.result._meta['com.entegrasyonik/error']).toMatchObject({ code: 'RATE_LIMITED' });
        expect(j.result._meta['com.entegrasyonik/error'].retryAfterSec).toBeGreaterThan(0);
        // diger metotlar HTTP 429
        const l = await m.rpc(c.token, 'tools/list');
        expect(l.status).toBe(429);
        expect(l.headers.get('retry-after')).toBeTruthy();
        m.h.advance(61_000);
        expect((await m.rpc(c.token, 'tools/list')).status).toBe(200);
    });

    it('tenant basina 300/dk: bir baglanti 60 sinirina varmadan bile tenant kovasi dolunca digerleri de RATE_LIMITED (baska tenant etkilenmez)', async () => {
        m.h.identity.add('u3', [[1, 'T1', 'owner']]);
        const conns = [] as Awaited<ReturnType<typeof m.connect>>[];
        for (let i = 0; i < 6; i++) conns.push(await m.connect({ sub: 'u1', tid: 1 }));
        for (let i = 0; i < 5; i++) for (let k = 0; k < 60; k++) expect((await m.rpc(conns[i].token, 'ping')).status).toBe(200);
        expect(FAMILY_PER_MINUTE * 5).toBe(TENANT_PER_MINUTE);
        expect((await m.rpc(conns[5].token, 'ping')).status).toBe(429); // 6. baglanti ilk istekte tenant kovasi dolu
        const other = await m.connect({ sub: 'u2', tid: 2 });
        expect((await m.rpc(other.token, 'ping')).status).toBe(200); // baska tenant etkilenmez
    });

    it('plan gunluk kota (mcpCallsPerDay): asinca tools/call isError QUOTA_EXCEEDED + retryAfterSec; tools/list sayilmaz', async () => {
        const c = await m.connect();
        m.st.dailyLimit = 3;
        await m.rpc(c.token, 'tools/list');
        for (let i = 0; i < 3; i++) expect((await m.call(c.token, 'reports_sales_summary')).body.result.isError).toBeUndefined();
        const j = (await m.call(c.token, 'reports_sales_summary')).body;
        expect(j.result.isError).toBe(true);
        expect(j.result._meta['com.entegrasyonik/error']).toMatchObject({ code: 'QUOTA_EXCEEDED' });
        expect(j.result._meta['com.entegrasyonik/error'].retryAfterSec).toBeGreaterThan(0);
        expect((await m.rpc(c.token, 'tools/list')).status).toBe(200);
    });

    it('McpLimits: rateCost carpani kovayi hizli doldurur (cost=5 -> 12. cagri 60 asar)', async () => {
        const lim = new McpLimits({ kv: m.kv, now: () => m.h.clock.t });
        for (let i = 0; i < 12; i++) expect((await lim.hit('famX', 9, 5)).ok).toBe(true);
        expect((await lim.hit('famX', 9, 5)).ok).toBe(false);
    });
});

describe('denetim + metrik', () => {
    it('her tools/call (okuma dahil) denetlenir: surface mcp, event mcp.tool_call, sub/tid/clientId/fam/capabilityId/outcome; parametre DEGERI yok', async () => {
        const c = await m.connect({ scope: 'mcp:read' });
        await m.call(c.token, 'products_search', { query: 'GIZLI-ARAMA-DEGERI' });
        await m.call(c.token, 'orders_list', { tenantId: 9 }); // VALIDATION
        await m.call(c.token, 'orders_approve', { orderIds: ['A1'] }); // denied
        await flush();
        const rows = audit.filter((r) => r.event === 'mcp.tool_call');
        expect(rows).toHaveLength(3);
        expect(rows.every((r) => r.surface === 'mcp' && r.sub === 'u1' && r.tid === 1 && r.meta.clientId === c.clientId && r.meta.fam === c.fam)).toBe(true);
        expect(rows.map((r) => r.meta.outcome)).toEqual(['ok', 'error', 'denied']);
        expect(rows[0].meta).toMatchObject({ capabilityId: 'products.search', params: 'query' });
        expect(JSON.stringify(rows)).not.toContain('GIZLI-ARAMA-DEGERI');
        expect(rows[0].actorType).toBe('user');
    });

    it('metrikler: mcp_requests_total{method,outcome} (sinirli etiket), agent_tool_calls_total{surface=mcp}', async () => {
        const c = await m.connect();
        await m.rpc(c.token, 'initialize', { protocolVersion: '2025-11-25' });
        await m.call(c.token, 'orders_list');
        await m.rpc(undefined, 'ping');
        await m.rpc(c.token, 'weird/method');
        const s = metricsRegistry.drain();
        const by = (metric: string) => s.filter((x) => x.metric === metric).map((x) => `${Object.entries(x.labels).sort().map(([k, v]) => `${k}=${v}`).join(',')}#${x.count}`).sort();
        expect(by('mcp_requests_total')).toEqual(['method=http,outcome=unauthorized#1', 'method=initialize,outcome=ok#1', 'method=other,outcome=bad_request#1', 'method=tools/call,outcome=ok#1']);
        expect(by('agent_tool_calls_total')).toEqual(['capabilityId=orders.list,outcome=ok,surface=mcp#1']);
    });
});

describe('kayit disiplini (statik)', () => {
    it('src/mcp: RunOperation/yetenek alanlarina dogrudan dokunmaz, kopya arac listesi/izin tablosu yok (yalniz ortak turetim)', () => {
        const fs = require('fs') as typeof import('fs');
        const path = require('path') as typeof import('path');
        const dir = path.resolve(__dirname, '../../../src/mcp');
        const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); // yorumlar disinda
        expect(src).not.toMatch(/RunOperation|runOperation/);
        expect(src).not.toMatch(/capabilities\/domains/);
        expect(src).not.toMatch(/'(orders|products|stock|integrations|reports)\.[a-z_.]+'/); // sabit arac kimligi listesi yok
    });
});
