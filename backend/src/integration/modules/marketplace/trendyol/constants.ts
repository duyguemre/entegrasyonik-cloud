export const integrationCode = "trendyol"

/**
 * [eslesme-fiyat WP4, K-D] Tenant ayarı `trendyol.shippingModel` (entegrasyon ayarlarında `settings.shippingModel`):
 * - `marketplace` (varsayılan): kargo Trendyol anlaşmalı; satıcı bildirim yapmaz → `sendOrderShipping` dürüstçe `performed:false`.
 * - `seller`: satıcı kendi kargosuyla gönderir → takip numarası Trendyol'a bildirilir.
 */
export type TrendyolShippingModel = 'marketplace' | 'seller';
export function resolveShippingModel(settings: any): TrendyolShippingModel {
    return String(settings?.shippingModel ?? '').toLowerCase() === 'seller' ? 'seller' : 'marketplace';
}

/**
 * [eslesme-fiyat WP6, K-G / D-ORD-5] Trendyol tedarik edememe (`items/unsupplied`) `reasonId` kodları. Kaynak İKİNCİL (geliştirici
 * portalı "Tedarik Edememe Bildirimi" sayfasının özetleri; 02-ekler/trendyol: "500-5xx DOĞRULANAMADI") → `verified:false`.
 * Bu yüzden `OversellCompensationJob` Trendyol'da otomatik iptali HÂLÂ yapmaz; stage'de doğrulanınca `VERIFIED_REASON_ID_BY_CHANNEL`'a
 * `trendyol: '500'` eklenir. ESKİDEN iptal diyaloğu iade-sebep (`claim-issue-reasons`) kataloğunu gösteriyordu (anlamsal hata).
 */
export const TRENDYOL_UNSUPPLIED_REASONS: ReadonlyArray<{ id: string; title: string; verified: boolean }> = [
    { id: '500', title: 'Stok tükendi', verified: false },
    { id: '501', title: 'Kusurlu / hasarlı / defolu ürün', verified: false },
    { id: '502', title: 'Hatalı fiyat', verified: false },
    { id: '504', title: 'Entegrasyon hatası', verified: false },
    { id: '505', title: 'Toplu alım', verified: false },
    { id: '506', title: 'Mücbir sebep', verified: false },
];
