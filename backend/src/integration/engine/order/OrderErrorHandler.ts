import { Job, Queue } from 'bullmq';
import { RedisService } from '@services/redis/RedisService';
import { DatabaseManagerInstance } from '@database/index';
import { IDeadLetterQueue, IOrderJobData } from '@interfaces/order';
import { eventLog } from '@platform/core/logger';
import { NotificationService } from '@services/notification/NotificationService';
import { LEGACY_ORDER_QUEUE } from '@integration/contracts/orderQueues';

const log = eventLog('worker', 'OrderErrorHandler');

export enum ErrorSeverity {
    TRANSIENT = 'TRANSIENT',
    FATAL = 'FATAL',
    UNKNOWN = 'UNKNOWN'
}

/** [eslesme-fiyat WP7a, F-04] Art arda bu kadar AUTH hatasında entegrasyon `needsAttention` olur ve iş üretimi durur. */
export const AUTH_FAILURE_THRESHOLD = 3;

export class OrderErrorHandler {
    private readonly QUEUE_NAME = LEGACY_ORDER_QUEUE;
    private _queue?: Queue;

    /** Eski kuyruk yalnız `handleJobFailure(jobId)` (geri uyum) için tembel kurulur. */
    private get queue(): Queue {
        this._queue ??= new Queue(this.QUEUE_NAME, { connection: RedisService.getConnectionConfig() });
        return this._queue;
    }

    /** Geri uyum: QueueEvents yolu (jobId ile). Yeni yol `handleFailedJob` (Worker 'failed' olayı, tek pod). */
    public async handleJobFailure(jobId: string, failedReason: string): Promise<void> {
        try {
            const job = await Job.fromId(this.queue, jobId);

            if (!job) {
                log.warn('ORDERERRORHANDLER_JOB_REDIS_TE_BULUNAMADI', `Job ${jobId} Redis'te bulunamadı.`);
                return;
            }
            await this.handleFailedJob(job, failedReason);
        } catch (error) {
            log.error('ORDERERRORHANDLER_HATA_ISLEME_SURECINDE_KRITIK', `Hata işleme sürecinde kritik sorun (Job: ${jobId}):`, { err: error });
        }
    }

    /**
     * [eslesme-fiyat WP7a, F-04] Worker 'failed' olayından (YALNIZ işi işleyen pod; QueueEvents her pod'da tetiklenirdi → çift DLQ).
     * AUTH ise ardışık sayaç artar; eşikte entegrasyon `needsAttention` + INTEGRATION_AUTH_FAILED bildirimi (üretici o entegrasyonu atlar).
     */
    public async handleFailedJob(job: Job | undefined, failure: string | Error): Promise<void> {
        const failedReason = typeof failure === 'string' ? failure : (failure?.message ?? String(failure));
        if (!job) return;
        const jobId = String(job.id);
        try {
            if (this.errorCodeOf(failedReason) === 'AUTH') await this.recordAuthFailure(job);

            const jobData = job.data as IOrderJobData;
            log.info('ORDERERRORHANDLER_HATA_ANALIZI_JOB_CLIENT', `Hata Analizi -> Job: ${jobId}, Client: ${jobData.clientId}`);

            const severity = this.categorizeError(failedReason);

            if (severity === ErrorSeverity.FATAL) {
                log.error('ORDERERRORHANDLER_FATAL_HATA_RETRY_IPTAL', `FATAL HATA. Retry iptal. -> Job: ${jobId}`);
                // Tip zorlaması: 'FATAL_ERROR' literal olarak gönderiliyor
                await this.moveToDLQ(job, failedReason, 'FATAL_ERROR');
            }
            else if (job.attemptsMade >= (job.opts.attempts || 1)) {
                log.error('ORDERERRORHANDLER_TUM_RETRY_HAKLARI_TUKENDI', `Tüm retry hakları tükendi. -> Job: ${jobId}`);
                await this.moveToDLQ(job, failedReason, 'MAX_RETRIES_EXCEEDED');
            }
            else {
                log.info('ORDERERRORHANDLER_GECICI_HATA_BACKOFF_BEKLENIYOR', `Geçici hata. Backoff bekleniyor. -> Job: ${jobId}`);
            }

        } catch (error) {
            log.error('ORDERERRORHANDLER_HATA_ISLEME_SURECINDE_KRITIK', `Hata işleme sürecinde kritik sorun (Job: ${jobId}):`, { err: error });
        }
    }

    /** [WP7a] Başarılı işte AUTH sayacı sıfırlanır (yalnız sayaç > 0 iken yazar). */
    public async handleCompletedJob(job: Job | undefined): Promise<void> {
        const data = job?.data as IOrderJobData | undefined;
        if (!data?.clientId || !data?.integrationCode) return;
        try {
            const appDB = await DatabaseManagerInstance.getApplicationDB();
            await appDB.getClientModel().updateOne(
                { clientId: Number(data.clientId), integrations: { $elemMatch: { integrationCode: data.integrationCode, authFailureCount: { $gt: 0 } } } },
                { $set: { 'integrations.$.authFailureCount': 0 } },
            );
        } catch (err) {
            log.error('ORDERERRORHANDLER_AUTH_SAYAC_SIFIRLAMA_HATASI', 'AUTH sayacı sıfırlanamadı (best-effort).', { err });
        }
    }

    private errorCodeOf(message: string): string | undefined {
        return /^\[([A-Z_]+)\]/.exec(String(message || ''))?.[1];
    }

    /** Ardışık AUTH sayacı (atomik $inc); eşiğe ilk ulaşan çağrı `needsAttention` yazar ve bildirir. */
    private async recordAuthFailure(job: Job): Promise<void> {
        const data = job.data as IOrderJobData;
        const clientId = Number(data?.clientId);
        if (!clientId || !data?.integrationCode) return;
        try {
            const appDB = await DatabaseManagerInstance.getApplicationDB();
            const clientModel = appDB.getClientModel();
            const updated: any = await clientModel.findOneAndUpdate(
                { clientId, 'integrations.integrationCode': data.integrationCode },
                { $inc: { 'integrations.$.authFailureCount': 1 } },
                { new: true, projection: { integrations: 1 } },
            ).lean();
            const integ = (updated?.integrations || []).find((i: any) => i.integrationCode === data.integrationCode);
            const count = Number(integ?.authFailureCount ?? 0);
            if (count < AUTH_FAILURE_THRESHOLD || integ?.needsAttention) return;
            const res: any = await clientModel.updateOne(
                { clientId, integrations: { $elemMatch: { integrationCode: data.integrationCode, needsAttention: { $exists: false } } } },
                { $set: { 'integrations.$.needsAttention': { reason: 'AUTH', since: new Date(), failures: count } } },
            );
            if (!res?.modifiedCount) return; // başka pod/iş önce yazdı
            log.warn('ORDERERRORHANDLER_AUTH_DURAKLATILDI', `Art arda ${count} AUTH hatası: entegrasyon "dikkat gerekiyor" işaretlendi, iş üretimi durdu.`, { tenantId: clientId, integrationCode: data.integrationCode });
            await NotificationService.notify('INTEGRATION_AUTH_FAILED', clientId, { integ: data.integrationCode });
        } catch (err) {
            log.error('ORDERERRORHANDLER_AUTH_SAYAC_HATASI', 'AUTH sayacı güncellenemedi (best-effort).', { err });
        }
    }

    /**
     * IntegrationError'lar mesajlarını `[CODE] ...` öneki ile fırlatır (bkz. integration/modules/common/IntegrationError.ts).
     * BullMQ `QueueEvents.on('failed', ...)` yalnızca STRING `failedReason` taşıdığı için (Redis'e
     * serileştirilirken `.code`/`.retryable` alanları kaybolur) code bilgisini bu şekilde geri kazanırız.
     * [ADR-0006 adım 5] Bu, alttaki metin eşleştirmesinden ÖNCELİKLİDİR (metin eşleştirmesi clientId=401
     * gibi durumlarda yanlış sınıflama yapabiliyordu — ADR'de anılan bulgu). IntegrationError kaynaklı
     * olmayan (etiketsiz) hatalar için eski metin eşleştirmesine DÜŞÜLÜR (geriye uyumlu).
     */
    private categorizeErrorByIntegrationErrorCode(errorMessage: string): ErrorSeverity | undefined {
        const match = /^\[(AUTH|RATE_LIMITED|UNAVAILABLE|VALIDATION|NOT_FOUND|NOT_SUPPORTED|UNKNOWN_OUTCOME|INTERNAL)\]/.exec(errorMessage);
        if (!match) return undefined;
        switch (match[1]) {
            case 'AUTH':
            case 'VALIDATION':
            case 'NOT_FOUND':
            case 'NOT_SUPPORTED':
                return ErrorSeverity.FATAL;
            case 'RATE_LIMITED':
            case 'UNAVAILABLE':
            case 'UNKNOWN_OUTCOME':
                return ErrorSeverity.TRANSIENT;
            default: // INTERNAL: belirsiz, eski metin eşleştirmesine düş
                return undefined;
        }
    }

    private categorizeError(errorMessage: string): ErrorSeverity {
        const byCode = this.categorizeErrorByIntegrationErrorCode(errorMessage);
        if (byCode !== undefined) return byCode;

        const lowerCaseError = errorMessage.toLowerCase();
        if (
            lowerCaseError.includes('unauthorized') ||
            lowerCaseError.includes('invalid credentials') ||
            lowerCaseError.includes('401') ||
            lowerCaseError.includes('forbidden') ||
            lowerCaseError.includes('validation')
        ) {
            return ErrorSeverity.FATAL;
        }

        if (
            lowerCaseError.includes('rate limit') ||
            lowerCaseError.includes('429') ||
            lowerCaseError.includes('timeout') ||
            lowerCaseError.includes('econnreset') ||
            lowerCaseError.includes('socket hang up') ||
            lowerCaseError.includes('502') ||
            lowerCaseError.includes('503') ||
            lowerCaseError.includes('504')
        ) {
            return ErrorSeverity.TRANSIENT;
        }

        return ErrorSeverity.UNKNOWN;
    }

    private async moveToDLQ(
        job: Job,
        reason: string,
        dlqType: 'FATAL_ERROR' | 'MAX_RETRIES_EXCEEDED' // Parametre tipi kısıtlandı
    ): Promise<void> {
        try {
            const appDB = await DatabaseManagerInstance.getApplicationDB();
            const dlqCollection = appDB.getDeadLetterQueueModel();
            const jobData = job.data as IOrderJobData;

            // Hata Giderimi: Partial kullanarak veya tek tek cast ederek atama yapıyoruz
            const dlqRecord: Partial<IDeadLetterQueue> = {
                originalJobId: job.id!, // job.id'nin undefined olmadığını garanti ediyoruz (!)
                queueName: job.queueName || this.QUEUE_NAME,
                clientId: jobData.clientId,
                integrationCode: jobData.integrationCode,
                jobData: jobData,
                failedReason: reason,
                dlqType: dlqType,
                failedAt: new Date(),
                status: 'PENDING_MANUAL_REVIEW'
            };

            // insertOne genellikle any veya Partial bekler, tip güvenliği için cast edilebilir
            // [WP7a, F-04 / göç 0029] `originalJobId` tekil: aynı iş ikinci kez yazılırsa (yarış/yeniden teslim) E11000 → zaten kayıtlı.
            try {
                await dlqCollection.insertOne(dlqRecord as IDeadLetterQueue);
            } catch (e: any) {
                if (e?.code !== 11000) throw e;
                log.info('ORDERERRORHANDLER_DLQ_ZATEN_KAYITLI', `Job ${job.id} DLQ'da zaten kayıtlı (tekil indeks).`);
            }

            log.info('ORDERERRORHANDLER_JOB_MONGODB_DLQ_YA', `Job ${job.id} MongoDB DLQ'ya taşındı.`);

            await job.remove();
            log.info('ORDERERRORHANDLER_JOB_REDIS_TEN_SILINDI', `Job ${job.id} Redis'ten silindi.`);

            this.notifyOpsTeam(dlqRecord);

        } catch (err) {
            log.error('ORDERERRORHANDLER_DLQ_SURECI_BASARISIZ_JOB', `DLQ süreci BAŞARISIZ (Job: ${job?.id}):`, { err });
        }
    }

    private notifyOpsTeam(dlqRecord: any): void {
        // Opsiyonel: Slack/Sentry entegrasyonu
    }
}