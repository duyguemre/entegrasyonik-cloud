import { startJob, defineJob, productionSchedulerDeps } from '@platform/runtime/scheduler';
import type { JobController, RunJobDeps } from '@platform/runtime/scheduler';
import { logger } from '@platform/core/logger';
import { flushMetricsOnce } from './metricsFlush';
import { productionMetricRollupModel } from './prodDeps';

const log = logger.child({ module: 'MetricsFlushScheduler' });

const INTERVAL_MS = 60 * 1000;
const MAX_DURATION_MS = 30 * 1000;

/**
 * ADR-0017 Karar 2.1: 60 sn'de bir `MetricsRegistry`i `MetricRollups`e (5dk+1sa) yazar. `platform/runtime/scheduler`
 * (`JobRunRegistry`) KULLANILIR (görev talimatı: doğrudan `setInterval` YAZILMAZ) ama **lease KASITLI OLARAK
 * KAPALIDIR** (`leaseEnabled:false`): bu iş `StockPublishScheduler` gibi "tek sahip" bir zamanlayıcı DEĞİLDİR --
 * her pod'un KENDİ süreç-içi kayıt defterini flush etmesi GEREKİR (aksi halde lease'i kaybeden pod'un yereldeki
 * sayaçları hiç Mongo'ya yazılmaz, veri KAYBOLUR). Çoklu pod/çoklu flush turu `$inc` upsert ile doğal olarak
 * toplanır (ADR Karar 2.1) -- bu yüzden tek-sahip koordinasyonuna gerek/İSTEK YOK.
 */
export class MetricsFlushScheduler {
    private static controller: JobController | undefined;

    /** Aynı süreçte iki kez çağrılırsa ikinci çağrı no-op'tur (idempotent). `deps` verilirse (testler) SENKRON kurulur. */
    public static start(deps?: RunJobDeps): void {
        if (this.controller) return;

        const jobDef = defineJob({
            name: 'observability.metrics-flush',
            everyMs: INTERVAL_MS,
            maxDurationMs: MAX_DURATION_MS,
            criticality: 'normal',
            runOnStart: 'always',
            run: async () => {
                const model = await productionMetricRollupModel();
                const r = await flushMetricsOnce({ model });
                return { processed: r.seriesFlushed, note: `ops=${r.opsWritten}` };
            },
        });

        if (deps) {
            this.controller = startJob(jobDef, { ...deps, leaseEnabled: false });
            return;
        }

        let stoppedBeforeInit = false;
        let inner: JobController | undefined;
        productionSchedulerDeps()
            .then((resolved) => {
                if (stoppedBeforeInit) return;
                inner = startJob(jobDef, { ...resolved, leaseEnabled: false });
            })
            .catch((err) => log.error({ err }, 'MetricsFlushScheduler: üretim bağımlılıkları çözülemedi'));

        this.controller = {
            stop() { stoppedBeforeInit = true; inner?.stop(); },
            overlapSkippedCount: () => inner?.overlapSkippedCount() ?? 0,
            isRunning: () => inner?.isRunning() ?? false,
        };
    }

    /** Testler/graceful shutdown için: zamanlayıcıyı durdurur. */
    public static stop(): void {
        this.controller?.stop();
        this.controller = undefined;
    }
}
