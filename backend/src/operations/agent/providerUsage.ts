// ADR-0034 / BR-5: LLM kullanim sayaci (YALNIZ bilgi; kota/kesme/faturalama YOK). Saglayici olayindaki `usage`i yakalayan sarmalayici:
// Redis (yoksa bellek) gunluk sayaclar `agent:usage:{tid}:{yyyymmdd}:{req|in|out}` (40 gun TTL) + metrik `agent_tokens_total{surface,provider,kind}`.
// Sayac yazimi best-effort: hata sohbeti bozmaz. Tenant/kullanici kimligi METRIK etiketine girmez (dusuk kardinalite).
import { logger } from '@platform/core/logger';
import type { LlmEvent, LlmProvider, LlmStreamRequest } from '@platform/llm';
import { dayKeyInZone } from '@utils/timeZone';
import type { ProviderUsage } from './protocol/v1';
import { recordTokens, type AgentSurface } from './agentTelemetry';
import type { AgentKv } from './kv';

const log = logger.child({ module: 'agent.usage' });
export const USAGE_TTL_SEC = 40 * 24 * 3600;

const dayStamp = (d: Date) => dayKeyInZone(d).replace(/-/g, '');
const keyOf = (tid: number, stamp: string, f: 'req' | 'in' | 'out') => `agent:usage:${tid}:${stamp}:${f}`;

export async function addUsage(kv: AgentKv, tid: number, u: { requests?: number; inTokens?: number; outTokens?: number }, now: Date = new Date()): Promise<void> {
    const stamp = dayStamp(now);
    const jobs: Promise<unknown>[] = [];
    if (u.requests) jobs.push(kv.incrBy(keyOf(tid, stamp, 'req'), u.requests, USAGE_TTL_SEC));
    if (u.inTokens) jobs.push(kv.incrBy(keyOf(tid, stamp, 'in'), u.inTokens, USAGE_TTL_SEC));
    if (u.outTokens) jobs.push(kv.incrBy(keyOf(tid, stamp, 'out'), u.outTokens, USAGE_TTL_SEC));
    await Promise.all(jobs);
}

async function dayUsage(kv: AgentKv, tid: number, stamp: string): Promise<ProviderUsage> {
    const [r, i, o] = await Promise.all((['req', 'in', 'out'] as const).map(async (f) => Number(await kv.get(keyOf(tid, stamp, f))) || 0));
    return { requests: r, inputTokens: i, outputTokens: o };
}

/** Bugun + icinde bulunulan ay (yerel gun anahtarlariyla, ayin 1'inden bugune). */
export async function readUsage(kv: AgentKv, tid: number, now: Date = new Date()): Promise<{ today: ProviderUsage; month: ProviderUsage }> {
    const today = dayStamp(now);
    const ym = today.slice(0, 6);
    const day = Number(today.slice(6));
    const stamps = Array.from({ length: day }, (_, i) => `${ym}${String(i + 1).padStart(2, '0')}`);
    const days = await Promise.all(stamps.map((s) => dayUsage(kv, tid, s)));
    const month = days.reduce((a, d) => ({ requests: a.requests + d.requests, inputTokens: a.inputTokens + d.inputTokens, outputTokens: a.outputTokens + d.outputTokens }),
        { requests: 0, inputTokens: 0, outputTokens: 0 });
    return { today: days[days.length - 1], month };
}

/** `usage` olaylarini sayar; olaylari AYNEN iletir. Her tur-gidis-donusu bir istek sayilir (ilk `usage`/akis basina). */
export function meterProvider(inner: LlmProvider, opts: { tid: number; surface: AgentSurface; kv: () => AgentKv; providerLabel?: string; now?: () => Date }): LlmProvider {
    const label = opts.providerLabel ?? inner.id;
    return {
        id: inner.id,
        async *stream(req: LlmStreamRequest): AsyncIterable<LlmEvent> {
            for await (const ev of inner.stream(req)) {
                if (ev.type === 'usage') {
                    recordTokens(opts.surface, label, 'in', ev.in);
                    recordTokens(opts.surface, label, 'out', ev.out);
                    addUsage(opts.kv(), opts.tid, { requests: 1, inTokens: ev.in, outTokens: ev.out }, opts.now?.()).catch((e) => log.warn({ err: (e as Error)?.message }, 'Kullanim sayaci yazilamadi'));
                }
                yield ev;
            }
        },
    };
}
