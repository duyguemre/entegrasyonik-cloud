/**
 * CHAT-BR-3: denetim (alan testi, PII yok), metrikler (dusuk kardinalite), bakim muafiyeti, salt-okunur bilgi (impersonation/LIVE_READONLY),
 * onay kartindan ONCE model kaynakli kimlik dogrulamasi. DB/Redis/ag YOK (MemoryKv, AuditLogger.setSink, sahte run).
 */
import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals';
import http from 'http';
import express from 'express';
import { AgentBroker, type AgentCtx } from '../../../src/operations/agent/AgentBroker';
import { MemoryKv } from '../../../src/operations/agent/kv';
import { createToolRuntime, type RefProblem } from '../../../src/operations/agent/tools';
import { summarizeParams, outcomeOfCode } from '../../../src/operations/agent/agentTelemetry';
import { REF_VERIFIERS } from '../../../src/operations/agent/refVerifiers';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import { AuditLogSchema } from '../../../src/database/application/models/AuditLog';
import { metricsRegistry } from '../../../src/platform/runtime/metrics';
import { withTestContext } from '../../../src/platform/core/context';
import { isMaintenanceBlocked } from '../../../src/api/http/maintenanceGuard';
import { configureAgentRoutes } from '../../../src/api/http/agentRoutes';
import { errorHandler, notFoundHandler } from '../../../src/api/http/errorEnvelope';
import { config } from '../../../src/config';
import { ROLE_PERMISSIONS } from '../../../src/capabilities/roles';
import { ServerEventSchema, type ConfirmPart, type ServerEvent, type TurnRequest } from '../../../src/operations/agent/protocol/v1';
import { LlmError, type LlmEvent, type LlmProvider, type LlmStreamRequest } from '../../../src/platform/llm';

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const treq = (text: string): TurnRequest => ({ v: 1, conversationId: null, clientTurnId: uuid(), locale: 'tr', input: { kind: 'text', text } });

function mkctx(o: { tid?: number; userId?: string; imp?: boolean } = {}): AgentCtx {
    const tid = o.tid ?? 7; const userId = o.userId ?? 'u1';
    return {
        tid, userId, canConfigure: false, canConsent: false, readOnly: false,
        session: { actor: { tier: 'member' }, invoke: { userContext: { order: tid }, principal: { sub: userId, tid, ...(o.imp ? { imp: true } : {}) }, ip: '10.0.0.9' } },
    };
}
class SeqProvider implements LlmProvider {
    readonly id = 'seq'; seen: LlmStreamRequest[] = [];
    constructor(private readonly rounds: LlmEvent[][]) { }
    async *stream(req: LlmStreamRequest): AsyncIterable<LlmEvent> {
        const i = this.seen.length; this.seen.push({ ...req, messages: [...req.messages] });
        for (const e of this.rounds[Math.min(i, this.rounds.length - 1)]) yield e;
    }
}
const call = (name: string, input: unknown): LlmEvent => ({ type: 'tool-call', id: `c${++n}`, name, input });
const done = (r: 'stop' | 'tool_use' = 'stop'): LlmEvent => ({ type: 'done', reason: r });
const txt = (t: string): LlmEvent => ({ type: 'text-delta', text: t });

const order = (i: number) => ({ _id: `oid${i}`, orderNumber: `N-${i}`, integrationCode: 'trendyol', internalStatus: 'AWAITING_APPROVAL', billingAddress: { firstName: 'Ayşe', lastName: 'Yılmaz' }, financials: { grandTotal: 100, currencyCode: 'TRY' }, dates: { orderDate: new Date('2026-09-30T10:00:00Z') }, items: [{ quantity: 1 }], fulfillment: [] });
const approveRaw = { success: true, data: { successCount: 2, failedCount: 0, successful: [], failed: [] } };
const mkRun = (impl: (...a: any[]) => unknown) => jest.fn(async (...a: any[]) => impl(...a)) as any;

const state = { maint: false, liveReadonly: false, verify: undefined as undefined | ((capId: string, input: any) => Promise<RefProblem | undefined>) };
const brokers: AgentBroker[] = [];
function mk(provider: LlmProvider, run: any) {
    const clock = { t: Date.parse('2026-10-01T10:00:00Z') };
    const kv = new MemoryKv(() => clock.t);
    const rt = createToolRuntime({
        isMaintenance: () => state.maint, run, entitled: async () => () => true,
        env: (c) => ({ liveReadonly: state.liveReadonly, maintenance: state.maint, disabled: new Set<string>(), imp: c.session?.invoke.principal?.imp === true }),
        verifyRefs: async (_c, capId, input) => state.verify?.(capId, input),
    });
    const b = new AgentBroker({ kv: () => kv, isEnabled: () => true, isMaintenance: () => state.maint, resolveProvider: async () => ({ provider }), tools: rt, now: () => clock.t, turnsPerMinute: 1000 });
    brokers.push(b);
    return { b, kv, clock };
}
async function turn(b: AgentBroker, c: AgentCtx, r: TurnRequest): Promise<ServerEvent[]> {
    const out: ServerEvent[] = [];
    const t = await b.beginTurn(c, r);
    await t.run((e) => out.push(e), new AbortController().signal);
    for (const e of out) expect(ServerEventSchema.safeParse(e).success).toBe(true);
    return out;
}
async function confirm(b: AgentBroker, c: AgentCtx, pa: ConfirmPart, decision: 'approve' | 'reject', convId: string): Promise<ServerEvent[]> {
    const out: ServerEvent[] = [];
    const r = await b.beginConfirm(c, { v: 1, conversationId: convId, pendingActionId: pa.pendingActionId, decision, idempotencyKey: uuid() });
    await r.run((e) => out.push(e));
    return out;
}
const parts = (evs: ServerEvent[]) => evs.filter((e): e is Extract<ServerEvent, { type: 'part' }> => e.type === 'part').map((e) => e.part);
const convOf = (evs: ServerEvent[]) => (evs.find((e) => e.type === 'turn.start') as any).conversationId as string;
const card = (evs: ServerEvent[]) => parts(evs).find((p) => p.type === 'confirm') as ConfirmPart;

let audit: Array<Record<string, any>> = [];
const flush = async () => { await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); };
beforeEach(() => {
    audit = []; state.maint = false; state.liveReadonly = false; state.verify = undefined;
    AuditLogger.setSink(async (r) => { audit.push(r); });
    metricsRegistry.drain();
});
afterEach(() => { AuditLogger.setSink(undefined); brokers.splice(0).forEach((x) => x.stop()); jest.restoreAllMocks(); });

const ids = ['ZZORD-1', 'ZZORD-2'];
const series = (metric: string) => metricsRegistry.drain().filter((s) => s.metric === metric);

describe('denetim: surface enum + kayitlar', () => {
    it('AuditLog sema enum: chat, backoffice_chat, mcp (geriye uyumlu: app/backoffice kaldi)', () => {
        const e = (AuditLogSchema.path('surface') as any).enumValues as string[];
        expect(e).toEqual(expect.arrayContaining(['app', 'backoffice', 'chat', 'backoffice_chat', 'mcp']));
    });

    it('okuma cagrisi, onay karti onerisi, onay ve yazma yurutmesi denetlenir; PII/deger/sohbet metni YOK', async () => {
        const run = mkRun((_u: any, _s: string, op: string) => (op === 'getOrders' ? { totalNumberOfRecords: 1, orders: [order(1)] } : approveRaw));
        const prov = new SeqProvider([
            [call('orders_list', { search: 'ayse@example.com' }), done('tool_use')], [txt('bitti'), done()],
            [call('orders_approve', { orderIds: ids }), done('tool_use')],
        ]);
        const { b } = mk(prov, run);
        const c = mkctx();
        await withTestContext({ requestId: 'req-corr-0001' }, async () => {
            await turn(b, c, treq('ayse@example.com siparişleri'));
            const tev = await turn(b, c, treq('onayla'));
            await confirm(b, c, card(tev), 'approve', convOf(tev));
        });
        await flush();
        const ev = audit.filter((a) => a.event.startsWith('agent.'));
        expect(ev.map((a) => `${a.event}:${a.meta.capabilityId ?? '-'}:${a.meta.stage ?? a.meta.decision ?? '-'}:${a.meta.outcome}`)).toEqual([
            'agent.tool_call:orders.list:-:ok',
            'agent.tool_call:orders.approve:proposed:ok',
            'agent.confirm:orders.approve:approve:ok',
            'agent.write:orders.approve:executed:ok',
        ]);
        for (const a of ev) {
            expect(a).toMatchObject({ surface: 'chat', sub: 'u1', tid: 7, ip: '10.0.0.9', actorType: 'user' });
            expect(a.result).toBe('ok');
            expect(a.imp).toBeUndefined();
            expect(a.meta.corrId).toBe('req-corr-0001');
            expect(a.reqId).toBe('req-corr-0001');
        }
        expect(ev[0].meta).toMatchObject({ version: '1.1', params: 'search', turnId: expect.any(String) });
        expect(ev[1].meta.params).toBe('orderIds[2]');
        expect(ev[3].meta.pendingActionId).toBe(ev[2].meta.pendingActionId);
        // alan testi: hicbir kayitta girdi degeri / sohbet metni / musteri adi yok
        const blob = JSON.stringify(audit);
        for (const secret of ['ayse@example.com', 'Ayşe', 'Yılmaz', 'ZZORD', 'onayla', 'siparişleri', 'bitti']) expect(blob).not.toContain(secret);
    });

    it('ret ve suresi dolmus onay denetlenir (ok/expired); impersonation imp+onBehalfOf+impersonator yazar', async () => {
        const run = mkRun(() => approveRaw);
        const prov = new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')]]);
        const { b, clock } = mk(prov, run);
        const c = mkctx();
        const t1 = await turn(b, c, treq('bir'));
        await confirm(b, c, card(t1), 'reject', convOf(t1));
        const t2 = await turn(b, c, treq('iki'));
        clock.t += 6 * 60_000;
        await expect(confirm(b, c, card(t2), 'approve', convOf(t2))).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED' });
        await flush();
        const conf = audit.filter((a) => a.event === 'agent.confirm');
        expect(conf.map((a) => `${a.meta.decision}:${a.meta.outcome}:${a.result}`)).toEqual(['reject:ok:ok', 'approve:expired:fail']);
        expect(conf[1].meta.code).toBe('CONFIRM_EXPIRED');
        expect(run).not.toHaveBeenCalled();

        audit.length = 0;
        const imp = mkctx({ imp: true, userId: 'admin-sub' });
        const p2 = new SeqProvider([[call('orders_list', {}), done('tool_use')], [txt('x'), done()]]);
        await turn(mk(p2, mkRun(() => ({ totalNumberOfRecords: 0, orders: [] }))).b, imp, treq('liste'));
        await flush();
        expect(audit.find((a) => a.event === 'agent.tool_call')).toMatchObject({ sub: 'admin-sub', tid: 7, actorType: 'impersonator', imp: true, onBehalfOf: 7, surface: 'chat' });
    });

    it('dogrulama hatasi error+VALIDATION olarak denetlenir; hata kodu -> sonuc esleme', async () => {
        const prov = new SeqProvider([[call('orders_list', { limit: 9999 }), done('tool_use')], [txt('x'), done()]]);
        const { b } = mk(prov, mkRun(() => ({})));
        await turn(b, mkctx(), treq('x'));
        await flush();
        expect(audit.find((a) => a.event === 'agent.tool_call')).toMatchObject({ result: 'error', meta: { outcome: 'error', code: 'VALIDATION', params: 'limit' } });
        expect(outcomeOfCode('LIVE_READONLY')).toBe('denied');
        expect(outcomeOfCode('QUOTA_EXCEEDED')).toBe('rate_limited');
        expect(outcomeOfCode('CONFIRM_EXPIRED')).toBe('expired');
        expect(outcomeOfCode('INTERNAL')).toBe('error');
    });

    it('summarizeParams: yalniz alan adlari (+dizi uzunlugu), deger yok', () => {
        expect(summarizeParams({ orderIds: ['x', 'y'], note: 'gizli@x.com', n: 5 })).toBe('orderIds[2],note,n');
        expect(summarizeParams(null)).toBe('');
        expect(summarizeParams('str')).toBe('');
    });
});

describe('metrikler: dusuk kardinalite, tenant etiketi yok', () => {
    it('agent_turns_total / agent_tool_calls_total / agent_confirm_total / agent_llm_errors_total', async () => {
        const run = mkRun((_u: any, _s: string, op: string) => (op === 'getOrders' ? { totalNumberOfRecords: 0, orders: [] } : approveRaw));
        const { b } = mk(new SeqProvider([[call('orders_list', {}), done('tool_use')], [txt('ok'), done()], [call('orders_approve', { orderIds: ids }), done('tool_use')]]), run);
        const c = mkctx();
        await turn(b, c, treq('a'));
        const t2 = await turn(b, c, treq('b'));
        await confirm(b, c, card(t2), 'approve', convOf(t2));
        // eslint-disable-next-line require-yield -- saglayici akis baslamadan hata verir
        const bad: LlmProvider = { id: 'bad', async *stream() { throw new LlmError('LLM_QUOTA'); } };
        await turn(mk(bad, run).b, mkctx({ tid: 8 }), treq('c'));
        const all = metricsRegistry.drain();
        const by = (m: string) => all.filter((s) => s.metric === m).map((s) => `${Object.entries(s.labels).sort().map(([k, v]) => `${k}=${v}`).join(',')}#${s.count}`).sort();
        expect(by('agent_turns_total')).toEqual(['outcome=awaiting-confirm,surface=chat#1', 'outcome=completed,surface=chat#1', 'outcome=error,surface=chat#1']);
        expect(by('agent_tool_calls_total')).toEqual(['capabilityId=orders.approve,outcome=ok,surface=chat#1', 'capabilityId=orders.list,outcome=ok,surface=chat#1']);
        expect(by('agent_confirm_total')).toEqual(['decision=approve,outcome=ok#1']);
        expect(by('agent_llm_errors_total')).toEqual(['class=LLM_QUOTA#1']);
        expect(all.filter((s) => s.metric === 'agent_turn_ms')).toHaveLength(1);
        expect(all.filter((s) => s.metric === 'agent_confirm_wait_ms')).toHaveLength(1);
        for (const s of all.filter((x) => x.metric.startsWith('agent_'))) expect(JSON.stringify(s.labels)).not.toMatch(/tenant|tid|user/i);
    });

    it('onay ucu reddi (suresi dolmus) agent_confirm_total{outcome=expired}', async () => {
        const { b, clock } = mk(new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')]]), mkRun(() => approveRaw));
        const c = mkctx();
        const t = await turn(b, c, treq('x'));
        metricsRegistry.drain();
        clock.t += 6 * 60_000;
        await expect(confirm(b, c, card(t), 'approve', convOf(t))).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED' });
        expect(series('agent_confirm_total')[0]).toMatchObject({ labels: { decision: 'approve', outcome: 'expired' }, count: 1 });
    });
});

describe('bakim: sohbet muaf, yetenek duzeyinde kural', () => {
    it('maintenanceGuard: /agent/{turns,confirm,more,info,conversations/:id} muaf; provider ayar yazimi muaf DEGIL; diger yazmalar hala 503', () => {
        for (const p of ['agent/turns', 'agent/confirm', 'agent/more']) expect([p, isMaintenanceBlocked('POST', p)]).toEqual([p, false]);
        expect(isMaintenanceBlocked('DELETE', 'agent/conversations/abc-123')).toBe(false);
        expect(isMaintenanceBlocked('PUT', 'agent/provider')).toBe(true);
        expect(isMaintenanceBlocked('POST', 'agent/provider/test')).toBe(true);
        expect(isMaintenanceBlocked('POST', 'ProductService/updateProduct')).toBe(true);
        expect(isMaintenanceBlocked('POST', 'agent/unknown')).toBe(true);
    });

    it('bakimda okuma turu calisir (tablo), yazma araci listede yok, onay ucu 503, ret serbest', async () => {
        const run = mkRun(() => ({ totalNumberOfRecords: 1, orders: [order(1)] }));
        const prov = new SeqProvider([[call('orders_list', {}), done('tool_use')], [txt('ok'), done()]]);
        state.maint = true;
        const { b } = mk(prov, run);
        const evs = await turn(b, mkctx(), treq('siparişler'));
        expect(parts(evs).some((p) => p.type === 'table')).toBe(true);
        expect(prov.seen[0].tools.map((t) => t.name)).not.toContain('orders_approve');
        expect(prov.seen[0].tools.map((t) => t.name)).toContain('orders_list');

        state.maint = false;
        const p2 = new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')]]);
        const m2 = mk(p2, mkRun(() => approveRaw));
        const c = mkctx();
        const t = await turn(m2.b, c, treq('onayla'));
        state.maint = true;
        await expect(confirm(m2.b, c, card(t), 'approve', convOf(t))).rejects.toMatchObject({ code: 'MAINTENANCE', status: 503 });
        expect((parts(await confirm(m2.b, c, card(t), 'reject', convOf(t)))[0] as ConfirmPart).state).toBe('rejected');
    });
});

describe('LIVE_READONLY / impersonation: info.readOnly + zorla cagri', () => {
    it('kart uretildikten sonra LIVE_READONLY acilirsa onay -> yurutme yok, kart failed (LIVE_READONLY iletisi), denetimde denied', async () => {
        const run = mkRun(() => approveRaw);
        const { b } = mk(new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')]]), run);
        const c = mkctx();
        const t = await turn(b, c, treq('x'));
        state.liveReadonly = true;
        const evs = await confirm(b, c, card(t), 'approve', convOf(t));
        const last = parts(evs).pop() as ConfirmPart;
        expect(last.state).toBe('failed');
        expect(last.result!.message).toMatch(/salt-okuma/i);
        expect(run).not.toHaveBeenCalled();
        await flush();
        expect(audit.find((a) => a.event === 'agent.write')).toMatchObject({ result: 'fail', meta: { outcome: 'denied', code: 'LIVE_READONLY' } });
    });

    describe('HTTP: GET /api/agent/info readOnly', () => {
        let server: http.Server | undefined; let broker: AgentBroker | undefined;
        afterEach(async () => { broker?.stop(); await new Promise((r) => (server ? server.close(r) : r(undefined))); server = undefined; });
        async function info(principal: Record<string, unknown>): Promise<any> {
            broker = new AgentBroker({ kv: () => new MemoryKv(), isEnabled: () => true, isMaintenance: () => false, resolveProvider: async () => ({ provider: new SeqProvider([[done()]]) }) });
            const app = express();
            app.use((_req, res, next) => {
                res.locals.principal = principal; res.locals.userContext = { order: principal.tid };
                res.locals.actor = { sub: principal.sub, tid: principal.tid, role: 'operator', permissions: ROLE_PERMISSIONS.operator, actorType: 'user' };
                next();
            });
            configureAgentRoutes(app, '/api', { broker: () => broker! });
            app.use(notFoundHandler); app.use(errorHandler);
            const srv = await new Promise<http.Server>((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
            server = srv;
            const port = (srv.address() as any).port as number;
            const body = await new Promise<any>((resolve, reject) => {
                http.get({ host: '127.0.0.1', port, path: '/api/agent/info' }, (res) => {
                    let buf = ''; res.on('data', (d) => { buf += d; }); res.on('end', () => resolve(JSON.parse(buf)));
                }).on('error', reject);
            });
            await new Promise((r) => srv.close(r)); server = undefined; broker.stop();
            return body;
        }
        it('normal: false; impersonation: true; LIVE_READONLY: true', async () => {
            expect((await info({ sub: 'u1', tid: 1 })).readOnly).toBe(false);
            expect((await info({ sub: 'admin', tid: 1, imp: true })).readOnly).toBe(true);
            jest.replaceProperty(config.liveReadonly, 'enabled', true);
            expect((await info({ sub: 'u1', tid: 1 })).readOnly).toBe(true);
        });
    });
});

describe('onay oncesi kimlik dogrulamasi (model kaynakli kimlikler)', () => {
    it('var olmayan kimlik -> KART YOK, anlasilir hata parcasi, PendingAction yok, model nedenini gorur; denetim error', async () => {
        const run = mkRun(() => approveRaw);
        state.verify = async (capId, input) => (capId === 'orders.approve' ? { code: 'ENTITY_NOT_FOUND', missing: input.orderIds.filter((i: string) => i !== 'a1') } : undefined);
        const prov = new SeqProvider([[call('orders_approve', { orderIds: ['a1', 'uydurma9'] }), done('tool_use')], [txt('Bulunamadı.'), done()]]);
        const { b, kv } = mk(prov, run);
        const evs = await turn(b, mkctx(), treq('onayla'));
        expect(card(evs)).toBeUndefined();
        const text = parts(evs).filter((p) => p.type === 'text').map((p: any) => p.text).join('\n');
        expect(text).toMatch(/bulunamadı/i);
        expect(text).toContain('uydurma9');
        expect(evs[evs.length - 1]).toMatchObject({ type: 'turn.end', status: 'completed' }); // awaiting-confirm DEGIL
        expect(kv.keys().filter((k) => k.startsWith('agent:pa:'))).toHaveLength(0);
        expect(run).not.toHaveBeenCalled();
        const toolMsg = prov.seen[1].messages.find((m) => m.role === 'tool') as any;
        expect(JSON.parse(toolMsg.content)).toMatchObject({ error: 'ENTITY_NOT_FOUND' });
        await flush();
        expect(audit.find((a) => a.event === 'agent.tool_call')).toMatchObject({ result: 'error', meta: { code: 'ENTITY_NOT_FOUND' } });
    });

    it('dogrulayici hata verirse (DB) kart uretilmez, INTERNAL iletisi, sir sizmaz', async () => {
        state.verify = async () => { throw new Error('mongo: secret-conn'); };
        const { b, kv } = mk(new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')], [txt('x'), done()]]), mkRun(() => approveRaw));
        const evs = await turn(b, mkctx(), treq('onayla'));
        expect(card(evs)).toBeUndefined();
        expect(JSON.stringify(evs)).not.toContain('secret-conn');
        expect(kv.keys().filter((k) => k.startsWith('agent:pa:'))).toHaveLength(0);
    });

    it('gecerli kimlikler -> kart uretilir (dogrulayici gecti)', async () => {
        state.verify = async () => undefined;
        const { b } = mk(new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')]]), mkRun(() => approveRaw));
        expect(card(await turn(b, mkctx(), treq('onayla')))).toBeDefined();
    });

    it('REF_VERIFIERS orders.approve: tenant DB sorgusu (ClientDB tid ile secilir); bicimsiz kimlik sorgulanmaz, eksikler doner', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- DatabaseManager'i yalniz bu testte yukle
        const dbm = require('../../../src/database/DatabaseManager') as typeof import('../../../src/database/DatabaseManager');
        const good = 'a'.repeat(24); const other = 'b'.repeat(24);
        const find = jest.fn((_q: any, _p: any) => ({ lean: async () => [{ _id: { toString: () => good } }] }));
        const getClientDB = jest.fn(async (_tid: number) => ({ getOrderModel: () => ({ find }) }));
        jest.spyOn(dbm.DatabaseManagerInstance, 'getClientDB').mockImplementation(getClientDB as any);
        const missing = await REF_VERIFIERS['orders.approve'](42, { orderIds: [good, other, 'uydurma', good] });
        expect(getClientDB).toHaveBeenCalledWith(42);
        expect((find.mock.calls[0][0] as any)._id.$in).toEqual([good, other]); // 'uydurma' (ObjectId degil) sorguya girmez
        expect(missing).toEqual([other, 'uydurma']);
    });
});
