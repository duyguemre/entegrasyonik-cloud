/**
 * CHAT-BR-4 (ADR-0034 Karar 6, AGENT_BROKER_PLAN BR-4): backoffice broker `/admin-api/agent/*`. Gercek Express + gercek `createAdminRouter` (EK_ADMIN cerez dogrulamasi) + gercek broker;
 * DB/Redis/ag YOK (sahte kullanici deposu, MemoryKv, sahte `run`, sahte LLM, sahte ayar deposu). Kanit: ayri oturum (musteri cerezi 401), yalniz adminChat araclari (tenant araci YOK),
 * yalniz salt-okuma, tenant verisi/pod adi/hata metni modele GITMEZ, calisma bellegi `agent:conv:bo:*` (musteri anahtariyla paylasim yok), denetim `backoffice_chat`,
 * platform anahtari (step-up + gerekce, sir sizintisi yok, SETUP_REQUIRED), platform<->tenant anahtar ayrimi.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import express from 'express';
import type { Server } from 'http';
import { createAdminRouter } from '../../../src/api/admin/AdminApiManager';
import { ADMIN_COOKIE_NAME, signAdminSession } from '../../../src/api/admin/adminSession';
import { BACKOFFICE_SYSTEM_PROMPT } from '../../../src/api/admin/adminAgentRoutes';
import Security from '../../../src/api/Security';
import { AgentBroker } from '../../../src/operations/agent/AgentBroker';
import { ConversationStore } from '../../../src/operations/agent/ConversationStore';
import { MemoryKv } from '../../../src/operations/agent/kv';
import { ProviderService, type AgentSettingsStore, type StoredAgentSettings } from '../../../src/operations/agent/providerSettings';
import { PLATFORM_AGENT_TID, platformSettingsStore } from '../../../src/operations/agent/platformProvider';
import { createToolRuntime, deriveTools } from '../../../src/operations/agent/tools';
import { invokeCapability } from '../../../src/capabilities/invoke';
import { CAPABILITIES, findRegistryInvariantViolations } from '../../../src/capabilities';
import { requiresStepUp } from '../../../src/api/admin/stepUp';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import { setLogSink } from '../../../src/platform/core/logger';
import { zodToJsonSchema } from '../../../src/capabilities/derive/jsonSchema';
import { LlmError, type LlmEvent, type LlmProvider, type LlmStreamRequest } from '../../../src/platform/llm';
import { Clock, makeDeps, makeUser } from '../../helpers/adminFakes';

const ADMIN_ORIGIN = 'https://admin.example.test';
const ADMIN_ID = 'a1b2c3d4e5f6a7b8c9d0e1f2';
const PLATFORM_KEY = 'sk-ant-PLATFORM-SECRET-99999999';
const ENV_KEYS = ['ADMIN_CORS_ORIGINS', 'ADMIN_IP_ALLOWLIST', 'CORS_ORIGINS'];

const BO_TOOLS = ['platform_engine_queues', 'platform_integrations_api_health', 'platform_integrations_resilience', 'platform_overview_health'];
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

class MemStore implements AgentSettingsStore {
    doc: StoredAgentSettings | undefined;
    patches: Array<{ tid: number; set?: Record<string, unknown>; unset?: string[] }> = [];
    async read(tid: number) { if (tid !== PLATFORM_AGENT_TID) throw new Error('tenant platform deposuna erisemez'); return this.doc ? JSON.parse(JSON.stringify(this.doc)) : undefined; }
    async patch(tid: number, p: { set?: Record<string, unknown>; unset?: string[] }) {
        if (tid !== PLATFORM_AGENT_TID) throw new Error('tenant platform deposuna erisemez');
        this.patches.push({ tid, ...p });
        const d: any = this.doc ?? {};
        for (const [k, v] of Object.entries(p.set ?? {})) d[k] = v;
        for (const k of p.unset ?? []) delete d[k];
        this.doc = d;
    }
}

class FnProvider implements LlmProvider {
    readonly id = 'fn';
    seen: LlmStreamRequest[] = [];
    constructor(private readonly fn: (req: LlmStreamRequest) => AsyncIterable<LlmEvent>) { }
    stream(req: LlmStreamRequest) { this.seen.push(req); return this.fn(req); }
}
/** Ilk gidis-donuste verilen araci cagirir; arac sonucundan sonra metinle biter. */
const toolThenText = (name: string, input: unknown = {}) => new FnProvider(async function* (req) {
    if (req.messages[req.messages.length - 1]?.role === 'tool') { yield { type: 'text-delta', text: 'Tamam.' } as LlmEvent; yield { type: 'done', reason: 'stop' } as LlmEvent; return; }
    yield { type: 'tool-call', id: 'c1', name, input } as LlmEvent;
    yield { type: 'done', reason: 'tool_use' } as LlmEvent;
});

const RAW: Record<string, unknown> = {
    'BackofficeOverviewService/getHealth': {
        generatedAt: 'x', status: 'degraded', degradedSections: ['queues'],
        dependencies: { status: 'ok', ready: true, role: 'all', mongo: 'ok', redis: 'ok' },
        pods: { status: 'ok', self: 'pod-SECRET-7d9', items: [{ pod: 'pod-SECRET-7d9', activeLeases: 1 }] },
        red: { status: 'ok', requests: 1200, errors5xx: 20, errorRate: 0.0167, durationP95Ms: 500 },
        queues: { status: 'ok', items: [{ name: 'order-sync-queue', available: true, backlog: 5, active: 2, failed: 3, dlqPending: 1 }] },
        intake: { restricted: [{ target: 'platform:trendyol', intake: 'drain' }] },
        issues: { status: 'ok', open: 12, newLast24h: 2, sampleMessage: 'boom tenant 7 musteri@ornek.test' },
    },
    'BackofficeEngineService/getQueues': {
        generatedAt: 'x', queues: [{ name: 'order-sync-queue', available: true, counts: { wait: 3, active: 1, delayed: 0, failed: 2, completed: 40 }, dlq: { pendingReview: 1 }, metrics: { series: [{ t: 'x', count: 10 }] }, jobPayload: { orderNo: 'SIPARIS-SECRET' } }],
    },
    'BackofficeIntegrationService/getApiHealth': {
        range: '24h', since: 'a', until: 'b', items: [{ integrationCode: 'trendyol', total: 100, errors: 7, errorRate: 0.07, p95Ms: 500, affectedTenants: 3, tenantIds: [7, 9], errorsByCode: [{ code: 'RATE_LIMITED', count: 5, rate: 0.05 }] }],
    },
    'BackofficeIntegrationService/getResilienceState': {
        pods: [{ pod: 'pod-SECRET-7d9' }], items: [{ integrationCode: 'trendyol', pods: [{ pod: 'pod-SECRET-7d9', circuits: { closed: 1, open: 2, half_open: 0 }, rate: { limited: 4 }, intake: 'drain' }] }],
    },
};

let server: Server;
let base: string;
let h: ReturnType<typeof makeDeps>;
let kv: MemoryKv;
let runCalls: Array<{ service: string; operation: string; body: any; userContext: any; principal: any; meta: any }>;
let provider: LlmProvider | null;
let store: MemStore;
let svc: ProviderService;
let audit: Array<Record<string, any>>;
let sunk: unknown[];
const saved: Record<string, string | undefined> = {};

const fakeRun = (async (userContext: any, service: string, operation: string, body: any, principal: any, meta: any) => {
    runCalls.push({ service, operation, body, userContext, principal, meta });
    const r = RAW[`${service}/${operation}`];
    if (!r) throw new Error(`beklenmeyen RPC ${service}/${operation}`);
    return r;
}) as never;

async function boot() {
    kv = new MemoryKv(() => h.clock.now());
    store = new MemStore();
    svc = new ProviderService({
        store, kv: () => kv, now: () => h.clock.now(), requireConsent: false, surface: 'backoffice_chat', testsPerMinute: 50,
        verify: async () => undefined,
    });
    const tools = createToolRuntime({
        isMaintenance: () => false, run: fakeRun,
        env: () => ({ liveReadonly: false, maintenance: false, disabled: new Set<string>(), imp: false }),
    });
    const broker = new AgentBroker({
        kv: () => kv, isEnabled: () => true, isMaintenance: () => false,
        resolveProvider: async () => (provider ? { provider } : null), setupState: async () => ({ configured: false, consentRequired: false }),
        tools, systemPrompt: BACKOFFICE_SYSTEM_PROMPT,
        suggestions: { tr: [{ id: 'b1', text: 'Platform sağlıklı mı?' }], en: [{ id: 'b1', text: 'Is the platform healthy?' }] },
    });
    const app = express();
    app.use(express.json());
    app.use('/admin-api', createAdminRouter(h.deps, { broker: () => broker, providers: () => svc, heartbeatMs: 60_000 }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as any).port}/admin-api`;
}

const session = (over: { stg?: 'full' | 'pwd'; reauth?: boolean; reauthAt?: number } = {}) => signAdminSession({
    sub: ADMIN_ID, tv: 0, stg: over.stg ?? 'full', ...(over.reauth === false ? {} : { reauth_at: over.reauthAt ?? Math.floor(h.clock.now() / 1000) }),
}, h.clock.now());

async function api(method: string, path: string, o: { cookie?: string | null; body?: unknown; cookieName?: string } = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json', origin: ADMIN_ORIGIN };
    const c = o.cookie === undefined ? session() : o.cookie;
    if (c) headers.cookie = `${o.cookieName ?? ADMIN_COOKIE_NAME}=${c}`;
    const res = await fetch(base + path, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
    const text = await res.text();
    let json: any; try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, text, json, headers: res.headers };
}
const events = (text: string) => text.split('\n\n').map((b) => /^data: (.*)$/m.exec(b)?.[1]).filter(Boolean).map((d) => JSON.parse(d as string));
const turn = (text: string, n = 1, conversationId: string | null = null, cookie?: string | null) => api('POST', '/agent/turns', {
    cookie, body: { v: 1, conversationId, clientTurnId: uuid(n), locale: 'tr', input: { kind: 'text', text }, client: { shell: 'web' } },
});
const flush = async () => { await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); };

beforeEach(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.ADMIN_CORS_ORIGINS = ADMIN_ORIGIN;
    process.env.CORS_ORIGINS = 'https://app.example.test';
    delete process.env.ADMIN_IP_ALLOWLIST;
    h = makeDeps({ clock: new Clock() });
    runCalls = []; audit = []; sunk = [];
    provider = toolThenText('platform_overview_health');
    AuditLogger.setSink(async (r) => { audit.push(r); });
    setLogSink((r) => { sunk.push(r); });
    await boot();
});
afterEach(async () => {
    setLogSink(undefined);
    AuditLogger.setSink(undefined);
    await new Promise<void>((r) => server.close(() => r()));
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    jest.restoreAllMocks();
});

describe('oturum ayrimi (EK_ADMIN)', () => {
    it('cerezsiz / musteri cerezi (JWT_TOKEN) / yari oturum (TOTP bekleyen): tum uclar reddedilir', async () => {
        const customer = Security.getInstance().signSession({ sub: ADMIN_ID, tid: 1, role: 'owner', ga: false, tv: 0 });
        for (const [m, p] of [['GET', '/agent/info'], ['POST', '/agent/turns'], ['POST', '/agent/confirm'], ['POST', '/agent/more'], ['DELETE', '/agent/conversations/abc'], ['GET', '/agent/provider'], ['PUT', '/agent/provider'], ['POST', '/agent/provider/test'], ['DELETE', '/agent/provider']] as const) {
            expect([m, p, (await api(m, p, { cookie: null })).status]).toEqual([m, p, 401]);
            expect([m, p, (await api(m, p, { cookie: customer, cookieName: 'JWT_TOKEN' })).status]).toEqual([m, p, 401]); // musteri cerezi burada HIC okunmaz
            expect([m, p, (await api(m, p, { cookie: customer })).status]).toEqual([m, p, 401]); // musteri belirteci admin cerez adiyla da gecmez (aud/sir)
        }
        const half = await api('GET', '/agent/info', { cookie: session({ stg: 'pwd' }) });
        expect(half.status).toBe(403);
        expect(half.json.code).toBe('MFA_REQUIRED');
        expect(runCalls).toEqual([]);
    });

    it('backoffice cerezi musteri hattinda gecmez: admin oturum belirteci Security.verifyToken (musteri /api) tarafindan reddedilir', () => {
        expect(() => Security.getInstance().verifyToken(session())).toThrow('Token not verified');
    });

    it('isGlobalAdmin olmayan kullanici (tenant kullanicisi) admin belirteciyle bile reddedilir (DB\'den taze okuma)', async () => {
        h.users.users[0].isGlobalAdmin = false;
        expect((await api('GET', '/agent/info')).status).toBe(401);
    });
});

describe('info / kurulum durumu', () => {
    it('anahtar var: enabled, backoffice onerileri (musteri onerileri degil), canConfigure true, KVKK/consent yok', async () => {
        const r = await api('GET', '/agent/info');
        expect(r.status).toBe(200);
        expect(r.json).toMatchObject({ v: 1, enabled: true, setup: { configured: true, canConfigure: true, consentRequired: false, canConsent: false } });
        expect(JSON.stringify(r.json.suggestions)).not.toMatch(/siparişlerim|stok/i);
        expect(r.headers.get('cache-control')).toBe('no-store');
    });

    it('platform anahtari yoksa SETUP_REQUIRED (info) ve tur 403 SETUP_REQUIRED (SSE baslamadan)', async () => {
        provider = null;
        const i = await api('GET', '/agent/info');
        expect(i.json).toMatchObject({ enabled: false, reason: 'SETUP_REQUIRED', setup: { configured: false, canConfigure: true } });
        const t = await turn('merhaba');
        expect(t.status).toBe(403);
        expect(t.json.code).toBe('SETUP_REQUIRED');
    });
});

describe('araclar: yalniz adminChat, yalniz salt-okuma, tenant verisi yok', () => {
    it('modele YALNIZ 4 platform arac sunulur (tenant araci yok); sistem istemi backoffice istemi', async () => {
        const t = await turn('platform sağlıklı mı?');
        expect(t.status).toBe(200);
        const req = (provider as FnProvider).seen[0];
        expect(req.tools.map((x) => x.name).sort()).toEqual(BO_TOOLS);
        expect(req.system).toBe(BACKOFFICE_SYSTEM_PROMPT);
        for (const n of ['orders_list', 'orders_approve', 'products_search', 'reports_sales_summary', 'stock_low_list', 'integrations_health_get']) expect(req.tools.map((x) => x.name)).not.toContain(n);
    });

    it('arac cagrisi: platform RPC, ga:true principal, tenant YOK, surface backoffice; sonuc tablo parcasi; sunucu projeksiyonu pod adi/hata metni/yuk sizdirmaz', async () => {
        const t = await turn('platform sağlıklı mı?');
        const ev = events(t.text);
        expect(runCalls).toHaveLength(1);
        expect(runCalls[0]).toMatchObject({ service: 'BackofficeOverviewService', operation: 'getHealth' });
        expect(runCalls[0].principal).toMatchObject({ sub: ADMIN_ID, ga: true });
        expect(runCalls[0].userContext.order).toBeUndefined();
        expect(runCalls[0].meta).toMatchObject({ surface: 'backoffice' });
        const part = ev.find((e) => e.type === 'part' && e.part.type === 'table')?.part;
        expect(part).toMatchObject({ type: 'table', capabilityId: 'platform.overview.health' });
        const toolMsg = (provider as FnProvider).seen[1].messages.find((m) => m.role === 'tool') as { content: string };
        const wire = `${t.text}\n${toolMsg.content}`;
        for (const leak of ['pod-SECRET', 'boom', 'musteri@ornek', 'platform:trendyol', 'SIPARIS-SECRET']) expect([leak, wire.includes(leak)]).toEqual([leak, false]);
        expect(JSON.parse(toolMsg.content)).toMatchObject({ untrusted: true, source: 'platform_overview_health' });
        expect(ev[ev.length - 1]).toMatchObject({ type: 'turn.end', status: 'completed' });
    });

    it('diger 3 platform araci da projeksiyonlanir: kuyruk sayaclari, API sagligi (tenant kimligi yok, yalniz sayi), dayaniklilik (pod adi yok)', async () => {
        for (const [name, input, needle] of [
            ['platform_engine_queues', {}, '"waiting":3'], ['platform_integrations_api_health', { range: '24h' }, '"affectedTenants":3'], ['platform_integrations_resilience', {}, '"circuitsOpen":2'],
        ] as const) {
            provider = toolThenText(name, input);
            const t = await turn('x', Math.floor(Math.random() * 1e6) + 100);
            expect(t.status).toBe(200);
            expect(t.text).toContain(needle);
            for (const leak of ['pod-SECRET', 'SIPARIS-SECRET', 'tenantIds', '"tid"']) expect([name, leak, t.text.includes(leak)]).toEqual([name, leak, false]);
        }
    });

    it('model musteri (tenant) aracini cagirmaya calisirsa: sunulmayan arac -> tur hata ile biter, servis cagrisi YOK', async () => {
        provider = toolThenText('orders_list');
        const t = await turn('siparişleri göster');
        expect(events(t.text).some((e) => e.type === 'error')).toBe(true);
        expect(runCalls).toEqual([]);
    });

    it('invokeCapability yuzey ayrimi: tenant araci backoffice_chat ile ve adminChat araci chat/mcp ile FORBIDDEN; tenant (platformAdmin olmayan) aktor adminChat aracini kullanamaz', async () => {
        const platformCtx = { userContext: { _id: 'u' }, principal: { sub: 'u', ga: true } };
        const tenantCtx = { userContext: { _id: 'u', order: 1, owner: true }, principal: { sub: 'u', tid: 1, ga: false } };
        const env = { liveReadonly: false, maintenance: false, disabled: new Set<string>(), imp: false };
        await expect(invokeCapability(platformCtx, 'orders.list', {}, 'backoffice_chat', { env, run: fakeRun })).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(invokeCapability(platformCtx, 'platform.overview.health', {}, 'chat', { env, run: fakeRun })).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(invokeCapability(platformCtx, 'platform.overview.health', {}, 'mcp', { env, run: fakeRun })).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(invokeCapability(tenantCtx, 'platform.overview.health', {}, 'backoffice_chat', { env, run: fakeRun })).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(invokeCapability(platformCtx, 'platform.engine.retry_job', { queue: 'q', jobId: 'j', reason: 'xxxxxxxxxx' }, 'backoffice_chat', { env, run: fakeRun })).rejects.toMatchObject({ code: 'FORBIDDEN' }); // yazma yetenegi: adminChat degil
        expect(runCalls).toEqual([]);
        const ok = await invokeCapability(platformCtx, 'platform.overview.health', {}, 'backoffice_chat', { env, run: fakeRun });
        expect(ok.capabilityId).toBe('platform.overview.health');
    });

    it('strict girdi: tenantId/serbest alan reddedilir (VALIDATION), servis cagrisi yok', async () => {
        provider = toolThenText('platform_integrations_api_health', { range: '24h', tenantId: 5 });
        const t = await turn('x');
        expect(runCalls).toEqual([]);
        const tm = (provider as FnProvider).seen[1].messages.find((m) => m.role === 'tool') as { content: string };
        expect(JSON.parse(tm.content).error).toBe('VALIDATION');
        void t;
    });

    it('confirm ucu v1\'de DAIMA 410 CONFIRM_EXPIRED (yazma araci/onay karti yok); more bilinmeyen belirtec 404', async () => {
        const c = await api('POST', '/agent/confirm', { body: { v: 1, conversationId: 'c1', pendingActionId: 'p1', decision: 'approve', idempotencyKey: uuid(9) } });
        expect(c.status).toBe(410);
        expect(c.json.code).toBe('CONFIRM_EXPIRED');
        expect((await api('POST', '/agent/more', { body: { v: 1, token: 'nope' } })).status).toBe(404);
        expect(runCalls).toEqual([]);
    });
});

describe('calisma bellegi ve denetim', () => {
    it('bellek anahtari agent:conv:bo:{adminId}:{convId}; musteri (app) anahtari YOK; ayni convId ile musteri sohbeti gorunmez; DELETE yalniz bo bellegi siler', async () => {
        const conv = 'conv-bo-1';
        await turn('platform sağlıklı mı?', 1, conv);
        const keys = (kv as unknown as { map: Map<string, unknown> }).map;
        expect([...keys.keys()].filter((k) => k.startsWith('agent:conv:'))).toEqual([`agent:conv:bo:${ADMIN_ID}:${conv}`]);
        expect((await new ConversationStore(kv, 'app').load(1, ADMIN_ID, conv))).toEqual([]);
        expect((await new ConversationStore(kv, 'bo').load(PLATFORM_AGENT_TID, ADMIN_ID, conv)).length).toBeGreaterThan(0);
        await new ConversationStore(kv, 'app').append(1, ADMIN_ID, conv, [{ role: 'user', text: 'musteri', at: 'x' }]);
        expect((await api('DELETE', `/agent/conversations/${conv}`)).status).toBe(204);
        expect((await new ConversationStore(kv, 'bo').load(0, ADMIN_ID, conv))).toEqual([]);
        expect((await new ConversationStore(kv, 'app').load(1, ADMIN_ID, conv)).length).toBe(1); // musteri belleginden dokunulmadi
    });

    it('denetim: surface backoffice_chat, actorType platform, tid yok, yetenek+surum, parametre DEGERI yok, sohbet metni yok', async () => {
        provider = toolThenText('platform_integrations_api_health', { range: '7d', integrationCode: 'trendyol' });
        await turn('gizli metin SOHBET-SECRET');
        await flush();
        const rec = audit.find((r) => r.event === 'agent.tool_call');
        expect(rec).toMatchObject({ surface: 'backoffice_chat', actorType: 'platform', sub: ADMIN_ID, result: 'ok' });
        expect(rec!.tid).toBeUndefined();
        expect(rec!.meta).toMatchObject({ capabilityId: 'platform.integrations.api_health', outcome: 'ok' });
        const s = JSON.stringify(audit);
        for (const leak of ['SOHBET-SECRET', 'trendyol"', '7d"']) expect([leak, s.includes(leak)]).toEqual([leak, false]);
    });
});

describe('platform LLM anahtari (BYOK degil)', () => {
    const save = (body: Record<string, unknown> = {}, o: { cookie?: string | null } = {}) => api('PUT', '/agent/provider', {
        ...o, body: { v: 1, provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: PLATFORM_KEY, reason: 'Backoffice sohbeti platform anahtari kurulumu', ...body },
    });

    it('PUT: step-up YOKSA 401 REAUTH_REQUIRED; eski (>5 dk) reauth da; gerekce eksik/kisa 400; hicbiri yazmaz', async () => {
        expect((await save({}, { cookie: session({ reauth: false }) })).json.code).toBe('REAUTH_REQUIRED');
        expect((await save({}, { cookie: session({ reauthAt: Math.floor(h.clock.now() / 1000) - 400 }) })).json.code).toBe('REAUTH_REQUIRED');
        const r = await save({ reason: 'kisa' });
        expect([r.status, r.json.code]).toEqual([400, 'VALIDATION']);
        expect(store.patches).toEqual([]);
    });

    it('PUT (step-up + gerekce): once test, sifreli (enc:v1) yazilir; yanit anahtar tasimaz ("sensitive"); denetim backoffice_chat + gerekce, anahtar YOK; log/yanit/denetimde anahtar yok', async () => {
        const r = await save();
        expect(r.status).toBe(200);
        expect(r.json).toMatchObject({ configured: true, apiKey: 'sensitive', provider: 'anthropic', consentRequired: false, canConsent: false });
        expect(store.doc!.apiKey).toMatch(/^enc:v1:/);
        expect(store.doc!.apiKey).not.toContain(PLATFORM_KEY);
        await flush();
        const rec = audit.find((a) => a.event === 'agent.provider.saved');
        expect(rec).toMatchObject({ surface: 'backoffice_chat', actorType: 'platform', sub: ADMIN_ID });
        expect(rec!.tid).toBeUndefined();
        expect(rec!.meta).toMatchObject({ provider: 'anthropic', reason: 'Backoffice sohbeti platform anahtari kurulumu' });
        const g = await api('GET', '/agent/provider');
        expect(g.json).toMatchObject({ configured: true, apiKey: 'sensitive' });
        const everything = [r.text, g.text, JSON.stringify(audit), JSON.stringify(sunk)].join('\n');
        expect(everything).not.toContain(PLATFORM_KEY);
    });

    it('kayit basarisiz test (gecersiz anahtar) 422 doner ve YAZMAZ', async () => {
        const bad = new ProviderService({ store, kv: () => kv, now: () => h.clock.now(), requireConsent: false, surface: 'backoffice_chat', verify: async () => { throw new LlmError('LLM_KEY_INVALID'); } });
        svc = bad;
        const r = await save();
        expect([r.status, r.json.code]).toEqual([422, 'LLM_KEY_INVALID']);
        expect(store.patches).toEqual([]);
    });

    it('DELETE: step-up + gerekce ister; basarida anahtar silinir (denetim removed + gerekce)', async () => {
        await save();
        expect((await api('DELETE', '/agent/provider', { cookie: session({ reauth: false }), body: { reason: 'Anahtar donusumu icin siliniyor' } })).status).toBe(401);
        expect((await api('DELETE', '/agent/provider', { body: {} })).status).toBe(400);
        expect((await api('DELETE', '/agent/provider', { body: { reason: 'Anahtar donusumu icin siliniyor' } })).status).toBe(204);
        expect(store.doc!.apiKey).toBeUndefined();
        await flush();
        expect(audit.find((a) => a.event === 'agent.provider.removed')).toMatchObject({ surface: 'backoffice_chat', meta: { reason: 'Anahtar donusumu icin siliniyor' } });
    });

    it('platform depo yalniz tid=0 icin calisir: tenant numarasiyla okuma/yazma reddedilir (platform anahtari tenant yoluna, tenant anahtari platforma sizmaz)', async () => {
        await expect(platformSettingsStore.read(1)).rejects.toThrow();
        await expect(platformSettingsStore.patch(7, { set: { apiKey: 'x' } })).rejects.toThrow();
    });

    it('Origin dogrulamasi: izinsiz Origin ile yazan uclar 403 (CSRF)', async () => {
        const res = await fetch(`${base}/agent/provider`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: `${ADMIN_COOKIE_NAME}=${session()}` }, body: '{}' });
        expect(res.status).toBe(403);
    });
});

describe('kayit degismezleri ve statik mandal (BR-4)', () => {
    const ADMIN_CHAT = CAPABILITIES.filter((c) => c.adminChat);
    it('adminChat kumesi AYNI 4 yetenek (yeni eklemek bilincli: bu liste + gerekce); hepsi platform kapsamli, salt-okuma, PII yok, strict girdi, strict cikti, MCP\'ye kapali, step-up gerektirmez', () => {
        expect(ADMIN_CHAT.map((c) => c.id).sort()).toEqual(['platform.engine.queues', 'platform.integrations.api_health', 'platform.integrations.resilience', 'platform.overview.health']);
        for (const c of ADMIN_CHAT) {
            expect([c.id, c.scope, c.effect, c.pii, c.minTier]).toEqual([c.id, 'platform', 'read', 'none', 'platformAdmin']);
            expect(c.mcp.exposed).toBeUndefined();
            expect((zodToJsonSchema(c.input) as any).additionalProperties).toBe(false);
            expect(c.output).not.toBe('legacy');
            for (const b of c.bindings) if (b.rpc) expect([b.rpc, requiresStepUp(b.rpc)]).toEqual([b.rpc, false]);
            // cikti alan adlarinda tenant is verisi / kisisel veri izi yok (tenant yalniz SAYAC: affectedTenants)
            const keys = JSON.stringify(zodToJsonSchema(c.output as any));
            expect(keys).not.toMatch(/"(tenantId|tenantIds|clientId|tid|email|phone|name|title|address|customer|orderNumber|sku|barcode|message|error|pod)"/);
        }
        expect(findRegistryInvariantViolations()).toEqual([]);
    });

    it('arac kumesi: platformAdmin 4 arac; tenant sahibi/yonetici/uye HIC; chat ve mcp turetimleri adminChat aracini ASLA icermez', () => {
        const env = { liveReadonly: false, maintenance: false, disabled: new Set<string>(), imp: false };
        expect(deriveTools({ actor: { tier: 'admin', platformAdmin: true }, env, surface: 'backoffice_chat' }).map((t) => t.name).sort()).toEqual(BO_TOOLS);
        for (const tier of ['member', 'admin', 'owner'] as const) expect(deriveTools({ actor: { tier }, env, surface: 'backoffice_chat' })).toEqual([]);
        for (const surface of ['chat', 'mcp'] as const) for (const actor of [{ tier: 'owner' as const }, { tier: 'admin' as const, platformAdmin: true }]) {
            expect(deriveTools({ actor, env, surface, mcpWrite: true }).filter((t) => t.name.startsWith('platform_'))).toEqual([]);
        }
        // kill-switch backoffice'te de gecerli
        expect(deriveTools({ actor: { tier: 'admin', platformAdmin: true }, env: { ...env, disabled: new Set(['platform.engine.queues']) }, surface: 'backoffice_chat' }).map((t) => t.name)).not.toContain('platform_engine_queues');
    });

    it('uretim kablolamasi (statik): backoffice broker PLATFORM saglayiciyi kullanir, tenant resolver/BYOK servisini DEGIL; musteri resolver platform servisini cagirmaz', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const src = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../../src', f), 'utf8');
        const adminRoutes = src('api/admin/adminAgentRoutes.ts').split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
        expect(adminRoutes).toMatch(/resolveProvider: \(\) => resolvePlatformProvider\(\)/);
        expect(adminRoutes).not.toMatch(/resolveLlmProvider|getProviderService|mongoSettingsStore/);
        const resolver = src('operations/agent/providerResolver.ts');
        const tenantPart = resolver.slice(resolver.indexOf('export async function resolveLlmProvider'), resolver.indexOf('// ---- BR-4'));
        expect(tenantPart).not.toMatch(/getPlatformProviderService|platformSettingsStore/);
        const platformPart = resolver.slice(resolver.indexOf('// ---- BR-4'));
        expect(platformPart).not.toMatch(/getProviderService\(\)/);
        // musteri rotalari backoffice yuzeyini hic kurmaz
        expect(src('api/http/agentRoutes.ts')).not.toMatch(/backoffice_chat/);
        // backoffice rotalari musteri cerezini/oturumunu okumaz
        expect(adminRoutes).not.toMatch(/JWT_TOKEN|getSecurityToken|Security\.getInstance|res\.locals\.(principal|actor)/);
        expect(adminRoutes).toMatch(/authenticateAdminRequest\(d\.deps, req, 'full'\)/);
    });
});
