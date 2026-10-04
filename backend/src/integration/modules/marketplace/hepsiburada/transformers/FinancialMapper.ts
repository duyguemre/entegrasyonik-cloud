import { IFinancialTransaction, UniversalTransactionType } from '@interfaces/platforms';
import { reportUnknownEnum } from '@integration/modules/common/contract/reportUnknownEnum';
import { integrationCode } from '../constants';

export const HB_FINANCE_CONTRACT_ID = 'hepsiburada.finance.transactions';

/**
 * [eslesme-fiyat WP3, K-1] `mpfinance-external` `transactions` yanıt alanları [S]: `transactionId, transactionDate, paymentDate,
 * type, amount, currency, orderNumber` (+ vergi/fatura). Eski `settlements` alanları (`id, transactionType, commissionAmount,
 * grossAmount, netPayoutAmount, orderDate, payoutDate/maturityDate, amount.value`) geri uyum için YEDEK olarak okunur.
 * Tutar işareti: pozitif → alacak (credit), negatif → borç (debt).
 */
export class FinancialMapper {
    public toInternalTransactions(rawTransactions: any[]): IFinancialTransaction[] {
        const items = Array.isArray(rawTransactions) ? rawTransactions : [];
        return items.map((item: any) => {
            const platformType: string = item.type || item.transactionType || 'Unknown';
            const transactionType = this.mapTransactionType(platformType);
            const amount = this.amountOf(item);
            const commissionAmount = item.commissionAmount !== undefined
                ? Number(item.commissionAmount)
                : (/commission|komisyon/i.test(platformType) ? Math.abs(amount) : 0);
            const txDate = item.transactionDate || item.orderDate;
            const payDate = item.paymentDate || item.payoutDate || item.maturityDate || item.dueDate;
            return {
                integrationCode,
                // [eslesme-fiyat WP6, D-FIN-1] kimlik yoksa boş kalır → repository satırı atlar (eskiden '' ile satırlar birbirini eziyordu)
                externalId: String([item.transactionId, item.id].find((v: any) => v !== undefined && v !== null && v !== '') ?? ''),
                orderNumber: item.orderNumber || '',
                ...(item.packageNumber ? { shipmentPackageId: String(item.packageNumber) } : {}),
                transactionType,
                platformType,
                debt: item.commissionAmount !== undefined ? Number(item.commissionAmount) : (amount < 0 ? Math.abs(amount) : 0),
                credit: item.grossAmount !== undefined ? Number(item.grossAmount) : (amount > 0 ? amount : 0),
                netAmount: item.netPayoutAmount !== undefined ? Number(item.netPayoutAmount) : amount,
                transactionDate: txDate ? new Date(txDate) : new Date(),
                payoutDate: payDate ? new Date(payDate) : undefined,
                description: item.description || '',
                commissionAmount,
                commissionRate: item.commissionRate,
                meta: item // Ham veriyi sakla (currency, status, vergi/fatura alanları dahil)
            };
        });
    }

    /** `amount` sayı (mpfinance) ya da `{ value }` (eski) olabilir. */
    private amountOf(item: any): number {
        const raw = item?.amount !== null && typeof item?.amount === 'object' ? item.amount.value : item?.amount;
        const n = Number(raw);
        return raw === undefined || raw === null || !Number.isFinite(n) ? 0 : n;
    }

    /**
     * HB `TransactionTypes` 70+ değer içerir (Payment, Commission, Returns, VAT...); tam liste yerelde fikstürle genişler.
     * Bilinen anahtar kelimelerle sınıflanır; tanınmayan değer SALE'e düşer ama `reportUnknownEnum` ile raporlanır.
     */
    private mapTransactionType(type: string): UniversalTransactionType {
        switch (type) {
            case 'Sale':
            case 'Paid': return UniversalTransactionType.SALE;
            case 'Return': return UniversalTransactionType.RETURN;
            case 'Cancel': return UniversalTransactionType.CANCEL;
            case 'Deduction': return UniversalTransactionType.DEDUCTION;
        }
        const t = String(type || '');
        if (/return|refund|iade/i.test(t)) return UniversalTransactionType.RETURN;
        if (/cancel|iptal/i.test(t)) return UniversalTransactionType.CANCEL;
        if (/coupon|kupon/i.test(t)) return UniversalTransactionType.COUPON;
        if (/discount|indirim/i.test(t)) return UniversalTransactionType.DISCOUNT;
        if (/correction|adjust|duzeltme|düzeltme/i.test(t)) return UniversalTransactionType.CORRECTION;
        if (/provision|blocked|bloke/i.test(t)) return UniversalTransactionType.PROVISION;
        if (/payout|transfer|hakedis|hakediş/i.test(t)) return UniversalTransactionType.PAYOUT;
        if (/commission|vat|tax|cargo|shipping|fee|service|penalty|advert|komisyon|kargo|ceza|reklam|kdv/i.test(t)) return UniversalTransactionType.DEDUCTION;
        if (/payment|sale|satis|satış/i.test(t)) return UniversalTransactionType.SALE;
        reportUnknownEnum(HB_FINANCE_CONTRACT_ID, 'type', t || 'MISSING');
        return UniversalTransactionType.SALE;
    }
}
