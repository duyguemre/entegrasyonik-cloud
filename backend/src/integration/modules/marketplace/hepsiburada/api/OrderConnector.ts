import Service from '../services/Service';
import { IPlatformResponse, ISendInvoicePayload } from '@interfaces/index';
import { fromHttpError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';

export class OrderConnector {
    constructor(private service: Service, private params: any) { }

    private getMerchantId(): string {
        const s = this.params.integrationSettings?.settings || {};
        return s.MERCHANTID || s.merchantid || s.SELLERID || s.sellerid || s.APIKEY || s.apikey || "";
    }

    public async fetchOrdersFromPlatform(query?: any): Promise<any[]> {
        const merchantId = this.getMerchantId();
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.orderListUrl || urls.orders || `orders/merchantid/${merchantId}`;
        
        url = url.replace('<MERCHANTID>', merchantId);

        const response = await this.service.get(url, {
            limit: 100,
            offset: 0,
            ...query
        });

        return response?.data?.items || [];
    }

    public async fetchOrderDetails(orderNumber: string): Promise<any> {
        const merchantId = this.getMerchantId();
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.orderDetailUrl || `orders/merchantid/${merchantId}/ordernumber/${orderNumber}`;
        
        url = url.replace('<MERCHANTID>', merchantId).replace('<ORDERNUMBER>', orderNumber).replace('<PACKAGEID>', orderNumber);
        
        const response = await this.service.get(url);
        return response?.data;
    }

    public async createPackage(lineItemRequests: any[]): Promise<any> {
        const merchantId = this.getMerchantId();
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.packageCreateUrl || `packages/merchantid/${merchantId}`;
        
        url = url.replace('<MERCHANTID>', merchantId);
        
        const response = await this.service.post(url, { lineItemRequests });
        return response?.data;
    }

    public async rejectOrder(orderNumber: string, reason: string): Promise<boolean> {
        const merchantId = this.getMerchantId();
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.orderRejectUrl || `orders/merchantid/${merchantId}/cancel`;
        
        url = url.replace('<MERCHANTID>', merchantId).replace('<ORDERNUMBER>', orderNumber);

        await this.service.post(url, {
            orderNumber,
            cancellationReason: reason
        });
        return true;
    }

    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        const merchantId = this.getMerchantId();
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.orderInvoiceUrl || `orders/merchantid/${merchantId}/invoices`;
        
        url = url.replace('<MERCHANTID>', merchantId);

        try {
            const body = [{
                orderNumber: payload.orderId,
                invoiceUrl: payload.pdfUrl
            }];

            const response = await this.service.post(url, body);
            return {
                success: true,
                message: "Fatura linki iletildi.",
                platformId: payload.orderId,
                rawResponse: response.data
            };
        } catch (error: any) {
            // [ADR-0006 adım 2]
            throw fromHttpError(error, {
                integrationCode, operation: 'sendOrderInvoice', clientId: this.params.clientId, idempotent: false,
            });
        }
    }

    public async fetchPackageLabel(orderNumber: string): Promise<any> {
        const merchantId = this.getMerchantId();
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.orderLabelUrl || `orders/merchantid/${merchantId}/ordernumber/${orderNumber}/labels`;
        
        url = url.replace('<MERCHANTID>', merchantId).replace('<ORDERNUMBER>', orderNumber);
        
        const response = await this.service.get(url);
        return response?.data;
    }
}
