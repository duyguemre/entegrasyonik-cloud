import Service from '../services/Service';

export class FinancialConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchTransactions(query: any): Promise<any[]> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = s.MERCHANTID || s.merchantid || s.SELLERID || s.sellerid || s.APIKEY || s.apikey || "";
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.financialTransactionsUrl || `settlements/merchantid/${merchantId}`;
        
        url = url.replace('<MERCHANTID>', merchantId);

        const hbQuery: Record<string, any> = {};
        if (query?.startDate) hbQuery.startDate = new Date(query.startDate).toISOString().split('T')[0];
        if (query?.endDate) hbQuery.endDate = new Date(query.endDate).toISOString().split('T')[0];
        if (query?.beginDate) hbQuery.startDate = query.beginDate;

        const response = await this.service.get(url, hbQuery);
        return response?.data?.items || response?.data || [];
    }
}
