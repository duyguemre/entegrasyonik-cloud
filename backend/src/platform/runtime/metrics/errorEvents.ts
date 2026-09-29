// ADR-0017 Karar 2.4 ("mini-Sentry"): hata olayları, parmak izi başına TEK doküman. Aynı fp'nin 10 saniyelik
// (süreç-içi) toplama penceresi içindeki TÜM oluşumları TEK bir Mongo yazımına (count += N) indirgenir --
// taşkında yazma patlaması yok (Karar 2.4: "10 sn toplama sonra $inc upsert"). Bu, `platform/core/logger`'ın
// AYRI 60 sn'lik taşkın denetiminden (floodControl.ts, konsol/pino çıktısını bastırır) BAĞIMSIZDIR: floodControl
// logu bastırır, BU modül DB kaydını (`ErrorEvents`) besler -- ikisi de aynı `fingerprintOf` yardımcısını kullanır
// (tek parmak izi kaynağı), ama farklı amaçlara hizmet eder (Karar 1.5 vs Karar 2.4).
import { fingerprintOf, logger } from '@platform/core/logger';

const log = logger.child({ module: 'platform:errorEvents' });

const AGGREGATION_WINDOW_MS = 10_000;
const MAX_MESSAGE_CHARS = 500;
const MAX_STACK_LINES = 30;

export type ErrorEventSource = 'server' | 'client';

export interface ErrorEventInput {
    source: ErrorEventSource;
    module?: string;
    code?: string;
    integrationCode?: string;
    tenantId?: number;
    /** Redaksiyon ÇAĞIRAN tarafından yapılmış olmalı (server: logger redact; client: clientLog.ts). */
    message: string;
    stack?: string;
    corrId?: string;
    route?: string;
    appVer?: string;
}

export interface ErrorEventSample {
    message: string;
    stack?: string;
    corrId?: string;
    route?: string;
    appVer?: string;
}

function truncateMessage(msg: string): string {
    return msg.length > MAX_MESSAGE_CHARS ? msg.slice(0, MAX_MESSAGE_CHARS) : msg;
}

function truncateStack(stack: string | undefined): string | undefined {
    if (!stack) return undefined;
    const lines = stack.split('\n');
    return lines.length > MAX_STACK_LINES ? lines.slice(0, MAX_STACK_LINES).join('\n') : stack;
}

/** `source::module::code::mesaj-şablonu` (rakamlar `#`'e çevrilir -- `fingerprintOf` ile AYNI şablon kuralı). */
export function fingerprintOfErrorEvent(input: Pick<ErrorEventInput, 'source' | 'module' | 'code' | 'message'>): string {
    return `${input.source}::${fingerprintOf(input.module, input.code, input.message)}`;
}

export interface ErrorEventUpsertOp {
    filter: { fp: string };
    pipeline: Record<string, unknown>[];
}

/**
 * Aggregation-pipeline tarzı update (mongoose/MongoDB 4.2+): `upsert:true` ile YENİ doküman oluşurken TÜM
 * sabit alanlar `$set` içinde AÇIKÇA verilmelidir (pipeline update'lerde filtre eşitlikleri otomatik taşınmaz).
 * Regresyon kuralı (Karar 2.4): önceki `status==='resolved'` ise YENİDEN `'open'`a döner; aksi halde MEVCUT
 * durum korunur (`acknowledged`/`muted` bilinçli admin kararlarını EZMEZ).
 */
export function buildErrorEventUpsertOp(fp: string, input: ErrorEventInput, incCount: number, now: Date): ErrorEventUpsertOp {
    const sample: ErrorEventSample = {
        message: truncateMessage(input.message),
        stack: truncateStack(input.stack),
        corrId: input.corrId,
        route: input.route,
        appVer: input.appVer,
    };
    return {
        filter: { fp },
        pipeline: [
            {
                $set: {
                    fp,
                    source: input.source,
                    module: input.module ?? null,
                    code: input.code ?? null,
                    integrationCode: input.integrationCode ?? null,
                    tenantId: input.tenantId ?? null,
                    count: { $add: [{ $ifNull: ['$count', 0] }, incCount] },
                    firstSeen: { $ifNull: ['$firstSeen', now] },
                    lastSeen: now,
                    sample,
                    status: { $cond: [{ $eq: ['$status', 'resolved'] }, 'open', { $ifNull: ['$status', 'open'] }] },
                },
            },
        ],
    };
}

export interface ErrorEventModel {
    findOneAndUpdate(filter: { fp: string }, pipeline: Record<string, unknown>[], options: { upsert: true }): Promise<unknown>;
}

interface BufferEntry {
    count: number;
    latest: ErrorEventInput;
    timer: ReturnType<typeof setTimeout>;
}

const buffers = new Map<string, BufferEntry>();

async function writeToModel(model: ErrorEventModel, fp: string, entry: BufferEntry): Promise<void> {
    const op = buildErrorEventUpsertOp(fp, entry.latest, entry.count, new Date());
    await model.findOneAndUpdate(op.filter, op.pipeline, { upsert: true });
}

function resolveModel(deps?: { model?: ErrorEventModel }): Promise<ErrorEventModel> {
    if (deps?.model) return Promise.resolve(deps.model);
    return require('./prodDeps').productionErrorEventModel();
}

/**
 * Bir hata olayını kaydeder (fire-and-forget, ASLA fırlatmaz/beklemez). Aynı fp 10 sn içinde tekrar gelirse
 * yalnızca sayaç artar (tek Mongo yazımı pencere sonunda). Testler `deps.model` enjekte edebilir (DB YOK).
 */
export function recordErrorEvent(input: ErrorEventInput, deps?: { model?: ErrorEventModel; windowMs?: number }): void {
    try {
        const fp = fingerprintOfErrorEvent(input);
        const windowMs = deps?.windowMs ?? AGGREGATION_WINDOW_MS;
        const existing = buffers.get(fp);
        if (existing) {
            existing.count += 1;
            existing.latest = input;
            return;
        }
        const entry: BufferEntry = {
            count: 1,
            latest: input,
            timer: setTimeout(() => {
                buffers.delete(fp);
                resolveModel(deps)
                    .then((model) => writeToModel(model, fp, entry))
                    .catch((err) => log.warn({ err, fp }, 'ErrorEvent yazılamadı (best-effort)'));
            }, windowMs),
        };
        if (typeof (entry.timer as any).unref === 'function') (entry.timer as any).unref();
        buffers.set(fp, entry);
    } catch (err) {
        log.warn({ err }, 'recordErrorEvent hazırlanamadı (best-effort)');
    }
}

/** Yalnız testler için: bekleyen tüm pencereleri HEMEN kapatır (zamanlayıcıyı beklemeden). */
export async function flushErrorEventBuffersForTests(deps?: { model?: ErrorEventModel }): Promise<void> {
    const entries = Array.from(buffers.entries());
    buffers.clear();
    for (const [fp, entry] of entries) {
        clearTimeout(entry.timer);
        const model = await resolveModel(deps);
        await writeToModel(model, fp, entry);
    }
}

/** Yalnız testler için: durumu (zamanlayıcılar dahil) tamamen sıfırlar. */
export function resetErrorEventStateForTests(): void {
    for (const entry of buffers.values()) clearTimeout(entry.timer);
    buffers.clear();
}
