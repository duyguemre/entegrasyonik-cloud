import {
    IFinancialTransaction,
    ICargoInvoice,
    UniversalTransactionType,
    CargoShipmentType
} from '@interfaces/platforms';

export class FinancialMapper {

    /**
     * Trendyol ham verisini Evrensel Finansal Modele çevirir
     */
    public toInternalTransactions(rawData: any, integrationCode: string): IFinancialTransaction[] {
        if (!rawData || !rawData.content) return [];

        return rawData.content.map((item: any) => {
            const transactionType = this.mapToUniversalType(item.transactionType);

            // netAmount hesaplama: Alacak (+) - Borç (-)
            // Not: Payout (Ödeme) satırlarında debt pozitif gelir (Trendyol'un kasasından çıkan para), 
            // ama satıcı için bu bir giriştir. Bu yüzden netAmount'u mutlak değer veya 
            // tip bazlı yönetmek gerekebilir.
            const netAmount = (item.credit || 0) - (item.debt || 0);

            return {
                integrationCode: integrationCode,
                externalId: item.id?.toString(),
                orderNumber: item.orderNumber?.toString(),
                shipmentPackageId: item.shipmentPackageId?.toString(),

                transactionType: transactionType,
                platformType: item.transactionType, // "Sale", "Return" vb. orijinal hali

                debt: item.debt || 0,
                credit: item.credit || 0,
                netAmount: netAmount,

                commissionRate: item.commissionRate,
                commissionAmount: item.commissionAmount,
                sellerRevenue: item.sellerRevenue,

                transactionDate: item.transactionDate ? new Date(item.transactionDate) : new Date(),
                payoutDate: item.paymentDate ? new Date(item.paymentDate) : undefined,
                paymentOrderId: item.paymentOrderId?.toString(),

                description: item.description,
                meta: {
                    receiptId: item.receiptId,
                    barcode: item.barcode,
                    affiliate: item.affiliate
                }
            };
        });
    }

    /**
     * Kargo Faturası detaylarını evrensel modele çevirir
     */
    public toInternalCargoInvoices(rawData: any, invoiceNumber: string, integrationCode: string): ICargoInvoice[] {
        if (!rawData || !rawData.content) return [];

        return rawData.content.map((item: any) => ({
            integrationCode: integrationCode,
            invoiceNumber: invoiceNumber,
            orderNumber: item.orderNumber?.toString(),
            packageId: item.parcelUniqueId?.toString(),
            shipmentType: item.shipmentPackageType?.includes('İade')
                ? CargoShipmentType.RETURN
                : CargoShipmentType.FORWARD,
            desi: item.desi || 0,
            amount: item.amount || 0,
            transactionDate: item.transactionDate ? new Date(item.transactionDate) : new Date()
        }));
    }

    /**
     * Trendyol'un string tiplerini bizim Enum yapımıza eşler
     */
    private mapToUniversalType(platformType: string): UniversalTransactionType {
        const type = platformType.toLowerCase();

        if (type.includes('satış') || type === 'sale') return UniversalTransactionType.SALE;
        if (type.includes('iade') || type === 'return') return UniversalTransactionType.RETURN;
        if (type.includes('iptal') || type.includes('cancel')) return UniversalTransactionType.CANCEL;
        if (type.includes('ödeme') || type === 'paymentorder') return UniversalTransactionType.PAYOUT;
        if (type.includes('kargo') || type.includes('fatura') || type.includes('deduction')) return UniversalTransactionType.DEDUCTION;
        if (type.includes('indirim') || type === 'discount') return UniversalTransactionType.DISCOUNT;
        if (type.includes('kupon') || type === 'coupon') return UniversalTransactionType.COUPON;
        if (type.includes('provizyon') || type.includes('provision')) return UniversalTransactionType.PROVISION;

        return UniversalTransactionType.CORRECTION; // Varsayılan düzeltme/diğer
    }
}