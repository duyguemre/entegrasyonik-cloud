import type { IClientDB } from '@interfaces/common';
import { DatabaseManagerInstance } from '@database/index';
import { IInvoice } from '@interfaces/invoice';
import { getLogPrefix, LoggerType } from '@utils/Logger';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'InvoiceRepository');

export interface ISaveInvoiceResponse {
    insertedExternalIds: string[];
    updatedExternalIds: string[];
}

export class InvoiceRepository {
    private workerName: LoggerType = "Invoice Repository"
    private logPrefix!: string;

    /**
     * ADR-0024 Dalga 3 (P3-ORD): RPC/use-case yolu kurucuda tenant DB tutamacını alır (clientId parametresi yok); motor (ingest)
     * yöntemleri tutamaçsız örnekte `clientId` ile çalışmayı sürdürür.
     */
    constructor(private readonly tenantDb?: IClientDB) { }

    /** Tutamaçsız örnekte RPC yöntemi çağrılırsa eski handler gibi TypeError oluşur (ek kontrol yok). */
    private tenant(): IClientDB {
        return this.tenantDb as IClientDB;
    }

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
                log.info('INVOICEREPOSITORY_PERSISTENCE_YENI_FATURA_GUNCELLEME', `Persistence: ${result.upsertedCount} Yeni Fatura, ${result.modifiedCount} Güncelleme.`);
            }

            return { insertedExternalIds, updatedExternalIds };

        } catch (error) {
            log.error('INVOICEREPOSITORY_SAVEINVOICES_HATASI', 'saveInvoices Hatası:', { err: error });
            throw error;
        }
    }

    // ---- Tenant-bağlı (RPC) yöntemler: sorgu biçimleri eski handler gövdeleriyle BİREBİR ----

    private get invoices() { return this.tenant().getInvoiceModel(); }

    /** Sayfalı liste + sipariş/müşteri eşlemesi (sıralama eşlemeden sonra; eski biçim). */
    async pagedSearch(match: Record<string, any>, sort: Record<string, any>, skip: number, limit: number): Promise<{ total: number; items: any[] }> {
        const result = await this.invoices.aggregate([
            { $match: match },
            { $lookup: { from: 'Orders', localField: 'orderId', foreignField: '_id', as: 'order' } },
            { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'Customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
            { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
            { $sort: sort },
            { $facet: { totalNumberOfRecords: [{ $count: 'count' }], invoices: [{ $skip: skip }, { $limit: limit }] } },
        ]);
        const aggregationResult = result[0] || {};
        return { total: aggregationResult.totalNumberOfRecords?.[0]?.count || 0, items: aggregationResult.invoices || [] };
    }

    async create(payload: Record<string, any>): Promise<any> {
        const InvoiceModel = this.invoices;
        const doc = new InvoiceModel(payload);
        await doc.save();
        return doc;
    }

    deleteById(id: unknown): Promise<any> {
        return this.invoices.findByIdAndDelete(id);
    }

    /** Siparişin satış faturası (yoksa oluşturulur), güncel belge döner. */
    upsertSalesInvoice(orderId: unknown, set: Record<string, any>): Promise<any> {
        return this.invoices.findOneAndUpdate({ orderId, type: 'SALES' }, { $set: set }, { upsert: true, new: true });
    }

    /** `onlyActive`: yalnız iptal edilmemiş faturalar (filtre `status: { $ne: 'CANCELLED' }`). */
    cancelForOrder(orderId: unknown, onlyActive: boolean): Promise<any> {
        const filter = onlyActive ? { orderId, status: { $ne: 'CANCELLED' } } : { orderId };
        return this.invoices.updateMany(filter, { $set: { status: 'CANCELLED', cancellationDate: new Date() } });
    }
}
