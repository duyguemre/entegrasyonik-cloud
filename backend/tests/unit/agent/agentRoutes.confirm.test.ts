/**
 * CHAT-BR-2: /api/agent/{turns (arac), confirm, more} HTTP davranisi. Gercek Express + loopback; DB/Redis YOK (MemoryKv),
 * RunOperation sahte `run`. Kimlik `authenticate` yerine test middleware'iyle kurulur (userContext = oturumda cozulen baglam).
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import http from 'http';
import express from 'express';
import { configureAgentRoutes } from '../../../src/api/http/agentRoutes';
import { errorHandler, notFoundHandler } from '../../../src/api/http/errorEnvelope';
import { AgentBroker } from '../../../src/operations/agent/AgentBroker';
import { MemoryKv } from '../../../src/operations/agent/kv';
import { createToolRuntime } from '../../../src/operations/agent/tools';
import { ServerEventSchema, type ConfirmPart, type ServerEvent } from '../../../src/operations/agent/protocol/v1';
import { ROLE_PERMISSIONS } from '../../../src/capabilities/roles';
import type { LlmEvent, LlmProvider } from '../../../src/platform/llm';

let server: http.Server; let port: number; let broker: AgentBroker; let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const reactive = (name: string, input: unknown): LlmProvider => ({
    id: 'reactive',
    async *stream(req) {
        const last = req.messages[req.messages.length - 1];
        const evs: LlmEvent[] = last.role === 'tool' ? [{ type: 'text-delta', text: 'tamam' }, { type: 'done', reason: 'stop' }] : [{ type: 'tool-call', id: 'c1', name, input }, { type: 'done', reason: 'tool_use' }];
        yield* evs;
    },
});

const order = (i: number) => ({ _id: `oid${i}`, orderNumber: `N-${i}`, integrationCode: 'trendyol', internalStatus: 'AWAITING_APPROVAL', billingAddress: { firstName: 'A', lastName: 'B' }, financials: { grandTotal: 10, currencyCode: 'TRY' }, dates: { orderDate: new Date() }, items: [], fulfillment: [] });
let run: jest.Mock;

async function start(provider: LlmProvider) {
    const kv = new MemoryKv();
    run = jest.fn(async (_uc: any, _s: string, op: string) => (op === 'getOrders'
        ? { totalNumberOfRecords: 120, orders: Array.from({ length: 50 }, (_, i) => order(i)) }
        : { success: true, data: { successCount: 2, failedCount: 0, successful: [], failed: [] } })) as jest.Mock;
    broker = new AgentBroker({
        kv: () => kv, isEnabled: () => true, isMaintenance: () => false, resolveProvider: async () => ({ provider }), turnsPerMinute: 1000,
        tools: createToolRuntime({ isMaintenance: () => false, run: run as any, env: () => ({ liveReadonly: false, maintenance: false, disabled: new Set(), imp: false }), entitled: async () => () => true }),
    });
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const raw = req.headers['x-test-principal'];
        if (typeof raw !== 'string') { res.status(401).send({ error: 'Token not verified' }); return; }
        const p = JSON.parse(raw) as { sub: string; tid?: number };
        res.locals.principal = { sub: p.sub, tid: p.tid };
        res.locals.userContext = { order: p.tid };
        res.locals.actor = { sub: p.sub, tid: p.tid, role: 'operator', permissions: ROLE_PERMISSIONS.operator, actorType: 'user' };
        next();
    });
    configureAgentRoutes(app, '/api', { broker: () => broker });
    app.use(notFoundHandler);
    app.use(errorHandler);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => { port = (server.address() as any).port; resolve(); }); });
}
afterEach(async () => { broker?.stop(); await new Promise((r) => server.close(r)); });

const P = (sub: string, tid = 1) => JSON.stringify({ sub, tid });
function call(method: string, path: string, principal: string | undefined, body?: unknown): Promise<{ status: number; text: string; json(): any; events(): ServerEvent[] }> {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const h: Record<string, string> = {};
        if (principal) h['x-test-principal'] = principal;
        if (payload) { h['content-type'] = 'application/json'; h['content-length'] = String(Buffer.byteLength(payload)); }
        const req = http.request({ host: '127.0.0.1', port, path, method, headers: h }, (res) => {
            let buf = ''; res.setEncoding('utf8'); res.on('data', (c) => { buf += c; });
            res.on('end', () => resolve({
                status: res.statusCode!, text: buf, json: () => JSON.parse(buf),
                events: () => buf.split('\n\n').filter((b) => b.startsWith('event: ')).map((b) => JSON.parse(b.split('\n')[1].replace(/^data: /, ''))),
            }));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}
const turn = (text: string, extra: object = {}) => ({ v: 1, conversationId: null, clientTurnId: uuid(), locale: 'tr', input: { kind: 'text', text }, ...extra });
const confirmBody = (pa: ConfirmPart, conv: string, decision: 'approve' | 'reject') => ({ v: 1, conversationId: conv, pendingActionId: pa.pendingActionId, decision, idempotencyKey: uuid() });
const cardOf = (evs: ServerEvent[]) => (evs.find((e) => e.type === 'part' && e.part.type === 'confirm') as any).part as ConfirmPart;
const convOf = (evs: ServerEvent[]) => (evs[0] as any).conversationId as string;

describe('POST /api/agent/turns -> POST /api/agent/confirm (uctan uca)', () => {
    it('tur: onay karti + awaiting-confirm; confirm: SSE (turn.start yok) executing -> done; tekrar gonderim ayni akis, tek uygulama', async () => {
        await start(reactive('orders_approve', { orderIds: ['a1', 'b2'] }));
        const t = await call('POST', '/api/agent/turns', P('u1'), turn('onayla'));
        expect(t.status).toBe(200);
        const evs = t.events();
        for (const e of evs) expect(ServerEventSchema.safeParse(e).success).toBe(true);
        expect(evs[evs.length - 1]).toMatchObject({ type: 'turn.end', status: 'awaiting-confirm' });
        expect(run).not.toHaveBeenCalled();
        const pa = cardOf(evs); const conv = convOf(evs);

        const c1 = await call('POST', '/api/agent/confirm', P('u1'), confirmBody(pa, conv, 'approve'));
        expect(c1.status).toBe(200);
        const ce = c1.events();
        expect(ce.some((e) => e.type === 'turn.start')).toBe(false);
        expect(ce.filter((e) => e.type === 'part').map((e: any) => e.part.state)).toEqual(['executing', 'done']);
        expect(run).toHaveBeenCalledTimes(1);
        expect((run.mock.calls[0] as any[])[5].idempotencyKey).toBe(pa.pendingActionId);

        const c2 = await call('POST', '/api/agent/confirm', P('u1'), confirmBody(pa, conv, 'approve'));
        expect(c2.status).toBe(200);
        expect(c2.events()).toEqual(ce);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('hatalar SSE baslamadan JSON zarfiyla: 401, 400 (govde), 410 CONFIRM_EXPIRED (bilinmeyen / baska kullanici / baska tenant)', async () => {
        await start(reactive('orders_approve', { orderIds: ['a1'] }));
        const evs = (await call('POST', '/api/agent/turns', P('u1'), turn('onayla'))).events();
        const pa = cardOf(evs); const conv = convOf(evs);
        expect((await call('POST', '/api/agent/confirm', undefined, confirmBody(pa, conv, 'approve'))).status).toBe(401);
        const bad = await call('POST', '/api/agent/confirm', P('u1'), { v: 1, decision: 'approve' });
        expect([bad.status, bad.json().code]).toEqual([400, 'VALIDATION']);
        const proto = await call('POST', '/api/agent/confirm', P('u1'), { ...confirmBody(pa, conv, 'approve'), v: 2 });
        expect([proto.status, proto.json().code]).toEqual([400, 'PROTOCOL']);
        for (const pr of [P('u2'), P('u1', 2)]) {
            const r = await call('POST', '/api/agent/confirm', pr, confirmBody(pa, conv, 'approve'));
            expect([r.status, r.json().code]).toEqual([410, 'CONFIRM_EXPIRED']);
        }
        const unknown = await call('POST', '/api/agent/confirm', P('u1'), { ...confirmBody(pa, conv, 'approve'), pendingActionId: 'yok-yok-yok-yok' });
        expect([unknown.status, unknown.json().code]).toEqual([410, 'CONFIRM_EXPIRED']);
        expect(run).not.toHaveBeenCalled();
        expect((await call('POST', '/api/agent/confirm', P('u1'), confirmBody(pa, conv, 'reject'))).status).toBe(200); // sahibi hala karar verebilir
    });

    it('ret: 200 SSE rejected + sabit metin; yurutme yok', async () => {
        await start(reactive('orders_approve', { orderIds: ['a1'] }));
        const evs = (await call('POST', '/api/agent/turns', P('u1'), turn('onayla'))).events();
        const r = await call('POST', '/api/agent/confirm', P('u1'), confirmBody(cardOf(evs), convOf(evs), 'reject'));
        expect(r.events().filter((e) => e.type === 'part').map((e: any) => e.part.state ?? e.part.type)).toEqual(['rejected', 'text']);
        expect(run).not.toHaveBeenCalled();
    });
});

describe('POST /api/agent/more', () => {
    it('tablo "daha fazla": JSON MoreResult; tek kullanimlik; baska tenant 404; govde dogrulamasi 400; kimliksiz 401', async () => {
        await start(reactive('orders_list', { limit: 50 }));
        const evs = (await call('POST', '/api/agent/turns', P('u1'), turn('siparişler'))).events();
        const table = (evs.find((e) => e.type === 'part' && e.part.type === 'table') as any).part;
        expect(table.more.token).toBeTruthy();
        expect((await call('POST', '/api/agent/more', undefined, { v: 1, token: table.more.token })).status).toBe(401);
        expect((await call('POST', '/api/agent/more', P('u1'), { v: 1 })).status).toBe(400);
        expect((await call('POST', '/api/agent/more', P('u1', 2), { v: 1, token: table.more.token })).status).toBe(404);
        const ok = await call('POST', '/api/agent/more', P('u1'), { v: 1, token: table.more.token });
        expect(ok.status).toBe(200);
        expect(ok.json()).toMatchObject({ total: 120, more: { token: expect.any(String) } });
        expect(ok.json().rows).toHaveLength(50);
        expect((await call('POST', '/api/agent/more', P('u1'), { v: 1, token: table.more.token })).status).toBe(404);
    });
});
