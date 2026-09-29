// ADR-0016 §2 (karar B3) + ADR-0017 Karar 3 ("genel koşu şeması"): tek `runJob` soyutlaması için ortak tipler.
// Bu koleksiyon yalnız zamanlayıcıya özgü değildir -- ADR-0018'in ileride tanımlayacağı `AgentRun`'lar da AYNI
// şemayı (runType/scope/trigger/budget/outputSummary/error/corrId) kullanır (ADR-0017 Karar 3, son madde).
import { Logger } from '@platform/core/logger';

export type JobStatus = 'ok' | 'partial' | 'failed' | 'skipped';
export type RunType = 'scheduler' | 'agent' | 'manual';
export type Trigger = 'interval' | 'startup' | 'manual' | 'event';

export interface JobScope {
    level: 'platform' | 'tenant';
    tenantId?: number;
    integrationCode?: string;
}

export interface JobBudget {
    maxDurationMs?: number;
    maxCalls?: number;
    maxCostUnits?: number;
}

/**
 * İş sonuç sözleşmesi (ADR-0017 Karar 3): `{processed, failed, skipped?, note?}`. Mevcut 6 iş sınıfının kendi
 * dönüş şekli (`{skipped: boolean, scannedClients, ...}`) eşleyiciyle buna uyarlanır (bkz. `operations/stock/*Scheduler.ts`).
 * `skipped`: `true`/`false` -- genel atlama; `string` verilirse atlama NEDENİ olarak kaydedilir
 * (ör. `'redis_unavailable'`, `'leased_elsewhere'`).
 */
export interface JobOutcome {
    skipped?: boolean | string;
    processed?: number;
    failed?: number;
    note?: string;
    [key: string]: unknown;
}

export interface JobRunContext {
    /** İşin kapanışta/üst süre aşımında iptal edilmesi gerektiğini bildirir (ADR-0016 §2.3). Bu görevde YALNIZ
     * imza sağlanır; `bootstrap/shutdown.ts` bağlama Faz 1'e aittir (görev talimatı: "henüz BAĞLAMA"). */
    signal: AbortSignal;
    /** Uzun işler lease süresini uzatmak için çağırır (aynı sahiple `acquireLease` yeniden -- ADR-0016 §2.1 adım 5). */
    heartbeat: (progress?: unknown) => Promise<void>;
    logger: Logger;
    runId: string;
    corrId: string;
}

export interface JobDefinition {
    /** Kararlı ad = lease anahtarı = `JobState` anahtarı (ADR-0016 §2.1). */
    name: string;
    /** Tur aralığı (ms). */
    everyMs: number;
    /** Lease TTL ve "hung" eşiği (ADR-0017 Karar 3). */
    maxDurationMs: number;
    criticality?: 'critical' | 'normal';
    /** `'ifDue'`: yalnızca `lastSuccessAt` aralıktan eskiyse başlangıçta koşar (ADR-0017 Karar 3). Varsayılan `'always'`. */
    runOnStart?: 'always' | 'ifDue';
    /** Yüzde jitter (± `everyMs * pct/100`); varsayılan 0. */
    jitterPct?: number;
    runType?: RunType;
    scope?: JobScope;
    budget?: JobBudget;
    run: (ctx: JobRunContext) => Promise<JobOutcome>;
}

/** `defineJob` yalnız tip çıkarımı ve okunabilirlik için kimlik fonksiyonudur (ADR-0016 §2.1 örneğiyle aynı ad). */
export function defineJob(def: JobDefinition): JobDefinition {
    return def;
}
