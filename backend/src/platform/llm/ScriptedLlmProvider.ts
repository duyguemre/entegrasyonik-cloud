// ADR-0034 Karar 9 / BR-1: senaryolu (scripted) sahte saglayici -- YALNIZ yerel/test. Uretimde (APP_ENV/NODE_ENV=production)
// olusturulamaz. Kural tablosu: kullanici metni (Turkce kucuk harf) + desen -> adim listesi. Senaryo adlari
// CHAT_UI_CONTRACT §6 ile ayni (onyuz mock'u ile ayni davranis). Sunucu/taşıyıcı düzeyi senaryolar (denied, live-readonly, rate,
// interrupted, unavailable, setup-*, consent-*) LLM'in isi degildir; broker/HTTP katmaninda uretilir.
import { config } from '@config';
import { LlmError, type LlmEvent, type LlmMessage, type LlmProvider, type LlmStreamRequest } from './LlmProvider';

export type ScriptStep =
    | LlmEvent
    | { type: 'delay'; ms: number }
    | { type: 'fail'; error: LlmError };

export interface ScriptRule {
    id: string;
    /** Kucuk harfli (tr) son kullanici metninde gecen ifadelerden biri. */
    triggers: string[];
    /** Kural yalniz bu arac modele sunulduysa gecerlidir (model sunulmayan araci cagiramaz). */
    requiresTool?: string;
    steps: ScriptStep[];
    /** Son mesaj bir arac sonucuysa (`role:'tool'`) bu adimlar calisir. */
    afterTool?: ScriptStep[];
}

export interface ScriptedOptions {
    rules?: ScriptRule[];
    /** Test: bekleme (delay adimi) yerine cagrilir. Varsayilan: gercek bekleme (iptal duyarli). */
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Uretimde reddedilir (savunma katmani; `AGENT_LLM_SCRIPTED` ayrica env dogrulamasinda reddedilir). */
export function assertScriptedAllowed(): void {
    if (config.isProduction || config.nodeEnv === 'production') {
        throw new Error('ScriptedLlmProvider uretimde kullanilamaz (yalniz yerel/test).');
    }
}

const text = (t: string): ScriptStep => ({ type: 'text-delta', text: t });
const done = (reason: 'stop' | 'tool_use' = 'stop'): ScriptStep => ({ type: 'done', reason });
const usage = (i: number, o: number): ScriptStep => ({ type: 'usage', in: i, out: o });

function longText(): string[] {
    const para = 'Bu, uzun akis senaryosu icin uretilmis ornek bir paragraftir; satis ozeti, stok durumu ve siparis akisi hakkinda sentetik bilgi icerir. ';
    const all = (para.repeat(20)).slice(0, 2500);
    const chunks: string[] = [];
    for (let i = 0; i < all.length; i += 21) chunks.push(all.slice(i, i + 21)); // ~120 delta
    return chunks;
}

export const DEFAULT_SCRIPT_RULES: ScriptRule[] = [
    { id: 'llm-key-invalid', triggers: ['anahtar'], steps: [{ type: 'fail', error: new LlmError('LLM_KEY_INVALID') }] },
    { id: 'llm-rate', triggers: ['yoğun'], steps: [{ type: 'fail', error: new LlmError('LLM_RATE_LIMITED', { retryAfterSec: 20 }) }] },
    {
        id: 'approve-orders', triggers: ['onayla'], requiresTool: 'orders_approve',
        steps: [text('Siparişleri onay için hazırlıyorum.'), { type: 'tool-call', id: 'call_approve_1', name: 'orders_approve', input: {} }, done('tool_use')],
        afterTool: [text('İşlem için onayınız gerekiyor.'), usage(40, 12), done()],
    },
    {
        id: 'orders-table', triggers: ['onay bekleyen', 'sipariş'], requiresTool: 'orders_list',
        steps: [{ type: 'tool-call', id: 'call_orders_1', name: 'orders_list', input: {} }, done('tool_use')],
        afterTool: [text('Onay bekleyen siparişler yukarıda listelendi.'), usage(60, 14), done()],
    },
    {
        id: 'sales-kpi', triggers: ['satış', 'ciro'], requiresTool: 'reports_sales_summary',
        steps: [{ type: 'tool-call', id: 'call_sales_1', name: 'reports_sales_summary', input: {} }, done('tool_use')],
        afterTool: [text('Satış özeti yukarıda.'), usage(50, 8), done()],
    },
    {
        id: 'entity', triggers: ['ürün', 'stok'], requiresTool: 'products_search',
        steps: [{ type: 'tool-call', id: 'call_entity_1', name: 'products_search', input: {} }, done('tool_use')],
        afterTool: [text('İstediğiniz ürün kaydı yukarıda.'), usage(50, 9), done()],
    },
    {
        id: 'long-stream', triggers: ['rapor', 'uzun'],
        steps: [...longText().map((c): ScriptStep => text(c)).flatMap((s): ScriptStep[] => [s, { type: 'delay', ms: 40 }]), usage(30, 700), done()],
    },
];

export const FALLBACK_TEXT = 'Bu demo şu soruları yanıtlar: "onay bekleyen siparişler", "satış özeti", "ürün / stok", "uzun rapor".';

const sleepAbortable = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); resolve(); };
    signal.addEventListener('abort', onAbort, { once: true });
});

function lastUserText(messages: LlmMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user') return m.content;
    }
    return '';
}

export class ScriptedLlmProvider implements LlmProvider {
    readonly id = 'scripted';
    private readonly rules: ScriptRule[];
    private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;

    constructor(opts: ScriptedOptions = {}) {
        assertScriptedAllowed();
        this.rules = opts.rules ?? DEFAULT_SCRIPT_RULES;
        this.sleep = opts.sleep ?? sleepAbortable;
    }

    /** Eslesen kural (yoksa undefined). */
    match(req: Pick<LlmStreamRequest, 'messages' | 'tools'>): ScriptRule | undefined {
        const q = lastUserText(req.messages).toLocaleLowerCase('tr');
        const offered = new Set(req.tools.map((t) => t.name));
        return this.rules.find((r) => (!r.requiresTool || offered.has(r.requiresTool)) && r.triggers.some((t) => q.includes(t)));
    }

    async *stream(req: LlmStreamRequest): AsyncIterable<LlmEvent> {
        const last = req.messages[req.messages.length - 1];
        const rule = this.match(req);
        let steps: ScriptStep[];
        if (last?.role === 'tool') {
            steps = rule?.afterTool ?? [text('Sonuç yukarıda.'), done()];
        } else {
            steps = rule?.steps ?? [text(FALLBACK_TEXT), usage(20, 25), done()];
        }
        for (const step of steps) {
            if (req.signal.aborted) return;
            if (step.type === 'delay') { await this.sleep(step.ms, req.signal); continue; }
            if (step.type === 'fail') throw step.error;
            yield step;
        }
    }
}
