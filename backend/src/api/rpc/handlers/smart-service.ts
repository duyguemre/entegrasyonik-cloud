import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { containsRegex, toSearchString } from '@utils/search'
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'smart-service');

/** [GV-01] ReDoS/maliyet sınırı: sorgu ≤ 100 karakter, en çok 5 kelime (her kelime 4 koleksiyonda x çok alanda regex). */
const MAX_SEARCH_WORDS = 5

/**
 * SmartService
 * Merkezi akıllı arama servisi. Ürün, Müşteri, Sipariş ve İadeleri tek bir noktadan, 
 * çoklu kelime destekli (AND) ve performanslı bir şekilde arar.
 */
export default class SmartService extends BaseApi implements IService {
    async get() {
        throw new Error('Method not implemented.');
    }

    async unifiedSearch(): Promise<any> {
        try {
            const query = toSearchString(this.request.query); // [GV-01] yalnız string, uzunluk sınırlı
            if (!query || query.trim().length < 2) {
                return { orders: [], products: [], customers: [], claims: [] };
            }

            // Arama sorgusunu kelimelere ayır (Really Smart Search - AND Logic)
            const keywords = query.split(' ').filter((word: string) => word.trim().length > 0).slice(0, MAX_SEARCH_WORDS);
            if (keywords.length === 0) return { orders: [], products: [], customers: [], claims: [] };

            // Tüm aramaları paralel olarak koştur
            const [orders, products, customers, claims] = await Promise.all([
                this.searchOrders(keywords),
                this.searchProducts(keywords),
                this.searchCustomers(keywords),
                this.searchClaims(keywords)
            ]);

            return { orders, products, customers, claims };
        } catch (error) {
            log.error('SMART_UNIFIED_SEARCH_FAILED', '[SmartService] unifiedSearch hatası', { err: error });
            throw error;
        }
    }

    /**
     * Ürünlerde Akıllı Arama
     * Başlık, Açıklama, Marka ve Kategoride arama yapar. Birinci görseli döner.
     */
    private async searchProducts(keywords: string[]): Promise<any[]> {
        const matchQueries = keywords.map((word: string) => {
            const searchRegex = containsRegex(word); // [GV-01] kaçışlı
            return {
                $or: [
                    { title: searchRegex },
                    { description: searchRegex },
                    { 'categoryDetail.title': searchRegex },
                    { 'brandDetail.title': searchRegex }
                ]
            };
        });

        return await this.clientDB.getProductModel().aggregate([
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
        ]);
    }

    /**
     * Müşterilerde Akıllı Arama
     * Ad, Soyad, Email, Telefon ve Kimlik bilgilerinde arama yapar.
     */
    private async searchCustomers(keywords: string[]): Promise<any[]> {
        const matchQueries = keywords.map((word: string) => {
            const searchRegex = containsRegex(word); // [GV-01] kaçışlı
            return {
                $or: [
                    { firstName: searchRegex },
                    { lastName: searchRegex },
                    { email: searchRegex },
                    { phone: searchRegex },
                    { taxNumber: searchRegex },
                    { companyName: searchRegex },
                    { 'externalIdentities.integrationCode': searchRegex }
                ]
            };
        });

        return await this.clientDB.getCustomerModel().find({ $and: matchQueries }, {
            _id: 1,
            firstName: 1,
            lastName: 1,
            phone: 1,
            email: 1
        }).limit(10).lean();
    }

    /**
     * Siparişlerde Akıllı Arama
     * Sipariş numarası, pazar yeri ID'si ve Müşteri isminde arama yapar.
     */
    private async searchOrders(keywords: string[]): Promise<any[]> {
        const matchQueries = keywords.map((word: string) => {
            const searchRegex = containsRegex(word); // [GV-01] kaçışlı
            return {
                $or: [
                    { orderNumber: searchRegex },
                    { externalOrderId: searchRegex },
                    { 'billingAddress.firstName': searchRegex },
                    { 'billingAddress.lastName': searchRegex },
                    { 'billingAddress.phone': searchRegex },
                    { 'fulfillment.trackingCode': searchRegex }
                ]
            };
        });

        return await this.clientDB.getOrderModel().find({ $and: matchQueries }, {
            _id: 1,
            orderNumber: 1,
            'billingAddress.firstName': 1,
            'billingAddress.lastName': 1,
            integrationCode: 1,
            'dates.orderDate': 1 // [ADR-0021 D1 / GV-02] şema alanı dates.orderDate (üst düzey orderDate yoktu)
        }).sort({ 'dates.orderDate': -1 }).limit(10).lean();
    }

    /**
     * İadelerde (Claims) Akıllı Arama
     * İade ID, Sipariş ID ve Müşteri isminde arama yapar.
     */
    private async searchClaims(keywords: string[]): Promise<any[]> {
        const matchQueries = keywords.map((word: string) => {
            const searchRegex = containsRegex(word); // [GV-01] kaçışlı
            return {
                $or: [
                    { externalClaimId: searchRegex },
                    { externalOrderId: searchRegex },
                    { 'customerDetail.firstName': searchRegex },
                    { 'customerDetail.lastName': searchRegex }
                ]
            };
        });

        return await this.clientDB.getClaimModel().aggregate([
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
        ]);
    }
}
