import { carryIncomplete } from '@integration/contracts/IncompleteFetch';
import { IOrderPackage, IOrderRejectParams, IOrderRejectionReason, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload } from '@interfaces/index';
import { OrderConnector } from '../api/OrderConnector';
import { OrderMapper } from '../transformers/OrderTransformer';
import { Service } from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { eventLog } from '@platform/core/logger';
import { integrationCode } from '../constants';

const log = eventLog('adapter-hepsiburada', 'OrderService');
/** Kayıtların TÜMÜ kimliksizse ve en az bu kadar kayıt varsa şema kayması varsayılır (Trendyol DRIFT_MIN_RECORDS ile aynı eşik). */
const DRIFT_MIN_RECORDS = 3;

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
            if (query?.endDate) apiQuery.endDate = query.endDate instanceof Date ? query.endDate.toISOString().split('T')[0] : query.endDate;

            const rawOrders = await this.connector.fetchOrdersFromPlatform(apiQuery);
            return carryIncomplete(rawOrders, this.mapper.toInternalOrderPackages(this.dropMissingIdentity(rawOrders)));
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][HepsiburadaOrderService:fetchOrders] ${error.message}`);
        }
    }

    /** testConnection probu (bkz. OrderConnector.probeConnection); hata sınıflandırması ortak `runConnectionProbe`'dadır. */
    public probeConnection(): Promise<void> { return this.connector.probeConnection(); }

    /**
     * [INT-05 / conformance C7b, playbook §4.2] Sipariş kimliği (orderNumber/orderId) olmayan kayıt boş kimlikle SESSİZCE kaydedilmez:
     * atlanır + loglanır (Trendyol C22 deseni); kayıtların TÜMÜ (>= DRIFT_MIN_RECORDS) kimliksizse şema kayması varsayılıp VALIDATION fırlatılır.
     * `carryIncomplete` ham diziden okunur (işaret ham dizidedir); filtreli dizi yalnız mapper'a gider.
     */
    private dropMissingIdentity(raw: any[]): any[] {
        const valid = raw.filter(o => !!(o?.orderNumber || o?.orderId));
        const skipped = raw.length - valid.length;
        if (skipped === 0) return raw;
        log.error('ORDERSERVICE_HB_SIPARIS_KIMLIGI_EKSIK', `${skipped}/${raw.length} Hepsiburada sipariş kaydı kimlik (orderNumber/orderId) eksikliği nedeniyle ATLANDI (şema kayması olabilir).`);
        if (raw.length >= DRIFT_MIN_RECORDS && valid.length === 0) {
            throw new IntegrationError('VALIDATION',
                `Hepsiburada sipariş yanıtı beklenen kimlik alanlarını taşımıyor (${raw.length}/${raw.length} kayıt geçersiz; şema kayması şüphesi).`,
                { integrationCode, operation: 'fetchOrders', clientId: this.clientId, platformCode: 'ORDER_SCHEMA_DRIFT' });
        }
        return valid;
    }

    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> {
        try {
            return await this.connector.rejectOrder(externalOrderId, params.reasonId || 'Other');
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][HepsiburadaOrderService:rejectOrder] ${error.message}`);
        }
    }

    /**
     * [eslesme-fiyat WP6, K-G] HB satıcı iptal sebepleri: resmî kod listesi DOĞRULANMADI (API_HEPSIBURADA K-7: `cancelbymerchant`
     * gövdesi `reasonId`, katalog yok) → `verified:false`; mevcut `cancel` ucu sebebi metin olarak alır. SIT'te doğrulanır.
     */
    public async retrieveOrderCancelReasons(): Promise<IOrderRejectionReason[]> {
        return [
            { id: 'OUT_OF_STOCK', title: 'Stokta yok', verified: false },
            { id: 'Other', title: 'Diğer', verified: false },
        ];
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
