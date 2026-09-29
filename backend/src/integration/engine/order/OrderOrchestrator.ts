import { QueueEvents } from 'bullmq';
import { OrderQueueProducer } from './OrderQueueProducer';
import { OrderErrorHandler } from './OrderErrorHandler';
// Not: Aşağıdaki modüller mimarindeki diğer bileşenleri temsil eder
import { RedisService } from '@services/redis/RedisService'; // Yeni merkezi servis
import { startOrderWorkerConsumer } from './worker-runner';
import { getSetting } from '@integration/config/ConfigResolver';

/**
 * OrderWorker'dan dönen verinin tip tanımı
 */
interface IOrderWorkerResult {
    clientId: string;
    marketplace: string;
    processedOrderCount: number;
    insertedIds: string[];
}

export class OrderOrchestrator {
    private readonly QUEUE_NAME = 'order-sync-queue';
    private queueEvents: QueueEvents;
    private producer: OrderQueueProducer;
    private errorHandler: OrderErrorHandler;

    static start() {
        const orchestrator = new OrderOrchestrator();
        orchestrator.start();
    }

    private constructor() {
        this.producer = new OrderQueueProducer();
        this.errorHandler = new OrderErrorHandler();

        // Worker'ları bloke etmemek ve Redis event'lerini dinlemek için QueueEvents kullanıyoruz.
        // Bağlantı konfigürasyonunu doğrudan merkezi RedisService üzerinden alıyoruz.
        this.queueEvents = new QueueEvents(this.QUEUE_NAME, {
            connection: RedisService.getConnectionConfig(),
        });
    }

    /**
     * Orchestrator'ı başlatır: Hem event listener'ları kurar hem de scheduler'ı tetikler.
     */
    public async start(): Promise<void> {
        console.log('[OrderOrchestrator] Başlatılıyor...');

        this.setupEventListeners();
        await this.startScheduler();

        // Singleton/Single-pod yapısında worker'ı burada ayağa kaldırıyoruz.
        // Worker-runner da kendi içinde RedisService.getConnectionConfig() kullanmalı.
        startOrderWorkerConsumer();

        console.log(`[OrderOrchestrator] Başarıyla başlatıldı. Event'ler dinleniyor.`);
    }

    /**
     * CentralDB'den tenant'ları okuyup kuyruğa iş atan Producer'ı zamanlar.
     */
    private async startScheduler(): Promise<void> {
        // [ADR-0020 Aşama A] JSON'dan (`order.config.json`) doğrudan okuma yerine tek çözümleyici; DEĞER AYNI
        // (60000 — ölü `||` yedek 600000, YALNIZ BURADA vardı, artık hiçbir yerde YOK, bkz. ADR K10 ve
        // katalogdaki `knownDriftNote`).
        const syncInterval = getSetting<number>('order.syncIntervalMs');

        // İlk çalışma — [BACKLOG "%0-kapsamlı orkestrasyon sınıfları" madde 2, 2026-09-27 — düzeltme]
        // artık periyodik (setInterval) tekrar çağrılarla AYNI hata işleme deseniyle (bkz.
        // `runScheduleJobsSafely`) korunuyor: reddederse loglanır ama `startScheduler()`/`start()`
        // REDDETMEZ, `startOrderWorkerConsumer()` YİNE DE çağrılır.
        await this.runScheduleJobsSafely();

        // Node.js Event Loop içerisinde periyodik zamanlama
        setInterval(async () => {
            console.log('[OrderOrchestrator] Periyodik sipariş senkronizasyonu tetikleniyor...');
            await this.runScheduleJobsSafely();
        }, syncInterval);
    }

    /**
     * `producer.scheduleJobs()`'u çağırır ve olası hatayı yutar/loglar. İLK (döngü öncesi) çağrı ile
     * periyodik (setInterval içindeki) tekrar çağrılar artık BU ORTAK metot üzerinden AYNI korumayı
     * paylaşır (BACKLOG "%0-kapsamlı orkestrasyon sınıfları" madde 2, 2026-09-27 — önceden yalnızca
     * periyodik çağrı try/catch'liydi, ilk çağrı korumasızdı).
     */
    private async runScheduleJobsSafely(): Promise<void> {
        try {
            await this.producer.scheduleJobs();
        } catch (error) {
            console.error('[OrderOrchestrator] Scheduler çalışırken hata oluştu:', error);
        }
    }

    /**
     * BullMQ global event'lerini dinleyerek başarılı/başarısız işlerin post-processing adımlarını yönetir.
     */
    private setupEventListeners(): void {
        // BAŞARILI İŞLER
        this.queueEvents.on('completed', async ({ jobId, returnvalue }) => {
            try {
                // TypeScript casting hatasını önlemek için 'as unknown as' köprüsü kullanıldı
                const result = returnvalue as unknown as IOrderWorkerResult;

                console.log(`[OrderOrchestrator] Job ${jobId} başarıyla tamamlandı. Client: ${result.clientId}, Sipariş: ${result.processedOrderCount}`);

                if (result.processedOrderCount > 0) {
                    await this.triggerDownstreamWorkflows(result.clientId, result.marketplace, result.insertedIds);
                }
            } catch (error) {
                console.error(`[OrderOrchestrator] Completed event işlenirken hata (Job: ${jobId}):`, error);
            }
        });

        // BAŞARISIZ İŞLER
        this.queueEvents.on('failed', async ({ jobId, failedReason }) => {
            console.warn(`[OrderOrchestrator] Job ${jobId} başarısız oldu. Neden: ${failedReason}`);
            await this.errorHandler.handleJobFailure(jobId, failedReason);
        });

        this.queueEvents.on('error', (error) => {
            console.error('[OrderOrchestrator] QueueEvents Redis bağlantı hatası:', error);
        });
    }

    /**
     * Downstream modülleri tetikler.
     */
    private async triggerDownstreamWorkflows(clientId: string, marketplace: string, orderIds: string[]): Promise<void> {
        console.log(`[OrderOrchestrator] Downstream süreçler tetikleniyor -> Client: ${clientId}`);

        await Promise.all([
            //TODO
            // Downstream operasyonlar buraya eklenebilir (Stok düşme, fatura oluşturma vb.)
            // PostOrderOperations.triggerAllocation(clientId, marketplace, orderIds),
        ]).catch(err => {
            console.error(`[OrderOrchestrator] Downstream tetikleme hatası (Client: ${clientId}):`, err);
        });
    }
}