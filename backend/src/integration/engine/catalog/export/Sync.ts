import IntegrationFactory from '../../../modules/IntegrationFactory';
import { BaseWorker } from '../../BaseWorker';
import _ from 'lodash';
import { PLATFORM_PROCESS } from '@interfaces/index';
import { IIntegrationEngineProvider } from "../provider/IIntegrationEngineProvider";
import { getPodIdentity } from '@utils/podIdentity';
import { getSetting } from '@integration/config/ConfigResolver';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'Sync');

export default class Sync extends BaseWorker {
    protected readonly workerName = 'Catalog Synchronizer';
    // [ADR-0020 Aşama A] JSON'dan (`export.config.json`) doğrudan okuma yerine tek çözümleyici; DEĞER AYNI (30/1/1
    // — ölü `||` yedekleri 50/14/30 artık hiçbir yerde YOK, bkz. ADR K10 ve katalogdaki `knownDriftNote`).
    private readonly batchSize = getSetting<number>('export.synchronizer.batchSize');
    private readonly waitingTimeoutDays = getSetting<number>('export.synchronizer.waitingTimeoutDays');
    private readonly cooldownMinutes = getSetting<number>('export.synchronizer.cooldownMinutes');
    private integrationCode!: string;
    private clientId!: string;

    constructor(private engineProvider: IIntegrationEngineProvider) {
        super();
    }

    private formatUserMessage(errorMessage: string | string[]): string {
        let message = Array.isArray(errorMessage) ? errorMessage[0] : errorMessage;
        if (!message || typeof message !== 'string') return 'İşlem tamamlandı.';
        return message?.replace(/^(\[.*?\]\s*)+/, '').trim();
    }

    /**
     * Orchestrator tarafından tetiklenen giriş noktası.
     * Revizyon: Tüm WAITING paketlerini birleştirerek işler.
     */
    public async runOnce(clientId: string, integrationCode: string, mode: PLATFORM_PROCESS, initialBatchId: string) {
        this.integrationCode = integrationCode;
        this.clientId = clientId;

        const podName = getPodIdentity();
        const factory = new IntegrationFactory(Number(clientId));

        // 1. ADIM: AYNI PLATFORMDAKİ TÜM BEKLEYEN SİNYALLERİ BUL VE (TEK TEK) KİLİTLE
        // Sadece nextRunAt süresi gelmiş olanları değil, WAITING olanların tamamını kapıyoruz (Aggregation için)
        const activeWaitingSignals = await this.engineProvider.getExportSignalModel().find({
            clientId,
            integrationCode,
            status: 'WAITING',
            lockedBy: null
        }).select('batchId mode').lean();

        // Mevcut gelen batchId ve diğer bekleyen batchId'leri birleştiriyoruz
        const candidateBatchIds = _.uniq([initialBatchId, ...activeWaitingSignals.map((s: any) => s.batchId)]);

        // [ADR-0006 Karar 4] ESKİDEN: koşulsuz toplu `updateMany` — başka bir pod'un kilidini SESSİZCE ezebiliyordu
        // (filtrede `lockedBy: null` YOKTU). ARTIK: her batchId için atomik `findOneAndUpdate` ile TEK TEK talep
        // edilir; yalnızca kilitsiz (`lockedBy: null`) veya zaten kendisine ait olan batch'ler alınır. Talep
        // edilemeyen (başka pod'da kilitli) batch'ler bu turda ATLANIR (hata değil).
        const allBatchIds: string[] = [];
        for (const batchId of candidateBatchIds) {
            const claimed = await this.engineProvider.getExportSignalModel().findOneAndUpdate(
                { batchId, $or: [{ lockedBy: null }, { lockedBy: podName }] },
                { $set: { lockedBy: podName, updatedAt: new Date() } },
                { new: true },
            );
            if (claimed) allBatchIds.push(batchId);
        }

        if (allBatchIds.length === 0) {
            log.info('SYNC_NO_BATCHES_CLAIMABLE', 'Synchronizer: no batches claimable this pass (lease held by another pod).');
            return;
        }

        log.info('SYNC_SYNCHRONIZER_AGGREGATED_BATCHES', `Synchronizer aggregated ${allBatchIds.length} batches on ${podName}`);

        try {
            // 2. ADIM: Bayatlamış kayıtları temizle (Toplu batch listesi üzerinden)
            await this.cleanupStaleWaitingVariants(allBatchIds, mode);

            const instance = await factory.getInstance(this.integrationCode);
            const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();

            // 3. ADIM: Tüm paketlerdeki sorgulanabilir WAITING kayıtlarını topla
            const allWaitingEntries = await this.engineProvider.getExportStagedProductModel().find({
                batchId: { $in: allBatchIds },
                status: 'WAITING',
                nextRunAt: { $lte: new Date() }
            }).select(`_id ${matchKey} batchId mode`).lean();

            if (!allWaitingEntries || allWaitingEntries.length === 0) {
                log.info('SYNC_NO_ITEMS_READY', 'No items ready for sync in aggregated batches.');
                for (const bId of allBatchIds) await this.finalizeSignal(bId);
                return;
            }

            // 4. ADIM: CHUNKED SENKRONİZASYON
            // Platform modülüne (instance) parça parça gönderiyoruz.
            const chunks = _.chunk(allWaitingEntries, this.batchSize);
            for (const chunk of chunks) {
                await this.syncTaskStatuses(chunk, factory);
            }

            // 5. ADIM: HER BATCH'İ KENDİ İÇİNDE FİNALİZE ET
            for (const bId of allBatchIds) {
                await this.finalizeSignal(bId);
            }

            log.info('SYNC_AGGREGATED_SYNCHRONIZER_FINISHED_BATCHES', `Aggregated Synchronizer finished for ${allBatchIds.length} batches.`);

        } catch (err: any) {
            log.error('SYNC_SYNCHRONIZER_AGGREGATION_ERROR', 'Synchronizer Aggregation Error:', { err });
            // Hata durumunda kilitleri serbest bırak ve 5 dakika "Cooldown" (soğuma) süresi ver
            const cooldownDate = new Date(Date.now() + 5 * 60 * 1000); // 5 dakika sonra
            await this.engineProvider.getExportSignalModel().updateMany(
                { batchId: { $in: allBatchIds } },
                {
                    $set: {
                        lockedBy: null,
                        updatedAt: new Date(),
                        nextRunAt: cooldownDate
                    }
                }
            );
            log.info('SYNC_SYNCHRONIZER_ERROR_COOLDOWN_APPLIED', `Synchronizer Error: Cooldown applied until ${cooldownDate.toLocaleTimeString()}`);
        }
    }

    private async syncTaskStatuses(chunk: any[], factory: IntegrationFactory) {
        const instance = await factory.getInstance(this.integrationCode);
        const now = new Date();
        // Platformdan yanıt alınamazsa veya 'WAITING' kalırsa uygulanacak cooldown süresi (30 dk)
        const nextRetryDate = new Date(now.getTime() + this.cooldownMinutes * 60000);

        const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();

        // Platform modülünden (Trendyol, Hepsiburada vb.) güncel durumları çekiyoruz
        const platformResults = await instance.updateProductStatuses({
            barcodes: chunk.map((e: any) => e[matchKey]),
            matchValues: chunk.map((e: any) => e[matchKey])
        });

        const variantBulkOps: any[] = [];
        const stagingBulkOps: any[] = [];

        // ÖNEMLİ: platformResults üzerinden değil, elimizdeki chunk üzerinden dönüyoruz.
        // Böylece her bir staged product'ın akıbetini netleştirmiş oluyoruz.
        for (const entry of chunk) {
            const matchValue = entry[matchKey];
            const result = platformResults?.find((r: any) => (r.matchValue || r.barcode || r.stockCode) === matchValue);

            // SENARYO 1: Ürün platform tarafında bulunamadı veya API sonuç dönmedi
            if (!result) {
                stagingBulkOps.push(
                    this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, 'WAITING', {
                        nextRunAt: nextRetryDate,
                        message: "Pazaryeri servisinden durum bilgisi alınamadı (Sıradaki kontrol 30dk sonra).",
                        updatedAt: now
                    })
                );
                continue;
            }

            // SENARYO 2: Ürün hala beklemede (Onay sürecinde)
            if (result.status === 'WAITING') {
                stagingBulkOps.push(
                    this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, 'WAITING', {
                        nextRunAt: nextRetryDate,
                        message: "Pazaryeri onayı bekleniyor (Sıradaki kontrol 30dk sonra).",
                        updatedAt: now
                    })
                );
                continue;
            }

            // SENARYO 3: İşlem sonuçlanmış (COMPLETED veya FAILED)
            const isApproved = result.status === 'COMPLETED';
            const nextStatus = isApproved ? 'COMPLETED' : 'FAILED';
            const finalMsg = this.formatUserMessage(result.messages);

            // Staging tablosunu güncelle (İşlem bittiği için priorityScore 0 ve nextRunAt set edilmez)
            stagingBulkOps.push(
                this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, nextStatus, {
                    priorityScore: 0,
                    errorMessage: isApproved ? null : finalMsg,
                    completedAt: now,
                    message: `Senkronizasyon: ${isApproved ? 'Onaylandı' : 'Reddedildi'}.`,
                    updatedAt: now
                })
            );

            // Ana varyant tablosundaki platform bilgisini güncelle
            variantBulkOps.push(
                this.engineProvider.prepareVariantPlatformUpdateOp(
                    matchValue,
                    result.mapping,
                    this.integrationCode,
                    entry.mode,
                    nextStatus,
                    {
                        messages: [finalMsg],
                        updatedAt: now,
                        matchKey: matchKey
                    },
                )
            );
        }

        // Toplu yazma işlemleri
        if (variantBulkOps.length > 0) {
            await this.engineProvider.getVariantModel().bulkWrite(variantBulkOps);
        }

        if (stagingBulkOps.length > 0) {
            await this.engineProvider.getExportStagedProductModel().bulkWrite(stagingBulkOps);
        }

        // Dashboard istatistiklerinin güncellenmesi gerektiğini işaretle
        await this.engineProvider.markStatsAsDirty();
    }

    private async cleanupStaleWaitingVariants(batchIds: string[], mode: string) {
        const staleLimit = new Date(Date.now() - (this.waitingTimeoutDays * 24 * 60 * 60 * 1000));
        const now = new Date();

        const factory = new IntegrationFactory(Number(this.clientId));
        const instance = await factory.getInstance(this.integrationCode);
        const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();

        const staleEntries = await this.engineProvider.getExportStagedProductModel().find({
            batchId: { $in: batchIds },
            status: 'WAITING',
            updatedAt: { $lte: staleLimit }
        }).select(`_id ${matchKey} mode`).lean();

        if (staleEntries.length === 0) return;

        const variantBulkOps: any[] = [];
        const stagingBulkOps: any[] = [];

        for (const entry of staleEntries) {
            const msg = `Onay süreci ${this.waitingTimeoutDays} gün içinde tamamlanmadığı için zaman aşımı.`;
            const matchValue = entry[matchKey];
            stagingBulkOps.push(this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, 'FAILED', { priorityScore: 0, errorMessage: msg, updatedAt: now }));
            variantBulkOps.push(this.engineProvider.prepareVariantPlatformUpdateOp(matchValue, undefined, this.integrationCode, entry.mode, 'FAILED', { messages: [msg], updatedAt: now, matchKey: matchKey }));
        }

        if (variantBulkOps.length > 0) await this.engineProvider.getVariantModel().bulkWrite(variantBulkOps);
        if (stagingBulkOps.length > 0) await this.engineProvider.getExportStagedProductModel().bulkWrite(stagingBulkOps);
    }

    /**
     * Revizyon: Her paket kendi içindeki WAITING varyant durumuna göre finalize edilir.
     */
    private async finalizeSignal(batchId: string) {
        const waitingEntries = await this.engineProvider.getExportStagedProductModel().find({
            batchId,
            status: 'WAITING'
        }).select('nextRunAt').lean();

        let nextSignalStatus = 'COMPLETED';
        let earliestNextRun: Date | null = null;

        if (waitingEntries.length > 0) {
            nextSignalStatus = 'WAITING';
            const runDates = waitingEntries.map((e: any) => e.nextRunAt).filter(Boolean);
            if (runDates.length > 0) {
                earliestNextRun = new Date(Math.min(...runDates.map((d: any) => d.getTime())));
            }
        }

        await this.engineProvider.getExportSignalModel().updateOne(
            { batchId },
            {
                $set: {
                    status: nextSignalStatus,
                    lockedBy: null,
                    nextRunAt: earliestNextRun || new Date(),
                    updatedAt: new Date(),
                    completedAt: nextSignalStatus === 'COMPLETED' ? new Date() : null
                }
            }
        );
    }
}