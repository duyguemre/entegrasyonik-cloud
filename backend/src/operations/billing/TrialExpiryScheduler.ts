import { TrialExpiryJob } from "./TrialExpiryJob";
import { startJob, defineJob } from "@platform/runtime/scheduler";
import type { JobController, RunJobDeps } from "@platform/runtime/scheduler";

/**
 * ADR-0008 §3: deneme bitişi -> `suspended` geçiş işini periyodik çalıştırır. [ADR-0016 §2 GÖÇÜ] Zamanlama
 * `platform/runtime/scheduler` (`setTimeout` zinciri + Mongo lease + `JobRunRegistry`) ÜZERİNDENDİR, düz
 * `setInterval` DEĞİL. İş MANTIĞI (`TrialExpiryJob.run()`, 15 dk aralık, Redis kapalıyken atlama) DEĞİŞMEDİ.
 * `IntegrationEngine`/`OrderOrchestrator`'a dokunulmadığı için BAĞIMSIZ modül olarak `entegrasyonik.ts`'ten
 * `worker`/`all` rolünde başlatılır.
 */
export class TrialExpiryScheduler {
    private static readonly INTERVAL_MS = 15 * 60 * 1000;
    private static readonly MAX_DURATION_MS = 5 * 60 * 1000;
    private static controller: JobController | undefined;

    /** Aynı süreçte iki kez çağrılırsa (ör. test/yeniden yükleme) ikinci çağrı no-op'tur (idempotent). */
    public static start(job: TrialExpiryJob = new TrialExpiryJob(), deps?: RunJobDeps): void {
        if (this.controller) return;
        this.controller = startJob(defineJob({
            name: 'billing.trialExpiry',
            everyMs: this.INTERVAL_MS,
            maxDurationMs: this.MAX_DURATION_MS,
            criticality: 'normal',
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
