import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import * as customers from '@operations/orders/customers'

/** [DB-02] Sıralama alanı izin listesi (kaynak: operations/orders/customers). */
export const CUSTOMER_SORT_FIELDS = customers.CUSTOMER_SORT_FIELDS

/**
 * CustomerService — müşteri yönetimi ve CRM analitiği RPC cephesi (ADR-0024 P3-ORD). İş akışları `operations/orders/customers`,
 * sorgular `database/repositories/tenant/*Repository` (RPC adları ve yanıt biçimleri değişmez).
 */
export default class CustomerService extends BaseApi implements IService {

    async get(): Promise<any> {
        // Standart IService gereksinimi (Gerektiğinde tekil get için doldurulabilir)
    }

    /** Müşteri listesi: filtreleme, sayfalama ve temel finansal içgörüler. */
    async getCustomers(): Promise<any> {
        try {
            return await customers.searchCustomers(this.clientDB, this.request)
        } catch (error) {
            console.error('[CustomerService] getCustomers Hatası:', error);
            throw error;
        }
    }

    /** Tekil müşteri kartı. */
    async getCustomerDetail(): Promise<any> {
        try {
            return await customers.getCustomerDetail(this.clientDB, this.request.customerId)
        } catch (error) {
            console.error('[CustomerService] getCustomerDetail Hatası:', error);
            throw error;
        }
    }

    /** Müşteri bilgilerini günceller. */
    async updateCustomer(): Promise<any> {
        try {
            const { customerId, updateData } = this.request
            return await customers.updateCustomer(this.clientDB, customerId, updateData)
        } catch (error) {
            console.error('[CustomerService] updateCustomer Hatası:', error);
            throw error;
        }
    }

    /** ADR-0003 adım 8 (Karar F.23): son kullanıcı silme talebi — kişisel alanlar geri döndürülemez maskelenir. */
    async anonymizeCustomer(): Promise<any> {
        try {
            return await customers.anonymizeCustomer(this.clientDB, this.request.customerId)
        } catch (error) {
            console.error('[CustomerService] anonymizeCustomer Hatası:', error);
            throw error;
        }
    }
}
