// services/OrderService.ts
import { IOrderPackage, IOrderRejectParams, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload } from '@interfaces/index';
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
        this.mapper = new OrderMapper(this.clientId);
    }

    public static getInstance(params: any, service: Service): OrderService {
        return new OrderService(params, service);
    }

    public async fetchOrders(query?: Record<string, any>): Promise<IOrderPackage[]> {
        try {
            const rawOrders = await this.connector.fetchOrdersFromPlatform(query);
            return this.mapper.toInternalOrderPackages(rawOrders);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][OrderService:fetchOrders] ${error.message}`);
        }
    }

    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> {
        try {
            await this.connector.rejectOrder(externalOrderId, params);
            return true;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][OrderService:rejectOrder] ${error.message}`);
        }
    }


    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        try {
            // TODO: İleride 'MARKETPLACE' değeri ayardan okunabilir.
            // Trendyol'da eğer kargo platform tarafından yönetiliyorsa (MARKETPLACE),
            // kargo bildirim servisi kullanılmaz. Bu durumda no-op (başarılı) döneriz.
            if (payload.meta?.shipmentMethod === 'MARKETPLACE') {
                return {
                    success: true,
                    message: "Marketplace tarafından yönetilen sevkiyat. Bildirim atlanıyor.",
                    rawResponse: { status: 'AUTOMATED_LOGISTICS_SKIP' }
                };
            }

            // Connector'dan gelen IPlatformResponse tipindeki cevabı döndür
            return await this.connector.sendOrderShipping(payload);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][OrderService:sendOrderShipping] ${error.message}`);
        }
    }

    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        try {
            // Connector'dan gelen cevabı yukarıya (Facade'e) pasla
            return await this.connector.sendOrderInvoice(payload);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][OrderService:sendOrderInvoice] ${error.message}`);
        }
    }
}