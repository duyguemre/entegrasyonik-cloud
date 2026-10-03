// [eslesme-fiyat WP4, D-N11-7 (P0), 01-ekler/E §retrieveClaims] N11 iade (SOAP ReturnService ClaimReturnList) → IClaimPackage.
// ÖNCEKİ DAVRANIŞ: ham kayıt dönüyordu (mapper yok) → OrderWorker `IClaimPackage` bekliyordu, N11 iadeleri hiç işlenmiyordu.
// Alan adları resmî WSDL'den DOĞRULANAMADI (02-ekler/n11.md §iade); bu yüzden okuma hoşgörülüdür (bilinen takma adlar) ve ham
// kayıt `meta`'da tam taşınır. Yerel canlı salt-okuma turunda (03 §5) fikstür alınıp alan adları kesinleştirilir.
import { IClaimPackage, IClaim, IClaimItem, ClaimTypeEnum, ClaimInternalStatusEnum } from '@interfaces/index';
import { reportUnknownEnum } from '@integration/modules/common/contract/reportUnknownEnum';
import { integrationCode } from '../constants';

const asArray = (v: any): any[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const str = (...vals: any[]): string => {
    for (const v of vals) if (v !== undefined && v !== null && String(v) !== '') return String(v);
    return '';
};
const num = (...vals: any[]): number => {
    for (const v of vals) {
        const n = Number(typeof v === 'object' && v !== null ? (v.value ?? v.amount) : v);
        if (v !== undefined && v !== null && Number.isFinite(n)) return n;
    }
    return 0;
};

/** N11 iade durumları (kaynaklarda görülen; liste DOĞRULANAMADI) → iç durum. */
const STATUS: Readonly<Record<string, ClaimInternalStatusEnum>> = {
    requested: ClaimInternalStatusEnum.WAITING,
    waiting: ClaimInternalStatusEnum.WAITING,
    inprogress: ClaimInternalStatusEnum.UNDER_REVIEW,
    in_review: ClaimInternalStatusEnum.UNDER_REVIEW,
    accepted: ClaimInternalStatusEnum.APPROVED,
    approved: ClaimInternalStatusEnum.APPROVED,
    rejected: ClaimInternalStatusEnum.REJECTED,
    denied: ClaimInternalStatusEnum.REJECTED,
    cancelled: ClaimInternalStatusEnum.CANCELLED,
    canceled: ClaimInternalStatusEnum.CANCELLED,
    completed: ClaimInternalStatusEnum.COMPLETED,
    refunded: ClaimInternalStatusEnum.COMPLETED,
};

export class ClaimMapper {
    public toInternalClaimPackages(rawClaims: any[]): IClaimPackage[] {
        return asArray(rawClaims).filter(Boolean).map((c) => this.toInternalClaimPackage(c)).filter((p): p is IClaimPackage => !!p);
    }

    public mapStatus(raw: any): ClaimInternalStatusEnum {
        const key = String(raw ?? '').trim().toLowerCase();
        const hit = STATUS[key];
        if (hit) return hit;
        reportUnknownEnum('n11.claims.list', 'status', key === '' ? 'MISSING' : String(raw));
        return ClaimInternalStatusEnum.WAITING;
    }

    private toInternalClaimPackage(c: any): IClaimPackage | undefined {
        const externalClaimId = str(c.claimCancelId, c.claimId, c.id);
        const externalOrderId = str(c.orderNumber, c.order?.orderNumber, c.orderId);
        if (!externalClaimId || !externalOrderId) return undefined; // kimliksiz kayıt "undefined" kimliğiyle yazılmaz

        const rawItems = [
            ...asArray(c.claimItemList?.claimItem),
            ...asArray(c.orderItemList?.orderItem),
            ...asArray(c.claimItems),
            ...asArray(c.orderItem),
        ];
        const reason = str(c.reason?.name, c.reason, c.claimReason, c.returnReason) || undefined;
        const items: IClaimItem[] = rawItems.map((it: any) => ({
            externalLineItemId: str(it.orderItemId, it.id),
            externalItemId: str(it.productId, it.productSellerCode, it.sellerStockCode),
            sku: str(it.productSellerCode, it.sellerStockCode, it.stockCode),
            barcode: str(it.barcode, it.gtin),
            productName: str(it.productName, it.title) || 'İade Ürünü',
            quantity: num(it.quantity) || 1,
            unitPrice: num(it.price, it.sellerInvoiceAmount, it.unitPrice),
            reason: str(it.reason, it.claimReason) || reason,
        }));

        const externalStatus = str(c.status, c.claimStatus) || 'MISSING';
        const internalStatus = this.mapStatus(c.status ?? c.claimStatus);
        const buyerName = str(c.buyer?.fullName, c.customerName, c.buyerName);
        const [firstName, ...rest] = buyerName.split(' ').filter(Boolean);
        const claimedAtRaw = c.claimDate ?? c.createDate ?? c.createdDate;
        const claimedAt = claimedAtRaw ? new Date(claimedAtRaw) : undefined;

        const claim: IClaim = {
            integrationCode,
            externalClaimId,
            externalOrderId,
            type: ClaimTypeEnum.REFUND,
            externalStatus,
            internalStatus,
            totalRefundAmount: num(c.totalAmount, c.refundAmount) || items.reduce((t, i) => t + i.unitPrice * i.quantity, 0),
            currencyCode: 'TRY',
            claimedAt: claimedAt && !isNaN(claimedAt.getTime()) ? claimedAt : new Date(),
            items,
            fulfillment: {
                carrierName: str(c.shipmentCompany?.name, c.cargoCompany) || undefined,
                trackingCode: str(c.trackingNumber, c.campaignNumber, c.shipmentCode) || undefined,
            } as any,
            history: [{ status: internalStatus, changedAt: new Date(), description: `N11 iade talebi aktarıldı. Statü: ${externalStatus}`, actionBy: 'SYSTEM' }] as any,
            meta: { ...c },
        } as IClaim;

        const customer = {
            firstName: firstName || 'Müşteri',
            lastName: rest.join(' '),
            email: str(c.buyer?.email, c.customerEmail),
            externalIdentities: [{ integrationCode, externalCustomerId: str(c.buyer?.id, c.buyerId) }],
        };
        return { claim, customer };
    }
}
