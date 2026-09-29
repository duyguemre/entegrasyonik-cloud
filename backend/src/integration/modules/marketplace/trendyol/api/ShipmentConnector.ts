// api/ShipmentConnector.ts
import Service from '../services/Service';

export class ShipmentConnector {
    constructor(private service: Service, private params: any) { }

    // İleride Trendyol API'sinden kargo firmalarını çekmek istersen burayı kullanırsın
    public async fetchShipmentProvidersFromPlatform(): Promise<any> {
        // const url = this.params.integrationSettings.urls.shipmentProvidersUrl;
        // return await this.service.get(url);
        return null;
    }
    public async fetchAddresses(): Promise<any> {
        const settings = this.params.integrationSettings;
        const sellerId = settings?.settings?.SELLERID;
        const baseUrl = settings.urls.warehouseAddressList.replace("<SELLERID>", sellerId);
        return await this.service.get(baseUrl);
    }
}