import Service from '../services/Service';
import { paginateOffset, readTotal } from './paginateOffset';
import { hbMerchantId } from '../constants';

export class FinancialConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchTransactions(query: any): Promise<any[]> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = hbMerchantId(s);
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.financialTransactionsUrl || `settlements/merchantid/${merchantId}`;
        
        url = url.replace('<MERCHANTID>', merchantId);

        const hbQuery: Record<string, any> = {};
        if (query?.startDate) hbQuery.startDate = new Date(query.startDate).toISOString().split('T')[0];
        if (query?.endDate) hbQuery.endDate = new Date(query.endDate).toISOString().split('T')[0];
        if (query?.beginDate) hbQuery.startDate = query.beginDate;

        // [INT-05 / F-02] ILK istek eskisiyle BIREBIR (limit/offset yok; HB settlements sayfalama parametreleri dogrulanamadi, resmi portal 403).
        // Yanit dolu/kesik gorunuyorsa (toplam > donen ya da donen >= 100) sonraki sayfalar offset+limit ile istenir; sunucu offset'i yok saysa
        // ayni sayfa tekrari yakalanir (PAGINATION_REPEATED_PAGE: uyari + incomplete). Tavan asilirsa sessiz kesilmez.
        return paginateOffset(async (offset, limit) => {
            const response = await this.service.get(url, offset === 0 ? hbQuery : { ...hbQuery, limit, offset });
            const data = response?.data;
            const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
            return { items, total: Array.isArray(data) ? undefined : readTotal(data) };
        }, { operation: 'fetchTransactions', clientId: this.params.clientId });
    }
}
