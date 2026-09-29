// ADR-0017 Karar 3 (`JobRunRegistry`): `JobState` (iş başına 1 doküman) yazımı + `JobRuns` (yalnız anlamlı
// turlar + saatte en az bir) geçmişi + okuma-anında stale/hung/never-ran hesaplaması (panel/alarm bu ADR'nin
// kapsamı DIŞINDA -- bu dosya yalnızca saf hesaplama fonksiyonunu sağlar, ADR-0017 Aşama D'de kullanılacak).
import { JobDefinition, JobOutcome, JobScope, JobStatus, RunType, Trigger } from './types';

export interface JobStateDoc {
    name: string;
    runType?: RunType;
    scope?: JobScope;
    lastStartedAt?: Date | null;
    lastFinishedAt?: Date | null;
    lastSuccessAt?: Date | null;
    lastStatus?: JobStatus | null;
    lastDurationMs?: number | null;
    lastCounts?: unknown;
    lastError?: { code?: string; message?: string } | null;
    consecutiveFailures?: number;
    runningSince?: Date | null;
    heartbeatAt?: Date | null;
    pod?: string | null;
    expectedIntervalMs?: number | null;
}

export interface JobStateModel {
    findOneAndUpdate(filter: any, update: any, options: any): Promise<JobStateDoc | null>;
    findOne(filter: any): Promise<JobStateDoc | null>;
}

export interface JobRunModel {
    create(doc: Record<string, unknown>): Promise<unknown>;
}

const MAX_ERROR_MESSAGE_CHARS = 500;
const MAX_OUTPUT_SUMMARY_BYTES = 2048;

/** Ham hatayı ADR-0017 sözleşmesine indirger: `{code, message}`, mesaj <=500 karakter, sır SIZDIRMAZ (yalnız mesaj metni). */
export function toRedactedError(err: unknown): { code?: string; message: string } {
    const anyErr = err as any;
    const message = String(anyErr?.message ?? err ?? 'bilinmeyen hata').slice(0, MAX_ERROR_MESSAGE_CHARS);
    const code = typeof anyErr?.code === 'string' ? anyErr.code : undefined;
    return { code, message };
}

/** `outputSummary` <= 2 KB'a kesilir (ADR-0017 Karar 3); JSON'a sığmıyorsa `{truncated:true}` ile özetlenir. */
export function truncateOutputSummary(outcome: JobOutcome): unknown {
    let json: string;
    try { json = JSON.stringify(outcome); } catch { return { note: 'serialize_failed' }; }
    if (Buffer.byteLength(json, 'utf8') <= MAX_OUTPUT_SUMMARY_BYTES) return outcome;
    return { truncated: true, preview: json.slice(0, MAX_OUTPUT_SUMMARY_BYTES) };
}

export function deriveStatus(outcome: JobOutcome): JobStatus {
    if (outcome.skipped) return 'skipped';
    if ((outcome.failed ?? 0) > 0) return 'partial';
    return 'ok';
}

export function skippedReasonOf(outcome: JobOutcome): string | null {
    return typeof outcome.skipped === 'string' ? outcome.skipped : (outcome.skipped ? 'skipped' : null);
}

export async function markRunning(
    model: JobStateModel,
    def: JobDefinition,
    owner: string,
    pod: string,
    startedAt: Date,
): Promise<void> {
    await model.findOneAndUpdate(
        { name: def.name },
        {
            $set: {
                name: def.name,
                runType: def.runType ?? 'scheduler',
                scope: def.scope ?? { level: 'platform' },
                lastStartedAt: startedAt,
                runningSince: startedAt,
                heartbeatAt: startedAt,
                pod,
                expectedIntervalMs: def.everyMs,
            },
        },
        { new: true, upsert: true },
    );
}

export async function touchHeartbeat(model: JobStateModel, name: string, at: Date): Promise<void> {
    await model.findOneAndUpdate({ name }, { $set: { heartbeatAt: at } }, { new: true, upsert: true });
}

export interface FinishParams {
    status: JobStatus;
    durationMs: number;
    counts: unknown;
    error?: { code?: string; message: string };
    finishedAt: Date;
}

export async function markFinished(model: JobStateModel, name: string, p: FinishParams): Promise<void> {
    const inc: Record<string, number> = {};
    const set: Record<string, unknown> = {
        lastFinishedAt: p.finishedAt,
        lastStatus: p.status,
        lastDurationMs: p.durationMs,
        lastCounts: p.counts,
        lastError: p.error ?? null,
        runningSince: null,
        heartbeatAt: null,
    };
    if (p.status === 'ok' || p.status === 'partial') {
        set.lastSuccessAt = p.finishedAt;
        set.consecutiveFailures = 0;
    } else if (p.status === 'failed') {
        inc.consecutiveFailures = 1;
    }
    const update: Record<string, unknown> = { $set: set };
    if (inc.consecutiveFailures) update.$inc = inc;
    await model.findOneAndUpdate({ name }, update, { new: true, upsert: true });
}

/** Son geçmiş yazımı zamanları -- süreç içi, iş adı başına (saatlik "en az bir kayıt" kuralı için). */
const lastHistoryWriteAt = new Map<string, number>();

export interface HistoryEntryParams {
    def: JobDefinition;
    trigger: Trigger;
    startedAt: Date;
    finishedAt: Date;
    durationMs: number;
    status: JobStatus;
    outcome: JobOutcome;
    error?: { code?: string; message: string };
    corrId: string;
    pod: string;
}

/** ADR-0017 Karar 3: yalnızca anlamlı turlar (başarısız/kısmi/nedenli atlama/`processed>0`) + saatte en az bir. */
export function isHistoryWorthy(p: HistoryEntryParams, now: number = Date.now()): boolean {
    if (p.status === 'failed' || p.status === 'partial') return true;
    if (p.status === 'skipped' && skippedReasonOf(p.outcome)) return true;
    if ((p.outcome.processed ?? 0) > 0) return true;
    const last = lastHistoryWriteAt.get(p.def.name);
    if (last === undefined || now - last >= 60 * 60 * 1000) return true;
    return false;
}

export async function writeHistoryIfMeaningful(model: JobRunModel, p: HistoryEntryParams): Promise<boolean> {
    const now = p.finishedAt.getTime();
    if (!isHistoryWorthy(p, now)) return false;
    await model.create({
        name: p.def.name,
        runType: p.def.runType ?? 'scheduler',
        scope: p.def.scope ?? { level: 'platform' },
        trigger: p.trigger,
        startedAt: p.startedAt,
        finishedAt: p.finishedAt,
        durationMs: p.durationMs,
        status: p.status,
        counts: truncateOutputSummary(p.outcome),
        skippedReason: skippedReasonOf(p.outcome),
        outputSummary: truncateOutputSummary(p.outcome),
        error: p.error ?? null,
        corrId: p.corrId,
        pod: p.pod,
        budget: p.def.budget ?? null,
    });
    lastHistoryWriteAt.set(p.def.name, now);
    return true;
}

/** Yalnız testler için: saatlik "en az bir kayıt" durumunu sıfırlar. */
export function resetHistoryThrottleForTests(): void {
    lastHistoryWriteAt.clear();
}

export type DerivedHealth = 'ok' | 'stale' | 'hung' | 'never-ran' | 'unknown';

export interface DeriveHealthOptions {
    now: Date;
    expectedIntervalMs: number;
    maxDurationMs: number;
    /** Günlük/saatlik gibi uzun aralıklı işlerde +1 saat tolerans (ADR-0017 Karar 3). */
    isDaily?: boolean;
    /** Süreç ne kadar süredir ayakta (`never-ran` yalnız bu, `2 × expectedInterval`'ı aştıysa anlamlıdır). */
    processUptimeMs?: number;
}

/**
 * ADR-0017 Karar 3 formülleri (okuma-anında, panelden bağımsız doğru kalır):
 * - hung: `runningSince` dolu VE (now - heartbeatAt|runningSince) > maxDurationMs.
 * - stale: now - lastFinishedAt > 2×expectedInterval + 60sn (günlük işte +1sa tolerans).
 * - never-ran: kayıt yok VE süreç `2×expectedInterval`'dan uzun süredir ayakta.
 */
export function deriveJobHealth(state: JobStateDoc | null | undefined, opts: DeriveHealthOptions): DerivedHealth {
    const now = opts.now.getTime();

    if (state?.runningSince) {
        const heartbeat = (state.heartbeatAt ?? state.runningSince).getTime();
        if (now - heartbeat > opts.maxDurationMs) return 'hung';
    }

    if (!state?.lastFinishedAt) {
        if (opts.processUptimeMs !== undefined && opts.processUptimeMs > 2 * opts.expectedIntervalMs) return 'never-ran';
        return state?.runningSince ? 'ok' : 'unknown';
    }

    const tolerance = (opts.isDaily ? 60 * 60 * 1000 : 0) + 60 * 1000;
    const staleThreshold = 2 * opts.expectedIntervalMs + tolerance;
    if (now - state.lastFinishedAt.getTime() > staleThreshold) return 'stale';

    return 'ok';
}
