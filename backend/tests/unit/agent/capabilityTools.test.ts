/**
 * CHAT-BR-2: yetenek -> arac turetimi, suzgec (RBAC/entitlement/kill-switch/LIVE_READONLY/bakim/impersonation), `invokeCapability`
 * (onay kapisi, strict girdi, cikti strip + PII, boyut siniri), arac adi + JSON Schema, kayit degismezleri (exposed kalite kurallari).
 * DB/Redis/ag YOK: RunOperation sahte `run` ile degistirilir.
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { CAPABILITIES, CAPABILITY_BY_ID, findRegistryInvariantViolations, httpBindingsOf, toolNameOf, TOOL_NAME_RE } from '../../../src/capabilities';
import { invokeCapability, type InvokeContext, type InvokeOptions } from '../../../src/capabilities/invoke';
import { hiddenReasonFor, type AvailabilityEnv } from '../../../src/capabilities/availability';
import { zodToJsonSchema } from '../../../src/capabilities/derive/jsonSchema';
import { maskPerson } from '../../../src/capabilities/derive/pii';
import { deriveTools, MAX_TOOLS } from '../../../src/operations/agent/tools';
import { CONFIRM_SPECS, PRESENT_SPECS } from '../../../src/operations/agent/present/specs';
import type { CapabilityDef } from '../../../src/capabilities/types';

const ENV: AvailabilityEnv = { liveReadonly: false, maintenance: false, disabled: new Set(), imp: false };
const env = (over: Partial<AvailabilityEnv> = {}): AvailabilityEnv => ({ ...ENV, ...over });
const ROLES = {
    member: { tier: 'member' as const }, admin: { tier: 'admin' as const }, owner: { tier: 'owner' as const },
};
const UC = { member: { order: 7 }, admin: { order: 7, roleCode: 'ROLE_ADMIN' }, owner: { order: 7, owner: true } };
const ictx = (role: keyof typeof UC = 'member', principal: Record<string, unknown> = {}): InvokeContext => ({
    userContext: UC[role], principal: { sub: 'u1', tid: 7, ...principal },
});
const EXPOSED = CAPABILITIES.filter((c) => c.mcp.exposed);
const toolNames = (ts: Array<{ name: string }>) => ts.map((t) => t.name);

describe('arac adi turetimi', () => {
    it('`.` -> `_`, gecerli regex, exposed yetenekler icin tekil', () => {
        expect(toolNameOf('orders.list')).toBe('orders_list');
        expect(toolNameOf('stock.low_list')).toBe('stock_low_list');
        const names = EXPOSED.map((c) => toolNameOf(c.id));
        for (const n of names) expect(n).toMatch(TOOL_NAME_RE);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe('zod -> JSON Schema (yerel cevirici)', () => {
    it('nesne strict -> additionalProperties:false; optional alan required disinda; sinirlar ve enum tasinir', () => {
        const js = zodToJsonSchema(z.object({
            q: z.string().min(1).max(50), n: z.number().int().min(1).max(25).optional(), e: z.enum(['a', 'b']), l: z.array(z.string().max(5)).min(1).max(3),
        }).strict()) as any;
        expect(js).toEqual({
            type: 'object', additionalProperties: false, required: ['q', 'e', 'l'],
            properties: {
                q: { type: 'string', minLength: 1, maxLength: 50 }, n: { type: 'integer', minimum: 1, maximum: 25 }, e: { type: 'string', enum: ['a', 'b'] },
                l: { type: 'array', items: { type: 'string', maxLength: 5 }, minItems: 1, maxItems: 3 },
            },
        });
    });
    it('desteklenmeyen tur sessizce gevsek sema uretmez (firlatir)', () => {
        expect(() => zodToJsonSchema(z.record(z.string(), z.unknown()))).toThrow(/desteklenmeyen/);
    });
    it('her exposed yetenegin girdisi cevrilir ve nesne + additionalProperties:false', () => {
        for (const c of EXPOSED) {
            const js = zodToJsonSchema(c.input) as any;
            expect([c.id, js.type, js.additionalProperties]).toEqual([c.id, 'object', false]);
        }
    });
});

describe('exposed yetenek kalite degismezleri (P7 alt kumesi)', () => {
    const FORBIDDEN_KEYS = ['tenantId', 'clientId', 'order', 'userContext', 'principal', 'tid'];
    it('kayit degismezleri temiz', () => { expect(findRegistryInvariantViolations()).toEqual([]); });
    for (const c of EXPOSED) {
        it(`${c.id}: strict girdi, tenant alani yok, limit<=100, pii!=raw, toolset<=15, yazma=>confirm, platform degil, sunum/onay esleme var`, () => {
            const shape = (c.input as unknown as z.ZodObject<any>).shape;
            expect(Object.keys(shape).filter((k) => FORBIDDEN_KEYS.includes(k))).toEqual([]);
            expect((c.input as any)._def.unknownKeys).toBe('strict');
            if (shape.limit) expect(zodToJsonSchema(shape.limit)).toMatchObject({ maximum: expect.any(Number) });
            if (shape.limit) expect((zodToJsonSchema(shape.limit) as any).maximum).toBeLessThanOrEqual(100);
            expect(c.pii).not.toBe('raw');
            expect(c.output).not.toBe('legacy');
            expect(c.scope).not.toBe('platform');
            if (c.effect === 'write' || c.effect === 'destructive') {
                expect(c.mcp.exposed!.confirm).not.toBe('none');
                expect(CONFIRM_SPECS[c.id]).toBeDefined();
            } else {
                expect(PRESENT_SPECS[c.id]).toBeDefined();
            }
            expect(EXPOSED.filter((x) => x.mcp.exposed!.toolset === c.mcp.exposed!.toolset).length).toBeLessThanOrEqual(15);
        });
    }
    it('liste arac listesi butcesi icindedir', () => { expect(EXPOSED.length).toBeLessThanOrEqual(MAX_TOOLS); });
});

describe('kayit: http bagi + adminChat degismezleri', () => {
    const base = CAPABILITY_BY_ID.get('orders.list')!;
    it('agent.* girdileri http bagi tasir ve RPC politikasina/bagina girmez', () => {
        for (const id of ['agent.info', 'agent.turn', 'agent.confirm', 'agent.more', 'agent.reset']) {
            const c = CAPABILITY_BY_ID.get(id as any)!;
            expect(httpBindingsOf(c).length).toBe(1);
            expect(c.bindings.every((b) => b.rpc === undefined)).toBe(true);
            expect(c.mcp.notExposed).toBeDefined();
        }
    });
    it('her http bagi agentRoutes.ts / oauth/routes.ts (/oauth/requests) / mcpRoutes.ts (/mcp) icinde gercek bir rotaya karsilik gelir (surukleme yakalanir)', () => {
        const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../../src/api', f), 'utf8');
        for (const c of CAPABILITIES) for (const h of httpBindingsOf(c)) {
            const [method, p] = h.split(' ');
            // [MCP-1] onay ekrani uclari `api/oauth/routes.ts`'te (`${base}` = /api/oauth/requests); [MCP-2] `/mcp/*` uclari `api/http/mcpRoutes.ts`'te (`${base}` = /api/mcp).
            // [BR-4] `/admin-api/agent/*` uclari `api/admin/adminAgentRoutes.ts`'te (`router.<yontem>(`${base}...`), `base` = /agent).
            const admin = p.startsWith('/admin-api/agent');
            const [file, prefix] = admin ? ['admin/adminAgentRoutes.ts', /^\/admin-api\/agent/] : p.startsWith('/oauth/requests') ? ['oauth/routes.ts', /^\/oauth\/requests/] : p.startsWith('/mcp') ? ['http/mcpRoutes.ts', /^\/mcp/] : ['http/agentRoutes.ts', /^\/agent/];
            const routePath = `\${base}${p.replace(prefix, '')}`;
            expect([h, read(file as string).includes(`${admin ? 'router' : 'app'}.${method.toLowerCase()}(\`${routePath}\``)]).toEqual([h, true]);
        }
    });
    it('adminChat yalniz platform kapsamli VE salt-okunur yetenekte; aksi ihlal', () => {
        const adminChat = { exposed: { present: 'table' as const, llm: { description: 'x'.repeat(130), examples: ['a', 'b'] } } };
        const tenantScoped = { ...base, id: 'orders.zz1', adminChat } as unknown as CapabilityDef;
        expect(findRegistryInvariantViolations([tenantScoped]).map((v) => v.kind)).toContain('ADMIN_CHAT_NOT_PLATFORM');
        const platformWrite = { ...base, id: 'platform.zz2', scope: 'platform', effect: 'write', adminChat, mcp: { notExposed: { reason: 'platform_admin', note: 'x'.repeat(25) } }, output: 'legacy' } as unknown as CapabilityDef;
        expect(findRegistryInvariantViolations([platformWrite]).map((v) => v.kind)).toEqual(expect.arrayContaining(['ADMIN_CHAT_NOT_READ']));
        const ok = { ...platformWrite, id: 'platform.zz3', effect: 'read' } as unknown as CapabilityDef;
        expect(findRegistryInvariantViolations([ok]).map((v) => v.kind)).not.toContain('ADMIN_CHAT_NOT_PLATFORM');
    });
    it('arac adi cakismasi ve exposed-platform/confirm:none-yazma ihlalleri yakalanir', () => {
        const a = { ...base, id: 'orders.a_b' } as unknown as CapabilityDef;
        const b = { ...base, id: 'orders.a.b' } as unknown as CapabilityDef;
        expect(findRegistryInvariantViolations([a, b]).map((v) => v.kind)).toContain('TOOL_NAME_COLLISION');
        const w = { ...base, id: 'orders.zz4', effect: 'write', mcp: { exposed: { ...base.mcp.exposed!, confirm: 'none' } } } as unknown as CapabilityDef;
        expect(findRegistryInvariantViolations([w]).map((v) => v.kind)).toContain('EXPOSED_WRITE_WITHOUT_CONFIRM');
        const p = { ...base, id: 'orders.zz5', scope: 'platform' } as unknown as CapabilityDef;
        expect(findRegistryInvariantViolations([p]).map((v) => v.kind)).toContain('EXPOSED_PLATFORM_SCOPE');
    });
});

describe('arac listesi suzgeci (deriveTools)', () => {
    // PRC-R0/R1: pricing_* (catalog toolset) — maliyet okuma/yazma, buybox listesi, kâr önizlemesi.
    // PRC-R2: kural listesi + öneri listesi (okuma) + öneri uygulama (yazma, admin, dış etkili: pazaryeri fiyatı; onay kartı risk high).
    const all = ['integrations_health_get', 'orders_approve', 'orders_list', 'pricing_buybox_list', 'pricing_cost_list', 'pricing_cost_set', 'pricing_margin_preview',
        'pricing_rules_list', 'pricing_suggestions_apply', 'pricing_suggestions_list', 'products_search', 'reports_sales_summary', 'stock_low_list'];
    const adminOnly = ['integrations_health_get', 'pricing_suggestions_apply'];
    const writes = ['orders_approve', 'pricing_cost_set', 'pricing_suggestions_apply'];
    it('member: admin izinli araclar (health, fiyat onerisi uygulama) haric hepsi; admin/owner: hepsi; deterministik ad sirasi', () => {
        expect(toolNames(deriveTools({ actor: ROLES.member, env: ENV }))).toEqual(all.filter((n) => !adminOnly.includes(n)));
        expect(toolNames(deriveTools({ actor: ROLES.admin, env: ENV }))).toEqual(all);
        expect(toolNames(deriveTools({ actor: ROLES.owner, env: ENV }))).toEqual(all);
    });
    it('kimliksiz/bilinmeyen aktor: arac yok (varsayilan ret)', () => {
        expect(deriveTools({ actor: undefined, env: ENV })).toEqual([]);
    });
    it('LIVE_READONLY: dis yazma araclari (orders_approve, pricing_suggestions_apply) listeden duser; okumalar ve yerel yazma (pricing_cost_set, dis etkisiz) kalir', () => {
        const n = toolNames(deriveTools({ actor: ROLES.admin, env: env({ liveReadonly: true }) }));
        expect(n).not.toContain('orders_approve');
        expect(n).toEqual(all.filter((x) => x !== 'orders_approve' && x !== 'pricing_suggestions_apply'));
    });
    it('impersonation: yalniz effect:read kalir', () => {
        const n = toolNames(deriveTools({ actor: ROLES.admin, env: env({ imp: true }) }));
        expect(n).not.toContain('orders_approve');
        for (const t of deriveTools({ actor: ROLES.admin, env: env({ imp: true }) })) expect(t.effect).toBe('read');
    });
    it('bakim modu: yazma duser, okuma/onizleme kalir', () => {
        expect(toolNames(deriveTools({ actor: ROLES.admin, env: env({ maintenance: true }) }))).toEqual(all.filter((x) => !writes.includes(x)));
    });
    it('kill-switch: listedeki yetenek gorunmez', () => {
        expect(toolNames(deriveTools({ actor: ROLES.admin, env: env({ disabled: new Set(['orders.list', 'orders.approve']) }) }))).toEqual(all.filter((x) => x !== 'orders_list' && x !== 'orders_approve'));
    });
    it('entitlement: abonelik yazmaya izin vermiyorsa yazma araci duser (okuma kalir)', () => {
        const n = toolNames(deriveTools({ actor: ROLES.admin, env: ENV, entitled: (c) => c.effect === 'read' }));
        expect(n).toEqual(all.filter((x) => !writes.includes(x)));
        expect(deriveTools({ actor: ROLES.admin, env: ENV, entitled: () => false })).toEqual([]);
    });
    it('platform kapsamli ve exposed olmayan yetenek asla listelenmez (gizleme nedenleri)', () => {
        const list = CAPABILITY_BY_ID.get('orders.list')!;
        expect(hiddenReasonFor(list, ROLES.member, ENV)).toBeUndefined();
        expect(hiddenReasonFor({ ...list, scope: 'platform' } as CapabilityDef, ROLES.member, ENV)).toBe('scope');
        expect(hiddenReasonFor(CAPABILITY_BY_ID.get('orders.cancel')!, ROLES.owner, ENV)).toBe('not_exposed');
        expect(hiddenReasonFor(CAPABILITY_BY_ID.get('integrations.health.get')!, ROLES.member, ENV)).toBe('rbac');
    });
    it('butce: 30 aractan fazlasi kirpilir; core ve sayfa toolset\'i oncelikli', () => {
        const list = CAPABILITY_BY_ID.get('orders.list')!;
        const many = Array.from({ length: 40 }, (_, i) => ({ ...list, id: `orders.t${String(i).padStart(2, '0')}`, mcp: { exposed: { ...list.mcp.exposed!, toolset: i < 35 ? 'orders' : 'catalog' } } }) as unknown as CapabilityDef);
        const core = { ...list, id: 'orders.zcore' } as unknown as CapabilityDef;
        const tools = deriveTools({ caps: [...many, core], actor: ROLES.member, env: ENV, screen: 'productDefinitions/ProductListView' });
        expect(tools).toHaveLength(MAX_TOOLS);
        expect(toolNames(tools)).toContain('orders_zcore'); // core her zaman
        expect(tools.filter((t) => t.toolset === 'catalog')).toHaveLength(5); // sayfa ipucu catalog: tumu girer
    });
    it('arac tanimi: aciklama + JSON Schema + onay notu; girdi semasi strict', () => {
        const t = deriveTools({ actor: ROLES.admin, env: ENV }).find((x) => x.name === 'orders_approve')!;
        expect(t).toMatchObject({ capId: 'orders.approve', effect: 'write', confirm: 'confirm', external: true });
        expect(t.description).toMatch(/confirmation/i);
        expect(t.inputSchema).toMatchObject({ type: 'object', additionalProperties: false, required: ['orderIds'] });
        const o = deriveTools({ actor: ROLES.admin, env: ENV }).find((x) => x.name === 'orders_list')!;
        expect((o.inputSchema as any).properties.limit).toMatchObject({ type: 'integer', maximum: 50 });
        expect((o.inputSchema as any).properties.status.enum).toContain('AWAITING_APPROVAL');
    });
});

describe('invokeCapability', () => {
    const order = (over: Record<string, unknown> = {}) => ({
        _id: { toString: () => 'oid1' }, orderNumber: 'N-1', integrationCode: 'trendyol', internalStatus: 'AWAITING_APPROVAL',
        billingAddress: { firstName: 'Ayşe', lastName: 'Yılmaz', phone: '+905551112233', email: 'a@b.c', addressLine: 'Gizli sokak 5' },
        financials: { grandTotal: 199.9, currencyCode: 'TRY', integrationCommission: 12 }, dates: { orderDate: new Date('2026-09-30T10:00:00Z') },
        items: [{ quantity: 2 }, { quantity: 1 }], fulfillment: [{ trackingCode: 'TRK1' }], meta: { secret: 'x' }, history: [{ a: 1 }], ...over,
    });
    const mkRun = (raw: unknown) => jest.fn(async (..._a: any[]) => raw) as unknown as NonNullable<InvokeOptions['run']> & jest.Mock;

    it('orders.list: RunOperation zincirinden (map) cagrilir; cikti strip + PII maskeli; sayfa imleci', async () => {
        const run = mkRun({ totalNumberOfRecords: 60, orders: [order()] });
        const r = await invokeCapability(ictx('member'), 'orders.list', { status: 'AWAITING_APPROVAL', limit: 25, cursor: 'p2' }, 'chat', { env: ENV, run });
        const [uc, service, op, body, principal, meta] = (run as jest.Mock).mock.calls[0] as any[];
        expect([service, op]).toEqual(['OrderService', 'getOrders']);
        expect(uc).toBe(UC.member);
        expect(principal).toMatchObject({ sub: 'u1', tid: 7 });
        expect(body).toEqual({ searchOrderForm: { pagination: { page: 2, limit: 25 }, filter: { internalStatuses: ['AWAITING_APPROVAL'] } } });
        expect(meta).toMatchObject({ surface: 'app' });
        expect(meta.idempotencyKey).toBeUndefined();
        expect(r.data).toEqual({
            items: [{ id: 'oid1', orderNumber: 'N-1', channel: 'trendyol', customer: 'A*** Y***', total: 199.9, currency: 'TRY', status: 'AWAITING_APPROVAL', orderDate: '2026-09-30T10:00:00.000Z', itemCount: 3, tracking: 'TRK1' }],
            total: 60, nextCursor: 'p3',
        });
        const json = JSON.stringify(r.data);
        for (const leak of ['Ayşe', 'Yılmaz', '5551112233', 'a@b.c', 'Gizli', 'secret', 'history']) expect(json).not.toContain(leak);
        expect(r.untrustedPaths).toEqual(['items[].customer', 'items[].tracking']);
    });
    it('son sayfada nextCursor null', async () => {
        const r = await invokeCapability(ictx(), 'orders.list', {}, 'chat', { env: ENV, run: mkRun({ totalNumberOfRecords: 1, orders: [order()] }) });
        expect((r.data as any).nextCursor).toBeNull();
    });
    it('strict girdi: bilinmeyen/tenant alani ve sinir disi deger 400 VALIDATION (servis cagrilmaz)', async () => {
        const run = mkRun({});
        for (const bad of [{ tenantId: 9 }, { clientId: 1 }, { limit: 500 }, { status: 'X' }, { cursor: 'abc' }, { order: 3 }]) {
            await expect(invokeCapability(ictx(), 'orders.list', bad, 'chat', { env: ENV, run })).rejects.toMatchObject({ code: 'VALIDATION', status: 400 });
        }
        expect(run).not.toHaveBeenCalled();
    });
    it('bilinmeyen / exposed olmayan yetenek: 403 (varligi sizdirilmaz)', async () => {
        const run = mkRun({});
        await expect(invokeCapability(ictx(), 'nope.x', {}, 'chat', { env: ENV, run })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
        await expect(invokeCapability(ictx('owner'), 'orders.cancel', { orderIds: ['a'] }, 'chat', { env: ENV, run })).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(invokeCapability(ictx('owner'), 'agent.turn', {}, 'chat', { env: ENV, run })).rejects.toMatchObject({ code: 'FORBIDDEN' });
        expect(run).not.toHaveBeenCalled();
    });

    describe('RBAC matrisi (member/admin/owner x exposed yetenek = can())', () => {
        const need: Record<string, 'member' | 'admin'> = { 'integrations.health.get': 'admin' };
        const rank = { member: 1, admin: 2, owner: 3 };
        const inputs: Record<string, unknown> = { 'orders.approve': { orderIds: ['a1'] }, 'products.search': { query: 'x' } };
        for (const c of EXPOSED) {
            for (const role of ['member', 'admin', 'owner'] as const) {
                const allowed = rank[role] >= rank[need[c.id] ?? 'member'];
                it(`${c.id} x ${role} -> ${allowed ? 'izin' : '403'}`, async () => {
                    const run = mkRun({});
                    const p = invokeCapability(ictx(role), c.id, inputs[c.id] ?? {}, 'chat', { env: ENV, run, approval: c.effect === 'write' ? { pendingActionId: 'pa-aaaaaaaa' } : undefined });
                    if (allowed) await p.then(() => undefined, (e: any) => { expect(e.code).not.toBe('FORBIDDEN'); }); // yetki gecti (bos sahte cikti sema hatasi verebilir)
                    else await expect(p).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
                    if (!allowed) expect(run).not.toHaveBeenCalled();
                });
            }
        }
    });

    describe('yazma: onay kapisi + idempotency + korumalar', () => {
        const raw = { success: false, data: { successCount: 2, failedCount: 1, successful: [], failed: [{ orderId: 'o3', errorMessage: 'Statü uygun değil.' }] } };
        it('onaysiz yurutme imkansiz (run cagrilmaz); gecersiz onay kimligi de reddedilir', async () => {
            const run = mkRun(raw);
            await expect(invokeCapability(ictx(), 'orders.approve', { orderIds: ['o1'] }, 'chat', { env: ENV, run })).rejects.toMatchObject({ code: 'FORBIDDEN' });
            await expect(invokeCapability(ictx(), 'orders.approve', { orderIds: ['o1'] }, 'chat', { env: ENV, run, approval: { pendingActionId: 'x y' } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
            expect(run).not.toHaveBeenCalled();
        });
        it('onayli: toplu uc + idempotencyKey = pendingActionId; cikti sablon verisi', async () => {
            const run = mkRun(raw);
            const r = await invokeCapability(ictx(), 'orders.approve', { orderIds: ['o1', 'o2', 'o3'] }, 'chat', { env: ENV, run, approval: { pendingActionId: 'pa-11111111' } });
            const [, service, op, body, , meta] = (run as jest.Mock).mock.calls[0] as any[];
            expect([service, op, body]).toEqual(['OrderService', 'bulkApproveOrder', { orderIds: ['o1', 'o2', 'o3'] }]);
            expect(meta.idempotencyKey).toBe('pa-11111111');
            expect(r.data).toEqual({ approved: 2, failed: 1, failures: [{ orderId: 'o3', reason: 'Statü uygun değil.' }] });
        });
        it('LIVE_READONLY -> 423 (onayli olsa da, servis cagrilmaz); okuma etkilenmez', async () => {
            const run = mkRun(raw);
            await expect(invokeCapability(ictx(), 'orders.approve', { orderIds: ['o1'] }, 'chat', { env: env({ liveReadonly: true }), run, approval: { pendingActionId: 'pa-11111111' } })).rejects.toMatchObject({ code: 'LIVE_READONLY', status: 423 });
            expect(run).not.toHaveBeenCalled();
            await expect(invokeCapability(ictx(), 'orders.list', {}, 'chat', { env: env({ liveReadonly: true }), run: mkRun({ orders: [], totalNumberOfRecords: 0 }) })).resolves.toBeDefined();
        });
        it('impersonation -> yazma IMPERSONATION_FORBIDDEN; okuma serbest', async () => {
            const run = mkRun(raw);
            await expect(invokeCapability(ictx('member', { imp: true }), 'orders.approve', { orderIds: ['o1'] }, 'chat', { env: env({ imp: true }), run, approval: { pendingActionId: 'pa-11111111' } })).rejects.toMatchObject({ code: 'IMPERSONATION_FORBIDDEN', status: 403 });
            expect(run).not.toHaveBeenCalled();
            await expect(invokeCapability(ictx('member', { imp: true }), 'orders.list', {}, 'chat', { env: env({ imp: true }), run: mkRun({ orders: [], totalNumberOfRecords: 0 }) })).resolves.toBeDefined();
        });
        it('bakim -> yazma 503 MAINTENANCE; kill-switch -> 503 CAPABILITY_DISABLED', async () => {
            const run = mkRun(raw);
            await expect(invokeCapability(ictx(), 'orders.approve', { orderIds: ['o1'] }, 'chat', { env: env({ maintenance: true }), run, approval: { pendingActionId: 'pa-11111111' } })).rejects.toMatchObject({ code: 'MAINTENANCE', status: 503 });
            await expect(invokeCapability(ictx(), 'orders.list', {}, 'chat', { env: env({ disabled: new Set(['orders.list']) }), run })).rejects.toMatchObject({ code: 'CAPABILITY_DISABLED', status: 503 });
            expect(run).not.toHaveBeenCalled();
        });
    });

    it('cikti boyut siniri 256 KB: asarsa PAYLOAD_TOO_LARGE; sema uyumsuzsa ic hata (ham cikti sizmaz)', async () => {
        const big = Array.from({ length: 50 }, (_, i) => order({ orderNumber: 'X'.repeat(6000) + i }));
        await expect(invokeCapability(ictx(), 'orders.list', {}, 'chat', { env: ENV, run: mkRun({ totalNumberOfRecords: 50, orders: big }) })).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
        const err = await invokeCapability(ictx('admin'), 'integrations.health.get', {}, 'chat', { env: ENV, run: mkRun({ integrations: [{ integrationCode: 'a', health: 'weird', rawSecret: 'sk-1' }] }) }).catch((e) => e);
        expect(err).toMatchObject({ status: 500, expose: false });
        expect(JSON.stringify(err.message)).not.toContain('sk-1');
    });
    it('reports.sales.summary / stock.low_list / products.search / integrations.health.get: projeksiyon + strip', async () => {
        const sales = await invokeCapability(ictx(), 'reports.sales.summary', {}, 'chat', { env: ENV, run: mkRun({ totals: { orderCount: 10, revenue: 500, returnCount: 1, returnAmount: 20 }, today: { count: 3, revenue: 120 }, trend: { countChange: 50, revenueChange: -10 }, pending: { invoiceCount: 1, shippingCount: 2, claimCount: 0, messageCount: 4 }, last7Days: [{ date: '2026-09-30', count: 3, revenue: 120 }], statusDistribution: { X: 1 } }) });
        expect(sales.data).toMatchObject({ currency: 'TRY', today: { orders: 3, revenue: 120 }, changeVsYesterdayPct: { orders: 50, revenue: -10 }, pending: { shipping: 2 }, last7Days: [{ date: '2026-09-30', orders: 3, revenue: 120 }] });
        expect(JSON.stringify(sales.data)).not.toContain('statusDistribution');

        const runLow = mkRun({ enabled: true, threshold: 5, thresholdSource: 'tenant', channel: null, items: [{ variantId: 'v1', productId: 'p1', sku: 'S', barcode: null, stock: 3, reserved: 1, available: 2 }], nextCursor: 'abc_def' });
        const low = await invokeCapability(ictx(), 'stock.low_list', { threshold: 5 }, 'chat', { env: ENV, run: runLow });
        expect((runLow as jest.Mock).mock.calls[0][3]).toEqual({ threshold: 5, limit: 25 });
        expect(low.data).toMatchObject({ enabled: true, threshold: 5, nextCursor: 'abc_def', items: [{ variantId: 'v1', available: 2 }] });
        expect(JSON.stringify(low.data)).not.toContain('thresholdSource');

        const runP = mkRun({ totalNumberOfRecords: 1, products: [{ _id: 'p1', title: 'T-shirt', stockcode: 'TS-1', stock: 4, prices: { minSalePrice: 10, maxSalePrice: 12 }, variants: [{ stockcode: 'TS-1', barcode: '869' }, {}], description: 'gizli', platforms: { x: 1 } }] });
        const prod = await invokeCapability(ictx(), 'products.search', { query: 'shirt', cursor: 'p2', limit: 5 }, 'chat', { env: ENV, run: runP });
        expect((runP as jest.Mock).mock.calls[0][3]).toEqual({ searchProductForm: { data: { searchText: 'shirt' }, pagination: { page: 2, limit: 5 } } });
        expect(prod.data).toEqual({ items: [{ id: 'p1', title: 'T-shirt', sku: 'TS-1', barcode: '869', stock: 4, minPrice: 10, maxPrice: 12, variantCount: 2 }], total: 1, nextCursor: null });

        const health = await invokeCapability(ictx('admin'), 'integrations.health.get', {}, 'chat', { env: ENV, run: mkRun({ generatedAt: new Date('2026-09-30T00:00:00Z'), integrations: [{ integrationCode: 'trendyol', type: 'marketplace', enabled: true, credentialsConfigured: true, lastSuccessfulSyncAt: null, webhook: { healthy: true }, lastError: { code: 'AUTH', at: new Date(), httpStatus: 401, operation: 'x' }, circuit: { state: 'closed' }, last24h: { total: 10, success: 8, error: 2 }, health: 'degraded' }] }) });
        expect(health.data).toMatchObject({ integrations: [{ code: 'trendyol', health: 'degraded', circuit: 'closed', calls24h: 10, errors24h: 2, lastErrorCode: 'AUTH' }] });
        expect(JSON.stringify(health.data)).not.toContain('webhook');
    });
    it('maskPerson: bas harf + yildiz', () => {
        expect(maskPerson('ayşe', 'yılmaz')).toBe('A*** Y***');
        expect(maskPerson('', 'Kaya')).toBe('K***');
        expect(maskPerson(undefined, undefined)).toBe('');
    });
});
