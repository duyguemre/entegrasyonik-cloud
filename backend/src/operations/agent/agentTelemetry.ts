// ADR-0034 / AGENT_BROKER_PLAN BR-3: sohbet araci DENETIM + METRIK tek yeri.
// Denetim (AuditLogs, yuzey `chat`/`backoffice_chat`; MCP-3 `mcp`): her arac cagrisi (okuma dahil), her onay/ret, yazma yurutmesi. PII YOK:
// sohbet metni yazilmaz; parametre ozeti yalniz ALAN ADLARI (+ dizi uzunlugu), DEGER yok. Yazim best-effort (AuditLogger asla fırlatmaz).
// Metrik (ADR-0017 MetricsRegistry): dusuk kardinalite -- `tenantId`/`userId` etiketi YOK; etiketler sabit kume (yuzey, sonuc, arac<=30, sinif).
import { AuditLogger, type AuditSurface } from '@services/audit/AuditLogger';
import { metricsRegistry } from '@platform/runtime/metrics';
import { getRequestId } from '@platform/core/context';
import type { AgentCtx } from './types';

export type AgentSurface = Extract<AuditSurface, 'chat' | 'backoffice_chat' | 'mcp'>;
/** `approval_required`: yazma araci cagrildi, yurutme YOK, bant disi onay bekleniyor (MCP-4; denetimde `result:ok`). */
export type AgentOutcome = 'ok' | 'error' | 'denied' | 'rate_limited' | 'expired' | 'approval_required';

export const surfaceOf = (ctx: Pick<AgentCtx, 'surface'>): AgentSurface => ctx.surface ?? 'chat';

const DENIED = new Set(['FORBIDDEN', 'LIVE_READONLY', 'MAINTENANCE', 'IMPERSONATION_FORBIDDEN', 'CAPABILITY_DISABLED']);
/** AppError kodu -> denetim/metrik sonucu (sabit kume). */
export function outcomeOfCode(code: string | undefined): AgentOutcome {
    if (!code) return 'error';
    if (DENIED.has(code)) return 'denied';
    if (code === 'RATE_LIMITED' || code === 'QUOTA_EXCEEDED') return 'rate_limited';
    if (code === 'CONFIRM_EXPIRED') return 'expired';
    return 'error';
}

/** Redakte parametre ozeti: yalniz anahtar adlari (dizi ise `ad[uzunluk]`); deger ASLA. En cok 8 alan. */
export function summarizeParams(input: unknown): string {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
    return Object.entries(input as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .slice(0, 8)
        .map(([k, v]) => `${k.replace(/[^A-Za-z0-9_]/g, '').slice(0, 24)}${Array.isArray(v) ? `[${v.length}]` : ''}`)
        .join(',')
        .slice(0, 120);
}

export interface AgentAuditInput {
    /** `agent.tool_call` | `agent.confirm` | `agent.write`; `mcp.tool_call` (MCP-3: her `tools/call`, okuma dahil); MCP-4: `mcp.approval` (web oturumunda onay/ret karari) + `mcp.write` (onayli yurutme sonucu) -- hepsi AYNI `pendingActionId` ile. */
    event: 'agent.tool_call' | 'agent.confirm' | 'agent.write' | 'mcp.tool_call' | 'mcp.approval' | 'mcp.write';
    outcome: AgentOutcome;
    capabilityId?: string;
    version?: string;
    turnId?: string;
    pendingActionId?: string;
    decision?: 'approve' | 'reject';
    /** Giris nesnesi: yalniz alan adlari ozetlenir. */
    params?: unknown;
    /** `proposed` = yazma araci icin onay karti uretildi (yurutme yok). */
    stage?: 'proposed' | 'executed';
    /** Hata kodu (bilinen, sabit kume); mesaj yazilmaz. */
    code?: string;
    /** MCP: OAuth istemci kimligi ve baglanti (aile) kimligi (opak, sir degil). */
    clientId?: string;
    fam?: string;
}

export function auditAgent(ctx: Pick<AgentCtx, 'tid' | 'userId' | 'surface' | 'session'>, a: AgentAuditInput): Promise<void> {
    const principal = ctx.session?.invoke.principal as { imp?: boolean } | undefined;
    const imp = principal?.imp === true;
    const corrId = getRequestId();
    const meta: Record<string, string | number | boolean> = { outcome: a.outcome };
    if (a.capabilityId) meta.capabilityId = a.capabilityId;
    if (a.version) meta.version = a.version;
    if (corrId) meta.corrId = corrId.slice(0, 64);
    if (a.turnId) meta.turnId = a.turnId;
    if (a.pendingActionId) meta.pendingActionId = a.pendingActionId.slice(0, 64);
    if (a.decision) meta.decision = a.decision;
    if (a.stage) meta.stage = a.stage;
    if (a.code) meta.code = a.code.slice(0, 40);
    if (a.clientId) meta.clientId = a.clientId.slice(0, 64);
    if (a.fam) meta.fam = a.fam.slice(0, 64);
    const params = summarizeParams(a.params);
    if (params) meta.params = params;
    return AuditLogger.log({
        event: a.event,
        result: a.outcome === 'ok' || a.outcome === 'approval_required' ? 'ok' : a.outcome === 'error' ? 'error' : 'fail',
        sub: ctx.userId, tid: ctx.tid, ip: ctx.session?.invoke.ip, surface: surfaceOf(ctx),
        actorType: imp ? 'impersonator' : 'user', ...(imp ? { imp: true, onBehalfOf: ctx.tid } : {}),
        reqId: corrId, meta,
    });
}

// ---- Metrikler -----------------------------------------------------------------------------------------------------------
export type TurnOutcome = 'completed' | 'awaiting-confirm' | 'error' | 'aborted' | 'timeout';

export function recordTurn(surface: AgentSurface, outcome: TurnOutcome, durationMs: number): void {
    metricsRegistry.incCounter('agent_turns_total', { surface, outcome }, 1);
    metricsRegistry.observeHistogram('agent_turn_ms', { surface }, durationMs);
}
export function recordToolCall(surface: AgentSurface, capabilityId: string, outcome: AgentOutcome): void {
    metricsRegistry.incCounter('agent_tool_calls_total', { surface, capabilityId, outcome }, 1);
}
/** `decision`: onay/ret; `outcome`: ok|error|denied|expired|rate_limited; `waitedMs`: kartin gosterilmesinden karara sure. */
export function recordConfirm(decision: 'approve' | 'reject', outcome: AgentOutcome, waitedMs?: number): void {
    metricsRegistry.incCounter('agent_confirm_total', { decision, outcome }, 1);
    if (waitedMs !== undefined && Number.isFinite(waitedMs)) metricsRegistry.observeHistogram('agent_confirm_wait_ms', { decision }, waitedMs);
}
/** `errorClass`: LlmErrorCode (LLM_KEY_INVALID...) ya da TIMEOUT; sabit kume. */
export function recordLlmError(errorClass: string): void {
    metricsRegistry.incCounter('agent_llm_errors_total', { class: errorClass.slice(0, 32) }, 1);
}
/** BR-5: saglayici token kullanimi (YALNIZ bilgi; kota/kesme yok). `provider` sabit kume (anthropic|openai|google|scripted), `kind` in|out. */
export function recordTokens(surface: AgentSurface, provider: string, kind: 'in' | 'out', n: number): void {
    if (Number.isFinite(n) && n > 0) metricsRegistry.incCounter('agent_tokens_total', { surface, provider: provider.slice(0, 16), kind }, n);
}
