import {
    IOrderPackage, IOrder, ICustomer, IOrderItem,
    IAddress, ICustomerAddress, OrderInternalStatusEnum
} from '@interfaces/index';
import { integrationCode } from '../constants';
import { reportUnknownEnum } from '@integration/modules/common/contract/reportUnknownEnum';

/** ADR-0018 sözleşme kimliği (Trendyol OrderTransformer.ts'teki ORDERS_CONTRACT_ID deseniyle aynı). */
export const PAZARAMA_ORDERS_CONTRACT_ID = 'pazarama.orders.list';

export class OrderMapper {
    public toInternalOrderPackages(orders: any[]): IOrderPackage[] {
        return orders.map((order: any) => {
            const shipAddr = order.ShipmentAddress || order.shipmentAddress || {};
            const cFirstName = (shipAddr.NameSurname?.split(' ')[0] || shipAddr.nameSurname?.split(' ')[0] || order.CustomerName?.split(' ')[0] || order.customerName?.split(' ')[0] || "MUSTERI").trim();
            const cLastName = (shipAddr.NameSurname?.split(' ').slice(1).join(' ') || shipAddr.nameSurname?.split(' ').slice(1).join(' ') || order.CustomerName?.split(' ').slice(1).join(' ') || order.customerName?.split(' ').slice(1).join(' ') || "").trim();
            const orderNumber = String(order.OrderNumber || order.orderNumber || order.OrderId || order.orderId || '');
            const safeExternalCustomerId = String(order.CustomerId || order.customerId || `PAZ-GUEST-${orderNumber}`);

            const shippingAddr = this.mapToIAddress(shipAddr, cFirstName, cLastName);
            const billingAddr = this.mapToIAddress(order.BillingAddress || order.billingAddress || shipAddr, cFirstName, cLastName);

            const customer: ICustomer = {
                firstName: cFirstName,
                lastName: cLastName,
                email: order.customerEmail || shipAddr.customerEmail || "",
                phone: shipAddr.phoneNumber || "",
                isEmailMasked: false,
                isPhoneMasked: false,
                externalIdentities: [{ integrationCode, externalCustomerId: safeExternalCustomerId }],
                addresses: [
                    { ...this.mapToICustomerAddress(shippingAddr), title: 'Teslimat Adresi', isDefaultShipping: true },
                    { ...this.mapToICustomerAddress(billingAddr), title: 'Fatura Adresi', isDefaultBilling: true }
                ]
            };

            const orderStatus = order.OrderStatus || order.orderStatus || order.status;
            const internalOrder: IOrder = {
                integrationCode,
                externalOrderId: orderNumber,
                orderNumber: orderNumber,
                customerFirstName: cFirstName,
                customerLastName: cLastName,
                externalStatus: String(orderStatus),
                internalStatus: this.mapNumericStatus(orderStatus),
                cancelSource: this.mapCancelSource(orderStatus),
                dates: {
                    orderDate: (order.OrderDate || order.orderDate) ? new Date(order.OrderDate || order.orderDate) : new Date(),
                    shippedDate: (order.ShipmentDate || order.shipmentDate) ? new Date(order.ShipmentDate || order.shipmentDate) : undefined,
                    deliveredDate: (order.DeliveryDate || order.deliveryDate) ? new Date(order.DeliveryDate || order.deliveryDate) : undefined,
                    cancelledDate: [6, 13, 14, 18, 7, 8, 10].includes(Number(orderStatus)) ? new Date() : undefined
                },
                billingAddress: billingAddr,
                shippingAddress: shippingAddr,
                financials: {
                    currencyCode: (order.Currency === 'TL' || order.currency === 'TL' ? 'TRY' : (order.Currency || order.currency || 'TRY')),
                    subTotal: this.safeNumber(order.OrderAmount),
                    totalDiscount: this.safeNumber(order.DiscountAmount),
                    totalTax: this.safeNumber(order.TaxAmount),
                    shippingFee: this.safeNumber(order.ShipmentAmount),
                    grandTotal: this.safeNumber(order.OrderAmount)
                },
                fulfillment: (() => {
                    const items = order.Items || order.items || [];
                    const firstWithTracking = items.find((i: any) => i.Cargo?.TrackingNumber || i.cargo?.trackingNumber);
                    const firstWithShipmentCode = items.find((i: any) => i.ShipmentCode || i.shipmentCode);

                    if (firstWithTracking || firstWithShipmentCode) {
                        return [{
                            shipmentMethod: firstWithShipmentCode ? 'MARKETPLACE' : 'MANUAL',
                            status: 'SUCCESS',
                            carrierName: String(firstWithTracking?.Cargo?.CompanyName || firstWithTracking?.cargo?.companyName || firstWithShipmentCode?.Cargo?.CompanyName || firstWithShipmentCode?.cargo?.companyName || ""),
                            trackingCode: String(firstWithTracking?.Cargo?.TrackingNumber || firstWithTracking?.cargo?.trackingNumber || firstWithShipmentCode?.ShipmentCode || firstWithShipmentCode?.shipmentCode || ""),
                        }];
                    }
                    return [];
                })(),
                invoice: {
                    invoiceMethod: 'MARKETPLACE',
                    invoiceProvider: 'pazarama',
                    status: 'PENDING'
                },
                items: (order.Items || order.items || []).map((line: any): IOrderItem => {
                    const product = line.Product || line.product || {};
                    return {
                        externalLineItemId: String(line.OrderItemId || line.orderItemId),
                        externalItemId: String(product.ProductId || product.productId || line.ProductId || line.productId),
                        productName: product.Name || product.productName || line.ProductName || line.productName || "İsimsiz Ürün",
                        sku: product.Code || product.code || line.StockCode || line.stockcode || "",
                        barcode: product.Code || product.code || line.Barcode || line.barcode || "",
                        quantity: this.safeNumber(line.Quantity || 1),
                        unitPrice: this.safeNumber(line.SalePrice),
                        taxRate: this.safeNumber(product.VatRate),
                        totalPrice: this.safeNumber(line.TotalPrice),
                        itemStatus: this.mapItemStatus(line.OrderItemStatus || line.orderItemStatus)
                    };
                }),
                flags: { isAllocated: false, isInvoiceGenerated: false, isMetricsProcessed: false },
                meta: { ...order }
            };

            return { order: internalOrder, customer, claims: [] };
        });
    }

    private mapCancelSource(status: any): string | undefined {
        const s = Number(status);
        if (s === 13) return 'SELLER';
        if (s === 18) return 'CUSTOMER';
        if ([6, 14].includes(s)) return 'PLATFORM';
        return undefined;
    }

    /**
     * [ADR-0018 Karar 2a(iii)] Bilinmeyen (tabloda olmayan) durum kodu SESSİZCE düşmez: DAVRANIŞ (UNAPPROVED)
     * AYNI kalır ama `reportUnknownEnum` çağrılır (ADR-0018 B7 bulgusu; Trendyol OrderTransformer.ts'teki
     * `resolveStatus` deseniyle AYNI — bkz. karakterizasyon: tests/characterization/orders/Pazarama.orderStatus.characterization.test.ts).
     */
    private mapNumericStatus(status: any): OrderInternalStatusEnum {
        const s = Number(status);
        switch (s) {
            case 3: return OrderInternalStatusEnum.AWAITING_APPROVAL;
            case 12: return OrderInternalStatusEnum.APPROVED;
            case 5:
            case 16:
            case 19: return OrderInternalStatusEnum.SHIPPED;
            case 11:
            case 9: return OrderInternalStatusEnum.DELIVERED;
            case 6:
            case 18:
            case 13:
            case 14: return OrderInternalStatusEnum.CANCELLED;
            case 7:
            case 8:
            case 10: return OrderInternalStatusEnum.RETURNED;
            default:
                reportUnknownEnum(PAZARAMA_ORDERS_CONTRACT_ID, 'status', Number.isFinite(s) ? String(s) : String(status ?? 'MISSING'));
                return OrderInternalStatusEnum.UNAPPROVED;
        }
    }

    private mapItemStatus(status: any): 'ACTIVE' | 'CANCELLED' | 'RETURNED' {
        const s = Number(status);
        if ([6, 13, 14].includes(s)) return 'CANCELLED';
        if ([7, 8, 9, 10].includes(s)) return 'RETURNED';
        return 'ACTIVE';
    }

    private mapToIAddress(addr: any, fallbackFirstName?: string, fallbackLastName?: string): IAddress {
        const nameSurname = addr?.NameSurname || addr?.nameSurname || "";
        const nameParts = nameSurname.split(' ') || [];
        return {
            firstName: (nameParts[0] || fallbackFirstName || "Müşteri").trim(),
            lastName: (nameParts.slice(1).join(' ') || fallbackLastName || "").trim(),
            companyName: addr?.CompanyName || addr?.companyName || "",
            isCorporate: !!(addr?.TaxNumber || addr?.taxNumber),
            taxNumber: addr?.TaxNumber || addr?.taxNumber || "",
            taxOffice: addr?.TaxOffice || addr?.taxOffice || "",
            email: addr?.CustomerEmail || addr?.customerEmail || "",
            phone: addr?.PhoneNumber || addr?.phoneNumber || "",
            addressLine1: addr?.AddressDetail || addr?.addressDetail || "Adres Bilgisi Yok",
            addressLine2: (addr?.NeighborhoodName || addr?.neighborhoodName) ? `${addr.NeighborhoodName || addr.neighborhoodName} Mah.` : "",
            city: addr?.CityName || addr?.cityName || "",
            state: addr?.DistrictName || addr?.districtName || "",
            postalCode: addr?.PostalCode || addr?.postalCode || "",
            countryCode: 'TR'
        };
    }

    private mapToICustomerAddress(addr: IAddress): ICustomerAddress {
        return {
            ...addr,
            addressLine: addr.addressLine1,
            isDefaultShipping: false,
            isDefaultBilling: false
        };
    }

    private safeNumber(val: any): number {
        if (val === null || val === undefined) return 0;
        const n = Number(typeof val === 'object' ? (val.Value ?? val.value ?? 0) : val);
        return isNaN(n) ? 0 : n;
    }
}
