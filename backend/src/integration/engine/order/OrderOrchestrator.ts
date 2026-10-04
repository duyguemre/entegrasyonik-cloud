import { Job } from 'bullmq';
import { OrderErrorHandler } from './OrderErrorHandler';
import { startOrderWorkerConsumer } from './worker-runner';
import { eventLog } from '@platform/core/logger';

const log = eventLog('engine', 'OrderOrchestrator');

/**
 * OrderWorker'dan dönen verinin tip tanımı
 */
interface IOrderWorkerResult {
    clientId: string;
    marketplace: string;
    processedOrderCount: number;
    insertedIds: string[];
}

/**
 * [eslesme-fiyat WP7a] Sipariş orkestratörü YALNIZ tüketicileri (kanal kuyrukları + eski kuyruk boşaltma) başlatır.
 *  - ÖNCEKİ: her worker/all pod'da kilitsiz `setInterval(scheduleJobs, 60 sn)` (örtüşebilir, JobState'e yazmaz) ve QueueEvents
 *    'failed' dinleyicisi HER pod'da `handleJobFailure` → aynı iş için pod sayısı kadar DLQ denemesi (F-02, F-04).
 *  - ŞİMDİ: üretici zamanlayıcıda (`bootstrap/schedules.ts` → `order.produce`; dağıtık lease + JobState + backoffice görünür);
 *    başarısız/başarılı iş sonrası işlem Worker olayında (yalnız işi işleyen pod; `OrderErrorHandler.handleFailedJob/handleCompletedJob`).
 */
export class OrderOrchestrator {
    private errorHandler: OrderErrorHandler;

    static start() {
        const orchestrator = new OrderOrchestrator();
        orchestrator.start();
    }

    private constructor() {
        this.errorHandler = new OrderErrorHandler();
    }

    /**
     * Orchestrator'ı başlatır: tüketicileri olay kancalarıyla ayağa kaldırır.
     */
    public async start(): Promise<void> {
        log.info('ORDERORCHESTRATOR_BASLATILIYOR', 'Başlatılıyor...');

        startOrderWorkerConsumer({
            onFailed: (job, err) => {
                log.warn('ORDERORCHESTRATOR_JOB_BASARISIZ_OLDU_NEDEN', `Job ${job?.id} başarısız oldu. Neden: ${err?.message}`);
                return this.errorHandler.handleFailedJob(job, err);
            },
            onCompleted: (job) => this.onCompleted(job),
        });

        log.info('ORDERORCHESTRATOR_BASARIYLA_BASLATILDI_EVENT_LER', 'Başarıyla başlatıldı. Kuyruklar dinleniyor.');
    }

    private async onCompleted(job: Job): Promise<void> {
        try {
            const result = job.returnvalue as unknown as IOrderWorkerResult;
            log.info('ORDERORCHESTRATOR_JOB_BASARIYLA_TAMAMLANDI_CLIENT', `Job ${job.id} başarıyla tamamlandı. Client: ${result?.clientId}, Sipariş: ${result?.processedOrderCount}`);
            await this.errorHandler.handleCompletedJob(job);
            if (result?.processedOrderCount > 0) {
                await this.triggerDownstreamWorkflows(result.clientId, result.marketplace, result.insertedIds);
            }
        } catch (error) {
            log.error('ORDERORCHESTRATOR_COMPLETED_EVENT_ISLENIRKEN_HATA', `Completed event işlenirken hata (Job: ${job?.id}):`, { err: error });
        }
    }

    /**
     * Downstream modülleri tetikler.
     */
    private async triggerDownstreamWorkflows(clientId: string, marketplace: string, orderIds: string[]): Promise<void> {
        log.info('ORDERORCHESTRATOR_DOWNSTREAM_SURECLER_TETIKLENIYOR_CLIEN', `Downstream süreçler tetikleniyor -> Client: ${clientId}`);

        await Promise.all([
            //TODO
            // Downstream operasyonlar buraya eklenebilir (Stok düşme, fatura oluşturma vb.)
            // PostOrderOperations.triggerAllocation(clientId, marketplace, orderIds),
        ]).catch(err => {
            log.error('ORDERORCHESTRATOR_DOWNSTREAM_TETIKLEME_HATASI_CLIENT', `Downstream tetikleme hatası (Client: ${clientId}):`, { err });
        });
    }
}
