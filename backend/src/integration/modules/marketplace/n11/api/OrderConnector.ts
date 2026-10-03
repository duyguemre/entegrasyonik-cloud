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

    /**
     * [eslesme-fiyat WP4, 02-ekler/n11 C-7] REST `PUT rest/order/v1/update` `{lineId:[long], status:'Picking'}` — şimdilik
     * yalnız Picking (onay); yalnız `Created` kalemler. Yazma ucu (canlıda guard bloklar; doğrulama yerelde).
     */
    public async updateOrderRest(lineIds: number[], status: 'Picking'): Promise<any> {
        const url = this.params.integrationSettings.urls?.orderUpdateUrl || 'rest/order/v1/update';
        return await this.service.rest.put(url, { lineId: lineIds, status }, { operation: 'updateOrderRest' });
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
