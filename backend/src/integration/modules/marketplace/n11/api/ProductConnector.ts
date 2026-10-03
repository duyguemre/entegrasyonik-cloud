import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { N11_BATCH_STATUS } from '../contracts';
import Service, { N11_DEFAULT_URLS } from '../services/Service';

export class ProductConnector {
    constructor(private service: Service, private params: any) { }

    private getUrl(key: keyof typeof N11_DEFAULT_URLS): string {
        return this.params.integrationSettings.urls?.[key] || N11_DEFAULT_URLS[key];
    }

    // REST Methods
    public async fetchProductListRest(params: any): Promise<any> {
        const url = this.getUrl('productListUrl');
        return await this.service.rest.get(url, params);
    }

    public async transferProductsRest(payload: any): Promise<any> {
        const url = this.getUrl('transferUrl');
        return await this.service.rest.post(url, payload);
    }

    public async updatePriceRest(payload: any): Promise<any> {
        const url = this.getUrl('updatePriceUrl');
        return await this.service.rest.post(url, payload);
    }

    public async updateStockRest(payload: any): Promise<any> {
        const url = this.getUrl('updateStockUrl');
        return await this.service.rest.post(url, payload);
    }

    public async updateProductRest(payload: any): Promise<any> {
        const url = this.getUrl('updateUrl');
        return await this.service.rest.post(url, payload);
    }

    public async checkBatchProductRest(taskId: string): Promise<any> {
        const url = this.getUrl('checkTransferUrl');
        // [eslesme-fiyat WP4, 02-ekler/n11 C-2 / D-N11-3] resmî: POST + JSON gövde (eskiden GET + query). Okuma → idempotent;
        // canlı salt-okuma politikası bu yolu `N11_READ_POST_PATHS` ile izinli sayar.
        const numeric = Number(taskId);
        const data = await this.service.rest.post(url, { taskId: Number.isFinite(numeric) ? numeric : taskId, page: 0, size: 1000 }, { idempotent: true, operation: 'checkBatchProductRest' });
        observeResponseSchema(N11_BATCH_STATUS, data, { clientId: this.params.clientId });
        return data;
    }

    // SOAP Methods
    public async getProductList(payload: any): Promise<any> {
        return await this.service.soapRequest('productService', 'sch:GetProductListRequest', payload, { idempotent: true });
    }

    public async saveProduct(payload: any): Promise<any> {
        return await this.service.soapRequest('productService', 'sch:SaveProductRequest', payload);
    }

    public async updateProductPriceBySellerCode(payload: any): Promise<any> {
        return await this.service.soapRequest('productService', 'sch:UpdateProductPriceBySellerCodeRequest', payload);
    }

    public async updateProductStockBySellerCode(payload: any): Promise<any> {
        return await this.service.soapRequest('productService', 'sch:UpdateProductStockBySellerCodeRequest', payload);
    }

    public async getProductQuestionList(payload: any): Promise<any> {
        return await this.service.soapRequest('productService', 'sch:GetProductQuestionListRequest', payload, { idempotent: true });
    }

    public async saveProductAnswer(payload: any): Promise<any> {
        return await this.service.soapRequest('productService', 'sch:SaveProductAnswerRequest', payload);
    }
}
