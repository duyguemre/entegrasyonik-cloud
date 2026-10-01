import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { CustomerPanelRepository } from '@database/repositories/tenant/CustomerPanelRepository'
import { listCustomers, customerDetail, updateCustomer, anonymizeCustomer, CUSTOMER_SORT_FIELDS } from '@operations/orders/customers'

export { CUSTOMER_SORT_FIELDS }

/**
 * CustomerService
 * Müşteri yönetimi, CRM analitiği ve platformlar arası kimlik çözümleme mantığını yönetir (ADR-0024 Dalga 3 P3-ORD:
 * sorgular `CustomerPanelRepository`'de, iş kuralları `operations/orders/customers`'ta; RPC adları/yanıtlar değişmedi).
 */
export default class CustomerService extends BaseApi implements IService {

    private get customers(): CustomerPanelRepository { return new CustomerPanelRepository(this.clientDB) }

    async get(): Promise<any> {
        // Standart IService gereksinimi (Gerektiğinde tekil get için doldurulabilir)
    }

    /** Müşteri listesini filtreleme, sayfalama ve temel finansal içgörülerle döner. */
    async getCustomers(): Promise<any> {
        try {
            return await listCustomers(this.customers, this.request);
        } catch (error) {
            console.error('[CustomerService] getCustomers Hatası:', error);
            throw error;
        }
    }

    /** Tekil müşteri kartı verisini döner. */
    async getCustomerDetail(): Promise<any> {
        try {
            return await customerDetail(this.customers, this.request.customerId);
        } catch (error) {
            console.error('[CustomerService] getCustomerDetail Hatası:', error);
            throw error;
        }
    }

    /** Müşteri bilgilerini günceller. */
    async updateCustomer(): Promise<any> {
        try {
            const { customerId, updateData } = this.request;
            return await updateCustomer(this.customers, customerId, updateData);
        } catch (error) {
            console.error('[CustomerService] updateCustomer Hatası:', error);
            throw error;
        }
    }

    /** Son kullanıcı (pazaryeri müşterisi) anonimleştirme — ADR-0003 adım 8 (Karar F.23); PII envanteri operations'ta. */
    async anonymizeCustomer(): Promise<any> {
        try {
            return await anonymizeCustomer(this.customers, this.request.customerId);
        } catch (error) {
            console.error('[CustomerService] anonymizeCustomer Hatası:', error);
            throw error;
        }
    }
}
