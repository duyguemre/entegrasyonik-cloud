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
