import Service from '../services/Service';
import { paginateOffset, readTotal } from './paginateOffset';
import { hbMerchantId } from '../constants';
import { getIncomplete, markIncomplete } from '@integration/contracts/IncompleteFetch';

/**
 * [eslesme-fiyat WP3, API_HEPSIBURADA K-1] Finans: `mpfinance-external` `GET transactions/merchantid/{id}`.
 * Eskiden `settlements/merchantid/{id}?startDate&endDate` (accounting-external) çağrılıyordu — hiçbir spec'te yok, canlıda 404.
 *
 * Sözleşme [S: mpfinance-external.json]: sorgu parametreleri PascalCase (`Offset`, `Limit`, `TransactionTypes`); sorgu ya bir
 * tanımlayıcı ya da EN FAZLA 1 AY'lık tarih çifti içermeli (aksi 400). Bu yüzden motorun penceresi (ör. 30 günlük tam süpürme)
 * `HB_FINANCE_WINDOW_DAYS`'lik dilimlere bölünür; her dilim ayrı sayfalanır.
 *
 * DOĞRULANMADI (yerel canlı turda fikstürle teyit): tarih çifti parametre adları (`RecordDateStart/End` = kayıt/işlem tarihi;
 * dokümanda "Order/Invoice/Payment/Record/Due" aralıkları sayılıyor) ve tarih biçimi (`YYYY-MM-DD`). Tek yerde: `HB_FINANCE_DATE_PARAMS`.
 */
export const HB_FINANCE_WINDOW_DAYS = 28; // "≤1 ay": Şubat dahil her ayda güvenli
export const HB_FINANCE_DATE_PARAMS = { start: 'RecordDateStart', end: 'RecordDateEnd' } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const ymd = (d: Date) => d.toISOString().split('T')[0];

/** [start, end] aralığını uçları dahil `days` günlük, örtüşmeyen gün dilimlerine böler (YYYY-MM-DD). */
export function financeWindows(start: Date, end: Date, days = HB_FINANCE_WINDOW_DAYS): Array<{ start: string; end: string }> {
    const s = Date.parse(ymd(start)); // gün başına (UTC) yuvarla
    const e = Date.parse(ymd(end));
    if (!Number.isFinite(s) || !Number.isFinite(e) || s > e) return [];
    const out: Array<{ start: string; end: string }> = [];
    for (let cur = s; cur <= e; cur += days * DAY_MS) {
        out.push({ start: ymd(new Date(cur)), end: ymd(new Date(Math.min(cur + (days - 1) * DAY_MS, e))) });
    }
    return out;
}

export class FinancialConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchTransactions(query: any): Promise<any[]> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = hbMerchantId(s);
        const urls = this.params.integrationSettings.urls || {};
        const url = String(urls.financialTransactionsUrl || `transactions/merchantid/${merchantId}`).replace('<MERCHANTID>', merchantId);

        const end = query?.endDate ? new Date(query.endDate) : new Date();
        const start = query?.startDate ? new Date(query.startDate) : new Date(end.getTime() - (HB_FINANCE_WINDOW_DAYS - 1) * DAY_MS);
        const base: Record<string, any> = {};
        const types = Array.isArray(query?.transactionTypes) ? query.transactionTypes.filter(Boolean) : [];
        if (types.length) base.TransactionTypes = types.join(',');

        const all: any[] = [];
        const seen = new Set<string>();
        let incomplete: ReturnType<typeof getIncomplete>;
        for (const w of financeWindows(start, end)) {
            const q = { ...base, [HB_FINANCE_DATE_PARAMS.start]: w.start, [HB_FINANCE_DATE_PARAMS.end]: w.end };
            const page = await paginateOffset(async (offset, limit) => {
                const response = await this.service.get(url, { ...q, Offset: offset, Limit: limit });
                const data = response?.data;
                const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.data) ? data.data : []));
                return { items, total: Array.isArray(data) ? undefined : readTotal(data) };
            }, { operation: 'fetchTransactions', clientId: this.params.clientId });
            incomplete = incomplete || getIncomplete(page);
            for (const item of page) {
                const id = item?.transactionId ?? item?.id;
                if (id !== undefined && id !== null && id !== '') {
                    if (seen.has(String(id))) continue; // dilim sınırında çift kayıt
                    seen.add(String(id));
                }
                all.push(item);
            }
        }
        // Bir dilim bile eksikse tümü eksik sayılır (motor finans senkron imlecini ilerletmesin).
        return incomplete ? markIncomplete(all, { reason: incomplete.reason, collected: all.length }) : all;
    }
}
