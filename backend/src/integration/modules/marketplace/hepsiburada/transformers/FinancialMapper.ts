import { IFinancialTransaction, UniversalTransactionType } from '@interfaces/platforms';
import { integrationCode } from '../constants';

export class FinancialMapper {
    public toInternalTransactions(rawTransactions: any[]): IFinancialTransaction[] {
        const items = Array.isArray(rawTransactions) ? rawTransactions : [];
        return items.map((item: any) => ({
            integrationCode,
            externalId: String(item.id || ''),
            orderNumber: item.orderNumber || '',
            transactionType: this.mapTransactionType(item.transactionType),
            platformType: item.transactionType || 'Unknown',
            debt: item.commissionAmount !== undefined ? Number(item.commissionAmount) : (item.amount?.value < 0 ? Math.abs(item.amount.value) : 0),
            credit: item.grossAmount !== undefined ? Number(item.grossAmount) : (item.amount?.value > 0 ? item.amount.value : 0),
            netAmount: item.netPayoutAmount !== undefined ? Number(item.netPayoutAmount) : (item.amount?.value || 0),
            transactionDate: item.orderDate ? new Date(item.orderDate) : new Date(),
            payoutDate: (item.payoutDate || item.maturityDate) ? new Date(item.payoutDate || item.maturityDate) : undefined,
            description: item.description || '',
            commissionAmount: Number(item.commissionAmount || 0),
            commissionRate: item.commissionRate,
            meta: item // Ham veriyi sakla
        }));
    }

    private mapTransactionType(type: string): UniversalTransactionType {
        switch (type) {
            case 'Sale':
            case 'Paid': return UniversalTransactionType.SALE;
            case 'Return': return UniversalTransactionType.RETURN;
            case 'Cancel': return UniversalTransactionType.CANCEL;
            case 'Deduction': return UniversalTransactionType.DEDUCTION;
            default: return UniversalTransactionType.SALE;
        }
    }
}
