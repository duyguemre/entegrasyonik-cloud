// ADR-0016 §2.1: tek bir tur için tam yürütme sırası (1 lease → 2 kayıt başlangıcı → 3 iş → 4 kayıt bitişi →
// 5 geçmiş → 6 lease bırak). Süreç-içi örtüşme koruması BU dosyada DEĞİL, `scheduleJob.ts`'dedir (zamanlama
// kaygısı ile yürütme kaygısı ayrılır -- `runJobOnce` DB'siz de (birim testte) tek başına çağrılabilir).
import * as crypto from 'crypto';
import { config } from '@config';
import { logger as rootLogger, Logger } from '@platform/core/logger';
import { getPodIdentity } from '@utils/podIdentity';
import { acquireJobLease, releaseJobLease, JobLeaseModel } from './leaseGate';
import { markRunning, markFinished, touchHeartbeat, writeHistoryIfMeaningful, toRedactedError, deriveStatus, JobStateModel, JobRunModel } from './registry';
import { JobDefinition, JobOutcome, JobStatus, Trigger } from './types';

export interface RunJobDeps {
    leaseModel: JobLeaseModel;
    jobStateModel: JobStateModel;
    jobRunModel: JobRunModel;
    /** Testte deterministik zaman için enjekte edilir; varsayılan `() => new Date()`. */
    now?: () => Date;
    /** Testte sabit kimlik için; varsayılan `getPodIdentity()`. */
    pod?: string;
    logger?: Logger;
    /** ADR-0016 §2.2 kaçış anahtarı (`SCHEDULER_LEASE=off`); verilmezse `config.scheduler.leaseEnabled`. */
    leaseEnabled?: boolean;
}

export interface RunJobResult {
    status: JobStatus | 'lease_denied';
    outcome?: JobOutcome;
    durationMs?: number;
    corrId: string;
}

/** Tek turu ÇALIŞTIRIR (lease → iş → kayıt). Lease alınamazsa işi HİÇ çağırmadan `lease_denied` döner. */
export async function runJobOnce(def: JobDefinition, deps: RunJobDeps, trigger: Trigger): Promise<RunJobResult> {
    const now = deps.now ?? (() => new Date());
    const pod = deps.pod ?? getPodIdentity();
    const runId = crypto.randomUUID();
    const corrId = runId;
    const owner = `${pod}:${runId}`;
    const log = (deps.logger ?? rootLogger).child({ module: `scheduler:${def.name}` });

    const leaseEnabled = deps.leaseEnabled ?? config.scheduler.leaseEnabled;
    const startedAt = now();
    if (leaseEnabled) {
        const leased = await acquireJobLease(deps.leaseModel, def.name, owner, def.maxDurationMs, startedAt);
        if (!leased) {
            log.debug({ job: def.name }, 'lease başka sahipte; bu tur atlanıyor (leased_elsewhere)');
            const finishedAt = now();
            await writeHistoryIfMeaningful(deps.jobRunModel, {
                def, trigger, startedAt, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(),
                status: 'skipped', outcome: { skipped: 'leased_elsewhere' }, corrId, pod,
            });
            return { status: 'lease_denied', corrId };
        }
    }

    await markRunning(deps.jobStateModel, def, owner, pod, startedAt);

    const controller = new AbortController();
    let outcome: JobOutcome;
    let status: JobStatus;
    let errorInfo: { code?: string; message: string } | undefined;

    try {
        outcome = await def.run({
            signal: controller.signal,
            heartbeat: async () => {
                if (leaseEnabled) await acquireJobLease(deps.leaseModel, def.name, owner, def.maxDurationMs, now());
                await touchHeartbeat(deps.jobStateModel, def.name, now());
            },
            logger: log,
            runId,
            corrId,
        });
        status = deriveStatus(outcome);
    } catch (err) {
        errorInfo = toRedactedError(err);
        outcome = { skipped: false };
        status = 'failed';
        log.error({ err, job: def.name }, 'iş turu hata fırlattı (yutuldu, zamanlayıcı çökmez)');
    }

    const finishedAt = now();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    await markFinished(deps.jobStateModel, def.name, { status, durationMs, counts: outcome, error: errorInfo, finishedAt });
    await writeHistoryIfMeaningful(deps.jobRunModel, {
        def, trigger, startedAt, finishedAt, durationMs, status, outcome, error: errorInfo, corrId, pod,
    });
    if (leaseEnabled) await releaseJobLease(deps.leaseModel, def.name, owner);

    return { status, outcome, durationMs, corrId };
}
