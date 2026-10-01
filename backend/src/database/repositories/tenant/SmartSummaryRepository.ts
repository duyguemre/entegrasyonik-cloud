import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-CAT): akıllı arama (SmartService.unifiedSearch) için ürün/müşteri/sipariş/iade ÖZET sorguları.
 * Amaca göre adlandırılmış okuma-yalnız repository'dir (arama sonucu şekli): her sorgu en çok 10 satır döner.
 * `matchQueries`: kelime başına `$or` koşullarının dizisi (AND mantığı; regex kaçışı çağıranda yapılır).
 */
export class SmartSummaryRepository {
    constructor(private readonly db: IClientDB) { }

    async searchProducts(matchQueries: any[]): Promise<any[]> {
        return await this.db.getProductModel().aggregate([
            {
                $lookup: {
                    from: 'Categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'categoryDetail'
                }
            },
            {
                $lookup: {
                    from: 'Brands',
                    localField: 'brand',
                    foreignField: '_id',
                    as: 'brandDetail'
                }
            },
            { $match: { $and: matchQueries } },
            { $limit: 10 },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    image: { $arrayElemAt: ["$images.url", 0] },
                    price: "$prices.minSalePrice",
                    stock: "$stock",
                    brand: { $arrayElemAt: ["$brandDetail.title", 0] }
                }
            }
        ])
    }

    async searchCustomers(matchQueries: any[]): Promise<any[]> {
        return await this.db.getCustomerModel().find({ $and: matchQueries }, {
            _id: 1,
            firstName: 1,
            lastName: 1,
            phone: 1,
            email: 1
        }).limit(10).lean()
    }

    async searchOrders(matchQueries: any[]): Promise<any[]> {
        return await this.db.getOrderModel().find({ $and: matchQueries }, {
            _id: 1,
            orderNumber: 1,
            'billingAddress.firstName': 1,
            'billingAddress.lastName': 1,
            integrationCode: 1,
            'dates.orderDate': 1 // [ADR-0021 D1 / GV-02] şema alanı dates.orderDate (üst düzey orderDate yoktu)
        }).sort({ 'dates.orderDate': -1 }).limit(10).lean()
    }

    async searchClaims(matchQueries: any[]): Promise<any[]> {
        return await this.db.getClaimModel().aggregate([
            {
                $lookup: {
                    from: 'Customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customerDetail'
                }
            },
            { $match: { $and: matchQueries } },
            { $limit: 10 },
            {
                $project: {
                    _id: 1,
                    externalClaimId: 1,
                    externalOrderId: 1,
                    type: 1,
                    integrationCode: 1,
                    customer: {
                        firstName: { $arrayElemAt: ["$customerDetail.firstName", 0] },
                        lastName: { $arrayElemAt: ["$customerDetail.lastName", 0] }
                    }
                }
            }
        ])
    }
}
