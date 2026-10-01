/**
 * MCP-4 (ADR-0035 Karar 5): MCP yazma araclari + BANT DISI ONAY. Gercek `/mcp` ucu + gercek `McpApprovals` + gercek `/api/mcp/approvals` rotasi (loopback; DB/Redis/ag YOK),
 * sahte servis (`run`) ve kontrol edilen saat. Kanit: onaysiz yurutme YOK; istemcinin elicitation kabulu onay degil; tekrar cagri idempotent; sure dolumu; baskasinin onayi 404;
 * tenant izolasyonu; access=read iken yazma yok; K46 kota ortakligi; LIVE_READONLY/bakim; BR-3 kimlik dogrulamasi; denetim zinciri; bildirim.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import bodyParser from 'body-parser';
import express from 'express';
import type http from 'http';
import type { AddressInfo } from 'net';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import { metricsRegistry } from '../../../src/platform/runtime/metrics';
import { configureMcpRoutes } from '../../../src/api/http/mcpRoutes';
import { errorHandler, notFoundHandler } from '../../../src/api/http/errorEnvelope';
import { ROLE_PERMISSIONS, type Role } from '../../../src/capabilities/roles';
import { AppError } from '../../../src/platform/core/errors';
import { AgentBroker } from '../../../src/operations/agent/AgentBroker';
import { createToolRuntime } from '../../../src/operations/agent/tools';
import { consumeActionQuota, entitlementFor } from '../../../src/operations/agent/agentEntitlement';
import { setAccess, startMcp, APP, type McpHarness } from '../../helpers/mcpHarness';

let m: McpHarness;
let audit: Array<Record<string, any>> = [];
let server: http.Server;
let base = '';
let routesEnabled = true;
const flush = async () => { await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); };
const ORDERS = { orderIds: ['6501a1a1a1a1a1a1a1a1a1a1', '6501a1a1a1a1a1a1a1a1a1a2'] };
const WRITE = (name = 'orders_approve', args: unknown = ORDERS) => ({ name, args });
const approvalCalls = () => m.calls.filter((c) => c.operation === 'bulkApproveOrder' || c.operation === 'approveOrder');
const sc = (j: any) => j.result.structuredContent as Record<string, any>;

type Who = { sub: string; tid: number; role: Role; imp?: boolean; ga?: boolean };
const who = (sub: string, tid: number, role: Role = 'owner', extra: object = {}): Record<string, string> => ({ 'x-test-principal': JSON.stringify({ sub, tid, role, ...extra }) });

beforeEach(async () => {
    audit = [];
    routesEnabled = true;
    AuditLogger.setSink(async (r) => { audit.push(r); });
    metricsRegistry.drain();
    m = await startMcp({ u1: [[1, 'owner']], u1b: [[1, 'owner']], op: [[1, 'operator']], u2: [[2, 'owner']] });
    // cerezli onay rotasi: `authenticate` yerine x-test-principal; arac baglami kullanici baglamindan
    const app = express();
    app.use(bodyParser.json());
    app.use((req, res, next) => {
        const raw = req.headers['x-test-principal'];
        if (typeof raw === 'string') {
            const p = JSON.parse(raw) as Who;
            res.locals.principal = { sub: p.sub, tid: p.tid, imp: p.imp, ga: p.ga, tv: 0 };
            res.locals.actor = { sub: p.sub, tid: p.tid, role: p.role, permissions: ROLE_PERMISSIONS[p.role], imp: p.imp === true, actorType: 'user' };
            res.locals.userContext = { _id: p.sub, order: p.tid, ...(p.role === 'owner' ? { owner: true } : p.role === 'admin' ? { roleCode: 'ROLE_ADMIN' } : { roleCode: 'ROLE_OPERATOR' }) };
            res.locals.tenant = { order: p.tid, status: 'ACTIVE' };
        }
        next();
    });
    configureMcpRoutes(app, '/api', { settings: () => ({}) as never, connections: () => ({}) as never, approvals: () => m.approvals, enabled: () => routesEnabled, serverUrl: () => '' });
    setAccess('readwrite'); // configureMcpRoutes tenant ayari okuyucusunu kendi (sahte) ayarina baglar: harness okuyucusunu geri kur
    app.use(notFoundHandler);
    app.use(errorHandler);
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await m.close();
    AuditLogger.setSink(undefined);
    jest.restoreAllMocks();
});

const web = (method: string, path: string, h: Record<string, string>, body?: unknown) => fetch(`${base}/api/mcp${path}`, {
    method, headers: { 'content-type': 'application/json', ...h }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
const decideHttp = (id: string, decision: string, h = who('u1', 1)) => web('POST', `/approvals/${id}`, h, { decision });

async function propose(token: string, args: unknown = ORDERS, name = 'orders_approve') {
    const { body } = await m.call(token, name, args);
    return body;
}
async function pendingId(token: string, args: unknown = ORDERS): Promise<string> {
    const j = await propose(token, args);
    return String(sc(j).approvalUrl).split('/approve/')[1]!;
}

describe('listeleme: kapsam + tenant tavani', () => {
    it('mcp:write baglantisinda yazma araci listelenir (okuma tavanindaki hint\'ler yanlis degil, cikti semasi YOK); mcp:read baglantisinda yok', async () => {
        const w = await m.connect({ scope: 'mcp:read mcp:write' });
        const r = await m.connect({ scope: 'mcp:read' });
        const j = await (await m.rpc(w.token, 'tools/list')).json() as any;
        const t = j.result.tools.find((x: any) => x.name === 'orders_approve');
        expect(t).toBeTruthy();
        expect(t.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: true });
        expect(t.outputSchema).toBeUndefined(); // yazma araci dogrudan sonuc donmez: sabit cikti semasi istemci dogrulamasini bozardi
        expect(t.description).toMatch(/explicit user confirmation/);
        expect(await m.list(r.token)).not.toContain('orders_approve');
        const denied = (await m.call(r.token, 'orders_approve', ORDERS)).body;
        expect(denied.result.isError).toBe(true);
        expect(denied.result._meta['com.entegrasyonik/error'].code).toBe('INSUFFICIENT_SCOPE');
        expect(await (await web('GET', '/approvals', who('u1', 1))).json()).toEqual({ items: [] }); // kayit acilmadi
        expect(approvalCalls()).toEqual([]);
    });

    it('tenant access=read iken mcp:write token yazma araci GORMEZ ve cagiramaz (kayit yok); readwrite\'a donunce gorur', async () => {
        const c = await m.connect({ scope: 'mcp:read mcp:write' });
        setAccess('read');
        expect(await m.list(c.token)).not.toContain('orders_approve');
        const j = (await m.call(c.token, 'orders_approve', ORDERS)).body;
        expect(j.result._meta['com.entegrasyonik/error'].code).toBe('INSUFFICIENT_SCOPE');
        expect(await (await web('GET', '/approvals', who('u1', 1))).json()).toEqual({ items: [] });
        setAccess('readwrite');
        expect(await m.list(c.token)).toContain('orders_approve');
    });

    it('rol dusurme: operator (orders:write yok ise) / RBAC listede olmayan yazma araci CAPABILITY_DISABLED, kayit yok', async () => {
        const c = await m.connect({ sub: 'op' });
        const listed = await m.list(c.token);
        if (!listed.includes('orders_approve')) {
            expect((await m.call(c.token, 'orders_approve', ORDERS)).body.result._meta['com.entegrasyonik/error'].code).toBe('CAPABILITY_DISABLED');
            expect(approvalCalls()).toEqual([]);
        } else {
            expect(listed).toContain('orders_approve'); // operator siparis onaylama iznine sahip: davranis RBAC matrisinden gelir
        }
    });
});

describe('yazma cagrisi: YURUTME YOK, onay kaydi + baglanti', () => {
    it('approval_required: yapilandirilmis durum + okunur ozet + /approve/{id} baglantisi + 10 dk; servis cagrisi SIFIR; bildirim bir kez; denetim approval_required', async () => {
        const c = await m.connect();
        const t0 = m.h.clock.t;
        const j = await propose(c.token);
        expect(j.result.isError).toBeUndefined();
        const s = sc(j);
        expect(s.status).toBe('approval_required');
        expect(s.approvalUrl).toMatch(new RegExp(`^${APP}/approve/[0-9a-f-]{36}$`));
        expect(new Date(s.expiresAt).getTime()).toBe(t0 + 10 * 60_000);
        expect(s.preview).toMatchObject({ title: 'Siparişleri onayla (tekli/toplu)', count: 2, confirmLabel: '2 siparişi onayla' });
        expect(s.preview.lines.length).toBeLessThanOrEqual(20);
        expect(s.preview.lines[0]).toMatch(/2 sipariş/);
        expect(j.result.content[0].text).toContain(s.approvalUrl);
        expect(j.result.content[0].text).toMatch(/NOT EXECUTED/);
        expect(approvalCalls()).toEqual([]); // ONAYSIZ YURUTME YOK
        const id = s.approvalUrl.split('/approve/')[1];
        expect(m.notes).toEqual([{ tid: 1, userId: 'u1', approvalId: id, clientName: 'Test Uygulama', title: 'Siparişleri onayla (tekli/toplu)' }]);
        await flush();
        const row = audit.find((r) => r.event === 'mcp.tool_call');
        expect(row).toMatchObject({ surface: 'mcp', sub: 'u1', tid: 1, meta: { outcome: 'approval_required', capabilityId: 'orders.approve', pendingActionId: id, clientId: c.clientId, fam: c.fam } });
        expect(row!.result).toBe('ok');
        expect(JSON.stringify(row)).not.toContain('6501a1a1a1a1a1a1a1a1a1a1'); // parametre DEGERI yok
    });

    it('model ayni cagriyi tekrarlarsa (girdi anahtar sirasi/tekrar farketmez) AYNI kayit: tek PendingAction, tek bildirim, yurutme yok', async () => {
        const c = await m.connect();
        const a = sc(await propose(c.token, ORDERS));
        const b = sc(await propose(c.token, { orderIds: [...ORDERS.orderIds] }));
        const d = sc(await propose(c.token, ORDERS));
        expect([a.status, b.status, d.status]).toEqual(['approval_required', 'approval_required', 'approval_required']);
        expect(b.approvalUrl).toBe(a.approvalUrl);
        expect(d.approvalUrl).toBe(a.approvalUrl);
        expect(m.notes).toHaveLength(1);
        expect(((await (await web('GET', '/approvals', who('u1', 1))).json()) as any).items).toHaveLength(1);
        expect(approvalCalls()).toEqual([]);
        // farkli girdi = yeni kayit
        const other = sc(await propose(c.token, { orderIds: ['6501a1a1a1a1a1a1a1a1a1a3'] }));
        expect(other.approvalUrl).not.toBe(a.approvalUrl);
        expect(((await (await web('GET', '/approvals', who('u1', 1))).json()) as any).items).toHaveLength(2);
    });

    it('es zamanli ayni cagrilar: tek kayit', async () => {
        const c = await m.connect();
        const rs = await Promise.all([1, 2, 3, 4].map(() => propose(c.token)));
        expect(new Set(rs.map((j) => sc(j).approvalUrl)).size).toBe(1);
        expect(m.notes).toHaveLength(1);
    });

    it('farkli baglanti (aile) = farkli kayit (eslesme anahtari fam icerir)', async () => {
        const c1 = await m.connect();
        const c2 = await m.connect();
        expect(sc(await propose(c1.token)).approvalUrl).not.toBe(sc(await propose(c2.token)).approvalUrl);
    });

    it('istemci "tenantId/approved/confirm/pendingActionId" gibi alan gonderirse strict sema reddeder (VALIDATION); kayit yok', async () => {
        const c = await m.connect();
        for (const extra of [{ approved: true }, { confirm: true }, { pendingActionId: 'x'.repeat(16) }, { tenantId: 2 }]) {
            const j = await propose(c.token, { ...ORDERS, ...extra });
            expect(j.result._meta['com.entegrasyonik/error'].code).toBe('VALIDATION');
        }
        expect(approvalCalls()).toEqual([]);
        expect(((await (await web('GET', '/approvals', who('u1', 1))).json()) as any).items).toEqual([]);
    });

    it('BR-3 refVerifiers MCP\'de de calisir: var olmayan kimlik -> ENTITY_NOT_FOUND, kayit ve bildirim yok', async () => {
        const c = await m.connect();
        m.st.missingRefs = (i: any) => (i.orderIds as string[]).slice(0, 1);
        const j = await propose(c.token);
        expect(j.result.isError).toBe(true);
        expect(j.result._meta['com.entegrasyonik/error'].code).toBe('ENTITY_NOT_FOUND');
        expect(m.notes).toEqual([]);
        expect(((await (await web('GET', '/approvals', who('u1', 1))).json()) as any).items).toEqual([]);
        expect(approvalCalls()).toEqual([]);
    });
});

describe('istemci onayi onay DEGILDIR (elicitation/MRTR)', () => {
    it('elicitation "accept" yaniti (JSON-RPC response) ve elicitation/* istekleri: 202 / -32601; kayit pending kalir, yurutme yok', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        const post = (b: unknown) => fetch(`${m.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${c.token}` }, body: JSON.stringify(b) });
        // sunucu hic elicitation istemez ama kotu niyetli/hatali bir istemci "kabul" yaniti yollayabilir
        expect((await post({ jsonrpc: '2.0', id: 'elicit-1', result: { action: 'accept', content: { approved: true } } })).status).toBe(202);
        expect((await post({ jsonrpc: '2.0', id: 9, method: 'elicitation/create', params: { mode: 'url', url: 'x' } })).status).toBe(200);
        const r = await (await post({ jsonrpc: '2.0', id: 10, method: 'elicitation/create', params: {} })).json() as any;
        expect(r.error.code).toBe(-32601);
        // initialize'da elicitation bildirilse de sunucu yetenegi degismez; onay yine yalniz web
        const init = await (await post({ jsonrpc: '2.0', id: 11, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: { elicitation: { form: {}, url: {} } } } })).json() as any;
        expect(Object.keys(init.result.capabilities)).toEqual(['tools']);
        expect(approvalCalls()).toEqual([]);
        expect(((await (await web('GET', `/approvals/${id}`, who('u1', 1))).json()) as any).status).toBe('pending');
        // ayni cagri tekrarlaninca hala ayni bekleyen kayit (accept onay saymadi)
        expect(sc(await propose(c.token)).status).toBe('approval_required');
    });

    it('OAuth/MCP bearer ile onay ucu cagrilamaz (cerez oturumu ister: 401); web oturumu olmadan yurutme yok', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        const r = await fetch(`${base}/api/mcp/approvals/${id}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${c.token}` }, body: JSON.stringify({ decision: 'approve' }) });
        expect(r.status).toBe(401);
        expect(approvalCalls()).toEqual([]);
    });
});

describe('onay (web oturumu): tek yurutme, idempotency, saklanan sonuc', () => {
    it('onay -> tek yurutme (toplu uc, dogru girdi) -> executed; ikinci onay ve yeniden MCP cagrisi saklanan sonucu verir, ikinci yurutme YOK', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        const view = await (await web('GET', `/approvals/${id}`, who('u1', 1))).json() as any;
        expect(view).toMatchObject({ id, status: 'pending', client: { name: 'Test Uygulama' }, capability: { id: 'orders.approve', title: 'Siparişleri onayla (tekli/toplu)' }, external: true });
        const r = await decideHttp(id, 'approve');
        expect(r.status).toBe(200);
        const done = await r.json() as any;
        expect(done).toMatchObject({ id, status: 'executed', result: { summary: '2 sipariş onaylandı, 0 hata.', openIn: { screen: 'OrderListView' } } });
        expect(approvalCalls()).toHaveLength(1);
        expect(approvalCalls()[0]).toMatchObject({ service: 'OrderService', operation: 'bulkApproveOrder', body: ORDERS, tid: 1 });
        // ikinci onay (cift tiklama): ayni gorunum, yeni yurutme yok
        expect(((await (await decideHttp(id, 'approve')).json()) as any).status).toBe('executed');
        // model ayni cagriyi tekrarlar: saklanan sonuc
        const again = await propose(c.token);
        expect(sc(again)).toMatchObject({ status: 'executed', summary: '2 sipariş onaylandı, 0 hata.' });
        expect(approvalCalls()).toHaveLength(1);
        expect(((await (await web('GET', '/approvals', who('u1', 1))).json()) as any).items).toEqual([]); // artik bekleyen yok
    });

    it('es zamanli iki onay: yalniz biri yurutur', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        const rs = await Promise.all([decideHttp(id, 'approve'), decideHttp(id, 'approve'), decideHttp(id, 'approve')]);
        expect(approvalCalls()).toHaveLength(1);
        expect(rs.map((r) => r.status).every((s) => s === 200 || s === 409)).toBe(true);
        expect(((await (await web('GET', `/approvals/${id}`, who('u1', 1))).json()) as any).status).toBe('executed');
    });

    it('ret: rejected; yeniden MCP cagrisi "kullanici reddetti" der, yeni kayit/yurutme yok', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        expect(((await (await decideHttp(id, 'reject')).json()) as any).status).toBe('rejected');
        const again = await propose(c.token);
        expect(sc(again).status).toBe('rejected');
        expect(again.result.content[0].text).toMatch(/rejected/);
        expect(approvalCalls()).toEqual([]);
        expect(((await (await decideHttp(id, 'approve')).json()) as any).status).toBe('rejected'); // retten sonra onay yurutmez
        expect(approvalCalls()).toEqual([]);
    });

    it('yurutme hatasi: bilinmeyen sonuc (INTERNAL) -> unknown_outcome, tekrar cagri ikinci yurutme YAPMAZ; belirgin hata (FORBIDDEN) -> failed ve yeni onay istenebilir', async () => {
        const c = await m.connect();
        m.st.writeError = new Error('boom');
        const id = await pendingId(c.token);
        const view = await (await decideHttp(id, 'approve')).json() as any;
        expect(view).toMatchObject({ status: 'unknown_outcome', result: { code: 'INTERNAL' } });
        expect(JSON.stringify(view)).not.toContain('boom');
        expect(sc(await propose(c.token)).status).toBe('unknown_outcome');
        expect(approvalCalls()).toHaveLength(1);

        m.st.writeError = AppError.of('FORBIDDEN');
        const args2 = { orderIds: ['6501a1a1a1a1a1a1a1a1a1a9'] };
        const id2 = await pendingId(c.token, args2);
        expect(((await (await decideHttp(id2, 'approve')).json()) as any).status).toBe('failed');
        const next = sc(await propose(c.token, args2));
        expect(next.status).toBe('approval_required');
        expect(next.approvalUrl).not.toContain(id2);
    });

    it('denetim zinciri: mcp.tool_call(approval_required) -> mcp.approval(ok) -> mcp.write(ok) AYNI pendingActionId, surface mcp', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        await decideHttp(id, 'approve');
        await flush();
        const chain = audit.filter((r) => r.meta?.pendingActionId === id).map((r) => `${r.event}:${r.meta.outcome}`);
        expect(chain).toEqual(['mcp.tool_call:approval_required', 'mcp.approval:ok', 'mcp.write:ok']);
        expect(audit.filter((r) => r.meta?.pendingActionId === id).every((r) => r.surface === 'mcp' && r.tid === 1)).toBe(true);
        expect(JSON.stringify(audit)).not.toContain('6501a1a1a1a1a1a1a1a1a1a1');
    });
});

describe('sahiplik ve tenant izolasyonu', () => {
    it('baska kullanici (ayni tenant) ve baska tenant: gorunum/onay/ret 404, kayit etkilenmez, yurutme yok; liste yalniz kendi kayitlari', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        for (const h of [who('u1b', 1), who('op', 1, 'operator'), who('u2', 2)]) {
            expect((await web('GET', `/approvals/${id}`, h)).status).toBe(404);
            expect((await decideHttp(id, 'approve', h)).status).toBe(404);
            expect((await decideHttp(id, 'reject', h)).status).toBe(404);
            expect(((await (await web('GET', '/approvals', h)).json()) as any).items).toEqual([]);
        }
        expect(approvalCalls()).toEqual([]);
        expect(((await (await web('GET', `/approvals/${id}`, who('u1', 1))).json()) as any).status).toBe('pending'); // sahibi hala gorur ve kullanabilir
        expect(((await (await web('GET', '/approvals', who('u1', 1))).json()) as any).items.map((x: any) => x.id)).toEqual([id]);
    });

    it('iki tenant: A\'nin token\'i B verisine yazma kaydi acamaz (kayit tenant\'a baglanir); B kendi kaydini yalniz B kullanicisi onaylar', async () => {
        const a = await m.connect({ sub: 'u1', tid: 1 });
        const b = await m.connect({ sub: 'u2', tid: 2 });
        const ida = await pendingId(a.token);
        const idb = await pendingId(b.token);
        expect(ida).not.toBe(idb);
        expect((await decideHttp(ida, 'approve', who('u2', 2))).status).toBe(404);
        expect((await decideHttp(idb, 'approve', who('u2', 2))).status).toBe(200);
        expect(approvalCalls().map((x) => x.tid)).toEqual([2]);
    });

    it('gecersiz kimlik bicimi 404; gecersiz karar 400; kimliksiz 401; MCP_ENABLED=false 404; impersonation/ga 403', async () => {
        expect((await web('GET', '/approvals/../x', who('u1', 1))).status).toBe(404);
        expect((await web('GET', '/approvals/short', who('u1', 1))).status).toBe(404);
        const c = await m.connect();
        const id = await pendingId(c.token);
        expect((await decideHttp(id, 'maybe')).status).toBe(400);
        expect((await web('GET', `/approvals/${id}`, {})).status).toBe(401);
        for (const h of [who('u1', 1, 'owner', { imp: true }), who('u1', 1, 'owner', { ga: true })]) {
            for (const [mt, p, b] of [['GET', `/approvals/${id}`, undefined], ['POST', `/approvals/${id}`, { decision: 'approve' }], ['GET', '/approvals', undefined]] as const) {
                const r = await web(mt, p, h, b);
                expect([r.status, ((await r.json()) as any).code]).toEqual([403, 'IMPERSONATION_FORBIDDEN']);
            }
        }
        routesEnabled = false;
        expect((await web('GET', `/approvals/${id}`, who('u1', 1))).status).toBe(404);
        expect(approvalCalls()).toEqual([]);
    });
});

describe('sure, baglanti ve tenant ayari', () => {
    it('10 dk sonra: onay APPROVAL_EXPIRED (410), gorunum expired, yurutme yok; model ayni cagriyi yapinca YENI kayit', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        m.h.clock.t += 10 * 60_000 - 1000;
        expect(((await (await web('GET', `/approvals/${id}`, who('u1', 1))).json()) as any).status).toBe('pending');
        m.h.clock.t += 2000;
        const r = await decideHttp(id, 'approve');
        expect([r.status, ((await r.json()) as any).code]).toEqual([410, 'APPROVAL_EXPIRED']);
        expect(((await (await web('GET', `/approvals/${id}`, who('u1', 1))).json()) as any).status).toBe('expired');
        expect(((await (await web('GET', '/approvals', who('u1', 1))).json()) as any).items).toEqual([]);
        expect(approvalCalls()).toEqual([]);
        // baskasi icin sure dolmus kayit da 404 (ayrim sizmaz)
        expect((await decideHttp(id, 'approve', who('u2', 2))).status).toBe(404);
        const fresh = sc(await propose(c.token));
        expect(fresh.status).toBe('approval_required');
        expect(fresh.approvalUrl).not.toContain(id);
    });

    it('baglanti iptal edilirse bekleyen onay gecersiz (APPROVAL_EXPIRED), yurutme yok', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        await m.h.store.revokeFamily(c.fam, 'user' as never, new Date(m.h.clock.t));
        m.h.gate.invalidate(c.fam);
        const r = await decideHttp(id, 'approve');
        expect([r.status, ((await r.json()) as any).code]).toEqual([410, 'APPROVAL_EXPIRED']);
        expect(approvalCalls()).toEqual([]);
    });

    it('tenant MCP ayari yaziya kapanirsa bekleyen onay yurumez (403), kayit duruyor', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        setAccess('read');
        const r = await decideHttp(id, 'approve');
        expect(r.status).toBe(403);
        expect(approvalCalls()).toEqual([]);
        setAccess('readwrite');
        expect(((await (await decideHttp(id, 'approve')).json()) as any).status).toBe('executed');
    });
});

describe('LIVE_READONLY ve bakim', () => {
    it('LIVE_READONLY: yazma araci listede yok, zorla cagri LIVE_READONLY, onay ucu 423 (kayit tuketilmez, kota dusmez), ret serbest', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        m.st.liveReadonly = true;
        expect(await m.list(c.token)).not.toContain('orders_approve');
        const forced = (await m.call(c.token, 'orders_approve', ORDERS)).body;
        expect(forced.result._meta['com.entegrasyonik/error'].code).toBe('LIVE_READONLY');
        const r = await decideHttp(id, 'approve');
        expect([r.status, ((await r.json()) as any).code]).toEqual([423, 'LIVE_READONLY']);
        expect(approvalCalls()).toEqual([]);
        expect([...m.kv.keys()].filter((k) => k.startsWith('agent:quota:'))).toEqual([]); // kota tuketilmedi
        m.st.liveReadonly = false;
        expect(((await (await decideHttp(id, 'approve')).json()) as any).status).toBe('executed'); // kayit tuketilmemisti
    });

    it('bakim: yazma araci cagrisi MAINTENANCE, onay MAINTENANCE (503); okuma araclari calisir', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        m.st.maintenance = true;
        expect((await m.call(c.token, 'orders_approve', ORDERS)).body.result._meta['com.entegrasyonik/error'].code).toBe('MAINTENANCE');
        const r = await decideHttp(id, 'approve');
        expect([r.status, ((await r.json()) as any).code]).toEqual([503, 'MAINTENANCE']);
        expect(approvalCalls()).toEqual([]);
        expect((await m.call(c.token, 'orders_list')).body.result.isError).toBeUndefined();
        m.st.maintenance = false;
        expect(((await (await decideHttp(id, 'approve')).json()) as any).status).toBe('executed');
    });

    it('kill-switch (disabledCapabilities): onay oncesi kapatilan yetenek onay ucunda da calismaz', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        m.st.disabled = new Set(['orders.approve']);
        expect((await decideHttp(id, 'approve')).status).toBe(503);
        expect(approvalCalls()).toEqual([]);
    });
});

describe('K46: gunluk eylem kotasi sohbetle ORTAK', () => {
    it('limited plan: sohbet + MCP ayni sayac; asimda onay 403 QUOTA_EXCEEDED + upgradeUrl, kayit tuketilmez; kota doluyken yeni MCP yazma cagrisi kayit acmadan QUOTA_EXCEEDED', async () => {
        const c = await m.connect();
        m.st.entitlement = { ...entitlementFor('limited'), dailyActionQuota: 2 };
        // "sohbet" bir eylemi onaylamis gibi AYNI sayaca yazar
        expect((await consumeActionQuota(m.kv, 1, m.st.entitlement, new Date(m.h.clock.t))).allowed).toBe(true);
        const id1 = await pendingId(c.token, { orderIds: ['6501a1a1a1a1a1a1a1a1a1c1'] });
        const id2 = await pendingId(c.token, { orderIds: ['6501a1a1a1a1a1a1a1a1a1c2'] });
        expect(((await (await decideHttp(id1, 'approve')).json()) as any).status).toBe('executed'); // sayac 2/2
        const over = await decideHttp(id2, 'approve');
        const body = await over.json() as any;
        expect([over.status, body.code]).toEqual([403, 'QUOTA_EXCEEDED']);
        expect(body.upgradeUrl).toMatch(/\/subscription$/);
        expect(body.error).toMatch(/yükseltin/);
        expect(approvalCalls()).toHaveLength(1);
        expect(((await (await web('GET', `/approvals/${id2}`, who('u1', 1))).json()) as any).status).toBe('pending'); // tuketilmedi
        // kota doluyken yeni onay kaydi acilmaz; anlasilir hata + upgradeUrl
        const blocked = (await m.call(c.token, 'orders_approve', { orderIds: ['6501a1a1a1a1a1a1a1a1a1c3'] })).body;
        expect(blocked.result.isError).toBe(true);
        expect(blocked.result._meta['com.entegrasyonik/error']).toMatchObject({ code: 'QUOTA_EXCEEDED', upgradeUrl: expect.stringMatching(/\/subscription$/) });
        expect(approvalCalls()).toHaveLength(1);
        // ret kotaya sayilmaz ve serbesttir
        expect(((await (await decideHttp(id2, 'reject')).json()) as any).status).toBe('rejected');
    });

    it('baska tenant\'in sayaci ayri', async () => {
        const a = await m.connect({ sub: 'u1', tid: 1 });
        const b = await m.connect({ sub: 'u2', tid: 2 });
        m.st.entitlement = { ...entitlementFor('limited'), dailyActionQuota: 1 };
        const ida = await pendingId(a.token);
        const idb = await pendingId(b.token);
        expect(((await (await decideHttp(ida, 'approve')).json()) as any).status).toBe('executed');
        expect(((await (await decideHttp(idb, 'approve', who('u2', 2))).json()) as any).status).toBe('executed');
    });
});

describe('sohbet kayitlariyla ortak depo, ama capraz kullanim yok', () => {
    it('MCP kaydi sohbet onay ucundan okunamaz/yurutulemez; sohbet kimligi MCP ucundan 404', async () => {
        const c = await m.connect();
        const id = await pendingId(c.token);
        const broker = new AgentBroker({
            kv: () => m.kv, isEnabled: () => true, isMaintenance: () => false, resolveProvider: async () => null, now: () => m.h.clock.t,
            tools: createToolRuntime({ isMaintenance: () => false, run: (async () => { throw new Error('yurutulmemeli'); }) as never, entitled: async () => () => true }),
        });
        const ctx = { ...m.webCtx({ sub: 'u1', tid: 1 }), surface: 'chat' as const };
        try {
            // sohbet kaydi gibi gorunen konusma kimligi denense de (MCP kaydinin conversationId'si `mcp:{fam}`) yurutme YOK
            await expect(broker.beginConfirm(ctx, { v: 1, conversationId: 'conv-00000001', pendingActionId: id, decision: 'approve' } as never)).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED' });
        } finally { broker.stop(); }
        expect(approvalCalls()).toEqual([]);
        expect(((await (await web('GET', `/approvals/${id}`, who('u1', 1))).json()) as any).status).toBe('pending');
    });
});

describe('metrik', () => {
    it('approval_required denetim/metrik sinirli etiketle; surface=mcp', async () => {
        const c = await m.connect();
        await propose(c.token);
        const snap = JSON.stringify(metricsRegistry.drain());
        expect(snap).toContain('approval_required');
        expect(snap).not.toContain('6501a1a1');
    });
});
