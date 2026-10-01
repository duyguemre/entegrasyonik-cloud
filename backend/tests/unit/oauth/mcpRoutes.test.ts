/**
 * MCP-2: `/api/mcp/*` (gercek Express + loopback; DB/Redis YOK): ayar GET/PUT (yalniz sahip, onay 422), bagli uygulamalar liste/iptal/tumunu kes
 * (kendi / users:manage, tenant izolasyonu, iptal anlik), impersonation'da HEPSI 403, MCP kapaliyken 404, gercek ayar okuyucusunun onay kararina baglanmasi,
 * yeni baglanti bildirim kancasi, bakimda iptalin acik olmasi, SettingService `mcp` alanini okutmaz/yazdirmaz.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import bodyParser from 'body-parser';
import express from 'express';
import type http from 'http';
import type { AddressInfo } from 'net';
import { configureMcpRoutes } from '../../../src/api/http/mcpRoutes';
import { errorHandler, notFoundHandler } from '../../../src/api/http/errorEnvelope';
import { isMaintenanceBlocked } from '../../../src/api/http/maintenanceGuard';
import { ConnectionsService } from '../../../src/api/oauth/connections';
import { getMcpAccess } from '../../../src/api/oauth/tenantAccess';
import { ConsentError, type ConnectedEvent } from '../../../src/api/oauth/service';
import { McpSettingsService, MCP_TRANSFER_TEXT_VERSION, type McpSettingsStore, type StoredMcpSettings } from '../../../src/operations/mcp/mcpSettings';
import { ROLE_PERMISSIONS, type Role } from '../../../src/capabilities/roles';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import { getDefinition } from '../../../src/operations/notifications/catalog';
import { renderNotification } from '../../../src/operations/notifications/templates/render';
import SettingService from '../../../src/api/services/setting-service';
import { sha256Hex } from '../../../src/platform/core/security/oauthTokens';
import { McpApprovals } from '../../../src/operations/mcp/mcpApprovals';
import { MemoryKv } from '../../../src/operations/agent/kv';
import { API, APP, RESOURCE, authorizeToCode, buildHarness, pkce, setMcpEnv, session, type Harness } from '../../helpers/oauthHarness';

class MemStore implements McpSettingsStore {
    docs = new Map<number, StoredMcpSettings>();
    async read(tid: number) { const d = this.docs.get(tid); return d ? JSON.parse(JSON.stringify(d)) : undefined; }
    async write(tid: number, v: StoredMcpSettings) { this.docs.set(tid, JSON.parse(JSON.stringify(v))); }
}

let restore: () => void; let h: Harness; let server: http.Server; let base: string; let enabled = true;
let settingsStore: MemStore; let settings: McpSettingsService; let connections: ConnectionsService;
let audit: any[]; let connected: ConnectedEvent[];
// MCP-4 onay servisi: bu dosyada yalniz bos-liste/izolasyon (ayrintili senaryolar tests/unit/mcp/mcpApprovals.test.ts)
const approvals = new McpApprovals({
    kv: () => new MemoryKv(), tools: { list: async () => [], validate: (_c: string, i: unknown) => i, invoke: async () => { throw new Error('yok'); }, versionOf: () => undefined },
    isMaintenance: () => false, familyActive: async () => true, access: async () => 'readwrite', clientName: async () => undefined, notify: async () => undefined, appOrigin: () => APP,
});

const EMAILS: Record<string, string> = { 'u-owner': 'sahip@example.test', 'u-admin': 'yonetici@example.test', 'u-op': 'operator@example.test', 'u-b': 'b@example.test' };

async function start() {
    const app = express();
    app.use(bodyParser.json());
    app.use((req, res, next) => { // `authenticate` yerine: x-test-principal = { sub, tid, role, imp?, ga? }
        const raw = req.headers['x-test-principal'];
        if (typeof raw === 'string') {
            const p = JSON.parse(raw) as { sub: string; tid?: number; role: Role; imp?: boolean; ga?: boolean };
            res.locals.principal = { sub: p.sub, tid: p.tid, imp: p.imp, ga: p.ga };
            res.locals.actor = { sub: p.sub, tid: p.tid, role: p.role, permissions: ROLE_PERMISSIONS[p.role], imp: p.imp === true, actorType: 'user' };
        }
        next();
    });
    configureMcpRoutes(app, '/api', { settings: () => settings, connections: () => connections, approvals: () => approvals, enabled: () => enabled, serverUrl: () => RESOURCE });
    app.use(notFoundHandler);
    app.use(errorHandler);
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
    restore = setMcpEnv(); enabled = true; audit = []; connected = [];
    AuditLogger.setSink(async (r) => { audit.push(r); });
    h = buildHarness({ onConnected: (e) => { connected.push(e); } });
    h.identity.add('u-owner', [[1, 'Magaza Bir', 'owner']]);
    h.identity.add('u-admin', [[1, 'Magaza Bir', 'admin']]);
    h.identity.add('u-op', [[1, 'Magaza Bir', 'operator']]);
    h.identity.add('u-b', [[2, 'Magaza Iki', 'owner']]);
    settingsStore = new MemStore();
    settings = new McpSettingsService({ store: settingsStore, userEmail: async (id) => EMAILS[id] });
    connections = new ConnectionsService({
        store: h.store, gate: h.gate, now: () => h.clock.t,
        tenantName: async (tid) => (tid === 1 ? 'Magaza Bir' : 'Magaza Iki'),
        userEmails: async (ids) => new Map(ids.map((i) => [i, EMAILS[i] ?? ''])),
    });
    await start();
});
afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    restore(); AuditLogger.setSink(undefined);
});

const who = (sub: string, tid: number, role: Role, extra: object = {}) => ({ 'x-test-principal': JSON.stringify({ sub, tid, role, ...extra }) });
const OWNER = who('u-owner', 1, 'owner'); const ADMIN = who('u-admin', 1, 'admin'); const OP = who('u-op', 1, 'operator'); const B_OWNER = who('u-b', 2, 'owner');
/** Govdeyi hemen tamponlar (okunmamis govde keep-alive baglantiyi acik tutup server.close'u kilitler). */
const call = async (method: string, path: string, headers: Record<string, string> = {}, body?: unknown) => {
    const r = await fetch(base + '/api/mcp' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await r.text();
    return { status: r.status, headers: r.headers, json: async () => (text ? JSON.parse(text) : undefined) };
};
const open = async (sub: string, tid: number) => { // sunucu tarafi: baglanti kur (DCR -> onay -> token)
    const c = await authorizeToCode(h, { sub, tid });
    return h.service.token({ grant_type: 'authorization_code', client_id: c.clientId, code: c.code, redirect_uri: c.redirectUri, code_verifier: c.verifier, resource: RESOURCE });
};
const enableAll = async () => { for (const t of [1, 2]) await settings.save({ tid: t, userId: t === 1 ? 'u-owner' : 'u-b', isOwner: true, imp: false }, { access: 'readwrite', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION }); };

describe('ayar uclari', () => {
    it('GET: her uye okur (serverUrl dahil), canEdit yalniz sahipte; varsayilan off', async () => {
        const r = await call('GET', '/settings', OP);
        expect(r.status).toBe(200);
        expect(r.headers.get('cache-control')).toBe('no-store');
        expect(await r.json()).toMatchObject({ access: 'off', consent: null, consentOutdated: false, canEdit: false, serverUrl: RESOURCE, activeConnections: 0, currentText: { textVersion: 'mcp-v1' } });
        expect((await (await call('GET', '/settings', OWNER)).json() as any).canEdit).toBe(true);
    });
    it('PUT: admin 403 FORBIDDEN; sahip onaysiz 422; sahip onayli 200 ve onay ozeti; sonra onay kaydi e-postasi gorunur', async () => {
        const a = await call('PUT', '/settings', ADMIN, { access: 'read', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION });
        expect([a.status, (await a.json() as any).code]).toEqual([403, 'FORBIDDEN']);
        const n = await call('PUT', '/settings', OWNER, { access: 'read' });
        expect([n.status, (await n.json() as any).code]).toEqual([422, 'VALIDATION']);
        const ok = await call('PUT', '/settings', OWNER, { access: 'readwrite', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION });
        expect(ok.status).toBe(200);
        expect(await ok.json()).toMatchObject({ access: 'readwrite', consent: { textVersion: 'mcp-v1', byEmail: 'sahip@example.test' }, canEdit: true });
        expect((await (await call('GET', '/settings', OP)).json() as any).access).toBe('readwrite');
    });
    it('PUT govdesinde tenant alani yok sayilir (tenant yalniz oturumdan)', async () => {
        await call('PUT', '/settings', OWNER, { access: 'read', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION, tid: 2, tenantId: 2 });
        expect(settingsStore.docs.has(2)).toBe(false);
        expect(settingsStore.docs.get(1)?.access).toBe('read');
    });
    it('gercek ayar okuyucusu onay kararina baglanir: off -> MCP_TENANT_OFF; sahip acinca onay verilir; readwrite degilse mcp:write dusurulur', async () => {
        expect(await getMcpAccess(1)).toBe('off');
        const c0 = await (async () => {
            const reg = await h.service.register({ redirect_uris: ['https://client.example.test/callback'], scope: 'mcp:read mcp:write' }) as { client_id: string };
            return reg.client_id;
        })();
        const authz = async () => {
            const out = await h.service.authorize({ response_type: 'code', client_id: c0, redirect_uri: 'https://client.example.test/callback', code_challenge: pkce().challenge, code_challenge_method: 'S256', state: 's', resource: RESOURCE, scope: 'mcp:read mcp:write' });
            if (out.type !== 'redirect') throw new Error('redirect bekleniyordu');
            return new URL(out.url).searchParams.get('req') as string;
        };
        await expect(h.service.decide(await authz(), session('u-owner'), { approve: true, tid: 1 })).rejects.toMatchObject({ code: 'MCP_TENANT_OFF' } satisfies Partial<ConsentError>);
        await call('PUT', '/settings', OWNER, { access: 'read', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION });
        expect(await getMcpAccess(1)).toBe('read');
        const view = await h.service.getConsentRequest(await authz(), session('u-owner'));
        expect(view.tenants.find((t) => t.tid === 1)).toMatchObject({ mcpAccess: 'read', writeAvailable: false });
        await expect(h.service.decide(await authz(), session('u-owner'), { approve: true, tid: 1 })).resolves.toHaveProperty('redirectTo');
    });
});

describe('bagli uygulamalar', () => {
    it('liste: kendi bagliklarim (clientName, kapsam, createdAt, lastUsedAt=null, expiresAt, tenant); baskasininki ve diger tenant gorunmez; belirtec/ozet yok', async () => {
        await enableAll();
        await open('u-owner', 1); await open('u-op', 1); await open('u-b', 2);
        const own = await (await call('GET', '/connections', OWNER)).json() as any;
        expect(own.items).toHaveLength(1);
        expect(own.items[0]).toMatchObject({ clientName: 'Test App', known: false, redirectHost: 'client.example.test', tenant: { tid: 1, name: 'Magaza Bir' }, scopes: ['mcp:read', 'mcp:write'], lastUsedAt: null });
        expect(own.items[0].user).toBeUndefined();
        expect(Date.parse(own.items[0].expiresAt)).toBeGreaterThan(Date.parse(own.items[0].createdAt));
        const blob = JSON.stringify(own);
        expect(blob).not.toMatch(/tokenHash|refresh|access_token|codeHash/);
        expect((await (await call('GET', '/connections?scope=me', B_OWNER)).json() as any).items.map((i: any) => i.tenant.tid)).toEqual([2]);
    });
    it('scope=tenant: users:manage ile tenant geneli (kullanici e-postasi); operator 403; B tenanti A yoneticisine gorunmez; gecersiz kapsam 400', async () => {
        await enableAll();
        await open('u-owner', 1); await open('u-op', 1); await open('u-b', 2);
        expect((await call('GET', '/connections?scope=tenant', OP)).status).toBe(403);
        const t = await (await call('GET', '/connections?scope=tenant', ADMIN)).json() as any;
        expect(t.items.map((i: any) => i.user.email).sort()).toEqual(['operator@example.test', 'sahip@example.test']);
        expect(t.items.every((i: any) => i.tenant.tid === 1)).toBe(true);
        expect((await call('GET', '/connections?scope=x', ADMIN)).status).toBe(400);
    });
    it('yenileme sonrasi lastUsedAt dolar', async () => {
        await enableAll();
        const tok = await open('u-owner', 1);
        h.advance(5 * 60_000);
        await h.service.token({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: (await h.store.getRefresh(sha256Hex(tok.refresh_token)))!.clientId });
        const own = await (await call('GET', '/connections', OWNER)).json() as any;
        expect(own.items).toHaveLength(1);
        expect(own.items[0].lastUsedAt).toBe(new Date(h.clock.t).toISOString());
    });
    it('iptal: kendi baglantisi 204 ve refresh ANINDA reddedilir; ikinci iptal 404; denetim kaydi (aile/istemci, belirtec yok)', async () => {
        await enableAll();
        const tok = await open('u-owner', 1);
        const fam = ((await (await call('GET', '/connections', OWNER)).json()) as any).items[0].id as string;
        const clientId = (await h.store.getClient([...h.store.clients.keys()][0]!))!.clientId;
        expect((await call('DELETE', `/connections/${fam}`, OWNER)).status).toBe(204);
        await expect(h.service.token({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: clientId })).rejects.toMatchObject({ oauthError: 'invalid_grant' });
        expect(await h.gate.isActive(fam)).toBe(false); // FamilyGate.invalidate: 60 sn beklemeden
        expect((await call('DELETE', `/connections/${fam}`, OWNER)).status).toBe(404);
        await new Promise((r) => setTimeout(r, 5));
        const a = audit.find((x) => x.event === 'mcp.connection.revoked');
        expect(a).toMatchObject({ sub: 'u-owner', tid: 1, surface: 'app', meta: { fam, clientId, by: 'self' } });
        expect(JSON.stringify(audit)).not.toContain(tok.refresh_token);
    });
    it('baskasinin baglantisi: operator 404 (users:manage yok), admin iptal eder (by:admin); baska tenant yoneticisi 404', async () => {
        await enableAll();
        await open('u-owner', 1); await open('u-b', 2);
        const fam1 = ((await (await call('GET', '/connections', OWNER)).json()) as any).items[0].id as string;
        const fam2 = ((await (await call('GET', '/connections', B_OWNER)).json()) as any).items[0].id as string;
        expect((await call('DELETE', `/connections/${fam1}`, OP)).status).toBe(404);
        expect((await call('DELETE', `/connections/${fam2}`, ADMIN)).status).toBe(404); // baska tenant: varlik sizmaz
        expect(await h.store.isFamilyActive(fam2, new Date(h.clock.t))).toBe(true);
        expect((await call('DELETE', `/connections/${fam1}`, ADMIN)).status).toBe(204);
        await new Promise((r) => setTimeout(r, 5));
        expect(audit.find((x) => x.event === 'mcp.connection.revoked')).toMatchObject({ sub: 'u-admin', meta: { by: 'admin' } });
    });
    it('revoke-all: operator 403; admin tenant geneli keser (diger tenant etkilenmez); sayi doner; denetim', async () => {
        await enableAll();
        await open('u-owner', 1); await open('u-op', 1); await open('u-b', 2);
        expect((await call('POST', '/connections/revoke-all', OP)).status).toBe(403);
        const r = await call('POST', '/connections/revoke-all', ADMIN);
        expect([r.status, await r.json()]).toEqual([200, { revoked: 2 }]);
        expect(((await (await call('GET', '/connections?scope=tenant', ADMIN)).json()) as any).items).toHaveLength(0);
        expect(((await (await call('GET', '/connections', B_OWNER)).json()) as any).items).toHaveLength(1);
        await new Promise((res) => setTimeout(res, 5));
        expect(audit.find((x) => x.event === 'mcp.connections.revoked_all')).toMatchObject({ tid: 1, meta: { count: 2 } });
    });
    it('ayar GET activeConnections tenant genelindeki aktif bagliklari sayar', async () => {
        await enableAll();
        await open('u-owner', 1); await open('u-op', 1); await open('u-b', 2);
        expect((await (await call('GET', '/settings', OP)).json() as any).activeConnections).toBe(2);
    });
    it('approvals: bekleyen yokken bos liste; bilinmeyen kimlik 404; gecersiz karar 400', async () => {
        expect(await (await call('GET', '/approvals?status=pending', OP)).json()).toEqual({ items: [] });
        expect((await call('GET', '/approvals/00000000-0000-4000-8000-000000000000', OP)).status).toBe(404);
        expect((await call('POST', '/approvals/00000000-0000-4000-8000-000000000000', OP, { decision: 'x' })).status).toBe(400);
    });
});

describe('impersonation / platform oturumu / kapali yuzey / kimliksiz', () => {
    const IMP = who('u-owner', 1, 'owner', { imp: true });
    const GA = who('u-ga', 1, 'admin', { ga: true });
    // jest `it.each`: 2 elemanli satirda 3. arguman `done` olur (test sonsuz bekler) -> her satir 3 elemanli.
    const eps: Array<[string, string, unknown]> = [
        ['GET', '/settings', undefined], ['PUT', '/settings', { access: 'read', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION }], ['GET', '/connections', undefined],
        ['GET', '/connections?scope=tenant', undefined], ['DELETE', '/connections/abc', undefined], ['POST', '/connections/revoke-all', undefined], ['GET', '/approvals', undefined],
    ];
    it.each(eps)('%s %s impersonation ve platform (ga) oturumunda 403 IMPERSONATION_FORBIDDEN; ayar degismez', async (m, p, b) => {
        for (const hdr of [IMP, GA]) {
            const r = await call(m, p, hdr, b);
            expect([r.status, (await r.json() as any).code]).toEqual([403, 'IMPERSONATION_FORBIDDEN']);
        }
        expect(settingsStore.docs.size).toBe(0);
    });
    it.each(eps)('%s %s: kimliksiz 401; MCP_ENABLED kapaliyken 404', async (m, p, b) => {
        expect((await call(m, p, {}, b)).status).toBe(401);
        enabled = false;
        const r = await call(m, p, OWNER, b);
        expect([r.status, (await r.json() as any).code]).toEqual([404, 'NOT_FOUND']);
    });
});

describe('bildirim kancasi + bakim + SettingService', () => {
    it('yeni baglantida onConnected: kullanici, tenant, aile, istemci adi, redirect host; kanca hatasi baglantiyi bozmaz; yenilemede tekrar tetiklenmez', async () => {
        await enableAll();
        await open('u-owner', 1);
        expect(connected).toHaveLength(1);
        expect(connected[0]).toMatchObject({ sub: 'u-owner', tid: 1, clientName: 'Test App', redirectHost: 'client.example.test', known: false });
        expect(connected[0]!.familyId).toMatch(/^[A-Za-z0-9_-]{16,}$/);
        const bad = buildHarness({ onConnected: () => { throw new Error('bildirim servisi coktu'); } });
        bad.identity.add('u-owner', [[1, 'Magaza Bir', 'owner']]);
        const c = await authorizeToCode(bad, { sub: 'u-owner' });
        await expect(bad.service.token({ grant_type: 'authorization_code', client_id: c.clientId, code: c.code, redirect_uri: c.redirectUri, code_verifier: c.verifier })).resolves.toHaveProperty('refresh_token');
    });
    it('SECURITY_MCP_CONNECTED: katalogda zorunlu guvenlik bildirimi (yalniz baglanan kullaniciya), params semasi + TR/EN sablon', () => {
        const def = getDefinition('SECURITY_MCP_CONNECTED')!;
        expect(def).toMatchObject({ category: 'security', mandatory: true, audience: { actorOnly: true, permission: 'self:manage' } });
        const params = { familyId: 'fam-1', clientName: 'Test App', redirectHost: 'client.example.test' };
        expect(def.params.safeParse(params).success).toBe(true);
        expect(def.params.safeParse({ ...params, token: 'x' }).success).toBe(false);
        for (const loc of ['tr', 'en'] as const) {
            const r = renderNotification('SECURITY_MCP_CONNECTED', params, loc);
            expect(r.message).toContain('Test App');
            expect(r.message).toContain('client.example.test');
        }
        expect(def.action!(params)).toBe('/account/connected-apps');
    });
    it('bakimda baglanti iptali (DELETE/revoke-all) acik; ayar yazimi (PUT) bloklu', () => {
        expect(isMaintenanceBlocked('DELETE', 'mcp/connections/abc')).toBe(false);
        expect(isMaintenanceBlocked('POST', 'mcp/connections/revoke-all')).toBe(false);
        expect(isMaintenanceBlocked('PUT', 'mcp/settings')).toBe(true);
        expect(isMaintenanceBlocked('GET', 'mcp/settings')).toBe(false);
    });
    it('SettingService: `mcp` alt nesnesi tenant ayar RPC\'lerinden OKUNMAZ ve YAZILAMAZ (sahte acma/onay enjeksiyonu)', async () => {
        const updates: any[] = [];
        const model = {
            findOne: () => ({ lean: async () => ({ docId: 1, storeName: 'x', mcp: { access: 'readwrite', transferConsent: { textVersion: 'mcp-v1' } } }) }),
            findOneAndUpdate: (_q: any, u: any) => { updates.push(u); return { lean: async () => ({ docId: 1, storeName: 'x', mcp: { access: 'readwrite' } }) }; },
        };
        const mk = (request: any) => { const s: any = new SettingService(1, request); s.clientDB = { getSettingModel: () => model }; return s; };
        expect((await mk({}).getSettings()).settings.mcp).toBeUndefined();
        const res = await mk({ settings: { storeName: 'y', mcp: { access: 'readwrite', transferConsent: { textVersion: 'mcp-v1', by: 'admin' } } } }).updateSettings();
        expect(updates[0].$set.mcp).toBeUndefined();
        expect(updates[0].$set.storeName).toBe('y');
        expect(res.mcp).toBeUndefined();
    });
    it('API sabiti: issuer/resource MCP-1 degerleri', () => { expect(API).toBe('https://api.example.test'); });
});
