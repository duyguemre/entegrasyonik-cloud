import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ShipmentPanelRepository } from '@database/repositories/tenant/ShipmentPanelRepository'
import { listShipments, createShipment, bulkCreateShipments } from '@operations/orders/shipments'

export { MAX_SHIPMENTS_PAGE_LIMIT } from '@operations/orders/shipments'

/**
 * Sevkiyat RPC cephesi (ADR-0024 Dalga 3 P3-ORD). Sorgular `ShipmentPanelRepository`'de, iş kuralları `operations/orders/shipments`'da;
 * RPC adları ve yanıt biçimleri değişmedi. Tenant izolasyonu `this.clientDB` (tenant DB) seçimiyle.
 */
export default class ShipmentService extends BaseApi implements IService {

    private get shipments(): ShipmentPanelRepository { return new ShipmentPanelRepository(this.clientDB) }
    private get deps() {
        return {
            repo: this.shipments,
            clientId: Number(this.currentClientId),
            logError: (message: string, error: unknown) => console.error(message, error)
        }
    }

    async get(): Promise<any> {
    }

    async getShipments(): Promise<any> {
        return listShipments(this.shipments, this.request);
    }

    /**
     * TEKİL SEVKİYAT / KARGO PAKETİ OLUŞTURMA
     */
    async createShipment(): Promise<any> {
        try {
            const { orderId, fulfillmentData } = this.request;
            return await createShipment(this.deps, orderId, fulfillmentData);
        } catch (error: any) {
            console.error('[ShipmentService] createShipment Hatası:', error);
            throw error;
        }
    }

    /**
     * TOPLU SEVKİYAT / KARGO PAKETİ OLUŞTURMA
     * Seçilen tüm siparişler için sırayla createShipment metodunu tetikler.
     */
    async bulkCreateShipment(): Promise<any> {
        const { orderIds } = this.request;
        const originalRequest = { ...this.request };
        const result = await bulkCreateShipments(this.shipments, orderIds, (orderId) => {
            this.request = { orderId };
            return this.createShipment();
        });
        // İstek objesini eski haline getir
        this.request = originalRequest;
        return result;
    }
}
