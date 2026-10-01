import { IClientDB } from '@interfaces/index';

/**
 * ADR-0024 Dalga 3 (P3-ORD): satıcı paneli (RPC) fatura sorguları (fatura + sipariş modelleri). Kurucu tenant DB tutamacını
 * alır (ADR-0016 §5.1: `clientId` parametresi yok; izolasyon tenant DB seçimiyle). Model her çağrıda `getXModel()` ile alınır.
 */
export class InvoicePanelRepository {
    constructor(private readonly db: IClientDB) { }

    /** `$match → $lookup(Orders) → $lookup(Customers) → $sort → $facet{totalNumberOfRecords, invoices}`; `{ total, invoices }` döner. */
    async listPage(match: Record<string, any>, sort: Record<string, number>, skip: number, limit: number): Promise<{ total: number; invoices: any[] }> {
        const result = await this.db.getInvoiceModel().aggregate([
            { $match: match },
            {
                $lookup: {
                    from: 'Orders',
                    localField: 'orderId',
                    foreignField: '_id',
                    as: 'order'
                }
            },
            { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'Customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customer'
                }
            },
            { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
            { $sort: sort },
            {
                $facet: {
                    totalNumberOfRecords: [ { $count: 'count' } ],
                    invoices: [ { $skip: skip }, { $limit: limit } ]
                }
            }
        ]);
        const aggregationResult = result[0] || {};
        return {
            total: aggregationResult.totalNumberOfRecords?.[0]?.count || 0,
            invoices: aggregationResult.invoices || [],
        };
    }

    /** Sipariş numarası ya da dış sipariş kimliğiyle sipariş (lean). */
    findOrderByNumberOrExternalId(externalOrderId: any): Promise<any> {
        return this.db.getOrderModel()
            .findOne({ $or: [{ orderNumber: externalOrderId }, { externalOrderId: externalOrderId }] })
            .lean();
    }

    updateOrderOne(filter: Record<string, any>, update: Record<string, any>): Promise<any> {
        return this.db.getOrderModel().updateOne(filter, update);
    }

    /** Yeni fatura belgesi oluşturup kaydeder (`new Model(payload).save()`). */
    async saveInvoice(payload: Record<string, any>): Promise<any> {
        const InvoiceModel = this.db.getInvoiceModel();
        const newInvoice = new InvoiceModel(payload);
        return newInvoice.save();
    }

    deleteInvoiceById(invoiceId: any): Promise<any> {
        return this.db.getInvoiceModel().findByIdAndDelete(invoiceId);
    }

    findOrderById(orderId: any): Promise<any> {
        return this.db.getOrderModel().findById(orderId);
    }

    /** Yalnızca `orderNumber` alanı (toplu yollarda yanıt etiketi için). */
    findOrderNumberById(orderId: any): Promise<any> {
        return this.db.getOrderModel().findById(orderId).select('orderNumber');
    }

    /** `findByIdAndUpdate(id, update[, options])` — seçenek verilmezse üçüncü argüman GÖNDERİLMEZ. */
    updateOrderById(orderId: any, update: Record<string, any>, options?: Record<string, any>): Promise<any> {
        return options === undefined
            ? this.db.getOrderModel().findByIdAndUpdate(orderId, update)
            : this.db.getOrderModel().findByIdAndUpdate(orderId, update, options);
    }

    /** Siparişin SALES faturasını upsert eder (`{ upsert: true, new: true }`). */
    upsertSalesInvoice(orderId: any, set: Record<string, any>): Promise<any> {
        return this.db.getInvoiceModel().findOneAndUpdate(
            { orderId, type: 'SALES' },
            { $set: set },
            { upsert: true, new: true }
        );
    }

    updateInvoices(filter: Record<string, any>, update: Record<string, any>): Promise<any> {
        return this.db.getInvoiceModel().updateMany(filter, update);
    }
}
