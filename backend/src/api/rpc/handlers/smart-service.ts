import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { containsRegex, toSearchString } from '@utils/search'
import { SmartSummaryRepository } from '@database/repositories/tenant/SmartSummaryRepository'

/** [GV-01] ReDoS/maliyet sınırı: sorgu ≤ 100 karakter, en çok 5 kelime (her kelime 4 koleksiyonda x çok alanda regex). */
const MAX_SEARCH_WORDS = 5

/**
 * SmartService
 * Merkezi akıllı arama servisi. Ürün, Müşteri, Sipariş ve İadeleri tek bir noktadan, 
 * çoklu kelime destekli (AND) ve performanslı bir şekilde arar.
 */
export default class SmartService extends BaseApi implements IService {
    // getter: test, servisi kurduktan SONRA svc.clientDB atıyor
    private get summaries() { return new SmartSummaryRepository(this.clientDB) }

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
            console.error('[SmartService] unifiedSearch Hatası:', error);
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

        return await this.summaries.searchProducts(matchQueries);
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

        return await this.summaries.searchCustomers(matchQueries);
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

        return await this.summaries.searchOrders(matchQueries);
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

        return await this.summaries.searchClaims(matchQueries);
    }
}
