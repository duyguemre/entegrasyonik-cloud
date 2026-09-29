import shipments from '../shipment-providers.json';
import { ShipmentConnector } from '../api/ShipmentConnector';
import { ShipmentMapper } from '../transformers/ShipmentTransformer';
import Service from './Service';
import { IInternalAddress, IInternalShipment } from '@interfaces/index';
import { Cache } from '@utils/decorator/cache';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class ShipmentService {
    private connector: ShipmentConnector;
    private mapper: ShipmentMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new ShipmentConnector(this.service, this.params);
        this.mapper = new ShipmentMapper();
    }

    public async fetchShipments(): Promise<IInternalShipment[]> {
        return this.mapper.toInternalShipments(shipments);
    }

    @Cache(300, 'shipment-service', that => that.clientId)
    public async fetchAddresses(): Promise<IInternalAddress[]> {
        try {
            const response = await this.connector.fetchAddresses();
            const addresses = response?.data?.addresses || response?.data || [];
            return this.mapper.toInternalAddresses(addresses);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaShipmentService:fetchAddresses] ${error.message}`);
        }
    }
}
