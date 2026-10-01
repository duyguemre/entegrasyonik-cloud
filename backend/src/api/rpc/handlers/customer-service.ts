import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { CustomerPanelRepository } from '@database/repositories/tenant/CustomerPanelRepository'
import { listCustomers, customerDetail, updateCustomer, anonymizeCustomer } from '@operations/orders/customers'
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'customer-service');


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
            log.error('CUSTOMER_GET_CUSTOMERS_FAILED', '[CustomerService] getCustomers hatası', { err: error });
            throw error;
        }
    }

    /** Tekil müşteri kartı verisini döner. */
    async getCustomerDetail(): Promise<any> {
        try {
            return await customerDetail(this.customers, this.request.customerId);
        } catch (error) {
            log.error('CUSTOMER_GET_CUSTOMER_DETAIL_FAILED', '[CustomerService] getCustomerDetail hatası', { err: error });
            throw error;
        }
    }

    /** Müşteri bilgilerini günceller. */
    async updateCustomer(): Promise<any> {
        try {
            const { customerId, updateData } = this.request;
            return await updateCustomer(this.customers, customerId, updateData);
        } catch (error) {
            log.error('CUSTOMER_UPDATE_CUSTOMER_FAILED', '[CustomerService] updateCustomer hatası', { err: error });
            throw error;
        }
    }

    /** Son kullanıcı (pazaryeri müşterisi) anonimleştirme — ADR-0003 adım 8 (Karar F.23); PII envanteri operations'ta. */
    async anonymizeCustomer(): Promise<any> {
        try {
            return await anonymizeCustomer(this.customers, this.request.customerId);
        } catch (error) {
            log.error('CUSTOMER_ANONYMIZE_CUSTOMER_FAILED', '[CustomerService] anonymizeCustomer hatası', { err: error });
            throw error;
        }
    }
}
