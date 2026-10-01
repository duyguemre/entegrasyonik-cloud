/**
 * CHAT-FE-4: GERCEK onyuz `sse` tasiyicisi (frontend/packages/chat, kanonik kopya) <-> GERCEK /api/agent/* rotalari (Express loopback;
 * DB/Redis/LLM YOK: sahte saglayici + MemoryKv + sahte RunOperation). Tur -> tablo -> 'daha fazla' -> onay karti -> onay, hata zarfi eslemesi.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import * as nodePath from 'path';
// Onyuz kopyasi tsconfig kapsami disinda: tip denetimine girmesin diye calisma zamaninda yuklenir (ts-jest donusturur).
// eslint-disable-next-line @typescript-eslint/no-require-imports
// Kanonik onyuz dosyasi yoksa (yalniz backend dali) atlanir -- protocol-sync testiyle ayni kural.
const FE_SSE = nodePath.resolve(__dirname, '../../../../frontend/packages/chat/src/transport/sse.ts');
const feExists = require('fs').existsSync(FE_SSE) as boolean;
const createSseTransport = (o: any): any => (require(FE_SSE) as { createSseTransport: (o: any) => any }).createSseTransport(o);
import http from 'http';
import express from 'express';
import { configureAgentRoutes } from '../../../src/api/http/agentRoutes';
import { createRequestIdMiddleware } from '../../../src/api/http/requestId';
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
    app.use(createRequestIdMiddleware());
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


const baseUrl = () => `http://127.0.0.1:${port}/api/agent`;
const transport = (sub = 'u1', tid = 1) => createSseTransport({
    baseUrl: baseUrl(),
    headers: { 'x-test-principal': JSON.stringify({ sub, tid }) },
});
async function collect(it: AsyncIterable<any>): Promise<any[]> { const out: any[] = []; for await (const e of it) out.push(e); return out; }
const turnReq = (text: string) => ({ v: 1 as const, conversationId: null, clientTurnId: uuid(), locale: 'tr' as const, input: { kind: 'text' as const, text } });

(feExists ? describe : describe.skip)('onyuz sse tasiyicisi <-> gercek /api/agent (uctan uca)', () => {
    it('tur -> tablo (rowKey EntityRef) -> daha fazla; onay karti -> onay (executing -> done)', async () => {
        await start(reactive('orders_list', { limit: 50 }));
        const t = transport();
        const evs = await collect(t.sendTurn(turnReq('siparişler') as any, new AbortController().signal));
        expect(evs[evs.length - 1]).toMatchObject({ type: 'turn.end', status: 'completed' });
        const table = (evs.find((e) => e.type === 'part' && e.part.type === 'table') as any).part;
        expect(table.rows.length).toBeGreaterThan(0);
        const token = table.more?.token;
        expect(typeof token).toBe('string');
        const more = await t.more({ v: 1, token });
        expect(more.rows.length).toBeGreaterThan(0);
        await expect(t.more({ v: 1, token })).rejects.toMatchObject({ status: 404 }); // tek kullanimlik

        await broker.stop();
        await new Promise((r) => server.close(r));
        await start(reactive('orders_approve', { orderIds: ['a1', 'b2'] }));
        const t2 = transport();
        const e2 = await collect(t2.sendTurn(turnReq('onayla') as any, new AbortController().signal));
        expect(e2[e2.length - 1]).toMatchObject({ type: 'turn.end', status: 'awaiting-confirm' });
        const card = (e2.find((e) => e.type === 'part' && e.part.type === 'confirm') as any).part;
        const conv = (e2[0] as any).conversationId;
        const c = await collect(t2.confirm({ v: 1, conversationId: conv, pendingActionId: card.pendingActionId, decision: 'approve', idempotencyKey: uuid() } as any, new AbortController().signal));
        expect(c.filter((e) => e.type === 'part').map((e) => e.part.state)).toEqual(['executing', 'done']);
        expect(c[c.length - 1]).toMatchObject({ type: 'turn.end' });
    });

    it('hata zarfi {error, code, requestId} -> {message, code, supportCode}; kimliksiz 401', async () => {
        await start(reactive('orders_approve', { orderIds: ['a1'] }));
        const t = transport();
        const evs = await collect(t.confirm({ v: 1, conversationId: 'c-yok', pendingActionId: 'yok-yok-yok-yok', decision: 'approve', idempotencyKey: uuid() } as any, new AbortController().signal));
        expect(evs).toHaveLength(1);
        expect(evs[0]).toMatchObject({ type: 'error', error: { code: 'CONFIRM_EXPIRED' } });
        expect(typeof evs[0].error.message).toBe('string');
        expect(evs[0].error.message.length).toBeGreaterThan(0);
        expect(typeof evs[0].error.supportCode).toBe('string'); // requestId
        const anon = createSseTransport({ baseUrl: baseUrl() });
        const a = await collect(anon.confirm({ v: 1, conversationId: 'c', pendingActionId: 'yok-yok-yok-yok', decision: 'reject', idempotencyKey: uuid() } as any, new AbortController().signal));
        expect(a[0]).toMatchObject({ type: 'error', error: { code: 'UNAUTHENTICATED' } });
        const info = await t.info();
        expect(info.v).toBe(1);
    });
});
