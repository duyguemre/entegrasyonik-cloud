import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { PAZARAMA_BATCH_RESULT, PAZARAMA_UPDATE_BATCH_RESULT } from '../contracts';
import Service from '../services/Service';
import { eventLog } from '@platform/core/logger';

const log = eventLog('adapter-pazarama', 'ProductConnector');

export class ProductConnector {
    constructor(
        private service: Service,
        private params: any
    ) { }

    public async postBatch(url: string, items: any[]): Promise<any> {
        const response = await this.service.post(url, { products: items });
        return response?.data;
    }

    public async putBatch(url: string, items: any[]): Promise<any> {
        const response = await this.service.post(url, { items }); // Pazarama expects POST with { items } for price/stock
        return response?.data;
    }

    public async fetchBatchResults(batchId: string): Promise<any> {
        try {
            const urlTemplate = this.params.integrationSettings?.urls?.checkBatchUrl || 'product/getProductBatchResult?BatchRequestId=<BATCHID>';
            const url = urlTemplate.replace('<BATCHID>', batchId);
            const response = await this.service.get(url);
            observeResponseSchema(PAZARAMA_BATCH_RESULT, response?.data, { clientId: this.params.clientId });
            return response?.data;
        } catch (error: any) {
            log.error('PRODUCTCONNECTOR_ERROR_FETCHING_BATCH', `Error fetching batch ${batchId}:`, { err: error });
            throw error;
        }
    }

    public async fetchUpdateBatchResults(batchId: string): Promise<any> {
        try {
            const urlTemplate = this.params.integrationSettings?.urls?.checkUpdateBatchUrl || 'listing-state/batch-id/<BATCHID>/lake-projections?page=1&pageSize=3000';
            const url = urlTemplate.replace('<BATCHID>', batchId);
            const response = await this.service.get(url);
            observeResponseSchema(PAZARAMA_UPDATE_BATCH_RESULT, response?.data, { clientId: this.params.clientId });
            return response?.data;
        } catch (error: any) {
            log.error('PRODUCTCONNECTOR_ERROR_FETCHING_BATCH_2', `Error fetching batch ${batchId}:`, { err: error });
            throw error;
        }
    }

    public async fetchProductsFromPlatform(url: string, params: any): Promise<any> {
        const response = await this.service.get(url, params);
        return response?.data;
    }

    public async fetchProductDetail(barcode: string): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.productDetailUrl || 'product/getProductDetail';
        // [ADR-0006 1f] POST kullanır ama semantik olarak ürün detay sorgusudur (okuma) -> idempotent:true.
        const response = await this.service.post(baseUrl, { Code: barcode }, { idempotent: true, operation: 'fetchProductDetail' });
        return response?.data;
    }

    public async fetchBatchStatus(url: string): Promise<any> {
        const response = await this.service.get(url);
        return response?.data;
    }

    public async fetchPlatformProducts(url: string): Promise<any> {
        const response = await this.service.get(url);
        return response?.data;
    }
}
