import { runProbes, ProbeRunnerDeps } from './ProbeRunner';
import { startJob, defineJob } from '@platform/runtime/scheduler';
import type { JobController, RunJobDeps } from '@platform/runtime/scheduler';

/**
 * ADR-0018 Karar 2b (Aşama B) / ADR-0017 Karar 3 "genel koşu şeması": aktif probe -- günlük tur.
 * `platform/runtime/scheduler` (`setTimeout` zinciri + Mongo lease + `JobRunRegistry`) ÜZERİNDEN, düz
 * `setInterval` DEĞİL (AYNI emsal: `TrialExpiryScheduler`/`AllocationSweepScheduler`). `runType:'scheduler'`,
 * `scope.level:'platform'` (ADR: probe HİÇBİR ZAMAN tenant kimliği kullanmaz).
 * Bugün yalnız REPLAY modu koşar (`PROBES_LIVE` varsayılan `false`); GERÇEK ağ isteği YOKTUR (bkz. ProbeRunner.ts).
 * `IntegrationEngine`/`OrderOrchestrator`'a dokunmadan BAĞIMSIZ modül olarak `worker`/`all` rolünde başlatılır.
 */
export class ProbeScheduler {
    private static readonly INTERVAL_MS = 24 * 60 * 60 * 1000;
    private static readonly MAX_DURATION_MS = 5 * 60 * 1000;
    private static controller: JobController | undefined;

    /** Aynı süreçte iki kez çağrılırsa (ör. test/yeniden yükleme) ikinci çağrı no-op'tur (idempotent). */
    public static start(probeDeps: ProbeRunnerDeps = {}, deps?: RunJobDeps): void {
        if (this.controller) return;
        this.controller = startJob(defineJob({
            name: 'compliance.probeRunner',
            everyMs: this.INTERVAL_MS,
            maxDurationMs: this.MAX_DURATION_MS,
            criticality: 'normal',
            runOnStart: 'always',
            runType: 'scheduler',
            scope: { level: 'platform' },
            run: async () => runProbes(probeDeps),
        }), deps);
    }

    /** Testler/graceful shutdown için: zamanlayıcıyı durdurur. */
    public static stop(): void {
        this.controller?.stop();
        this.controller = undefined;
    }
}
