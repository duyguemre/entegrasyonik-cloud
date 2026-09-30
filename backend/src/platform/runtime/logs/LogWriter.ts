// ADR-0026 WP-LOG L1: LogEvents yazıcısı. TASARIM:
//  - `offer()` SENKRON ve ucuzdur (seviye kapısı + örnekleme + dizi push; DB/JSON/maske YOK) -> olay döngüsünü/istek gecikmesini bekletmez.
//  - Şekillendirme + İKİNCİ maske kontrolü + `insertMany` ARKA PLANDA (zamanlayıcı / setImmediate), toplu (batchSize belge ya da flushIntervalMs).
//  - Kuyruk tavanı `maxQueue`: taşmada YENİ kayıt düşürülür (sayaç `dropped`); warn+ için %10 rezerv. Yazım hatası -> parti düşürülür
//    (yeniden deneme fırtınası yok), sayaç `failed`. Aynı anda tek insert uçuşta (arka basınç).
//  - Kendi hataları logger'a YAZILMAZ (özyineleme) -- yalnız `stats()`; `platform:logs*` modülü kayıtları kalıcılaştırılmaz.
//  - Kapanışta `close()` = kalan kuyruğu (zaman sınırıyla) boşaltır.
import type { LogSinkRecord } from '@platform/core/logger';
import { toLogEventDoc, levelRank, LogEventDoc } from './logRecord';

export type PersistLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogInsertModel {
    insertMany(docs: LogEventDoc[], options: { ordered: false }): Promise<unknown>;
}

export interface LogWriterOptions {
    model: LogInsertModel | (() => Promise<LogInsertModel>);
    /** Kalıcı en düşük seviye (varsayılan warn). */
    level?: PersistLevel;
    /** Kalıcı seviyenin ALTINDAKİ info/debug için örnekleme yüzdesi (0-100; varsayılan 5). */
    sampleInfoPct?: number;
    batchSize?: number;       // 200
    flushIntervalMs?: number; // 1000
    maxQueue?: number;        // 10000
    random?: () => number;    // test için
}

export interface LogWriterStats {
    queued: number; written: number; dropped: number; sampledOut: number; failed: number; batches: number; closed: boolean;
    /** Son yazım/şekillendirme hatasının YALNIZ mesajı (logger'a yazılmaz -- özyineleme; tanı için). */
    lastError?: string;
}

const errMsg = (e: unknown): string => String((e as any)?.message ?? e).slice(0, 200);
const SELF_MODULE_PREFIX = 'platform:logs';

export class LogWriter {
    private readonly level: number;
    private readonly sampleInfo: number;
    private readonly batchSize: number;
    private readonly flushIntervalMs: number;
    private readonly maxQueue: number;
    private readonly errorReserve: number;
    private readonly random: () => number;
    private readonly modelSrc: LogWriterOptions['model'];
    private modelPromise?: Promise<LogInsertModel>;
    private queue: LogSinkRecord[] = [];
    private timer?: ReturnType<typeof setTimeout>;
    private immediate?: ReturnType<typeof setImmediate>;
    private draining?: Promise<void>;
    private closed = false;
    private lastError?: string;
    private s = { written: 0, dropped: 0, sampledOut: 0, failed: 0, batches: 0 };

    constructor(opts: LogWriterOptions) {
        this.modelSrc = opts.model;
        this.level = levelRank(opts.level ?? 'warn');
        this.sampleInfo = Math.min(100, Math.max(0, opts.sampleInfoPct ?? 5)) / 100;
        this.batchSize = Math.max(1, opts.batchSize ?? 200);
        this.flushIntervalMs = Math.max(10, opts.flushIntervalMs ?? 1000);
        this.maxQueue = Math.max(this.batchSize, opts.maxQueue ?? 10_000);
        this.errorReserve = Math.ceil(this.maxQueue * 0.1);
        this.random = opts.random ?? Math.random;
    }

    /** Logger kancası (`setLogSink`). ASLA fırlatmaz, asla beklemez. */
    offer = (rec: LogSinkRecord): void => {
        if (this.closed) return;
        const rank = levelRank(rec.level);
        const mod = rec.bindings.module;
        if (typeof mod === 'string' && mod.startsWith(SELF_MODULE_PREFIX)) return;
        if (rank < this.level) {
            // kalıcı seviyenin altı: yalnız info/debug örneklenir
            if (rank < levelRank('debug') || rank >= levelRank('warn') || this.sampleInfo <= 0 || this.random() >= this.sampleInfo) { this.s.sampledOut++; return; }
        }
        const highPri = rank >= levelRank('warn');
        if (this.queue.length >= this.maxQueue + (highPri ? this.errorReserve : 0)) { this.s.dropped++; return; }
        this.queue.push(rec);
        if (this.queue.length >= this.batchSize) this.scheduleImmediate(); else this.scheduleTimer();
    };

    private scheduleTimer(): void {
        if (this.timer || this.closed) return;
        this.timer = setTimeout(() => { this.timer = undefined; void this.drain(); }, this.flushIntervalMs);
        (this.timer as any).unref?.();
    }

    private scheduleImmediate(): void {
        if (this.immediate) return;
        this.immediate = setImmediate(() => { this.immediate = undefined; void this.drain(); });
        (this.immediate as any).unref?.();
    }

    private getModel(): Promise<LogInsertModel> {
        // Mongoose Model'i de bir FONKSİYONDUR: `insertMany` varlığıyla ayırt edilir.
        if (typeof (this.modelSrc as LogInsertModel).insertMany === 'function') return Promise.resolve(this.modelSrc as LogInsertModel);
        if (!this.modelPromise) {
            this.modelPromise = (this.modelSrc as () => Promise<LogInsertModel>)().catch((e) => { this.modelPromise = undefined; throw e; });
        }
        return this.modelPromise;
    }

    /** Kuyruğu tek uçuşlu döngüyle boşaltır (eşzamanlı çağrılar aynı Promise'i paylaşır). */
    drain(): Promise<void> {
        if (this.draining) return this.draining;
        const run = async (): Promise<void> => {
            while (this.queue.length > 0) {
                const batch = this.queue.splice(0, this.batchSize);
                let docs: LogEventDoc[];
                try { docs = batch.map((r) => toLogEventDoc(r)); } catch (e) { this.s.failed += batch.length; this.lastError = errMsg(e); continue; }
                try {
                    const model = await this.getModel();
                    await model.insertMany(docs, { ordered: false });
                    this.s.written += docs.length; this.s.batches++;
                } catch (e) {
                    this.lastError = errMsg(e);
                    this.s.failed += docs.length; // parti düşer (yeniden deneme fırtınası yok)
                }
            }
        };
        // `draining` ATAMASI, async gövde eşzamanlı biterse (boş kuyruk) `finally`den SONRA yapılırdı ve sonsuza dek takılı kalırdı;
        // bu yüzden temizlik atamadan SONRA (mikro-görev) `.then` ile yapılır.
        const p = run();
        this.draining = p;
        void p.then(() => {
            if (this.draining === p) this.draining = undefined;
            if (this.queue.length > 0 && !this.closed) this.scheduleTimer();
        });
        return p;
    }

    /** Beklemeden kuyruğu yazar (test / kapanış). */
    async flush(): Promise<void> {
        if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
        if (this.immediate) { clearImmediate(this.immediate); this.immediate = undefined; }
        while (this.draining || this.queue.length > 0) await this.drain();
    }

    /** Kapanış: yeni kabul durur, kalan kuyruk `timeoutMs` içinde boşaltılır (aşarsa kalan düşer ve `dropped`e eklenir). */
    async close(timeoutMs = 3000): Promise<void> {
        if (this.closed) return;
        let to: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<void>((res) => { to = setTimeout(res, timeoutMs); (to as any).unref?.(); });
        await Promise.race([this.flush(), deadline]);
        if (to) clearTimeout(to);
        this.closed = true;
        this.s.dropped += this.queue.length;
        this.queue = [];
    }

    stats(): LogWriterStats {
        return { queued: this.queue.length, closed: this.closed, ...this.s, lastError: this.lastError };
    }
}
