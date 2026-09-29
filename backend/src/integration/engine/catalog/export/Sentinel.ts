import IntegrationFactory from '../../../modules/IntegrationFactory';
import { BaseWorker } from '../../BaseWorker';
import config from './export.config.json';
import _ from 'lodash';
import { PLATFORM_PROCESS } from '@interfaces/index';
import { IIntegrationEngineProvider } from '../provider/IIntegrationEngineProvider';
import { getSetting } from '@integration/config/ConfigResolver';

export default class Sentinel extends BaseWorker {
    protected readonly workerName = 'Catalog Sentinel';

    // Pazaryeri takip süresi sınırı (Varsayılan 24 Saat)
    private readonly trackingMaxAge = config.sentinel?.trackingMaxAge || 24 * 60 * 60 * 1000;

    // Sync öncesi bekleme süresi (Config'den dinamik, varsayılan 15sn)
    private readonly syncCooldownMs = (config.sentinel?.syncCooldownSeconds || 15) * 1000;

    // [ADR-0020 Aşama A] JSON'dan (`export.config.json`) doğrudan okuma yerine tek çözümleyici; DEĞER AYNI (1
    // dk — ölü `||` yedek 10 dk artık hiçbir yerde YOK, bkz. ADR K10 ve katalogdaki `knownDriftNote`). Üç çağrı
    // noktasının (satır 75/91/229 — bkz. aşağıda) hepsi BU tek alanı okur.
    private readonly cooldownMinutes = getSetting<number>('export.sentinel.cooldownMinutes');

    private integrationCode!: string;

    constructor(private engineProvider: IIntegrationEngineProvider) {
        super();
    }

    private formatUserMessage(errorMessage: string): string {
        if (!errorMessage) return 'Bilinmeyen Hata';
        return errorMessage.replace(/^(\[.*?\]\s*)+/, '');
    }

    public async runOnce(clientId: string, integrationCode: string, mode: PLATFORM_PROCESS, batchId: string) {
        this.integrationCode = integrationCode;

        const clientLogPrefix = this.getLogPrefix(clientId, this.integrationCode);
        const now = new Date();

        try {
            const factory = new IntegrationFactory(Number(clientId));
            const instance = await factory.getInstance(this.integrationCode);
            const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();

            // 1. ADIM: ZAMAN AŞIMI KONTROLÜ
            const timeoutLimit = new Date(now.getTime() - this.trackingMaxAge);
            const timedOutProducts = await this.engineProvider.getExportStagedProductModel().find({
                batchId: batchId,
                status: 'SENT',
                updatedAt: { $lte: timeoutLimit }
            }).select(`_id ${matchKey}`).lean();

            if (timedOutProducts.length > 0) {
                await this.handleTimeout(timedOutProducts, mode, now, clientLogPrefix, matchKey);
            }

            console.log(`${clientLogPrefix} Sentinel searching for pending batches in DB...`);
            const pendingBatches = await this.engineProvider.getExportStagedProductModel().aggregate([
                { $match: { batchId: batchId, status: 'SENT', trackingId: { $ne: null } } },
                { $group: { _id: "$trackingId" } }
            ]);

            console.log(`${clientLogPrefix} Found ${pendingBatches.length} pending trackingId(s) to check.`);

            if (pendingBatches.length === 0) {
                console.log(`${clientLogPrefix} No pending trackingIds found in Batch: ${batchId}. Finalizing signal.`);
                await this.finalizeSignal(batchId);
                return;
            }

            for (const batch of pendingBatches) {
                console.log(`${clientLogPrefix} Calling checkBatchProduct for TrackingId: ${batch._id}`);
                try {
                    const trackingId = batch._id;
                    const report = await instance.checkBatchProduct({ trackingId, mode });

                    if (!report) {
                        // Rapor henüz oluşmamışsa cooldown ver (SENT statüsünde kalır)
                        await this.engineProvider.getExportStagedProductModel().updateMany(
                            { batchId, trackingId, status: 'SENT' },
                            { $set: { nextRunAt: new Date(Date.now() + this.cooldownMinutes * 60000) } }
                        );
                        continue;
                    }

                    const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();
                    await this.finalizeTracking(batchId, mode, trackingId, report, matchKey);

                } catch (reportErr: any) {
                    console.error(`${clientLogPrefix} TrackingId ${batch._id} check failed:`, reportErr.message);

                    // Veritabanını güncelle: Ürünlerin neden sorgulanamadığını işle ve bir cooldown (bekleme süresi) ver
                    await this.engineProvider.getExportStagedProductModel().updateMany(
                        { batchId, trackingId: batch._id, status: 'SENT' },
                        {
                            $set: {
                                nextRunAt: new Date(Date.now() + this.cooldownMinutes * 60000),
                                updatedAt: new Date()
                            },
                            $push: {
                                logs: {
                                    status: 'SENT',
                                    worker: this.workerName,
                                    message: `Takip sorgusu başarısız: ${reportErr.message}. tekrar denenecek.`,
                                    timestamp: new Date()
                                }
                            }
                        }
                    );
                }
            }

            // 3. ADIM: SİNYAL GÜNCELLEME VE KİLİT AÇMA
            await this.finalizeSignal(batchId);
            console.log(`${clientLogPrefix} Sentinel task finished for Batch: ${batchId}`);

        } catch (err: any) {
            console.error(`${clientLogPrefix} Sentinel Critical Error for Batch ${batchId}:`, err.message);
            await this.engineProvider.getExportSignalModel().updateOne(
                { batchId },
                { $set: { status: 'FAILED', lockedBy: null, errorMessage: err.message, updatedAt: new Date() } }
            );
        }
    }

    private async handleTimeout(staleEntries: any[], mode: PLATFORM_PROCESS, now: Date, logPrefix: string, matchKey: string) {
        const variantBulkOps: any[] = [];
        const stagingBulkOps: any[] = [];
        const timeoutMsg = "Ürün onay süreci zaman aşımına uğradı.";

        for (const entry of staleEntries) {
            const matchValue = entry[matchKey];
            
            variantBulkOps.push(
                this.engineProvider.prepareVariantPlatformUpdateOp(matchValue, undefined, this.integrationCode, mode, 'WAITING', {
                    messages: [timeoutMsg],
                    updatedAt: now,
                    matchKey: matchKey
                })
            );

            stagingBulkOps.push(
                this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, 'WAITING', {
                    priorityScore: 0,
                    message: timeoutMsg,
                    updatedAt: now
                })
            );
        }

        if (variantBulkOps.length > 0) await this.engineProvider.getVariantModel().bulkWrite(variantBulkOps);
        if (stagingBulkOps.length > 0) await this.engineProvider.getExportStagedProductModel().bulkWrite(stagingBulkOps);

        console.log(`${logPrefix} ${staleEntries.length} products timed out and moved to WAITING.`);
    }

    private async finalizeTracking(batchId: string, mode: string, trackingId: string, report: any[], matchKey: string) {
        const now = new Date();
        const variantBulkOps: any[] = [];
        const stagingBulkOps: any[] = [];

        const keysInReport = report.map(r => String(r.matchValue || r.barcode || r.stockCode || r.stockcode || r.sku || r.productSellerCode || ""));
        // [ADR-0004 Karar 6, Aşama C] `stock` de seçime eklendi: UPDATE_STOCK + COMPLETED durumunda bu,
        // Validator'ın yazdığı GERÇEK yayın adedidir (`stockSync.lastPublishedQty` onayı için gerekir).
        const stagingEntries = await this.engineProvider.getExportStagedProductModel().find({
            batchId,
            [matchKey]: { $in: keysInReport },
            trackingId,
            status: 'SENT'
        }).select(`_id ${matchKey} stock`).lean();

        const stagingMap = _.keyBy(stagingEntries, matchKey);

        for (const res of report) {
            const matchValue = String(res.matchValue || res.barcode || res.stockCode || res.stockcode || res.sku || res.productSellerCode || "");
            const status = res.status;
            const cleanMessages = (Array.isArray(res.messages) ? res.messages : [res.messages])
                .map((m: string) => this.formatUserMessage(m));

            const nextStatus = status === 'WAITING' ? 'WAITING' : (status === 'FAILED' ? 'FAILED' : 'COMPLETED');
            const entry = stagingMap[matchValue];

            if (entry) {
                stagingBulkOps.push(
                    this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, nextStatus, {
                        nextRunAt: new Date(Date.now() + this.syncCooldownMs),
                        completedAt: ['COMPLETED', 'FAILED'].includes(nextStatus) ? now : null,
                        message: `Pazaryeri yanıtı: ${status}. ${cleanMessages[0] || ''}`,
                        updatedAt: now
                    })
                );
            }

            variantBulkOps.push(
                this.engineProvider.prepareVariantPlatformUpdateOp(matchValue, undefined, this.integrationCode, mode, nextStatus, {
                    messages: cleanMessages,
                    updatedAt: now,
                    matchKey: matchKey // Variant eşleşmesi için hangi anahtarın kullanılacağı (barcode/stockcode)
                })
            );

            // [ADR-0004 Karar 6, Aşama C] `lastPublishedQty` YALNIZCA asenkron batch sonucu BAŞARILI dönünce
            // (burası -- mevcut Sentinel akışı) güncellenir. `entry.stock` yoksa (beklenmeyen durum) GÜVENLİ
            // varsayılan: onay YAZILMAZ (yanlış bir değerle stockSync'i bozmamak için).
            if (mode === PLATFORM_PROCESS.UPDATE_STOCK && nextStatus === 'COMPLETED' && entry && typeof entry.stock === 'number') {
                variantBulkOps.push(
                    this.engineProvider.prepareStockSyncConfirmationOp(matchValue, this.integrationCode, entry.stock, {
                        batchId: trackingId,
                        updatedAt: now,
                        matchKey: matchKey,
                    })
                );
            }
        }

        if (variantBulkOps.length > 0) await this.engineProvider.getVariantModel().bulkWrite(variantBulkOps);
        if (stagingBulkOps.length > 0) await this.engineProvider.getExportStagedProductModel().bulkWrite(stagingBulkOps);
        await this.engineProvider.markStatsAsDirty();
    }

    private async finalizeSignal(batchId: string) {
        let nextSignalStatus = 'COMPLETED';
        let nextRunAt = new Date();

        const remainingSent = await this.engineProvider.getExportStagedProductModel().countDocuments({ batchId, status: 'SENT' });

        if (remainingSent > 0) {
            // Eğer hala SENT olanlar varsa, vagonun kendisini Sentinel cooldown süresi kadar ileriye mühürle
            await this.engineProvider.getExportSignalModel().updateOne(
                { batchId },
                {
                    $set: {
                        lockedBy: null,
                        updatedAt: new Date(),
                        nextRunAt: new Date(Date.now() + this.cooldownMinutes * 60000)
                    }
                }
            );
            return;
        }

        const hasWaiting = await this.engineProvider.getExportStagedProductModel().countDocuments({ batchId, status: 'WAITING' });
        if (hasWaiting > 0) {
            nextSignalStatus = 'WAITING';
            // Vagonun kalkış saatini config'deki saniye kadar ileriye kuruyoruz
            nextRunAt = new Date(Date.now() + this.syncCooldownMs);
        }

        await this.engineProvider.getExportSignalModel().updateOne(
            { batchId },
            {
                $set: {
                    status: nextSignalStatus,
                    lockedBy: null,
                    nextRunAt: nextRunAt,
                    updatedAt: new Date(),
                    completedAt: nextSignalStatus === 'COMPLETED' ? new Date() : null
                }
            }
        );
    }
}