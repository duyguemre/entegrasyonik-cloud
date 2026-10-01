import { describe, it, expect, afterEach } from '@jest/globals';
import { AgentBroker, MAX_INPUT_CHARS, type AgentCtx, type BrokerDeps, type ResolvedProvider } from '../../../src/operations/agent/AgentBroker';
import { MemoryKv } from '../../../src/operations/agent/kv';
import { ConversationStore } from '../../../src/operations/agent/ConversationStore';
import { ServerEventSchema, AgentInfoSchema, type ServerEvent, type TurnRequest } from '../../../src/operations/agent/protocol/v1';
import { LlmError, ScriptedLlmProvider, type LlmEvent, type LlmProvider, type LlmStreamRequest } from '../../../src/platform/llm';

const ctx = (over: Partial<AgentCtx> = {}): AgentCtx => ({ tid: 1, userId: 'u1', canConfigure: false, canConsent: false, readOnly: false, ...over });
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const treq = (text: string, over: Partial<TurnRequest> = {}): TurnRequest => ({
    v: 1, conversationId: null, clientTurnId: uuid(), locale: 'tr', input: { kind: 'text', text }, ...over,
});

class FnProvider implements LlmProvider {
    readonly id = 'fn';
    seen: LlmStreamRequest[] = [];
    constructor(private readonly fn: (req: LlmStreamRequest) => AsyncIterable<LlmEvent>) { }
    stream(req: LlmStreamRequest) { this.seen.push(req); return this.fn(req); }
}
const textProvider = (...parts: string[]) => new FnProvider(async function* () {
    for (const t of parts) yield { type: 'text-delta', text: t } as LlmEvent;
    yield { type: 'done', reason: 'stop' } as LlmEvent;
});

const brokers: AgentBroker[] = [];
function mk(over: Partial<BrokerDeps> & { provider?: LlmProvider | null } = {}) {
    const kv = new MemoryKv();
    const provider = over.provider === undefined ? textProvider('merhaba') : over.provider;
    const rp: ResolvedProvider | null = provider ? { provider } : null;
    const b = new AgentBroker({
        kv: () => kv, isEnabled: () => true, isMaintenance: () => false, resolveProvider: async () => rp, ...over,
    });
    brokers.push(b);
    return { b, kv, provider };
}
afterEach(() => { brokers.splice(0).forEach((b) => b.stop()); });

async function runAll(b: AgentBroker, c: AgentCtx, r: TurnRequest, signal = new AbortController().signal): Promise<ServerEvent[]> {
    const out: ServerEvent[] = [];
    const t = await b.beginTurn(c, r);
    await t.run((e) => out.push(e), signal);
    return out;
}

describe('AgentBroker.info', () => {
    it('kapali bayrak -> DISABLED (oneri yok); bakim -> enabled+readOnly; anahtar yok -> SETUP_REQUIRED; aksi enabled', async () => {
        const disabled = await mk({ isEnabled: () => false }).b.info(ctx());
        expect(disabled).toMatchObject({ enabled: false, reason: 'DISABLED', suggestions: [] });
        expect(await mk({ isMaintenance: () => true }).b.info(ctx())).toMatchObject({ enabled: true, readOnly: true });
        expect(await mk({ provider: null }).b.info(ctx({ canConfigure: true }))).toMatchObject({ enabled: false, reason: 'SETUP_REQUIRED', setup: { configured: false, canConfigure: true } });
        const ok = await mk().b.info(ctx({ readOnly: true }), 'en');
        expect(ok).toMatchObject({ v: 1, enabled: true, readOnly: true, limits: { maxInputChars: MAX_INPUT_CHARS, turnsPerMinute: 10 }, setup: { configured: true } });
        expect(ok.reason).toBeUndefined();
        expect(ok.suggestions[0].text).toMatch(/orders/i);
        for (const i of [disabled, ok]) expect(AgentInfoSchema.safeParse(i).success).toBe(true);
    });
    it('kill-switch onceligi: kapaliyken anahtar durumu sorgulanmaz/sizmaz', async () => {
        let asked = false;
        const { b } = mk({ isEnabled: () => false, resolveProvider: async () => { asked = true; return null; } });
        await b.info(ctx());
        expect(asked).toBe(false);
    });
});

describe('AgentBroker.beginTurn sinirlari', () => {
    it('kapali -> UNAVAILABLE 503; bakim -> tur acilir (BR-3); anahtar yok -> SETUP_REQUIRED 403; form girdisi -> VALIDATION', async () => {
        await expect(mk({ isEnabled: () => false }).b.beginTurn(ctx(), treq('a'))).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 });
        await expect(mk({ isMaintenance: () => true }).b.beginTurn(ctx(), treq('a'))).resolves.toBeDefined();
        await expect(mk({ provider: null }).b.beginTurn(ctx(), treq('a'))).rejects.toMatchObject({ code: 'SETUP_REQUIRED', status: 403 });
        const form = treq('a', { input: { kind: 'form', formId: 'f', values: {} } });
        await expect(mk().b.beginTurn(ctx(), form)).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(mk().b.beginTurn(ctx(), treq('a', { conversationId: 'a:b' }))).rejects.toMatchObject({ code: 'VALIDATION' });
    });
    it('eszamanli 2. tur -> 409 TURN_IN_PROGRESS; tur bitince kilit birakilir', async () => {
        const { b } = mk();
        const first = await b.beginTurn(ctx(), treq('bir'));
        await expect(b.beginTurn(ctx(), treq('iki'))).rejects.toMatchObject({ code: 'TURN_IN_PROGRESS', status: 409 });
        await first.run(() => undefined, new AbortController().signal);
        await expect(runAll(b, ctx(), treq('uc'))).resolves.toBeDefined();
    });
    it('baska kullanici ve baska tenant kilitten etkilenmez', async () => {
        const { b } = mk();
        const first = await b.beginTurn(ctx(), treq('bir'));
        const other = await b.beginTurn(ctx({ userId: 'u2' }), treq('iki'));
        const tenant2 = await b.beginTurn(ctx({ tid: 2 }), treq('uc'));
        await Promise.all([first.abandon(), other.abandon(), tenant2.abandon()]);
    });
    it('ayni clientTurnId -> 409 TURN_DUPLICATE ve kilit sizmaz (sonraki yeni id ile tur calisir)', async () => {
        const { b } = mk();
        const r = treq('a');
        await runAll(b, ctx(), r);
        await expect(b.beginTurn(ctx(), r)).rejects.toMatchObject({ code: 'TURN_DUPLICATE', status: 409 });
        await expect(runAll(b, ctx(), treq('a'))).resolves.toBeDefined();
    });
    it('abandon idempotent ve kilidi birakir', async () => {
        const { b } = mk();
        const t = await b.beginTurn(ctx(), treq('a'));
        await t.abandon(); await t.abandon();
        await expect(runAll(b, ctx(), treq('b'))).resolves.toBeDefined();
    });
    it('kullanici basina dakikada N tur (429 RATE_LIMITED, retryAfterSec); baska kullanici etkilenmez', async () => {
        const { b } = mk({ turnsPerMinute: 2 });
        await runAll(b, ctx(), treq('1')); await runAll(b, ctx(), treq('2'));
        const err: any = await b.beginTurn(ctx(), treq('3')).catch((e) => e);
        expect(err).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
        expect(err.details.retryAfterSec).toBeGreaterThan(0);
        await expect(runAll(b, ctx({ userId: 'u2' }), treq('x'))).resolves.toBeDefined();
    });
});

describe('AgentBroker.run olay akisi', () => {
    it('sira: turn.start -> part(text, streaming) -> delta... -> turn.end completed; hepsi chat/v1 semasindan gecer', async () => {
        const { b } = mk({ provider: textProvider('Mer', 'haba ', 'dunya') });
        const evs = await runAll(b, ctx(), treq('selam'));
        expect(evs.map((e) => e.type)).toEqual(['turn.start', 'part', 'delta', 'delta', 'delta', 'turn.end']);
        for (const e of evs) expect(ServerEventSchema.safeParse(e).success).toBe(true);
        const start = evs[0] as Extract<ServerEvent, { type: 'turn.start' }>;
        const part = evs[1] as Extract<ServerEvent, { type: 'part' }>;
        expect(part.messageId).toBe(start.messageId);
        expect(part.part).toMatchObject({ type: 'text', streaming: true, text: '' });
        const deltas = evs.filter((e) => e.type === 'delta') as Array<Extract<ServerEvent, { type: 'delta' }>>;
        expect(deltas.every((d) => d.partId === part.part.id && d.messageId === start.messageId)).toBe(true);
        expect(deltas.map((d) => d.text).join('')).toBe('Merhaba dunya');
        expect(evs[evs.length - 1]).toEqual({ type: 'turn.end', turnId: start.turnId, status: 'completed' });
    });
    it('yeni konusmada sunucu conversationId atar; ikinci turda gecmis saglayiciya gider (60 dk calisma bellegi)', async () => {
        const provider = textProvider('tamam');
        const { b, kv } = mk({ provider });
        const first = await runAll(b, ctx(), treq('ilk mesaj'));
        const convId = (first[0] as Extract<ServerEvent, { type: 'turn.start' }>).conversationId;
        expect(convId).toMatch(/^[0-9a-f-]{36}$/);
        await runAll(b, ctx(), treq('ikinci', { conversationId: convId }));
        expect(provider.seen[1].messages.map((m) => [m.role, (m as any).content])).toEqual([['user', 'ilk mesaj'], ['assistant', 'tamam'], ['user', 'ikinci']]);
        expect(provider.seen[0].tools).toEqual([]); // BR-1: arac yok
        expect(kv.keys()).toContain(`agent:conv:app:1:u1:${convId}`);
    });
    it('reset konusmayi siler; iki tenantin ayni convId calisma bellegi ayri kalir', async () => {
        const provider = textProvider('ok');
        const { b } = mk({ provider });
        await runAll(b, ctx({ tid: 1 }), treq('A-tenant', { conversationId: 'shared' }));
        await runAll(b, ctx({ tid: 2 }), treq('B-tenant', { conversationId: 'shared' }));
        expect(provider.seen[1].messages).toEqual([{ role: 'user', content: 'B-tenant' }]); // A'nin gecmisi B'ye sizmaz
        await b.reset({ tid: 1, userId: 'u1' }, 'shared');
        await runAll(b, ctx({ tid: 1 }), treq('yeniden', { conversationId: 'shared' }));
        expect(provider.seen[2].messages).toEqual([{ role: 'user', content: 'yeniden' }]);
        await runAll(b, ctx({ tid: 2 }), treq('B2', { conversationId: 'shared' }));
        expect(provider.seen[3].messages).toHaveLength(3); // B'nin gecmisi duruyor
    });
    it('saglayici hatasi -> error olayi (kod, eylem), kilit birakilir, konusma kaydedilmez', async () => {
        const { b, kv } = mk({ provider: new ScriptedLlmProvider({ sleep: async () => undefined }) });
        const evs = await runAll(b, ctx(), treq('anahtarim gecersiz'));
        expect(evs.map((e) => e.type)).toEqual(['turn.start', 'error']);
        expect(evs[1]).toMatchObject({ error: { code: 'LLM_KEY_INVALID', retryable: false, action: { kind: 'setup' } } });
        expect(ServerEventSchema.safeParse(evs[1]).success).toBe(true);
        expect(kv.keys().filter((k) => k.startsWith('agent:conv:'))).toEqual([]);
        await expect(runAll(b, ctx(), treq('tekrar'))).resolves.toBeDefined();
    });
    const llmCases: Array<[LlmError['code'], boolean, string | undefined]> = [
        ['LLM_QUOTA', false, undefined], ['LLM_RATE_LIMITED', true, 'retry'], ['LLM_MODEL_UNAVAILABLE', false, 'setup'], ['LLM_UNAVAILABLE', true, 'retry'],
    ];
    it.each(llmCases)('%s -> retryable=%s action=%s', async (code, retryable, action) => {
        // eslint-disable-next-line require-yield
        const p = new FnProvider(async function* () { throw new LlmError(code, { retryAfterSec: 5 }); });
        const evs = await runAll(mk({ provider: p }).b, ctx(), treq('x', { locale: 'en' }));
        const err = evs[1] as Extract<ServerEvent, { type: 'error' }>;
        expect(err.error.code).toBe(code);
        expect(err.error.retryable).toBe(retryable);
        expect(err.error.action?.kind).toBe(action);
        expect(err.error.message).not.toMatch(/undefined|Error:/); // ham hata sizmaz
    });
    it('beklenmeyen saglayici hatasi -> INTERNAL, ham ileti istemciye gitmez', async () => {
        // eslint-disable-next-line require-yield
        const p = new FnProvider(async function* () { throw new Error('sk-secret-123 baglanti kurulamadi'); });
        const evs = await runAll(mk({ provider: p }).b, ctx(), treq('x'));
        expect(evs[1]).toMatchObject({ type: 'error', error: { code: 'INTERNAL' } });
        expect(JSON.stringify(evs)).not.toContain('sk-secret');
    });
    it('arac listesi bos iken gelen tool-call savunmasi: error UNAVAILABLE', async () => {
        const p = new FnProvider(async function* () { yield { type: 'tool-call', id: 'c', name: 'orders_list', input: {} } as LlmEvent; });
        const evs = await runAll(mk({ provider: p }).b, ctx(), treq('x'));
        expect(evs[evs.length - 1]).toMatchObject({ type: 'error', error: { code: 'UNAVAILABLE' } });
    });
    it('metin 20.000 karakterle sinirlanir; delta olaylari <= 2000 karakter', async () => {
        const { b } = mk({ provider: textProvider('a'.repeat(25_000)) });
        const evs = await runAll(b, ctx(), treq('uzun'));
        const deltas = evs.filter((e) => e.type === 'delta') as Array<Extract<ServerEvent, { type: 'delta' }>>;
        expect(deltas.every((d) => d.text.length <= 2000)).toBe(true);
        expect(deltas.reduce((s, d) => s + d.text.length, 0)).toBe(20_000);
    });
    it('istemci kopunca: saglayici sinyali iptal, sonraki olay yok, konusma kaydedilmez, kilit birakilir', async () => {
        let providerSignal: AbortSignal | undefined;
        const p = new FnProvider(async function* (req) {
            providerSignal = req.signal;
            yield { type: 'text-delta', text: 'bir' } as LlmEvent;
            await new Promise<void>((r) => req.signal.addEventListener('abort', () => r(), { once: true }));
            yield { type: 'text-delta', text: 'iki' } as LlmEvent; // iptal sonrasi yazilmamali
        });
        const { b, kv } = mk({ provider: p });
        const ac = new AbortController();
        const evs: ServerEvent[] = [];
        const t = await b.beginTurn(ctx(), treq('kop'));
        const done = t.run((e) => { evs.push(e); if (e.type === 'delta') ac.abort(); }, ac.signal);
        await done;
        expect(providerSignal?.aborted).toBe(true);
        expect(evs.map((e) => e.type)).toEqual(['turn.start', 'part', 'delta']);
        expect(kv.keys().filter((k) => k.startsWith('agent:conv:'))).toEqual([]);
        await (await b.beginTurn(ctx(), treq('sonra'))).abandon(); // kilit serbest (beginTurn 409 vermez)
    });
    it('saglayici sinyali yok sayarsa bile iptalde takilmaz (yaris)', async () => {
        const p = new FnProvider(async function* () {
            yield { type: 'text-delta', text: 'x' } as LlmEvent;
            await new Promise(() => undefined); // asla donmez, sinyale bakmaz
        });
        const ac = new AbortController();
        const { b } = mk({ provider: p });
        const t = await b.beginTurn(ctx(), treq('kop'));
        await t.run((e) => { if (e.type === 'delta') ac.abort(); }, ac.signal);
        await (await b.beginTurn(ctx(), treq('sonra'))).abandon();
    });
    it('tur suresi asilirsa (60 sn ust siniri; burada kisaltilmis) error TIMEOUT', async () => {
        // eslint-disable-next-line require-yield
        const p = new FnProvider(async function* (req) {
            await new Promise<void>((r) => req.signal.addEventListener('abort', () => r(), { once: true }));
        });
        const evs = await runAll(mk({ provider: p, turnTimeoutMs: 30 }).b, ctx(), treq('yavas'));
        expect(evs.map((e) => e.type)).toEqual(['turn.start', 'error']);
        expect(evs[1]).toMatchObject({ error: { code: 'TIMEOUT', retryable: true } });
    });
    it('saglayici olmayan olay semasi ihlali tur hatasi olur (savunma: emit oncesi dogrulama)', async () => {
        const evs: ServerEvent[] = [];
        const t = await mk().b.beginTurn(ctx(), treq('a'));
        await t.run((e) => evs.push(e), new AbortController().signal);
        expect(evs.every((e) => ServerEventSchema.safeParse(e).success)).toBe(true);
    });
});

describe('dogrudan ConversationStore ile broker anahtar uyumu', () => {
    it('broker kaydi ConversationStore.load ile okunur (iki tenant ayri anahtar)', async () => {
        const { b, kv } = mk();
        await runAll(b, ctx({ tid: 1 }), treq('a', { conversationId: 'c1' }));
        await runAll(b, ctx({ tid: 2 }), treq('b', { conversationId: 'c1' }));
        const s = new ConversationStore(kv);
        expect((await s.load(1, 'u1', 'c1'))[0].text).toBe('a');
        expect((await s.load(2, 'u1', 'c1'))[0].text).toBe('b');
    });
});
