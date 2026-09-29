// [ADR-0005 Karar 4] Kuyruk/iş seviyesi dakikalık ölçüm toplayıcı. `IntegrationCallMetrics`
// (backend/src/integration/modules/common/http/IntegrationCallMetrics.ts) İLE AYNI DESEN: best-effort,
// hata YUTULUR ve loglanır, hiçbir çağıranı ASLA bloklamaz/geciktirmez/fırlatmaz. `setSink` testlerde
// gerçek ApplicationDB yerine bellek içi bir alıcı takmak için (gerçek Mongo/Redis YOK).
//
// [BULGU / doğrulanamayan] Bu toplayıcı BullMQ `completed`/`failed` olaylarına (OrderOrchestrator) veya
// katalog hattına (ExportSignals) HENÜZ BAĞLANMADI: `OrderOrchestrator`/`ExportOrchestrator`/`ImportOrchestrator`/
// `IntegrationEngine` MASTER_STATE.md'de "characterization testi olmadan dokunulmaz (kapsam %0)" olarak
// işaretli (ADR-0006 Faz A notu). Bu görev kapsamında o dört sınıf için characterization testi yazmak
// ayrı, büyük bir alt görev olurdu; bu yüzden BAĞLANTI YAPILMADI -- yalnızca toplama altyapısı (bu dosya +
// model) kuruldu ve kendi testleriyle doğrulandı. Takip: önce o sınıflar için char. testi, sonra bu
// collector'ın `recordOutcome`/`recordRedisSample` çağrıları oraya eklenmeli.
import { DatabaseManagerInstance } from '@database/DatabaseManager';

export interface QueueMetricBucketWrite {
    queue: string;
    integrationCode: string;
    minute: Date;
    count: number;
    failed: number;
    retried: number;
    waitMsP50?: number;
    waitMsP95?: number;
    procMsP95?: number;
    usedMemory?: number;
    maxMemory?: number;
    cpuPercent?: number;
    connectedClients?: number;
    opsPerSec?: number;
}

export type QueueMetricsSink = (bucket: QueueMetricBucketWrite) => Promise<void>;

let customSink: QueueMetricsSink | undefined;

async function defaultSink(bucket: QueueMetricBucketWrite): Promise<void> {
    const db = await DatabaseManagerInstance.getApplicationDB();
    const Model = (db as any).getQueueMetricsModel();
    const { queue, integrationCode, minute, count, failed, retried, ...optional } = bucket;
    const setFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(optional)) {
        if (v !== undefined) setFields[k] = v;
    }
    await Model.updateOne(
        { queue, integrationCode, minute },
        {
            $inc: { count, failed, retried },
            ...(Object.keys(setFields).length ? { $set: setFields } : {}),
        },
        { upsert: true }
    );
}

interface InFlightBucket {
    queue: string;
    integrationCode: string;
    minute: Date;
    count: number;
    failed: number;
    retried: number;
    waits: number[];
    procs: number[];
}

/**
 * Bellek içinde dakikalık kovalarda toplar (`recordOutcome`), periyodik olarak (`flush`/`startAutoFlush`)
 * ApplicationDB'ye TEK bir upsert ile yazar. Yüzdelik hesaplama (p50/p95) yalnızca o flush'taki örneklerden
 * yapılır (aynı dakika kovası için birden fazla flush olursa önceki yüzdelikler ÜZERİNE YAZILIR -- kabul
 * edilebilir yaklaşıklık, bu görevin kapsamında kalıcı örnek deposu tutulmaz).
 */
export class QueueMetricsCollector {
    private static buckets = new Map<string, InFlightBucket>();
    private static flushTimer: ReturnType<typeof setInterval> | undefined;

    /** Test/özel depolama için. undefined => varsayılan (ApplicationDB.QueueMetrics). */
    public static setSink(sink: QueueMetricsSink | undefined): void { customSink = sink; }

    private static isDisabled(): boolean {
        return process.env.INTEGRATION_METRICS_DISABLED === 'true' && !customSink;
    }

    public static minuteKey(at: Date): Date {
        return new Date(Math.floor(at.getTime() / 60000) * 60000);
    }

    /**
     * BullMQ `completed`/`failed` olayından ya da katalog hattından (`ExportSignals` geçişleri) çağrılır.
     * ASLA fırlatmaz. `queue`: "order-sync-queue" | "export"; `integrationCode`: entegrasyon kodu.
     */
    public static recordOutcome(input: {
        queue: string;
        integrationCode: string;
        status: 'completed' | 'failed';
        retried?: boolean;
        waitMs?: number;
        procMs?: number;
        at?: Date;
    }): void {
        try {
            if (this.isDisabled()) return;
            const minute = this.minuteKey(input.at ?? new Date());
            const key = `${input.queue}|${input.integrationCode}|${minute.getTime()}`;
            let bucket = this.buckets.get(key);
            if (!bucket) {
                bucket = { queue: input.queue, integrationCode: input.integrationCode, minute, count: 0, failed: 0, retried: 0, waits: [], procs: [] };
                this.buckets.set(key, bucket);
            }
            bucket.count++;
            if (input.status === 'failed') bucket.failed++;
            if (input.retried) bucket.retried++;
            if (typeof input.waitMs === 'number' && input.waitMs >= 0) bucket.waits.push(input.waitMs);
            if (typeof input.procMs === 'number' && input.procMs >= 0) bucket.procs.push(input.procMs);
        } catch (e: any) {
            console.error('[QueueMetricsCollector] recordOutcome hazırlanamadı (best-effort):', e?.message);
        }
    }

    /** [ADR-0005 Karar 4] Redis INFO örneklemesi (60 sn) -- aynı koleksiyona `queue:"redis"` ile, ANINDA yazılır (kova biriktirmez). */
    public static async recordRedisSample(sample: {
        usedMemory?: number; maxMemory?: number; cpuPercent?: number; connectedClients?: number; opsPerSec?: number;
    }, at: Date = new Date()): Promise<void> {
        try {
            if (this.isDisabled()) return;
            const sink = customSink ?? defaultSink;
            await sink({
                queue: 'redis',
                integrationCode: '_system',
                minute: this.minuteKey(at),
                count: 1, failed: 0, retried: 0,
                ...sample,
            });
        } catch (e: any) {
            console.error('[QueueMetricsCollector] Redis örneği yazılamadı (best-effort):', e?.message);
        }
    }

    /** Bekleyen tüm kovaları yazar ve TEMİZLER. Her kova bağımsız yutulur (biri patlarsa diğerleri yazılır). */
    public static async flush(): Promise<void> {
        const entries = Array.from(this.buckets.values());
        this.buckets.clear();
        const sink = customSink ?? defaultSink;
        for (const bucket of entries) {
            try {
                await sink({
                    queue: bucket.queue,
                    integrationCode: bucket.integrationCode,
                    minute: bucket.minute,
                    count: bucket.count,
                    failed: bucket.failed,
                    retried: bucket.retried,
                    waitMsP50: this.percentile(bucket.waits, 0.5),
                    waitMsP95: this.percentile(bucket.waits, 0.95),
                    procMsP95: this.percentile(bucket.procs, 0.95),
                });
            } catch (e: any) {
                console.error('[QueueMetricsCollector] flush yazılamadı (best-effort):', e?.message);
            }
        }
    }

    public static percentile(values: number[], p: number): number | undefined {
        if (!values.length) return undefined;
        const sorted = [...values].sort((a, b) => a - b);
        const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
        return sorted[idx];
    }

    /** Süreç genelinde periyodik flush (varsayılan 60 sn). Zaten çalışıyorsa no-op. */
    public static startAutoFlush(intervalMs = 60000): void {
        if (this.flushTimer) return;
        this.flushTimer = setInterval(() => { this.flush().catch(() => undefined); }, intervalMs);
        (this.flushTimer as any).unref?.();
    }

    public static stopAutoFlush(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
    }

    /** Test yardımcı: bekleyen (henüz flush edilmemiş) kova sayısı. */
    public static get pendingBucketCount(): number {
        return this.buckets.size;
    }

    /** Test yardımcı: testler arası sızıntıyı önlemek için. */
    public static resetForTests(): void {
        this.buckets.clear();
        this.stopAutoFlush();
    }
}
