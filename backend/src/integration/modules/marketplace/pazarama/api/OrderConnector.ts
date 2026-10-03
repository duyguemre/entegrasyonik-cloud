import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { PAZARAMA_ORDERS_LIST } from '../contracts';
import Service from '../services/Service';
import { IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload } from '@interfaces/index';
import { fromHttpError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';
import { paginatePage } from './paginatePage';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** [D-PZ-11] Ham siparişin GUID kimliği (`OrderId`/`orderId`); GUID değilse undefined. */
export function pazaramaOrderGuid(raw: any): string | undefined {
    const v = raw?.OrderId ?? raw?.orderId;
    return typeof v === 'string' && GUID_RE.test(v) ? v : undefined;
}

export class OrderConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchOrdersFromPlatform(query?: any): Promise<any[]> {
        const baseUrl = this.params.integrationSettings?.urls?.orderListUrl || 'order/getOrdersForApi';
        // [INT-05 / F-02] Tüm sayfalar dolaşılır (bkz. paginatePage); çağıranın pageNumber/pageSize'ı başlangıç değeri olarak korunur.
        const { pageNumber, pageSize, ...rest } = query || {};
        return paginatePage(async (page, limit) => {
            // [ADR-0006 1f] POST kullanır ama semantik olarak sipariş sorgusudur (okuma) -> idempotent:true.
            const response = await this.service.post(baseUrl, { ...rest, pageNumber: page, pageSize: limit }, { idempotent: true, operation: 'fetchOrdersFromPlatform' });
            observeResponseSchema(PAZARAMA_ORDERS_LIST, response?.data, { clientId: this.params.clientId });
            // Pazarama returns { data: [], success: true ... }
            const items = response?.data?.data || response?.data || [];
            return Array.isArray(items) ? items : [];
        }, { operation: 'fetchOrdersFromPlatform', clientId: this.params.clientId, startPage: Number(pageNumber) || 1, limit: Number(pageSize) || undefined });
    }

    // Pazarama'da ayrı bir reject servisi yoktur, updateOrderStatus (PUT) kullanılır.
    // Bu yüzden bu metod connector seviyesinde gereksizdir.

    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        const baseUrl = this.params.integrationSettings?.urls?.orderUpdateUrl || 'order/updateOrderStatus';
        try {
            // Pazarama Kargo Takip Durumunu Bildirme (PUT)
            const body = {
                orderNumber: payload.orderId, // Use externalOrderId
                item: {
                    orderItemId: payload.lineItems?.[0]?.externalLineItemId || payload.meta?.orderItemId || payload.orderId,
                    status: 5, // Shipped
                    deliveryType: payload.meta?.deliveryType || 1, // Default to Cargo (1)
                    shippingTrackingNumber: String(payload.trackingCode),
                    trackingUrl: payload.trackingUrl || "",
                    cargoCompanyId: payload.carrierCode // Guid from DB/Platform
                }
            };

            const response = await this.service.put(baseUrl, body, { operation: 'sendOrderShipping' });
            return {
                success: true,
                message: "Kargo takip durumu bildirildi.",
                platformId: payload.orderId,
                rawResponse: response.data
            };
        } catch (error: any) {
            // [ADR-0006 adım 2] IntegrationError sözleşmesi: generic Error yerine kod/retryable taşıyan tip.
            throw fromHttpError(error, {
                integrationCode, operation: 'sendOrderShipping', clientId: this.params.clientId, idempotent: false,
            });
        }
    }

    public async updateOrderStatus(orderNumber: string, orderItemId: string, status: number): Promise<boolean> {
        const baseUrl = this.params.integrationSettings?.urls?.orderUpdateUrl || 'order/updateOrderStatus';
        const body = {
            orderNumber: orderNumber,
            item: {
                orderItemId: orderItemId,
                status: status
            }
        };
        await this.service.put(baseUrl, body);
        return true;
    }

    /**
     * [eslesme-fiyat WP4, D-PZ-9 (P0 oversell), 02-ekler/pazarama C-11] Siparişin TÜM kalemlerinin statüsünü tek istekte günceller:
     * `PUT order/updateOrderStatusList {orderNumber, status}`. Onay (12) ve tedarik edememe (13) bu uçla yapılır; kalem bazlı uç
     * yalnız kargo bildirimi ve kısmi işlemler için kalır. Yazma ucu (canlıda guard bloklar; doğrulama yerelde).
     */
    public async updateOrderStatusList(orderNumber: string, status: number): Promise<boolean> {
        const baseUrl = this.params.integrationSettings?.urls?.orderStatusListUpdateUrl || 'order/updateOrderStatusList';
        await this.service.put(baseUrl, { orderNumber, status }, { operation: 'updateOrderStatusList' });
        return true;
    }

    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        const baseUrl = this.params.integrationSettings?.urls?.orderInvoiceUpdateUrl || 'order/invoice-link';
        try {
            // Pazarama supports both Order-level and Package-level invoice links
            // If we have shipment info in meta, we send it as a Package update
            const body = {
                invoiceLink: payload.pdfUrl,
                // [eslesme-fiyat WP4, 02-ekler/pazarama C-12 / D-PZ-11] `orderid` sipariş GUID'i (`OrderId`) bekler; eskiden
                // OrderNumber gidiyordu. Ham siparişte GUID yoksa (eski kayıt) OrderNumber'a düşülür.
                orderid: pazaramaOrderGuid(payload.meta?.platformOrder) ?? payload.orderId,
                deliveryCompanyId: payload.meta?.carrierId || payload.meta?.deliveryCompanyId || null,
                trackingNumber: payload.meta?.trackingNumber || payload.meta?.trackingCode || null
            };

            const response = await this.service.post(baseUrl, body, { operation: 'sendOrderInvoice' });
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
}
