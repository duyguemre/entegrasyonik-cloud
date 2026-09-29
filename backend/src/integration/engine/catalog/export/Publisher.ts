

import IntegrationFactory from '../../../modules/IntegrationFactory';
import { BaseWorker } from '../../BaseWorker';
import config from './export.config.json';
import _ from 'lodash';
import os from 'os';
import { PLATFORM_PROCESS } from '../../../../interfaces';
import { IIntegrationEngineProvider } from '../provider/IIntegrationEngineProvider';
import { IPlatform, IExportStagedProduct } from '@interfaces/index';
import { getSetting } from '@integration/config/ConfigResolver';

export default class Publisher extends BaseWorker {
    protected readonly workerName = 'Catalog Publisher';
    private integrationCode!: string;
    private clientId!: string;

    // [ADR-0020 Aşama A] JSON'dan (`export.config.json`) doğrudan okuma yerine tek çözümleyici; DEĞER AYNI (30
    // — ölü `||` yedek 50 artık hiçbir yerde YOK, bkz. ADR K10 ve katalogdaki `knownDriftNote`).
    private readonly internalChunkSize = getSetting<number>('export.publisher.chunkSize');
    // Sentinel öncesi bekleme süresi (Saniye cinsinden, varsayılan 15sn)
    private readonly publisherCooldownMs = (config.publisher?.syncCooldownSeconds || 15) * 1000;
    // [ADR-0006 adım 5] retryable (RATE_LIMITED/UNAVAILABLE/UNKNOWN_OUTCOME) bir hatada, retryAfterMs
    // yoksa sinyalin ertelendiği varsayılan süre (5 dk). retryAfterMs varsa ve bundan kısaysa o kullanılır.
    private static readonly SIGNAL_DEFAULT_RETRY_DELAY_MS = 5 * 60 * 1000;

    constructor(private engineProvider: IIntegrationEngineProvider) {
        super();
    }

    private formatUserMessage(errorMessage: string): string {
        if (!errorMessage) return 'Bilinmeyen Hata';
        return errorMessage.replace(/^(\[.*?\]\s*)+/, '');
    }

    public async runOnce(clientId: string, integrationCode: string, mode: PLATFORM_PROCESS, batchId: string) {
        this.integrationCode = integrationCode;
        this.clientId = clientId;

        const clientLogPrefix = this.getLogPrefix(clientId, this.integrationCode);
        const podName = process.env.POD_NAME || os.hostname();

        try {
            const factory = new IntegrationFactory(Number(clientId));
            const instance = await factory.getInstance(this.integrationCode);
            const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();

            console.log(`${clientLogPrefix} Publisher started for Batch: ${batchId} on ${podName}`);

            const allEntries = await this.engineProvider.getExportStagedProductModel()
                .find({ batchId: batchId, status: 'PENDING' })
                .select('_id barcode stockcode productId')
                .lean();

            console.log(`${clientLogPrefix} Found ${allEntries.length} PENDING entries for Batch: ${batchId}`);

            if (!allEntries || allEntries.length === 0) {
                console.log(`${clientLogPrefix} No PENDING items in Batch: ${batchId}`);
                await this.updateSignalStatus(batchId, 'SENT');
                return;
            }

            const chunks = _.chunk(allEntries, this.internalChunkSize);
            let totalProcessedInThisRun = 0;

            let lastTrackingId: string | undefined = undefined;
            // [ADR-0006 adım 5] Bu turda retryable (geçici) bir hata olup olmadığını ve varsa en kısa
            // önerilen erteleme süresini (429 Retry-After gibi) takip eder.
            let hadRetryableFailure = false;
            let signalRetryDelayMs = Publisher.SIGNAL_DEFAULT_RETRY_DELAY_MS;

            for (const chunk of chunks) {
                const entryIds = chunk.map((c: any) => c._id);
                const stagingEntries = await this.engineProvider.getExportStagedProductModel()
                    .find({ _id: { $in: entryIds } })
                    .lean();

                try {
                    const result = await this.executeIntegration(instance, mode, stagingEntries);
                    lastTrackingId = result.trackingId || undefined || lastTrackingId;
                    await this.handleResults(mode, stagingEntries, result);
                } catch (batchErr: any) {
                    console.error(`${clientLogPrefix} Batch Execution Error:`, batchErr.message);
                    const { isRetryable } = await this.handleBatchFailure(mode, stagingEntries, batchErr, matchKey);
                    if (isRetryable) {
                        hadRetryableFailure = true;
                        const delay = typeof batchErr?.retryAfterMs === 'number'
                            ? Math.min(batchErr.retryAfterMs, Publisher.SIGNAL_DEFAULT_RETRY_DELAY_MS)
                            : Publisher.SIGNAL_DEFAULT_RETRY_DELAY_MS;
                        signalRetryDelayMs = Math.min(signalRetryDelayMs, delay);
                    }
                }

                totalProcessedInThisRun += stagingEntries.length;
            }

            // --- FİNALİZE SİNYAL ---
            if (hadRetryableFailure) {
                // [ADR-0006 Karar 2] Geçici hatada sinyal SENT'e GEÇMEZ (henüz gerçekten gönderilmedi
                // sayılamaz); PENDING'de kalır ve nextRunAt ile ertelenir ki ExportOrchestrator bir
                // sonraki turda Publisher'ı bu batch için yeniden çalıştırsın (bkz. görev raporu:
                // "Sync/Dispatcher" değil, Publisher'ın kendisi -- signal.status PENDING olduğu sürece
                // ExportOrchestrator.getWorkerTypeByStatus 'Publisher' işçisini seçer).
                await this.deferSignal(batchId, signalRetryDelayMs, 'Geçici hata(lar) nedeniyle bir sonraki turda tekrar denenecek.');
                console.log(`${clientLogPrefix} Publisher deferred Batch: ${batchId} (retryable failure) by ${signalRetryDelayMs}ms.`);
            } else {
                // İş bittiğinde statüyü SENT yap ve Sentinel'in vaktinden önce dalmaması için mühürle
                await this.updateSignalStatus(batchId, 'SENT', undefined, lastTrackingId);
            }

            console.log(`${clientLogPrefix} Publisher finished Batch: ${batchId}. Total processed: ${totalProcessedInThisRun}`);

        } catch (err: any) {
            console.error(`${clientLogPrefix} Publisher Critical Error for Batch ${batchId}:`, err.message);
            await this.updateSignalStatus(batchId, 'FAILED', err.message);
        }
    }

    private async executeIntegration(instance: IPlatform, mode: string, stagedProducts: IExportStagedProduct[]) {
        switch (mode) {
            case PLATFORM_PROCESS.TRANSFER: return await instance.transferProducts(stagedProducts);
            case PLATFORM_PROCESS.UPDATE_PRICE: return await instance.updateProductPrice(stagedProducts);
            case PLATFORM_PROCESS.UPDATE_STOCK: return await instance.updateProductStock(stagedProducts);
            case PLATFORM_PROCESS.UPDATE: return await instance.updateProduct(stagedProducts);
            case PLATFORM_PROCESS.UPDATE_VARIANT: return await instance.updateProductVariant(stagedProducts);
            case PLATFORM_PROCESS.UPDATE_DELIVERY: return await instance.updateProductDelivery(stagedProducts);
            default: throw new Error(`Unknown process mode: ${mode}`);
        }
    }

    private async handleResults(mode: string, stagingEntries: any[], result: any) {
        const now = new Date();
        const variantBulkOps: any[] = [];
        const stagingBulkOps: any[] = [];
        const currentChunkTrackingId = result.trackingId;

        const factory = new IntegrationFactory(Number(this.clientId));
        const instance = await factory.getInstance(this.integrationCode);
        const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();
        const stagingMap = _.reduce(stagingEntries, (acc: any, entry: any) => {
            const val = String(entry[matchKey] || "");
            if (val) {
                acc[val.toLowerCase()] = entry;
                acc[val] = entry; // Keep original as fallback
            }
            return acc;
        }, {});

        console.log(`[Publisher][handleResults] MatchKey: ${matchKey}, MapKeys: ${Object.keys(stagingMap).join(', ')}`);
        if (result.variantList) {
            console.log(`[Publisher][handleResults] VariantList Identifiers: ${result.variantList.map((v: any) => v.barcode || v.stockCode || v.stockcode).join(', ')}`);
        }

        if (result.failedVariants && result.failedVariants.length > 0) {
            result.failedVariants.forEach((failed: any) => {
                const matchValue = String(failed[matchKey] || failed.barcode || failed.stockCode || failed.stockcode || failed.sku || failed.productSellerCode || "");
                const cleanErr = this.formatUserMessage(failed.reason);
                const entry = stagingMap[matchValue.toLowerCase()] || stagingMap[matchValue];

                variantBulkOps.push(
                    this.engineProvider.prepareVariantPlatformUpdateOp(matchValue, undefined, this.integrationCode, mode, 'FAILED', {
                        messages: [cleanErr],
                        updatedAt: now,
                        matchKey: matchKey
                    })
                );

                if (entry) {
                    stagingBulkOps.push(
                        this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, 'FAILED', {
                            priorityScore: 0,
                            errorMessage: cleanErr,
                            errorType: "BUSINESS_ERROR",
                            updatedAt: now
                        })
                    );
                }
            });
        }

        if (result.variantList && result.variantList.length > 0) {
            result.variantList.forEach((v: any) => {
                // Teşhis için her öğeyi logla
                console.log(`[Publisher][handleResults] Processing result item: barcode=${v.barcode}, stockCode=${v.stockCode}, matchValueCandidate=${v[matchKey]}`);

                // Eşleşme değerini bul: matchKey'in kendisi, barcode, stockCode veya sku olabilir
                const matchValue = String(v[matchKey] || v.stockCode || v.stockcode || v.barcode || v.sku || v.productSellerCode || "");
                const entry = stagingMap[matchValue.toLowerCase()] || stagingMap[matchValue];
                
                console.log(`[Publisher][handleResults] Match result for ${matchValue}: ${entry ? 'FOUND' : 'NOT FOUND'}`);

                // [C22] Bir işlem birden çok pazaryeri isteğine bölünmüşse (ör. Trendyol onaylı/onaysız güncelleme) varyantın
                // kendi takip ID'si (`v.trackingId`) önceliklidir; yoksa parçanın ortak takip ID'si.
                const itemTrackingId = v.trackingId || currentChunkTrackingId;
                const nextStatus = result.nextStatus || (itemTrackingId ? 'SENT' : 'COMPLETED');
                const nextScore = this.calculatePriorityScore(mode, nextStatus);
                const finalMessages = itemTrackingId ? ["Gönderildi, onay bekleniyor."] : ["İşlem tamamlandı."];

                variantBulkOps.push(
                    this.engineProvider.prepareVariantPlatformUpdateOp(matchValue, undefined, this.integrationCode, mode, nextStatus, {
                        batchProcessId: itemTrackingId || null,
                        messages: finalMessages,
                        updatedAt: now,
                        matchKey: matchKey
                    })
                );

                if (entry) {
                    // ÜRÜN BAZINDA GECİKME: Sentinel aşaması için vakti ileri kuruyoruz
                    const nextRunAt = nextStatus === 'SENT'
                        ? new Date(Date.now() + this.publisherCooldownMs)
                        : now;

                    stagingBulkOps.push(
                        this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, nextStatus, {
                            priorityScore: nextScore,
                            trackingId: itemTrackingId || null,
                            nextRunAt: nextRunAt,
                            completedAt: nextStatus === 'COMPLETED' ? now : null,
                            message: itemTrackingId
                                ? `İşlem ${this.integrationCode} platformuna iletildi. Takip No: ${itemTrackingId}`
                                : `İşlem onaylandı.`,
                            updatedAt: now
                        })
                    );
                }
            });
        }

        console.log(`[Publisher][handleResults] Finalizing: variantBulkOps=${variantBulkOps.length}, stagingBulkOps=${stagingBulkOps.length}`);
        if (variantBulkOps.length > 0) {
            await this.engineProvider.getVariantModel().bulkWrite(variantBulkOps);
            await this.engineProvider.markStatsAsDirty();
        }

        if (stagingBulkOps.length > 0) {
            await this.engineProvider.getExportStagedProductModel().bulkWrite(stagingBulkOps);
        }
    }

    /**
     * @returns `{ isRetryable }` — çağıran (`runOnce`) bunu sinyalin SENT'e geçip geçmeyeceğine karar
     * vermek için kullanır (ADR-0006 Karar 2: retryable hatada sinyal SENT yapılmaz, ertelenir).
     */
    private async handleBatchFailure(mode: string, entries: any[], error: any, matchKey: string): Promise<{ isRetryable: boolean }> {
        const now = new Date();
        const cleanMessage = this.formatUserMessage(error.message);

        // [ADR-0006 adım 5] IntegrationError.retryable === true (RATE_LIMITED/UNAVAILABLE/
        // UNKNOWN_OUTCOME) ise kalem KALICI FAILED yapılmaz; staging kaydını erken bir nextRunAt ile
        // tekrar PENDING'e alıyoruz ve varyant platform durumunu FAILED'a ÇEKMİYORUZ (kullanıcıya
        // geçici hatayı "kalıcı başarısız" gibi göstermemek için). Sinyal seviyesindeki erteleme
        // (updateSignalStatus SENT'e geçmemesi + nextRunAt) çağıran `runOnce` tarafından bu metodun
        // dönüş değerine göre uygulanır (bkz. `deferSignal`).
        const isRetryable = error?.name === 'IntegrationError' && error?.retryable === true;
        const retryDelayMs = typeof error?.retryAfterMs === 'number' ? Math.min(error.retryAfterMs, 5 * 60 * 1000) : 60 * 1000;

        const stagingBulkOps = entries.map(entry =>
            this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, isRetryable ? 'PENDING' : 'FAILED', {
                priorityScore: isRetryable ? undefined : 0,
                nextRunAt: isRetryable ? new Date(now.getTime() + retryDelayMs) : undefined,
                errorMessage: isRetryable ? `Geçici hata, tekrar denenecek: ${cleanMessage}` : `Publisher hatası: ${cleanMessage}`,
                errorType: isRetryable ? "TRANSIENT_ERROR" : "SYSTEM_ERROR",
                updatedAt: now
            })
        );

        if (isRetryable) {
            // Varyant platform ekranı bu turda DOKUNULMAZ (kalıcı FAILED görünmesin); staging kaydı bir
            // sonraki turda tekrar denenecek.
            await this.engineProvider.getExportStagedProductModel().bulkWrite(stagingBulkOps);
            return { isRetryable: true };
        }

        // [DÜZELTME 2026-09-28] Eskiden burada `new IntegrationFactory(Number(entries[0]?.clientId || 1)).getInstance(...)` vardı:
        // staged şemada `clientId` alanı olmadığından daima tenant 1'in ayarları okunuyordu (çapraz-tenant sızıntı) ve tenant 1'de
        // entegrasyon yoksa "Ayarları bulunamadı" hatası kayıtların FAILED işaretlenmesini ve kalan chunk'ları engelliyordu.
        // Artık çağıran bağlamdaki (runOnce) TENANT'A AİT matchKey parametre olarak gelir; ikinci bir fabrika/DB okuması yoktur.
        const variantBulkOps = entries.map(entry => {
            const matchValue = entry[matchKey];
            return this.engineProvider.prepareVariantPlatformUpdateOp(matchValue, undefined, this.integrationCode, mode, 'FAILED', {
                batchProcessId: null,
                messages: [`Sistem hatası: ${cleanMessage}`],
                updatedAt: now,
                matchKey: matchKey
            });
        });

        if (variantBulkOps.length > 0) {
            await this.engineProvider.getVariantModel().bulkWrite(variantBulkOps);
            await this.engineProvider.markStatsAsDirty();
        }

        await this.engineProvider.getExportStagedProductModel().bulkWrite(stagingBulkOps);
        return { isRetryable: false };
    }

    /**
     * [ADR-0006 Karar 2 / adım 5] Retryable (geçici) toplu hatada sinyali SENT'e GEÇİRMEDEN, mevcut
     * durumunu (PENDING) koruyarak `nextRunAt` ile ertelemek için kullanılır. `lockedBy` burada
     * dokunulmaz (ExportOrchestrator.dispatch zaten `finally` bloğunda kilidi serbest bırakır);
     * yalnızca `status`/`nextRunAt`/`errorMessage` güncellenir. Böylece ExportOrchestrator bir sonraki
     * turda `nextRunAt` dolduğunda aynı sinyali yine 'Publisher' işçisine yönlendirir (status hâlâ
     * 'PENDING' olduğu için `getWorkerTypeByStatus` haritası değişmez).
     */
    private async deferSignal(batchId: string, delayMs: number, message: string): Promise<void> {
        await this.engineProvider.getExportSignalModel().updateOne(
            { batchId },
            {
                $set: {
                    status: 'PENDING',
                    nextRunAt: new Date(Date.now() + delayMs),
                    errorMessage: message,
                    updatedAt: new Date(),
                }
            }
        );
    }

    /**
     * REVİZE: Sinyal (Vagon) finalize edilirken Sentinel cooldown süresini dikkate alır.
     */
    private async updateSignalStatus(batchId: string, status: string, error?: string, trackingId?: string) {
        let nextRunAt = new Date();

        // Eğer vagon SENT statüsüne geçiyorsa, Sentinel'in hemen saldırmaması için ileri mühürle
        if (status === 'SENT') {
            nextRunAt = new Date(Date.now() + this.publisherCooldownMs);
        }

        const updateData: any = {
            status,
            errorMessage: error || null,
            lockedBy: null,
            nextRunAt: nextRunAt,
            updatedAt: new Date()
        };

        if (trackingId) updateData.trackingId = trackingId;

        await this.engineProvider.getExportSignalModel().updateOne(
            { batchId },
            { $set: updateData }
        );
    }
}