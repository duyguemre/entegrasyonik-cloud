import {
    IFinancialTransaction,
    ICargoInvoice,
    UniversalTransactionType,
    CargoShipmentType
} from '@interfaces/platforms';
import { integrationCode } from '../constants';

export class FinancialMapper {
    public toInternalTransactions(rawData: any): IFinancialTransaction[] {
        // Pazarama PaymentAgreement structure: { data: { transactionList: [...] } } or flat response
        const items = rawData?.transactionList || rawData?.data?.transactionList || (Array.isArray(rawData) ? rawData : (rawData?.items || rawData?.content || []));
        
        return items.map((item: any) => {
            const amount = Number(item.amount || 0);
            const commission = Number(item.commissionAmount || 0);
            const allowance = Number(item.allowanceAmount || 0);
            const status = String(item.status || "").toLowerCase();
            
            // If it's a sale, amount is credit. If it's a refund, amount might be debt.
            // Pazarama usually lists amounts positively, we distinguish by status text.
            const isReturn = status.includes('iade') || status.includes('return');
            
            return {
                integrationCode: integrationCode,
                // [eslesme-fiyat WP6, D-FIN-1] eskiden kimliksiz satır 'undefined' anahtarıyla yazılıp birbirini eziyordu
                externalId: (item.trxId || item.id) ? String(item.trxId || item.id) : '',
                orderNumber: String(item.orderId || ""),
                transactionType: this.mapToUniversalType(item.status),
                platformType: item.status,
                debt: isReturn ? amount : commission,
                credit: !isReturn ? amount : 0,
                netAmount: allowance,
                commissionAmount: commission,
                commissionRate: item.commissionRate,
                transactionDate: item.transactionDate ? new Date(item.transactionDate) : new Date(),
                payoutDate: item.transferredDate ? new Date(item.transferredDate) : undefined,
                description: item.trxCode || item.status || "",
                meta: { ...item }
            };
        });
    }

    /**
     * [eslesme-fiyat WP6-kalan, D-PZ-12] `finance/getotherfinancials` satırları. Alan adları KANITSIZ (02-ekler/pazarama C-17):
     * Trendyol otherfinancials biçimi (id/transactionType/debt/credit/transactionDate/paymentOrderId) + PascalCase takma adları
     * okunur; canlı yanıtla yerelde doğrulanır. Kimliksiz satır '' döner → FinancialRepository yazmaz (D-FIN-1).
     */
    public toInternalOtherFinancials(rawData: any): IFinancialTransaction[] {
        const d = rawData?.data ?? rawData;
        const items: any[] = Array.isArray(d) ? d : (d?.items || d?.content || d?.transactionList || d?.otherFinancials || []);
        return items.map((item: any) => {
            const pick = (...keys: string[]) => { for (const k of keys) if (item?.[k] !== undefined && item?.[k] !== null) return item[k]; return undefined; };
            const id = pick('id', 'Id', 'trxId', 'TrxId', 'transactionId', 'TransactionId');
            const platformType = String(pick('transactionType', 'TransactionType', 'type', 'Type') ?? '');
            const debt = Math.abs(Number(pick('debt', 'Debt') ?? 0)) || 0;
            const credit = Math.abs(Number(pick('credit', 'Credit') ?? 0)) || 0;
            const amount = Number(pick('amount', 'Amount') ?? 0) || 0;
            // Borç/alacak verilmemişse tutarın işaretinden (negatif = kesinti).
            const d2 = debt || credit ? debt : (amount < 0 ? -amount : 0);
            const c2 = debt || credit ? credit : (amount > 0 ? amount : 0);
            const date = pick('transactionDate', 'TransactionDate', 'date', 'Date');
            const paymentOrderId = pick('paymentOrderId', 'PaymentOrderId');
            return {
                integrationCode: integrationCode,
                externalId: id !== undefined && id !== '' ? `other:${String(id)}` : '',
                orderNumber: pick('orderNumber', 'OrderNumber') !== undefined ? String(pick('orderNumber', 'OrderNumber')) : undefined,
                transactionType: this.mapOtherFinancialType(platformType),
                platformType,
                debt: d2,
                credit: c2,
                netAmount: c2 - d2,
                transactionDate: date ? new Date(date) : new Date(),
                paymentOrderId: paymentOrderId !== undefined ? String(paymentOrderId) : undefined,
                description: String(pick('description', 'Description') ?? platformType),
                meta: { source: 'otherfinancials', ...item }
            } as IFinancialTransaction;
        });
    }

    private mapOtherFinancialType(platformType: string): UniversalTransactionType {
        const t = (platformType || '').toLowerCase();
        if (t.includes('paymentorder') || t.includes('ödeme') || t.includes('payout')) return UniversalTransactionType.PAYOUT;
        if (t.includes('deduction') || t.includes('commission') || t.includes('kesinti') || t.includes('komisyon') || t.includes('kargo')) return UniversalTransactionType.DEDUCTION;
        if (t.includes('return') || t.includes('iade')) return UniversalTransactionType.RETURN;
        return UniversalTransactionType.CORRECTION;
    }

    public toInternalCargoInvoices(rawData: any, invoiceNumber: string): ICargoInvoice[] {
        const items = Array.isArray(rawData) ? rawData : (rawData?.items || rawData?.content || []);
        return items.map((item: any) => ({
            integrationCode: integrationCode,
            invoiceNumber: invoiceNumber,
            orderNumber: String(item.orderNumber || ""),
            packageId: String(item.packageId || ""),
            shipmentType: CargoShipmentType.FORWARD,
            desi: item.desi || 0,
            amount: item.amount || 0,
            transactionDate: item.transactionDate ? new Date(item.transactionDate) : new Date()
        }));
    }

    private mapToUniversalType(platformType: string): UniversalTransactionType {
        const type = (platformType || '').toLowerCase();
        if (type.includes('satış') || type.includes('sale')) return UniversalTransactionType.SALE;
        if (type.includes('iade') || type.includes('return')) return UniversalTransactionType.RETURN;
        if (type.includes('ödeme') || type.includes('payout')) return UniversalTransactionType.PAYOUT;
        return UniversalTransactionType.CORRECTION;
    }
}
