import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '../Security'
import { containsRegex, clampPage, clampLimit } from '@utils/search'

/** getCargoInvoices tek yanıtta en fazla bu kadar satır döner (en yeni önce). */
export const CARGO_INVOICES_MAX_ROWS = 5000

export default class FinancialService extends BaseApi implements IService {

    async get() {
        return {}
    }

    /**
     * ÖNYÜZ: Ana Ekstre Listesi
     * Tüm finansal hareketleri (Satış, İade, Kesinti vb.) filtreli ve sıralı getirir.
     */
    async getTransactionData(): Promise<any> {
        try {
            const {
                startDate,
                endDate,
                integrationCodes,
                transactionTypes,
                externalIdSearch,
                page: rawPage,
                limit: rawLimit,
                sortBy
            } = this.request;

            const filterQuery: any = {};

            // Çoklu platform filtresi
            if (integrationCodes && integrationCodes.length > 0) {
                filterQuery.integrationCode = { $in: integrationCodes };
            }

            // Çoklu işlem tipi filtresi
            if (transactionTypes && transactionTypes.length > 0) {
                filterQuery.transactionType = { $in: transactionTypes };
            }

            // İşlem No (externalId) araması
            if (externalIdSearch) {
                filterQuery.externalId = containsRegex(externalIdSearch); // [GV-01]
            }

            // Tarih Aralığı Filtresi
            if (startDate || endDate) {
                filterQuery.transactionDate = {};
                if (startDate) filterQuery.transactionDate.$gte = new Date(startDate);
                if (endDate) filterQuery.transactionDate.$lte = new Date(endDate);
            }

            // Sıralama
            const sortQuery: any = {};
            if (sortBy && sortBy.length > 0) {
                sortBy.forEach((s: any) => {
                    sortQuery[s.key] = s.order === 'asc' ? 1 : -1;
                });
            } else {
                sortQuery.transactionDate = -1;
            }

            const page = clampPage(rawPage); // [GV-01/MM-08]
            const limit = clampLimit(rawLimit, 20);
            const skip = (page - 1) * limit;
            const model = this.clientDB.getFinancialTransactionModel();

            const [totalNumberOfRecords, transactions, summary] = await Promise.all([
                model.countDocuments(filterQuery),
                model.find(filterQuery).sort(sortQuery).skip(skip).limit(limit).lean(),
                model.aggregate([
                    { $match: filterQuery },
                    {
                        $group: {
                            _id: null,
                            totalCredit: { $sum: "$credit" },
                            totalDebt: { $sum: "$debt" },
                            totalCargo: { $sum: "$cargoAmount" },
                            netAmount: { $sum: "$netAmount" },
                            transactionCount: { $sum: 1 }
                        }
                    }
                ])
            ]);

            console.log(`[FinancialService:get] Filter: ${JSON.stringify(filterQuery)}, Found: ${transactions.length} records`);
            if (transactions.length > 0) {
                console.log(`[FinancialService:get] Sample Record Integration: ${transactions[0].integrationCode}, Type: ${transactions[0].transactionType}`);
            }

            return {
                transactions,
                totalNumberOfRecords,
                summary: summary[0] ?? { totalCredit: 0, totalDebt: 0, totalCargo: 0, netAmount: 0, transactionCount: 0 }
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * ÖNYÜZ: Kargo Faturaları Listesi
     * Kargo bazlı mutabakat ekranı için verileri sağlar.
     */
    async getCargoInvoices(): Promise<any> {
        try {
            const {
                invoiceNumber,
                orderNumber,
                integrationCode,
                startDate,
                endDate
            } = this.request;

            const filterQuery: any = {};

            if (integrationCode) filterQuery.integrationCode = integrationCode;
            if (invoiceNumber) filterQuery.invoiceNumber = invoiceNumber;
            if (orderNumber) filterQuery.orderNumber = orderNumber;

            if (startDate || endDate) {
                filterQuery.transactionDate = {};
                if (startDate) filterQuery.transactionDate.$gte = new Date(startDate);
                if (endDate) filterQuery.transactionDate.$lte = new Date(endDate);
            }

            return await this.clientDB.getCargoInvoiceModel()
                .find(filterQuery)
                .sort({ transactionDate: -1 })
                .limit(CARGO_INVOICES_MAX_ROWS) // [API_TENANT_SURFACE §6] sayfasız uç genel RPC'ye açılırken sınırsız okuma engellendi
                .lean();
        } catch (error) {
            throw error;
        }
    }

    /**
     * ÖNYÜZ: Finansal Özet (Dashboard Kartları)
     * Muhasebeci ve patron ekranı için agregasyon sonuçlarını döner.
     * @deprecated Bu metod get() içerisine entegre edilmiştir.
     */
    async getFinancialSummary(): Promise<any> {
        try {
            const {
                startDate,
                endDate,
                integrationCodes,
                transactionTypes,
                externalIdSearch
            } = this.request;

            const matchQuery: any = {};

            // Frontend'deki aktif filtrelerle aynı koşullar
            if (integrationCodes && integrationCodes.length > 0) {
                matchQuery.integrationCode = { $in: integrationCodes };
            }
            if (transactionTypes && transactionTypes.length > 0) {
                matchQuery.transactionType = { $in: transactionTypes };
            }
            // İşlem No (externalId) araması
            if (externalIdSearch) {
                matchQuery.externalId = containsRegex(externalIdSearch); // [GV-01]
            }
            if (startDate || endDate) {
                matchQuery.transactionDate = {};
                if (startDate) matchQuery.transactionDate.$gte = new Date(startDate);
                if (endDate) matchQuery.transactionDate.$lte = new Date(endDate);
            }

            // Tek bir grup olarak tüm filtrelenmiş kayıtların toplamı
            const result = await this.clientDB.getFinancialTransactionModel().aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: null,
                        totalCredit: { $sum: "$credit" },
                        totalDebt: { $sum: "$debt" },
                        totalCargo: { $sum: "$cargoAmount" },
                        netAmount: { $sum: "$netAmount" },
                        transactionCount: { $sum: 1 }
                    }
                }
            ]);

            // Sonuç yoksa sıfır değerleri döndür
            return result[0] ?? {
                totalCredit: 0,
                totalDebt: 0,
                totalCargo: 0,
                netAmount: 0,
                transactionCount: 0
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * ÖNYÜZ: Ödeme Emri (Vade) Bazlı Analiz
     * "Bu hafta hangi ödemede ne kadar kazandım?" sorusu için.
     */
    async getPayoutDetails(): Promise<any> {
        try {
            const { paymentOrderId } = this.request;
            if (!paymentOrderId) throw new Error("Ödeme emri ID (paymentOrderId) gereklidir.");
            // [API_TENANT_SURFACE §6] yalnızca skaler kimlik: nesne ({$ne:null} vb. operatör) ile tüm ödeme kayıtlarını listeleme engellenir
            if (typeof paymentOrderId !== 'string' && typeof paymentOrderId !== 'number') throw new ApplicationError("paymentOrderId geçersiz.", 400);

            return await this.clientDB.getFinancialTransactionModel()
                .find({ paymentOrderId })
                .sort({ transactionDate: 1 })
                .lean();
        } catch (error) {
            throw error;
        }
    }
}