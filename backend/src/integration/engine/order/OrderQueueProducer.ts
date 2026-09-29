import { Queue } from 'bullmq';
import { RedisService } from '@services/redis/RedisService';
import { IOrderJobData, ISourceSyncWindow } from '@interfaces/order';
import orderConfig from './order.config.json';
import { DatabaseManagerInstance } from '@database/index';
import { config } from '@config';
import { EntitlementService } from '@services/billing/EntitlementService';

export class OrderQueueProducer {
    private readonly QUEUE_NAME = 'order-sync-queue';
    private orderQueue: Queue<IOrderJobData>;

    constructor() {
        // BullMQ Queue instance'ını merkezi RedisService üzerinden oluşturuyoruz
        this.orderQueue = new Queue<IOrderJobData>(this.QUEUE_NAME, {
            connection: RedisService.getConnectionConfig(),
            defaultJobOptions: {
                // Hata toleransı (Resilience): Exponential Backoff stratejisi
                attempts: orderConfig.retryLimits.maxAttempts || 5,
                backoff: {
                    type: 'exponential',
                    delay: orderConfig.retryLimits.backoffDelayMs || 2000,
                },
                // [ADR-0005 Karar 3] Bellek yönetimi: ölçüm için zaman damgaları 24 saat tutulur (QueueMetrics
                // dakikalık toplama BullMQ olaylarını okur; anında silinirse `processedOn/finishedOn` kaybolur).
                // Queue (burada) ve Worker (worker-runner.ts) seçenekleri KASITLI olarak tekildir (order.config.json).
                removeOnComplete: orderConfig.memoryManagement.removeOnComplete as any,
                removeOnFail: orderConfig.memoryManagement.removeOnFail as any,
            }
        });
    }

    /**
     * ApplicationDB'den aktif client'ları (dükkanları) tarar ve her bir entegrasyon için Redis'e iş bırakır.
     * [ADR-0005 Karar 2] Redis bağlı değilken (RedisService.isReady() === false) bu tur TAMAMEN ATLANIR:
     * ApplicationDB'ye bile sorulmaz, hiçbir iş eklenmez (log + best-effort metrik, hata FIRLATILMAZ).
     */
    public async scheduleJobs(): Promise<void> {
        if (!RedisService.isReady()) {
            console.warn(`[OrderQueueProducer] Redis bağlı değil (isReady()=false); bu tur ATLANIYOR (ADR-0005 Karar 2).`);
            return;
        }

        try {
            console.log(`[OrderQueueProducer] İş zamanlama döngüsü başlatılıyor...`);

            // DatabaseManager üzerinden ApplicationDB (Merkezi DB) modeline erişiyoruz
            const applicationDB = await DatabaseManagerInstance.getApplicationDB();
            const clientModel = applicationDB.getClientModel();

            // Sadece aktif olan client'ları (dükkanları) çekiyoruz
            const activeClients = await clientModel.find({ status: 'ACTIVE' }).lean();

            if (!activeClients || activeClients.length === 0) {
                console.log(`[OrderQueueProducer] Aktif client bulunamadı. İşlem atlanıyor.`);
                return;
            }

            let jobsAdded = 0;
            const now = new Date();

            // Her bir client için pazar yeri entegrasyonlarını kontrol et
            for (const client of activeClients) {
                // [ADR-0008 §3(b), BAYRAK KORUMALI (`ENTITLEMENT_GUARD_ENABLED`, varsayılan `false`)] Bayrak
                // KAPALIYKEN (varsayılan) bu blok HİÇBİR ŞEY yapmaz -- mevcut davranış birebir korunur. Açıkken:
                // aboneliği `engine` boyutunda erişime kapalı (suspended/canceled-sonrası/expired; `billingExempt`
                // HARİÇ) bir tenant için bu turda YENİ sipariş senkron işi KUYRUĞA ALINMAZ ("tenant'ı kuyruğa
                // almadan ÖNCE", ADR §3 (b)). `client.clientId` (Client şemasında `order` ile AYNI sayısal değer;
                // `TenantProvisioningService.provision()`'da `clientId: order` olarak yazılır) `Subscriptions.clientId`
                // ile aynı anahtar uzayındadır.
                if (config.flags.entitlementGuardEnabled) {
                    const decision = await EntitlementService.checkAccess(Number(client.clientId), 'engine');
                    // Sessizce atlanır (no-console mandalı, quality/baseline.json): bu satır bir hata değildir, günlük
                    // izleme gerekiyorsa `@platform/core/logger` köprüsüne göç ayrı bir iş (ADR-0017 sıcak-yol göçü).
                    if (!decision.allowed) {
                        continue;
                    }
                }

                // Not: Client dökümanı içindeki 'integrations' dizisini veya ilişkili tabloyu kontrol ediyoruz
                // Mimarinize göre client.integrations veya ayrı bir sorgu olabilir.
                // Burada client dökümanı içinde integrations olduğu varsayılmıştır:
                const integrations = client.integrations?.filter((i: any) => i.status === true && (i.type === 'marketplace' || i.type === 'ecommerce')) || [];

                for (const integration of integrations) {
                    if (integration.status != true) continue
                    // Sync Integrity: Son başarılı senkronizasyon tarihi yoksa fallback kullan
                    const lastSync = integration.lastSuccessfulOrderSync || this.getFallbackDate();

                    // [ADR-0005 Karar 8 — Aşama B] Webhook sağlık izleme + polling geri düşüş: webhook
                    // sağlıklıysa sipariş mutabakat aralığı 60 sn'den 5 dk'ya (order.config.json > webhookHealthy)
                    // düşer. "Sağlıklı" işaretli olsa da son 30 dk'da (webhookHealthCheck.detectionWithoutWebhookWindowMs)
                    // webhooksuz YENİ sipariş algılandıysa ("lastOrderDetectedAt" webhook'tan sonra gelmemiş) webhook
                    // "şüpheli" sayılır: bu turdan itibaren 60 sn'ye döner (DB güncellemesi best-effort/fire-and-forget --
                    // diğer imleç yazma çağrılarıyla AYNI desen, bir sonraki turlarda kalıcı hale gelir).
                    const webhookHealth = this.evaluateWebhookHealth(integration, now);
                    if (webhookHealth.downgrade) {
                        clientModel.updateOne(
                            { clientId: client.clientId, 'integrations.integrationCode': integration.integrationCode },
                            { $set: { 'integrations.$.webhookHealthy': false } },
                        ).catch((e: any) => console.error(`[OrderQueueProducer] webhookHealthy düşürme hatası:`, e));
                    }
                    if (webhookHealth.healthy) {
                        const reconciliationIntervalMs = orderConfig.webhookHealthy?.reconciliationIntervalMs || 300000;
                        if ((now.getTime() - lastSync.getTime()) < reconciliationIntervalMs) {
                            // Webhook sağlıklı ve mutabakat aralığı henüz dolmadı: bu turda bu (tenant, entegrasyon)
                            // için iş EKLENMEZ (gerçek zamanlı sync zaten webhook -> enqueueWebhookTriggeredSync
                            // yoluyla ayrı ve bağımsız olarak işleniyor). İade/finans/mesaj gating'i kendi aralıklarına
                            // sahip olduğundan bu turda atlanmaları en fazla birkaç dakikalık ek gecikmedir (ADR kabul edilebilir).
                            continue;
                        }
                    }

                    // [ADR-0005 Karar 7] Tenant'lara yayılmış günlük süpürme saati: Client.order % 24
                    // (aynı sayı `ClientSchema.index({order:1}, {unique:true})` alanı — her tenant için sabit ve tekil).
                    const staggerHour = ((client as any).order ?? client.clientId ?? 0) % 24;

                    const claimSync = this.computeSourceWindow(now, integration.lastClaimSync, integration.lastClaimFullSweepAt, orderConfig.claimSync, staggerHour);
                    const financeSync = this.computeSourceWindow(now, integration.lastFinanceSync, integration.lastFinanceFullSweepAt, orderConfig.financeSync, staggerHour);
                    const messageSync = this.computeSourceWindow(now, integration.lastMessageSync, undefined, orderConfig.messageSync, undefined);

                    const jobData: IOrderJobData = {
                        clientId: client.clientId.toString(), // Tenant yerine Client kullanıldı
                        integrationCode: integration.integrationCode,
                        lastSyncTimestamp: lastSync,
                        isManualTrigger: false,
                        ...(claimSync ? { claimSync } : {}),
                        ...(financeSync ? { financeSync } : {}),
                        ...(messageSync ? { messageSync } : {}),
                    };

                    // IDEMPOTENCY: Aynı client ve pazar yeri için zaman penceresi bazlı benzersiz ID
                    const timeWindow = this.getCurrentTimeWindow();
                    const uniqueJobId = `sync_${client.clientId}_${integration.integrationCode}_${timeWindow}`;

                    await this.orderQueue.add(
                        `fetch-orders-${integration.integrationCode}`,
                        jobData,
                        {
                            jobId: uniqueJobId
                        }
                    );

                    jobsAdded++;
                }
            }

            console.log(`[OrderQueueProducer] Döngü tamamlandı. Toplam ${jobsAdded} adet iş Redis'e bırakıldı.`);

        } catch (error) {
            console.error(`[OrderQueueProducer] İşler zamanlanırken kritik bir hata oluştu:`, error);
        }
    }

    /**
     * [ADR-0005 Karar 8 — Aşama B] `integration.webhookHealthy` DB alanına bakarak bu turdaki polling
     * davranışını belirler. Saf fonksiyon (DB'ye YAZMAZ) -- çağıran (`scheduleJobs`) `downgrade===true` ise
     * best-effort DB güncellemesini kendisi yapar.
     * - `webhookHealthy !== true` (hiç kurulmamış/kullanıcı devre dışı bırakmış/önceden düşürülmüş) -> `healthy:false`.
     * - `webhookHealthy === true` ama son `detectionWithoutWebhookWindowMs` (30 dk) içinde webhook'suz YENİ
     *   sipariş algılandıysa (`lastOrderDetectedAt` var VE `webhookLastReceivedAt` ondan ESKİ/yok) -> şüpheli:
     *   `healthy:false, downgrade:true`.
     * - Aksi halde -> `healthy:true` (mutabakat aralığına, 5 dk, düşürülebilir).
     */
    private evaluateWebhookHealth(integration: any, now: Date): { healthy: boolean; downgrade: boolean } {
        if (integration?.webhookHealthy !== true) {
            return { healthy: false, downgrade: false };
        }

        const lastDetectedMs = integration.lastOrderDetectedAt ? new Date(integration.lastOrderDetectedAt).getTime() : 0;
        if (!lastDetectedMs) {
            return { healthy: true, downgrade: false };
        }

        const detectionWindowMs = orderConfig.webhookHealthCheck?.detectionWithoutWebhookWindowMs || 1800000;
        const detectedRecently = (now.getTime() - lastDetectedMs) <= detectionWindowMs;
        if (!detectedRecently) {
            return { healthy: true, downgrade: false };
        }

        const lastReceivedMs = integration.webhookLastReceivedAt ? new Date(integration.webhookLastReceivedAt).getTime() : 0;
        const webhookArrivedSinceDetection = lastReceivedMs >= lastDetectedMs;
        if (webhookArrivedSinceDetection) {
            return { healthy: true, downgrade: false };
        }

        // Son 30 dk'da webhook'suz YENİ sipariş algılandı -> şüpheli (ADR-0005 Karar 8)
        return { healthy: false, downgrade: true };
    }

    /**
     * [ADR-0005 Karar 8] Trendyol sipariş durumu webhook'u tetiklendiğinde çağrılır (bkz. `WebhookApiManager`).
     * Webhook gövdesi VERİ KAYNAĞI OLARAK KULLANILMAZ; bu metot yalnızca ilgili (tenant, entegrasyon) için
     * order-sync işini HEMEN kuyruğa ekler. `jobId` 10 SANİYELİK bir zaman penceresiyle üretilir (normal
     * zamanlanmış işlerin `sync_...` jobId'siyle -- `getCurrentTimeWindow`, 60 sn pencere -- ÇAKIŞMAZ, farklı
     * önek): aynı tenant×entegrasyon için 10 sn içindeki İKİNCİ webhook çağrısı AYNI jobId'yi üretir ve
     * BullMQ'nun kendi tekilleştirmesine (aynı jobId zaten kuyrukta/işlenmekte) düşer -- ikinci gerçek iş
     * EKLENMEZ. Redis hazır değilse (ADR-0005 Karar 2) iş eklenmez, hata FIRLATILMAZ (log + best-effort).
     */
    public async enqueueWebhookTriggeredSync(
        clientId: number | string,
        integrationCode: string,
        lastSyncTimestamp: Date | string,
    ): Promise<{ jobId: string; skipped: boolean }> {
        if (!RedisService.isReady()) {
            console.warn(`[OrderQueueProducer] Webhook tetiklemesi: Redis bağlı değil (isReady()=false); iş EKLENMEDİ (ADR-0005 Karar 2).`);
            return { jobId: '', skipped: true };
        }

        const WEBHOOK_DEDUPE_WINDOW_MS = 10000; // [ADR-0005 Karar 8] 10 sn tekilleştirme penceresi
        const timeWindow = Math.floor(Date.now() / WEBHOOK_DEDUPE_WINDOW_MS);
        const jobId = `webhook_${clientId}_${integrationCode}_${timeWindow}`;

        const jobData: IOrderJobData = {
            clientId: Number(clientId),
            integrationCode,
            lastSyncTimestamp,
            isManualTrigger: false,
        };

        await this.orderQueue.add(`fetch-orders-${integrationCode}`, jobData, { jobId });
        return { jobId, skipped: false };
    }

    /**
     * [ADR-0005 Karar 7] Bir kaynağın (iade/finans/mesaj) bu turda "sırası gelip gelmediğini" hesaplar.
     * - Günlük tam süpürme (fullSweepIntervalMs varsa): son süpürmeden `fullSweepIntervalMs` geçtiyse VE
     *   şu anki UTC saat `staggerHour`'a eşitse -> tam pencere (fullSweepWindowDays gün) döner.
     * - Aksi halde delta imleç: son cursor'dan `intervalMs` geçtiyse -> `cursor - cursorOverlapMs` (veya hiç
     *   cursor yoksa `fullSweepWindowDays`/1 gün fallback) döner.
     * - Hiçbiri sırası gelmediyse `undefined` (OrderWorker bu kaynağı bu turda ATLAR, dış çağrı yapılmaz).
     */
    private computeSourceWindow(
        now: Date,
        lastCursor: Date | string | undefined,
        lastFullSweepAt: Date | string | undefined,
        cfg: { intervalMs: number; cursorOverlapMs: number; fullSweepIntervalMs?: number; fullSweepWindowDays?: number },
        staggerHour: number | undefined,
    ): ISourceSyncWindow | undefined {
        const nowMs = now.getTime();

        if (cfg.fullSweepIntervalMs && cfg.fullSweepWindowDays && staggerHour !== undefined) {
            const lastSweepMs = lastFullSweepAt ? new Date(lastFullSweepAt).getTime() : 0;
            const sweepDue = (nowMs - lastSweepMs) >= cfg.fullSweepIntervalMs && now.getUTCHours() === staggerHour;
            if (sweepDue) {
                return {
                    due: true,
                    startDate: new Date(nowMs - cfg.fullSweepWindowDays * 24 * 60 * 60 * 1000),
                    endDate: now,
                    isFullSweep: true,
                };
            }
        }

        const lastCursorMs = lastCursor ? new Date(lastCursor).getTime() : 0;
        const deltaDue = !lastCursor || (nowMs - lastCursorMs) >= cfg.intervalMs;
        if (!deltaDue) return undefined;

        const startDate = lastCursor
            ? new Date(lastCursorMs - cfg.cursorOverlapMs)
            : new Date(nowMs - (cfg.fullSweepWindowDays ?? 1) * 24 * 60 * 60 * 1000);

        return { due: true, startDate, endDate: now, isFullSweep: false };
    }

    /**
     * ADR-0003 B.8 (adım 5): tenant DELETION_PENDING olduğunda `scheduleJobs()` zaten YENİ iş eklemez
     * (`status: 'ACTIVE'` filtresi). Bu metot, o ana kadar Redis/BullMQ'da bekleyen (henüz işlenmemiş) işleri
     * KALDIRIR — çalışmakta olan (active) bir işe dokunmaz. Gerçek Redis/BullMQ'ya bu metot bağımsız test edilirken
     * dokunulmaz (mock `orderQueue`); yalnızca purge/soft-delete akışından çağrılır.
     */
    public async cancelJobsForClient(clientId: string): Promise<number> {
        const states = ['delayed', 'waiting', 'waiting-children', 'prioritized'] as const;
        let removed = 0;
        for (const state of states) {
            const jobs = await this.orderQueue.getJobs([state as any]);
            for (const job of jobs) {
                if (job && String((job.data as any)?.clientId) === String(clientId)) {
                    await job.remove();
                    removed++;
                }
            }
        }
        return removed;
    }

    /**
     * Hiç senkronizasyon yapılmamışsa varsayılan başlangıç tarihini hesaplar.
     */
    private getFallbackDate(): Date {
        const fallbackDays = orderConfig.defaultSyncFallbackDays || 1;
        const date = new Date();
        date.setDate(date.getDate() - fallbackDays);
        return date;
    }

    /**
     * Her `syncIntervalMs` (ADR-0005 Karar 7: 60 sn) aynı değeri üreten zaman penceresi.
     */
    private getCurrentTimeWindow(): number {
        const syncIntervalMs = orderConfig.syncIntervalMs || 60000;
        return Math.floor(Date.now() / syncIntervalMs);
    }
}
