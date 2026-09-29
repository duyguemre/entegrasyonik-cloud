// [C22, 2026-09-28] URL GÜVENLİK AĞI: DB `Integrations.urls.orderListUrl` hâlâ ESKİ (V2'siz) değeri taşısa bile
// sipariş çekme V2'ye gider (DB göçü — `npm run migrate:trendyol-urls` — ayrı bir insan adımıdır, Protokol 12).
// Kaynak: docs/research/2026-09-28-trendyol-v2-migration-spec.md §1 (eşleme tablosu): eski `order/sellers/{id}/orders`
// 15.10.2026'da kapanır; yeni `order/sellers/{id}/v2/orders`.
//
// KURAL: yalnızca BİLİNEN ESKİ biçimler dönüştürülür (bilinen Trendyol host'u veya göreli yol). Yabancı host / özel proxy /
// yerel mock adresi / elle özelleştirilmiş değer OLDUĞU GİBİ bırakılır. Fonksiyon saf ve idempotenttir.
// Sır/sorgu dizesi: dönüş değerindeki `note` YALNIZCA host+yol şablonunu (`<SELLERID>` yer tutucusuyla) içerir; sorgu dizesi
// ve kimlik bilgisi hiçbir zaman log/nota yazılmaz.

export type OrderListUrlKind =
    | 'v2'                 // zaten V2: dokunulmadı
    | 'relative-v1'        // `order/sellers/<ID>/orders` (göreli, DB'deki bugünkü değer)
    | 'integration-v1'     // `https://apigw.trendyol.com/integration/order/sellers/<ID>/orders`
    | 'sapigw-v1'          // `https://api.trendyol.com/sapigw/(sellers|suppliers)/<ID>/orders` (eski gateway)
    | 'unknown';           // tanınmadı: dokunulmadı

export interface OrderListUrlNormalization {
    url: string;
    changed: boolean;
    kind: OrderListUrlKind;
    /** Sorgu dizesiz, yer tutuculu, loglanabilir açıklama (değişiklik yoksa undefined). */
    note?: string;
}

const PROD_GW_HOSTS = new Set(['apigw.trendyol.com']);
const STAGE_GW_HOSTS = new Set(['stageapigw.trendyol.com']);
const PROD_LEGACY_HOSTS = new Set(['api.trendyol.com']);
const STAGE_LEGACY_HOSTS = new Set(['stageapi.trendyol.com']);

const ABS_URL = /^(https?:\/\/)([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i;
const SEG = '([^/?#]+)';

/** Sorgu dizesi/parça sonrasında olmayan, loglanabilir kısa gösterim: host + yol (sorgu dizesi YOK). */
function safeDescribe(host: string | undefined, path: string): string {
    return `${host ? host.toLowerCase() : '(göreli)'}${path.startsWith('/') || !host ? '' : '/'}${path}`;
}

export function normalizeTrendyolOrderListUrl(raw: string | undefined | null): OrderListUrlNormalization {
    const input = typeof raw === 'string' ? raw.trim() : '';
    if (!input) return { url: typeof raw === 'string' ? raw : '', changed: false, kind: 'unknown' };

    const abs = ABS_URL.exec(input);
    if (abs) {
        const [, scheme, hostRaw, pathRaw = '', query = '', hash = ''] = abs;
        const host = hostRaw.toLowerCase();
        const path = pathRaw.replace(/\/+$/, '');

        if (/\/v2\/orders$/i.test(path)) return { url: input, changed: false, kind: 'v2' };

        const isProd = PROD_GW_HOSTS.has(host) || PROD_LEGACY_HOSTS.has(host);
        const isStage = STAGE_GW_HOSTS.has(host) || STAGE_LEGACY_HOSTS.has(host);
        if (!isProd && !isStage) return { url: input, changed: false, kind: 'unknown' };
        const gwHost = isStage ? 'stageapigw.trendyol.com' : 'apigw.trendyol.com';

        // 1) Güncel gateway, V2'siz yol.
        let m = new RegExp(`^/integration/order/sellers/${SEG}/orders$`, 'i').exec(path);
        if (m && (PROD_GW_HOSTS.has(host) || STAGE_GW_HOSTS.has(host))) {
            return {
                url: `${scheme}${hostRaw}/integration/order/sellers/${m[1]}/v2/orders${query}${hash}`,
                changed: true, kind: 'integration-v1',
                note: `${safeDescribe(host, path)} -> ${safeDescribe(host, `/integration/order/sellers/${m[1]}/v2/orders`)}`,
            };
        }
        // 2) Eski `sapigw` gateway biçimleri (sellers|suppliers, isteğe bağlı `order/` öneki).
        m = new RegExp(`^/sapigw(?:/order)?/(?:sellers|suppliers)/${SEG}/orders$`, 'i').exec(path);
        if (m) {
            const target = `/integration/order/sellers/${m[1]}/v2/orders`;
            return {
                url: `${scheme}${gwHost}${target}${query}${hash}`,
                changed: true, kind: 'sapigw-v1',
                note: `${safeDescribe(host, path)} -> ${safeDescribe(gwHost, target)}`,
            };
        }
        return { url: input, changed: false, kind: 'unknown' };
    }

    // Göreli biçim: `order/sellers/<ID>/orders` (baştaki '/' korunur; sorgu dizesi varsa korunur).
    const rel = new RegExp(`^(/?)order/sellers/${SEG}/orders/?(\\?[^#]*)?(#.*)?$`, 'i').exec(input);
    if (rel) {
        const [, lead, id, query = '', hash = ''] = rel;
        const target = `${lead}order/sellers/${id}/v2/orders`;
        return {
            url: `${target}${query}${hash}`, changed: true, kind: 'relative-v1',
            note: `${safeDescribe(undefined, `${lead}order/sellers/${id}/orders`)} -> ${safeDescribe(undefined, target)}`,
        };
    }
    if (new RegExp(`^/?order/sellers/${SEG}/v2/orders/?(\\?[^#]*)?(#.*)?$`, 'i').test(input)) {
        return { url: input, changed: false, kind: 'v2' };
    }
    return { url: input, changed: false, kind: 'unknown' };
}

/**
 * ESKİ (V2'siz) sipariş listesi URL'i mi? Göç aracı (`dev-tools/migrate-trendyol-integration-urls.js`) ve testler için
 * yalnızca bilinen eski biçimleri tanır.
 */
export function isLegacyOrderListUrl(raw: string | undefined | null): boolean {
    return normalizeTrendyolOrderListUrl(raw).changed;
}
