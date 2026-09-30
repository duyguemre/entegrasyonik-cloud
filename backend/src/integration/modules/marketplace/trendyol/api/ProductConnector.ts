// api/ProductConnector.ts
import Service from '../services/Service';
import { trendyolWriteGroupForUrl } from '../limits';

/**
 * PRODUCT CONNECTOR
 * Trendyol API ile olan tüm HTTP iletişimini (GET, POST) yönetir.
 * İçerisinde iş mantığı veya veri dönüşümü barındırmaz, sadece ham veriyi taşır.
 *
 * [C22 2026-09-28] V1 `PUT products` (putBatch) KALDIRILDI: ürün güncelleme artık tamamı POST
 * (content-bulk-update / variant-bulk-update / delivery-info-bulk-update / unapproved-bulk-update).
 * URL'ler `productUrls.resolveProductUrls` ile ProductService'te çözülür; buraya HAZIR URL gelir.
 */
export class ProductConnector {
    constructor(
        private service: Service,
        private params: any
    ) { }

    /**
     * Toplu ürün gönderimi, güncelleme, fiyat veya stok güncelleme (Batch) işlemlerini tetikler.
     */
    public async postBatch(url: string, items: any[]): Promise<any> {
        const response = await this.service.post(url, { items }, { group: trendyolWriteGroupForUrl(url) });
        return response?.data;
    }

    /**
     * Platformdaki ürünleri belirli kriterlere göre (sayfalama, barkod vb.) çeker.
     */
    public async fetchProductsFromPlatform(url: string, params: any): Promise<any> {
        return await this.service.get(url, params, { group: 'product_read' });
    }

    /**
     * Gönderilen bir batch işleminin (transfer, update vb.) sonucunu sorgular.
     * [C22] Önceden `{ timeout: 15000 }` yanlışlıkla SORGU PARAMETRESİ olarak gidiyordu; artık gerçek istek zaman aşımı.
     */
    public async fetchBatchStatus(url: string): Promise<any> {
        const response = await this.service.get(url, undefined, { timeoutMs: 15000, group: 'product_read' });
        return response?.data;
    }

    /**
     * Ürünlerin güncel onay/red durumlarını öğrenmek için platformdaki ham listeyi çeker.
     */
    public async fetchPlatformProducts(url: string, params?: any): Promise<any> {
        const response = await this.service.get(url, params, { timeoutMs: 15000, group: 'product_read' });
        return response?.data;
    }
}
