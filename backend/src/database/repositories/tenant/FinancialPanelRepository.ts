import { IClientDB } from '@interfaces/index';

/** Toplam kredi/borç/kargo/net + işlem sayısı gruplaması (tek grup). */
const totalsPipeline = (match: Record<string, any>) => [
    { $match: match },
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
];

/**
 * ADR-0024 Dalga 3 (P3-ORD): satıcı paneli (RPC) finans sorguları (finansal hareket + kargo faturası). Kurucu tenant DB
 * tutamacını alır (ADR-0016 §5.1: `clientId` parametresi yok). Model her çağrıda `getXModel()` ile alınır.
 */
export class FinancialPanelRepository {
    constructor(private readonly db: IClientDB) { }

    /** Ekstre sayfası: sayım + sıralı sayfa (lean) + toplamlar, paralel. `[total, transactions, summary]` döner. */
    transactionPage(filter: Record<string, any>, sort: Record<string, any>, skip: number, limit: number): Promise<[number, any[], any[]]> {
        const model = this.db.getFinancialTransactionModel();
        return Promise.all([
            model.countDocuments(filter),
            model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
            model.aggregate(totalsPipeline(filter))
        ]) as Promise<[number, any[], any[]]>;
    }

    /** Filtrelenmiş kayıtların toplamı (ham aggregate sonucu). */
    totals(match: Record<string, any>): Promise<any[]> {
        return this.db.getFinancialTransactionModel().aggregate(totalsPipeline(match));
    }

    /** Kargo faturaları: en yeni önce, `maxRows` ile sınırlı (lean). */
    cargoInvoices(filter: Record<string, any>, maxRows: number): Promise<any[]> {
        return this.db.getCargoInvoiceModel()
            .find(filter)
            .sort({ transactionDate: -1 })
            .limit(maxRows) // [API_TENANT_SURFACE §6] sayfasız uç genel RPC'ye açılırken sınırsız okuma engellendi
            .lean();
    }

    /** Bir ödeme emrine ait hareketler (vade sırası, lean). */
    payoutTransactions(paymentOrderId: string | number): Promise<any[]> {
        return this.db.getFinancialTransactionModel()
            .find({ paymentOrderId })
            .sort({ transactionDate: 1 })
            .lean();
    }
}
