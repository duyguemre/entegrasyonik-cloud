import Service, { N11_DEFAULT_URLS } from '../services/Service';

export class ReturnConnector {
    constructor(private service: Service, private params: any) { }

    // SOAP Methods
    public async claimReturnList(payload: any): Promise<any> {
        return await this.service.soapRequest('returnService', 'sch:ClaimReturnListRequest', payload, { idempotent: true });
    }

    public async claimReturnApprove(payload: any): Promise<any> {
        return await this.service.soapRequest('returnService', 'sch:ClaimReturnApproveRequest', payload);
    }

    public async claimReturnReject(payload: any): Promise<any> {
        return await this.service.soapRequest('returnService', 'sch:ClaimReturnRejectRequest', payload);
    }
}

export class SettlementConnector {
    constructor(private service: Service, private params: any) { }

    // SOAP Methods
    public async getSettlementList(payload: any): Promise<any> {
        return await this.service.soapRequest('settlementService', 'sch:GetSettlementListRequest', payload, { idempotent: true });
    }
}

export class ShipmentConnector {
    constructor(private service: Service, private params: any) { }

    private getUrl(key: keyof typeof N11_DEFAULT_URLS): string {
        return this.params.integrationSettings.urls?.[key] || N11_DEFAULT_URLS[key];
    }

    // REST Methods
    public async fetchAddressesRest(): Promise<any> {
        const pattern = this.getUrl('warehouseAddressList');
        const sellerId = this.params.integrationSettings.settings.SELLERID || '';
        const url = pattern.replace('<SELLERID>', sellerId);
        return await this.service.rest.get(url);
    }

    // SOAP Methods
    public async fetchShipmentCompanies(): Promise<any> {
        return await this.service.soapRequest('shipmentCompanyService', 'sch:GetShipmentCompaniesRequest', {}, { idempotent: true });
    }
}
