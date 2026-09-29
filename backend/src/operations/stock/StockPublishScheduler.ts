import { StockPublishTrigger } from "./StockPublishTrigger";
import { startJob, defineJob } from "@platform/runtime/scheduler";
import type { JobController, RunJobDeps } from "@platform/runtime/scheduler";

/**
 * ADR-0004 Karar 6: "toplama (debounce): tenant×kanal başına 30 sn". [ADR-0016 §2 GÖÇÜ, §2.1 örneğiyle AYNI iş
 * (`stock.publish`, every 30 sn, maxDurationMs 25 sn)] -- `platform/runtime/scheduler` (`setTimeout` zinciri +
 * Mongo lease + `JobRunRegistry`) kullanır, düz `setInterval` DEĞİL. İş MANTIĞI (`StockPublishTrigger.run()`,
 * Redis kapalıyken atlama) DEĞİŞMEDİ.
 */
export class StockPublishScheduler {
    private static readonly INTERVAL_MS = 30 * 1000;
    private static readonly MAX_DURATION_MS = 25 * 1000;
    private static controller: JobController | undefined;

    /** Aynı süreçte iki kez çağrılırsa (ör. test/yeniden yükleme) ikinci çağrı no-op'tur (idempotent). */
    public static start(trigger: StockPublishTrigger = new StockPublishTrigger(), deps?: RunJobDeps): void {
        if (this.controller) return;
        this.controller = startJob(defineJob({
            name: 'stock.publish',
            everyMs: this.INTERVAL_MS,
            maxDurationMs: this.MAX_DURATION_MS,
            criticality: 'critical',
            runOnStart: 'always',
            run: async () => {
                const r = await trigger.run();
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
