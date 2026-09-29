import Service, { N11_DEFAULT_URLS } from '../services/Service';

export class OrderConnector {
    constructor(private service: Service, private params: any) { }

    private getUrl(key: keyof typeof N11_DEFAULT_URLS): string {
        return this.params.integrationSettings.urls?.[key] || N11_DEFAULT_URLS[key];
    }

    // REST Methods (GET => okuma, varsayılan idempotent:true)
    public async fetchOrdersRest(params: any): Promise<any> {
        const url = this.getUrl('orderListUrl');
        return await this.service.rest.get(url, params, { operation: 'fetchOrdersRest' });
    }

    // SOAP Methods
    public async fetchOrdersFromPlatform(query: any): Promise<any> {
        return await this.service.soapRequest('orderService', 'sch:OrderListRequest', query, { idempotent: true });
    }

    public async makeOrderItemShipment(payload: any): Promise<any> {
        return await this.service.soapRequest('shipmentCompanyService', 'sch:MakeOrderItemShipmentRequest', payload);
    }

    public async saveLinkSellerInvoice(payload: any): Promise<any> {
        return await this.service.soapRequest('sellerInvoiceService', 'sch:SaveLinkSellerInvoiceRequest', payload);
    }
}
