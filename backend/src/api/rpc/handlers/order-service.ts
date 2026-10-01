import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import * as orders from '@operations/orders/orders'
import { getOrderDashboardInsights } from '@operations/orders/dashboard'

/**
 * ADR-0024 P3-ORD: sipariş RPC cephesi. İş akışları `operations/orders/{orders,dashboard}`, sorgular
 * `database/repositories/tenant/OrderRepository` (RPC adları ve yanıt biçimleri değişmez).
 */
export default class OrderService extends BaseApi implements IService {

    private get deps(): orders.OrderDeps {
        return { clientDB: this.clientDB, clientId: this.currentClientId }
    }

    async get(): Promise<any> {
        // İleride tekil sipariş detayı çekmek için
    }

    /** SİPARİŞLERİ LİSTELEME (arama, filtre, sıralama, sayfalama). */
    async getOrders(): Promise<any> {
        try {
            return await orders.searchOrders(this.clientDB, this.request.searchOrderForm)
        } catch (error) {
            console.error('[OrderService] getOrders Hatası:', error);
            throw error;
        }
    }

    /** TEKİL SİPARİŞ İPTALİ (Reject/Unsupplied). */
    async cancelOrder(): Promise<any> {
        const { orderId } = this.request
        const { reason, reasonId } = this.request.cancelData || this.request
        return orders.cancelOrder(this.deps, orderId, reason, reasonId)
    }

    /** TOPLU SİPARİŞ İPTALİ */
    async bulkCancelOrder(): Promise<any> {
        return orders.bulkCancelOrder(this.deps, this.request.orderIds, this.request.cancelData)
    }

    /** SİPARİŞ ONAYLAMA (yalnız AWAITING_APPROVAL) */
    async approveOrder(): Promise<any> {
        return orders.approveOrder(this.deps, this.request.orderId)
    }

    /** TOPLU SİPARİŞ ONAYLAMA */
    async bulkApproveOrder(): Promise<any> {
        return orders.bulkApproveOrder(this.deps, this.request.orderIds)
    }

    /** BARKOD YAZDIRILDI İŞARETLEMESİ */
    async markAsPrinted(): Promise<any> {
        return orders.markAsPrinted(this.clientDB, this.request.orderId)
    }

    /** SİPARİŞ İPTAL NEDENLERİ (pazaryerine özgü) */
    async getOrderRejectionReasons(): Promise<any> {
        return orders.getOrderRejectionReasons(this.currentClientId, this.request.integrationCode)
    }

    /** DASHBOARD: kapsamlı iş analitiği (paralel sorgular; İstanbul günü). */
    async getOrderDashboardInsights(): Promise<any> {
        return getOrderDashboardInsights(this.clientDB)
    }
}
