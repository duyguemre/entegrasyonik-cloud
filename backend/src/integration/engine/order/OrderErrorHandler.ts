import { Job, Queue } from 'bullmq';
import { RedisService } from '@services/redis/RedisService';
import { DatabaseManagerInstance } from '@database/index';
import { IDeadLetterQueue, IOrderJobData } from '@interfaces/order';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'OrderErrorHandler');

export enum ErrorSeverity {
    TRANSIENT = 'TRANSIENT',
    FATAL = 'FATAL',
    UNKNOWN = 'UNKNOWN'
}

export class OrderErrorHandler {
    private readonly QUEUE_NAME = 'order-sync-queue';
    private queue: Queue;

    constructor() {
        this.queue = new Queue(this.QUEUE_NAME, {
            connection: RedisService.getConnectionConfig()
        });
    }

    public async handleJobFailure(jobId: string, failedReason: string): Promise<void> {
        try {
            const job = await Job.fromId(this.queue, jobId);

            if (!job) {
                log.warn('ORDERERRORHANDLER_JOB_REDIS_TE_BULUNAMADI', `Job ${jobId} Redis'te bulunamadı.`);
                return;
            }

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
                queueName: this.QUEUE_NAME,
                clientId: jobData.clientId,
                integrationCode: jobData.integrationCode,
                jobData: jobData,
                failedReason: reason,
                dlqType: dlqType,
                failedAt: new Date(),
                status: 'PENDING_MANUAL_REVIEW'
            };

            // insertOne genellikle any veya Partial bekler, tip güvenliği için cast edilebilir
            await dlqCollection.insertOne(dlqRecord as IDeadLetterQueue);

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