// ADR-0035 Karar 5 / MCP-4: MCP YAZMA ARACLARI icin BANT DISI ONAY. Yazma araci cagrilinca YURUTULMEZ: `PendingAction` (surface 'mcp', 10 dk) yazilir, model
// uygulamamizdaki onay baglantisini + okunur ozeti alir. Onay YALNIZ kullanicinin web oturumuyla (`/api/mcp/approvals/:id`) verilir; MCP istemcisinin hicbir
// yaniti (elicitation kabulu dahil) onay SAYILMAZ -- bu dosyayi MCP adaptoru (`src/mcp/**`) cagirirken yalniz `propose` kullanir; `decide` yalniz cerezli rotada.
// Depo/anahtar uzayi sohbetle ORTAKTIR (`PendingActions` -> `McpPendingActions`); gunluk eylem kotasi sohbetle ayni sayac (`consumeActionQuota`, K46).
// Idempotency: eslesme `(userId, fam, capId, inputHash)` -- ayni cagri tekrarlanirsa AYNI kayit/sonuc doner, ikinci yurutme olmaz; yurutme `pendingActionId`
// idempotency anahtariyla `invokeCapability`ya gider ve tek yurutme `agent:pa:lock:{id}` (SET NX) ile korunur. Tenant verisi/PII onizlemeye yalniz sunucu
// tarafli ozet olarak girer (`CONFIRM_SPECS`); model/istemci metni onizlemeye girmez.
import { findExposed } from '../../capabilities/invoke';
import { AppError } from '@platform/core/errors';
import { logger } from '@platform/core/logger';
import { auditAgent, outcomeOfCode, type AgentOutcome } from '../agent/agentTelemetry';
import { actionQuotaCost, consumeActionQuota, peekActionQuota, quotaExceededError, resolveAgentEntitlement, type AgentEntitlement } from '../agent/agentEntitlement';
import type { AgentKv } from '../agent/kv';
import {
    McpPendingActions, MCP_RESULT_TTL_SEC, hashInput, isValidPendingId,
    type ActionResult, type ApprovalPreview, type McpOutcome, type PendingAction,
} from '../agent/PendingActions';
import { CONFIRM_SPECS } from '../agent/present/specs';
import type { AgentTool, ToolRuntime } from '../agent/tools';
import type { AgentCtx } from '../agent/types';
import type { McpAccess } from './mcpSettings';

const log = logger.child({ module: 'mcp.approvals' });

export type ApprovalStatus = 'pending' | 'executed' | 'failed' | 'unknown_outcome' | 'rejected' | 'expired';

/** MCP_UI_CONTRACT S2: `ApprovalView` (onay sayfasi + bekleyen liste). */
export interface ApprovalView {
    id: string;
    status: ApprovalStatus;
    client: { name: string };
    capability: { id: string; title: string };
    external: boolean;
    preview: ApprovalPreview;
    expiresAt: string;
    result?: { summary?: string; code?: string; openIn?: { screen: string; params?: Record<string, string> } };
}

export type ProposeOutcome =
    | { kind: 'approval_required'; id: string; approvalUrl: string; expiresAt: string; preview: ApprovalPreview; created: boolean }
    | { kind: 'executed'; id: string; summary?: string; openIn?: { screen: string; params?: Record<string, string> } }
    | { kind: 'rejected'; id: string }
    | { kind: 'unknown_outcome'; id: string }
    | { kind: 'entity_not_found'; missing: string[] };

export interface McpProposer {
    /** Cagiran baglanti (token'dan): tenant/kullanici/istemci/aile + arac baglami (`surface:'mcp'`). */
    ctx: AgentCtx;
    clientId: string;
    fam: string;
}

export interface McpApprovalsDeps {
    kv: () => AgentKv;
    tools: ToolRuntime;
    now?: () => number;
    entitlement?: (tid: number) => Promise<AgentEntitlement>;
    isMaintenance: () => boolean;
    /** Bagli uygulama (aile) hala etkin mi (FamilyGate). Hata firlatirsa kapali-guvenli. */
    familyActive: (fam: string) => Promise<boolean>;
    access: (tid: number) => Promise<McpAccess>;
    /** DCR'dan gelen goruntu adi; bulunamazsa kisa genel ad. */
    clientName: (clientId: string) => Promise<string | undefined>;
    /** Uygulama ici bildirim (best-effort; hata yutulur). */
    notify: (e: { tid: number; userId: string; approvalId: string; clientName: string; title: string }) => Promise<void>;
    /** Onay sayfasi taban adresi (`PUBLIC_APP_URL`). */
    appOrigin: () => string;
}

const MAX_LINES = 20;
const UNKNOWN_OUTCOME_CODES = new Set(['INTERNAL', 'UNKNOWN_OUTCOME', 'IDEMPOTENCY_IN_PROGRESS']);
/** Duz metin: kontrol karakterleri ve `<`/`>` bosluga, bosluklar tek bosluga; ust sinir. */
const plain = (v: unknown, max: number): string => Array.from(String(v ?? ''), (ch) => { const c = ch.charCodeAt(0); return c < 32 || c === 127 || ch === '<' || ch === '>' ? ' ' : ch; }).join('').replace(/\s+/g, ' ').trim().slice(0, max);

/** Sunucu tarafli on izleme: yetenek ozet metni + degisiklikler + etkilenen kayit ornekleri (model/istemci metni YOK). */
export function buildPreview(tool: Pick<AgentTool, 'capId' | 'title'>, input: unknown, serverChanges?: Array<{ label: string; from?: string; to: string }>): ApprovalPreview {
    const spec = CONFIRM_SPECS[tool.capId];
    const title = plain(tool.title.tr, 120);
    if (!spec) return { title, lines: [plain('Bu işlem onayınızı bekliyor.', 200)], confirmLabel: title };
    const lines: string[] = [plain(spec.summary(input, 'tr'), 200)];
    for (const c of serverChanges ?? spec.changes?.(input, 'tr') ?? []) lines.push(plain(`${c.label}: ${c.from ? `${c.from} → ` : ''}${c.to}`, 200));
    const aff = spec.affected(input);
    if (aff.sample.length) lines.push(plain(`Etkilenen kayıtlar: ${aff.sample.map((s) => s.label).join(', ')}${aff.count > aff.sample.length ? ` ve ${aff.count - aff.sample.length} diğeri` : ''}`, 200));
    return { title, lines: lines.slice(0, MAX_LINES), ...(aff.count > 0 ? { count: aff.count } : {}), confirmLabel: plain(spec.confirmLabel?.(input, 'tr') ?? title, 80) };
}

export class McpApprovals {
    private readonly now: () => number;
    constructor(private readonly d: McpApprovalsDeps) { this.now = d.now ?? Date.now; }

    private store(): McpPendingActions { return new McpPendingActions(this.d.kv(), this.now); }
    private url(id: string): string { return `${this.d.appOrigin().replace(/\/+$/, '')}/approve/${id}`; }

    // ---------------------------------------------------------------------------------------------------------------
    // Model tarafi: yazma araci cagrisi -> onay kaydi (YURUTME YOK)
    // ---------------------------------------------------------------------------------------------------------------
    async propose(p: McpProposer, tool: AgentTool, input: unknown): Promise<ProposeOutcome> {
        const store = this.store();
        const hash = hashInput(input);
        const again = await this.existing(store, p, tool.capId, hash);
        if (again) return again;

        // BR-3: model kaynakli kimlikler bu tenant'ta var mi (kart/kayit yalniz gercek kayitlar icin).
        const problem = await this.d.tools.verifyRefs?.(p.ctx, tool.capId, input);
        if (problem) return { kind: 'entity_not_found', missing: problem.missing };

        // K46: kota doluysa kayit acmadan anlasilir hata (kota ONAYDA dusulur; burada yalniz bakilir).
        const ent = await (this.d.entitlement ?? resolveAgentEntitlement)(p.ctx.tid);
        const q = await peekActionQuota(this.d.kv(), p.ctx.tid, ent, new Date(this.now()));
        if (!q.allowed) throw quotaExceededError(ent);

        const clientName = plain(await this.d.clientName(p.clientId).catch(() => undefined) ?? 'Yapay zekâ uygulaması', 60) || 'Yapay zekâ uygulaması';
        const serverChanges = await this.d.tools.previewChanges?.(p.ctx, tool.capId, input).catch(() => undefined);
        const created = await store.createMcp({
            userId: p.ctx.userId, tid: p.ctx.tid, capId: tool.capId, version: tool.version, input, confirmMode: tool.confirm === 'typed' ? 'typed' : 'confirm',
            mcp: { clientId: p.clientId, clientName, fam: p.fam, preview: buildPreview(tool, input, serverChanges) },
        });
        if (!created.created || !created.pa) {
            // Es zamanli ayni cagri kazandi: onun kaydi.
            const other = await this.existing(store, p, tool.capId, hash);
            if (other) return other;
            throw AppError.of('CONFLICT');
        }
        void this.d.notify({ tid: p.ctx.tid, userId: p.ctx.userId, approvalId: created.id, clientName, title: tool.title.tr.slice(0, 120) })
            .catch((e) => log.warn({ err: e }, 'MCP onay bildirimi yazilamadi'));
        return this.pendingOutcome(created.pa, true);
    }

    private pendingOutcome(pa: PendingAction, created: boolean): ProposeOutcome {
        return { kind: 'approval_required', id: pa.id, approvalUrl: this.url(pa.id), expiresAt: new Date(pa.expiresAt).toISOString(), preview: pa.mcp!.preview, created };
    }

    /** Ayni `(kullanici, baglanti, yetenek, girdi)` icin mevcut kayit/sonuc: pending -> ayni baglanti; sonuc -> saklanan; suresi dolmus/failed -> yok (yeni kayit). */
    private async existing(store: McpPendingActions, p: McpProposer, capId: string, hash: string): Promise<ProposeOutcome | null> {
        const id = await store.findMcpId(p.ctx.userId, p.fam, capId, hash);
        if (!id) return null;
        const [pa, res] = await Promise.all([store.peek(id), store.loadResult(id)]);
        if (!pa || pa.surface !== 'mcp' || pa.userId !== p.ctx.userId || pa.tid !== p.ctx.tid) { await store.dropDedupe(p.ctx.userId, p.fam, capId, hash); return null; }
        if (res?.mcp) {
            switch (res.mcp.status) {
                case 'executed': return { kind: 'executed', id, summary: res.mcp.summary, openIn: res.mcp.openIn };
                case 'rejected': return { kind: 'rejected', id };
                case 'unknown_outcome': return { kind: 'unknown_outcome', id };
                default: await store.dropDedupe(p.ctx.userId, p.fam, capId, hash); return null; // failed: yeni onay istenebilir
            }
        }
        if (this.now() > pa.expiresAt) { await store.dropDedupe(p.ctx.userId, p.fam, capId, hash); return null; }
        return this.pendingOutcome(pa, false); // bekliyor (ya da yurutuluyor): ayni baglanti, yeni kayit yok
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Kullanici tarafi (cerezli web oturumu): gorunum / liste / karar
    // ---------------------------------------------------------------------------------------------------------------
    private viewOf(pa: PendingAction, res: ActionResult | null): ApprovalView {
        const m = pa.mcp!;
        const cap = findExposed(pa.capId);
        let status: ApprovalStatus = 'pending';
        let result: ApprovalView['result'];
        if (res?.mcp) {
            status = res.mcp.status;
            result = { ...(res.mcp.summary ? { summary: res.mcp.summary } : {}), ...(res.mcp.code ? { code: res.mcp.code } : {}), ...(res.mcp.openIn ? { openIn: res.mcp.openIn } : {}) };
        } else if (this.now() > pa.expiresAt) status = 'expired';
        return {
            id: pa.id, status, client: { name: m.clientName }, capability: { id: pa.capId, title: cap?.summary.tr ?? pa.capId },
            external: cap?.external ?? true, preview: m.preview, expiresAt: new Date(pa.expiresAt).toISOString(), ...(result ? { result } : {}),
        };
    }

    /** Yalniz sahibi (ayni kullanici + ayni tenant) gorur; digerleri 404 (varlik sizdirilmaz). */
    private async load(ctx: AgentCtx, id: string): Promise<{ pa: PendingAction; res: ActionResult | null }> {
        const notFound = () => AppError.of('NOT_FOUND');
        if (!isValidPendingId(id)) throw notFound();
        const store = this.store();
        const pa = await store.peek(id);
        if (!pa || pa.surface !== 'mcp' || pa.userId !== ctx.userId || pa.tid !== ctx.tid || !pa.mcp) throw notFound();
        return { pa, res: await store.loadResult(id) };
    }

    async view(ctx: AgentCtx, id: string): Promise<ApprovalView> {
        const { pa, res } = await this.load(ctx, id);
        return this.viewOf(pa, res);
    }

    /** Kendi bekleyen (suresi dolmamis, sonuclanmamis) onaylari; yeni -> eski. Olu dizin uyeleri temizlenir. */
    async list(ctx: AgentCtx): Promise<{ items: ApprovalView[] }> {
        const store = this.store();
        const items: ApprovalView[] = [];
        for (const id of (await store.listIds(ctx.tid, ctx.userId)).slice(0, 200)) {
            const [pa, res] = await Promise.all([store.peek(id), store.loadResult(id)]);
            if (!pa || pa.surface !== 'mcp' || pa.userId !== ctx.userId || pa.tid !== ctx.tid || !pa.mcp) { await store.prune(ctx.tid, ctx.userId, id); continue; }
            const v = this.viewOf(pa, res);
            if (v.status === 'pending') items.push(v); else await store.prune(ctx.tid, ctx.userId, id);
        }
        items.sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
        return { items: items.slice(0, 50) };
    }

    /**
     * Onay/ret. Sira: kayit sahibi mi (404) -> sonuc var mi (idempotent gorunum) -> sure (410) -> baglanti/tenant ayari -> [onayda] bakim 503 -> surum/ozet esleme ->
     * yurutme aninda yeniden denetim (LIVE_READONLY 423 vb.; kayit tuketilmez) -> tek yurutme kilidi -> kota -> yurutme (`pendingActionId` idempotency anahtari).
     * `ctx` = web oturumu baglami; arac/denetim yuzeyi 'mcp' olarak kurulur.
     */
    async decide(ctx: AgentCtx, id: string, decision: 'approve' | 'reject'): Promise<ApprovalView> {
        let rec: PendingAction | undefined;
        try {
            const { pa, res } = await this.load(ctx, id);
            rec = pa;
            return await this.decideInner(ctx, pa, res, decision);
        } catch (e) {
            const code = e instanceof AppError && e.code ? e.code : 'INTERNAL';
            if (rec) void auditAgent({ ...ctx, surface: 'mcp' }, this.auditOf(rec, 'mcp.approval', outcomeOfCode(code), decision, code));
            throw e;
        }
    }

    private auditOf(pa: PendingAction, event: 'mcp.approval' | 'mcp.write', outcome: AgentOutcome, decision: 'approve' | 'reject', code?: string) {
        return {
            event, outcome, decision, pendingActionId: pa.id, capabilityId: pa.capId, version: pa.version, params: pa.input,
            clientId: pa.mcp?.clientId, fam: pa.mcp?.fam, ...(code ? { code } : {}), ...(event === 'mcp.write' ? { stage: 'executed' as const } : {}),
        };
    }

    private async decideInner(webCtx: AgentCtx, pa: PendingAction, res: ActionResult | null, decision: 'approve' | 'reject'): Promise<ApprovalView> {
        const store = this.store();
        const kv = this.d.kv();
        const ctx: AgentCtx = { ...webCtx, surface: 'mcp' };
        const m = pa.mcp!;
        if (res?.mcp) return this.viewOf(pa, res); // zaten sonuclandi: tekrar yurutme YOK, mevcut durum
        if (res?.state === 'executing') throw AppError.of('CONFLICT', { message: 'Bu işlem şu an yürütülüyor. Birkaç saniye sonra durumu kontrol edin.' });
        if (this.now() > pa.expiresAt) throw AppError.of('APPROVAL_EXPIRED');
        // Baglanti (aile) iptal edildiyse bekleyen onaylar da gecersiz.
        let famOk = false;
        try { famOk = await this.d.familyActive(m.fam); } catch { throw AppError.of('UNAVAILABLE'); }
        if (!famOk) throw AppError.of('APPROVAL_EXPIRED');

        if (decision === 'approve') {
            if (this.d.isMaintenance()) throw AppError.of('MAINTENANCE');
            if ((await this.d.access(pa.tid)) !== 'readwrite') throw AppError.of('FORBIDDEN', { message: 'Bu mağazada yapay zekâ bağlantısı yazma işlemine kapalı.' });
            if (this.d.tools.versionOf(pa.capId) !== pa.version || hashInput(pa.input) !== pa.inputHash) {
                await store.dropDedupe(pa.userId, m.fam, pa.capId, pa.inputHash);
                throw AppError.of('APPROVAL_EXPIRED'); // yetenek surumu degisti / kayit tahrif edildi: yurutme yok
            }
            const blocked = await this.d.tools.unavailable?.(ctx, pa.capId); // LIVE_READONLY 423, kill-switch, RBAC, abonelik, impersonation
            if (blocked) throw blocked;
        }

        // TEK yurutme / tek karar: es zamanli iki istekten yalniz biri kilidi alir.
        const lockKey = `agent:pa:lock:${pa.id}`;
        if (!(await kv.setNx(lockKey, '1', MCP_RESULT_TTL_SEC))) {
            const cur = await store.loadResult(pa.id);
            if (cur?.mcp) return this.viewOf(pa, cur);
            throw AppError.of('CONFLICT', { message: 'Bu işlem şu an yürütülüyor. Birkaç saniye sonra durumu kontrol edin.' });
        }
        const done = async (mcp: McpOutcome, keep: boolean): Promise<ApprovalView> => {
            const rec: ActionResult = { userId: pa.userId, tid: pa.tid, state: 'final', events: [], mcp };
            await store.saveResult(pa.id, rec, MCP_RESULT_TTL_SEC);
            if (keep) await store.keepDedupe(pa.userId, m.fam, pa.capId, pa.inputHash, pa.id); else await store.dropDedupe(pa.userId, m.fam, pa.capId, pa.inputHash);
            await store.prune(pa.tid, pa.userId, pa.id);
            return this.viewOf(pa, rec);
        };

        if (decision === 'reject') {
            void auditAgent(ctx, this.auditOf(pa, 'mcp.approval', 'ok', 'reject'));
            return done({ status: 'rejected', at: this.now() }, true);
        }

        const ent = await (this.d.entitlement ?? resolveAgentEntitlement)(pa.tid);
        const q = await consumeActionQuota(kv, pa.tid, ent, new Date(this.now()), actionQuotaCost(pa.capId, pa.input));
        if (!q.allowed) { await kv.del(lockKey); throw quotaExceededError(ent); } // kayit tuketilmez: yarin ya da plan yukseltilince onaylanabilir

        void auditAgent(ctx, this.auditOf(pa, 'mcp.approval', 'ok', 'approve'));
        await store.saveResult(pa.id, { userId: pa.userId, tid: pa.tid, state: 'executing', events: [] }, MCP_RESULT_TTL_SEC);
        const spec = CONFIRM_SPECS[pa.capId];
        const openIn = spec?.openIn ? { screen: spec.openIn.screen, ...(spec.openIn.params ? { params: spec.openIn.params } : {}) } : undefined;
        try {
            const r = await this.d.tools.invoke(ctx, pa.capId, pa.input, { pendingActionId: pa.id });
            const out = spec?.result(r.data, 'tr') ?? { message: 'İşlem tamamlandı.', ok: true };
            void auditAgent(ctx, this.auditOf(pa, 'mcp.write', out.ok ? 'ok' : 'error', 'approve'));
            return await done({ status: out.ok ? 'executed' : 'failed', summary: plain(out.message, 300), ...(openIn ? { openIn } : {}), at: this.now() }, out.ok);
        } catch (e) {
            const code = e instanceof AppError && e.code ? e.code : 'INTERNAL';
            if (!(e instanceof AppError) || code === 'INTERNAL') log.error({ capId: pa.capId, err: e }, 'MCP onayli eylem yurutme hatasi');
            void auditAgent(ctx, this.auditOf(pa, 'mcp.write', outcomeOfCode(code), 'approve', code));
            if (UNKNOWN_OUTCOME_CODES.has(code)) return done({ status: 'unknown_outcome', code, summary: 'Sonuç belirsiz. Lütfen ekrandan kontrol edin.', ...(openIn ? { openIn } : {}), at: this.now() }, true);
            const message = e instanceof AppError && e.expose ? e.message : 'İşlem tamamlanamadı.';
            return done({ status: 'failed', code, summary: plain(message, 300), ...(openIn ? { openIn } : {}), at: this.now() }, false);
        }
    }
}
