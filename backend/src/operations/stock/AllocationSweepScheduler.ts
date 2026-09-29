import { AllocationSweepJob } from "./AllocationSweepJob";
import { startJob, defineJob } from "@platform/runtime/scheduler";
import type { JobController, RunJobDeps } from "@platform/runtime/scheduler";

/**
 * ADR-0004 Karar 3: 15 dakikada bir süpürme turu. [ADR-0016 §2 GÖÇÜ] Zamanlama artık `platform/runtime/scheduler`
 * (`setTimeout` zinciri + iş başına Mongo lease + `JobRunRegistry`) ÜZERİNDENDİR -- düz `setInterval` DEĞİL (eski
 * davranış: `tests/characterization/stock/AllocationSweepScheduler.test.ts`, artık [YENİ DAVRANIŞ]'a çevrildi).
 * İş MANTIĞI (`AllocationSweepJob.run()`, 15 dk aralık, Redis kapalıyken atlama) DEĞİŞMEDİ; yalnız ÇATI değişti.
 * `IntegrationEngine`/`OrderOrchestrator` 0-kapsamlı olduğundan BAĞIMSIZ modül olarak kalır (WebhookApiManager
 * emsali). `deps` yalnız testler için (üretimde `undefined` -> `ApplicationDB` tembel çözülür).
 */
export class AllocationSweepScheduler {
    private static readonly INTERVAL_MS = 15 * 60 * 1000;
    private static readonly MAX_DURATION_MS = 5 * 60 * 1000;
    private static controller: JobController | undefined;

    /** Aynı süreçte iki kez çağrılırsa (ör. test/yeniden yükleme) ikinci çağrı no-op'tur (idempotent). */
    public static start(job: AllocationSweepJob = new AllocationSweepJob(), deps?: RunJobDeps): void {
        if (this.controller) return;
        this.controller = startJob(defineJob({
            name: 'stock.allocationSweep',
            everyMs: this.INTERVAL_MS,
            maxDurationMs: this.MAX_DURATION_MS,
            criticality: 'critical',
            runOnStart: 'always',
            run: async () => {
                const r = await job.run();
                return { ...r, skipped: r.skipped ? 'redis_unavailable' : undefined };
            },
        }), deps);
    }

    /** Testler/graceful shutdown için: zamanlayıcıyı durdurur. */
    public static stop(): void {
        this.controller?.stop();
        this.controller = undefined;
    }
}
