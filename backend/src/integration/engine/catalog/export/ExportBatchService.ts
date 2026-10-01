import { ObjectId } from 'mongodb';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { EVENTS, integrationEventBus } from '@integration/engine/IntegrationEventBus';
import { IApplicationDB, IClientDB, SendNotificationEvent, PLATFORM_PROCESS } from '@interfaces/index';
import { NotificationService } from '@services/notification/NotificationService';
import { safeErrorCode } from '@operations/notifications/safeError';
import { getRequestId } from '@platform/core/context';

const BULK_LIMIT = 1000;

/** Mod bazlı başlangıç öncelik skoru (Dispatcher kuyruğu). */
function initialPriorityScore(mode: string): number {
    const scores: Record<string, number> = {
        [PLATFORM_PROCESS.UPDATE_PRICE]: 130,
        [PLATFORM_PROCESS.UPDATE_STOCK]: 120,
        [PLATFORM_PROCESS.UPDATE]: 70,
        [PLATFORM_PROCESS.TRANSFER]: 60,
        [PLATFORM_PROCESS.UPDATE_VARIANT]: 50,
        [PLATFORM_PROCESS.UPDATE_DELIVERY]: 40
    };
    return scores[mode] || 50;
}

/**
 * ADR-0024 D6 (P3-INT): toplu dışa aktarma paketi oluşturucu (eski `IntegrationService.internalProcessBatch`). Seçili varyantları
 * TEK geçişte okur, her entegrasyon için `ExportStagedProducts` kalemi (QUEUED) + varyant platform durumu yazar (1000'lik
 * toplu yazım), `ExportFlags` sayacını artırıp orkestratörü uyandırır ve entegrasyon başına özet bildirimi gönderir.
 * Hata: kullanıcıya ham ileti gitmez (ADR-0029 NB3, N-05). Davranış eski gövdeyle birebir.
 */
export class ExportBatchService {
    constructor(private readonly deps: { clientDB: IClientDB; applicationDB: IApplicationDB; clientId: any }) { }

    async process(request: any): Promise<void> {
        const { mode, selectedIntegrations, barcodeList, scope } = request;
        const requestId = new ObjectId().toString();
        const { clientDB, applicationDB, clientId } = this.deps;
        try {
            const now = new Date();
            const initialScore = initialPriorityScore(mode);

            const stagedOpsMap: Record<string, any[]> = {};
            const variantOpsMap: Record<string, any[]> = {};
            const acceptedCountMap: Record<string, number> = {};
            const skippedForNoTransferCountMap: Record<string, number> = {};
            const skippedForAlreadyTransferCountMap: Record<string, number> = {};
            const matchKeyMap: Record<string, string> = {};

            for (const integrationCode of selectedIntegrations) {
                stagedOpsMap[integrationCode] = [];
                variantOpsMap[integrationCode] = [];
                acceptedCountMap[integrationCode] = 0;
                skippedForNoTransferCountMap[integrationCode] = 0;
                skippedForAlreadyTransferCountMap[integrationCode] = 0;

                const factory = new IntegrationFactory(Number(clientId));
                const instance = await factory.getInstance(integrationCode);
                matchKeyMap[integrationCode] = (instance.getMatchKey() || 'barcode').toLowerCase();
            }

            const query: any = {};
            if (scope !== 2) {
                query.$or = [
                    { barcode: { $in: barcodeList } },
                    { stockcode: { $in: barcodeList } }
                ];
            }

            console.log(`[BatchCreator] Starting search with query:`, JSON.stringify(query));
            console.log(`[BatchCreator] Selected integrations:`, selectedIntegrations);
            console.log(`[BatchCreator] MatchKeyMap:`, matchKeyMap);

            // Projeksiyon: kimlik alanları + ilk görsel + seçili entegrasyonların upload durumları + dinamik eşleşme anahtarları
            const projection: any = {
                barcode: 1,
                stockcode: 1,
                productId: 1,
                images: { $slice: 1 }
            };
            selectedIntegrations
                .map((code: string) => `platforms.${code}.upload`)
                .join(' ')
                .split(' ')
                .forEach((field: string) => { if (field) projection[field] = 1; });
            Object.values(matchKeyMap).forEach(key => { projection[key] = 1; });

            const cursor = clientDB.getVariantModel()
                .find(query)
                .select(projection)
                .batchSize(BULK_LIMIT)
                .lean()
                .cursor();

            let totalVariantsProcessed = 0;
            // SINGLE PASS: Varyantları bir kez oku, tüm entegrasyonlara dağıt
            for await (const v of cursor) {
                totalVariantsProcessed++;
                for (const integrationCode of selectedIntegrations) {
                    const platformInfo = v.platforms?.[integrationCode]?.upload;
                    const transferStatus = platformInfo?.TRANSFER?.status;

                    // İş mantığı: aktarılmamış ürün güncellenmez, aktarılmış ürün yeniden aktarılmaz (atlananlar sayılır)
                    if (mode !== 'TRANSFER' && transferStatus !== 'COMPLETED') {
                        skippedForNoTransferCountMap[integrationCode]++;
                        continue;
                    }
                    if (mode === 'TRANSFER' && transferStatus === 'COMPLETED') {
                        skippedForAlreadyTransferCountMap[integrationCode]++;
                        continue;
                    }

                    const matchKey = matchKeyMap[integrationCode];
                    const matchValue = v[matchKey];
                    if (!matchValue) {
                        console.error(`[integration-service] MatchValue missing for variant ${v._id} on ${integrationCode}. MatchKey: ${matchKey}`);
                        continue;
                    }

                    const minimalPayload = { barcode: v.barcode, stockcode: v.stockcode, productId: v.productId, upload: platformInfo };

                    stagedOpsMap[integrationCode].push({
                        updateOne: {
                            filter: { [matchKey]: matchValue, mode, integrationCode, status: { $in: ['QUEUED', 'PREPARING'] } },
                            update: {
                                $set: { clientId, productId: v.productId, image: v.images?.[0], payload: minimalPayload, status: 'QUEUED', priorityScore: initialScore, nextRunAt: now, updatedAt: now, barcode: v.barcode, stockcode: v.stockcode },
                                $setOnInsert: { createdAt: now, requestId, changeType: 'CONTENT', batchId: null, logs: [{ status: 'QUEUED', worker: 'BatchCreator', message: `İşlem sıraya alındı.`, timestamp: now }] }
                            },
                            upsert: true
                        }
                    });

                    variantOpsMap[integrationCode].push({
                        updateOne: {
                            filter: { [matchKey]: matchValue },
                            update: {
                                $set: { [`platforms.${integrationCode}.upload.${mode}.status`]: 'QUEUED', [`platforms.${integrationCode}.upload.${mode}.updatedAt`]: now }
                            }
                        }
                    });

                    if (stagedOpsMap[integrationCode].length >= BULK_LIMIT) {
                        await this.flushIntegration(integrationCode, stagedOpsMap, variantOpsMap, acceptedCountMap);
                    }
                }
            }

            console.log(`[BatchCreator] Process finished. Total variants found: ${totalVariantsProcessed}`);
            for (const integrationCode of selectedIntegrations) {
                console.log(`[BatchCreator] Result for ${integrationCode}: Accepted: ${acceptedCountMap[integrationCode]}, Skipped (Already Completed): ${skippedForAlreadyTransferCountMap[integrationCode]}, Skipped (No Transfer): ${skippedForNoTransferCountMap[integrationCode]}`);

                // Kalan son kayıtlar
                await this.flushIntegration(integrationCode, stagedOpsMap, variantOpsMap, acceptedCountMap);

                const totalAccepted = acceptedCountMap[integrationCode];
                const totalNoTransferSkipped = skippedForNoTransferCountMap[integrationCode];
                const totalAlreadyTransfer = skippedForAlreadyTransferCountMap[integrationCode];

                if (totalAccepted > 0) {
                    await applicationDB.getExportFlagModel().updateOne(
                        { clientId, integrationCode },
                        {
                            $inc: { queuedCount: totalAccepted },
                            $set: { lastUpdatedAt: now }
                        },
                        { upsert: true }
                    );
                    integrationEventBus.emit(EVENTS.PROCESS_NEXT_SIGNAL);
                }

                // [ADR-0029 NB3] CATALOG_BATCH_SUBMITTED; bayrak kapaliyken eski olay birebir.
                void NotificationService.notify('CATALOG_BATCH_SUBMITTED', Number(clientId), {
                    integ: integrationCode, mode, batchId: requestId, itemCount: Number(totalAccepted) || 0, hasWarnings: !(totalAccepted > 0),
                }, {
                    idempotencyKey: `batch:${requestId}:${integrationCode}`,
                    corrId: getRequestId(),
                    module: 'IntegrationService',
                    legacy: { event: {
                        clientId: clientId,
                        notificationData: {
                            type: 'BATCH_PROCESS',
                            mode: mode,
                            severity: totalAccepted > 0 ? 'success' : 'warning',
                            title: 'İşlem Özeti',
                            message: `İşlemler sekmesinden takip edebilirsiniz.`,
                            metaData: { integrationCode, mode, totalAccepted, totalAlreadyTransfer, totalNoTransferSkipped }
                        }
                    } as SendNotificationEvent },
                }).catch(() => undefined);
            }
        } catch (error: any) {
            console.error("internalProcessBatch Critical Error:", error);

            // [ADR-0029 NB3, N-05] Kullaniciya ham error.message GITMEZ: guvenli hata kodu + corrId. Bayrak kapaliyken eski olay
            // (ham mesaj dahil) birebir korunur; bayrak acilinca bu yol devreye girmez.
            const integs: string[] = Array.isArray(selectedIntegrations) ? selectedIntegrations : [];
            void NotificationService.notify('CATALOG_BATCH_FAILED', Number(clientId), {
                integ: (integs.length === 1 ? integs[0] : 'multi').slice(0, 60), mode: String(mode ?? 'unknown'), batchId: requestId,
                errorCode: safeErrorCode(error), corrId: getRequestId(),
            }, {
                idempotencyKey: `batch-failed:${requestId}`,
                corrId: getRequestId(),
                module: 'IntegrationService',
                legacy: { event: {
                    clientId: clientId,
                    notificationData: {
                        type: 'BATCH_PROCESS',
                        mode: mode,
                        severity: 'error',
                        title: 'İşlem Başarısız',
                        message: `Toplu işlem sırasında bir hata oluştu: ${error.message || 'Sistemsel hata'}`,
                        metaData: { mode: request.mode, error: error.message }
                    }
                } as SendNotificationEvent },
            }).catch(() => undefined);
        }
    }

    /** Biriken toplu yazımları uygular; sayaç yalnız yeni/değişen kalemleri sayar, sonra bellek boşaltılır. */
    private async flushIntegration(integrationCode: string, stagedOpsMap: any, variantOpsMap: any, acceptedCountMap: any): Promise<void> {
        const stagedOps = stagedOpsMap[integrationCode];
        const variantOps = variantOpsMap[integrationCode];
        if (!stagedOps || stagedOps.length === 0) return;

        const [stagedResult] = await Promise.all([
            this.deps.clientDB.getExportStagedProductModel().bulkWrite(stagedOps, { ordered: false }),
            this.deps.clientDB.getVariantModel().bulkWrite(variantOps, { ordered: false })
        ]);
        acceptedCountMap[integrationCode] += (stagedResult.upsertedCount + stagedResult.modifiedCount);
        stagedOpsMap[integrationCode] = [];
        variantOpsMap[integrationCode] = [];
    }
}
