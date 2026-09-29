import { IOrderPackage, IOrderRejectParams, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload } from '@interfaces/index';
import { OrderConnector } from '../api/OrderConnector';
import { OrderMapper } from '../transformers/OrderTransformer';
import { Service } from './Service';
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
            const apiQuery: any = {};
            if (query?.lastSyncTimestamp) {
                const date = new Date(query.lastSyncTimestamp);
                apiQuery.beginDate = date.toISOString().split('T')[0];
            }
            if (query?.beginDate) apiQuery.beginDate = query.beginDate;
            if (query?.endDate) apiQuery.endDate = query.endDate;

            const rawOrders = await this.connector.fetchOrdersFromPlatform(apiQuery);
            return this.mapper.toInternalOrderPackages(rawOrders);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][HepsiburadaOrderService:fetchOrders] ${error.message}`);
        }
    }

    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> {
        try {
            return await this.connector.rejectOrder(externalOrderId, params.reasonId || 'Other');
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][HepsiburadaOrderService:rejectOrder] ${error.message}`);
        }
    }

    public async approveOrder(externalOrderId: string): Promise<boolean | IPlatformResponse> {
        try {
            // Hepsiburada requires line item IDs to create a package (approval)
            // Fetch order details first to get items
            const orderDetail = await this.connector.fetchOrderDetails(externalOrderId);
            if (!orderDetail || !orderDetail.lineItems) return false;

            const lineItemRequests = orderDetail.lineItems
                .filter((li: any) => li.status !== 'Cancelled' && li.status !== 'Returned')
                .map((li: any) => ({ id: li.id }));

            if (lineItemRequests.length === 0) return true;

            const packageResult = await this.connector.createPackage(lineItemRequests);
            
            // Now fetch label
            const labelResult = await this.connector.fetchPackageLabel(externalOrderId);

            return {
                success: true,
                message: "Sipariş paketlendi ve etiket alındı.",
                platformId: externalOrderId,
                rawResponse: {
                    ...packageResult,
                    ...labelResult
                }
            };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][HepsiburadaOrderService:approveOrder] ${error.message}`);
        }
    }

    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        try {
            // Hepsiburada process: Create package first if not already created
            // For simplicity in mock, we'll assume package creation is handled or happens here
            const lineItemRequests = (payload.lineItems || []).map(li => ({ id: li.externalLineItemId }));
            await this.connector.createPackage(lineItemRequests);

            return {
                success: true,
                message: "Kargo paketi oluşturuldu.",
                platformId: payload.orderId
            };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][HepsiburadaOrderService:sendOrderShipping] ${error.message}`);
        }
    }

    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        try {
            return await this.connector.sendOrderInvoice(payload);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][HepsiburadaOrderService:sendOrderInvoice] ${error.message}`);
        }
    }
}
