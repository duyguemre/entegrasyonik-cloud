import { IFinancialTransaction, ICargoInvoice } from '@interfaces/platforms';
import { FinancialConnector } from '../api/FinancialConnector';
import { FinancialMapper } from '../transformers/FinancialMapper';
import Service from '../services/Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class FinancialService {
    private connector: FinancialConnector;
    private mapper: FinancialMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new FinancialConnector(this.service, this.params);
        this.mapper = new FinancialMapper();
    }

    /**
     * Trendyol'dan hem settlements hem de otherfinancials verilerini çeker,
     * birleştirir ve evrensel IFinancialTransaction formatına dönüştürür.
     */
    public async fetchFinancials(query: { startDate: Date, endDate: Date, transactionTypes?: string[] }): Promise<IFinancialTransaction[]> {
        try {
            // Trendyol 15 gün kısıtlaması olduğu için aralığı parçalara bölüyoruz
            const chunks = this.splitDateRange(query.startDate, query.endDate, 15);
            const allTransactions: IFinancialTransaction[] = [];

            for (const chunk of chunks) {
                const chunkQuery = { ...query, startDate: chunk.start, endDate: chunk.end };
                
                // 1. Settlements (Satış, İade, İndirim vb.)
                const rawSettlements = await this.connector.fetchSettlements(chunkQuery);
                const internalSettlements = this.mapper.toInternalTransactions(rawSettlements, 'TRENDYOL');
                allTransactions.push(...internalSettlements);

                // 2. Other Financials (Hakediş ödemeleri, faturalar, virmanlar vb.)
                const rawOtherFinancials = await this.connector.fetchOtherFinancials(chunkQuery);
                const internalOthers = this.mapper.toInternalTransactions(rawOtherFinancials, 'TRENDYOL');
                allTransactions.push(...internalOthers);
            }

            return allTransactions;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][FinancialService:fetchFinancials] ${error.message}`);
        }
    }

    /**
     * Tarih aralığını belirtilen gün sayısına göre parçalara böler.
     */
    private splitDateRange(startDate: Date, endDate: Date, maxDays: number): { start: Date, end: Date }[] {
        const chunks: { start: Date, end: Date }[] = [];
        let currentStart = new Date(startDate);
        const targetEnd = new Date(endDate);

        while (currentStart < targetEnd) {
            let currentEnd = new Date(currentStart.getTime() + (maxDays * 24 * 60 * 60 * 1000));
            if (currentEnd > targetEnd) {
                currentEnd = targetEnd;
            }
            chunks.push({ start: new Date(currentStart), end: new Date(currentEnd) });
            currentStart = new Date(currentEnd.getTime() + 1000); // 1 saniye ekle
        }

        return chunks;
    }

    /**
     * Belirli bir kargo faturasına ait kalem detaylarını çeker.
     * Bu metod genellikle ekstrede "Kargo Faturası" yakalandıktan sonra çağrılır.
     */
    public async fetchCargoInvoices(invoiceSerialNumber: string): Promise<ICargoInvoice[]> {
        try {
            const rawData = await this.connector.fetchCargoInvoiceDetails(invoiceSerialNumber);
            return this.mapper.toInternalCargoInvoices(rawData, invoiceSerialNumber, 'TRENDYOL');
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][FinancialService:fetchCargoInvoices] ${error.message}`);
        }
    }

    /**
     * Belirli bir ödeme emri ID'sine bağlı olan finansal hareketleri filtreler.
     * Muhasebecilerin "Banka hesabıma yatan bu toplu paranın içinde hangi siparişler var?" sorusunu yanıtlar.
     */
    public async fetchSettlementsByPaymentId(paymentOrderId: string): Promise<IFinancialTransaction[]> {
        try {
            const rawData = await this.connector.fetchSettlementsByPaymentId(paymentOrderId);
            return this.mapper.toInternalTransactions(rawData, 'TRENDYOL');
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][FinancialService:fetchSettlementsByPaymentId] ${error.message}`);
        }
    }
}