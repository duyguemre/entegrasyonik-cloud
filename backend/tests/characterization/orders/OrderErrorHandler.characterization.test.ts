/**
 * CHARACTERIZATION: OrderErrorHandler (backend/src/integration/engine/order/OrderErrorHandler.ts)
 * `bullmq` (Queue/Job) ve RedisService/DatabaseManagerInstance tamamen mock'lanır: gerçek Redis/Mongo/ağ YOK.
 *
 * ÖNCEKİ DAVRANIŞ (BACKLOG C9/ADR-0006 bulgusu): `categorizeError` yalnızca `failedReason` metnindeki
 * alt dizeleri arar ("401", "429", "timeout" vb.) — IntegrationError'ın gerçek `code`/`retryable`
 * alanlarını GÖRMEZ (BullMQ `QueueEvents.on('failed', ...)` yalnızca string `failedReason` taşır; Redis'e
 * serileştirilirken ek alanlar kaybolur). Örn. mesajı "İstemci 401 numaralı..." gibi bir clientId=401
 * içeren TRANSIENT bir hata FATAL sanılabilir (yanlış sınıflama riski, ADR'de anılan bulgu).
 *
 * [ADR-0006 adım 5] SONRA: IntegrationError artık mesajını `[CODE] ...` öneki ile fırlatır (bkz.
 * IntegrationError.ts). `categorizeError` ÖNCE bu etiketi arar (varsa kod/retryable'a göre KESİN karar
 * verir), yoksa (IntegrationError kaynaklı olmayan eski hatalar) eski metin eşleştirmesine DÜŞER — geriye
 * uyumluluk korunur, mevcut testler DEĞİŞMEDEN yeşil kalır.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const dlqInsertOne = jest.fn(async () => undefined);
jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({})),
    Job: { fromId: jest.fn() },
}));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getConnectionConfig: jest.fn(() => ({ host: 'mock', port: 1 })) } }));
jest.mock('@database/index', () => ({
    DatabaseManagerInstance: {
        getApplicationDB: jest.fn(async () => ({
            getDeadLetterQueueModel: () => ({ insertOne: dlqInsertOne }),
        })),
    },
}));

import { Job } from 'bullmq';
import { OrderErrorHandler } from '@integration/engine/order/OrderErrorHandler';

function makeJob(overrides: Partial<{ attemptsMade: number; attempts: number; clientId: string; integrationCode: string }> = {}) {
    return {
        id: 'job-1',
        data: { clientId: overrides.clientId ?? '5', integrationCode: overrides.integrationCode ?? 'trendyol' },
        attemptsMade: overrides.attemptsMade ?? 0,
        opts: { attempts: overrides.attempts ?? 3 },
        remove: jest.fn(async () => undefined),
    };
}

beforeEach(() => {
    dlqInsertOne.mockClear();
    (Job.fromId as any).mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('OrderErrorHandler.handleJobFailure - [MEVCUT DAVRANIŞ] metin eşleştirmesi (değişmedi, geriye uyumlu)', () => {
    it('"401" içeren mesaj FATAL sayılır -> tükenmemiş denemede bile DLQ\'ya taşınır', async () => {
        const job = makeJob({ attemptsMade: 1, attempts: 5 });
        (Job.fromId as any).mockResolvedValue(job);
        await new OrderErrorHandler().handleJobFailure('job-1', 'HTTP 401 Unauthorized');
        expect(dlqInsertOne).toHaveBeenCalledTimes(1);
        expect((dlqInsertOne.mock.calls[0] as any)[0]).toMatchObject({ dlqType: 'FATAL_ERROR' });
        expect(job.remove).toHaveBeenCalledTimes(1);
    });

    it('"429" (rate limit) içeren mesaj TRANSIENT sayılır -> denemeler tükenmediyse DLQ\'ya taşınmaz', async () => {
        const job = makeJob({ attemptsMade: 1, attempts: 5 });
        (Job.fromId as any).mockResolvedValue(job);
        await new OrderErrorHandler().handleJobFailure('job-1', 'Too many requests 429');
        expect(dlqInsertOne).not.toHaveBeenCalled();
    });

    it('"429" (rate limit) ama denemeler tükendi -> MAX_RETRIES_EXCEEDED ile DLQ\'ya taşınır', async () => {
        const job = makeJob({ attemptsMade: 5, attempts: 5 });
        (Job.fromId as any).mockResolvedValue(job);
        await new OrderErrorHandler().handleJobFailure('job-1', 'Too many requests 429');
        expect((dlqInsertOne.mock.calls[0] as any)[0]).toMatchObject({ dlqType: 'MAX_RETRIES_EXCEEDED' });
    });

    it('bilinmeyen (UNKNOWN) hata metni: denemeler tükenmediyse DLQ\'ya taşınmaz (TRANSIENT ile aynı davranır)', async () => {
        const job = makeJob({ attemptsMade: 0, attempts: 3 });
        (Job.fromId as any).mockResolvedValue(job);
        await new OrderErrorHandler().handleJobFailure('job-1', 'garip bir hata oluştu');
        expect(dlqInsertOne).not.toHaveBeenCalled();
    });
});

describe('OrderErrorHandler.handleJobFailure - [ADR-0006 adım 5] IntegrationError [CODE] etiketi metin eşleştirmesinden ÖNCELİKLİDİR', () => {
    it('[AUTH] etiketli mesaj -> FATAL (tükenmemiş denemede de DLQ\'ya taşınır)', async () => {
        const job = makeJob({ attemptsMade: 0, attempts: 5 });
        (Job.fromId as any).mockResolvedValue(job);
        await new OrderErrorHandler().handleJobFailure('job-1', '[AUTH] Kimlik doğrulama başarısız');
        expect((dlqInsertOne.mock.calls[0] as any)[0]).toMatchObject({ dlqType: 'FATAL_ERROR' });
    });

    it('[UNAVAILABLE] etiketli mesaj -> TRANSIENT (metinde "401" geçse de yanlış FATAL sayılmaz -- ADR bulgusu düzeltildi)', async () => {
        const job = makeJob({ attemptsMade: 1, attempts: 5 });
        (Job.fromId as any).mockResolvedValue(job);
        // Kasıtlı: mesaj içinde clientId=401 gibi görünen bir alt dize var ama code UNAVAILABLE -> TRANSIENT.
        await new OrderErrorHandler().handleJobFailure('job-1', '[UNAVAILABLE] İstemci 401 için devre açık');
        expect(dlqInsertOne).not.toHaveBeenCalled();
    });

    it('[VALIDATION] etiketli mesaj -> FATAL', async () => {
        const job = makeJob({ attemptsMade: 0, attempts: 5 });
        (Job.fromId as any).mockResolvedValue(job);
        await new OrderErrorHandler().handleJobFailure('job-1', '[VALIDATION] Geçersiz gövde');
        expect((dlqInsertOne.mock.calls[0] as any)[0]).toMatchObject({ dlqType: 'FATAL_ERROR' });
    });

    it('[NOT_SUPPORTED] etiketli mesaj -> FATAL (boşa retry yok)', async () => {
        const job = makeJob({ attemptsMade: 0, attempts: 5 });
        (Job.fromId as any).mockResolvedValue(job);
        await new OrderErrorHandler().handleJobFailure('job-1', '[NOT_SUPPORTED] Henüz uygulanmadı');
        expect((dlqInsertOne.mock.calls[0] as any)[0]).toMatchObject({ dlqType: 'FATAL_ERROR' });
    });

    it('[RATE_LIMITED] / [UNKNOWN_OUTCOME] etiketli mesajlar -> TRANSIENT (denemeler tükenmediyse DLQ yok)', async () => {
        const job1 = makeJob({ attemptsMade: 0, attempts: 5 });
        (Job.fromId as any).mockResolvedValue(job1);
        await new OrderErrorHandler().handleJobFailure('job-1', '[RATE_LIMITED] Hız sınırı aşıldı');
        expect(dlqInsertOne).not.toHaveBeenCalled();

        const job2 = makeJob({ attemptsMade: 0, attempts: 5 });
        (Job.fromId as any).mockResolvedValue(job2);
        await new OrderErrorHandler().handleJobFailure('job-1', '[UNKNOWN_OUTCOME] Sonuç belirsiz');
        expect(dlqInsertOne).not.toHaveBeenCalled();
    });
});
