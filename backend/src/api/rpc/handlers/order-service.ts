import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { OrderPanelRepository } from '@database/repositories/tenant/OrderPanelRepository'
import { listOrders } from '@operations/orders/orderList'
import { cancelOrder, bulkCancelOrders, approveOrder, bulkApproveOrders, markOrderPrinted, orderRejectionReasons } from '@operations/orders/orderActions'
import { orderDashboardInsights } from '@operations/orders/dashboard'
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'order-service');

/**
 * Sipariş RPC cephesi (ADR-0024 Dalga 3 P3-ORD). Sorgular `OrderPanelRepository`'de, iş kuralları `operations/orders/*`'da;
 * RPC adları ve yanıt biçimleri değişmedi. Tenant izolasyonu `this.clientDB` (tenant DB) seçimiyle.
 */
export default class OrderService extends BaseApi implements IService {

    private get orders(): OrderPanelRepository { return new OrderPanelRepository(this.clientDB) }
    private get deps() { return { repo: this.orders, clientId: Number(this.currentClientId) } }

    async get(): Promise<any> {
        // İleride tekil sipariş detayı çekmek için
    }

    /** SİPARİŞLERİ LİSTELEME (Arama, Filtreleme, Sıralama, Sayfalama) */
    async getOrders(): Promise<any> {
        try {
            return await listOrders(this.orders, this.request.searchOrderForm);
        } catch (error) {
            log.error('ORDER_GET_ORDERS_FAILED', '[OrderService] getOrders hatası', { err: error });
            throw error;
        }
    }

    /** TEKİL SİPARİŞ İPTALİ (Reject/Unsupplied) */
    async cancelOrder(): Promise<any> {
        return cancelOrder(this.deps, this.request.orderId, this.request.cancelData || this.request);
    }

    /** TOPLU SİPARİŞ İPTALİ */
    async bulkCancelOrder(): Promise<any> {
        return bulkCancelOrders(this.deps, this.request.orderIds, this.request.cancelData);
    }

    /** SİPARİŞ ONAYLAMA (Marketplace Entegrasyonlu) */
    async approveOrder(): Promise<any> {
        return approveOrder(this.deps, this.request.orderId);
    }

    /** TOPLU SİPARİŞ ONAYLAMA */
    async bulkApproveOrder(): Promise<any> {
        return bulkApproveOrders(this.deps, this.request.orderIds);
    }

    /** BARKOD YAZDIRILDI İŞARETLEMESİ */
    async markAsPrinted(): Promise<any> {
        return markOrderPrinted(this.orders, this.request.orderId);
    }

    /** SİPARİŞ İPTAL NEDENLERİNİ GETİR (Pazaryerine Özgü) */
    async getOrderRejectionReasons(): Promise<any> {
        return orderRejectionReasons(Number(this.currentClientId), this.request.integrationCode);
    }

    /** DASHBOARD: Kapsamlı İş Analitiği (paralel sorgular) */
    async getOrderDashboardInsights(): Promise<any> {
        return orderDashboardInsights(this.orders);
    }
}
