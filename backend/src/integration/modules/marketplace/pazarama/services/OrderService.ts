import { IOrderPackage, IOrderRejectParams, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload, OrderInternalStatusEnum } from '@interfaces/index';
import { OrderConnector } from '../api/OrderConnector';
import { OrderMapper } from '../transformers/OrderTransformer';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class OrderService {
    private connector: OrderConnector;
    private mapper: OrderMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new OrderConnector(this.service, this.params);
        this.mapper = new OrderMapper();
    }

    public async fetchOrders(query?: Record<string, any>): Promise<IOrderPackage[]> {
        try {
            // Pazarama API expects startDate and endDate
            const apiQuery: any = {};
            if (query?.lastSyncTimestamp) {
                apiQuery.startDate = new Date(query.lastSyncTimestamp).toISOString();
                apiQuery.endDate = new Date().toISOString();
            } else {
                // Fallback to last 24 hours if no sync date
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                apiQuery.startDate = yesterday.toISOString();
                apiQuery.endDate = new Date().toISOString();
            }

            const rawOrders = await this.connector.fetchOrdersFromPlatform(apiQuery);
            return this.mapper.toInternalOrderPackages(rawOrders);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:fetchOrders] ${error.message}`);
        }
    }

    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> {
        try {
            // Pazarama dökümanına göre satıcı tarafından reddedilen (stok yok vb.) siparişler 13 (Tedarik Edilemedi) statüsüne alınmalıdır.
            // Siparişteki tüm kalemler için bu işlemi yapıyoruz.
            const items = params.lineItems || [];
            
            if (items.length === 0) {
                // Eğer kalem bilgisi yoksa (fail-safe), externalOrderId'yi orderItemId olarak deniyoruz
                await this.connector.updateOrderStatus(externalOrderId, externalOrderId, 13);
            } else {
                for (const item of items) {
                    await this.connector.updateOrderStatus(externalOrderId, item.externalLineId, 13);
                }
            }
            
            return true;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:rejectOrder] ${error.message}`);
        }
    }

    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        try {
            // Pazarama Rule: Must be in status 12 (Preparing) before status 5 (Shipped)
            // We can check metadata if we have it, or just attempt a transition if not sure.
            // For now, we'll implement a robust check or sequential call if the omurga doesn't handle states.

            // If the external status is 3, we MUST move it to 12 first.
            if (payload.meta?.currentExternalStatus === '3' || payload.meta?.status === 3 || payload.meta?.orderStatus === 3) {
                await this.connector.updateOrderStatus(payload.orderId, payload.lineItems?.[0]?.externalLineItemId || payload.meta?.orderItemId || payload.orderId, 12);
            }

            return await this.connector.sendOrderShipping(payload);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:sendOrderShipping] ${error.message}`);
        }
    }

    public async updateOrderPackageStatus(orderNumber: string, externalLineItemId: string, targetStatus: OrderInternalStatusEnum): Promise<boolean> {
        try {
            let pazaramaStatus = 3;
            if (targetStatus === OrderInternalStatusEnum.APPROVED) pazaramaStatus = 12;
            if (targetStatus === OrderInternalStatusEnum.SHIPPED) pazaramaStatus = 5;
            if (targetStatus === OrderInternalStatusEnum.DELIVERED) pazaramaStatus = 11;
            if (targetStatus === OrderInternalStatusEnum.CANCELLED) pazaramaStatus = 6;

            return await this.connector.updateOrderStatus(orderNumber, externalLineItemId, pazaramaStatus);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:updateOrderPackageStatus] ${error.message}`);
        }
    }

    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        try {
            return await this.connector.sendOrderInvoice(payload);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:sendOrderInvoice] ${error.message}`);
        }
    }

    public async retrieveOrderRejectionReasons(): Promise<any[]> {
        return [
            { id: '1', title: 'Stokta Yok' },
            { id: '2', title: 'Hatalı Fiyat' },
            { id: '3', title: 'Müşteri Talebi' },
            { id: '4', title: 'Diğer' }
        ];
    }
}
