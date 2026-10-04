import { Queue } from 'bullmq';
import { RedisService } from '@services/redis/RedisService';
import { IOrderJobData, ISourceSyncWindow } from '@interfaces/order';
import orderConfig from './order.config.json';
import { DatabaseManagerInstance } from '@database/index';
import { config } from '@config';
import { EntitlementService } from '@services/billing/EntitlementService';
import { eventLog } from '@platform/core/logger';
import { getRequestId, newCorrelationId } from '@platform/core/context';
import { allowNewWork, recordIntakeSkip } from '@integration/config/intakeGate';
import type { JobOutcome } from '@platform/runtime/scheduler';
import { LEGACY_ORDER_QUEUE, ORDER_QUEUE_NAMES, orderQueueName, orderDedupId, sliceDelayMs, type OrderSyncKind } from '@integration/contracts/orderQueues';

const log = eventLog('engine', 'OrderQueueProducer');

/** [WP7a, F-02] `Clients` yalnız bu alanlarla okunur (tüm doküman değil). */
const CLIENT_PROJECTION = {
    clientId: 1, order: 1,
    'integrations.integrationCode': 1, 'integrations.status': 1, 'integrations.type': 1,
    'integrations.lastSuccessfulOrderSync': 1, 'integrations.lastClaimSync': 1, 'integrations.lastClaimFullSweepAt': 1,
    'integrations.lastFinanceSync': 1, 'integrations.lastFinanceFullSweepAt': 1, 'integrations.lastMessageSync': 1,
    'integrations.webhookHealthy': 1, 'integrations.lastOrderDetectedAt': 1, 'integrations.webhookLastReceivedAt': 1,
    'integrations.needsAttention': 1,
} as const;
/** Tur başına sayfa boyutu (`_id` imleçli). */
export const PRODUCER_PAGE_SIZE = 500;

type BulkItem = { name: string; data: IOrderJobData; opts: Record<string, any> };

export class OrderQueueProducer {
    /** Kanal kuyrukları tembel kurulur (yapıcı Redis'e bağlanmaz; webhook modülü yüklenirken de kurulur). */
    private readonly queues = new Map<string, Queue<IOrderJobData>>();

    private queue(name: string): Queue<IOrderJobData> {
        let q = this.queues.get(name);
        if (!q) {
            // BullMQ Queue instance'ını merkezi RedisService üzerinden oluşturuyoruz
            q = new Queue<IOrderJobData>(name, {
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
            this.queues.set(name, q);
        }
        return q;
    }

    /**
     * [eslesme-fiyat WP7a] ApplicationDB'den aktif client'ları tarar; her entegrasyon için SIRASI GELEN iş türlerini
     * (orders/claims/messages/finance) kanal kuyruğuna bırakır.
     * - F-02: zamanlayıcı kaydıyla (`bootstrap/schedules.ts` `order.produce`; lease + JobState) koşar — her pod'da `setInterval` değil.
     *   `Clients` projeksiyonlu ve `_id` imleçli sayfalarla okunur; kuyruk başına `addBulk`; tenant dilimi `order % 60` sn gecikme.
     * - F-01: çift+kind başına tekilleştirme (`deduplication.id`): bekleyen/aktif iş varken yenisi EKLENMEZ.
     * - F-04: `needsAttention` işaretli entegrasyon (art arda AUTH) için iş üretilmez (kimlik güncellenince temizlenir).
     * [ADR-0005 Karar 2] Redis bağlı değilken (RedisService.isReady() === false) bu tur TAMAMEN ATLANIR:
     * ApplicationDB'ye bile sorulmaz, hiçbir iş eklenmez (log + best-effort metrik, hata FIRLATILMAZ).
     */
    public async scheduleJobs(): Promise<JobOutcome> {
        if (!RedisService.isReady()) {
            log.warn('ORDERQUEUEPRODUCER_REDIS_NOT_READY', 'Redis bağlı değil (isReady()=false); bu tur ATLANIYOR (ADR-0005 Karar 2).');
            return { skipped: 'redis_unavailable' };
        }

        let jobsAdded = 0;
        let failed = 0;
        try {
            log.info('ORDERQUEUEPRODUCER_ZAMANLAMA_DONGUSU_BASLATILIYOR', 'İş zamanlama döngüsü başlatılıyor...');

            // DatabaseManager üzerinden ApplicationDB (Merkezi DB) modeline erişiyoruz
            const applicationDB = await DatabaseManagerInstance.getApplicationDB();
            const clientModel = applicationDB.getClientModel();
            const now = new Date();

            let lastId: any = undefined;
            let scanned = 0;
            for (;;) {
                const filter: Record<string, any> = { status: 'ACTIVE' };
                if (lastId !== undefined) filter._id = { $gt: lastId };
                const page: any[] = await clientModel.find(filter, CLIENT_PROJECTION).sort({ _id: 1 }).limit(PRODUCER_PAGE_SIZE).lean();
                if (!page || page.length === 0) break;
                scanned += page.length;
                lastId = page[page.length - 1]._id;

                const bulk = new Map<string, BulkItem[]>();
                for (const client of page) {
                    for (const item of await this.jobsForClient(client, now, clientModel)) {
                        const qn = orderQueueName(item.data.integrationCode);
                        (bulk.get(qn) ?? bulk.set(qn, []).get(qn)!).push(item);
                    }
                }
                for (const [qn, items] of bulk) {
                    try {
                        await this.queue(qn).addBulk(items as any);
                        jobsAdded += items.length;
                    } catch (e) {
                        failed += items.length;
                        log.error('ORDERQUEUEPRODUCER_ADDBULK_HATASI', `addBulk hatası (${qn}); bu sayfadaki işler sonraki turda yeniden üretilir.`, { err: e });
                    }
                }
                if (page.length < PRODUCER_PAGE_SIZE) break;
            }

            if (scanned === 0) {
                log.info('ORDERQUEUEPRODUCER_AKTIF_CLIENT_BULUNAMADI_ISLEM', 'Aktif client bulunamadı. İşlem atlanıyor.');
                return { processed: 0, failed: 0, note: 'no_active_clients' };
            }
            log.info('ORDERQUEUEPRODUCER_DONGU_TAMAMLANDI_TOPLAM_ADET', `Döngü tamamlandı. Toplam ${jobsAdded} adet iş Redis'e bırakıldı.`);
            return { processed: jobsAdded, failed, note: `clients=${scanned}` };
        } catch (error) {
            log.error('ORDERQUEUEPRODUCER_ISLER_ZAMANLANIRKEN_KRITIK_HATA', 'İşler zamanlanırken kritik bir hata oluştu:', { err: error });
            return { processed: jobsAdded, failed: failed + 1, note: 'error' };
        }
    }

    /** Bir client için bu turda eklenecek işler (saf hesap + webhook düşürme yan etkisi). */
    private async jobsForClient(client: any, now: Date, clientModel: any): Promise<BulkItem[]> {
        // [ADR-0008 §3(b), BAYRAK KORUMALI (`ENTITLEMENT_GUARD_ENABLED`, varsayılan `false`)] Bayrak
        // KAPALIYKEN (varsayılan) bu blok HİÇBİR ŞEY yapmaz. Açıkken aboneliği `engine` boyutunda erişime kapalı
        // tenant için YENİ sipariş senkron işi KUYRUĞA ALINMAZ ("tenant'ı kuyruğa almadan ÖNCE", ADR §3 (b)).
        if (config.flags.entitlementGuardEnabled) {
            const decision = await EntitlementService.checkAccess(Number(client.clientId), 'engine');
            if (!decision.allowed) return [];
        }

        const out: BulkItem[] = [];
        const integrations = client.integrations?.filter((i: any) => i.status === true && (i.type === 'marketplace' || i.type === 'ecommerce')) || [];
        // [ADR-0005 Karar 7] Tenant'lara yayılmış günlük süpürme saati: Client.order % 24.
        const order = (client as any).order ?? client.clientId ?? 0;
        const staggerHour = order % 24;
        const delay = sliceDelayMs(order);

        for (const integration of integrations) {
            // [ADR-0030 X6] Kill-switch: drain/off iken YENİ sipariş senkron işi kuyruğa alınmaz. İmleç ilerlemez.
            if (!allowNewWork(integration.integrationCode)) { recordIntakeSkip('OrderQueueProducer', integration.integrationCode, 'new'); continue; }
            // [WP7a, F-04] Art arda AUTH hatası → entegrasyon "dikkat gerekiyor"; kimlik güncellenene dek iş üretilmez (her dakika DLQ yok).
            if (integration.needsAttention) continue;

            // [ADR-0005 Karar 8 — Aşama B] Webhook sağlık izleme: şüpheliyse best-effort düşürme (bir sonraki turlarda kalıcı).
            const webhookHealth = this.evaluateWebhookHealth(integration, now);
            if (webhookHealth.downgrade) {
                clientModel.updateOne(
                    { clientId: client.clientId, 'integrations.integrationCode': integration.integrationCode },
                    { $set: { 'integrations.$.webhookHealthy': false } },
                ).catch((e: any) => log.error('ORDERQUEUEPRODUCER_WEBHOOKHEALTHY_DUSURME_HATASI', 'webhookHealthy düşürme hatası:', { err: e }));
            }

            // Sync Integrity: Son başarılı senkronizasyon tarihi yoksa fallback kullan
            const lastSync = integration.lastSuccessfulOrderSync || this.getFallbackDate();
            const base = {
                clientId: client.clientId.toString(), // Tenant yerine Client kullanıldı
                integrationCode: integration.integrationCode,
                lastSyncTimestamp: lastSync,
                isManualTrigger: false,
            };
            const push = (kind: OrderSyncKind, extra: Partial<IOrderJobData> = {}) => out.push({
                name: `${kind}-${integration.integrationCode}`,
                data: { ...base, kind, correlationId: newCorrelationId('ord'), ...extra } as IOrderJobData,
                opts: { deduplication: { id: orderDedupId(client.clientId, integration.integrationCode, kind) }, ...(delay ? { delay } : {}) },
            });

            // [PLAN §3.6] Sipariş: webhook sağlıklı → mutabakat 10 dk, webhook'suz → 5 dk. İmleç `başlangıç − örtüşme` yazıldığı için
            // son koşu ≈ imleç + örtüşme; eksik çekimde imleç ilerlemez → hemen yeniden sırası gelir (kalan kuyruk).
            const orderIntervalMs = webhookHealth.healthy
                ? (orderConfig.webhookHealthy?.reconciliationIntervalMs || 600000)
                : (orderConfig.orderSync.intervalMs || 300000);
            const lastOrderRunMs = integration.lastSuccessfulOrderSync
                ? new Date(integration.lastSuccessfulOrderSync).getTime() + orderConfig.orderSync.cursorOverlapMs
                : 0;
            if (!lastOrderRunMs || (now.getTime() - lastOrderRunMs) >= orderIntervalMs) push('orders');

            const claimSync = this.computeSourceWindow(now, integration.lastClaimSync, integration.lastClaimFullSweepAt, orderConfig.claimSync, staggerHour);
            if (claimSync) push('claims', { claimSync });
            const financeSync = this.computeSourceWindow(now, integration.lastFinanceSync, integration.lastFinanceFullSweepAt, orderConfig.financeSync, staggerHour);
            if (financeSync) push('finance', { financeSync });
            const messageSync = this.computeSourceWindow(now, integration.lastMessageSync, undefined, orderConfig.messageSync, undefined);
            if (messageSync) push('messages', { messageSync });
        }
        return out;
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
     * order-sync işini (kind='orders') HEMEN kanal kuyruğuna ekler. [WP7a] Tekilleştirme `webhook_<c>_<kod>` kimliği ve
     * 10 SANİYE TTL ile (zamanlanmış işlerin `sync_<c>_<kod>_<kind>` kimliğinden AYRI önek): 10 sn içindeki İKİNCİ webhook
     * çağrısı yeni iş EKLEMEZ. Redis hazır değilse (ADR-0005 Karar 2) iş eklenmez, hata FIRLATILMAZ (log + best-effort).
     */
    public async enqueueWebhookTriggeredSync(
        clientId: number | string,
        integrationCode: string,
        lastSyncTimestamp: Date | string,
    ): Promise<{ jobId: string; skipped: boolean }> {
        if (!RedisService.isReady()) {
            log.warn('ORDERQUEUEPRODUCER_WEBHOOK_REDIS_NOT_READY', 'Webhook tetiklemesi: Redis bağlı değil (isReady()=false); iş EKLENMEDİ (ADR-0005 Karar 2).');
            return { jobId: '', skipped: true };
        }

        // [ADR-0030 X6] Kill-switch: webhook tetiklemesi de yeni iş sayılır; atlanır (sonraki periyodik tur yakalar).
        if (!allowNewWork(integrationCode)) {
            recordIntakeSkip('OrderQueueProducer.webhook', integrationCode, 'new');
            return { jobId: '', skipped: true };
        }

        const WEBHOOK_DEDUPE_WINDOW_MS = 10000; // [ADR-0005 Karar 8] 10 sn tekilleştirme penceresi
        const dedupId = `webhook_${clientId}_${integrationCode}`;

        const jobData: IOrderJobData = {
            clientId: Number(clientId),
            integrationCode,
            lastSyncTimestamp,
            isManualTrigger: false,
            kind: 'orders',
            // [F-06] Webhook HTTP isteğinin id'si (varsa) işe taşınır -> istek -> kuyruk -> worker -> adaptör tek iz.
            correlationId: getRequestId() ?? newCorrelationId('wh'),
        };

        // [WP7a] Kanal kuyruğuna; 10 sn TTL'li tekilleştirme (önceki 10 sn pencereli jobId ile aynı anlam, tamamlanan iş kimliği bloklamaz).
        const job = await this.queue(orderQueueName(integrationCode)).add(`orders-${integrationCode}`, jobData, { deduplication: { id: dedupId, ttl: WEBHOOK_DEDUPE_WINDOW_MS } });
        return { jobId: String(job?.id ?? dedupId), skipped: false };
    }

    /**
     * [eslesme-fiyat WP7b, F-10] Kullanıcı tetiklemeli tek tür senkron ("Şimdi senkronize et"). Kapılar (kill-switch, LIVE_READONLY,
     * soğuma) çağıranda (`operations/integrations/syncNow`). Pencere: türün imlecinden (− örtüşme) şimdiye; tam süpürme YAPILMAZ.
     * `jobId` çağırandan (`manual_<c>_<kod>_<kind>_<5 dk pencere>`): aynı pencerede ikinci ekleme yeni iş açmaz. `isManualTrigger: true`.
     * Redis hazır değilse iş eklenmez (`skipped: true`, hata fırlatmaz).
     */
    public async enqueueManualSync(args: { clientId: number; integrationCode: string; kind: OrderSyncKind; jobId: string; integration: any; now: Date }): Promise<{ jobId: string; skipped: boolean }> {
        if (!RedisService.isReady()) return { jobId: '', skipped: true };
        const { clientId, integrationCode, kind, jobId, integration, now } = args;
        const forced = (cfg: any) => ({ ...cfg, intervalMs: 0, fullSweepIntervalMs: undefined });
        const windowOf = (cursor: any, cfg: any) => this.computeSourceWindow(now, cursor, undefined, forced(cfg), undefined);
        const data: IOrderJobData = {
            clientId: Number(clientId),
            integrationCode,
            lastSyncTimestamp: integration?.lastSuccessfulOrderSync || this.getFallbackDate(),
            isManualTrigger: true,
            kind,
            correlationId: getRequestId() ?? newCorrelationId('man'),
            ...(kind === 'claims' ? { claimSync: windowOf(integration?.lastClaimSync, orderConfig.claimSync) } : {}),
            ...(kind === 'finance' ? { financeSync: windowOf(integration?.lastFinanceSync, orderConfig.financeSync) } : {}),
            ...(kind === 'messages' ? { messageSync: windowOf(integration?.lastMessageSync, orderConfig.messageSync) } : {}),
        };
        const job = await this.queue(orderQueueName(integrationCode)).add(`${kind}-${integrationCode}`, data, { jobId });
        return { jobId: String(job?.id ?? jobId), skipped: false };
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
        // [WP7a] Tüm kanal kuyrukları + boşaltılan eski kuyruk.
        for (const name of [LEGACY_ORDER_QUEUE, ...ORDER_QUEUE_NAMES]) {
            for (const state of states) {
                const jobs = await this.queue(name).getJobs([state as any]);
                for (const job of jobs) {
                    if (job && String((job.data as any)?.clientId) === String(clientId)) {
                        await job.remove();
                        removed++;
                    }
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
}
