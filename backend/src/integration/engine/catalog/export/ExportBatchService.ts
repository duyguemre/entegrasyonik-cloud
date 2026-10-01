import { ObjectId } from 'mongodb';
import { IApplicationDB, IClientDB, PLATFORM_PROCESS, SendNotificationEvent } from '@interfaces/index';
import IntegrationFactory from '../../../modules/IntegrationFactory';
import { EVENTS, integrationEventBus } from '../../IntegrationEventBus';
import { NotificationService } from '@services/notification/NotificationService';
import { safeErrorCode } from '@operations/notifications/safeError';
import { getRequestId } from '@platform/core/context';
import { eventLog } from '@platform/core/logger';

const log = eventLog('engine', 'ExportBatchService');
const BULK_LIMIT = 1000;

/** Mod bazlı başlangıç öncelik skoru (Dispatcher sırası). */
const INITIAL_PRIORITY: Record<string, number> = {
    [PLATFORM_PROCESS.UPDATE_PRICE]: 130,
    [PLATFORM_PROCESS.UPDATE_STOCK]: 120,
    [PLATFORM_PROCESS.UPDATE]: 70,
    [PLATFORM_PROCESS.TRANSFER]: 60,
    [PLATFORM_PROCESS.UPDATE_VARIANT]: 50,
    [PLATFORM_PROCESS.UPDATE_DELIVERY]: 40,
};
export function getInitialPriorityScore(mode: string): number {
    return INITIAL_PRIORITY[mode] || 50;
}

export interface ExportBatchRequest { mode: string; selectedIntegrations: string[]; barcodeList?: string[]; scope?: number }

/**
 * ADR-0024 D6 / P3-INT: toplu dışa aktarım paketi oluşturucu (eski `IntegrationService.internalProcessBatch`; davranış BİREBİR).
 * Varyantlar TEK geçişte okunur, seçili her entegrasyon için `ExportStagedProducts` upsert + varyant `platforms.<kod>.upload.<mod>`
 * durumu QUEUED yazılır (1000'lik toplu yazım); kabul edilen sayı `ExportFlags.queuedCount`'a eklenir ve orkestratör uyandırılır.
 * Sonuç/hata kullanıcıya bildirim olarak gider (ADR-0029 NB3; bayrak kapalıyken eski olay birebir). Hata DIŞARI FIRLATILMAZ.
 *
 * `clientId`: handler'ın `currentClientId` değeri olduğu gibi (eski olay gövdesi bu değeri taşır).
 */
export class ExportBatchService {
    constructor(private readonly clientId: any, private readonly applicationDB: IApplicationDB, private readonly clientDB: IClientDB) { }

    async run(request: ExportBatchRequest): Promise<void> {
        const { mode, selectedIntegrations, barcodeList, scope } = request;
        const requestId = new ObjectId().toString();
        try {
            const now = new Date();
            const clientId = this.clientId;
            const initialScore = getInitialPriorityScore(mode);

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
                const instance = await factory.getInstance(integrationCode as any);
                matchKeyMap[integrationCode] = (instance.getMatchKey() || 'barcode').toLowerCase();
            }

            const query: any = {};
            if (scope !== 2) {
                query.$or = [{ barcode: { $in: barcodeList } }, { stockcode: { $in: barcodeList } }];
            }

            log.info('EXPORT_BATCH_STARTED', 'Toplu dışa aktarım varyant taraması başladı.', { tenantId: Number(clientId), mode, selectedIntegrations, matchKeyMap });

            // Projeksiyon: kimlik alanları + ilk görsel + seçili kanalların upload durumu + kanal eşleşme anahtarları
            const projection: any = { barcode: 1, stockcode: 1, productId: 1, images: { $slice: 1 } };
            for (const code of selectedIntegrations) projection[`platforms.${code}.upload`] = 1;
            Object.values(matchKeyMap).forEach(key => { projection[key] = 1; });

            const cursor = this.clientDB.getVariantModel()
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
                        log.error('EXPORT_BATCH_MATCH_VALUE_MISSING', 'Varyantta kanal eşleşme değeri yok; atlandı.', { tenantId: Number(clientId), integrationCode, variantId: String(v._id), matchKey });
                        continue;
                    }

                    const minimalPayload = { barcode: v.barcode, stockcode: v.stockcode, productId: v.productId, upload: platformInfo };
                    stagedOpsMap[integrationCode].push({
                        updateOne: {
                            filter: { [matchKey]: matchValue, mode, integrationCode, status: { $in: ['QUEUED', 'PREPARING'] } },
                            update: {
                                $set: { clientId, productId: v.productId, image: v.images?.[0], payload: minimalPayload, status: 'QUEUED', priorityScore: initialScore, nextRunAt: now, updatedAt: now, barcode: v.barcode, stockcode: v.stockcode },
                                $setOnInsert: { createdAt: now, requestId, changeType: 'CONTENT', batchId: null, logs: [{ status: 'QUEUED', worker: 'BatchCreator', message: `İşlem sıraya alındı.`, timestamp: now }] },
                            },
                            upsert: true,
                        },
                    });
                    variantOpsMap[integrationCode].push({
                        updateOne: {
                            filter: { [matchKey]: matchValue },
                            update: { $set: { [`platforms.${integrationCode}.upload.${mode}.status`]: 'QUEUED', [`platforms.${integrationCode}.upload.${mode}.updatedAt`]: now } },
                        },
                    });

                    if (stagedOpsMap[integrationCode].length >= BULK_LIMIT) {
                        await this.flushIntegration(integrationCode, stagedOpsMap, variantOpsMap, acceptedCountMap);
                    }
                }
            }

            log.info('EXPORT_BATCH_SCANNED', 'Toplu dışa aktarım varyant taraması bitti.', { tenantId: Number(clientId), totalVariantsProcessed });
            for (const integrationCode of selectedIntegrations) {
                // Kalan son kayıtları işle
                await this.flushIntegration(integrationCode, stagedOpsMap, variantOpsMap, acceptedCountMap);

                const totalAccepted = acceptedCountMap[integrationCode];
                const totalNoTransferSkipped = skippedForNoTransferCountMap[integrationCode];
                const totalAlreadyTransfer = skippedForAlreadyTransferCountMap[integrationCode];
                log.info('EXPORT_BATCH_RESULT', 'Toplu dışa aktarım kanal sonucu.', { tenantId: Number(clientId), integrationCode, totalAccepted, totalAlreadyTransfer, totalNoTransferSkipped });

                if (totalAccepted > 0) {
                    await this.applicationDB.getExportFlagModel().updateOne(
                        { clientId, integrationCode },
                        { $inc: { queuedCount: totalAccepted }, $set: { lastUpdatedAt: now } },
                        { upsert: true },
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
                            metaData: { integrationCode, mode, totalAccepted, totalAlreadyTransfer, totalNoTransferSkipped },
                        },
                    } as SendNotificationEvent },
                }).catch(() => undefined);
            }
        } catch (error: any) {
            log.error('EXPORT_BATCH_FAILED', 'Toplu dışa aktarım işlemi başarısız.', { tenantId: Number(this.clientId), err: error });

            // [ADR-0029 NB3, N-05] Kullaniciya ham error.message GITMEZ: guvenli hata kodu + corrId. Bayrak kapaliyken eski olay
            // (ham mesaj dahil) birebir korunur; bayrak acilinca bu yol devreye girmez.
            const integs: string[] = Array.isArray(selectedIntegrations) ? selectedIntegrations : [];
            void NotificationService.notify('CATALOG_BATCH_FAILED', Number(this.clientId), {
                integ: (integs.length === 1 ? integs[0] : 'multi').slice(0, 60), mode: String(mode ?? 'unknown'), batchId: requestId,
                errorCode: safeErrorCode(error), corrId: getRequestId(),
            }, {
                idempotencyKey: `batch-failed:${requestId}`,
                corrId: getRequestId(),
                module: 'IntegrationService',
                legacy: { event: {
                    clientId: this.clientId,
                    notificationData: {
                        type: 'BATCH_PROCESS',
                        mode: mode,
                        severity: 'error',
                        title: 'İşlem Başarısız',
                        message: `Toplu işlem sırasında bir hata oluştu: ${error.message || 'Sistemsel hata'}`,
                        metaData: { mode: request.mode, error: error.message },
                    },
                } as SendNotificationEvent },
            }).catch(() => undefined);
        }
    }

    /** Biriken toplu yazımları uygular; kabul sayacına yalnız yeni/değişen staged kayıtlar eklenir. */
    private async flushIntegration(integrationCode: string, stagedOpsMap: Record<string, any[]>, variantOpsMap: Record<string, any[]>, acceptedCountMap: Record<string, number>) {
        const stagedOps = stagedOpsMap[integrationCode];
        const variantOps = variantOpsMap[integrationCode];
        if (!stagedOps || stagedOps.length === 0) return;

        const [stagedResult] = await Promise.all([
            this.clientDB.getExportStagedProductModel().bulkWrite(stagedOps, { ordered: false }),
            this.clientDB.getVariantModel().bulkWrite(variantOps, { ordered: false }),
        ]);
        acceptedCountMap[integrationCode] += (stagedResult.upsertedCount + stagedResult.modifiedCount);
        stagedOpsMap[integrationCode] = [];
        variantOpsMap[integrationCode] = [];
    }
}
