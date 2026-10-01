import { DatabaseManagerInstance } from '@database/index';
import { IMessage } from '@interfaces/index';
import { getLogPrefix, LoggerType } from '@utils/Logger';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'MessageRepository');

export class MessageRepository {
    private workerName: LoggerType = "Message Repository"
    private logPrefix!: string;

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
}