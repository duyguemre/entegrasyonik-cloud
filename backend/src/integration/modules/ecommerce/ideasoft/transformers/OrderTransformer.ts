import { IOrderPackage } from '@interfaces/index';
import { integrationCode } from '../constants';

export class OrderTransformer {
    public toInternalOrderPackages(rawOrders: any[]): IOrderPackage[] {
        if (!Array.isArray(rawOrders)) return [];
        return rawOrders.map((order: any) => this.toInternalOrderPackage(order)).filter(Boolean) as IOrderPackage[];
    }

    private toInternalOrderPackage(order: any): IOrderPackage | null {
        try {
            const lines = (order.orderLines || order.lines || order.items || []).map((line: any, idx: number) => ({
                externalId: String(line.id || `${order.id}_${idx}`),
                externalLineId: String(line.id || `${order.id}_${idx}`),
                productName: line.product?.name || line.productName || '',
                barcode: line.product?.barcode || line.barcode || '',
                stockcode: line.product?.sku || line.sku || '',
                quantity: Number(line.quantity || 1),
                price: Number(line.price || line.salePrice || 0),
                discount: 0,
                status: this.mapLineStatus(order.status)
            }));

            const shippingAddr = order.shippingAddress || order.deliveryAddress || {};
            const billingAddr = order.billingAddress || order.invoiceAddress || shippingAddr;

            return {
                integrationCode,
                externalOrderId: String(order.id || order.orderNumber),
                externalOrderNumber: String(order.orderNumber || order.id),
                orderDate: new Date(order.createdAt || order.orderDate || Date.now()),
                status: this.mapOrderStatus(order.status),
                externalStatus: String(order.status || ''),
                customer: {
                    name: `${shippingAddr.firstName || ''} ${shippingAddr.lastName || ''}`.trim()
                        || order.customer?.name || '',
                    email: order.customer?.email || order.customerEmail || '',
                    phone: shippingAddr.phone || order.customer?.phone || ''
                },
                address: {
                    shipping: {
                        fullName: `${shippingAddr.firstName || ''} ${shippingAddr.lastName || ''}`.trim(),
                        address: shippingAddr.address || shippingAddr.addressLine || '',
                        city: shippingAddr.city || '',
                        district: shippingAddr.district || '',
                        postalCode: shippingAddr.postalCode || '',
                        countryCode: 'TR',
                        phone: shippingAddr.phone || ''
                    },
                    billing: {
                        fullName: `${billingAddr.firstName || ''} ${billingAddr.lastName || ''}`.trim(),
                        address: billingAddr.address || billingAddr.addressLine || '',
                        city: billingAddr.city || '',
                        district: billingAddr.district || '',
                        postalCode: billingAddr.postalCode || '',
                        countryCode: 'TR',
                        phone: billingAddr.phone || ''
                    }
                },
                lines,
                price: {
                    total: Number(order.totalPrice || order.total || 0),
                    shipping: Number(order.shippingPrice || 0),
                    discount: 0
                },
                cargo: {
                    company: order.cargo?.company || order.cargoCompany || '',
                    trackingNumber: order.cargo?.trackingNumber || order.trackingNumber || ''
                },
                raw: order
            } as any;
        } catch {
            return null;
        }
    }

    private mapOrderStatus(status: string | number): string {
        const map: Record<string, string> = {
            'new': 'NEW',
            'preparing': 'APPROVED',
            'shipped': 'SHIPPED',
            'delivered': 'DELIVERED',
            'cancelled': 'CANCELLED',
            'returned': 'CANCELLED',
            '1': 'NEW',
            '2': 'APPROVED',
            '3': 'SHIPPED',
            '4': 'DELIVERED',
            '5': 'CANCELLED'
        };
        return map[String(status)] || 'NEW';
    }

    private mapLineStatus(orderStatus: string | number): string {
        return this.mapOrderStatus(orderStatus);
    }
}
