import { DatabaseManagerInstance } from '@database/index';
import { IFinancialTransaction } from '@interfaces/platforms';
import { getLogPrefix, LoggerType } from '@utils/Logger';

export class FinancialRepository {
    private workerName: LoggerType = "Financial Repository";
    private logPrefix!: string;

    public async saveFinancials(clientId: number, financials: IFinancialTransaction[]): Promise<void> {
        if (!financials || financials.length === 0) return;

        this.logPrefix = getLogPrefix(this.workerName, clientId, "");

        try {
            const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
            if (!clientDb) throw new Error(`${this.logPrefix} Client DB not found`);

            const FinancialModel = clientDb.getFinancialTransactionModel();

            // BULK OPS PREPARATION
            const bulkOps = financials.map(trx => {
                const updatePayload: any = {
                    ...trx,
                    transactionDate: trx.transactionDate ? new Date(trx.transactionDate) : new Date(),
                    payoutDate: trx.payoutDate ? new Date(trx.payoutDate) : undefined,
                };

                delete updatePayload._id;

                return {
                    updateOne: {
                        filter: {
                            integrationCode: trx.integrationCode,
                            externalId: trx.externalId
                        },
                        update: { $set: updatePayload },
                        upsert: true
                    }
                };
            });

            // EXECUTE
            const result = await FinancialModel.bulkWrite(bulkOps, { ordered: false });
            console.log(`${this.logPrefix} Finansal Senkronizasyon: ${result.upsertedCount} yeni, ${result.modifiedCount} güncellendi.`);

        } catch (error: any) {
            console.error(`${this.logPrefix} Finans Repository Hatası:`, error.message);
            throw error;
        }
    }
}
