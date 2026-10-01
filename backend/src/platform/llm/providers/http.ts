// ADR-0034 / BR-5: saglayici baglastiricilarinin ORTAK ag katmani (duz fetch, SDK YOK).
// - Hedef yalniz kodda sabit host'lar (catalog.LLM_HOSTS); https, userinfo/port yok -> tenant adres yazamaz (SSRF).
// - Zaman asimlari: baglanti (yanit basliklari), bosta (parcalar arasi; ilk bayt dahil), toplam. Iptal (AbortSignal) SESSIZ biter.
// - Hata siniflari: HTTP durumu + saglayici hata tipi -> LlmError (classifyProviderError). Ham govde/anahtar loglanmaz, hataya girmez.
// - SSE ayristirma: \r\n/\n, cok satirli data, yorum satirlari.
import { logger } from '../../core/logger';
import { LlmError, type LlmEvent } from '../LlmProvider';
import { LLM_HOSTS, type LlmProviderId } from '../catalog';
import { classifyProviderError, extractErrorInfo, networkError } from '../classifyProviderError';

const log = logger.child({ module: 'llm.provider' });

export interface ProviderHttpOptions {
    /** Test: sahte fetch. Varsayilan: `globalThis.fetch` (her cagrida okunur; egress guard'in sarmalayicisi gecerli olur). */
    fetch?: typeof fetch;
    connectTimeoutMs?: number;
    idleTimeoutMs?: number;
    totalTimeoutMs?: number;
    /** Log iliskilendirme kimligi (yalniz log; anahtar/icerik degil). */
    corrId?: string;
}

export const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
export const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
/** Broker tur zaman asimi 60 sn; saglayici toplam suresi ondan kisa olmali ki hata sinifi (LLM_UNAVAILABLE) gelsin. */
export const DEFAULT_TOTAL_TIMEOUT_MS = 55_000;
const ERROR_BODY_MAX = 8 * 1024;

/** URL tam olarak bu saglayicinin SABIT host'una https ile gidiyor mu? Degilse istek ATILMAZ. */
export function assertFixedLlmUrl(provider: LlmProviderId, url: string): void {
    let u: URL;
    try { u = new URL(url); } catch { throw networkError(); }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hostname.toLowerCase() !== LLM_HOSTS[provider]) {
        throw networkError();
    }
}

/** Zaman asimi + iptal koordinatoru. */
class Watch {
    readonly ac = new AbortController();
    timedOut = false;
    private idle: ReturnType<typeof setTimeout> | undefined;
    private total: ReturnType<typeof setTimeout> | undefined;
    private readonly onExternal = () => this.ac.abort();
    constructor(private readonly external: AbortSignal, totalMs: number) {
        if (external.aborted) this.ac.abort();
        else external.addEventListener('abort', this.onExternal, { once: true });
        this.total = setTimeout(() => this.fire(), totalMs);
        this.total.unref?.();
    }
    private fire() { this.timedOut = true; this.ac.abort(); }
    arm(ms: number) { if (this.idle) clearTimeout(this.idle); this.idle = setTimeout(() => this.fire(), ms); this.idle.unref?.(); }
    dispose() {
        if (this.idle) clearTimeout(this.idle);
        if (this.total) clearTimeout(this.total);
        this.external.removeEventListener('abort', this.onExternal);
    }
    get clientAborted() { return this.external.aborted && !this.timedOut; }
}

export interface SseFrame { event?: string; data: string }

function frameOf(block: string): SseFrame | undefined {
    let event: string | undefined;
    const data: string[] = [];
    for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const i = line.indexOf(':');
        const field = i < 0 ? line : line.slice(0, i);
        let value = i < 0 ? '' : line.slice(i + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'event') event = value; else if (field === 'data') data.push(value);
    }
    return data.length ? { event, data: data.join('\n') } : undefined;
}

/** Bayt akisindan SSE cercevelerini uretir. */
export async function* parseSse(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<SseFrame> {
    const dec = new TextDecoder();
    let buf = '';
    for await (const c of chunks) {
        buf += dec.decode(c, { stream: true }).replace(/\r\n?/g, '\n');
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
            const f = frameOf(buf.slice(0, i));
            buf = buf.slice(i + 2);
            if (f) yield f;
        }
    }
    buf += dec.decode();
    if (buf.trim()) { const f = frameOf(buf.replace(/\r\n?/g, '\n')); if (f) yield f; }
}

async function* bodyChunks(body: ReadableStream<Uint8Array>, signal: AbortSignal, onChunk: () => void): AsyncGenerator<Uint8Array> {
    const reader = body.getReader();
    // Iptal/zaman asimi okumayi KESER (bazi akislar abort'a kendiliginden tepki vermez): okuma ile iptal yarisir.
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error('aborted'));
        if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    });
    aborted.catch(() => undefined);
    try {
        for (;;) {
            const { done, value } = await Promise.race([reader.read(), aborted]);
            if (done) return;
            onChunk();
            if (value) yield value;
        }
    } finally {
        if (onAbort) signal.removeEventListener('abort', onAbort);
        reader.cancel().catch(() => undefined);
    }
}

export interface FetchCall { provider: LlmProviderId; url: string; method: 'GET' | 'POST'; headers: Record<string, string>; body?: string }

async function toError(provider: LlmProviderId, res: Response, opts: ProviderHttpOptions): Promise<LlmError> {
    let info = {};
    try {
        const text = (await res.text()).slice(0, ERROR_BODY_MAX);
        info = extractErrorInfo(JSON.parse(text));
    } catch { /* govde yok/JSON degil: yalniz durum kodu */ }
    const err = classifyProviderError({ status: res.status, retryAfter: res.headers.get('retry-after'), ...info });
    log.warn({ provider, status: res.status, class: err.code, corrId: opts.corrId }, 'Saglayici hatasi'); // ham govde/anahtar YOK
    return err;
}

async function doFetch(call: FetchCall, w: Watch, opts: ProviderHttpOptions): Promise<Response | undefined> {
    w.arm(opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS);
    try {
        return await (opts.fetch ?? globalThis.fetch)(call.url, { method: call.method, headers: call.headers, body: call.body, signal: w.ac.signal, redirect: 'error' });
    } catch {
        if (w.clientAborted) return undefined;
        log.warn({ provider: call.provider, class: 'LLM_UNAVAILABLE', timedOut: w.timedOut, corrId: opts.corrId }, 'Saglayici baglanti hatasi');
        throw networkError();
    }
}

/** Tek istek (akissiz; dogrulama cagrisi). Hata -> LlmError. Iptal edilirse LLM_UNAVAILABLE (cagiran zaten vazgecti). */
export async function requestJson(call: FetchCall, signal: AbortSignal, opts: ProviderHttpOptions = {}): Promise<unknown> {
    assertFixedLlmUrl(call.provider, call.url);
    const w = new Watch(signal, opts.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS);
    try {
        const res = await doFetch(call, w, opts);
        if (!res) throw networkError();
        if (!res.ok) throw await toError(call.provider, res, opts);
        try { return await res.json(); } catch { return undefined; }
    } finally { w.dispose(); }
}

/** Akis cozumleyici: SSE cercevesi -> port olaylari. `finished`: terminal olay (`done`) yayinlandi. */
export interface StreamParser {
    onFrame(f: SseFrame): LlmEvent[];
    /** Akis terminal isaret olmadan bittiginde (ornegin Google: isaret yok) kalan olaylari verir. */
    end(): LlmEvent[];
    readonly finished: boolean;
}

/** POST + SSE akisi. Iptal: sessiz biter. Zaman asimi/ag/kesik akis: LLM_UNAVAILABLE. Saglayici hatasi: siniflanmis LlmError. */
export async function* streamSse(call: FetchCall, parser: StreamParser, signal: AbortSignal, opts: ProviderHttpOptions = {}): AsyncGenerator<LlmEvent> {
    assertFixedLlmUrl(call.provider, call.url);
    const w = new Watch(signal, opts.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS);
    const idleMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    try {
        const res = await doFetch(call, w, opts);
        if (!res) return;
        if (!res.ok) { if (w.clientAborted) return; throw await toError(call.provider, res, opts); }
        if (!res.body) throw networkError();
        w.arm(idleMs); // ilk bayt + bosta suresi
        try {
            for await (const frame of parseSse(bodyChunks(res.body, w.ac.signal, () => w.arm(idleMs)))) {
                for (const ev of parser.onFrame(frame)) yield ev;
                if (parser.finished) break;
            }
            if (!parser.finished) for (const ev of parser.end()) yield ev;
        } catch (e) {
            if (w.clientAborted) return;
            if (e instanceof LlmError) throw e;
            log.warn({ provider: call.provider, class: 'LLM_UNAVAILABLE', timedOut: w.timedOut, corrId: opts.corrId }, 'Saglayici akis hatasi');
            throw networkError();
        }
        if (w.clientAborted) return;
        if (!parser.finished) {
            log.warn({ provider: call.provider, class: 'LLM_UNAVAILABLE', corrId: opts.corrId }, 'Saglayici akisi tamamlanmadan kapandi');
            throw networkError();
        }
    } finally { w.dispose(); }
}

/** JSON ayristir; bozuksa undefined. */
export function tryJson(s: string): unknown { try { return JSON.parse(s); } catch { return undefined; } }

/** Arac cagrisi girdisi: nesne degilse `{}` (arac katmani zod ile dogrular ve reddeder). */
export function toolInput(v: unknown): unknown { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
