import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { HB_BATCH_STATUS } from '../contracts';
import Service from '../services/Service';
import { paginateOffset, readTotal } from './paginateOffset';
import { hbMerchantId } from '../constants';

export class ProductConnector {
    constructor(private service: Service, private params: any) { }

    public async importProducts(items: any[]): Promise<any> {
        const urls = this.params.integrationSettings.urls || {};
        const url = urls.productImportUrl || urls.transferUrl || 'product/api/products/import';
        
        const jsonString = JSON.stringify(items, null, 2);
        const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
        const data = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="integrator.json"\r\nContent-Type: application/json\r\n\r\n${jsonString}\r\n--${boundary}--\r\n`;

        const response = await this.service.post(url, data, {
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
        });
        return response?.data;
    }

    public async fetchBatchResults(trackingId: string): Promise<any> {
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.productStatusUrl || urls.checkBatchUrl || `product/api/products/status/${trackingId}`;
        
        url = url.replace('<TRACKINGID>', trackingId);
        const response = await this.service.get(url);
        observeResponseSchema(HB_BATCH_STATUS, response?.data, { clientId: this.params.clientId });
        return response?.data;
    }

    public async fetchProductsFromPlatform(query: any): Promise<any> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = hbMerchantId(s);
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.productListUrl || urls.listingUrl || `listings/merchantid/${merchantId}`;
        
        url = url.replace('<MERCHANTID>', merchantId);
        
        const response = await this.service.get(url, query);
        return response?.data;
    }

    /**
     * [INT-05 / F-02] Listing'in TÜM sayfaları (offset+limit; bkz. paginateOffset). Toplam alanı (`totalCount`...) yoksa `dönen < limit` ile durur.
     * Tavan/tekrar eden sayfada dönen dizi `markIncomplete` ile işaretlenir (getIncomplete). `onPage` verilirse akış kipi: kayıt toplanmaz (items boş),
     * her sayfa onPage'e verilir. `query` çağıranın ek süzgeçleridir (limit/offset paginasyona aittir ve ezilir).
     */
    public async fetchListingPages(
        query: Record<string, any> = {},
        opts: { limit?: number; maxPages?: number; maxRecords?: number; onPage?: (items: any[]) => Promise<void> } = {},
    ): Promise<{ items: any[]; total?: number }> {
        let total: number | undefined;
        const items = await paginateOffset(async (offset, limit) => {
            const data = await this.fetchProductsFromPlatform({ ...query, limit, offset });
            const t = readTotal(data);
            if (t !== undefined) total = t;
            return { items: Array.isArray(data?.items) ? data.items : [], total: t };
        }, { operation: 'fetchListingPages', clientId: this.params.clientId, ...opts });
        return { items, total };
    }

    public async updatePrice(payload: any): Promise<any> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = hbMerchantId(s);
        const urls = this.params.integrationSettings.urls || {};
        
        let url = urls.priceUpdateUrl || "";
        if (!url) {
            let baseUrl = urls.productListUrl || urls.listingUrl || `listings/merchantid/${merchantId}`;
            baseUrl = baseUrl.replace('<MERCHANTID>', merchantId);
            const path = urls.listingPriceUploadsUrl || 'price-uploads';
            url = `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
        } else {
            url = url.replace('<MERCHANTID>', merchantId);
        }
        
        const response = await this.service.post(url, payload);
        return response.data;
    }

    public async updateStock(payload: any): Promise<any> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = hbMerchantId(s);
        const urls = this.params.integrationSettings.urls || {};

        let url = urls.stockUpdateUrl || "";
        if (!url) {
            let baseUrl = urls.productListUrl || urls.listingUrl || `listings/merchantid/${merchantId}`;
            baseUrl = baseUrl.replace('<MERCHANTID>', merchantId);
            const path = urls.listingStockUploadsUrl || 'stock-uploads';
            url = `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
        } else {
            url = url.replace('<MERCHANTID>', merchantId);
        }
        
        const response = await this.service.post(url, payload);
        return response.data;
    }

    public async updateProduct(payload: any): Promise<any> {
        const urls = this.params.integrationSettings.urls || {};
        const url = urls.updateProductUrl || urls.updateUrl || 'product/api/products/product-update';
        
        const response = await this.service.post(url, payload);
        return response.data;
    }

    public async checkUploadJobStatus(type: 'price' | 'stock' | 'update', jobId: string): Promise<any> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = hbMerchantId(s);
        const urls = this.params.integrationSettings.urls || {};

        let url: string;
        if (type === 'price') {
            url = urls.priceStatusUrl || "";
            if (!url) {
                let base = urls.productListUrl || urls.listingUrl || `listings/merchantid/${merchantId}`;
                base = base.replace('<MERCHANTID>', merchantId);
                url = `${base.replace(/\/$/, '')}/price-uploads/${jobId}`;
            }
        } else if (type === 'stock') {
            url = urls.stockStatusUrl || "";
            if (!url) {
                let base = urls.productListUrl || urls.listingUrl || `listings/merchantid/${merchantId}`;
                base = base.replace('<MERCHANTID>', merchantId);
                url = `${base.replace(/\/$/, '')}/stock-uploads/${jobId}`;
            }
        } else {
            url = urls.productUpdateStatusUrl || `product/api/products/product-update/${jobId}`;
        }

        url = url.replace('<MERCHANTID>', merchantId).replace('<BATCHPROCESSID>', jobId).replace('<TRACKINGID>', jobId);

        const response = await this.service.get(url);
        observeResponseSchema(HB_BATCH_STATUS, response?.data, { clientId: this.params.clientId });
        return response?.data;
    }
}
