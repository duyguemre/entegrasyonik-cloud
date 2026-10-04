import { DatabaseManagerInstance } from '@database/index';
import { IFinancialTransaction } from '@interfaces/platforms';
import { getLogPrefix, LoggerType } from '@utils/Logger';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'FinancialRepository');

export class FinancialRepository {
    private workerName: LoggerType = "Financial Repository";
    private logPrefix!: string;

    /**
     * [eslesme-fiyat WP6, D-FIN-1 / Ek E F-P1-7] `externalId` ZORUNLU: boş / `'undefined'` / `'null'` kimlikli satır YAZILMAZ ve
     * sayısı raporlanır (eskiden HB `''`, TY `undefined`, PZ `'undefined'` ile `{integrationCode, externalId}` tekilliğinde satırlar
     * birbirini eziyordu; N11 `Date.now()` ise her turda çift satır üretiyordu). Dönüş: atlanan satır sayısı.
     */
    public async saveFinancials(clientId: number, financials: IFinancialTransaction[]): Promise<{ skipped: number }> {
        if (!financials || financials.length === 0) return { skipped: 0 };
        const valid = financials.filter(t => hasFinancialExternalId(t?.externalId));
        const skipped = financials.length - valid.length;
        if (skipped > 0) {
            log.warn('FINANCIALREPOSITORY_EXTERNALID_YOK', 'Kimliksiz finans satırları atlandı (idempotency anahtarı yok).', {
                tenantId: clientId, integrationCode: financials[0]?.integrationCode, skipped, total: financials.length,
            });
        }
        if (valid.length === 0) return { skipped };
        financials = valid;

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
            return { skipped };

        } catch (error: any) {
            log.error('FINANCIALREPOSITORY_FINANS_REPOSITORY_HATASI', 'Finans Repository Hatası:', { err: error });
            throw error;
        }
    }
}

/** [eslesme-fiyat WP6, D-FIN-1] Finans satırı idempotency anahtarı dolu mu (`String(undefined)` gibi sahte değerler dahil değil). */
export function hasFinancialExternalId(v: unknown): boolean {
    if (v === undefined || v === null) return false;
    const s = String(v).trim();
    return s !== '' && s !== 'undefined' && s !== 'null' && s !== 'NaN';
}
