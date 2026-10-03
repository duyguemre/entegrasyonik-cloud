export const integrationCode = "hepsiburada"

/**
 * [eslesme-fiyat WP3, API_HEPSIBURADA K-13] merchantId TEK KAYNAĞI: `settings.SELLERID` (= HB merchant UUID; `requiredSettings`'te zorunlu).
 * Eski kayıt uyumu için `MERCHANTID`, en son `APIKEY` (Basic kullanıcı adı çoğu hesapta merchantId ile aynı) yedeklenir.
 * Eskiden: sorgu yolları MERCHANTID→SELLERID→APIKEY, ürün import `merchant` ve ürün güncelleme `merchantId` APIKEY→USERNAME okuyordu (tutarsız).
 */
export function hbMerchantId(settings: any): string {
    const s = settings || {};
    return String(s.SELLERID || s.sellerid || s.MERCHANTID || s.merchantid || s.APIKEY || s.apikey || '').trim();
}

/** [K-16] HB servis host'ları (prod). SIT (sandbox): tenant ayarı `HB_ENV = 'sit'` → aynı ad + `-sit` (bkz. `hbHost`). */
export const HB_HOSTS = {
    mpop: 'mpop.hepsiburada.com',
    listing: 'listing-external.hepsiburada.com',
    oms: 'oms-external.hepsiburada.com',
    /** Eski finans tabanı (`settlements`, canlıda 404); K-1 finans yeniden yazımıyla (`mpfinance` `transactions`) kalkacak. */
    accounting: 'accounting-external.hepsiburada.com',
    finance: 'mpfinance-external.hepsiburada.com',
    questions: 'api-asktoseller-merchant.hepsiburada.com',
    shipping: 'shipping-external.hepsiburada.com',
    ticket: 'ticket-api.hepsiburada.com',
} as const;

/** SIT eşleri (ör. `oms-external-sit.hepsiburada.com`). */
export const sitHost = (host: string) => host.replace(/\.hepsiburada\.com$/, '-sit.hepsiburada.com');

/** Tenant HB SIT (sandbox) modunda mı (yalnız açık `HB_ENV = 'sit'`; varsayılan prod). */
export const isHbSit = (settings: any) => String(settings?.HB_ENV ?? '').trim().toLowerCase() === 'sit';
