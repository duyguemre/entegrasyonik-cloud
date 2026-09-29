import { DatabaseManagerInstance } from '@database/index';
import { IClaim } from '@interfaces/claim';
import { getLogPrefix, LoggerType } from '@utils/Logger';

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
            }).select('externalClaimId').lean();

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
                const updateData: any = {
                    externalStatus: claim.externalStatus,
                    internalStatus: claim.internalStatus,
                    totalRefundAmount: claim.totalRefundAmount || 0,
                    items: claim.items, // Ürün listesi güncellenebilir
                    meta: claim.meta,
                    resolvedAt: claim.resolvedAt,
                    externalUpdatedAt: claim.externalUpdatedAt || new Date()
                };

                // Eğer orderId sonradan bulunduysa güncelle
                if (claim.orderId) updateData.orderId = claim.orderId;
                if (claim.customerId) updateData.customerId = claim.customerId;
                if (claim.fulfillment) updateData.fulfillment = claim.fulfillment;

                const insertData = {
                    integrationCode: claim.integrationCode,
                    externalClaimId: claim.externalClaimId,
                    externalOrderId: claim.externalOrderId,
                    type: claim.type,
                    currencyCode: claim.currencyCode || 'TRY',
                    claimedAt: claim.claimedAt || new Date(),
                    history: claim.history || []
                };

                return {
                    updateOne: {
                        filter: {
                            integrationCode: claim.integrationCode,
                            externalClaimId: claim.externalClaimId
                        },
                        update: {
                            $set: updateData,
                            $setOnInsert: insertData
                        },
                        upsert: true
                    }
                };
            });

            // 4. Veritabanına Yaz
            const result = await ClaimModel.bulkWrite(bulkOps, { ordered: false });

            console.log(`${this.logPrefix} Persistence: ${result.upsertedCount} Yeni İade, ${result.modifiedCount} Güncelleme.`);

            return { insertedExternalIds, updatedExternalIds };

        } catch (error) {
            console.error(`${this.logPrefix} saveClaims Hatası:`, error);
            throw error;
        }
    }

    public async getClaimsByOrderId(clientId: number, externalOrderId: string): Promise<IClaim[]> {
        const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
        const ClaimModel = clientDb!.getClaimModel();
        return await ClaimModel.find({ externalOrderId }).lean<IClaim[]>().exec();
    }
}