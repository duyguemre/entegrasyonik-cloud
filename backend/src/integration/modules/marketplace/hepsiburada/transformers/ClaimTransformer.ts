import {
    IClaimPackage, IClaim, ICustomer, ClaimTypeEnum, ClaimInternalStatusEnum,
    IClaimRejectionReason,
    IClaimItem
} from '@interfaces/index';
import { integrationCode } from '../constants';

export class ClaimMapper {
    public toInternalClaimPackages(rawResponse: any[]): IClaimPackage[] {
        const claims = Array.isArray(rawResponse) ? rawResponse : [];

        return claims.map((claim: any) => {
            const nameParts = (claim.customerName || "").split(' ');
            const customer: Partial<ICustomer> = {
                firstName: nameParts[0] || "Müşteri",
                lastName: nameParts.slice(1).join(' ') || "",
                externalIdentities: [{ integrationCode, externalCustomerId: String(claim.customerId || "") }]
            };

            const claimItems: IClaimItem[] = [{
                externalLineItemId: String(claim.lineItemId || ""),
                externalItemId: String(claim.sku || ""),
                productName: claim.productName || "İade Ürünü",
                sku: claim.merchantSku || "",
                barcode: claim.sku || "",
                quantity: Number(claim.quantity || 1),
                unitPrice: Number(claim.price || 0),
                reason: claim.claimType || 'Belirtilmedi'
            }];

            const status = claim.status;
            const internalStatus = this.mapStringClaimStatus(status);

            const internalClaim: IClaim = {
                integrationCode,
                externalClaimId: String(claim.id || claim.number),
                externalOrderId: String(claim.orderNumber),
                type: ClaimTypeEnum.REFUND,
                externalStatus: status,
                internalStatus: internalStatus,
                totalRefundAmount: Number(claim.totalPriceAmount || claim.refundAmount || 0),
                currencyCode: claim.priceCurrency || claim.refundCurrency || 'TRY',
                claimedAt: claim.claimDate ? new Date(claim.claimDate) : new Date(),
                items: claimItems,
                fulfillment: claim.trackingCode ? {
                    trackingCode: claim.trackingCode,
                    carrierName: claim.carrierName || "Hepsiburada Lojistik"
                } : undefined,
                history: [{
                    status: internalStatus,
                    changedAt: new Date(),
                    description: `Hepsiburada talep (${claim.number}) aktarıldı. Statü: ${status}`,
                    actionBy: 'SYSTEM'
                }],
                meta: { ...claim }
            };

            return { claim: internalClaim, customer };
        });
    }

    private mapStringClaimStatus(status: string): ClaimInternalStatusEnum {
        const s = status ? status.toLowerCase() : '';
        switch (s) {
            case 'newrequest': return ClaimInternalStatusEnum.WAITING;
            case 'intransit':
            case 'awaitingaction': return ClaimInternalStatusEnum.UNDER_REVIEW;
            case 'accepted':
            case 'refunded': return ClaimInternalStatusEnum.COMPLETED;
            case 'rejected': return ClaimInternalStatusEnum.REJECTED;
            case 'cancelled': return ClaimInternalStatusEnum.CANCELLED;
            case 'indispute': return ClaimInternalStatusEnum.DISPUTED;
            default: return ClaimInternalStatusEnum.WAITING;
        }
    }

    public toInternalClaimRejectionReasons(rawReasons: any[]): IClaimRejectionReason[] {
        return rawReasons.map((r: any) => ({
            id: String(r.id),
            title: r.title || r.name || 'Sebep belirtilmemiş'
        }));
    }
}
