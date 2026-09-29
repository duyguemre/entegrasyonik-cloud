import {
    IOrderPackage, IOrder, ICustomer, IOrderItem,
    IAddress, ICustomerAddress, OrderInternalStatusEnum
} from '@interfaces/index';
import { integrationCode } from '../constants';
import { reportUnknownEnum } from '@integration/modules/common/contract/reportUnknownEnum';

/** ADR-0018 sözleşme kimliği (Trendyol OrderTransformer.ts'teki ORDERS_CONTRACT_ID deseniyle aynı). */
export const HEPSIBURADA_ORDERS_CONTRACT_ID = 'hepsiburada.orders.list';

export class OrderMapper {
    public toInternalOrderPackages(orders: any[]): IOrderPackage[] {
        return orders.map((order: any) => {
            const shipAddr = order.shippingAddress || {};
            const cFirstName = (order.customerName?.split(' ')[0] || "MUSTERI").trim();
            const cLastName = (order.customerName?.split(' ').slice(1).join(' ') || "").trim();
            const orderNumber = String(order.orderNumber || order.orderId || '');
            const safeExternalCustomerId = String(order.customerId || `HB-GUEST-${orderNumber}`);

            const shippingAddr = this.mapToIAddress(shipAddr, cFirstName, cLastName);
            const billingAddr = this.mapToIAddress(order.billingAddress || shipAddr, cFirstName, cLastName);

            const customer: ICustomer = {
                firstName: cFirstName,
                lastName: cLastName,
                email: order.customerEmail || "",
                phone: shipAddr.phoneNumber || "",
                isEmailMasked: false,
                isPhoneMasked: false,
                externalIdentities: [{ integrationCode, externalCustomerId: safeExternalCustomerId }],
                addresses: [
                    { ...this.mapToICustomerAddress(shippingAddr), title: 'Teslimat Adresi', isDefaultShipping: true },
                    { ...this.mapToICustomerAddress(billingAddr), title: 'Fatura Adresi', isDefaultBilling: true }
                ]
            };

            const orderStatus = order.status;
            const internalOrder: IOrder = {
                integrationCode,
                externalOrderId: orderNumber,
                orderNumber: orderNumber,
                customerFirstName: cFirstName,
                customerLastName: cLastName,
                externalStatus: String(orderStatus || 'Open'),
                internalStatus: this.mapStringStatus(orderStatus),
                dates: {
                    orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
                    shippedDate: order.shippedDate ? new Date(order.shippedDate) : undefined,
                    deliveredDate: order.deliveredDate ? new Date(order.deliveredDate) : undefined,
                },
                billingAddress: billingAddr,
                shippingAddress: shippingAddr,
                financials: {
                    currencyCode: order.totalPrice?.currency || 'TRY',
                    subTotal: this.safeNumber(order.totalPrice?.amount),
                    totalDiscount: 0,
                    totalTax: 0,
                    shippingFee: 0,
                    grandTotal: this.safeNumber(order.totalPrice?.amount)
                },
                fulfillment: order.barcode ? [{
                    shipmentMethod: 'MARKETPLACE',
                    status: 'SUCCESS',
                    carrierName: order.cargoCompany || "",
                    trackingCode: order.barcode || "",
                }] : [],
                invoice: {
                    invoiceMethod: 'MARKETPLACE',
                    invoiceProvider: 'hepsiburada',
                    status: 'PENDING'
                },
                items: (order.lineItems || []).map((line: any): IOrderItem => {
                    const itemSku = line.merchantSku || line.sku || "UNKNOWN_SKU";
                    return {
                        externalLineItemId: String(line.id || line.sku || itemSku),
                        externalItemId: String(line.sku || itemSku),
                        productName: line.productName || "İsimsiz Ürün",
                        sku: itemSku,
                        barcode: line.barcode || line.sku || itemSku || "",
                        quantity: this.safeNumber(line.quantity || 1),
                        unitPrice: this.safeNumber(line.price?.amount),
                        taxRate: this.safeNumber(line.vatRate),
                        totalPrice: this.safeNumber(line.totalPrice?.amount),
                        itemStatus: this.mapItemStatus(line.status)
                    };
                }),
                flags: { isAllocated: false, isInvoiceGenerated: false, isMetricsProcessed: false },
                meta: { ...order }
            };

            return { order: internalOrder, customer, claims: [] };
        });
    }

    /**
     * [ADR-0018 Karar 2a(iii)] Bilinmeyen (tabloda olmayan) durum SESSİZCE düşmez: DAVRANIŞ (AWAITING_APPROVAL)
     * AYNI kalır ama `reportUnknownEnum` çağrılır (Trendyol OrderTransformer.ts'teki `resolveStatus` deseniyle
     * AYNI — bkz. karakterizasyon: tests/characterization/orders/Hepsiburada.orderStatus.characterization.test.ts).
     */
    private mapStringStatus(status: string): OrderInternalStatusEnum {
        if (!status) {
            reportUnknownEnum(HEPSIBURADA_ORDERS_CONTRACT_ID, 'status', 'MISSING');
            return OrderInternalStatusEnum.AWAITING_APPROVAL;
        }
        const s = status.toLowerCase();

        switch (s) {
            case 'open':
            case 'awaitingapproval':
                return OrderInternalStatusEnum.AWAITING_APPROVAL;
            case 'packaged':
            case 'unpacked':
                return OrderInternalStatusEnum.APPROVED;
            case 'shipped':
                return OrderInternalStatusEnum.SHIPPED;
            case 'delivered':
                return OrderInternalStatusEnum.DELIVERED;
            case 'cancelledbymerchant':
            case 'cancelledbycustomer':
            case 'cancelled':
                return OrderInternalStatusEnum.CANCELLED;
            case 'returned':
                return OrderInternalStatusEnum.RETURNED;
            default:
                reportUnknownEnum(HEPSIBURADA_ORDERS_CONTRACT_ID, 'status', status);
                return OrderInternalStatusEnum.AWAITING_APPROVAL;
        }
    }

    private mapItemStatus(status: string): 'ACTIVE' | 'CANCELLED' | 'RETURNED' {
        if (!status) return 'ACTIVE';
        if (status.includes('Cancelled')) return 'CANCELLED';
        if (status.includes('Returned')) return 'RETURNED';
        return 'ACTIVE';
    }

    private mapToIAddress(addr: any, fallbackFirstName?: string, fallbackLastName?: string): IAddress {
        return {
            firstName: (addr.name || fallbackFirstName || "Müşteri").trim(),
            lastName: (addr.surname || fallbackLastName || "").trim(),
            companyName: addr.companyName || "",
            isCorporate: !!addr.taxNumber,
            taxNumber: addr.taxNumber || "",
            taxOffice: addr.taxOffice || "",
            email: addr.email || "",
            phone: addr.phoneNumber || "",
            addressLine1: addr.address || "Adres Bilgisi Yok",
            addressLine2: addr.district || "",
            city: addr.city || "Belirtilmedi",
            state: addr.town || addr.district || addr.city || "Belirtilmedi",
            postalCode: addr.postalCode || "",
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
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    }
}
