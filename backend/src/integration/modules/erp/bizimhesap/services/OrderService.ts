import { IOrderPackage } from '@interfaces/index';
import { integrationCode } from '../constants';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class OrderService {
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || 'UnknownClient';
    }

    public async fetchOrders(query?: Record<string, any>): Promise<IOrderPackage[]> {
        try {
            const urls = this.params.integrationSettings?.urls || {};
            const settings = this.params.integrationSettings?.settings || {};
            const orderListUrl = urls.orderListUrl;

            if (!orderListUrl) return [];

            const finalUrl = orderListUrl.replace('<SELLERID>', settings.sellerId || '');
            const allOrders: any[] = [];
            let currentPage = 0;
            let totalPages = 1;

            while (currentPage < totalPages) {
                const qs = `?page=${currentPage}&size=1000`;
                const response = await this.service.get(finalUrl + qs);
                const data = response?.data;
                if (data?.content) allOrders.push(...data.content);
                totalPages = data?.totalPages ?? 1;
                currentPage++;
            }

            return this.convert(allOrders);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}OrderService:fetchOrders] ${error.message}`);
        }
    }

    private convert(orders: any[]): IOrderPackage[] {
        return orders.map((order: any) => ({
            integrationCode,
            externalOrderId: String(order.id),
            externalOrderNumber: String(order.orderNumber || order.id),
            orderDate: new Date(order.orderDate || order.createdAt || Date.now()),
            status: 'NEW',
            externalStatus: String(order.status || ''),
            customer: {
                name: `${order.customerFirstName || ''} ${order.customerLastName || ''}`.trim(),
                email: order.customerEmail || '',
                phone: order.shipmentAddress?.phone || ''
            },
            address: {
                shipping: {
                    fullName: `${order.shipmentAddress?.firstName || ''} ${order.shipmentAddress?.lastName || ''}`.trim(),
                    address: order.shipmentAddress?.address1 || '',
                    city: order.shipmentAddress?.city || '',
                    district: order.shipmentAddress?.district || '',
                    postalCode: order.shipmentAddress?.postalCode || '',
                    countryCode: order.shipmentAddress?.countryCode || 'TR',
                    phone: order.shipmentAddress?.phone || ''
                },
                billing: {
                    fullName: `${order.invoiceAddress?.firstName || ''} ${order.invoiceAddress?.lastName || ''}`.trim(),
                    address: order.invoiceAddress?.address1 || '',
                    city: order.invoiceAddress?.city || '',
                    district: order.invoiceAddress?.district || '',
                    postalCode: order.invoiceAddress?.postalCode || '',
                    countryCode: 'TR',
                    phone: order.invoiceAddress?.phone || ''
                }
            },
            lines: (order.lines || []).map((line: any) => ({
                externalId: String(line.id || ''),
                externalLineId: String(line.id || ''),
                productName: line.productName || '',
                barcode: line.barcode || '',
                stockcode: line.merchantSku || '',
                quantity: Number(line.quantity || 1),
                price: Number(line.amount || 0),
                discount: Number(line.discount || 0),
                status: 'NEW'
            })),
            price: {
                total: Number(order.grossAmount || 0),
                shipping: 0,
                discount: Number(order.totalDiscount || 0)
            },
            cargo: {
                company: order.cargoProviderName || '',
                trackingNumber: String(order.cargoTrackingNumber || '')
            },
            raw: order
        } as any));
    }

    public async retrieveOrderRejectionReasons(): Promise<any[]> {
        return [
            { id: '1', title: 'Stokta Yok' },
            { id: '2', title: 'Diğer' }
        ];
    }

    /** [ADR-0006 Karar 2] TERS ÇEVRİLDİ (bkz. ProductService.notSupported): generic Error yerine IntegrationError. */
    public notSupported(op: string): never {
        throw new IntegrationError('NOT_SUPPORTED', `${op} bu entegrasyon için desteklenmiyor`, {
            integrationCode, operation: op, clientId: this.clientId,
        });
    }
}
