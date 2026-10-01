// ADR-0034 / BR-5: Google Gemini (generativelanguage) baglastiricisi (duz fetch + SSE `alt=sse`). Arac cagirma: functionDeclarations/functionCall/functionResponse.
// Host SABIT (catalog.LLM_HOSTS.google). Anahtar yalniz `x-goog-api-key` basliginda (URL'de DEGIL: URL loglara/araclara sizar); hicbir log/hata/olaya girmez.
import type { LlmEvent, LlmMessage, LlmProvider, LlmStreamRequest } from '../LlmProvider';
import { LLM_HOSTS } from '../catalog';
import { classifyProviderError, extractErrorInfo } from '../classifyProviderError';
import { requestJson, streamSse, toolInput, tryJson, type ProviderHttpOptions, type SseFrame, type StreamParser } from './http';

const BASE = `https://${LLM_HOSTS.google}`;
const headers = (apiKey: string): Record<string, string> => ({ 'x-goog-api-key': apiKey, 'content-type': 'application/json', accept: 'text/event-stream' });

/** Gemini `parameters` OpenAPI alt kumesidir: `$schema`/`additionalProperties`/`$ref` vb. reddedilir. Yalniz bilinen alanlar korunur. */
const SCHEMA_KEYS = new Set(['type', 'format', 'title', 'description', 'nullable', 'enum', 'maxItems', 'minItems', 'minProperties', 'maxProperties',
    'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'required']);

export function toGeminiSchema(schema: unknown, depth = 0): Record<string, unknown> {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) || depth > 12) return {};
    const s = schema as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) if (SCHEMA_KEYS.has(k) && k !== 'type') out[k] = v;
    if (Array.isArray(s.type)) {
        const types = s.type.filter((t): t is string => typeof t === 'string');
        const nonNull = types.find((t) => t !== 'null');
        if (nonNull) out.type = nonNull;
        if (types.includes('null')) out.nullable = true;
    } else if (typeof s.type === 'string') out.type = s.type;
    if (s.properties && typeof s.properties === 'object') {
        out.properties = Object.fromEntries(Object.entries(s.properties as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v, depth + 1)]));
    }
    if (s.items) out.items = toGeminiSchema(s.items, depth + 1);
    if (Array.isArray(s.anyOf)) out.anyOf = s.anyOf.map((x) => toGeminiSchema(x, depth + 1));
    if (Array.isArray(out.required) && !s.properties) delete out.required;
    return out;
}

type Part = Record<string, unknown>;
interface Content { role: 'user' | 'model'; parts: Part[] }

export function toGeminiContents(messages: readonly LlmMessage[]): Content[] {
    const out: Content[] = [];
    for (const m of messages) {
        if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.content }] });
        else if (m.role === 'assistant') {
            const parts: Part[] = [];
            if (m.content) parts.push({ text: m.content });
            for (const c of m.toolCalls ?? []) parts.push({ functionCall: { name: c.name, args: toolInput(c.input) } });
            out.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
        } else {
            const parsed = tryJson(m.content);
            const response = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { result: m.content };
            const part = { functionResponse: { name: m.name, response } };
            const last = out[out.length - 1];
            if (last && last.role === 'user' && last.parts.every((p) => 'functionResponse' in p)) last.parts.push(part);
            else out.push({ role: 'user', parts: [part] });
        }
    }
    return out;
}

export function geminiBody(req: LlmStreamRequest): string {
    return JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toGeminiContents(req.messages),
        generationConfig: { maxOutputTokens: req.maxTokens },
        ...(req.tools.length ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.inputSchema) })) }] } : {}),
    });
}

class GoogleParser implements StreamParser {
    finished = false;
    private finish: string | undefined;
    private inTokens = 0;
    private outTokens = 0;
    private calls = 0;

    onFrame(f: SseFrame): LlmEvent[] {
        const d = tryJson(f.data) as any;
        if (!d || typeof d !== 'object') return [];
        if (d.error) throw classifyProviderError({ status: 0, ...extractErrorInfo(d) });
        if (d.usageMetadata) { this.inTokens = Number(d.usageMetadata.promptTokenCount) || this.inTokens; this.outTokens = Number(d.usageMetadata.candidatesTokenCount) || this.outTokens; }
        const cand = d.candidates?.[0];
        const out: LlmEvent[] = [];
        for (const p of Array.isArray(cand?.content?.parts) ? cand.content.parts : []) {
            if (p.thought === true) continue; // model dusunce ozeti: kullaniciya gitmez
            if (typeof p.text === 'string' && p.text) out.push({ type: 'text-delta', text: p.text });
            else if (p.functionCall && typeof p.functionCall.name === 'string') {
                this.calls += 1;
                out.push({ type: 'tool-call', id: String(p.functionCall.id ?? `gcall_${this.calls}`), name: p.functionCall.name, input: toolInput(p.functionCall.args) });
            }
        }
        if (cand?.finishReason) this.finish = String(cand.finishReason);
        return out;
    }
    /** Gemini akisi terminal isaret tasimaz: bitis nedeni goruldugunde akis sonu = tamam. */
    end(): LlmEvent[] {
        if (!this.finish) return [];
        this.finished = true;
        const reason = this.calls > 0 ? 'tool_use' : this.finish === 'MAX_TOKENS' ? 'length' : 'stop';
        return [{ type: 'usage', in: this.inTokens, out: this.outTokens }, { type: 'done', reason }];
    }
}

export class GoogleProvider implements LlmProvider {
    readonly id = 'google';
    constructor(private readonly apiKey: string, private readonly model: string, private readonly http: ProviderHttpOptions = {}) { }
    stream(req: LlmStreamRequest): AsyncIterable<LlmEvent> {
        const url = `${BASE}/v1beta/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`;
        return streamSse({ provider: 'google', url, method: 'POST', headers: headers(this.apiKey), body: geminiBody(req) }, new GoogleParser(), req.signal, this.http);
    }
}

/** Salt-okuma dogrulama: `GET /v1beta/models/{model}` (cikarim YOK). */
export async function verifyGoogle(apiKey: string, model: string, signal: AbortSignal, http: ProviderHttpOptions = {}): Promise<void> {
    await requestJson({ provider: 'google', url: `${BASE}/v1beta/models/${encodeURIComponent(model)}`, method: 'GET', headers: { ...headers(apiKey), accept: 'application/json' } }, signal, http);
}
