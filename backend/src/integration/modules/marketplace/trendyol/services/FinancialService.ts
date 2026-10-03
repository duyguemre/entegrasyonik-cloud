import { IFinancialTransaction, ICargoInvoice } from '@interfaces/platforms';
import { FinancialConnector } from '../api/FinancialConnector';
import { FinancialMapper } from '../transformers/FinancialMapper';
import Service from '../services/Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { markIncomplete } from '@integration/contracts/IncompleteFetch';

/** Resmi belge: sayfa boyutu 500 veya 1000. */
const PAGE_SIZE = 500;
/** 500 x 200 = 100.000 satır / (tip x pencere); aşılırsa kalan sonraki turda (imleç örtüşmesi + günlük tarama) yakalanır. */
const MAX_PAGES = 200;
/** settlements `transactionType` (komisyon/hakediş satırları). */
// [eslesme-fiyat WP4, 02-ekler/trendyol D-TY-9] Discount/Coupon satırları da settlements'ta (eskiden çekilmiyordu → kampanya
// indirim/kupon kesintileri finans görünümünde yoktu). Provizyon türlerinin settlements adları doğrulanamadı (eklenmedi).
const SETTLEMENT_TYPES = ['Sale', 'Return', 'Discount', 'Coupon'] as const;
/** otherfinancials `transactionType` (çağrı başına tek tip). */
const OTHER_FINANCIAL_TYPES = ['PaymentOrder', 'DeductionInvoices', 'CreditNote', 'CommissionInvoice'] as const;

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
     *
     * [COM-03] Uçlar `transactionType` ister (çağrı başına TEK tip; docs/research/MARKETPLACE_COMMISSIONS_2026-09-30.md §3) ->
     * tip başına ayrı çağrı; her çağrı `totalPages` boyunca sayfalanır (önceden yalnız page 0 okunurdu).
     * Aynı kayıt tekrar gelirse yazım tarafı (FinancialRepository) `{integrationCode, externalId}` ile koşullu upsert yapar (idempotent).
     */
    public async fetchFinancials(query: { startDate: Date, endDate: Date, transactionTypes?: string[] }): Promise<IFinancialTransaction[]> {
        try {
            // Trendyol 15 gün kısıtlaması olduğu için aralığı parçalara bölüyoruz
            const chunks = this.splitDateRange(query.startDate, query.endDate, 15);
            const allTransactions: IFinancialTransaction[] = [];
            let capped = false;
            const wanted = query.transactionTypes?.length ? new Set(query.transactionTypes) : undefined;
            const pick = (all: readonly string[]) => (wanted ? all.filter(t => wanted.has(t)) : [...all]);

            for (const chunk of chunks) {
                const base = { startDate: chunk.start, endDate: chunk.end };

                // 1. Settlements (Satış, İade): gerçekleşen komisyon burada
                for (const transactionType of pick(SETTLEMENT_TYPES)) {
                    const raw = await this.fetchAllPages(p => this.connector.fetchSettlements({ ...base, transactionType, ...p }));
                    capped = capped || raw.capped;
                    allTransactions.push(...this.mapper.toInternalTransactions(raw, 'TRENDYOL'));
                }

                // 2. Other Financials (Hakediş ödemeleri, faturalar, virmanlar vb.)
                for (const transactionType of pick(OTHER_FINANCIAL_TYPES)) {
                    const raw = await this.fetchAllPages(p => this.connector.fetchOtherFinancials({ ...base, transactionType, ...p }));
                    capped = capped || raw.capped;
                    allTransactions.push(...this.mapper.toInternalTransactions(raw, 'TRENDYOL'));
                }
            }

            return capped ? markIncomplete(allTransactions, { reason: 'PAGINATION_PAGE_CAP', collected: allTransactions.length }) : allTransactions;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][FinancialService:fetchFinancials] ${error.message}`);
        }
    }

    /**
     * `totalPages` boyunca sayfalar (0-tabanlı); tüm `content` tek zarfta birleşir. MAX_PAGES tavanına takılıp sayfa kalırsa
     * `capped:true` döner (çağıran sonucu `markIncomplete` ile işaretler -> imleç ilerlemez; playbook §4.8).
     */
    private async fetchAllPages(fetchPage: (p: { page: number; size: number }) => Promise<any>): Promise<{ content: any[]; capped: boolean }> {
        const content: any[] = [];
        for (let page = 0; page < MAX_PAGES; page++) {
            const res = await fetchPage({ page, size: PAGE_SIZE });
            const rows = Array.isArray(res?.content) ? res.content : [];
            content.push(...rows);
            const totalPages = Number(res?.totalPages);
            if (rows.length === 0 || !Number.isFinite(totalPages) || page + 1 >= totalPages) return { content, capped: false };
        }
        return { content, capped: true };
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
            // [D-TY-9] ödeme emri satırları sayfalı (eskiden tek istek size=1000 → büyük ödeme emrinde sessiz kesik).
            const raw = await this.fetchAllPages(p => this.connector.fetchSettlementsByPaymentId(paymentOrderId, p));
            const rows = this.mapper.toInternalTransactions(raw, 'TRENDYOL');
            return raw.capped ? markIncomplete(rows, { reason: 'PAGINATION_PAGE_CAP', collected: rows.length }) : rows;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][FinancialService:fetchSettlementsByPaymentId] ${error.message}`);
        }
    }
}