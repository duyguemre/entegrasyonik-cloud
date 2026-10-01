import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { InvoicePanelRepository } from '@database/repositories/tenant/InvoicePanelRepository'
import { createManualInvoice, listInvoices, deleteInvoice, createInvoice, bulkCreateInvoices, resolveAndReissueInvoice } from '@operations/orders/invoices'

/**
 * Fatura RPC cephesi (ADR-0024 Dalga 3 P3-ORD). Sorgular `InvoicePanelRepository`'de, iş kuralları `operations/orders/invoices`'da;
 * RPC adları ve yanıt biçimleri değişmedi. Tenant izolasyonu `this.clientDB` (tenant DB) seçimiyle.
 */
export default class InvoiceService extends BaseApi implements IService {

    private get invoices(): InvoicePanelRepository { return new InvoicePanelRepository(this.clientDB) }
    private get deps() {
        return {
            repo: this.invoices,
            clientId: Number(this.currentClientId),
            logError: (message: string, error: unknown) => console.error(message, error)
        }
    }

    async get(): Promise<any> {
    }

    async createManualInvoice(): Promise<any> {
        return createManualInvoice(this.invoices, this.request);
    }

    async getInvoices(): Promise<any> {
        return listInvoices(this.invoices, this.request);
    }

    async deleteInvoice(): Promise<any> {
        const { invoiceId } = this.request;
        return deleteInvoice(this.invoices, invoiceId);
    }

    /**
     * FATURA OLUŞTURMA / KAYDETME
     */
    async createInvoice(): Promise<any> {
        const { orderId, invoiceData } = this.request;
        return createInvoice(this.deps, orderId, invoiceData);
    }

    /**
     * TOPLU FATURA OLUŞTURMA
     */
    async bulkCreateInvoice(): Promise<any> {
        const { orderIds } = this.request;
        const originalRequest = { ...this.request };
        const result = await bulkCreateInvoices(this.invoices, orderIds, (orderId) => {
            this.request = { orderId };
            return this.createInvoice();
        });
        this.request = originalRequest;
        return result;
    }

    /**
     * UYUMSUZLUK ÇÖZÜMLEME VE YENİDEN FATURALANDIRMA
     */
    async resolveAndReissueInvoice(): Promise<any> {
        try {
            const { orderId } = this.request;
            return await resolveAndReissueInvoice(this.invoices, orderId, () => {
                this.request = { orderId };
                return this.createInvoice();
            });
        } catch (error) {
            console.error('[InvoiceService] Error:', error);
            throw error;
        }
    }
}
