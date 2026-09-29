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
                const job = await applicationDB.getImportJobModel().findOneAndUpdate(
                    {
                        status: { $in: ['WAITING_FOR_FETCH', 'READY_TO_SYNC'] },
                        lockedBy: { $in: [null, this.POD_NAME] },
                        _id: { $nin: Array.from(this.activeImportJobIds) }
                    },
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
                    setTimeout(() => { if (wakeUp === resolve) { wakeUp = null; resolve(); } }, getSetting<number>('import.orchestrator.importLoopDelay'));
                });
            } catch (err: any) {
                console.error(`[ImportOrchestrator] Loop Error:`, err.message);
                await new Promise(r => setTimeout(r, 10000));
            }
        }
    }

    private static async dispatch(job: any, applicationDB: any) {
        const startedAt = new Date();
        const operationType = job.status === 'WAITING_FOR_FETCH' ? 'IMPORT_FETCH' : 'IMPORT_SYNC';
        const jobIdStr = job._id.toString();
        this.activeImportJobIds.add(jobIdStr);

        try {
            if (!job.clientId) {
                console.error(`[ImportOrchestrator] Client ID not found for Job ID: ${job._id}`);
                return;
            }
            const clientDB = await DatabaseManagerInstance.getClientDB(job.clientId.toString());
            if (!clientDB) {
                console.error(`[ImportOrchestrator] Client DB not found for Client ID: ${job.clientId}`);
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
            NotificationService.sendClientNotification({
                clientId: job.clientId.toString(),
                notificationData: {
                    type: 'IMPORT_READY' as any,
                    mode: PLATFORM_PROCESS.IMPORT,
                    severity: job.status === 'COMPLETED' ? 'success' : 'danger',
                    title: job.status === 'COMPLETED' ? 'Ürün Çekme Tamamlandı' : 'Ürün Çekme Başarısız',
                    message: `${job.integrationCode.toUpperCase()} platformundan ürün çekme işlemi sona erdi.`,
                    metaData: {
                        integrationCode: job.integrationCode, jobId: job._id.toString(), status: job.status, mode: 'IMPORT',
                        totalCount: job.totalCount,
                        validCount: job.validCount,
                        invalidCount: job.invalidCount,
                        duplicateCount: job.duplicateCount,
                        processedCount: job.processedCount,
                        failedCount: job.failedCount
                    }
                }
            } as SendNotificationEvent);
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