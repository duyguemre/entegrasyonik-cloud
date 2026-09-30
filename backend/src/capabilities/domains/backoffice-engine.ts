// Backoffice B1 (genel bakış) + B7a-d (motor ve kuyruklar) yetenekleri (yalnız `/admin-api`; `minTier:'platformAdmin'`). Ayrı dosya: paralel backoffice işleriyle çakışmamak için.
// `retryJob` external:true + write: BullMQ işi yeniden koşunca pazaryerine yazabilir -> LIVE_READONLY kipinde `liveReadonlyRpcGuard` 423 verir (kural yetenek kaydından türer).
// `discardJob`/`releaseStuckLease` yerel durum değiştirir (external:false); `discardJob` destructive (step-up otomatik), diğer ikisi `REAUTH_RPCS` ile step-up ister.
import { defineCapability as c, nx, NO_AGENT, noUi } from '../define';
import { PLATFORM_ONLY } from '../permissions';

const PA = nx('platform_admin', 'Süper yönetici (platformAdmin) yeteneği; OAuth token\'ında ga bulunmadığı için MCP\'den çağrılamaz (ADR-0010).');
const UI = noUi('Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.');

export const BACKOFFICE_ENGINE_CAPABILITIES = [
    c({
        id: 'platform.overview.health', domain: 'platform', summary: { tr: 'Platform sağlık panosu (bağımlılıklar, podlar, RED, kuyruk, intake, sorunlar)', en: 'Platform health overview (dependencies, pods, RED, queues, intake, issues)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeOverviewService/getHealth' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.engine.queues', domain: 'platform', summary: { tr: 'BullMQ kuyrukları: iş sayaçları + 24 sa ölçüm serisi + DLQ bekleyen', en: 'BullMQ queues: job counts + 24h metrics series + pending DLQ' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeEngineService/getQueues' }], ui: UI, mcp: PA, agent: NO_AGENT,
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
