/**
 * BR-5: Anthropic / OpenAI / Google baglastiricilari icin SOZLESME testleri. YALNIZ SAHTE fetch: GERCEK AG ISTEGI YOK.
 * Kapsam: akis (SSE, parcali cerceveler), arac cagirma eslemesi (istek + yanit), kullanim olayi, iptal (sessiz), her hata sinifi,
 * zaman asimlari, kesik akis, SABIT host (SSRF), izinli model listesi, dogrulama cagrisi (GET, cikarim yok), ANAHTAR SIZINTISI (hata/log).
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { setLogSink } from '../../../src/platform/core/logger';
import { LlmError, type LlmEvent, type LlmStreamRequest, type LlmProviderId, createLlmProvider, verifyProviderKey, LLM_HOSTS, LLM_CATALOG, isAllowedModel } from '../../../src/platform/llm';
import { assertFixedLlmUrl, parseSse } from '../../../src/platform/llm/providers/http';
import { toGeminiSchema } from '../../../src/platform/llm/providers/google';

const KEY = 'sk-test-SUPERSECRET-0123456789';
const enc = new TextEncoder();

interface Call { url: string; method: string; headers: Record<string, string>; body?: any; signal: AbortSignal }
type Script = (call: Call) => Promise<Response> | Response;

function fakeFetch(script: Script) {
    const calls: Call[] = [];
    const f = (async (url: any, init: any) => {
        const call: Call = { url: String(url), method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : undefined, signal: init?.signal };
        calls.push(call);
        return script(call);
    }) as unknown as typeof fetch;
    return { f, calls };
}

/** SSE govdesi: her oge ayri bayt parcasi (gercek agda cerceveler parcali gelir). */
function sse(chunks: string[], init: ResponseInit & { stallAfter?: boolean; signal?: AbortSignal } = {}): Response {
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
        pull(ctrl) {
            if (i < chunks.length) { ctrl.enqueue(enc.encode(chunks[i++])); return; }
            if (init.stallAfter) return new Promise<void>(() => { /* takilir: bosta zaman asimi */ });
            ctrl.close();
        },
        cancel() { /* istemci iptali */ },
    });
    return new Response(body, { status: init.status ?? 200, headers: { 'content-type': 'text/event-stream', ...(init.headers as Record<string, string>) } });
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const frame = (event: string | undefined, data: unknown) => `${event ? `event: ${event}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
const split = (s: string, n = 7) => s.match(new RegExp(`[\\s\\S]{1,${n}}`, 'g')) ?? [];

const req = (over: Partial<LlmStreamRequest> = {}): LlmStreamRequest => ({
    system: 'sys', messages: [{ role: 'user', content: 'merhaba' }], tools: [], maxTokens: 256, signal: new AbortController().signal, ...over,
});
const TOOL = { name: 'orders_list', description: 'Siparis listele', inputSchema: { type: 'object', properties: { search: { type: 'string' } }, additionalProperties: false, $schema: 'x' } };

async function collect(it: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> { const out: LlmEvent[] = []; for await (const e of it) out.push(e); return out; }
async function failure(it: AsyncIterable<LlmEvent>): Promise<LlmError> {
    try { await collect(it); } catch (e) { return e as LlmError; }
    throw new Error('hata bekleniyordu');
}

// ---- Saglayici basina: basarili akis govdeleri + hata govdeleri ----
interface Spec {
    id: LlmProviderId; model: string; host: string; streamPath: RegExp; keyHeader: string;
    textStream(): string[]; toolStream(): string[]; truncated(): string[]; inStreamError(): string[];
    errorBody(status: number, kind: 'quota' | 'auth' | 'rate' | 'model' | 'server'): unknown;
    verifyPath: string;
}
const SPECS: Spec[] = [
    {
        id: 'anthropic', model: 'claude-sonnet-4-5', host: 'api.anthropic.com', streamPath: /\/v1\/messages$/, keyHeader: 'x-api-key', verifyPath: '/v1/models/claude-sonnet-4-5',
        textStream: () => [
            frame('message_start', { type: 'message_start', message: { usage: { input_tokens: 11, output_tokens: 1 } } }),
            frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
            frame('ping', { type: 'ping' }),
            frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Mer' } }),
            frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'haba' } }),
            frame('content_block_stop', { type: 'content_block_stop', index: 0 }),
            frame('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } }),
            frame('message_stop', { type: 'message_stop' }),
        ],
        toolStream: () => [
            frame('message_start', { type: 'message_start', message: { usage: { input_tokens: 20, output_tokens: 0 } } }),
            frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
            frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Bakayim.' } }),
            frame('content_block_stop', { type: 'content_block_stop', index: 0 }),
            frame('content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'orders_list', input: {} } }),
            frame('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"sea' } }),
            frame('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'rch":"ali"}' } }),
            frame('content_block_stop', { type: 'content_block_stop', index: 1 }),
            frame('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 15 } }),
            frame('message_stop', { type: 'message_stop' }),
        ],
        truncated: () => [frame('message_start', { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } }), frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'x' } })],
        inStreamError: () => [frame('error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })],
        errorBody: (_s, k) => ({ type: 'error', error: { type: { quota: 'invalid_request_error', auth: 'authentication_error', rate: 'rate_limit_error', model: 'not_found_error', server: 'api_error' }[k], message: k === 'quota' ? 'Your credit balance is too low' : 'm' } }),
    },
    {
        id: 'openai', model: 'gpt-4.1', host: 'api.openai.com', streamPath: /\/v1\/chat\/completions$/, keyHeader: 'authorization', verifyPath: '/v1/models/gpt-4.1',
        textStream: () => [
            frame(undefined, { choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] }),
            frame(undefined, { choices: [{ index: 0, delta: { content: 'Mer' } }] }),
            frame(undefined, { choices: [{ index: 0, delta: { content: 'haba' } }] }),
            frame(undefined, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
            frame(undefined, { choices: [], usage: { prompt_tokens: 11, completion_tokens: 7 } }),
            frame(undefined, '[DONE]'),
        ],
        toolStream: () => [
            frame(undefined, { choices: [{ index: 0, delta: { content: 'Bakayim.' } }] }),
            frame(undefined, { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'orders_list', arguments: '' } }] } }] }),
            frame(undefined, { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"sea' } }] } }] }),
            frame(undefined, { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'rch":"ali"}' } }] } }] }),
            frame(undefined, { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
            frame(undefined, { choices: [], usage: { prompt_tokens: 20, completion_tokens: 15 } }),
            frame(undefined, '[DONE]'),
        ],
        truncated: () => [frame(undefined, { choices: [{ index: 0, delta: { content: 'x' } }] })],
        inStreamError: () => [frame(undefined, { error: { message: 'The server had an error', type: 'server_error' } })],
        errorBody: (_s, k) => ({ error: { message: 'm', type: k, code: { quota: 'insufficient_quota', auth: 'invalid_api_key', rate: 'rate_limit_exceeded', model: 'model_not_found', server: 'server_error' }[k] } }),
    },
    {
        id: 'google', model: 'gemini-2.5-flash', host: 'generativelanguage.googleapis.com', streamPath: /\/v1beta\/models\/gemini-2\.5-flash:streamGenerateContent$/, keyHeader: 'x-goog-api-key', verifyPath: '/v1beta/models/gemini-2.5-flash',
        textStream: () => [
            frame(undefined, { candidates: [{ content: { role: 'model', parts: [{ text: 'Mer' }] } }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 1 } }),
            frame(undefined, { candidates: [{ content: { role: 'model', parts: [{ text: 'haba' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 } }),
        ],
        toolStream: () => [
            frame(undefined, { candidates: [{ content: { role: 'model', parts: [{ text: 'Bakayim.' }] } }] }),
            frame(undefined, { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'orders_list', args: { search: 'ali' } } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15 } }),
        ],
        truncated: () => [frame(undefined, { candidates: [{ content: { role: 'model', parts: [{ text: 'x' }] } }] })],
        inStreamError: () => [frame(undefined, { error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } })],
        errorBody: (_s, k) => ({ error: { code: 0, message: k === 'quota' ? 'Billing is not enabled' : 'm', status: { quota: 'FAILED_PRECONDITION', auth: 'UNAUTHENTICATED', rate: 'RESOURCE_EXHAUSTED', model: 'NOT_FOUND', server: 'INTERNAL' }[k] } }),
    },
];

const logs: Array<{ msg?: string; fields: Record<string, unknown> }> = [];
afterEach(() => { setLogSink(undefined); logs.length = 0; });
const captureLogs = () => setLogSink((r) => logs.push({ msg: r.msg, fields: r.fields }));

describe.each(SPECS)('$id baglastiricisi', (spec) => {
    const make = (f: typeof fetch, over: object = {}) => createLlmProvider(spec.id, { apiKey: KEY, model: spec.model }, { fetch: f, ...over });

    it('metin akisi: parcali SSE cerceveleri dogru birlesir; kullanim + done sonda; istek sabit host/yol, anahtar yalniz basliktadir', async () => {
        const { f, calls } = fakeFetch(() => sse(split(spec.textStream().join(''))));
        const evs = await collect(make(f).stream(req()));
        expect(evs.filter((e) => e.type === 'text-delta').map((e: any) => e.text).join('')).toBe('Merhaba');
        expect(evs.slice(-2)).toEqual([{ type: 'usage', in: 11, out: 7 }, { type: 'done', reason: 'stop' }]);
        expect(calls).toHaveLength(1);
        const u = new URL(calls[0].url);
        expect([u.protocol, u.hostname, u.port]).toEqual(['https:', spec.host, '']);
        expect(u.pathname).toMatch(spec.streamPath);
        expect(calls[0].method).toBe('POST');
        expect(calls[0].url).not.toContain(KEY); // anahtar URL'de ASLA
        expect(JSON.stringify(calls[0].headers)).toContain(KEY);
        expect(Object.keys(calls[0].headers).map((h) => h.toLowerCase())).toContain(spec.keyHeader);
        expect(JSON.stringify(calls[0].body)).not.toContain(KEY);
        expect(calls[0].body.stream ?? true).toBe(true);
    });

    it('arac cagirma: parcali arguman birlesir, tool-call yayilir, done=tool_use; istekteki arac semasi saglayici bicimine eslenir', async () => {
        const { f, calls } = fakeFetch(() => sse(split(spec.toolStream().join(''), 11)));
        const evs = await collect(make(f).stream(req({ tools: [TOOL] })));
        const call = evs.find((e) => e.type === 'tool-call') as any;
        expect(call).toMatchObject({ name: 'orders_list', input: { search: 'ali' } });
        expect(typeof call.id).toBe('string');
        expect(call.id.length).toBeGreaterThan(0);
        expect(evs.slice(-2)).toEqual([{ type: 'usage', in: 20, out: 15 }, { type: 'done', reason: 'tool_use' }]);
        const b = JSON.stringify(calls[0].body);
        expect(b).toContain('orders_list');
        if (spec.id === 'anthropic') expect(calls[0].body.tools[0]).toMatchObject({ name: 'orders_list', input_schema: { type: 'object' } });
        if (spec.id === 'openai') expect(calls[0].body.tools[0]).toMatchObject({ type: 'function', function: { name: 'orders_list', parameters: { type: 'object' } } });
        if (spec.id === 'google') {
            const decl = calls[0].body.tools[0].functionDeclarations[0];
            expect(decl.name).toBe('orders_list');
            expect(JSON.stringify(decl.parameters)).not.toMatch(/additionalProperties|\$schema/); // Gemini OpenAPI alt kumesi
        }
    });

    it('arac sonucu turu: gecmis (assistant tool-call + tool sonucu) saglayici bicimine eslenir', async () => {
        const { f, calls } = fakeFetch(() => sse(split(spec.textStream().join(''))));
        await collect(make(f).stream(req({
            tools: [TOOL],
            messages: [
                { role: 'user', content: 'siparisler' },
                { role: 'assistant', content: 'Bakayim.', toolCalls: [{ id: 'c1', name: 'orders_list', input: { search: 'a' } }, { id: 'c2', name: 'orders_list', input: {} }] },
                { role: 'tool', toolCallId: 'c1', name: 'orders_list', content: '{"items":[1]}' },
                { role: 'tool', toolCallId: 'c2', name: 'orders_list', content: 'duz metin' },
            ],
        })));
        const body = calls[0].body;
        if (spec.id === 'anthropic') {
            expect(body.messages).toHaveLength(3); // user, assistant(tool_use x2), user(tool_result x2: TEK mesaj)
            expect(body.messages[1].content.filter((b: any) => b.type === 'tool_use')).toHaveLength(2);
            expect(body.messages[2].content.map((b: any) => b.tool_use_id)).toEqual(['c1', 'c2']);
        }
        if (spec.id === 'openai') {
            expect(body.messages.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'tool']);
            expect(body.messages[2].tool_calls[0]).toMatchObject({ id: 'c1', type: 'function', function: { name: 'orders_list', arguments: '{"search":"a"}' } });
            expect(body.messages[3]).toMatchObject({ tool_call_id: 'c1' });
        }
        if (spec.id === 'google') {
            expect(body.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
            expect(body.contents[1].parts.filter((p: any) => p.functionCall)).toHaveLength(2);
            expect(body.contents[2].parts.map((p: any) => p.functionResponse.name)).toEqual(['orders_list', 'orders_list']);
            expect(body.contents[2].parts[1].functionResponse.response).toEqual({ result: 'duz metin' }); // nesne olmayan sonuc sarilir
            expect(body.systemInstruction.parts[0].text).toBe('sys');
        }
    });

    it.each([
        ['quota', 402, 'LLM_QUOTA'], ['auth', 401, 'LLM_KEY_INVALID'], ['rate', 429, 'LLM_RATE_LIMITED'], ['model', 404, 'LLM_MODEL_UNAVAILABLE'], ['server', 500, 'LLM_UNAVAILABLE'],
    ] as Array<[string, number, string]>)('HTTP hata sinifi: %s (%i) -> %s; ham govde/anahtar hataya SIZMAZ', async (kind, status, code) => {
        captureLogs();
        const { f } = fakeFetch(() => json(status, spec.errorBody(status, kind as any), status === 429 ? { 'retry-after': '12' } : {}));
        const err = await failure(make(f).stream(req()));
        expect(err).toBeInstanceOf(LlmError);
        expect(err.code).toBe(code);
        if (code === 'LLM_RATE_LIMITED') expect(err.retryAfterSec).toBe(12);
        const all = JSON.stringify([err.message, logs]);
        expect(all).not.toContain(KEY);
        expect(all).not.toMatch(/credit balance|Billing is not enabled/); // ham govde loglanmaz
        expect(logs.some((l) => l.fields.class === code && l.fields.provider === spec.id)).toBe(true); // logda yalniz saglayici/sinif
    });

    it('akis icindeki hata (HTTP 200 sonrasi) siniflanir', async () => {
        const { f } = fakeFetch(() => sse(spec.inStreamError()));
        expect((await failure(make(f).stream(req()))).code).toBe('LLM_UNAVAILABLE');
    });

    it('terminal isaretsiz kesilen akis LLM_UNAVAILABLE (sessizce tamam SAYILMAZ)', async () => {
        const { f } = fakeFetch(() => sse(spec.truncated()));
        expect((await failure(make(f).stream(req()))).code).toBe('LLM_UNAVAILABLE');
    });

    it('ag hatasi (fetch reddeder) LLM_UNAVAILABLE; hata nesnesinde anahtar yok', async () => {
        const { f } = fakeFetch(() => { throw new TypeError(`fetch failed for ${KEY}`); });
        const err = await failure(make(f).stream(req()));
        expect(err.code).toBe('LLM_UNAVAILABLE');
        expect(JSON.stringify([err.message, err.stack?.includes(KEY)])).not.toContain(KEY);
    });

    it('baglanti zaman asimi: yanit basliklari gelmezse LLM_UNAVAILABLE; istek iptal edilir', async () => {
        let sig!: AbortSignal;
        const { f } = fakeFetch((c) => { sig = c.signal; return new Promise<Response>((_, rej) => c.signal.addEventListener('abort', () => rej(new Error('aborted')))); });
        const err = await failure(make(f, { connectTimeoutMs: 30 }).stream(req()));
        expect(err.code).toBe('LLM_UNAVAILABLE');
        expect(sig.aborted).toBe(true);
    });

    it('bosta (ilk bayt sonrasi sessizlik) zaman asimi LLM_UNAVAILABLE', async () => {
        const first = spec.textStream().slice(0, 1);
        const { f } = fakeFetch(() => sse(first, { stallAfter: true }));
        expect((await failure(make(f, { idleTimeoutMs: 30 }).stream(req()))).code).toBe('LLM_UNAVAILABLE');
    });

    it('toplam zaman asimi (yavas ama canli akis) LLM_UNAVAILABLE', async () => {
        const { f } = fakeFetch(() => new Response(new ReadableStream<Uint8Array>({
            async pull(c) { await new Promise((r) => setTimeout(r, 15)); c.enqueue(enc.encode(': ping\n\n')); },
        }), { status: 200 }));
        expect((await failure(make(f, { totalTimeoutMs: 60, idleTimeoutMs: 1000 }).stream(req()))).code).toBe('LLM_UNAVAILABLE');
    });

    it('IPTAL: akis ortasinda abort -> hata FIRLATMAZ, akis sessizce biter, fetch iptal edilir', async () => {
        const ac = new AbortController();
        let sig!: AbortSignal;
        const { f } = fakeFetch((c) => { sig = c.signal; return sse(spec.textStream().slice(0, 4), { stallAfter: true }); });
        const out: LlmEvent[] = [];
        for await (const e of make(f).stream(req({ signal: ac.signal }))) {
            out.push(e);
            if (e.type === 'text-delta') ac.abort();
        }
        expect(out.some((e) => e.type === 'done')).toBe(false);
        expect(sig.aborted).toBe(true);
    });

    it('IPTAL: istek baslamadan abort edilmis sinyal -> sessiz bitis (hata yok)', async () => {
        const ac = new AbortController(); ac.abort();
        const { f } = fakeFetch((c) => new Promise<Response>((_, rej) => { if (c.signal.aborted) rej(new Error('aborted')); }));
        expect(await collect(make(f).stream(req({ signal: ac.signal })))).toEqual([]);
    });

    it('dogrulama: SALT-OKUMA GET (cikarim yok), model yolunda; 200 -> basarili; hata siniflari', async () => {
        const ok = fakeFetch(() => json(200, { id: spec.model }));
        await verifyProviderKey(spec.id, { apiKey: KEY, model: spec.model }, new AbortController().signal, { fetch: ok.f });
        expect(ok.calls).toHaveLength(1);
        expect(ok.calls[0].method).toBe('GET');
        expect(ok.calls[0].body).toBeUndefined();
        expect(new URL(ok.calls[0].url).hostname).toBe(spec.host);
        expect(new URL(ok.calls[0].url).pathname).toBe(spec.verifyPath);
        expect(ok.calls[0].url).not.toContain(KEY);
        const bad = fakeFetch(() => json(401, spec.errorBody(401, 'auth')));
        await expect(verifyProviderKey(spec.id, { apiKey: KEY, model: spec.model }, new AbortController().signal, { fetch: bad.f })).rejects.toMatchObject({ code: 'LLM_KEY_INVALID' });
        const nf = fakeFetch(() => json(404, spec.errorBody(404, 'model')));
        await expect(verifyProviderKey(spec.id, { apiKey: KEY, model: spec.model }, new AbortController().signal, { fetch: nf.f })).rejects.toMatchObject({ code: 'LLM_MODEL_UNAVAILABLE' });
    });
});

describe('SSRF / model izinli listesi', () => {
    it('host kodda SABIT: katalog = izinli host listesi; baska host/sema/port/userinfo reddedilir (istek ATILMAZ)', () => {
        expect(LLM_HOSTS).toEqual({ anthropic: 'api.anthropic.com', openai: 'api.openai.com', google: 'generativelanguage.googleapis.com' });
        expect(() => assertFixedLlmUrl('openai', 'https://api.openai.com/v1/models')).not.toThrow();
        for (const bad of ['https://evil.example/v1/models', 'http://api.openai.com/v1/models', 'https://api.openai.com:8443/v1', 'https://user:pw@api.openai.com/v1',
            'https://api.openai.com.evil.example/v1', 'https://api.anthropic.com/v1/messages', 'https://127.0.0.1/v1', 'not a url']) {
            expect(() => assertFixedLlmUrl('openai', bad)).toThrow(LlmError);
        }
    });
    it('izinli liste disi model: istek atilmadan LLM_MODEL_UNAVAILABLE (yol enjeksiyonu dahil)', async () => {
        const { f, calls } = fakeFetch(() => json(200, {}));
        for (const id of ['anthropic', 'openai', 'google'] as const) {
            expect(() => createLlmProvider(id, { apiKey: KEY, model: '../../admin' }, { fetch: f })).toThrow(LlmError);
            expect(() => createLlmProvider(id, { apiKey: KEY, model: 'gemini-2.5-flash:evil' }, { fetch: f })).toThrow(LlmError);
            await expect(verifyProviderKey(id, { apiKey: KEY, model: 'x/../y' }, new AbortController().signal, { fetch: f })).rejects.toMatchObject({ code: 'LLM_MODEL_UNAVAILABLE' });
        }
        expect(calls).toHaveLength(0);
    });
    it('katalog: saglayici basina 2-4 model, tam biri recommended; model/sag eslemesi', () => {
        expect(LLM_CATALOG.map((c) => c.id).sort()).toEqual(['anthropic', 'google', 'openai']);
        for (const c of LLM_CATALOG) {
            expect(c.models.length).toBeGreaterThanOrEqual(2);
            expect(c.models.length).toBeLessThanOrEqual(4);
            expect(c.models.filter((m) => m.recommended)).toHaveLength(1);
            for (const m of c.models) expect(m.id).toMatch(/^[A-Za-z0-9._-]+$/);
        }
        expect(isAllowedModel('openai', 'claude-sonnet-4-5')).toBe(false);
    });
});

describe('yardimcilar', () => {
    it('parseSse: \\r\\n, yorum satiri, cok satirli data, parca siniri', async () => {
        async function* chunks() { yield enc.encode(': c\r\nevent: a\r\ndata: 1\r\ndata: 2\r\n\r\nda'); yield enc.encode('ta: {"x":1}\n\n'); }
        const out: unknown[] = [];
        for await (const f of parseSse(chunks())) out.push(f);
        expect(out).toEqual([{ event: 'a', data: '1\n2' }, { event: undefined, data: '{"x":1}' }]);
    });
    it('toGeminiSchema: desteklenmeyen anahtarlar atilir; tur dizisi nullable olur; ic ice', () => {
        expect(toGeminiSchema({ $schema: 'x', type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: ['string', 'null'], description: 'd' }, b: { type: 'array', items: { type: 'integer', minimum: 1 } } } }))
            .toEqual({ type: 'object', required: ['a'], properties: { a: { type: 'string', nullable: true, description: 'd' }, b: { type: 'array', items: { type: 'integer', minimum: 1 } } } });
    });
});
