import Service from '../services/Service';

export class FinancialConnector {
    constructor(private service: Service, private params: any) { }

    // [ADR-0006 1f] Aşağıdaki dört metot POST kullanır ama tümü sorgu/okuma amaçlıdır -> idempotent:true.
    public async fetchSettlements(query: any): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.settlementListUrl || 'finance/getsettlements';
        const response = await this.service.post(baseUrl, query, { idempotent: true, operation: 'fetchSettlements' });
        return response?.data;
    }

    public async fetchOtherFinancials(query: any): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.otherFinancialsUrl || 'finance/getotherfinancials';
        const response = await this.service.post(baseUrl, query, { idempotent: true, operation: 'fetchOtherFinancials' });
        return response?.data;
    }

    public async fetchCargoInvoiceDetails(invoiceSerialNumber: string): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.cargoInvoiceDetailsUrl || 'finance/getcargoinvoicedetails';
        const response = await this.service.post(baseUrl, { invoiceSerialNumber }, { idempotent: true, operation: 'fetchCargoInvoiceDetails' });
        return response?.data;
    }

    public async fetchPaymentAgreements(query: any): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.orderPaymentAgreementUrl || 'order/paymentAgreement';
        const body = {
            startDate: query.startDate,
            endDate: query.endDate,
            allowanceDate: query.allowanceDate || null,
            orderId: query.orderId || null
        };
        const response = await this.service.post(baseUrl, body, { idempotent: true, operation: 'fetchPaymentAgreements' });
        return response?.data;
    }
}
