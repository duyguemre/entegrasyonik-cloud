import { OrderInternalStatusEnum } from '@/types/OrderTypes';
import { ClaimInternalStatusEnum } from '@/types/ClaimTypes';

export type OrderAction = 'APPROVE' | 'SHIP' | 'INVOICE' | 'CANCEL' | 'RESOLVE_DISCREPANCY' | 'PRINT_LABEL' | 'VIEW';
export type ClaimAction = 'APPROVE' | 'REJECT' | 'DISPUTE' | 'RESOLVE' | 'VIEW';

export function useLifecycle() {
    /**
     * Sipariş statüsüne göre aksiyonun izinli olup olmadığını döner.
     */
    const isOrderActionAllowed = (order: any, action: OrderAction): boolean => {
        const status = order.internalStatus as OrderInternalStatusEnum;
        const hasInvoice = !!order.invoice?.invoiceNumber;

        switch (action) {
            case 'VIEW':
                return true;
            case 'APPROVE':
                return status === OrderInternalStatusEnum.AWAITING_APPROVAL;
            case 'SHIP':
                const hasTracking = order.fulfillment?.some((f: any) => f.trackingCode) || order.meta?.trackingId;
                const isMarketplaceManaged = order.fulfillment?.some((f: any) => f.shipmentMethod === 'MARKETPLACE');

                // Agnostic kural: Eğer lojistik pazaryeri tarafından yönetiliyorsa ve takip kodu varsa,
                // manuel bildirim yapılmasına gerek yoktur (Otomatik akış).
                if (isMarketplaceManaged && hasTracking) return false;

                return [OrderInternalStatusEnum.APPROVED].includes(status) && !hasTracking;
            case 'INVOICE':
                // Fatura kesilmemişse her aşamada kesilebilir
                return [
                    OrderInternalStatusEnum.APPROVED,
                    OrderInternalStatusEnum.SHIPPED,
                    OrderInternalStatusEnum.DELIVERED
                ].includes(status) && !hasInvoice;
            case 'CANCEL':
                return ![
                    OrderInternalStatusEnum.SHIPPED,
                    OrderInternalStatusEnum.DELIVERED,
                    OrderInternalStatusEnum.CANCELLED,
                    OrderInternalStatusEnum.RETURNED
                ].includes(status);
            case 'RESOLVE_DISCREPANCY':
                return !!order.platformDiscrepancy?.hasDiscrepancy;
            case 'PRINT_LABEL':
                const hasTrackingForLabel = order.fulfillment?.some((f: any) => f.trackingCode) || order.meta?.trackingId;
                return [
                    OrderInternalStatusEnum.APPROVED,
                    OrderInternalStatusEnum.SHIPPED
                ].includes(status) && !!hasTrackingForLabel;
            default:
                return false;
        }
    };

    /**
     * İade statüsüne göre aksiyonun izinli olup olmadığını döner.
     */
    const isClaimActionAllowed = (claim: any, action: ClaimAction): boolean => {
        const status = claim.internalStatus as ClaimInternalStatusEnum;
        switch (action) {
            case 'VIEW':
                return true;
            case 'APPROVE':
            case 'REJECT':
            case 'DISPUTE':
                return [
                    ClaimInternalStatusEnum.UNDER_REVIEW,
                    ClaimInternalStatusEnum.DISPUTED
                ].includes(status);
            case 'RESOLVE':
                return status === ClaimInternalStatusEnum.DISPUTED;
            default:
                return false;
        }
    };

    /**
     * Bir sonraki mantıklı adımı döner (UI'da parlatmak için).
     */
    const getRecommendedOrderAction = (order: any): OrderAction | null => {
        const status = order.internalStatus as OrderInternalStatusEnum;
        const hasInvoice = !!order.invoice?.invoiceNumber;

        if (status === OrderInternalStatusEnum.AWAITING_APPROVAL) return 'APPROVE';
        if (status === OrderInternalStatusEnum.UNAPPROVED) return null; // Platformun onayını bekliyoruz
        if (status === OrderInternalStatusEnum.APPROVED && !hasInvoice) return 'INVOICE';
        if (status === OrderInternalStatusEnum.APPROVED && hasInvoice) return 'SHIP';
        if (status === OrderInternalStatusEnum.SHIPPED && !hasInvoice) return 'INVOICE';
        
        return null;
    };

    return {
        isOrderActionAllowed,
        isClaimActionAllowed,
        getRecommendedOrderAction
    };
}
