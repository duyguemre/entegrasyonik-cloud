// Backoffice B1 (genel bakış) + B7a-d (motor ve kuyruklar) yetenekleri (yalnız `/admin-api`; `minTier:'platformAdmin'`). Ayrı dosya: paralel backoffice işleriyle çakışmamak için.
// `retryJob` external:true + write: BullMQ işi yeniden koşunca pazaryerine yazabilir -> LIVE_READONLY kipinde `liveReadonlyRpcGuard` 423 verir (kural yetenek kaydından türer).
// `discardJob`/`releaseStuckLease` yerel durum değiştirir (external:false); `discardJob` destructive (step-up otomatik), diğer ikisi `REAUTH_RPCS` ile step-up ister.
import { z } from 'zod';
import { defineCapability as c, nx, NO_AGENT, noUi } from '../define';
import { PLATFORM_ONLY } from '../permissions';

const PA = nx('platform_admin', 'Süper yönetici (platformAdmin) yeteneği; OAuth token\'ında ga bulunmadığı için MCP\'den çağrılamaz (ADR-0010).');
const UI = noUi('Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.');

const HEALTH_ROW = z.object({ area: z.string().max(40), status: z.enum(['ok', 'degraded']), detail: z.string().max(200) });
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const st = (v: unknown): 'ok' | 'degraded' => (v === 'ok' ? 'ok' : 'degraded');

/** `BackofficeOverviewService/getHealth` -> yalniz durum/sayac satirlari (hata METNI, pod adlari, tenant yok). */
function projectHealth(raw: any) {
    const d = raw?.dependencies ?? {};
    const r = raw?.red ?? {};
    const q: any[] = Array.isArray(raw?.queues?.items) ? raw.queues.items : [];
    const items: Array<z.infer<typeof HEALTH_ROW>> = [
        { area: 'database', status: d.mongo === 'ok' ? 'ok' : 'degraded', detail: `mongo=${String(d.mongo ?? 'unknown').slice(0, 20)}` },
        { area: 'cache', status: d.redis === 'ok' || d.redis === 'n/a' ? 'ok' : 'degraded', detail: `redis=${String(d.redis ?? 'unknown').slice(0, 20)}` },
        { area: 'requests', status: st(r.status), detail: `requests=${num(r.requests) ?? 'n/a'} errors5xx=${num(r.errors5xx) ?? 'n/a'} errorRate=${num(r.errorRate) ?? 'n/a'} p95Ms=${num(r.durationP95Ms) ?? 'n/a'}` },
        ...q.slice(0, 10).map((x) => ({
            area: `queue:${String(x?.name ?? '?').slice(0, 30)}`, status: x?.available === false ? 'degraded' as const : 'ok' as const,
            detail: `backlog=${num(x?.backlog) ?? 'n/a'} active=${num(x?.active) ?? 'n/a'} failed=${num(x?.failed) ?? 'n/a'} dlqPending=${num(x?.dlqPending) ?? 'n/a'}`,
        })),
        { area: 'issues', status: st(raw?.issues?.status), detail: `open=${num(raw?.issues?.open) ?? 'n/a'} newLast24h=${num(raw?.issues?.newLast24h) ?? 'n/a'}` },
        { area: 'pods', status: st(raw?.pods?.status), detail: `count=${Array.isArray(raw?.pods?.items) ? raw.pods.items.length : 'n/a'}` },
    ];
    const degraded: string[] = (Array.isArray(raw?.degradedSections) ? raw.degradedSections : []).filter((x: unknown): x is string => typeof x === 'string').map((x: string) => x.slice(0, 40)).slice(0, 10);
    return { status: st(raw?.status), degradedSections: degraded, items };
}

/** `BackofficeEngineService/getQueues` -> yalniz sayaclar. */
function projectQueues(raw: any) {
    const qs: any[] = Array.isArray(raw?.queues) ? raw.queues : [];
    return { items: qs.slice(0, 20).map((x) => ({
        queue: String(x?.name ?? '?').slice(0, 60), available: x?.available === true,
        waiting: num(x?.counts?.wait), active: num(x?.counts?.active), delayed: num(x?.counts?.delayed), failed: num(x?.counts?.failed),
        pendingReview: num(x?.dlq?.pendingReview),
    })) };
}

export const BACKOFFICE_ENGINE_CAPABILITIES = [
    c({
        id: 'platform.overview.health', domain: 'platform', summary: { tr: 'Platform sağlık panosu (bağımlılıklar, podlar, RED, kuyruk, intake, sorunlar)', en: 'Platform health overview (dependencies, pods, RED, queues, intake, issues)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeOverviewService/getHealth' }], ui: UI, mcp: PA, agent: NO_AGENT,
        // BR-4 (adminChat): genel saglik ozeti. YALNIZ durum/sayac satirlari (alan, durum, kisa ayrinti); pod adi/tenant/hata metni/yuk yok.
        input: z.object({}).strict(),
        output: z.object({ status: z.enum(['ok', 'degraded']), degradedSections: z.array(z.string().max(40)).max(10), items: z.array(HEALTH_ROW).max(40) }),
        adminChat: { exposed: {
            present: 'table', project: projectHealth,
            llm: {
                description: 'Returns the overall platform health summary: dependency readiness (database, cache), the last-hour HTTP request and error rate, queue backlog counters and the open error-group count. '
                    + 'Use it for broad questions such as whether the platform is healthy right now. It returns counters and statuses only, never tenant data. It cannot change anything.',
                examples: ['Platform şu an sağlıklı mı?', 'Genel sistem durumunu özetle', 'Sistemde bozuk bir şey var mı?'],
            },
        } },
    }),
    c({
        id: 'platform.engine.queues', domain: 'platform', summary: { tr: 'BullMQ kuyrukları: iş sayaçları + 24 sa ölçüm serisi + DLQ bekleyen', en: 'BullMQ queues: job counts + 24h metrics series + pending DLQ' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeEngineService/getQueues' }], ui: UI, mcp: PA, agent: NO_AGENT,
        // BR-4 (adminChat): kuyruk sayaclari (24 sa seri ve is yuku YOK).
        input: z.object({}).strict(),
        output: z.object({ items: z.array(z.object({
            queue: z.string().max(60), available: z.boolean(),
            waiting: z.number().int().nullable(), active: z.number().int().nullable(), delayed: z.number().int().nullable(), failed: z.number().int().nullable(),
            pendingReview: z.number().int().nullable(),
        })).max(20) }),
        adminChat: { exposed: {
            present: 'table', project: projectQueues,
            llm: {
                description: 'Returns the state of the background job queues: waiting, active, delayed and failed job counters and the number of failed jobs pending manual review. '
                    + 'Use it to answer whether jobs are backing up or failing. Job payloads and tenant identifiers are never included. It cannot retry or discard jobs.',
                examples: ['Kuyrukta bekleyen iş var mı?', 'Başarısız iş sayısı kaç?', 'İş kuyruğu tıkandı mı?'],
            },
        } },
    }),
    c({
        id: 'platform.engine.failed_jobs', domain: 'platform', summary: { tr: 'Başarısız işleri listele (yük yok; BullMQ ya da DLQ)', en: 'List failed jobs (no payload; BullMQ or DLQ)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeEngineService/listFailedJobs' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.engine.retry_job', domain: 'platform', summary: { tr: 'Başarısız kuyruk işini yeniden dene (step-up + gerekçe; dış yazma tetikleyebilir)', en: 'Retry a failed queue job (step-up + reason; may trigger external writes)' },
        effect: 'write', external: true, minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeEngineService/retryJob' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.engine.discard_job', domain: 'platform', summary: { tr: 'Başarısız kuyruk işini sil (step-up + gerekçe)', en: 'Discard a failed queue job (step-up + reason)' },
        effect: 'destructive', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeEngineService/discardJob' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.engine.state_machine_jobs', domain: 'platform', summary: { tr: 'Katalog durum makinesi: ExportSignals/ImportJobs dağılımı + takılı kiralar', en: 'Catalog state machine: ExportSignals/ImportJobs distribution + stuck leases' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeEngineService/getStateMachineJobs' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.engine.release_stuck_lease', domain: 'platform', summary: { tr: 'Takılı kirayı bırak (step-up + gerekçe; yalnız gerçekten takılıysa)', en: 'Release a stuck lease (step-up + reason; only if really stuck)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeEngineService/releaseStuckLease' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.engine.job_runs', domain: 'platform', summary: { tr: 'Zamanlayıcı koşuları (JobRunRegistry, 14 gün) + iş başına son durum', en: 'Scheduler runs (JobRunRegistry, 14 days) + per-job last state' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeEngineService/listJobRuns' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
];
