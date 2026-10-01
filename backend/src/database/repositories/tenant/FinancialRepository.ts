import type { IClientDB } from '@interfaces/common';
import { DatabaseManagerInstance } from '@database/index';
import { IFinancialTransaction } from '@interfaces/platforms';
import { getLogPrefix, LoggerType } from '@utils/Logger';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'FinancialRepository');

export class FinancialRepository {
    private workerName: LoggerType = "Financial Repository";
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

    // ---- Tenant-bağlı (RPC) yöntemler: sorgu biçimleri eski handler gövdeleriyle BİREBİR ----

    /** Ekstre: toplam sayı, sayfa ve özet (tek filtre, paralel). */
    pagedTransactions(match: Record<string, any>, sort: Record<string, any>, skip: number, limit: number): Promise<[number, any[], any[]]> {
        const model = this.tenant().getFinancialTransactionModel();
        return Promise.all([
            model.countDocuments(match),
            model.find(match).sort(sort).skip(skip).limit(limit).lean(),
            model.aggregate(FinancialRepository.summaryPipeline(match)),
        ]);
    }

    summary(match: Record<string, any>): Promise<any[]> {
        return this.tenant().getFinancialTransactionModel().aggregate(FinancialRepository.summaryPipeline(match));
    }

    byPaymentOrder(paymentOrderId: unknown): Promise<any[]> {
        return this.tenant().getFinancialTransactionModel().find({ paymentOrderId }).sort({ transactionDate: 1 }).lean();
    }

    /** Kargo faturaları (en yeni önce, `maxRows` tavanlı). */
    cargoInvoices(match: Record<string, any>, maxRows: number): Promise<any[]> {
        return this.tenant().getCargoInvoiceModel().find(match).sort({ transactionDate: -1 }).limit(maxRows).lean();
    }

    private static summaryPipeline(match: Record<string, any>): Record<string, any>[] {
        return [
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalCredit: { $sum: '$credit' },
                    totalDebt: { $sum: '$debt' },
                    totalCargo: { $sum: '$cargoAmount' },
                    netAmount: { $sum: '$netAmount' },
                    transactionCount: { $sum: 1 },
                },
            },
        ];
    }
}
