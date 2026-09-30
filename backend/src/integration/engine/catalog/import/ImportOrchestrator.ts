// catalog/import/ImportOrchestrator.ts
import { integrationEventBus, EVENTS } from '../../IntegrationEventBus';
import Stager from "./Stager";
import Importer from "./Importer";
import config from './import.config.json';
import { SendNotificationEvent, PLATFORM_PROCESS } from '@interfaces/index';
import { NotificationService } from '@services/notification/NotificationService';
import { DatabaseManagerInstance } from '@database/index';
import { IntegrationEngineProvider } from '../provider/IntegrationEngineProvider';
import { StatisticsTracker } from '@services/statistics/StatisticsTracker';
import { getSetting } from '@integration/config/ConfigResolver';
import { eventLog } from '@platform/core/logger';
import { runWithJobContext, getRequestId } from '@platform/core/context';
import { safeErrorCode } from '@operations/notifications/safeError';
import { inFlightBlocked, anyIntakeRestricted, recordIntakeSkip } from '@integration/config/intakeGate';

const log = eventLog('engine', 'ImportOrchestrator');

export class ImportOrchestrator {
    private static activeImportJobIds: Set<string> = new Set();
    private static readonly POD_NAME = process.env.POD_NAME || require('os').hostname();
    private static readonly LOCK_TIMEOUT = config.importOrchestrator?.lockTimeout || 1800000;

    static start(applicationDB: any) {
        StatisticsTracker.init(applicationDB);
        this.startLoop(applicationDB);
    }

    private static async startLoop(applicationDB: any) {
        let wakeUp: (() => void) | null = null;

        integrationEventBus.on(EVENTS.PROCESS_NEXT_IMPORT_JOB, () => {
            if (wakeUp) { wakeUp(); wakeUp = null; }
        });

        while (true) {
            try {
                // [ADR-0030 X6] Kill-switch `off`: o entegrasyonun import işleri seçilmez (kilitsiz kalır, silinmez);
                // global off = hiç seçilmez. `drain`: süren iş biter (import işleri zaten kullanıcı tetiklemeli, yeni iş
                // API'de oluşur; motor tarafında yalnız `off` durdurur).
                const blocked = inFlightBlocked();
                const importFilter: any = {
                    status: { $in: ['WAITING_FOR_FETCH', 'READY_TO_SYNC'] },
                    lockedBy: { $in: [null, this.POD_NAME] },
                    _id: { $nin: Array.from(this.activeImportJobIds) }
                };
                if (blocked.codes.length > 0) importFilter.integrationCode = { $nin: blocked.codes };
                if (blocked.all || blocked.codes.length > 0) recordIntakeSkip('ImportOrchestrator', blocked.all ? undefined : blocked.codes.join(','), 'inflight');
                const job = blocked.all ? null : await applicationDB.getImportJobModel().findOneAndUpdate(
                    importFilter,
                    { $set: { lockedBy: this.POD_NAME, lastCheckedAt: new Date() } },
                    { sort: { updatedAt: 1 }, new: true }
                ).lean();

                if (job) {
                    this.dispatch(job, applicationDB);
                    continue;
                }

                await new Promise<void>((resolve) => {
                    wakeUp = resolve;
                    // [ADR-0020 Aşama A] JSON'dan (`import.config.json`) doğrudan okuma yerine tek çözümleyici;
                    // DEĞER AYNI (30000 — ölü `||` yedek 5000 artık hiçbir yerde YOK, bkz. ADR K10 ve katalogdaki
                    // `knownDriftNote`).
                    const delay = getSetting<number>('import.orchestrator.importLoopDelay');
                    setTimeout(() => { if (wakeUp === resolve) { wakeUp = null; resolve(); } }, anyIntakeRestricted() ? Math.min(delay, 15000) : delay);
                });
            } catch (err: any) {
                log.error('IMPORTORCHESTRATOR_LOOP_ERROR', 'Loop Error:', { err });
                await new Promise(r => setTimeout(r, 10000));
            }
        }
    }

    /** [F-06] İçe aktarma turu: iş başına yeni correlation id + tenant/entegrasyon/işlem bağlamı. */
    private static dispatch(job: any, applicationDB: any) {
        return runWithJobContext(
            { source: 'worker', tenantId: Number(job.clientId), integrationCode: job.integrationCode, operation: job.status === 'WAITING_FOR_FETCH' ? 'import.fetch' : 'import.sync' },
            () => this.dispatchInner(job, applicationDB),
        );
    }

    private static async dispatchInner(job: any, applicationDB: any) {
        const startedAt = new Date();
        const operationType = job.status === 'WAITING_FOR_FETCH' ? 'IMPORT_FETCH' : 'IMPORT_SYNC';
        const jobIdStr = job._id.toString();
        this.activeImportJobIds.add(jobIdStr);

        try {
            if (!job.clientId) {
                log.error('IMPORTORCHESTRATOR_CLIENT_ID_NOT_FOUND', `Client ID not found for Job ID: ${job._id}`);
                return;
            }
            const clientDB = await DatabaseManagerInstance.getClientDB(job.clientId.toString());
            if (!clientDB) {
                log.error('IMPORTORCHESTRATOR_CLIENT_DB_NOT_FOUND', `Client DB not found for Client ID: ${job.clientId}`);
                return;
            }
            const engineProvider = new IntegrationEngineProvider(applicationDB, clientDB)

            const worker = job.status === 'WAITING_FOR_FETCH' ? new Stager(engineProvider) : new Importer(engineProvider);
            await worker.runOnce(jobIdStr);

            const updatedJob = await applicationDB.getImportJobModel().findById(job._id).lean();
            if (updatedJob) {
                if (updatedJob.status !== job.status) integrationEventBus.emit(EVENTS.PROCESS_NEXT_IMPORT_JOB);
                this.sendNotification(updatedJob);

                StatisticsTracker.track({
                    clientId:       Number(job.clientId),
                    integrationCode: job.integrationCode,
                    operationType:  operationType as any,
                    status:         updatedJob.status === 'FAILED' ? 'FAILED'
                                    : (updatedJob.status === 'COMPLETED' || updatedJob.status === 'READY_TO_SYNC') ? 'SUCCESS'
                                    : 'PARTIAL',
                    fetched:        updatedJob.totalCount     || 0,
                    inserted:       operationType === 'IMPORT_SYNC'
                                        ? (updatedJob.processedCount || 0)
                                        : (updatedJob.validCount     || 0),
                    failed:         updatedJob.failedCount    || 0,
                    skipped:        updatedJob.duplicateCount || 0,
                    durationMs:     Date.now() - startedAt.getTime(),
                    startedAt,
                });
            }
        } finally {
            this.activeImportJobIds.delete(jobIdStr);
            await applicationDB.getImportJobModel().updateOne({ _id: job._id }, { $set: { lockedBy: null, updatedAt: new Date() } });
        }
    }

    private static sendNotification(job: any) {
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
            const failed = job.status === 'FAILED';
            const jobId = job._id.toString();
            // [ADR-0029 NB3] Katalog kodu; ham hata mesaji YOK (FAILED icin guvenli hata kodu). Bayrak kapaliyken legacy olay birebir.
            const params = failed
                ? { integ: job.integrationCode, jobId, errorCode: safeErrorCode(job.errorCode), corrId: getRequestId() }
                : { integ: job.integrationCode, jobId, itemCount: Number(job.processedCount ?? job.totalCount ?? 0) };
            void NotificationService.notify(failed ? 'CATALOG_IMPORT_FAILED' : 'CATALOG_IMPORT_COMPLETED', Number(job.clientId), params, {
                idempotencyKey: `import:${jobId}:${job.status}`,
                corrId: getRequestId(),
                module: 'ImportOrchestrator',
                legacy: { event: {
                    clientId: job.clientId.toString(),
                    notificationData: {
                        type: 'IMPORT_READY' as any,
                        mode: PLATFORM_PROCESS.IMPORT,
                        severity: job.status === 'COMPLETED' ? 'success' : 'danger',
                        title: job.status === 'COMPLETED' ? 'Ürün Çekme Tamamlandı' : 'Ürün Çekme Başarısız',
                        message: `${job.integrationCode.toUpperCase()} platformundan ürün çekme işlemi sona erdi.`,
                        metaData: {
                            integrationCode: job.integrationCode, jobId, status: job.status, mode: 'IMPORT',
                            totalCount: job.totalCount,
                            validCount: job.validCount,
                            invalidCount: job.invalidCount,
                            duplicateCount: job.duplicateCount,
                            processedCount: job.processedCount,
                            failedCount: job.failedCount
                        }
                    }
                } as SendNotificationEvent },
            }).catch(() => undefined);
        }
    }

    static async clearZombies(applicationDB: any, isInitial: boolean) {
        const timeoutDate = new Date(Date.now() - this.LOCK_TIMEOUT);
        // [DÜZELTME 2026-09-29, C23 dersi] `ImportJob.lockedBy` şemada `default:null` olduğu için alan HER ZAMAN
        // vardır -- eski `{ $exists: false }` dalı bu yüzden GERÇEK Mongo'da FİİLEN HİÇ EŞLEŞMİYORDU (niyet
        // "kilit sahibi yok" yani `null` idi, `$exists:false` DEĞİL). C23'te aynı yanlış varsayım `mongoLease`de
        // bulunmuş ve `$or:[{alan:null},{alan:{$exists:false}}]` biçimiyle düzeltilmişti (bkz.
        // OversellCompensationJob.claimCancel, @utils/mongoLease.acquireLease); AYNI güvenli-çift-koşul deseni
        // burada da uygulanır (yalnızca `null` de yeterli olurdu ama `$exists:false` legacy/şema-öncesi
        // belgeler için ek güvenlik ağı -- zombi tespitinin asıl birincil yolu zaten aşağıdaki `lastCheckedAt`
        // zaman aşımı dalıdır, bu düzeltme onu DEĞİŞTİRMEZ, yalnızca ikinci dalı ONARIR).
        await applicationDB.getImportJobModel().updateMany(
            {
                status: { $in: ['FETCHING', 'PROCESSING'] },
                $or: isInitial
                    ? [{ lockedBy: this.POD_NAME }, { lastCheckedAt: { $lte: timeoutDate } }]
                    : [{ lockedBy: null }, { lockedBy: { $exists: false } }, { lastCheckedAt: { $lte: timeoutDate } }]
            },
            { $set: { lockedBy: null, status: 'FAILED', updatedAt: new Date() } }
        );
    }
}