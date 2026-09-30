import { Worker, Job, UnrecoverableError, DelayedError } from 'bullmq';
import { RedisService } from '@services/redis/RedisService'; // Merkezi Redis servisi
import { OrderWorker } from './OrderWorker';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import orderConfig from './order.config.json';
import { getSetting } from '@integration/config/ConfigResolver';
import { eventLog } from '@platform/core/logger';
import { runWithJobContext } from '@platform/core/context';
import { QueueMetricsCollector } from '@services/metrics/QueueMetricsCollector';
import { allowInFlightWork, recordIntakeSkip } from '@integration/config/intakeGate';

/** [ADR-0030 X6] Kill-switch `off` iken kuyruktaki iş bu kadar ertelenir (deneme hakkı tüketilmez, iş silinmez). */
export const INTAKE_OFF_DEFER_MS = 30_000;

const log = eventLog('worker', 'worker-runner');

const ORDER_QUEUE = 'order-sync-queue';

/**
 * [BO getQueues] Worker 'completed'/'failed' olayını dakikalık kuyruk metriğine çevirir (tek yardımcı).
 * Etiketler yalnız `queue` + `integrationCode` (sınırlı küme); tenant/clientId ETİKET DEĞİL (kardinalite).
 * `retried`: başarısız ama BullMQ'nun yeniden deneyeceği (kalan deneme var, UnrecoverableError değil).
 * Asla fırlatmaz.
 */
export function recordJobOutcome(queue: string, job: Job | undefined, status: 'completed' | 'failed', err?: Error): void {
    try {
        if (!job) return;
        const now = Date.now();
        const started = job.processedOn;
        const attempts = job.opts?.attempts ?? 1;
        QueueMetricsCollector.recordOutcome({
            queue,
            integrationCode: String(job.data?.integrationCode ?? 'unknown'),
            status,
            retried: status === 'failed' && err?.name !== 'UnrecoverableError' && (job.attemptsMade ?? 0) < attempts,
            waitMs: started && job.timestamp ? started - job.timestamp : undefined,
            procMs: started ? (job.finishedOn ?? now) - started : undefined,
        });
    } catch { /* best-effort */ }
}

// [ADR-0006 Karar 6] Graceful shutdown adım 4 (BullMQ worker.close()) için tek Worker referansı.
let currentWorker: Worker | undefined;

/**
 * BullMQ Worker'ı başlatır.
 * 'order-sync-queue' kuyruğuna düşen her bir işi OrderWorker sınıfına paslar.
 */
export function startOrderWorkerConsumer() {
    log.info('WORKERRUNNER_ORDER_SYNC_QUEUE_DINLENMEYE', 'order-sync-queue dinlenmeye başlandı... (Mode: Single Pod)');

    const orderSyncConsumer = new Worker(
        'order-sync-queue',
        async (job: Job, token?: string) => {
            // [ADR-0030 X6] Kill-switch `off`: dış çağrı yapılmaz; iş ertelenir (DelayedError attempts'ı tüketmez).
            if (!allowInFlightWork(job.data?.integrationCode)) {
                recordIntakeSkip('OrderWorker', job.data?.integrationCode, 'inflight');
                await job.moveToDelayed(Date.now() + INTAKE_OFF_DEFER_MS, token);
                throw new DelayedError();
            }
            // Her job için yeni bir business logic instance'ı oluşturuyoruz
            const workerLogic = new OrderWorker();

            try {
                // Job.data içindeki clientId, integrationCode ve lastSyncTimestamp bilgilerini işler
                // [F-06] Kuyruktan gelen correlation id (yoksa yeni) + tenant/entegrasyon/işlem bağlamı; adaptör çağrılarına ALS ile akar.
                return await runWithJobContext(
                    { source: 'worker', correlationId: job.data?.correlationId, tenantId: Number(job.data?.clientId), integrationCode: job.data?.integrationCode, operation: 'order.sync' },
                    () => workerLogic.process(job.data),
                );
            } catch (error: any) {
                // [ADR-0005 Karar 3] FATAL / `retryable:false` (IntegrationError sözleşmesi, ADR-0006) hatalar
                // `UnrecoverableError`'a SARILIR: BullMQ bu durumda `attempts`/backoff'u TÜKETMEDEN işi doğrudan
                // 'failed' durumuna geçirir (boşa retry yok). ÖNCEKİ DAVRANIŞ: her hata normal retry/backoff
                // döngüsüne girerdi (FATAL hatalar da -- ör. 401/geçersiz kimlik -- 5 kez gereksiz denenirdi);
                // OrderErrorHandler bu hatayı yalnızca 'failed' OLAYINDAN SONRA (retry'lar arasında) DLQ'ya taşıyabiliyordu.
                if (IntegrationError.isIntegrationError(error) && error.retryable === false) {
                    throw new UnrecoverableError(error.message);
                }
                throw error;
            }
        },
        {
            // Bağlantı artık merkezi RedisService üzerinden güvenli şekilde alınıyor
            connection: RedisService.getConnectionConfig(),

            // [ADR-0020 Aşama A] JSON'dan (`order.config.json`) doğrudan okuma yerine tek çözümleyici; DEĞER
            // AYNI (5 — ölü `||` yedek 2 artık hiçbir yerde YOK, bkz. ADR K10 ve katalogdaki `knownDriftNote`).
            concurrency: getSetting<number>('order.workerConcurrency'),

            // [ADR-0005 Karar 3] Bellek yönetimi: Queue (OrderQueueProducer.ts) ile TEKİL ayar (order.config.json
            // > memoryManagement) -- ölçüm için tamamlanan işlerin zaman damgaları 24 saat/1000 iş tutulur.
            removeOnComplete: orderConfig.memoryManagement.removeOnComplete as any,
            removeOnFail: orderConfig.memoryManagement.removeOnFail as any,
        }
    );

    // Hata dinleyicisi: Worker seviyesindeki beklenmedik hataları loglar
    orderSyncConsumer.on('error', (err) => {
        log.error('WORKERRUNNER_KRITIK_HATA', 'Kritik hata:', { err });
    });

    orderSyncConsumer.on('completed', (job) => recordJobOutcome(ORDER_QUEUE, job, 'completed'));
    orderSyncConsumer.on('failed', (job, err) => recordJobOutcome(ORDER_QUEUE, job, 'failed', err));
    QueueMetricsCollector.startAutoFlush(); // kova yazımı (60 sn, unref'd, idempotent)

    currentWorker = orderSyncConsumer;
    return orderSyncConsumer;
}

/**
 * [ADR-0006 Karar 6] Graceful shutdown adım 4: aktif işlerin bitmesini bekleyip BullMQ Worker'ı kapatır.
 * Hiç başlatılmadıysa (ör. `APP_ROLE=web`) no-op'tur.
 */
export async function closeOrderWorkerConsumer(): Promise<void> {
    if (!currentWorker) return;
    await currentWorker.close();
    currentWorker = undefined;
    QueueMetricsCollector.stopAutoFlush();
    await QueueMetricsCollector.flush();
}