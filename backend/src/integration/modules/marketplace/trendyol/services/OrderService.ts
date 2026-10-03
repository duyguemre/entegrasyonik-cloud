// services/OrderService.ts
import { IOrderPackage, IOrderRejectParams, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload } from '@interfaces/index';
import { OrderConnector } from '../api/OrderConnector';
import { OrderMapper } from '../transformers/OrderTransformer';
import Service from './Service';
import { resolveShippingModel } from '../constants';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class OrderService {
    private connector: OrderConnector;
    private mapper: OrderMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new OrderConnector(this.service, this.params);
        this.mapper = new OrderMapper(this.clientId, resolveShippingModel(params?.integrationSettings?.settings));
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
            // [eslesme-fiyat WP4, K-D] Kargo modeli tenant ayarından (`settings.shippingModel`). Pazaryeri lojistiğinde satıcı
            // bildirimi YOKTUR: sahte "iletildi" yerine dürüst `performed:false` döner (ADR-0006). Satıcı kargosunda takip
            // numarası resmî `update-tracking-number` ucuna bildirilir (canlı doğrulama kullanıcıda).
            const model = resolveShippingModel(this.params?.integrationSettings?.settings);
            if (model === 'marketplace') {
                return {
                    success: true,
                    performed: false,
                    message: "Trendyol lojistiği: kargo Trendyol tarafından yönetilir, satıcı bildirimi gerekmez.",
                    rawResponse: { status: 'AUTOMATED_LOGISTICS_SKIP' }
                };
            }
            return await this.connector.sendSellerTrackingNumber(payload);
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