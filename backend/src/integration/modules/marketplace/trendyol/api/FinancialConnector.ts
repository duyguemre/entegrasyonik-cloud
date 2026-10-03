import Service from '../services/Service';
import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { TRENDYOL_SETTLEMENTS_LIST, TRENDYOL_OTHERFINANCIALS_LIST } from '../contracts/finance.settlements';
import { TRENDYOL_FINANCE_GROUP, TRENDYOL_STOREFRONT_CODE } from '../limits';

/** [COM-03] Finans uclari: kendi servis grubu kovasi (100/dk) + zorunlu storeFrontCode basligi. */
const FINANCE_CALL_OPTS = { group: TRENDYOL_FINANCE_GROUP, headers: { storeFrontCode: TRENDYOL_STOREFRONT_CODE } } as const;

export class FinancialConnector {
    constructor(private service: Service, private params: any) { }

    /**
     * Trendyol Settlements (Satış, İade vb.) verilerini çeker
     */
    public async fetchSettlements(query: any): Promise<any> {
        const baseUrl = this.getFormattedUrl('financeSettlementsUrl');
        const queryParams = this.prepareQueryParams(query);

        const response = await this.service.get(baseUrl, queryParams, FINANCE_CALL_OPTS);
        observeResponseSchema(TRENDYOL_SETTLEMENTS_LIST, response?.data, { clientId: this.params.clientId });
        return response?.data;
    }

    /**
     * Trendyol Other Financials (Ödeme, Fatura, Virman vb.) verilerini çeker
     */
    public async fetchOtherFinancials(query: any): Promise<any> {
        const baseUrl = this.getFormattedUrl('financeOtherFinancialsUrl');
        const queryParams = this.prepareQueryParams(query);

        const response = await this.service.get(baseUrl, queryParams, FINANCE_CALL_OPTS);
        observeResponseSchema(TRENDYOL_OTHERFINANCIALS_LIST, response?.data, { clientId: this.params.clientId });
        return response?.data;
    }

    /**
     * Kargo faturasının detay kalemlerini çeker
     */
    public async fetchCargoInvoiceDetails(invoiceSerialNumber: string): Promise<any> {
        let baseUrl = this.getFormattedUrl('cargoInvoiceUrl');

        // Fatura numarası placeholder'ını değiştiriyoruz
        baseUrl = baseUrl.replace('<INVOICESERIALNUMBER>', invoiceSerialNumber);

        const queryParams = {
            page: 0,
            size: 1000
        };

        const response = await this.service.get(baseUrl, queryParams, FINANCE_CALL_OPTS);
        observeResponseSchema(TRENDYOL_SETTLEMENTS_LIST, response?.data, { clientId: this.params.clientId });
        return response?.data;
    }

    /**
     * Belirli bir ödeme emrine ait işlemleri çekmek için Settlements servisini kullanır
     */
    public async fetchSettlementsByPaymentId(paymentOrderId: string, paging: { page: number; size: number } = { page: 0, size: 1000 }): Promise<any> {
        const baseUrl = this.getFormattedUrl('financeSettlementsUrl');

        const queryParams = {
            paymentOrderId: paymentOrderId,
            page: paging.page,
            size: paging.size
        };

        const response = await this.service.get(baseUrl, queryParams, FINANCE_CALL_OPTS);
        observeResponseSchema(TRENDYOL_SETTLEMENTS_LIST, response?.data, { clientId: this.params.clientId });
        return response?.data;
    }

    /**
     * URL'deki <SELLERID> alanını ayarlardan alıp dolduran yardımcı metod
     */
    private getFormattedUrl(urlKey: string): string {
        const settings = this.params.integrationSettings;
        const sellerId = settings?.settings?.SELLERID;
        const rawUrl = settings?.urls?.[urlKey];

        if (!rawUrl) throw new Error(`${urlKey} config içerisinde bulunamadı.`);
        if (!sellerId) throw new Error("Trendyol SELLERID ayarı bulunamadı.");

        return rawUrl.replace("<SELLERID>", sellerId);
    }

    /**
     * Ortak parametre hazırlama ve tarih dönüşüm mantığı
     */
    private prepareQueryParams(query: any): any {
        const params: any = {
            page: query.page || 0,
            size: query.size || 500
        };

        // Trendyol tarihleri milisaniye (Timestamp) bekler
        if (query.startDate instanceof Date) {
            params.startDate = query.startDate.getTime();
        } else if (query.startDate) {
            params.startDate = query.startDate;
        }

        if (query.endDate instanceof Date) {
            params.endDate = query.endDate.getTime();
        } else if (query.endDate) {
            params.endDate = query.endDate;
        }

        // Transaction Types dizisini Trendyol'un beklediği virgüllü formata çevirebiliriz
        if (Array.isArray(query.transactionTypes)) {
            params.transactionTypes = query.transactionTypes.join(',');
        } else if (query.transactionType) {
            params.transactionType = query.transactionType;
        }

        return { ...query, ...params };
    }
}