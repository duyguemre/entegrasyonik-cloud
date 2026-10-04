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
import { LEGACY_ORDER_QUEUE, ORDER_QUEUE_NAMES, concurrencyFor } from '@integration/contracts/orderQueues';

/** [ADR-0030 X6] Kill-switch `off` iken kuyruktaki iş bu kadar ertelenir (deneme hakkı tüketilmez, iş silinmez). */
export const INTAKE_OFF_DEFER_MS = 30_000;

const log = eventLog('worker', 'worker-runner');


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

// [ADR-0006 Karar 6] Graceful shutdown adım 4 (BullMQ worker.close()) için Worker referansları.
// [eslesme-fiyat WP7a, F-01] Artık kanal başına bir Worker (+ eski kuyruğu boşaltan bir Worker).
let currentWorkers: Worker[] = [];

/** [WP7a, F-12] RATE_LIMITED'da en fazla bu kadar `moveToDelayed`; sonra normal hata akışı (retry/DLQ). */
export const RATE_LIMIT_MAX_DEFERRALS = 5;
/** Retry-After başlığı yoksa / okunamazsa bekleme; üst sınır (bir işi saatlerce askıda tutma). */
export const RATE_LIMIT_DEFAULT_DEFER_MS = 60_000;
export const RATE_LIMIT_MAX_DEFER_MS = 15 * 60_000;

/** [WP7a, F-12] RATE_LIMITED hatasında işin kaç ms erteleneceği (Retry-After, yoksa varsayılan; [1 sn, 15 dk]). */
export function rateLimitDeferMs(error: any): number {
    const ms = Number(error?.retryAfterMs);
    if (!Number.isFinite(ms) || ms <= 0) return RATE_LIMIT_DEFAULT_DEFER_MS;
    return Math.min(Math.max(ms, 1000), RATE_LIMIT_MAX_DEFER_MS);
}

/**
 * Tek iş işleyicisi (tüm sipariş kuyrukları ortak). Kill-switch, RATE_LIMITED erteleme ve FATAL → UnrecoverableError burada.
 */
export function createOrderJobProcessor() {
    return async (job: Job, token?: string) => {
        // [ADR-0030 X6] Kill-switch `off`: dış çağrı yapılmaz; iş ertelenir (DelayedError attempts'ı tüketmez).
        if (!allowInFlightWork(job.data?.integrationCode)) {
            recordIntakeSkip('OrderWorker', job.data?.integrationCode, 'inflight');
            await job.moveToDelayed(Date.now() + INTAKE_OFF_DEFER_MS, token);
            throw new DelayedError();
        }
        // Her job için yeni bir business logic instance'ı oluşturuyoruz
        const workerLogic = new OrderWorker();

        try {
            // [F-06] Kuyruktan gelen correlation id (yoksa yeni) + tenant/entegrasyon/işlem bağlamı; adaptör çağrılarına ALS ile akar.
            return await runWithJobContext(
                { source: 'worker', correlationId: job.data?.correlationId, tenantId: Number(job.data?.clientId), integrationCode: job.data?.integrationCode, operation: `order.sync${job.data?.kind ? '.' + job.data.kind : ''}` },
                () => workerLogic.process(job.data),
            );
        } catch (error: any) {
            // [eslesme-fiyat WP7a, F-12] RATE_LIMITED: BullMQ'nun 2 sn üstel backoff'u aynı kovaya tekrar vurur (Retry-After ≥60 sn olabilir).
            // İş `retryAfterMs` kadar ERTELENİR (deneme hakkı tüketilmez); sonsuz döngüye karşı tavan `RATE_LIMIT_MAX_DEFERRALS`.
            if (IntegrationError.isIntegrationError(error) && error.code === 'RATE_LIMITED' && typeof job.moveToDelayed === 'function') {
                const deferrals = Number(job.data?.rateLimitDeferrals ?? 0);
                if (deferrals < RATE_LIMIT_MAX_DEFERRALS) {
                    const deferMs = rateLimitDeferMs(error);
                    try { await job.updateData?.({ ...job.data, rateLimitDeferrals: deferrals + 1 }); } catch { /* sayaç best-effort */ }
                    log.warn('WORKERRUNNER_RATE_LIMITED_DEFERRED', `RATE_LIMITED: iş ${deferMs} ms ertelendi (${deferrals + 1}/${RATE_LIMIT_MAX_DEFERRALS}).`, { integrationCode: job.data?.integrationCode });
                    await job.moveToDelayed(Date.now() + deferMs, token);
                    throw new DelayedError();
                }
            }
            // [ADR-0005 Karar 3] FATAL / `retryable:false` (IntegrationError sözleşmesi, ADR-0006) hatalar
            // `UnrecoverableError`'a SARILIR: BullMQ bu durumda `attempts`/backoff'u TÜKETMEDEN işi doğrudan
            // 'failed' durumuna geçirir (boşa retry yok). Mesajın `[CODE]` öneki korunur (hata politikası AUTH'u buradan okur).
            if (IntegrationError.isIntegrationError(error) && error.retryable === false) {
                throw new UnrecoverableError(error.message);
            }
            throw error;
        }
    };
}

/** [WP7a, F-04] Worker olay kancaları: 'failed'/'completed' YALNIZ işi işleyen pod'da tetiklenir (QueueEvents her pod'da tetiklenirdi). */
export interface OrderJobHooks {
    onFailed?: (job: Job | undefined, err: Error) => Promise<void> | void;
    onCompleted?: (job: Job) => Promise<void> | void;
}

function startOne(queueName: string, concurrency: number, hooks: OrderJobHooks): Worker {
    const consumer = new Worker(
        queueName,
        createOrderJobProcessor(),
        {
            // Bağlantı artık merkezi RedisService üzerinden güvenli şekilde alınıyor
            connection: RedisService.getConnectionConfig(),
            concurrency,
            // [ADR-0005 Karar 3] Bellek yönetimi: Queue (OrderQueueProducer.ts) ile TEKİL ayar (order.config.json
            // > memoryManagement) -- ölçüm için tamamlanan işlerin zaman damgaları 24 saat/1000 iş tutulur.
            removeOnComplete: orderConfig.memoryManagement.removeOnComplete as any,
            removeOnFail: orderConfig.memoryManagement.removeOnFail as any,
        }
    );

    // Hata dinleyicisi: Worker seviyesindeki beklenmedik hataları loglar
    consumer.on('error', (err) => {
        log.error('WORKERRUNNER_KRITIK_HATA', 'Kritik hata:', { err, queue: queueName });
    });

    consumer.on('completed', (job) => {
        recordJobOutcome(queueName, job, 'completed');
        if (hooks.onCompleted) Promise.resolve().then(() => hooks.onCompleted!(job)).catch((err) => log.error('WORKERRUNNER_COMPLETED_HOOK_HATASI', 'completed kancası hatası', { err }));
    });
    consumer.on('failed', (job, err) => {
        recordJobOutcome(queueName, job, 'failed', err);
        if (hooks.onFailed) Promise.resolve().then(() => hooks.onFailed!(job, err)).catch((e) => log.error('WORKERRUNNER_FAILED_HOOK_HATASI', 'failed kancası hatası', { err: e }));
    });
    return consumer;
}

/**
 * BullMQ Worker'larını başlatır.
 * [eslesme-fiyat WP7a, F-01] İlk Worker eski `order-sync-queue`'yu BOŞALTIR (yeni iş eklenmez; ayar `order.workerConcurrency`),
 * ardından kanal başına `order-sync-<kod>` Worker'ları kanal eşzamanlılığıyla (orderQueues.CHANNEL_CONCURRENCY).
 * Dönüş: eski kuyruk Worker'ı (geri uyum); tümü `getOrderWorkers()`.
 */
export function startOrderWorkerConsumer(hooks: OrderJobHooks = {}) {
    log.info('WORKERRUNNER_ORDER_SYNC_QUEUE_DINLENMEYE', `Sipariş kuyrukları dinlenmeye başlandı: ${[LEGACY_ORDER_QUEUE, ...ORDER_QUEUE_NAMES].join(', ')}`);

    // [ADR-0020 Aşama A] Eski kuyruk eşzamanlılığı tek çözümleyiciden (5).
    const legacy = startOne(LEGACY_ORDER_QUEUE, getSetting<number>('order.workerConcurrency'), hooks);
    currentWorkers = [legacy, ...ORDER_QUEUE_NAMES.map(name => startOne(name, concurrencyFor(name), hooks))];
    QueueMetricsCollector.startAutoFlush(); // kova yazımı (60 sn, unref'd, idempotent)
    return legacy;
}

export function getOrderWorkers(): readonly Worker[] {
    return currentWorkers;
}

/**
 * [ADR-0006 Karar 6] Graceful shutdown adım 4: aktif işlerin bitmesini bekleyip BullMQ Worker'ı kapatır.
 * Hiç başlatılmadıysa (ör. `APP_ROLE=web`) no-op'tur.
 */
export async function closeOrderWorkerConsumer(): Promise<void> {
    if (!currentWorkers.length) return;
    const workers = currentWorkers;
    currentWorkers = [];
    await Promise.all(workers.map(w => w.close()));
    QueueMetricsCollector.stopAutoFlush();
    await QueueMetricsCollector.flush();
}