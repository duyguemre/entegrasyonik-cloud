import { DatabaseManagerInstance } from '@database/index';
import { IInvoice } from '@interfaces/invoice';
import { getLogPrefix, LoggerType } from '@utils/Logger';

export interface ISaveInvoiceResponse {
    insertedExternalIds: string[];
    updatedExternalIds: string[];
}

export class InvoiceRepository {
    private workerName: LoggerType = "Invoice Repository"
    private logPrefix!: string;

    public async saveInvoices(clientId: number, invoices: IInvoice[]): Promise<ISaveInvoiceResponse> {
        if (!invoices || invoices.length === 0) return { insertedExternalIds: [], updatedExternalIds: [] };

        try {
            this.logPrefix = getLogPrefix(this.workerName, clientId, "");
            const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
            if (!clientDb) throw new Error(`${this.logPrefix} Client DB bulunamadı.`);

            const InvoiceModel = clientDb.getInvoiceModel();
            const OrderModel = clientDb.getOrderModel();

            const incomingExternalInvoiceIds = invoices.map(i => i.externalInvoiceId).filter(id => id);
            const incomingExternalOrderIds = invoices.map(i => i.externalOrderId).filter(id => id);
            const integrationCode = invoices[0]?.integrationCode;

            // 1. Mevcut faturaları çek
            let existingInvoices: any[] = [];
            if (incomingExternalInvoiceIds.length > 0) {
               existingInvoices = await InvoiceModel.find({
                   integrationCode,
                   externalInvoiceId: { $in: incomingExternalInvoiceIds }
               }).select('externalInvoiceId invoiceMethod').lean();
            }

            const existingInvoicesMap = new Map(existingInvoices.map((i: any) => [i.externalInvoiceId, i]));

            // 2. Sipariş eşleşmesi (OrderId ve CustomerId bütünlüğü için)
            const relatedOrders = await OrderModel.find({
                integrationCode,
                externalOrderId: { $in: incomingExternalOrderIds }
            }).select('_id externalOrderId customerId').lean();

            const orderMap = new Map(relatedOrders.map((o: any) => [o.externalOrderId, o]));

            const insertedExternalIds: string[] = [];
            const updatedExternalIds: string[] = [];

            // 3. Bulk Operations
            const bulkOps = invoices.map(invoice => {
                const relatedOrder = orderMap.get(invoice.externalOrderId);
                const isExisting = invoice.externalInvoiceId ? existingInvoicesMap.get(invoice.externalInvoiceId) : null;

                // Eğer "MANUAL" bir fatura zaten girilmişse pazar yerindeki faturayı üzerine yazma.
                if (isExisting && isExisting.invoiceMethod === 'MANUAL') {
                    return null;
                }

                if (isExisting) {
                    updatedExternalIds.push(invoice.externalInvoiceId!);
                } else if (invoice.externalInvoiceId) {
                    insertedExternalIds.push(invoice.externalInvoiceId);
                }

                if (relatedOrder) {
                    invoice.orderId = relatedOrder._id;
                    if (!invoice.customerId && relatedOrder.customerId) {
                        invoice.customerId = relatedOrder.customerId;
                    }
                }

                const updateData: any = {
                    totalAmount: invoice.totalAmount,
                    currency: invoice.currency,
                    type: invoice.type || 'SALES',
                    documentType: invoice.documentType || 'E_ARSIV',
                    status: invoice.status || 'APPROVED',
                    pdfUrl: invoice.pdfUrl,
                    xmlUrl: invoice.xmlUrl,
                    invoiceLink: invoice.invoiceLink,
                    issueDate: invoice.issueDate || new Date()
                };

                if (invoice.orderId) updateData.orderId = invoice.orderId;
                if (invoice.customerId) updateData.customerId = invoice.customerId;
                if (invoice.invoiceNumber) updateData.invoiceNumber = invoice.invoiceNumber;
                
                // Müşteriye özel veya manuel faturalar için OnInsert'e dokunmuyoruz,
                // Ama var olanı güncelliyoruz.
                const insertData = {
                    integrationCode: invoice.integrationCode,
                    externalOrderId: invoice.externalOrderId,
                    externalInvoiceId: invoice.externalInvoiceId,
                    ettn: invoice.ettn,
                    invoiceMethod: invoice.invoiceMethod || 'MARKETPLACE'
                };

                return {
                    updateOne: {
                        filter: { 
                            integrationCode: invoice.integrationCode, 
                            externalOrderId: invoice.externalOrderId,
                            type: invoice.type || 'SALES' // Aynı siparişe aynı tipten (Sales) fatura işlenir
                        },
                        update: {
                            $set: updateData,
                            $setOnInsert: insertData
                        },
                        upsert: true
                    }
                };
            }).filter(op => op !== null);

            // 4. Submit
            if (bulkOps.length > 0) {
                const result = await InvoiceModel.bulkWrite(bulkOps as any, { ordered: false });
                console.log(`${this.logPrefix} Persistence: ${result.upsertedCount} Yeni Fatura, ${result.modifiedCount} Güncelleme.`);
            }

            return { insertedExternalIds, updatedExternalIds };

        } catch (error) {
            console.error(`${this.logPrefix} saveInvoices Hatası:`, error);
            throw error;
        }
    }
}
