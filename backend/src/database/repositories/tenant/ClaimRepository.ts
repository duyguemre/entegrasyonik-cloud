import { DatabaseManagerInstance } from '@database/index';
import { IClaim } from '@interfaces/claim';
import { getLogPrefix, LoggerType } from '@utils/Logger';
import { eventLog } from '@platform/core/logger';
import { decideClaimSync, initialResolvedAt } from '@platform/core/orders/claimStatus';

const log = eventLog('worker', 'ClaimRepository');

export interface ISaveClaimResponse {
    insertedExternalIds: string[];
    updatedExternalIds: string[];
}

export class ClaimRepository {
    private workerName: LoggerType = "Claim Repository"
    private logPrefix!: string;

    public async saveClaims(clientId: number, claims: IClaim[]): Promise<ISaveClaimResponse> {
        if (!claims || claims.length === 0) return { insertedExternalIds: [], updatedExternalIds: [] };

        try {
            this.logPrefix = getLogPrefix(this.workerName, clientId, "");
            const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
            if (!clientDb) throw new Error(`${this.logPrefix} Client DB bulunamadı.`);

            const ClaimModel = clientDb.getClaimModel();
            const OrderModel = clientDb.getOrderModel();

            const incomingExternalClaimIds = claims.map(c => c.externalClaimId);
            const integrationCode = claims[0]?.integrationCode;

            // 1. Mevcut iadeleri çek (Hangi iade update, hangi iade insert bilelim)
            const existingClaims = await ClaimModel.find({
                integrationCode,
                externalClaimId: { $in: incomingExternalClaimIds }
            }).select('externalClaimId internalStatus resolvedAt').lean();

            const existingClaimsMap = new Map(existingClaims.map((c: any) => [c.externalClaimId, c]));

            // 2. Sipariş eşleşmesi (OrderId ve CustomerId bütünlüğü için)
            const externalOrderIds = [...new Set(claims.map(c => c.externalOrderId))];
            const relatedOrders = await OrderModel.find({
                integrationCode,
                externalOrderId: { $in: externalOrderIds }
            }).select('_id externalOrderId customerId').lean();

            const orderMap = new Map(relatedOrders.map((o: any) => [o.externalOrderId, o]));

            const insertedExternalIds: string[] = [];
            const updatedExternalIds: string[] = [];

            // 3. Bulk Operations Hazırlığı
            const bulkOps = claims.map(claim => {
                const relatedOrder = orderMap.get(claim.externalOrderId);
                const isExisting = existingClaimsMap.has(claim.externalClaimId);

                isExisting
                    ? updatedExternalIds.push(claim.externalClaimId)
                    : insertedExternalIds.push(claim.externalClaimId);

                // Eğer sipariş sistemde varsa, iadeyi o siparişe ve müşteriye mühürle
                if (relatedOrder) {
                    claim.orderId = relatedOrder._id;
                    if (!claim.customerId && relatedOrder.customerId) {
                        claim.customerId = relatedOrder.customerId;
                    }
                }

                /**
                 * KRİTİK DEĞİŞİKLİK: 
                 * Items ve TotalRefundAmount artık $set içinde. 
                 * Çünkü iade içeriği pazar yerinde sonradan değişebilir.
                 */
                // F-P1-9: iade içeriği VE yaşam çizgisi sync ile güncellenir. `externalUpdatedAt` yalnız platform
                // zamanıdır (eskiden yoksa `new Date()` yazılıyordu → tespit anı platform zamanı sanılıyordu).
                const now = new Date();
                const updateData: any = {
                    externalStatus: claim.externalStatus,
                    internalStatus: claim.internalStatus,
                    totalRefundAmount: claim.totalRefundAmount || 0,
                    items: claim.items, // Ürün listesi (kalem durumları dahil, D-TY-6) güncellenebilir
                    meta: claim.meta,
                };
                if (claim.externalUpdatedAt) updateData.externalUpdatedAt = claim.externalUpdatedAt;

                // Eğer orderId sonradan bulunduysa güncelle
                if (claim.orderId) updateData.orderId = claim.orderId;
                if (claim.customerId) updateData.customerId = claim.customerId;
                if (claim.fulfillment) updateData.fulfillment = claim.fulfillment;

                const insertData: any = {
                    integrationCode: claim.integrationCode,
                    externalClaimId: claim.externalClaimId,
                    externalOrderId: claim.externalOrderId,
                    type: claim.type,
                    currencyCode: claim.currencyCode || 'TRY',
                    claimedAt: claim.claimedAt || now,
                };
                const update: any = { $set: updateData, $setOnInsert: insertData };

                const existing: any = existingClaimsMap.get(claim.externalClaimId);
                if (existing) {
                    // `history` `$setOnInsert`'te OLMAMALI: aynı yola `$push` ile çakışır (Mongo conflict).
                    const decision = decideClaimSync(existing, claim, now);
                    if (decision.historyEntry) update.$push = { history: decision.historyEntry };
                    if (decision.resolvedAt === null) update.$unset = { resolvedAt: '' };
                    else if (decision.resolvedAt) updateData.resolvedAt = decision.resolvedAt;
                } else {
                    insertData.history = claim.history || [];
                    const resolvedAt = initialResolvedAt(claim, now);
                    if (resolvedAt) updateData.resolvedAt = resolvedAt;
                }

                return {
                    updateOne: {
                        filter: {
                            integrationCode: claim.integrationCode,
                            externalClaimId: claim.externalClaimId
                        },
                        update,
                        upsert: true
                    }
                };
            });

            // 4. Veritabanına Yaz
            const result = await ClaimModel.bulkWrite(bulkOps, { ordered: false });

            log.info('CLAIMREPOSITORY_PERSISTENCE_YENI_IADE_GUNCELLEME', `Persistence: ${result.upsertedCount} Yeni İade, ${result.modifiedCount} Güncelleme.`);

            return { insertedExternalIds, updatedExternalIds };

        } catch (error) {
            log.error('CLAIMREPOSITORY_SAVECLAIMS_HATASI', 'saveClaims Hatası:', { err: error });
            throw error;
        }
    }

    public async getClaimsByOrderId(clientId: number, externalOrderId: string): Promise<IClaim[]> {
        const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
        const ClaimModel = clientDb!.getClaimModel();
        return await ClaimModel.find({ externalOrderId }).lean<IClaim[]>().exec();
    }
}