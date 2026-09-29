import {
    IClaimPackage, IClaim, ICustomer, ClaimTypeEnum, ClaimInternalStatusEnum,
    IClaimRejectionReason,
    IClaimItem
} from '@interfaces/index';
import { integrationCode } from '../constants';

export class ClaimMapper {
    public toInternalClaimPackages(rawResponse: any): IClaimPackage[] {
        // Pazarama returns { data: { refundList: [...] } }
        const refundList = rawResponse?.data?.refundList || rawResponse?.refundList || (Array.isArray(rawResponse) ? rawResponse : []);

        return refundList.map((claim: any) => {
            const nameParts = (claim.CustomerName || claim.customerName || "").split(' ');
            const customer: Partial<ICustomer> = {
                firstName: nameParts[0] || "Müşteri",
                lastName: nameParts.slice(1).join(' ') || "",
                email: claim.CustomerEmail || claim.customerEmail || "",
                phone: claim.CustomerPhoneNumber || claim.customerPhoneNumber || "",
                externalIdentities: [{ integrationCode, externalCustomerId: String(claim.CustomerId || claim.customerId || "") }]
            };

            let claimItems: IClaimItem[] = [];
            if (claim.orderItem && Array.isArray(claim.orderItem)) {
                claimItems = claim.orderItem.map((item: any) => ({
                    externalLineItemId: String(item.orderItemId || ""),
                    externalItemId: String(item.productCode || ""),
                    productName: item.productName || "İade Ürünü",
                    sku: item.productStockCode || "",
                    barcode: item.productCode || "",
                    quantity: Number(item.quantity || 1),
                    unitPrice: Number(item.unitPrice?.Value || item.unitPrice?.value || item.unitPrice || 0),
                    reason: claim.RefundType || claim.refundType || 'Belirtilmedi'
                }));
            } else if (claim.ProductCode || claim.productCode) {
                const productCode = claim.ProductCode || claim.productCode;
                claimItems = [{
                    externalLineItemId: String(claim.orderItemId || ""),
                    externalItemId: String(productCode || ""),
                    productName: claim.ProductName || claim.productName || "İade Ürünü",
                    sku: claim.ProductStockCode || claim.productStockCode || "",
                    barcode: productCode || "",
                    quantity: Number(claim.quantity || 1),
                    unitPrice: Number(claim.RefundAmount?.Value || claim.refundAmount?.value || 0),
                    reason: claim.RefundType || claim.refundType || 'Belirtilmedi'
                }];
            }

            const refundStatus = claim.RefundStatus !== undefined ? claim.RefundStatus : claim.refundStatus;
            const internalStatus = this.mapNumericClaimStatus(refundStatus);

            // Pazarama Özel: Eğer kargo kodu varsa ve statü beklemedeyse, kullanıcıya bilgi ver
            let statusDescription = claim.RefundStatusName || claim.refundStatusName;
            const shipmentCode = claim.ShipmentCode || claim.shipmentCode || claim.CargoTrackingNumber || claim.TrackingCode || "";
            if (refundStatus === 1 && shipmentCode) {
                statusDescription = "Müşteri İade Kodu Aldı";
            }

            const internalClaim: IClaim = {
                integrationCode,
                externalClaimId: String(claim.refundId || claim.id),
                externalOrderId: String(claim.OrderNumber || claim.orderNumber),
                type: ClaimTypeEnum.REFUND,
                externalStatus: statusDescription || String(refundStatus),
                internalStatus: internalStatus,
                totalRefundAmount: Number(claim.RefundAmount?.Value || claim.refundAmount?.value || 0),
                currencyCode: claim.RefundAmount?.Currency || claim.refundAmount?.currency || 'TRY',
                claimedAt: (claim.RefundDate || claim.refundDate) ? new Date(claim.RefundDate || claim.refundDate) : new Date(),
                items: claimItems,
                fulfillment: {
                    carrierName: claim.ShipmentCompanyName || claim.shipmentCompanyName || claim.CargoCompanyName || "Pazarama Lojistik",
                    trackingCode: String(shipmentCode || ""),
                    trackingUrl: claim.TrackingUrl || claim.trackingUrl || claim.CargoTrackingUrl || ""
                },
                history: [{
                    status: internalStatus,
                    changedAt: new Date(),
                    description: `Pazarama iade talebi (${claim.RefundNumber || claim.refundNumber}) aktarıldı. Statü: ${statusDescription}`,
                    actionBy: 'SYSTEM'
                }],
                meta: { ...claim }
            };

            return { claim: internalClaim, customer };
        });
    }

    private mapNumericClaimStatus(status: any): ClaimInternalStatusEnum {
        const s = Number(status);
        switch (s) {
            case 1: return ClaimInternalStatusEnum.UNDER_REVIEW;         // Onay Bekliyor (İlk Talep) - REVIZE: WAITING daha doğru (Frontend stepper için)
            case 2:                                            // Tedarikçi Tarafından Onaylandı
            case 4:                                            // Backoffice Tarafından Onaylandı
            case 6:                                            // Auto Approved
            case 8: return ClaimInternalStatusEnum.APPROVED;   // Direkt Onay
            case 10: return ClaimInternalStatusEnum.COMPLETED; // İade Edildi / Tamamlandı
            case 3:                                            // Tedarikçi Tarafından Reddedildi
            case 5: return ClaimInternalStatusEnum.REJECTED;   // Backoffice Tarafından Reddedildi
            case 7: return ClaimInternalStatusEnum.CANCELLED;  // Talep İptal Edildi
            default: return ClaimInternalStatusEnum.UNDER_REVIEW;
        }
    }

    public toInternalClaimRejectionReasons(rawReasons: any[]): IClaimRejectionReason[] {
        return rawReasons.map((r: any) => ({
            id: String(r.id),
            title: r.title || r.name || 'Sebep belirtilmemiş'
        }));
    }
}
