import { integrationEventBus, EVENTS } from '../../IntegrationEventBus';
import Validator from "./Validator";
import Publisher from "./Publisher";
import Sentinel from "./Sentinel";
import Sync from "./Sync";
import Dispatcher from "./Dispatcher";
import config from './export.config.json';
import os from 'os';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { storageService } from '@services/storage/StorageService';
import { IntegrationEngineProvider } from '../provider/IntegrationEngineProvider';
import { StatisticsTracker } from '@services/statistics/StatisticsTracker';
import { getSetting } from '@integration/config/ConfigResolver';
import { eventLog } from '@platform/core/logger';
import { runWithJobContext } from '@platform/core/context';
import { inFlightBlocked, anyIntakeRestricted, recordIntakeSkip } from '@integration/config/intakeGate';

const log = eventLog('engine', 'ExportOrchestrator');

export class ExportOrchestrator {
    private static readonly POD_NAME = process.env.POD_NAME || os.hostname();
    private static readonly LOCK_TIMEOUT = config.exportOrchestrator?.lockTimeout || 1800000;
    private static activePlatformLocks: Set<string> = new Set();
    private static shouldWakeUp = false; // Bayrak ekledik
    // [ADR-0020 Aşama A] JSON'dan (`export.config.json`) doğrudan okuma yerine tek çözümleyici; DEĞER AYNI
    // (300000 — ölü `||` yedek 60000 artık hiçbir yerde YOK, bkz. ADR K10 ve katalogdaki `knownDriftNote`).
    private static dynamicDelay = getSetting<number>('export.orchestrator.exportLoopDelay');
    static start(applicationDB: any) {
        StatisticsTracker.init(applicationDB);
        this.startLoop(applicationDB);
    }

    private static async startLoop(applicationDB: any) {
        const SignalModel = applicationDB.getExportSignalModel();
        let resolveWakeUp: (() => void) | null = null;

        // Event geldiğinde her zaman bayrağı kaldır ve bekleyen promise varsa çöz
        integrationEventBus.on(EVENTS.PROCESS_NEXT_SIGNAL, () => {
            this.shouldWakeUp = true;
            if (resolveWakeUp) {
                resolveWakeUp();
                resolveWakeUp = null;
            }
        });


        while (true) {
            try {
                // 1. ADIM: DISPATCHER TETİKLEME
                try {
                    const dispatcher = new Dispatcher();
                    await runWithJobContext({ source: 'engine', operation: 'export.dispatch' }, () => dispatcher.run()); // [F-06] iş başına yeni correlation id
                } catch (dispErr: any) {
                    log.error('EXPORTORCHESTRATOR_DISPATCHER_ERROR', 'Dispatcher Error:', { err: dispErr });
                }

                // 2. ADIM: Uygun Sinyal Arama Sorgusu
                const query: any = {
                    lockedBy: null,
                    nextRunAt: { $lte: new Date() },
                    status: { $in: ['PREPARING', 'QUEUED', 'PENDING', 'SENT', 'WAITING'] }
                };

                if (this.activePlatformLocks.size > 0) {
                    const busyFilters = Array.from(this.activePlatformLocks).map(key => {
                        const [cId, iCode] = key.split('-');
                        return { clientId: cId, integrationCode: iCode };
                    });
                    query.$nor = busyFilters;
                }

                // [ADR-0030 X6] Kill-switch `off`: Validator/Publisher/Sentinel/Sync (dış çağrı yapan süren işler) o
                // entegrasyon için seçilmez; sinyaller kilitsiz kalır (silinmez), açılınca devam eder. Global `off` = hiç seçilmez.
                const blocked = inFlightBlocked();
                if (blocked.codes.length > 0) query.integrationCode = { $nin: blocked.codes };
                if (blocked.all || blocked.codes.length > 0) recordIntakeSkip('ExportOrchestrator', blocked.all ? undefined : blocked.codes.join(','), 'inflight');

                // 3. ADIM: ATOMİK GÜNCELLEME
                const lockedSignal = blocked.all ? null : await SignalModel.findOneAndUpdate(
                    query,
                    [
                        {
                            $set: {
                                lockedBy: this.POD_NAME,
                                updatedAt: new Date(),
                                status: {
                                    $cond: {
                                        if: { $eq: ["$status", "QUEUED"] },
                                        then: "PREPARING",
                                        else: "$status"
                                    }
                                }
                            }
                        }
                    ],
                    {
                        sort: { createdAt: 1, sequence: 1 },
                        new: true,
                        lean: true
                    }
                );

                if (lockedSignal) {
                    const rateLimitKey = `${lockedSignal.clientId}-${lockedSignal.integrationCode}`;
                    this.activePlatformLocks.add(rateLimitKey);

                    const workerType = this.getWorkerTypeByStatus(lockedSignal.status);
                    this.dispatch(lockedSignal, workerType, applicationDB, rateLimitKey);
                    this.shouldWakeUp = false
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }

                // EĞER İŞ YOKSA VE BU SÜREÇTE YENİ BİR EVENT GELMEDİYSE BEKLE
                if (!this.shouldWakeUp) {

                    // 1. Veritabanındaki en yakın gelecek işi bul (nextRunAt > now)
                    const nextPotentialSignal = await SignalModel.findOne({
                        lockedBy: null,
                        status: { $in: ['PREPARING', 'QUEUED', 'PENDING', 'SENT', 'WAITING'] },
                        nextRunAt: { $gt: new Date() } // Gelecekteki ilk iş
                    })
                        .sort({ nextRunAt: 1 }) // En yakın tarihli olan
                        .select('nextRunAt')
                        .lean();

                    this.dynamicDelay = getSetting<number>('export.orchestrator.exportLoopDelay');
                    // [ADR-0030 X6] Kısıt varken kısa aralıkla yeniden bak (kapı açılınca <=15 sn'de devam).
                    if (anyIntakeRestricted()) this.dynamicDelay = Math.min(this.dynamicDelay, 15000);

                    if (nextPotentialSignal) {
                        const msUntilNextRun = nextPotentialSignal.nextRunAt.getTime() - Date.now();

                        // Eğer 1 saniyeden az kalmışsa hemen dön, 
                        // çok uzunsa (örn 1 saat) bile max 5 dakika uyu ki sistem sağır kalmasın.
                        this.dynamicDelay = Math.max(1000, Math.min(msUntilNextRun, this.dynamicDelay));
                    }

                    log.debug('EXPORTORCHESTRATOR_NO_ACTIVE_JOBS', `No active jobs. Waiting for ${this.dynamicDelay}ms...`);

                    await new Promise<void>((resolve) => {
                        resolveWakeUp = resolve;
                        setTimeout(() => {
                            if (resolveWakeUp === resolve) {
                                resolveWakeUp = null;
                                resolve();
                            }
                        }, this.dynamicDelay);
                    });

                } else {
                    this.shouldWakeUp = false;
                }

            } catch (err: any) {
                log.error('EXPORTORCHESTRATOR_LOOP_ERROR', 'Loop Error:', { err });
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }

    private static getWorkerTypeByStatus(status: string): string {
        switch (status) {
            case 'PREPARING': return 'Validator';
            case 'PENDING': return 'Publisher';
            case 'SENT': return 'Sentinel';
            case 'WAITING': return 'Sync';
            default: return 'Validator';
        }
    }

    /** [F-06] Her işçi turu KENDİ correlation id'si ve tenant/entegrasyon/işlem bağlamıyla çalışır (adaptör çağrılarına ALS ile akar). */
    private static dispatch(signal: any, workerType: string, applicationDB: any, rateLimitKey: string) {
        return runWithJobContext(
            { source: 'worker', tenantId: Number(signal.clientId), integrationCode: signal.integrationCode, operation: `export.${workerType}` },
            () => this.dispatchInner(signal, workerType, applicationDB, rateLimitKey),
        );
    }

    private static async dispatchInner(signal: any, workerType: string, applicationDB: any, rateLimitKey: string) {
        const startedAt = new Date();
        let workerError: string | undefined;

        try {
            let worker: any;
            const clientDB = await DatabaseManagerInstance.getClientDB(signal.clientId.toString());
            if (!clientDB) {
                log.error('EXPORTORCHESTRATOR_CLIENT_DB_NOT_FOUND', `Client DB not found for Client ID: ${signal.clientId}`);
                return;
            }
            const engineProvider = new IntegrationEngineProvider(applicationDB, clientDB)
            switch (workerType) {
                case 'Validator': worker = new Validator(engineProvider); break;
                case 'Publisher': worker = new Publisher(engineProvider); break;
                case 'Sentinel': worker = new Sentinel(engineProvider); break;
                case 'Sync': worker = new Sync(engineProvider); break;
            }

            if (worker) {
                await worker.runOnce(signal.clientId.toString(), signal.integrationCode, signal.mode, signal.batchId);
            }
        } catch (err: any) {
            workerError = err.message;
            log.error('EXPORTORCHESTRATOR_WORKER_DISPATCH_ERROR', `Worker Dispatch Error (${signal.batchId}):`, { err });
        } finally {
            this.activePlatformLocks.delete(rateLimitKey);

            const updatedSignal = await applicationDB.getExportSignalModel().findOneAndUpdate(
                { _id: signal._id },
                { $set: { lockedBy: null, updatedAt: new Date() } },
                { new: true, lean: true } // Güncel status bilgisini almak için kritik
            );

            StatisticsTracker.track({
                clientId:      Number(signal.clientId),
                integrationCode: signal.integrationCode,
                operationType: 'EXPORT',
                status:        (updatedSignal?.status === 'FAILED' || workerError) ? 'FAILED' : 'SUCCESS',
                fetched:       signal.itemCount || 0,
                operationMode: signal.mode,
                workerType,
                durationMs:    Date.now() - startedAt.getTime(),
                errorMessage:  workerError,
                startedAt,
            });

            // --- KRİTİK ARŞİVLEME ADIMI ---
            if (updatedSignal?.status === 'COMPLETED' || updatedSignal?.status === 'FAILED') {
                await this.archiveAndCleanup(signal);
            }
            // ------------------------------

            integrationEventBus.emit(EVENTS.PROCESS_NEXT_SIGNAL);
        }
    }


    static async clearZombies(applicationDB: any, isInitial: boolean) {
        const timeoutDate = new Date(Date.now() - this.LOCK_TIMEOUT);
        await applicationDB.getExportSignalModel().updateMany(
            {
                lockedBy: isInitial ? this.POD_NAME : { $ne: null },
                updatedAt: { $lte: timeoutDate }
            },
            { $set: { lockedBy: null, updatedAt: new Date() } }
        );
    }

    /**
     * StagedProduct dökümanlarının sadece payload'larını R2'ye paketler.
     * MongoDB'de satırı tutar ama payload'u silip yerine key'i yazar.
     */
    private static async archiveAndCleanup(signal: any) {
        const { batchId, clientId } = signal;

        try {
            if (!clientId) {
                log.error('EXPORTORCHESTRATOR_CLIENT_ID_NOT_FOUND', `Client ID not found for Job ID: ${signal._id}`);
                return;
            }
            const clientDB = await DatabaseManagerInstance.getClientDB(clientId);
            if (!clientDB) {
                throw new Error(`Client DB not found for client ID: ${clientId}`);
            }
            const stagedProductModel = clientDB.getExportStagedProductModel();

            // 1. O Batch'e ait dökümanları çek
            const stagedProducts = await stagedProductModel.find({ batchId }).lean();

            if (stagedProducts && stagedProducts.length > 0) {
                // 2. SADECE PAYLOAD'LARI AYIKLA (Product ID veya Barcode ile eşleştirerek)
                // Örn: { "barcode123": { ...payload... }, "barcode456": { ...payload... } }
                const payloadArchive = stagedProducts.reduce((acc: any, curr: any) => {
                    if (curr.payload || curr.rawData) {
                        acc[curr.barcode || curr._id] = curr.payload || curr.rawData;
                    }
                    return acc;
                }, {});

                // 3. Sadece bu "Payload Paketini" R2'ye yükle

                const uploadResult = await storageService.uploadArchive(
                    clientId,
                    payloadArchive,
                    `exports/${clientId}/${new Date().toISOString().split('T')[0]}`,
                    `batch_${batchId}_payloads`
                );

                if (uploadResult.result) {
                    // 4. BULK WRITE: MongoDB'deki dökümanları "hafiflet"
                    const bulkOps = stagedProducts.map((p: any) => ({
                        updateOne: {
                            filter: { _id: p._id },
                            update: {
                                $set: { archiveKey: uploadResult.key, isArchived: true, archivedAt: new Date() },
                                $unset: { payload: "" } // Dev alanı siliyoruz
                            }
                        }
                    }));

                    await stagedProductModel.bulkWrite(bulkOps);

                    log.info('EXPORTORCHESTRATOR_ITEMS_PAYLOADS_MOVED_R2', `${stagedProducts.length} items' payloads moved to R2.`);
                }
            }
        } catch (err: any) {
            log.error('EXPORTORCHESTRATOR_ARCHIVE_ERROR', 'Arsivleme hatasi (Archive Error)', { err });
        }
    }

}