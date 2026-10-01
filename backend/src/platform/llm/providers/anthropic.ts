// ADR-0034 / BR-5: Anthropic Messages API baglastiricisi (duz fetch + SSE). Arac cagirma: tool_use / tool_result.
// Host SABIT (catalog.LLM_HOSTS.anthropic). Anahtar yalniz `x-api-key` basliginda; hicbir log/hata/olaya girmez.
import { type LlmEvent, type LlmMessage, type LlmProvider, type LlmStreamRequest } from '../LlmProvider';
import { LLM_HOSTS } from '../catalog';
import { classifyProviderError, extractErrorInfo } from '../classifyProviderError';
import { requestJson, streamSse, toolInput, tryJson, type ProviderHttpOptions, type SseFrame, type StreamParser } from './http';

const BASE = `https://${LLM_HOSTS.anthropic}`;
const VERSION = '2023-06-01';

const headers = (apiKey: string): Record<string, string> => ({ 'x-api-key': apiKey, 'anthropic-version': VERSION, 'content-type': 'application/json', accept: 'text/event-stream' });

type AnthropicContent = Array<Record<string, unknown>>;
interface AnthropicMessage { role: 'user' | 'assistant'; content: string | AnthropicContent }

/** Port mesajlari -> Anthropic. Ardisik arac sonuclari TEK user mesajinda toplanir (API kurali). */
export function toAnthropicMessages(messages: readonly LlmMessage[]): AnthropicMessage[] {
    const out: AnthropicMessage[] = [];
    for (const m of messages) {
        if (m.role === 'user') out.push({ role: 'user', content: m.content });
        else if (m.role === 'assistant') {
            const blocks: AnthropicContent = [];
            if (m.content) blocks.push({ type: 'text', text: m.content });
            for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: toolInput(c.input) });
            out.push({ role: 'assistant', content: blocks.length ? blocks : m.content });
        } else {
            const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
            const last = out[out.length - 1];
            if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) last.content.push(block);
            else out.push({ role: 'user', content: [block] });
        }
    }
    return out;
}

export function anthropicBody(model: string, req: LlmStreamRequest): string {
    return JSON.stringify({
        model, max_tokens: req.maxTokens, stream: true, system: req.system, messages: toAnthropicMessages(req.messages),
        ...(req.tools.length ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) } : {}),
    });
}

const STOP: Readonly<Record<string, 'stop' | 'tool_use' | 'length'>> = { end_turn: 'stop', stop_sequence: 'stop', tool_use: 'tool_use', max_tokens: 'length' };

class AnthropicParser implements StreamParser {
    finished = false;
    private inTokens = 0;
    private outTokens = 0;
    private stop: 'stop' | 'tool_use' | 'length' = 'stop';
    private readonly blocks = new Map<number, { id: string; name: string; json: string }>();

    onFrame(f: SseFrame): LlmEvent[] {
        const d = tryJson(f.data) as any;
        if (!d || typeof d !== 'object') return [];
        const t: string = f.event ?? d.type;
        switch (t) {
            case 'message_start':
                this.inTokens = Number(d.message?.usage?.input_tokens) || 0;
                this.outTokens = Number(d.message?.usage?.output_tokens) || 0;
                return [];
            case 'content_block_start':
                if (d.content_block?.type === 'tool_use') this.blocks.set(d.index, { id: String(d.content_block.id ?? ''), name: String(d.content_block.name ?? ''), json: '' });
                return [];
            case 'content_block_delta':
                if (d.delta?.type === 'text_delta' && typeof d.delta.text === 'string' && d.delta.text) return [{ type: 'text-delta', text: d.delta.text }];
                if (d.delta?.type === 'input_json_delta') { const b = this.blocks.get(d.index); if (b && typeof d.delta.partial_json === 'string') b.json += d.delta.partial_json; }
                return [];
            case 'content_block_stop': {
                const b = this.blocks.get(d.index);
                if (!b) return [];
                this.blocks.delete(d.index);
                return [{ type: 'tool-call', id: b.id, name: b.name, input: b.json ? toolInput(tryJson(b.json)) : {} }];
            }
            case 'message_delta':
                if (d.delta?.stop_reason) this.stop = STOP[d.delta.stop_reason] ?? 'stop';
                if (d.usage?.output_tokens !== undefined) this.outTokens = Number(d.usage.output_tokens) || this.outTokens;
                return [];
            case 'message_stop':
                this.finished = true;
                return [{ type: 'usage', in: this.inTokens, out: this.outTokens }, { type: 'done', reason: this.stop }];
            case 'error':
                throw classifyProviderError({ status: 0, ...extractErrorInfo(d) });
            default: return []; // ping vb.
        }
    }
    end(): LlmEvent[] { return []; }
}

export class AnthropicProvider implements LlmProvider {
    readonly id = 'anthropic';
    constructor(private readonly apiKey: string, private readonly model: string, private readonly http: ProviderHttpOptions = {}) { }
    stream(req: LlmStreamRequest): AsyncIterable<LlmEvent> {
        return streamSse({ provider: 'anthropic', url: `${BASE}/v1/messages`, method: 'POST', headers: headers(this.apiKey), body: anthropicBody(this.model, req) }, new AnthropicParser(), req.signal, this.http);
    }
}

/** Salt-okuma dogrulama: `GET /v1/models/{model}` (cikarim/uretim cagrisi YOK). Anahtar + model erisimi birlikte sinanir. */
export async function verifyAnthropic(apiKey: string, model: string, signal: AbortSignal, http: ProviderHttpOptions = {}): Promise<void> {
    await requestJson({ provider: 'anthropic', url: `${BASE}/v1/models/${encodeURIComponent(model)}`, method: 'GET', headers: { ...headers(apiKey), accept: 'application/json' } }, signal, http);
}

