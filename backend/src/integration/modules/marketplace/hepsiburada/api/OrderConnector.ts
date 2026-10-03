import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { HB_ORDERS_LIST } from '../contracts';
import Service from '../services/Service';
import { IPlatformResponse, ISendInvoicePayload } from '@interfaces/index';
import { fromHttpError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';
import { paginateOffset, readTotal } from './paginateOffset';

/**
 * Platform `Integrations.urls` içindeki ESKİ sipariş yolları (`rest/delivery/v1/shipmentPackages[...]`) OMS API'sinde yoktur (404; 2026-10-03 canlı
 * salt-okuma ile doğrulandı). Bu değerler yok sayılır -> kod varsayılanı (`orders/merchantid/...`) kullanılır; DB kaydı ayrıca düzeltilmeli (BACKLOG).
 * Dize değil/boş -> undefined (çağıran varsayılanı kullanır); başka özel değerlere dokunulmaz.
 */
export function legacyOmsPath(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value) return undefined;
    return /^\/?rest\/delivery\/v1\//i.test(value) ? undefined : value;
}

export class OrderConnector {
    constructor(private service: Service, private params: any) { }

    private getMerchantId(): string {
        const s = this.params.integrationSettings?.settings || {};
        return s.MERCHANTID || s.merchantid || s.SELLERID || s.sellerid || s.APIKEY || s.apikey || "";
    }

    private orderListUrl(): string {
        const merchantId = this.getMerchantId();
        const urls = this.params.integrationSettings.urls || {};
        const url: string = legacyOmsPath(urls.orderListUrl || urls.orders) ?? `orders/merchantid/${merchantId}`;
        return url.replace('<MERCHANTID>', merchantId);
    }

    /** [INT-05 testConnection] Yan etkisiz en ucuz okuma: sipariş listesinin TEK kaydı (limit=1). Gövde atılır (PII saklanmaz). */
    public async probeConnection(): Promise<void> {
        await this.service.get(this.orderListUrl(), { limit: 1, offset: 0 }, { operation: 'testConnection' });
    }

    public async fetchOrdersFromPlatform(query?: any): Promise<any[]> {
        const url = this.orderListUrl();

        // [faz4-int-wp1 / F-02] Tüm sayfalar dolaşılır (bkz. paginateOffset); çağıranın limit/offset'i başlangıç değeri olarak korunur.
        const { limit: qLimit, offset: qOffset, ...rest } = query || {};
        const startOffset = Number(qOffset) || 0;
        return paginateOffset(async (fetched, limit) => {
            const response = await this.service.get(url, { ...rest, limit, offset: startOffset + fetched });
            const data = response?.data;
            observeResponseSchema(HB_ORDERS_LIST, data, { clientId: this.params.clientId });
            return { items: Array.isArray(data?.items) ? data.items : [], total: readTotal(data) };
        }, { operation: 'fetchOrdersFromPlatform', clientId: this.params.clientId, limit: Number(qLimit) || undefined });
    }

    public async fetchOrderDetails(orderNumber: string): Promise<any> {
        const merchantId = this.getMerchantId();
        const urls = this.params.integrationSettings.urls || {};
        let url = legacyOmsPath(urls.orderDetailUrl) ?? `orders/merchantid/${merchantId}/ordernumber/${orderNumber}`;

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
