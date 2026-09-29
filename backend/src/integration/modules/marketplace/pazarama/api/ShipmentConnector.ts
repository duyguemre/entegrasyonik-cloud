import Service from '../services/Service';

export class ShipmentConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchAddresses(): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.addressListUrl || 'supplier/getaddresses';
        return await this.service.get(baseUrl);
    }
}
