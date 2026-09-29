import { runSourceMonitor, SourceMonitorDeps } from './SourceMonitor';
import { startJob, defineJob } from '@platform/runtime/scheduler';
import type { JobController, RunJobDeps } from '@platform/runtime/scheduler';

/**
 * ADR-0018 Karar 2c (Aşama B): haftalık kaynak izleyici. `platform/runtime/scheduler` (`setTimeout` zinciri +
 * Mongo lease + `JobRunRegistry`) ÜZERİNDEN, düz `setInterval` DEĞİL (AYNI emsal: diğer Aşama A/B işleri).
 * `runOnStart:'ifDue'`: haftalık bir iş her süreç başlangıcında/deploy'da YENİDEN koşmaz (`ReconciliationScheduler`
 * dış mutabakat emsaliyle AYNI karar). Varsayılan `SOURCE_MONITOR_ENABLED=false` -- `runSourceMonitor` bu bayrak
 * kapalıyken HİÇBİR ağ isteği atmaz (bkz. SourceMonitor.ts). `IntegrationEngine`/`OrderOrchestrator`'a
 * dokunmadan BAĞIMSIZ modül olarak `worker`/`all` rolünde başlatılır.
 */
export class SourceMonitorScheduler {
    private static readonly INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
    private static readonly MAX_DURATION_MS = 30 * 60 * 1000;
    private static controller: JobController | undefined;

    /** Aynı süreçte iki kez çağrılırsa (ör. test/yeniden yükleme) ikinci çağrı no-op'tur (idempotent). */
    public static start(monitorDeps: SourceMonitorDeps = {}, deps?: RunJobDeps): void {
        if (this.controller) return;
        this.controller = startJob(defineJob({
            name: 'compliance.sourceMonitor',
            everyMs: this.INTERVAL_MS,
            maxDurationMs: this.MAX_DURATION_MS,
            criticality: 'normal',
            runOnStart: 'ifDue',
            runType: 'scheduler',
            scope: { level: 'platform' },
            run: async () => runSourceMonitor(monitorDeps),
        }), deps);
    }

    /** Testler/graceful shutdown için: zamanlayıcıyı durdurur. */
    public static stop(): void {
        this.controller?.stop();
        this.controller = undefined;
    }
}
