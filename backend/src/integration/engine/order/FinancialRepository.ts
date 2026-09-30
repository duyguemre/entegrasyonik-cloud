import { DatabaseManagerInstance } from '@database/index';
import { IFinancialTransaction } from '@interfaces/platforms';
import { getLogPrefix, LoggerType } from '@utils/Logger';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'FinancialRepository');

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
            log.info('FINANCIALREPOSITORY_FINANSAL_SENKRONIZASYON_YENI_GUNCELL', `Finansal Senkronizasyon: ${result.upsertedCount} yeni, ${result.modifiedCount} güncellendi.`);

        } catch (error: any) {
            log.error('FINANCIALREPOSITORY_FINANS_REPOSITORY_HATASI', 'Finans Repository Hatası:', { err: error });
            throw error;
        }
    }
}
