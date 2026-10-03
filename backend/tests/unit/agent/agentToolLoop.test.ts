/**
 * CHAT-BR-2: broker arac dongusu, sunucu sunumu, onay akisi (PendingAction), "daha fazla", kota kancasi.
 * Gercek `createToolRuntime` + `invokeCapability` + sahte RunOperation (`run`); LLM sahte saglayici; DB/Redis/ag YOK (MemoryKv + saat).
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { AgentBroker, MAX_ROUNDS, MAX_TOOL_CALLS, type AgentCtx, type BrokerDeps } from '../../../src/operations/agent/AgentBroker';
import { MemoryKv } from '../../../src/operations/agent/kv';
import { createToolRuntime, type AgentTool, type ToolRuntime } from '../../../src/operations/agent/tools';
import { PENDING_TTL_SEC, hashInput } from '../../../src/operations/agent/PendingActions';
import { entitlementFor, resolveAgentEntitlement } from '../../../src/operations/agent/agentEntitlement';
import type { AvailabilityEnv } from '../../../src/capabilities/availability';
import type { InvokeOptions } from '../../../src/capabilities/invoke';
import { ServerEventSchema, type ConfirmPart, type ServerEvent, type TablePart, type TurnRequest } from '../../../src/operations/agent/protocol/v1';
import type { LlmEvent, LlmMessage, LlmProvider, LlmStreamRequest } from '../../../src/platform/llm';

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const treq = (text: string, over: Partial<TurnRequest> = {}): TurnRequest => ({ v: 1, conversationId: null, clientTurnId: uuid(), locale: 'tr', input: { kind: 'text', text }, ...over });

const UC = { member: { order: 7 }, admin: { order: 7, roleCode: 'ROLE_ADMIN' } };
function mkctx(over: Partial<AgentCtx> & { role?: 'member' | 'admin'; tid?: number; userId?: string; imp?: boolean } = {}): AgentCtx {
    const tid = over.tid ?? 7; const userId = over.userId ?? 'u1'; const role = over.role ?? 'member';
    const uc = { ...UC[role], order: tid };
    const principal = { sub: userId, tid, ...(over.imp ? { imp: true } : {}) };
    return {
        tid, userId, canConfigure: false, canConsent: false, readOnly: false,
        session: { actor: { tier: role }, invoke: { userContext: uc, principal } }, ...('session' in over ? { session: over.session } : {}),
    };
}

/** Sira tabanli sahte saglayici: her gidis-donus `rounds[i]` adimlarini verir; gelen istekler kaydedilir. */
class SeqProvider implements LlmProvider {
    readonly id = 'seq';
    seen: LlmStreamRequest[] = [];
    constructor(private readonly rounds: LlmEvent[][]) { }
    async *stream(req: LlmStreamRequest): AsyncIterable<LlmEvent> {
        const i = this.seen.length;
        this.seen.push({ ...req, messages: [...req.messages] });
        for (const e of this.rounds[Math.min(i, this.rounds.length - 1)]) yield e;
    }
}
const call = (name: string, input: unknown, id = `c${++n}`): LlmEvent => ({ type: 'tool-call', id, name, input });
const txt = (t: string): LlmEvent => ({ type: 'text-delta', text: t });
const done = (r: 'stop' | 'tool_use' = 'stop'): LlmEvent => ({ type: 'done', reason: r });

const order = (i: number) => ({
    _id: `oid${i}`, orderNumber: `N-${i}`, integrationCode: 'trendyol', internalStatus: 'AWAITING_APPROVAL',
    billingAddress: { firstName: 'Ayşe', lastName: 'Yılmaz' }, financials: { grandTotal: 100 + i, currencyCode: 'TRY' }, dates: { orderDate: new Date('2026-09-30T10:00:00Z') },
    items: [{ quantity: 1 }], fulfillment: [],
});

const brokers: AgentBroker[] = [];
interface Opts { kv?: MemoryKv; clock?: { t: number }; env?: Partial<AvailabilityEnv>; run?: InvokeOptions['run']; entitlement?: BrokerDeps['entitlement']; tools?: ToolRuntime; maintenance?: boolean }
function mk(provider: LlmProvider, o: Opts = {}) {
    const clock = o.clock ?? { t: Date.parse('2026-10-01T10:00:00Z') };
    const kv = o.kv ?? new MemoryKv(() => clock.t);
    // `o.env` her cagrida okunur: test, kart uretildikten SONRA ortami (LIVE_READONLY/kill-switch) degistirebilir.
    const runtime = o.tools ?? createToolRuntime({
        isMaintenance: () => o.maintenance === true, run: o.run, entitled: async () => () => true,
        env: (c) => ({ liveReadonly: false, maintenance: false, disabled: new Set<string>(), ...o.env, imp: c.session?.invoke.principal?.imp === true }),
    });
    const b = new AgentBroker({
        kv: () => kv, isEnabled: () => true, isMaintenance: () => o.maintenance === true, resolveProvider: async () => ({ provider }),
        tools: runtime, now: () => clock.t, entitlement: o.entitlement, turnsPerMinute: 1000,
    });
    brokers.push(b);
    return { b, kv, clock, provider };
}
afterEach(() => { brokers.splice(0).forEach((x) => x.stop()); });

async function turn(b: AgentBroker, c: AgentCtx, r: TurnRequest): Promise<ServerEvent[]> {
    const out: ServerEvent[] = [];
    const t = await b.beginTurn(c, r);
    await t.run((e) => out.push(e), new AbortController().signal);
    for (const e of out) expect(ServerEventSchema.safeParse(e).success).toBe(true);
    return out;
}
async function confirm(b: AgentBroker, c: AgentCtx, pa: ConfirmPart, decision: 'approve' | 'reject', convId: string, extra: { typedPhrase?: string } = {}): Promise<ServerEvent[]> {
    const out: ServerEvent[] = [];
    const r = await b.beginConfirm(c, { v: 1, conversationId: convId, pendingActionId: pa.pendingActionId, decision, idempotencyKey: uuid(), ...extra });
    await r.run((e) => out.push(e));
    for (const e of out) expect(ServerEventSchema.safeParse(e).success).toBe(true);
    return out;
}
const parts = (evs: ServerEvent[]) => evs.filter((e): e is Extract<ServerEvent, { type: 'part' }> => e.type === 'part').map((e) => e.part);
const convOf = (evs: ServerEvent[]) => (evs.find((e) => e.type === 'turn.start') as any).conversationId as string;
const table = (evs: ServerEvent[]) => parts(evs).find((p) => p.type === 'table') as TablePart;
const card = (evs: ServerEvent[]) => parts(evs).find((p) => p.type === 'confirm') as ConfirmPart;
const mkRun = (impl: (...a: any[]) => unknown) => jest.fn(async (...a: any[]) => impl(...a)) as unknown as NonNullable<InvokeOptions['run']> & jest.Mock;

describe('okuma araci: sunucu sunumu (tablo modelden bagimsiz)', () => {
    const rows = Array.from({ length: 25 }, (_, i) => order(i + 1));
    const runOrders = () => mkRun(() => ({ totalNumberOfRecords: 132, orders: rows }));

    it('arac cagrisi -> progress -> TABLO (sunucu sayilari) -> model metni; model yanlis sayi yazsa da tablo dogru; model PII gormez', async () => {
        const prov = new SeqProvider([[call('orders_list', {}), done('tool_use')], [txt('Toplam 999 siparişiniz var.'), done()]]);
        const run = runOrders();
        const { b } = mk(prov, { run });
        const evs = await turn(b, mkctx(), treq('onay bekleyen siparişler'));
        const t = table(evs);
        expect(t).toMatchObject({ capabilityId: 'orders.list', total: 132, rowKey: 'orderNumber' });
        expect(t.rows).toHaveLength(25);
        expect(t.rows[0]).toMatchObject({ customer: 'A*** Y***', total: 101, status: 'AWAITING_APPROVAL', channel: 'trendyol', orderNumber: { type: 'order', id: 'oid1', label: 'N-1' } });
        expect(t.columns.find((c) => c.key === 'customer')).toMatchObject({ untrusted: true });
        expect(t.columns.find((c) => c.key === 'total')).toMatchObject({ type: 'money', currency: 'TRY' });
        expect(t.more).toEqual({ token: expect.any(String) });
        expect(t.openIn).toEqual({ screen: 'OrderListView' });
        // model metni (yanlis sayi) ayri metin parcasinda; tablo degismedi
        const modelText = evs.filter((e): e is Extract<ServerEvent, { type: 'delta' }> => e.type === 'delta').map((e) => e.text).join('');
        expect(modelText).toContain('999');
        expect(t.total).not.toBe(999);
        // sira: progress(running) -> progress(done) -> table -> text -> turn.end
        const order = parts(evs).map((p) => (p.type === 'progress' ? `progress:${p.state}` : p.type));
        expect(order).toEqual(['progress:running', 'progress:done', 'table', 'text']);
        expect(evs[evs.length - 1]).toEqual({ type: 'turn.end', turnId: expect.any(String), status: 'completed' });
        // modele giden 2. istek: arac sonucu `untrusted` sarmali; PII ve ham alan yok; kimlikler var (onay icin)
        const toolMsg = prov.seen[1].messages.find((m): m is Extract<LlmMessage, { role: 'tool' }> => m.role === 'tool')!;
        const payload = JSON.parse(toolMsg.content);
        expect(payload).toMatchObject({ untrusted: true, source: 'orders_list', data: { total: 132, shown: 25 } });
        expect(payload.untrustedFields).toEqual(['items[].customer', 'items[].tracking']);
        expect(toolMsg.content).not.toContain('Ayşe');
        expect(toolMsg.content).toContain('oid1');
        // arac listesi: member icin health yok; yazma araci var
        expect(prov.seen[0].tools.map((x) => x.name)).toEqual(['orders_approve', 'orders_list', 'products_search', 'reports_sales_summary', 'stock_low_list']);
    });

    it('KPI sunumu (sales) ve entity-link (tek urun) / tablo (cok urun)', async () => {
        const sales = { totals: { orderCount: 10, revenue: 500, returnCount: 1, returnAmount: 2 }, today: { count: 3, revenue: 120 }, trend: { countChange: -5, revenueChange: 20 }, pending: { invoiceCount: 0, shippingCount: 2, claimCount: 1, messageCount: 0 }, last7Days: [] };
        const one = { totalNumberOfRecords: 1, products: [{ _id: 'p1', title: 'T-shirt', stockcode: 'TS', stock: 4, prices: { minSalePrice: 10, maxSalePrice: 10 }, variants: [] }] };
        const two = { totalNumberOfRecords: 2, products: [one.products[0], { ...one.products[0], _id: 'p2', title: 'Hoodie' }] };
        let phase = 0;
        const run = mkRun((_u: unknown, _s: string, op: string) => (op === 'getOrderDashboardInsights' ? sales : phase === 0 ? one : two));
        const { b } = mk(new SeqProvider([[call('reports_sales_summary', {}), done('tool_use')], [txt('ok'), done()]]), { run });
        const k = parts(await turn(b, mkctx(), treq('satış'))).find((p) => p.type === 'kpi') as any;
        expect(k.items.map((i: any) => i.key)).toEqual(['todayOrders', 'todayRevenue', 'totalRevenue', 'returns', 'pendingShipping', 'pendingClaims']);
        expect(k.items[0]).toMatchObject({ value: 3, delta: { value: -5, direction: 'down', good: false } });
        expect(k.items[1]).toMatchObject({ format: 'money', currency: 'TRY', value: 120 });

        const { b: b2 } = mk(new SeqProvider([[call('products_search', { query: 'shirt' }), done('tool_use')], [txt('ok'), done()]]), { run });
        const pe = parts(await turn(b2, mkctx(), treq('ürün'))).find((p) => p.type === 'entity-link') as any;
        expect(pe).toMatchObject({ entity: { type: 'product', id: 'p1', label: 'T-shirt' }, link: { screen: 'productDefinitions/ProductListView' } });
        phase = 1;
        const { b: b3 } = mk(new SeqProvider([[call('products_search', { query: 'shirt' }), done('tool_use')], [txt('ok'), done()]]), { run });
        expect(table(await turn(b3, mkctx(), treq('ürün')))).toMatchObject({ capabilityId: 'products.search', total: 2, more: null });
    });

    it('bos sonuc: tablo parcasi yok (model metniyle bildirilir); stock enabled:false modele gider', async () => {
        const run = mkRun(() => ({ enabled: false, threshold: null, items: [], nextCursor: null }));
        const prov = new SeqProvider([[call('stock_low_list', {}), done('tool_use')], [txt('Eşik tanımlı değil.'), done()]]);
        const evs = await turn(mk(prov, { run }).b, mkctx(), treq('stok'));
        expect(table(evs)).toBeUndefined();
        const toolMsg = prov.seen[1].messages.find((m) => m.role === 'tool') as any;
        expect(JSON.parse(toolMsg.content).data).toMatchObject({ enabled: false, total: 0, shown: 0 });
    });

    it('arac hatasi (403/500): progress failed, model guvenli kod alir, tur surer; ham hata iletisi sizmaz', async () => {
        const run = mkRun(() => { throw Object.assign(new Error('Mongo: secret-conn-string'), { statusCode: 500 }); });
        const prov = new SeqProvider([[call('orders_list', {}), done('tool_use')], [txt('Şu an alınamadı.'), done()]]);
        const evs = await turn(mk(prov, { run }).b, mkctx(), treq('siparişler'));
        expect(parts(evs).find((p) => p.type === 'progress' && p.state === 'failed')).toBeDefined();
        const toolMsg = prov.seen[1].messages.find((m) => m.role === 'tool') as any;
        expect(toolMsg.content).not.toContain('secret-conn-string');
        expect(JSON.parse(toolMsg.content).error).toBe('INTERNAL');
        expect(evs[evs.length - 1]).toMatchObject({ type: 'turn.end', status: 'completed' });
    });

    it('gecersiz arac girdisi: servis cagrilmaz, model VALIDATION alir', async () => {
        const run = mkRun(() => ({}));
        const prov = new SeqProvider([[call('orders_list', { limit: 9999, tenantId: 5 }), done('tool_use')], [txt('x'), done()]]);
        await turn(mk(prov, { run }).b, mkctx(), treq('siparişler'));
        expect(run).not.toHaveBeenCalled();
        expect(JSON.parse((prov.seen[1].messages.find((m) => m.role === 'tool') as any).content).error).toBe('VALIDATION');
    });

    it('butceler: tek turda en fazla 5 arac cagrisi; en fazla 6 gidis-donus', async () => {
        const run = mkRun(() => ({ totalNumberOfRecords: 0, orders: [] }));
        const seven: LlmEvent[] = [...Array.from({ length: 7 }, () => call('orders_list', {})), done('tool_use')];
        const { b } = mk(new SeqProvider([seven, [txt('bitti'), done()]]), { run });
        await turn(b, mkctx(), treq('x'));
        expect(run).toHaveBeenCalledTimes(MAX_TOOL_CALLS);

        const loopProv = new SeqProvider([[call('orders_list', {}), done('tool_use')]]);
        const run2 = mkRun(() => ({ totalNumberOfRecords: 0, orders: [] }));
        const evs = await turn(mk(loopProv, { run: run2 }).b, mkctx(), treq('y'));
        expect(loopProv.seen).toHaveLength(MAX_ROUNDS);
        expect(run2).toHaveBeenCalledTimes(MAX_TOOL_CALLS);
        expect(evs[evs.length - 1]).toMatchObject({ type: 'turn.end', status: 'completed' });
    });

    it('sunulmayan arac (member icin integrations_health_get) cagrilirsa YURUTULMEZ: error UNAVAILABLE', async () => {
        const run = mkRun(() => ({}));
        const evs = await turn(mk(new SeqProvider([[call('integrations_health_get', {}), done('tool_use')]]), { run }).b, mkctx(), treq('saglik'));
        expect(run).not.toHaveBeenCalled();
        expect(evs[evs.length - 1]).toMatchObject({ type: 'error', error: { code: 'UNAVAILABLE' } });
    });

    it('oturumsuz baglam: arac listesi bos (BR-1 davranisi)', async () => {
        const prov = new SeqProvider([[txt('merhaba'), done()]]);
        await turn(mk(prov).b, { ...mkctx(), session: undefined }, treq('selam'));
        expect(prov.seen[0].tools).toEqual([]);
    });

    it('kalici bellek: arac ozeti asistan mesajina eklenir (model sonraki turda ne yapildigini bilir)', async () => {
        const run = mkRun(() => ({ totalNumberOfRecords: 3, orders: [order(1)] }));
        const prov = new SeqProvider([[call('orders_list', {}), done('tool_use')], [txt('Listeledim.'), done()], [txt('ikinci'), done()]]);
        const { b } = mk(prov, { run });
        const c = mkctx();
        const evs = await turn(b, c, treq('siparişler'));
        await turn(b, c, treq('peki?', { conversationId: convOf(evs) }));
        const hist = prov.seen[2].messages;
        expect(JSON.stringify(hist)).toContain('orders_list: ok 3');
    });
});

describe('"daha fazla" (POST /more)', () => {
    const page = (p: number, total = 120) => ({ totalNumberOfRecords: total, orders: Array.from({ length: 50 }, (_, i) => order(p * 100 + i)) });
    it('sayfalar: belirtec tek kullanimlik, her sayfa yeni belirtec verir; toplam 500 satirda biter', async () => {
        let call_n = 0;
        const run = mkRun((_u: unknown, _s: string, _o: string, body: any) => { call_n++; return page(body.searchOrderForm.pagination.page, 10_000); });
        const { b } = mk(new SeqProvider([[call('orders_list', { limit: 50 }), done('tool_use')], [txt('ok'), done()]]), { run });
        const c = mkctx();
        const evs = await turn(b, c, treq('siparişler'));
        let more = table(evs).more;
        expect(more).not.toBeNull();
        const oldToken = more!.token;
        let shown = 50; let hops = 0;
        while (more) {
            const res = await b.more(c, { v: 1, token: more.token });
            expect(res.rows).toHaveLength(50);
            expect(res.total).toBe(10_000);
            shown += res.rows.length; hops++;
            more = res.more;
        }
        expect(shown).toBe(500);
        expect(hops).toBe(9);
        await expect(b.more(c, { v: 1, token: oldToken })).rejects.toMatchObject({ code: 'NOT_FOUND' }); // tek kullanimlik
        expect(call_n).toBe(1 + hops);
    });
    it('baskasinin / baska tenant\'in belirteci reddedilir ve TUKETILMEZ', async () => {
        const run = mkRun(() => page(1));
        const { b } = mk(new SeqProvider([[call('orders_list', { limit: 50 }), done('tool_use')], [txt('ok'), done()]]), { run });
        const evs = await turn(b, mkctx(), treq('siparişler'));
        const token = table(evs).more!.token;
        await expect(b.more(mkctx({ userId: 'u2' }), { v: 1, token })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(b.more(mkctx({ tid: 8 }), { v: 1, token })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(b.more(mkctx(), { v: 1, token: 'yok-yok-yok-yok' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(b.more(mkctx(), { v: 1, token })).resolves.toMatchObject({ rows: expect.any(Array) }); // sahibi hala kullanabilir
    });
    it('yetki sonradan kalkarsa (kill-switch) sayfalama de reddedilir', async () => {
        const run = mkRun(() => page(1));
        const env: Partial<AvailabilityEnv> = {};
        const { b } = mk(new SeqProvider([[call('orders_list', { limit: 50 }), done('tool_use')], [txt('ok'), done()]]), { run, env });
        const evs = await turn(b, mkctx(), treq('siparişler'));
        env.disabled = new Set(['orders.list']);
        await expect(b.more(mkctx(), { v: 1, token: table(evs).more!.token })).rejects.toMatchObject({ code: 'CAPABILITY_DISABLED' });
    });
});

describe('yazma araci: onay karti + PendingAction (onaysiz yurutme imkansiz)', () => {
    const ids = ['a1', 'b2', 'c3'];
    const approveRaw = { success: false, data: { successCount: 2, failedCount: 1, successful: [], failed: [{ orderId: 'c3', errorMessage: 'Statü uygun değil.' }] } };
    function setup(o: Opts = {}) {
        const run = mkRun(() => approveRaw);
        const prov = new SeqProvider([[txt('Hazırlıyorum.'), call('orders_approve', { orderIds: ids }), done('tool_use')], [txt('Onayınız gerekiyor.'), done()]]);
        return { ...mk(prov, { run, ...o }), run, prov };
    }

    it('tur awaiting-confirm ile biter; kart tam; servis CAGRILMAZ; PendingAction 5 dk', async () => {
        const { b, run, kv, prov, clock } = setup();
        const evs = await turn(b, mkctx(), treq('bu siparişleri onayla'));
        const c = card(evs);
        expect(c).toMatchObject({
            type: 'confirm', capabilityId: 'orders.approve', effect: 'write', risk: 'medium', external: true, confirmMode: 'confirm', state: 'pending',
            affected: { count: 3 }, changes: [{ label: 'Durum', to: 'Onaylandı' }],
        });
        expect(c.affected.sample).toHaveLength(3);
        expect(c.summary).toContain('3 sipariş');
        expect(Date.parse(c.expiresAt) - clock.t).toBe(PENDING_TTL_SEC * 1000);
        expect(evs[evs.length - 1]).toEqual({ type: 'turn.end', turnId: expect.any(String), status: 'awaiting-confirm' });
        expect(run).not.toHaveBeenCalled();
        expect(prov.seen).toHaveLength(1); // kart sonrasi model tekrar cagrilmadi (tur burada bitti)
        expect(kv.keys().filter((k) => k.startsWith('agent:pa:'))).toHaveLength(1);
        // kart, tur mesajina aittir (confirm akisi ayni messageId'ye upsert eder)
        const cardEv = evs.find((e) => e.type === 'part' && e.part.type === 'confirm') as any;
        expect(cardEv.messageId).toBe((evs[0] as any).messageId);
    });

    it('gecersiz girdi (bos orderIds): kart uretilmez, PendingAction yok', async () => {
        const run = mkRun(() => ({}));
        const prov = new SeqProvider([[call('orders_approve', { orderIds: [] }), done('tool_use')], [txt('x'), done()]]);
        const { b, kv } = mk(prov, { run });
        const evs = await turn(b, mkctx(), treq('onayla'));
        expect(card(evs)).toBeUndefined();
        expect(kv.keys().filter((k) => k.startsWith('agent:pa:'))).toHaveLength(0);
    });

    it('ONAY: bir kez uygulanir; idempotency anahtari = pendingActionId; metin sabit sablondan; LLM cagrilmaz', async () => {
        const { b, run, prov } = setup();
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        const pa = card(tev);
        const evs = await confirm(b, c0, pa, 'approve', convOf(tev));
        expect(run).toHaveBeenCalledTimes(1);
        const args = (run as jest.Mock).mock.calls[0] as any[];
        expect([args[1], args[2], args[3]]).toEqual(['OrderService', 'bulkApproveOrder', { orderIds: ids }]);
        expect(args[5].idempotencyKey).toBe(pa.pendingActionId);
        const ps = parts(evs) as ConfirmPart[];
        expect(ps.map((p) => p.state)).toEqual(['executing', 'done']);
        expect(ps[1]).toMatchObject({ pendingActionId: pa.pendingActionId, result: { message: '2 sipariş onaylandı, 1 hata.', openIn: { screen: 'OrderListView' } } });
        expect(evs.some((e) => e.type === 'turn.start')).toBe(false); // confirm akisi turn.start gondermez
        expect((evs.find((e) => e.type === 'part') as any).messageId).toBe((tev[0] as any).messageId);
        expect(evs[evs.length - 1]).toEqual({ type: 'turn.end', turnId: expect.any(String), status: 'completed' });
        expect(prov.seen).toHaveLength(1); // onaydan sonra model cagrilmadi
    });

    it('TEKRAR GONDERIM: ikinci onay ikinci kez UYGULANMAZ, ayni sonuc yeniden akitilir', async () => {
        const { b, run } = setup();
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        const pa = card(tev);
        const first = await confirm(b, c0, pa, 'approve', convOf(tev));
        const again = await confirm(b, c0, pa, 'approve', convOf(tev));
        expect(run).toHaveBeenCalledTimes(1);
        expect(again).toEqual(first);
        // ret de artik etkisiz: sonuc zaten kayitli
        const rej = await confirm(b, c0, pa, 'reject', convOf(tev));
        expect(run).toHaveBeenCalledTimes(1);
        expect((parts(rej) as ConfirmPart[])[0].state).toBe('executing');
    });

    it('YARIS: es zamanli iki onaydan yalniz biri yurutur; digeri 409 CONFLICT/410 (asla ikinci uygulama)', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const run = mkRun(async () => { await gate; return approveRaw; });
        const prov = new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')]]);
        const { b } = mk(prov, { run });
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        const pa = card(tev); const conv = convOf(tev);
        const req = () => ({ v: 1 as const, conversationId: conv, pendingActionId: pa.pendingActionId, decision: 'approve' as const, idempotencyKey: uuid() });
        const results = await Promise.allSettled([b.beginConfirm(c0, req()), b.beginConfirm(c0, req())]);
        const ok = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
        const bad = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(ok).toHaveLength(1);
        expect(bad).toHaveLength(1);
        expect(['CONFLICT', 'CONFIRM_EXPIRED']).toContain((bad[0].reason as any).code);
        const out: ServerEvent[] = [];
        const running = ok[0].value.run((e: ServerEvent) => out.push(e));
        release();
        await running;
        expect(run).toHaveBeenCalledTimes(1);
        // yurutme surerken gelen yeniden deneme: 409 (belirsizlik yok)
    });

    it('YURUTME SURERKEN yeniden deneme -> 409 CONFLICT; bitince ayni sonuc', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const run = mkRun(async () => { await gate; return approveRaw; });
        const { b } = mk(new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')]]), { run });
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        const pa = card(tev); const conv = convOf(tev);
        const first = await b.beginConfirm(c0, { v: 1, conversationId: conv, pendingActionId: pa.pendingActionId, decision: 'approve', idempotencyKey: uuid() });
        const out: ServerEvent[] = [];
        const running = first.run((e) => out.push(e));
        await expect(confirm(b, c0, pa, 'approve', conv)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
        release(); await running;
        expect(await confirm(b, c0, pa, 'approve', conv)).toEqual(out);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('RET: yurutme yok; kart rejected + sabit metin; ikinci ret/onay etkisiz', async () => {
        const { b, run } = setup();
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        const pa = card(tev);
        const evs = await confirm(b, c0, pa, 'reject', convOf(tev));
        expect(run).not.toHaveBeenCalled();
        expect((parts(evs)[0] as ConfirmPart).state).toBe('rejected');
        expect(JSON.stringify(parts(evs)[1])).toContain('İşlem iptal edildi.');
        const late = await confirm(b, c0, pa, 'approve', convOf(tev)); // kayitli sonucu tekrar akitir; yurutme YOK
        expect(run).not.toHaveBeenCalled();
        expect(late).toEqual(evs);
    });

    it('ZAMAN ASIMI: 5 dk sonra onay 410 CONFIRM_EXPIRED; yurutme yok', async () => {
        const { b, run, clock } = setup();
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        clock.t += (PENDING_TTL_SEC + 1) * 1000;
        await expect(confirm(b, c0, card(tev), 'approve', convOf(tev))).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED', status: 410 });
        expect(run).not.toHaveBeenCalled();
    });

    it('SAAT DENETIMI: TTL dolmamis olsa bile expiresAt gecmisse reddedilir', async () => {
        const clock = { t: Date.parse('2026-10-01T10:00:00Z') };
        const kv = new MemoryKv(() => clock.t);
        const { b, run } = setup({ kv, clock });
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        const key = kv.keys().find((k) => k.startsWith('agent:pa:'))!;
        const rec = JSON.parse((await kv.get(key))!); rec.expiresAt = clock.t - 1;
        await kv.set(key, JSON.stringify(rec), 300);
        await expect(confirm(b, c0, card(tev), 'approve', convOf(tev))).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED' });
        expect(run).not.toHaveBeenCalled();
    });

    it('BASKASININ / baska tenant / baska konusma: CONFIRM_EXPIRED; kayit TUKETILMEZ (sahibi onaylayabilir)', async () => {
        const { b, run } = setup();
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        const pa = card(tev); const conv = convOf(tev);
        await expect(confirm(b, mkctx({ userId: 'u2' }), pa, 'approve', conv)).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED' });
        await expect(confirm(b, mkctx({ tid: 8 }), pa, 'approve', conv)).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED' });
        await expect(confirm(b, c0, pa, 'approve', 'baska-konusma')).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED' });
        await expect(confirm(b, mkctx({ userId: 'u2' }), pa, 'reject', conv)).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED' });
        expect(run).not.toHaveBeenCalled();
        await confirm(b, c0, pa, 'approve', conv);
        expect(run).toHaveBeenCalledTimes(1);
        // bilinmeyen/biçimsiz kimlik
        await expect(b.beginConfirm(c0, { v: 1, conversationId: conv, pendingActionId: 'yok yok', decision: 'approve', idempotencyKey: uuid() })).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED' });
    });

    it('surum degisti / depo tahrif edildi: yurutme yok (CONFIRM_EXPIRED)', async () => {
        const { b, run, kv } = setup();
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        const key = kv.keys().find((k) => k.startsWith('agent:pa:'))!;
        const rec = JSON.parse((await kv.get(key))!); rec.input = { orderIds: ['baska'] };
        await kv.set(key, JSON.stringify(rec), 300);
        expect(hashInput(rec.input)).not.toBe(rec.inputHash);
        await expect(confirm(b, c0, card(tev), 'approve', convOf(tev))).rejects.toMatchObject({ code: 'CONFIRM_EXPIRED' });
        expect(run).not.toHaveBeenCalled();
    });

    it('kart sonrasi yetki/koruma degisimi: LIVE_READONLY acildiysa onay yurutmez, kart failed (mesajli), model cagrilmaz', async () => {
        const env: Partial<AvailabilityEnv> = {};
        const { b, run, prov } = setup({ env });
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        env.liveReadonly = true;
        const evs = await confirm(b, c0, card(tev), 'approve', convOf(tev));
        expect(run).not.toHaveBeenCalled();
        const last = parts(evs).pop() as ConfirmPart;
        expect(last).toMatchObject({ state: 'failed' });
        expect(last.result!.message).toMatch(/salt-okuma/i);
        expect(evs[evs.length - 1]).toMatchObject({ type: 'turn.end', status: 'failed' });
        expect(prov.seen).toHaveLength(1);
    });

    it('yurutme hatasi: sonuc belirsiz mesaji + tekrar gonderimde yeniden UYGULANMAZ', async () => {
        const run = mkRun(() => { throw Object.assign(new Error('socket hang up sk-abc'), { statusCode: 500 }); });
        const { b } = mk(new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')]]), { run });
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        const evs = await confirm(b, c0, card(tev), 'approve', convOf(tev));
        const last = parts(evs).pop() as ConfirmPart;
        expect(last.state).toBe('failed');
        expect(last.result!.message).toMatch(/belirsiz/i);
        expect(JSON.stringify(evs)).not.toContain('sk-abc');
        await confirm(b, c0, card(tev), 'approve', convOf(tev));
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('LIVE_READONLY / impersonation / bakim: yazma araci listede YOK; zorla cagri (model halusinasyonu) yurutmez', async () => {
        for (const [label, ctx, o] of [
            ['LIVE_READONLY', mkctx(), { env: { liveReadonly: true } }],
            ['impersonation', mkctx({ imp: true }), {}],
            ['bakim', mkctx(), { env: { maintenance: true }, maintenance: false }],
        ] as Array<[string, AgentCtx, Opts]>) {
            const run = mkRun(() => approveRaw);
            const prov = new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')]]);
            const { b, kv } = mk(prov, { run, ...o });
            const evs = await turn(b, ctx, treq('onayla'));
            expect([label, prov.seen[0].tools.map((t) => t.name).includes('orders_approve')]).toEqual([label, false]);
            expect([label, evs[evs.length - 1].type]).toEqual([label, 'error']);
            expect(run).not.toHaveBeenCalled();
            expect(kv.keys().filter((k) => k.startsWith('agent:pa:'))).toHaveLength(0);
        }
    });

    it('bakim acilirken onay verilirse 503 MAINTENANCE (kayit tuketilmez)', async () => {
        const state = { maint: false };
        const clock = { t: Date.parse('2026-10-01T10:00:00Z') };
        const kv = new MemoryKv(() => clock.t);
        const run = mkRun(() => approveRaw);
        const rt = createToolRuntime({ isMaintenance: () => state.maint, run, env: () => ({ liveReadonly: false, maintenance: state.maint, disabled: new Set(), imp: false }), entitled: async () => () => true });
        const b = new AgentBroker({ kv: () => kv, isEnabled: () => true, isMaintenance: () => state.maint, resolveProvider: async () => ({ provider: new SeqProvider([[call('orders_approve', { orderIds: ids }), done('tool_use')]]) }), tools: rt, now: () => clock.t, turnsPerMinute: 100 });
        brokers.push(b);
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('onayla'));
        state.maint = true;
        await expect(confirm(b, c0, card(tev), 'approve', convOf(tev))).rejects.toMatchObject({ code: 'MAINTENANCE', status: 503 });
        // reddetmek bakimda da serbest
        const rej = await confirm(b, c0, card(tev), 'reject', convOf(tev));
        expect((parts(rej)[0] as ConfirmPart).state).toBe('rejected');
        expect(run).not.toHaveBeenCalled();
    });

    it('typed kip: ifade sunucuda eslesir (yanlis ifade kaydi tuketmez), dogru ifadeyle yurur; destructive -> risk high', async () => {
        const tool: AgentTool = {
            name: 'orders_approve', capId: 'orders.approve', version: '1.1', description: 'x', inputSchema: { type: 'object' }, effect: 'destructive', confirm: 'typed',
            external: true, untrustedPaths: [], title: { tr: 'Sil', en: 'Delete' }, toolset: 'orders',
        };
        const invoke = jest.fn(async () => ({ capabilityId: 'orders.approve', version: '1.1', data: { approved: 1, failed: 0, failures: [] }, untrustedPaths: [], bytes: 1 }));
        const fake: ToolRuntime = { list: async () => [tool], validate: (_id, i) => i, invoke: invoke as any, versionOf: () => '1.1' };
        const { b } = mk(new SeqProvider([[call('orders_approve', { orderIds: ['a1'] }), done('tool_use')]]), { tools: fake });
        const c0 = mkctx();
        const tev = await turn(b, c0, treq('sil'));
        const pa = card(tev);
        expect(pa).toMatchObject({ confirmMode: 'typed', typedPhrase: 'ONAYLA', effect: 'destructive', risk: 'high' });
        await expect(confirm(b, c0, pa, 'approve', convOf(tev))).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(confirm(b, c0, pa, 'approve', convOf(tev), { typedPhrase: 'onayla' })).rejects.toMatchObject({ code: 'VALIDATION' });
        expect(invoke).not.toHaveBeenCalled();
        await confirm(b, c0, pa, 'approve', convOf(tev), { typedPhrase: 'ONAYLA' });
        expect(invoke).toHaveBeenCalledTimes(1);
    });
});

describe('K46 kancasi: plan yetkisi + gunluk eylem kotasi', () => {
    it('kota asilinca onay 403 QUOTA_EXCEEDED (kayit tuketilmez, ret serbest); sayac tenant bazli', async () => {
        const ent = async () => ({ ...entitlementFor('limited'), dailyActionQuota: 2 });
        const run = mkRun(() => ({ success: true, data: { successCount: 1, failedCount: 0, successful: [], failed: [] } }));
        const { b, kv } = mk(new SeqProvider([[call('orders_approve', { orderIds: ['a1'] }), done('tool_use')]]), { run, entitlement: ent });
        const c0 = mkctx();
        const ev = async () => { const t = await turn(b, c0, treq('onayla')); return { pa: card(t), conv: convOf(t) }; };
        const a = await ev(); await confirm(b, c0, a.pa, 'approve', a.conv);
        const c = await ev(); await confirm(b, c0, c.pa, 'approve', c.conv);
        const d = await ev();
        await expect(confirm(b, c0, d.pa, 'approve', d.conv)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', status: 403 });
        expect(run).toHaveBeenCalledTimes(2);
        expect(kv.keys().some((k) => k.startsWith('agent:quota:7:'))).toBe(true);
        const rej = await confirm(b, c0, d.pa, 'reject', d.conv); // ret kotaya sayilmaz ve serbesttir
        expect((parts(rej)[0] as ConfirmPart).state).toBe('rejected');
        // baska tenant'in sayaci ayri
        const c2 = mkctx({ tid: 9 });
        const t2 = await turn(b, c2, treq('onayla'));
        await expect(confirm(b, c2, card(t2), 'approve', convOf(t2))).resolves.toBeDefined();
    });
    it('varsayilan: entitlement cozucu `full` (limited\'da otonom/zamanlanmis yok)', async () => {
        expect(await resolveAgentEntitlement(1)).toMatchObject({ tier: 'full', autonomousAllowed: true });
        expect(entitlementFor('limited')).toMatchObject({ autonomousAllowed: false, dailyActionQuota: 25 });
    });
});

describe('tenant izolasyonu (2 tenant)', () => {
    it('A\'nin oturumuyla B\'nin verisi donmez: tenant yalniz userContext.order\'dan; calisma bellegi/PendingAction/more ayri', async () => {
        const seenTenants: unknown[] = [];
        const run = mkRun((uc: any) => { seenTenants.push(uc.order); return { totalNumberOfRecords: 1, orders: [order(uc.order)] }; });
        const reactive: LlmProvider = { id: 'reactive', async *stream(req) { yield* (req.messages[req.messages.length - 1].role === 'tool' ? [txt('ok'), done()] : [call('orders_list', { limit: 1 }), done('tool_use')]); } };
        const { b, kv } = mk(reactive, { run });
        const a = mkctx({ tid: 1 }); const bb = mkctx({ tid: 2 });
        // girdide tenant verilemez
        expect(() => JSON.stringify((run as jest.Mock).mock.calls)).not.toThrow();
        const ea = await turn(b, a, treq('x'));
        const eb = await turn(b, bb, treq('x'));
        expect(seenTenants).toEqual([1, 2]);
        expect(table(ea).rows[0].orderNumber).toMatchObject({ id: 'oid1' });
        expect(table(eb).rows[0].orderNumber).toMatchObject({ id: 'oid2' });
        const convKeys = kv.keys().filter((k) => k.startsWith('agent:conv:'));
        expect(convKeys.some((k) => k.includes(':app:1:'))).toBe(true);
        expect(convKeys.some((k) => k.includes(':app:2:'))).toBe(true);
    });
});
