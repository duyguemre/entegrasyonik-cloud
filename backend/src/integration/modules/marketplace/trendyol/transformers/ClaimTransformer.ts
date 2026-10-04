import {
    IClaimPackage, IClaim, ICustomer, ClaimTypeEnum, ClaimInternalStatusEnum,
    IClaimRejectionReason,
    IClaimItem
} from '@interfaces/index';
import { integrationCode } from '../constants'; // 'trendyol'
import { aggregateClaimStatus } from '@platform/core/orders/claimStatus';
import { reportUnknownEnum } from '@integration/modules/common/contract/reportUnknownEnum';

const toDate = (v: unknown): Date | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const d = new Date(v as any);
    return isNaN(d.getTime()) ? undefined : d;
};

export class ClaimMapper {
    /**
     * Trendyol İade (Claim/Return) API'sinden gelen saf JSON verisini IClaimPackage yapısına dönüştürür.
     */
    public toInternalClaimPackages(rawClaims: any[]): IClaimPackage[] {
        return rawClaims.map((claim: any) => {

            // 1. MÜŞTERİ BİLGİSİ
            const customer: Partial<ICustomer> = {
                firstName: claim.customerFirstName || "Müşteri",
                lastName: claim.customerLastName || "",
                email: claim.customerEmail || "",
                phone: claim.customerPhone || "",
                addresses: claim.shipmentAddress ? [{
                    title: 'Teslimat Adresi',
                    addressLine: claim.shipmentAddress.fullAddress || claim.shipmentAddress.address1 || "",
                    city: claim.shipmentAddress.city || "",
                    state: claim.shipmentAddress.district || "",
                    isDefaultShipping: true,
                    isDefaultBilling: true
                }] : [],
                externalIdentities: [{
                    integrationCode: integrationCode,
                    externalCustomerId: String(claim.customerId || "").trim()
                }]
            };

            // 2. İADE KALEMLERİ (ITEMS) - REVIZE: Trendyol nested yapısı (orderLine + claimItems)
            const rawItems = Array.isArray(claim.items) ? claim.items : [];
            const claimItems: IClaimItem[] = [];

            rawItems.forEach((item: any) => {
                const orderLine = item.orderLine || {};
                const itemsInLine = Array.isArray(item.claimItems) ? item.claimItems : [item];

                itemsInLine.forEach((cItem: any) => {
                    // D-TY-6: Trendyol statüyü KALEM başına verir (claimItemStatus); iade düzeyi durum aşağıda türetilir.
                    const itemExternalStatus = cItem.claimItemStatus?.name || claim.status || 'Created';
                    claimItems.push({
                        externalStatus: itemExternalStatus,
                        internalStatus: this.mapClaimStatus(itemExternalStatus),
                        externalLineItemId: String(orderLine.id || cItem.orderLineItemId || ""),
                        externalItemId: String(cItem.id || ""),
                        productName: orderLine.productName || cItem.productName || "İade Ürünü",
                        sku: orderLine.merchantSku || cItem.merchantSku || "",
                        barcode: orderLine.barcode || cItem.barcode || "",
                        quantity: Number(cItem.quantity || 1),
                        unitPrice: Number(orderLine.price || cItem.price || cItem.unitPrice || 0),
                        reason: cItem.customerClaimItemReason?.name || cItem.reason || 'Belirtilmedi',
                        description: cItem.customerNote || cItem.note || ''
                    });
                });
            });

            // Müşteriye iade edilecek toplam tutarı hesapla (Veya hazır geleni kullan)
            let totalRefund = Number(claim.totalRefundAmount || 0);
            if (totalRefund === 0) {
                totalRefund = claimItems.reduce((acc: number, item: any) => {
                    return acc + (item.unitPrice * item.quantity);
                }, 0);
            }

            // İade düzeyi statü kalemlerden (eskiden yalnız İLK kalemden alınıyordu; kısmi kabul/ret kayboluyordu).
            // Dış statü: birleşik durumu belirleyen ilk kalemin statüsü.
            const internalStatus = claimItems.length
                ? aggregateClaimStatus(claimItems.map(i => i.internalStatus!))
                : this.mapClaimStatus(claim.status || 'Created');
            const primaryExternalStatus = claimItems.find(i => i.internalStatus === internalStatus)?.externalStatus
                || claim.status || 'Created';
            // Platform zamanı (F-P1-9): son değişiklik; tarihçe ve çözüm zamanı tespit anı yerine bundan.
            const externalUpdatedAt = toDate(claim.lastModifiedDate);

            const internalClaim: IClaim = {
                integrationCode: integrationCode,
                externalClaimId: String(claim.claimId || claim.id || claim._id),
                externalOrderId: String(claim.orderNumber || claim.orderId || claim.externalOrderId),
                type: claim.replacementOutboundpackageinfo ? ClaimTypeEnum.REPLACEMENT : ClaimTypeEnum.REFUND,
                externalStatus: primaryExternalStatus,
                internalStatus: internalStatus,

                totalRefundAmount: totalRefund,
                currencyCode: claim.currencyCode || 'TRY',
                claimedAt: new Date(claim.claimDate || claim.creationDate || Date.now()),
                externalUpdatedAt,

                items: claimItems,

                fulfillment: {
                    carrierName: claim.cargoProviderName || claim.cargoProvider || "Belirtilmedi",
                    trackingCode: claim.cargoTrackingNumber || claim.cargoTrackingCode || "",
                    trackingUrl: claim.cargoTrackingLink || claim.cargoTrackingUrl || ""
                },

                history: [
                    {
                        status: internalStatus,
                        changedAt: externalUpdatedAt ?? toDate(claim.claimDate) ?? new Date(),
                        description: `İade talebi ${integrationCode} üzerinden sisteme aktarıldı. Güncel statü: ${primaryExternalStatus}`,
                        actionBy: 'SYSTEM'
                    }
                ],

                meta: {
                    isDisputed: primaryExternalStatus === 'Unresolved' || !!claim.isDisputed,
                    disputeStatus: claim.disputeStatus || undefined,
                    replacementInfo: claim.replacementOutboundpackageinfo || undefined,
                    rejectedInfo: claim.rejectedpackageinfo || undefined,
                    orderOutboundPackageId: claim.orderOutboundPackageId
                }
            };

            return {
                claim: internalClaim,
                customer: customer
            };
        });
    }

    private mapClaimStatus(externalStatus: string): ClaimInternalStatusEnum {
        const s = (externalStatus || '').toLowerCase().trim();

        if (s === 'created') return ClaimInternalStatusEnum.WAITING;
        if (s === 'shipped' || s === 'in_transit') return ClaimInternalStatusEnum.WAITING;
        if (s === 'delivered' || s === 'waitinginaction') return ClaimInternalStatusEnum.UNDER_REVIEW;
        if (s === 'inanalysis') return ClaimInternalStatusEnum.DISPUTED;
        if (s === 'accepted' || s === 'approved' || s === 'waitingfraudcheck') return ClaimInternalStatusEnum.APPROVED;
        if (s === 'rejected') return ClaimInternalStatusEnum.REJECTED;
        if (s === 'cancelled') return ClaimInternalStatusEnum.CANCELLED;
        if (s === 'unresolved' || s === 'disputed' || s === 'underreview') return ClaimInternalStatusEnum.DISPUTED;
        // Not: eski `s === 'Accepted'` dalı küçük harfe çevrilmiş değerle hiç eşleşmezdi (ölü dal); 'accepted' yukarıda APPROVED.
        if (s === 'completed' || s === 'resolved') return ClaimInternalStatusEnum.COMPLETED;

        reportUnknownEnum('trendyol.claims', 'claimItemStatus', externalStatus);
        return ClaimInternalStatusEnum.WAITING;
    }

    public toInternalClaimRejectionReasons(rawReasons: any[]): IClaimRejectionReason[] {
        return rawReasons.map((r: any) => ({
            id: String(r.id),
            title: r.title || r.name || 'Sebep belirtilmemiş'
        }));
    }
}