import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { N11_ORDERS_LIST_REST, N11_ORDERS_LIST_SOAP } from '../contracts';
import Service, { N11_DEFAULT_URLS } from '../services/Service';

export class OrderConnector {
    constructor(private service: Service, private params: any) { }

    private getUrl(key: keyof typeof N11_DEFAULT_URLS): string {
        return this.params.integrationSettings.urls?.[key] || N11_DEFAULT_URLS[key];
    }

    // REST Methods (GET => okuma, varsayılan idempotent:true)
    public async fetchOrdersRest(params: any): Promise<any> {
        const url = this.getUrl('orderListUrl');
        const data = await this.service.rest.get(url, params, { operation: 'fetchOrdersRest' });
        observeResponseSchema(N11_ORDERS_LIST_REST, data, { clientId: this.params.clientId });
        return data;
    }

    // SOAP Methods
    public async fetchOrdersFromPlatform(query: any): Promise<any> {
        const data = await this.service.soapRequest('orderService', 'sch:OrderListRequest', query, { idempotent: true });
        observeResponseSchema(N11_ORDERS_LIST_SOAP, data, { clientId: this.params.clientId });
        return data;
    }

    public async makeOrderItemShipment(payload: any): Promise<any> {
        return await this.service.soapRequest('shipmentCompanyService', 'sch:MakeOrderItemShipmentRequest', payload);
    }

    public async saveLinkSellerInvoice(payload: any): Promise<any> {
        return await this.service.soapRequest('sellerInvoiceService', 'sch:SaveLinkSellerInvoiceRequest', payload);
    }
}
