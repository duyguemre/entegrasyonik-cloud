// PRC-R1 (K57-S1): Trendyol buybox bilgisi — SALT OKUMA. `POST` olmasına rağmen yan etkisizdir (gövde = barkod listesi).
//
// DOĞRULANMADI (yerelde doğrulanacak, docs/PRICING_COMPETITION.md §6): uç yolu, `storeFrontCode` başlık değeri ve yanıt alan adları
// resmi dokümandan DOĞRUDAN okunamadı (bulutta erişim engelli; arama dizini özeti). Bu yüzden Trendyol'a özgü HER ŞEY bu dosyada,
// TEK eşleme noktasında durur: `BUYBOX_DEFAULT_PATH`, `BUYBOX_STOREFRONT_DEFAULT`, `mapBuyboxResponse`. Gerçek yanıt farklıysa yalnız
// burası değişir; motor/iş/ekran `IBuyboxObservation` görür. Descriptor `capabilities['pricing.buybox.read'].lastVerifiedAt` BOŞTUR.
import type Service from '../services/Service';
import type { IBuyboxObservation } from '@interfaces/index';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { TRENDYOL_BUYBOX_CONTRACT } from '../contracts/products.buybox';

/** Resmi özet: istek başına en çok 10 barkod. */
export const BUYBOX_MAX_BARCODES = 10;
/** Varsayılan göreli yol (DOĞRULANMADI). Platform `Integrations.urls.buyboxUrl` tanımlıysa o kullanılır. */
export const BUYBOX_DEFAULT_PATH = 'product/sellers/<SELLERID>/products/buybox-information';
/** `storeFrontCode` başlığı (resmi özette zorunlu; değer DOĞRULANMADI). Ayar `STOREFRONTCODE` varsa o. */
export const BUYBOX_STOREFRONT_DEFAULT = 'TR';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** TEK eşleme noktası: ham yanıt -> gözlemler. İstenen ama yanıtta olmayan barkod `found:false` döner (sessiz atlama yok). */
export function mapBuyboxResponse(raw: any, requested: readonly string[]): IBuyboxObservation[] {
    const list: any[] = Array.isArray(raw?.buyboxInfo) ? raw.buyboxInfo : [];
    const byBarcode = new Map<string, any>();
    for (const it of list) if (it && typeof it.barcode === 'string') byBarcode.set(it.barcode, it);
    return requested.map((barcode) => {
        const it = byBarcode.get(barcode);
        if (!it) return { barcode, found: false, buyboxOrder: null, buyboxPrice: null, hasMultipleSeller: null };
        return {
            barcode, found: true,
            buyboxOrder: num(it.buyboxOrder),
            buyboxPrice: num(it.buyboxPrice),
            hasMultipleSeller: typeof it.hasMultipleSeller === 'boolean' ? it.hasMultipleSeller : null,
        };
    });
}

export class BuyboxConnector {
    constructor(private service: Service, private params: any) { }

    private url(): string {
        const settings = this.params?.integrationSettings;
        const sellerId = settings?.settings?.SELLERID;
        if (!sellerId) throw new IntegrationError('VALIDATION', 'Trendyol SELLERID ayarı bulunamadı.', { integrationCode: 'trendyol', operation: 'products.buybox', clientId: this.params?.clientId ?? 'unknown' });
        const raw = typeof settings?.urls?.buyboxUrl === 'string' && settings.urls.buyboxUrl.trim() ? settings.urls.buyboxUrl.trim() : BUYBOX_DEFAULT_PATH;
        return raw.replace('<SELLERID>', String(sellerId));
    }

    public async readBuybox(barcodes: readonly string[]): Promise<IBuyboxObservation[]> {
        const unique = [...new Set(barcodes.filter((b) => typeof b === 'string' && b !== ''))];
        if (unique.length === 0) return [];
        if (unique.length > BUYBOX_MAX_BARCODES) throw new IntegrationError('VALIDATION', `Buybox sorgusu en çok ${BUYBOX_MAX_BARCODES} barkod alır.`, { integrationCode: 'trendyol', operation: 'products.buybox', clientId: this.params?.clientId ?? 'unknown' });
        const storeFront = String(this.params?.integrationSettings?.settings?.STOREFRONTCODE || BUYBOX_STOREFRONT_DEFAULT);
        const res = await this.service.post(this.url(), { barcodes: unique }, {
            operation: 'products.buybox', group: 'product_read', idempotent: true, contract: TRENDYOL_BUYBOX_CONTRACT,
            headers: { storeFrontCode: storeFront },
        });
        return mapBuyboxResponse(res?.data ?? res, unique);
    }
}
