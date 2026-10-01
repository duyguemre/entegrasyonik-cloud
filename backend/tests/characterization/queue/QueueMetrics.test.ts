/**
 * YENİ (ADR-0005 Karar 4): QueueMetrics koleksiyonu + QueueMetricsCollector.
 * `IntegrationCallMetrics` (ADR-0006) İLE AYNI TEST DESENİ: `setSink` ile gerçek ApplicationDB yerine
 * bellek içi bir alıcı takılır. Gerçek Mongo/Redis/BullMQ YOK.
 *
 * [BULGU] Bu collector BullMQ completed/failed olaylarına (OrderOrchestrator) HENÜZ BAĞLANMADI --
 * bkz. QueueMetricsCollector.ts başındaki not. Bu testler yalnızca collector'ın KENDİ davranışını
 * (bellek içi kova biriktirme, flush, yüzdelik hesabı, best-effort hata yutma) doğrular.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
    DatabaseManagerInstance: { getApplicationDB: jest.fn() },
}));

import { QueueMetricsCollector } from '@services/metrics/QueueMetricsCollector';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { QueueMetricsSchema, QUEUE_METRICS_TTL_SECONDS } from '@database/application/models/QueueMetrics';

let records: any[];

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    records = [];
    QueueMetricsCollector.resetForTests();
    QueueMetricsCollector.setSink(async (bucket) => { records.push(bucket); });
});
afterEach(() => {
    jest.restoreAllMocks();
    QueueMetricsCollector.setSink(undefined);
    QueueMetricsCollector.resetForTests();
});

describe('QueueMetricsSchema (ADR-0005 Karar 4)', () => {
    it('TTL 30 gün ("minute" alanı üzerinden)', () => {
        expect(QUEUE_METRICS_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
        const idx = (QueueMetricsSchema as any).indexes().find((i: any) => i[0].minute === 1 && i[1]?.expireAfterSeconds);
        expect(idx[1].expireAfterSeconds).toBe(QUEUE_METRICS_TTL_SECONDS);
    });

    it('{queue, integrationCode, minute} üzerinde benzersiz indeks var (idempotent upsert hedefi)', () => {
        const idx = (QueueMetricsSchema as any).indexes().find((i: any) => i[0].queue === 1 && i[0].integrationCode === 1 && i[0].minute === 1);
        expect(idx[1].unique).toBe(true);
    });

    it('zorunlu alanlar: queue, integrationCode, minute; count/failed/retried varsayılan 0', () => {
        const paths = (QueueMetricsSchema as any).paths;
        expect(paths.queue.isRequired).toBe(true);
        expect(paths.integrationCode.isRequired).toBe(true);
        expect(paths.minute.isRequired).toBe(true);
        expect(paths.count.defaultValue).toBe(0);
        expect(paths.failed.defaultValue).toBe(0);
        expect(paths.retried.defaultValue).toBe(0);
    });
});

describe('QueueMetricsCollector.recordOutcome + flush (bellek içi kova biriktirme)', () => {
    it('[YENİ DAVRANIŞ] aynı queue+integrationCode+dakika için art arda gelen olaylar TEK bir kovada toplanır; flush TEK upsert üretir', async () => {
        const at = new Date('2026-03-01T10:00:15.000Z');
        QueueMetricsCollector.recordOutcome({ queue: 'order-sync-queue', integrationCode: 'trendyol', status: 'completed', waitMs: 100, procMs: 50, at });
        QueueMetricsCollector.recordOutcome({ queue: 'order-sync-queue', integrationCode: 'trendyol', status: 'completed', waitMs: 200, procMs: 60, at: new Date('2026-03-01T10:00:45.000Z') });
        QueueMetricsCollector.recordOutcome({ queue: 'order-sync-queue', integrationCode: 'trendyol', status: 'failed', retried: true, waitMs: 300, procMs: 70, at: new Date('2026-03-01T10:00:59.999Z') });

        expect(QueueMetricsCollector.pendingBucketCount).toBe(1); // aynı dakika (10:00) -> tek kova
        await QueueMetricsCollector.flush();

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            queue: 'order-sync-queue', integrationCode: 'trendyol',
            minute: new Date('2026-03-01T10:00:00.000Z'),
            count: 3, failed: 1, retried: 1,
        });
        expect(QueueMetricsCollector.pendingBucketCount).toBe(0); // flush sonrası temizlenir
    });

    it('[YENİ DAVRANIŞ] farklı dakikalar/queue/integrationCode AYRI kovalara düşer', async () => {
        QueueMetricsCollector.recordOutcome({ queue: 'order-sync-queue', integrationCode: 'trendyol', status: 'completed', at: new Date('2026-03-01T10:00:10.000Z') });
        QueueMetricsCollector.recordOutcome({ queue: 'order-sync-queue', integrationCode: 'trendyol', status: 'completed', at: new Date('2026-03-01T10:01:10.000Z') }); // farklı dakika
        QueueMetricsCollector.recordOutcome({ queue: 'order-sync-queue', integrationCode: 'hepsiburada', status: 'completed', at: new Date('2026-03-01T10:00:10.000Z') }); // farklı entegrasyon
        QueueMetricsCollector.recordOutcome({ queue: 'export', integrationCode: 'trendyol', status: 'completed', at: new Date('2026-03-01T10:00:10.000Z') }); // farklı kuyruk

        expect(QueueMetricsCollector.pendingBucketCount).toBe(4);
        await QueueMetricsCollector.flush();
        expect(records).toHaveLength(4);
    });

    it('[YENİ DAVRANIŞ] p50/p95 yalnızca örnek varsa hesaplanır (yoksa undefined -- şemada opsiyonel)', async () => {
        QueueMetricsCollector.recordOutcome({ queue: 'order-sync-queue', integrationCode: 'trendyol', status: 'completed' }); // waitMs/procMs YOK
        await QueueMetricsCollector.flush();
        expect(records[0].waitMsP50).toBeUndefined();
        expect(records[0].waitMsP95).toBeUndefined();
        expect(records[0].procMsP95).toBeUndefined();
    });

    it('[YENİ DAVRANIŞ] percentile(): 100 örnekte p50~50. eleman, p95~95. eleman (sıralı dizinin en yakın üst indeksi)', () => {
        const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
        expect(QueueMetricsCollector.percentile(values, 0.5)).toBe(50);
        expect(QueueMetricsCollector.percentile(values, 0.95)).toBe(95);
        expect(QueueMetricsCollector.percentile([], 0.5)).toBeUndefined();
    });

    it('[YENİ DAVRANIŞ] sink hata fırlatırsa flush() YİNE DE reddedilmez (best-effort, diğer kovalar yazılmaya devam eder)', async () => {
        QueueMetricsCollector.setSink(async () => { throw new Error('mongo down'); });
        QueueMetricsCollector.recordOutcome({ queue: 'order-sync-queue', integrationCode: 'trendyol', status: 'completed' });
        await expect(QueueMetricsCollector.flush()).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalled();
    });

    it('[YENİ DAVRANIŞ] recordOutcome kendisi ASLA fırlatmaz (örn. geçersiz Date -- sink hiç çağrılmadan sessizce yutulur değil, hatasız devam eder)', () => {
        expect(() => QueueMetricsCollector.recordOutcome({ queue: 'q', integrationCode: 'i', status: 'completed', at: new Date(NaN) })).not.toThrow();
    });

    it('[YENİ DAVRANIŞ] INTEGRATION_METRICS_DISABLED=true VE özel sink YOKSA kova oluşturulmaz', () => {
        QueueMetricsCollector.setSink(undefined);
        const saved = process.env.INTEGRATION_METRICS_DISABLED;
        process.env.INTEGRATION_METRICS_DISABLED = 'true';
        QueueMetricsCollector.recordOutcome({ queue: 'q', integrationCode: 'i', status: 'completed' });
        expect(QueueMetricsCollector.pendingBucketCount).toBe(0);
        process.env.INTEGRATION_METRICS_DISABLED = saved;
    });
});

describe('QueueMetricsCollector.recordRedisSample (ADR-0005 Karar 4 -- Redis INFO örneklemesi)', () => {
    it('[YENİ DAVRANIŞ] queue:"redis", integrationCode:"_system" ile ANINDA (kova biriktirmeden) yazılır', async () => {
        await QueueMetricsCollector.recordRedisSample({ usedMemory: 1000, maxMemory: 4000, cpuPercent: 12.5, connectedClients: 3, opsPerSec: 42 }, new Date('2026-03-01T10:00:00.000Z'));
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({ queue: 'redis', integrationCode: '_system', usedMemory: 1000, maxMemory: 4000, cpuPercent: 12.5, connectedClients: 3, opsPerSec: 42 });
        expect(QueueMetricsCollector.pendingBucketCount).toBe(0); // kova biriktirmez
    });

    it('[YENİ DAVRANIŞ] sink hata fırlatırsa reddetmez (best-effort)', async () => {
        QueueMetricsCollector.setSink(async () => { throw new Error('down'); });
        await expect(QueueMetricsCollector.recordRedisSample({ usedMemory: 1 })).resolves.toBeUndefined();
    });
});

describe('QueueMetricsCollector defaultSink (gerçek sink DEĞİL — ApplicationDB.getQueueMetricsModel mocklu)', () => {
    it('[YENİ DAVRANIŞ] özel sink YOKSA ApplicationDB.getQueueMetricsModel().updateOne çağrılır ($inc + $set + upsert:true)', async () => {
        // Not: global test setup (tests/setup/jwt-env.js) INTEGRATION_METRICS_DISABLED=true YAPAR (özel sink
        // yokken metrikleri varsayılan olarak KAPATIR); defaultSink'i (gerçek ApplicationDB çağrısı YOK, mocklu)
        // gözlemlemek için bu testte GEÇİCİ olarak kaldırıyoruz.
        const savedDisabled = process.env.INTEGRATION_METRICS_DISABLED;
        delete process.env.INTEGRATION_METRICS_DISABLED;
        QueueMetricsCollector.setSink(undefined);
        const updateOne = jest.fn(async () => undefined);
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({ getQueueMetricsModel: () => ({ updateOne }) });

        QueueMetricsCollector.recordOutcome({ queue: 'order-sync-queue', integrationCode: 'trendyol', status: 'completed', waitMs: 10, procMs: 5, at: new Date('2026-03-01T10:00:00.000Z') });
        await QueueMetricsCollector.flush();

        expect(updateOne).toHaveBeenCalledTimes(1);
        const [filter, update, opts] = updateOne.mock.calls[0] as any[];
        expect(filter).toEqual({ queue: 'order-sync-queue', integrationCode: 'trendyol', minute: new Date('2026-03-01T10:00:00.000Z') });
        expect(update.$inc).toEqual({ count: 1, failed: 0, retried: 0 });
        expect(update.$set).toMatchObject({ waitMsP50: 10, waitMsP95: 10, procMsP95: 5 });
        expect(opts).toEqual({ upsert: true });
        process.env.INTEGRATION_METRICS_DISABLED = savedDisabled;
    });
});
