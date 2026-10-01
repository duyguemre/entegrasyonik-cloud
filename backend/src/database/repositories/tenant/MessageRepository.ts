import type { IClientDB } from '@interfaces/common';
import { DatabaseManagerInstance } from '@database/index';
import { IMessage } from '@interfaces/index';
import { getLogPrefix, LoggerType } from '@utils/Logger';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'MessageRepository');

export class MessageRepository {
    private workerName: LoggerType = "Message Repository"
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

    public async saveMessages(clientId: number, messages: IMessage[]): Promise<void> {
        if (!messages || messages.length === 0) return;

        this.logPrefix = getLogPrefix(this.workerName, clientId, "");

        try {
            const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
            if (!clientDb) throw new Error(`${this.logPrefix} Client DB not found`);

            const MessageModel = clientDb.getMessageModel();
            const OrderModel = clientDb.getOrderModel();

            // 1. RESOLUTION: OrderNumber üzerinden local OrderId ve CustomerId bulma
            const orderNumbers = messages
                .map(m => m.context?.orderNumber)
                .filter((n): n is string => !!n);

            let orderMap = new Map<string, { _id: any, customerId: any }>();

            if (orderNumbers.length > 0) {
                const existingOrders = await OrderModel.find({
                    orderNumber: { $in: orderNumbers }
                }).select('_id orderNumber customerId').lean();

                existingOrders.forEach((o: any) => {
                    orderMap.set(o.orderNumber, { _id: o._id, customerId: o.customerId });
                });
            }

            // 2. BULK OPS PREPARATION
            const bulkOps = messages.map(msg => {
                // Payload hazırlığı
                const updatePayload: any = {
                    ...msg,
                    // Tarihleri Date nesnesine güvenli çeviriyoruz
                    date: msg.date ? new Date(msg.date) : new Date(),
                    answeredAt: msg.answeredAt ? new Date(msg.answeredAt) : undefined,
                    rejectedAt: msg.rejectedAt ? new Date(msg.rejectedAt) : undefined,
                };

                // ID çakışmasını önlemek için _id'yi siliyoruz
                delete updatePayload._id;

                // 2.1. Sipariş ve Müşteri İlişkilendirme (Resolution)
                if (msg.context?.orderNumber) {
                    const localOrder = orderMap.get(msg.context.orderNumber);
                    if (localOrder) {
                        updatePayload.orderId = localOrder._id;
                        // Eğer mesajda customerId yoksa, siparişten gelen customerId'yi kullan
                        if (!updatePayload.customerId) {
                            updatePayload.customerId = localOrder.customerId;
                        }
                    }
                }

                return {
                    updateOne: {
                        filter: {
                            integrationCode: msg.integrationCode,
                            externalMessageId: msg.externalMessageId
                        },
                        // $set kullanarak sadece değişen veya yeni gelen alanları yazıyoruz
                        update: { $set: updatePayload },
                        upsert: true
                    }
                };
            });

            // 3. EXECUTE
            const result = await MessageModel.bulkWrite(bulkOps, { ordered: false });
            log.info('MESSAGEREPOSITORY_MESAJ_SENKRONIZASYONU_YENI_GUNCELLENDI', `Mesaj Senkronizasyonu: ${result.upsertedCount} yeni, ${result.modifiedCount} güncellendi/eşleşti.`);

        } catch (error: any) {
            log.error('MESSAGEREPOSITORY_MESAJ_REPOSITORY_HATASI', 'Mesaj Repository Hatası:', { err: error });
            throw error;
        }
    }

    // ---- Tenant-bağlı (RPC) yöntemler: sorgu biçimleri eski handler gövdeleriyle BİREBİR ----

    private get messages() { return this.tenant().getMessageModel(); }

    /** Sayfalı liste + müşteri ve sipariş eşlemesi; ham toplulaştırma sonucu (`[{ metadata, data }]`). */
    pagedSearch(match: Record<string, any>, sort: Record<string, any>, skip: number, limit: number): Promise<any[]> {
        return this.messages.aggregate([
            { $match: match },
            { $sort: sort },
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        { $lookup: { from: 'Customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
                        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
                        { $lookup: { from: 'Orders', localField: 'orderId', foreignField: '_id', as: 'order' } },
                        { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
                    ],
                },
            },
        ]);
    }

    findById(id: unknown): Promise<any> {
        return this.messages.findById(id);
    }

    updateById(id: unknown, update: Record<string, any>, options: Record<string, any>): Promise<any> {
        return this.messages.findByIdAndUpdate(id, update, options);
    }

    deleteById(id: unknown): Promise<any> {
        return this.messages.findByIdAndDelete(id);
    }

    deleteByIds(ids: unknown[]): Promise<any> {
        return this.messages.deleteMany({ _id: { $in: ids } });
    }

    countWaitingSeller(): Promise<number> {
        return this.messages.countDocuments({ status: 'WAITING_SELLER', isRejected: { $ne: true } });
    }

    maskUserNameByCustomer(customerId: unknown, mask: string): Promise<any> {
        return this.messages.updateMany({ customerId }, { $set: { externalUserName: mask } });
    }
}
