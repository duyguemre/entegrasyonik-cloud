import { InternalReconciliationJob } from "./InternalReconciliationJob";
import { ExternalReconciliationJob } from "./ExternalReconciliationJob";
import { startJob, defineJob } from "@platform/runtime/scheduler";
import type { JobController, RunJobDeps } from "@platform/runtime/scheduler";

/**
 * ADR-0004 Karar 8 (Aşama C): iç mutabakat SAATLİK, dış mutabakat GÜNLÜK. [ADR-0016 §2 GÖÇÜ] İKİ bağımsız
 * `platform/runtime/scheduler` işi (iki ayrı `JobController`, iki bağımsız hata izolasyonu -- AYNI emsal, düz
 * `setInterval` yerine `setTimeout` zinciri + Mongo lease + `JobRunRegistry`). Dış mutabakat, ADR-0017 Karar 3
 * kapsam listesindeki AÇIK karara göre `runOnStart:'ifDue'` (günlük iş her dağıtımda yeniden koşmaz -- eski
 * davranış HER start() çağrısında hemen koşmaktı, bu KASITLI bir davranış değişikliğidir, bkz. göç testi).
 * İç mutabakat `runOnStart:'always'` kalır (saatlik, deploy sonrası hemen koşması zararsız).
 */
export class ReconciliationScheduler {
    private static readonly INTERNAL_INTERVAL_MS = 60 * 60 * 1000;
    private static readonly EXTERNAL_INTERVAL_MS = 24 * 60 * 60 * 1000;
    private static internalController: JobController | undefined;
    private static externalController: JobController | undefined;

    /** Aynı süreçte iki kez çağrılırsa (ör. test/yeniden yükleme) ikinci çağrı no-op'tur (idempotent). */
    public static start(
        internalJob: InternalReconciliationJob = new InternalReconciliationJob(),
        externalJob: ExternalReconciliationJob = new ExternalReconciliationJob(),
        deps?: RunJobDeps,
    ): void {
        if (!this.internalController) {
            this.internalController = startJob(defineJob({
                name: 'stock.internalReconciliation',
                everyMs: this.INTERNAL_INTERVAL_MS,
                maxDurationMs: 30 * 60 * 1000,
                criticality: 'normal',
                runOnStart: 'always',
                run: async () => {
                    const r = await internalJob.run();
                    return { ...r, skipped: r.skipped ? 'redis_unavailable' : undefined };
                },
            }), deps);
        }

        if (!this.externalController) {
            this.externalController = startJob(defineJob({
                name: 'stock.externalReconciliation',
                everyMs: this.EXTERNAL_INTERVAL_MS,
                maxDurationMs: 2 * 60 * 60 * 1000,
                criticality: 'normal',
                runOnStart: 'ifDue',
                run: async () => {
                    const r = await externalJob.run();
                    return { ...r, skipped: r.skipped ? 'redis_unavailable' : undefined };
                },
            }), deps);
        }
    }

    /** Testler/graceful shutdown için: zamanlayıcıları durdurur. */
    public static stop(): void {
        this.internalController?.stop();
        this.internalController = undefined;
        this.externalController?.stop();
        this.externalController = undefined;
    }
}
