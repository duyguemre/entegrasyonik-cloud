import { Worker, Job, UnrecoverableError } from 'bullmq';
import { RedisService } from '@services/redis/RedisService'; // Merkezi Redis servisi
import { OrderWorker } from './OrderWorker';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import orderConfig from './order.config.json';
import { getSetting } from '@integration/config/ConfigResolver';

// [ADR-0006 Karar 6] Graceful shutdown adım 4 (BullMQ worker.close()) için tek Worker referansı.
let currentWorker: Worker | undefined;

/**
 * BullMQ Worker'ı başlatır.
 * 'order-sync-queue' kuyruğuna düşen her bir işi OrderWorker sınıfına paslar.
 */
export function startOrderWorkerConsumer() {
    console.log(`[\x1b[35mWorker Pod\x1b[0m] order-sync-queue dinlenmeye başlandı... (Mode: Single Pod)`);

    const orderSyncConsumer = new Worker(
        'order-sync-queue',
        async (job: Job) => {
            // Her job için yeni bir business logic instance'ı oluşturuyoruz
            const workerLogic = new OrderWorker();

            try {
                // Job.data içindeki clientId, integrationCode ve lastSyncTimestamp bilgilerini işler
                return await workerLogic.process(job.data);
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
        console.error(`[Worker Error] Kritik hata:`, err);
    });

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
}