import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import * as invoices from '@operations/orders/invoices'

/**
 * ADR-0024 P3-ORD: fatura RPC cephesi. İş akışları `operations/orders/invoices`, sorgular
 * `database/repositories/tenant/{Invoice,Order}Repository` (RPC adları ve yanıt biçimleri değişmez).
 */
export default class InvoiceService extends BaseApi implements IService {

    private get deps(): invoices.InvoiceDeps {
        return { clientDB: this.clientDB, clientId: this.currentClientId }
    }

    async get(): Promise<any> {
    }

    async createManualInvoice(): Promise<any> {
        return invoices.createManualInvoice(this.clientDB, this.request)
    }

    async getInvoices(): Promise<any> {
        return invoices.searchInvoices(this.clientDB, this.request)
    }

    async deleteInvoice(): Promise<any> {
        return invoices.deleteInvoice(this.clientDB, this.request.invoiceId)
    }

    /** FATURA OLUŞTURMA / KAYDETME (platform bildirimi önce, sipariş güncellemesi sonra). */
    async createInvoice(): Promise<any> {
        const { orderId, invoiceData } = this.request
        return invoices.createInvoice(this.deps, orderId, invoiceData)
    }

    /** TOPLU FATURA OLUŞTURMA */
    async bulkCreateInvoice(): Promise<any> {
        return invoices.bulkCreateInvoice(this.deps, this.request.orderIds)
    }

    /** UYUMSUZLUK ÇÖZÜMLEME VE YENİDEN FATURALANDIRMA */
    async resolveAndReissueInvoice(): Promise<any> {
        try {
            return await invoices.resolveAndReissueInvoice(this.deps, this.request.orderId)
        } catch (error) {
            console.error('[InvoiceService] Error:', error);
            throw error;
        }
    }
}
