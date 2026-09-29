import { OversellCompensationJob } from "./OversellCompensationJob";
import { startJob, defineJob } from "@platform/runtime/scheduler";
import type { JobController, RunJobDeps } from "@platform/runtime/scheduler";

/**
 * ADR-0004 Karar 7 (Aşama C) -- grace penceresi (varsayılan 30 dk) kontrolü/otomatik iptal. [ADR-0016 §2.2:
 * "dış yan etkili her otomatik eylem" -- `OversellCompensation` pazaryerine gerçek `rejectOrder` çağırır, lease'in
 * ŞİMDİ eklenmesinin asıl gerekçesi budur (kayan dağıtımda çift iptal riski, GV-08)] `platform/runtime/scheduler`
 * kullanır, düz `setInterval` DEĞİL. İş MANTIĞI (`OversellCompensationJob.run()`, ATOMİK talep -- §2.5 ayrı katman
 * -- ve Redis kapalıyken atlama) DEĞİŞMEDİ.
 */
export class OversellCompensationScheduler {
    private static readonly INTERVAL_MS = 5 * 60 * 1000;
    private static readonly MAX_DURATION_MS = 4 * 60 * 1000;
    private static controller: JobController | undefined;

    /** Aynı süreçte iki kez çağrılırsa (ör. test/yeniden yükleme) ikinci çağrı no-op'tur (idempotent). */
    public static start(job: OversellCompensationJob = new OversellCompensationJob(), deps?: RunJobDeps): void {
        if (this.controller) return;
        this.controller = startJob(defineJob({
            name: 'stock.oversellCompensation',
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
