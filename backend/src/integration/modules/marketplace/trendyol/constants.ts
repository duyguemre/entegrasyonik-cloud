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
