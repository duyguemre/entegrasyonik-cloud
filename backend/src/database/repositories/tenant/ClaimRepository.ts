import type { IClientDB } from '@interfaces/common';
import { DatabaseManagerInstance } from '@database/index';
import { IClaim } from '@interfaces/claim';
import { getLogPrefix, LoggerType } from '@utils/Logger';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'ClaimRepository');

export interface ISaveClaimResponse {
    insertedExternalIds: string[];
    updatedExternalIds: string[];
}

export class ClaimRepository {
    private workerName: LoggerType = "Claim Repository"
    private logPrefix!: string;

    /**
     * ADR-0024 Dalga 3 (P3-ORD): RPC/use-case yolu kurucuda tenant DB tutamacını alır (clientId parametresi yok); motor (ingest)
     * yöntemleri tutamaçsız örnekte `clientId` ile çalışmayı sürdürür.
     */
    constructor(private readonly tenantDb?: IClientDB) { }

    /** Tutamaçsız örnekte RPC yöntemi çağrılırsa eski handler gibi TypeError oluşur (ek kontrol yok). */
    private tenant(): IClientDB {
        return this.tenantDb as IClientDB;
    }

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

    // ---- Tenant-bağlı (RPC) yöntemler: sorgu biçimleri eski handler gövdeleriyle BİREBİR ----

    private get claims() { return this.tenant().getClaimModel(); }

    /** Sayfalı liste + müşteri özeti (adres/metrik/kimlik alanları hariç). */
    async pagedSearch(match: Record<string, any>, sort: Record<string, any>, skip: number, limit: number): Promise<{ total: number; items: any[] }> {
        const result = await this.claims.aggregate([
            { $match: match },
            { $sort: sort },
            {
                $facet: {
                    totalNumberOfRecords: [{ $count: 'count' }],
                    claims: [
                        { $skip: skip },
                        { $limit: limit },
                        { $lookup: { from: 'Customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
                        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
                        { $project: { 'customer.addresses': 0, 'customer.metrics': 0, 'customer.externalIdentities': 0 } },
                    ],
                },
            },
        ]);
        const aggregationResult = result[0] || {};
        return { total: aggregationResult.totalNumberOfRecords?.[0]?.count || 0, items: aggregationResult.claims || [] };
    }

    /** Mongoose sorgusu döner (çağıran `.populate` zincirleyebilir). */
    findById(id: unknown): any {
        return this.claims.findById(id);
    }

    /** `options` verilmezse sürücüye iki argümanla gider (eski çağrı biçimi). */
    updateById(id: unknown, update: Record<string, any>, options?: Record<string, any>): Promise<any> {
        return options === undefined ? this.claims.findByIdAndUpdate(id, update) : this.claims.findByIdAndUpdate(id, update, options);
    }

    recentByCustomer(customerId: unknown): Promise<any[]> {
        return this.claims.find({ customerId }).sort({ createdAt: -1 }).limit(20).lean();
    }

    /** İade sayısı ve tutarı (iptal/red hariç). */
    returnTotals(): Promise<any[]> {
        return this.claims.aggregate([
            { $match: { internalStatus: { $nin: ['CANCELLED', 'REJECTED'] } } },
            { $group: { _id: null, totalReturnCount: { $sum: 1 }, totalReturnAmount: { $sum: '$totalRefundAmount' } } },
        ]);
    }

    countAwaitingAction(): Promise<number> {
        return this.claims.countDocuments({ internalStatus: { $in: ['WAITING', 'SHIPPED', 'DELIVERED'] } });
    }
}
