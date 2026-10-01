import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-ADM): yönetici panelinin HEDEF tenant (targetDB) üzerindeki salt-okunur sayım/özet sorguları.
 * Tutamak, `DatabaseManagerInstance.getClientDB(targetClientId)` ile çağıran tarafından hedef tenant için alınır.
 */
export class TenantFootprintRepository {
    constructor(private readonly db: IClientDB) { }

    /** Ürün/varyant/sipariş/iade/kullanıcı sayıları (koşut). */
    async countEntities(): Promise<{ productCount: number; variantCount: number; orderCount: number; claimCount: number; userCount: number }> {
        const [productCount, variantCount, orderCount, claimCount, userCount] = await Promise.all([
            this.db.getProductModel().countDocuments({}),
            this.db.getVariantModel().countDocuments({}),
            this.db.getOrderModel().countDocuments({}),
            this.db.getClaimModel().countDocuments({}),
            this.db.getUserModel().countDocuments({})
        ])
        return { productCount, variantCount, orderCount, claimCount, userCount }
    }

    /** En son istatistik kaydı (ciro/iade tutarı). */
    async latestStatistics(): Promise<any> {
        return await this.db.getStatisticsModel().findOne({}).sort({ createdAt: -1 }).lean()
    }

    async listActiveIntegrations(): Promise<any[]> {
        return await this.db.getClientIntegrationModel().find({ isActive: true }).lean()
    }
}
