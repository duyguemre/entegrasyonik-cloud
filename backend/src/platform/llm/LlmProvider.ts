// ADR-0034 Karar 9 / AGENT_BROKER_PLAN BR-1: LLM saglayici PORTU. Sohbet dongusu (operations/agent) yalniz bu arayuzu bilir;
// Anthropic/OpenAI/Google baglastiricilari (BR-5) ve ScriptedLlmProvider (yalniz yerel/test) bunu gerceklestirir.

export const LLM_ERROR_CODES = ['LLM_KEY_INVALID', 'LLM_QUOTA', 'LLM_RATE_LIMITED', 'LLM_MODEL_UNAVAILABLE', 'LLM_UNAVAILABLE'] as const;
export type LlmErrorCode = typeof LLM_ERROR_CODES[number];

/**
 * Saglayici hata sinifi. Ham saglayici yaniti/anahtar ASLA `message`e girmez (istemciye gidebilir); ayrinti yalniz logdadir.
 * `retryAfterSec` yalniz LLM_RATE_LIMITED icin anlamlidir.
 */
export class LlmError extends Error {
    readonly code: LlmErrorCode;
    readonly retryAfterSec?: number;
    constructor(code: LlmErrorCode, opts: { message?: string; retryAfterSec?: number } = {}) {
        super(opts.message ?? code);
        this.name = 'LlmError';
        this.code = code;
        this.retryAfterSec = opts.retryAfterSec;
        Object.setPrototypeOf(this, LlmError.prototype);
    }
}

export function isLlmError(e: unknown): e is LlmError {
    return e instanceof LlmError;
}

/** Saglayiciya giden mesajlar. `tool` mesaji onceki bir `tool-call`a cevaptir (BR-2). */
export type LlmMessage =
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string; toolCalls?: Array<{ id: string; name: string; input: unknown }> }
    | { role: 'tool'; toolCallId: string; name: string; content: string };

/** Modele sunulan arac (JSON Schema girdisi). BR-1'de liste bostur. */
export interface LlmTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface LlmStreamRequest {
    system: string;
    messages: LlmMessage[];
    tools: LlmTool[];
    maxTokens: number;
    signal: AbortSignal;
}

export type LlmEvent =
    | { type: 'text-delta'; text: string }
    | { type: 'tool-call'; id: string; name: string; input: unknown }
    | { type: 'usage'; in: number; out: number }
    | { type: 'done'; reason: 'stop' | 'tool_use' | 'length' };

export interface LlmProvider {
    /** Kararli kisa ad ('scripted', 'anthropic', ...); log/metrik etiketi. */
    readonly id: string;
    /**
     * Akisli cevap. `signal` iptal edilince akis sessizce biter (hata firlatmaz). Saglayici hatasi `LlmError` ile yukselir.
     * Akis `done` olayiyla biter.
     */
    stream(req: LlmStreamRequest): AsyncIterable<LlmEvent>;
}
