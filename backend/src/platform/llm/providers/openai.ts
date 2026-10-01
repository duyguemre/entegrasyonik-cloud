// ADR-0034 / BR-5: OpenAI Chat Completions baglastiricisi (duz fetch + SSE). Arac cagirma: tools/tool_calls + role:'tool'.
// Host SABIT (catalog.LLM_HOSTS.openai). Anahtar yalniz `authorization` basliginda; hicbir log/hata/olaya girmez.
import type { LlmEvent, LlmMessage, LlmProvider, LlmStreamRequest } from '../LlmProvider';
import { LLM_HOSTS } from '../catalog';
import { classifyProviderError, extractErrorInfo } from '../classifyProviderError';
import { requestJson, streamSse, toolInput, tryJson, type ProviderHttpOptions, type SseFrame, type StreamParser } from './http';

const BASE = `https://${LLM_HOSTS.openai}`;
const headers = (apiKey: string): Record<string, string> => ({ authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'text/event-stream' });

export function toOpenAiMessages(system: string, messages: readonly LlmMessage[]): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [{ role: 'system', content: system }];
    for (const m of messages) {
        if (m.role === 'user') out.push({ role: 'user', content: m.content });
        else if (m.role === 'assistant') {
            const calls = (m.toolCalls ?? []).map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(toolInput(c.input)) } }));
            out.push({ role: 'assistant', content: m.content || null, ...(calls.length ? { tool_calls: calls } : {}) });
        } else out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    }
    return out;
}

export function openAiBody(model: string, req: LlmStreamRequest): string {
    return JSON.stringify({
        model, stream: true, stream_options: { include_usage: true }, max_completion_tokens: req.maxTokens,
        messages: toOpenAiMessages(req.system, req.messages),
        ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
    });
}

const FINISH: Readonly<Record<string, 'stop' | 'tool_use' | 'length'>> = { stop: 'stop', tool_calls: 'tool_use', function_call: 'tool_use', length: 'length', content_filter: 'stop' };

class OpenAiParser implements StreamParser {
    finished = false;
    private reason: 'stop' | 'tool_use' | 'length' | undefined;
    private inTokens = 0;
    private outTokens = 0;
    private readonly calls = new Map<number, { id: string; name: string; args: string }>();

    private flush(): LlmEvent[] {
        this.finished = true;
        const evs: LlmEvent[] = [...this.calls.entries()].sort((a, b) => a[0] - b[0])
            .map(([, c]) => ({ type: 'tool-call', id: c.id, name: c.name, input: c.args ? toolInput(tryJson(c.args)) : {} }) as LlmEvent);
        evs.push({ type: 'usage', in: this.inTokens, out: this.outTokens }, { type: 'done', reason: this.reason ?? (evs.length ? 'tool_use' : 'stop') });
        return evs;
    }

    onFrame(f: SseFrame): LlmEvent[] {
        if (f.data.trim() === '[DONE]') return this.flush();
        const d = tryJson(f.data) as any;
        if (!d || typeof d !== 'object') return [];
        if (d.error) throw classifyProviderError({ status: 0, ...extractErrorInfo(d) });
        if (d.usage) { this.inTokens = Number(d.usage.prompt_tokens) || 0; this.outTokens = Number(d.usage.completion_tokens) || 0; }
        const ch = d.choices?.[0];
        if (!ch) return [];
        const out: LlmEvent[] = [];
        if (typeof ch.delta?.content === 'string' && ch.delta.content) out.push({ type: 'text-delta', text: ch.delta.content });
        for (const tc of Array.isArray(ch.delta?.tool_calls) ? ch.delta.tool_calls : []) {
            const i = Number.isInteger(tc.index) ? tc.index : 0;
            const cur = this.calls.get(i) ?? { id: '', name: '', args: '' };
            if (tc.id) cur.id = String(tc.id);
            if (tc.function?.name) cur.name += String(tc.function.name);
            if (typeof tc.function?.arguments === 'string') cur.args += tc.function.arguments;
            this.calls.set(i, cur);
        }
        if (ch.finish_reason) this.reason = FINISH[ch.finish_reason] ?? 'stop';
        return out;
    }
    /** `[DONE]` gelmeden kapanirsa ancak bitis nedeni goruldugunde tamam sayilir (usage parcasi sonda gelir). */
    end(): LlmEvent[] { return this.reason ? this.flush() : []; }
}

export class OpenAiProvider implements LlmProvider {
    readonly id = 'openai';
    constructor(private readonly apiKey: string, private readonly model: string, private readonly http: ProviderHttpOptions = {}) { }
    stream(req: LlmStreamRequest): AsyncIterable<LlmEvent> {
        return streamSse({ provider: 'openai', url: `${BASE}/v1/chat/completions`, method: 'POST', headers: headers(this.apiKey), body: openAiBody(this.model, req) }, new OpenAiParser(), req.signal, this.http);
    }
}

/** Salt-okuma dogrulama: `GET /v1/models/{model}` (cikarim YOK). */
export async function verifyOpenAi(apiKey: string, model: string, signal: AbortSignal, http: ProviderHttpOptions = {}): Promise<void> {
    await requestJson({ provider: 'openai', url: `${BASE}/v1/models/${encodeURIComponent(model)}`, method: 'GET', headers: { ...headers(apiKey), accept: 'application/json' } }, signal, http);
}
