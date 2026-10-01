import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import * as shipments from '@operations/orders/shipments'

export const MAX_SHIPMENTS_PAGE_LIMIT = shipments.MAX_SHIPMENTS_PAGE_LIMIT

/**
 * ADR-0024 P3-ORD: sevkiyat RPC cephesi. İş akışları `operations/orders/shipments`, sorgular
 * `database/repositories/tenant/OrderRepository` (RPC adları ve yanıt biçimleri değişmez).
 */
export default class ShipmentService extends BaseApi implements IService {

    private get deps(): shipments.ShipmentDeps {
        return { clientDB: this.clientDB, clientId: this.currentClientId }
    }

    async get(): Promise<any> {
    }

    async getShipments(): Promise<any> {
        return shipments.searchShipments(this.clientDB, this.request)
    }

    /** TEKİL SEVKİYAT / KARGO PAKETİ OLUŞTURMA */
    async createShipment(): Promise<any> {
        const { orderId, fulfillmentData } = this.request
        return shipments.createShipment(this.deps, orderId, fulfillmentData)
    }

    /** TOPLU SEVKİYAT / KARGO PAKETİ OLUŞTURMA */
    async bulkCreateShipment(): Promise<any> {
        return shipments.bulkCreateShipment(this.deps, this.request.orderIds)
    }
}
