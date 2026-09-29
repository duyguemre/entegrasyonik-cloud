import { OrderInternalStatusEnum } from '../interfaces/order';
import { ClaimInternalStatusEnum } from '../interfaces/claim';

export type OrderAction = 'APPROVE' | 'SHIP' | 'INVOICE' | 'CANCEL' | 'RESOLVE_DISCREPANCY' | 'PRINT_LABEL';
export type ClaimAction = 'APPROVE' | 'REJECT' | 'DISPUTE' | 'RESOLVE';

export class LifecycleManager {
    /**
     * Sipariş statüsüne göre izin verilen aksiyonları döner.
     */
    public static isOrderActionAllowed(status: OrderInternalStatusEnum, action: OrderAction): boolean {
        switch (action) {
            case 'APPROVE':
                return status === OrderInternalStatusEnum.UNAPPROVED;
            case 'SHIP':
                // Fatura zorunlu değil demiştik, APPROVED durumunda kargolanabilir
                return [OrderInternalStatusEnum.APPROVED].includes(status);
            case 'INVOICE':
                // Herhangi bir onaylı aşamada fatura kesilebilir (Kargolanmış olsa bile)
                return [
                    OrderInternalStatusEnum.APPROVED,
                    OrderInternalStatusEnum.SHIPPED,
                    OrderInternalStatusEnum.DELIVERED
                ].includes(status);
            case 'CANCEL':
                // Teslim edilmemiş her sipariş iptal edilebilir (Pazar yerine göre değişse de iç mantık budur)
                return ![
                    OrderInternalStatusEnum.DELIVERED,
                    OrderInternalStatusEnum.CANCELLED,
                    OrderInternalStatusEnum.RETURNED
                ].includes(status);
            case 'RESOLVE_DISCREPANCY':
                // Sadece onaylı veya kargolanmış ama uyumsuzluk olan durumlarda
                return [OrderInternalStatusEnum.APPROVED, OrderInternalStatusEnum.SHIPPED].includes(status);
            case 'PRINT_LABEL':
                return [
                    OrderInternalStatusEnum.APPROVED,
                    OrderInternalStatusEnum.SHIPPED
                ].includes(status);
            default:
                return false;
        }
    }

    /**
     * İade (Claim) statüsüne göre izin verilen aksiyonları döner.
     */
    public static isClaimActionAllowed(status: ClaimInternalStatusEnum, action: ClaimAction): boolean {
        switch (action) {
            case 'APPROVE':
            case 'REJECT':
            case 'DISPUTE':
                // Sadece depoya ulaştığında (İncelemede) bu aksiyonlar alınabilir
                return status === ClaimInternalStatusEnum.UNDER_REVIEW;
            case 'RESOLVE':
                return status === ClaimInternalStatusEnum.DISPUTED;
            default:
                return false;
        }
    }

    /**
     * Kullanıcıya bir sonraki mantıklı adımı önerir.
     */
    public static getNextRecommendedOrderAction(status: OrderInternalStatusEnum, hasInvoice: boolean = false): OrderAction | null {
        if (status === OrderInternalStatusEnum.UNAPPROVED) return 'APPROVE';
        if (status === OrderInternalStatusEnum.APPROVED && !hasInvoice) return 'INVOICE'; // Veya SHIP, kullanıcı tercihine göre
        if (status === OrderInternalStatusEnum.APPROVED && hasInvoice) return 'SHIP';
        if (status === OrderInternalStatusEnum.SHIPPED && !hasInvoice) return 'INVOICE';
        return null;
    }
}
