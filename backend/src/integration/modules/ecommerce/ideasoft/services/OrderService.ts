import { IOrderPackage, IOrderRejectParams, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload } from '@interfaces/index';
import { integrationCode } from '../constants';
import { OrderTransformer } from '../transformers/OrderTransformer';
import Service from './Service';
import { carryIncomplete } from '@integration/contracts/IncompleteFetch';
import { fetchAllPages, observedItems } from './paging';
import { IDEASOFT_ORDERS_LIST } from '../contracts';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class OrderService {
    private transformer: OrderTransformer;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || 'UnknownClient';
        this.transformer = new OrderTransformer(this.clientId);
    }

    public async fetchOrders(query?: Record<string, any>): Promise<IOrderPackage[]> {
        try {
            const urls = this.params.integrationSettings?.urls || {};
            const orderListUrl = urls.orderListUrl || 'orders';

            // [eslesme-fiyat WP4, API_IDEASOFT K-4 / D-IS-6] resmî filtre `startUpdatedAt`/`endUpdatedAt` (yyyy-mm-dd); eskiden
            // belgelenmemiş `startDate` gidiyordu (yok sayılınca her tur TÜM siparişler sayfalanırdı). Günlük çözünürlük nedeniyle
            // başlangıç 1 gün geriden (çift kayıt tekilleştirmeyle zararsız); motor pencere daraltırsa `endDate` → `endUpdatedAt`.
            const DAY = 24 * 60 * 60 * 1000;
            const ymd = (d: Date) => d.toISOString().split('T')[0];
            const since = query?.lastSyncTimestamp ? new Date(query.lastSyncTimestamp) : new Date(Date.now() - DAY);
            const apiParams: any = { limit: 100, page: 1, startUpdatedAt: ymd(new Date(since.getTime() - DAY)) };
            if (query?.endDate) apiParams.endUpdatedAt = ymd(new Date(query.endDate));

            const allOrders = await fetchAllPages(async page => observedItems(IDEASOFT_ORDERS_LIST, (await this.service.get(orderListUrl, { ...apiParams, page })).data, this.clientId), 'fetchOrders', this.clientId);

            // [INT-05] tavan/tekrar => motor (OrderWorker) `getIncomplete` ile okur: imleç ilerletilmez, eksik veri sessiz kaybolmaz
            return carryIncomplete(allOrders, this.transformer.toInternalOrderPackages(allOrders));
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}OrderService:fetchOrders] ${error.message}`);
        }
    }

    public async approveOrder(externalOrderId: string, params?: any): Promise<boolean | IPlatformResponse> {
        try {
            const urls = this.params.integrationSettings?.urls || {};
            const updateUrl = (urls.updateOrderUrl || 'orders/<ORDERID>').replace('<ORDERID>', externalOrderId);
            await this.service.put(updateUrl, { status: 'preparing' });
            return true;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}OrderService:approveOrder] ${error.message}`);
        }
    }

    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> {
        try {
            const urls = this.params.integrationSettings?.urls || {};
            const updateUrl = (urls.updateOrderUrl || 'orders/<ORDERID>').replace('<ORDERID>', externalOrderId);
            await this.service.put(updateUrl, { status: 'cancelled', cancelReason: params.description || params.reasonId });
            return true;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}OrderService:rejectOrder] ${error.message}`);
        }
    }

    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        try {
            const urls = this.params.integrationSettings?.urls || {};
            const updateUrl = (urls.updateOrderUrl || 'orders/<ORDERID>').replace('<ORDERID>', payload.orderId);
            await this.service.put(updateUrl, {
                status: 'shipped',
                trackingNumber: payload.trackingCode,
                cargoCompany: payload.carrierName
            });
            return { success: true };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}OrderService:sendOrderShipping] ${error.message}`);
        }
    }

    /**
     * [ADR-0006 Karar 2] TERS ÇEVRİLDİ (BACKLOG C9 sahte başarı listesi — ADR-0006 Bağlam bölümü
     * "Ideasoft sendOrderInvoice no-op success:true"): ÖNCEKİ DAVRANIŞ hiçbir çağrı yapmadan
     * `{success:true}` dönüyordu. Gerçek Ideasoft fatura bildirim uç noktası uygulanana kadar
     * NOT_SUPPORTED fırlatılır (tüketici `invoice-service.ts#syncInvoiceToPlatform` bunu try/catch
     * ile yakalayıp honest `{success:false}` döner, davranışı bozmaz).
     */
    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        throw new IntegrationError('NOT_SUPPORTED', 'Ideasoft sipariş faturası bildirimi henüz gerçek olarak uygulanmadı.', {
            integrationCode, operation: 'sendOrderInvoice', clientId: this.clientId,
        });
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
