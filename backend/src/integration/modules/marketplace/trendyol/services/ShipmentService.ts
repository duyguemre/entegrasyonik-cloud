// services/ShipmentService.ts
import shipments from '../shipment-providers.json'; // Statik JSON
import { ShipmentConnector } from '../api/ShipmentConnector';
import { ShipmentMapper } from '../transformers/ShippmentTransformer';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { IInternalAddress, IInternalShipment } from '@interfaces/index';
import { Cache } from '@utils/decorator/cache';

export class ShipmentService {
    private connector: ShipmentConnector;
    private mapper: ShipmentMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new ShipmentConnector(this.service, this.params);
        this.mapper = new ShipmentMapper();
    }

    public static getInstance(params: any, service: Service): ShipmentService {
        return new ShipmentService(params, service);
    }

    /**
     * Kargo sağlayıcılarını getirir
     */
    public async fetchShipments(): Promise<IInternalShipment[]> {
        try {
            if (!shipments) {
                throw new Error("Shipment providers JSON dosyası bulunamadı.");
            }

            // Statik JSON verisini Mapper üzerinden geçirerek dönüyoruz
            return this.mapper.toInternalShipments(shipments);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][ShipmentService:fetchShipments] ${error.message}`);
        }
    }


    @Cache({ scope: 'tenant', ttl: '5m', context: 'trendyol-shipment' })
    public async fetchAddresses(): Promise<IInternalAddress[]> {
        try {

            // Statik JSON verisini Mapper üzerinden geçirerek dönüyoruz
            const addresses = await this.connector.fetchAddresses();
            if (!addresses) {
                throw new Error("Addresler alınamadı.");
            }
            const internalAddresses = this.mapper.toInternalAddresses(addresses?.data?.supplierAddresses || []);
            return internalAddresses
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][ShipmentService:fetchAddresses] ${error.message}`);
        }
    }


}