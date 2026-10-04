/**
 * [eslesme-fiyat WP7b, F-11 / K-J, PLAN §3.5] Webhook alıcısı olan kanallar — TEK KAYNAK (saf; I/O yok).
 *
 * | Kanal       | Rota                                   | Yöntem | Doğrulama                                              | Sinyal              |
 * |-------------|----------------------------------------|--------|--------------------------------------------------------|---------------------|
 * | trendyol    | `/hooks/trendyol/:token`               | POST   | yol belirteci (+ isteğe bağlı API_KEY/BASIC başlığı)   | orders              |
 * | hepsiburada | `/hooks/hepsiburada/:token/:event`     | PUT    | yol belirteci (+ isteğe bağlı API_KEY/BASIC başlığı);  | orders | claims     |
 * |             |                                        |        | HB imza belgelememiş (API_HEPSIBURADA.md §5)           | (olay adına göre)   |
 * | ideasoft    | `/hooks/ideasoft/:token`               | POST   | yol belirteci + ZORUNLU HMAC `X-Ideashop-Hmac-Sha256`  | orders              |
 * |             |                                        |        | = Base64(HMAC-SHA256(ham gövde, client secret))        |                     |
 *
 * Gövde hiçbir kanalda VERİ KAYNAĞI değildir (ADR-0005 Karar 8): yalnız "şimdi çek" sinyali. Ideasoft'ta ham gövde yalnız
 * HMAC girdisi olarak kullanılır, ayrıştırılmaz. HB olay adı Hepsiburada tarafından URL sonuna eklenir (`PUT <baseUrl>/<eventName>`);
 * kullanıcı panele yalnız `<baseUrl>` = `/hooks/hepsiburada/<token>` girer.
 */
export const WEBHOOK_CHANNELS = ['trendyol', 'hepsiburada', 'ideasoft'] as const;
export type WebhookChannel = typeof WEBHOOK_CHANNELS[number];

export function isWebhookChannel(code: unknown): code is WebhookChannel {
    return typeof code === 'string' && (WEBHOOK_CHANNELS as readonly string[]).includes(code);
}

export type WebhookSignalKind = 'orders' | 'claims';

/** Hepsiburada'nın 12 olayı (API_HEPSIBURADA.md §5, SDK `types/webhook-event.ts`): 8 sipariş → orders, 4 claim → claims. */
export const HB_WEBHOOK_EVENTS: Readonly<Record<string, WebhookSignalKind>> = {
    createOrder: 'orders', createPackages: 'orders', orderCancel: 'orders', unpack: 'orders',
    intransit: 'orders', deliver: 'orders', undeliver: 'orders', changeShippingAddressOrder: 'orders',
    awaitingAction: 'claims', awaitingPreApproval: 'claims', disputedClaimResult: 'claims', packageFromClaimResult: 'claims',
};

/** HB olay adı → sinyal türü; büyük/küçük harf duyarsız; bilinmeyen olay `undefined` (alıcı 404 döner, varlık sızdırmaz). */
export function hbEventKind(event: unknown): WebhookSignalKind | undefined {
    if (typeof event !== 'string' || !event) return undefined;
    const key = Object.keys(HB_WEBHOOK_EVENTS).find((k) => k.toLowerCase() === event.toLowerCase());
    return key ? HB_WEBHOOK_EVENTS[key] : undefined;
}

/** Ideasoft imza başlığı (küçük harf; Node başlıkları küçük harfe indirir). */
export const IDEASOFT_HMAC_HEADER = 'x-ideashop-hmac-sha256';
