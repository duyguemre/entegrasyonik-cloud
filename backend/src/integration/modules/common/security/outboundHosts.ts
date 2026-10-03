// [K7 / ADR-0020 savunma derinliği, 2026-09-28] Adaptör başına İZİNLİ DIŞ HOST listesi + TEK giden-istek koruması.
//
// Amaç: tenant (veya platform verisindeki bir hata) sunucunun kimlik bilgili dış isteklerini istenen host'a (iç ağ, bulut
// metadata uç noktası, saldırgan sunucusu) yönlendirse bile istek AĞA ÇIKMADAN reddedilir. `ResilientHttpClient` her istekten
// önce `assertAllowedOutboundHost`'u çağırır (REST: `request`, SOAP: `executeCustom({ url })`).
//
// Bu dosya TEK doğruluk kaynağıdır ve ADR-0018/0020 adaptör tanımlayıcısındaki `config.hosts` alanına AYNEN taşınabilir
// biçimdedir (adaptör kodu -> host desenleri; yalnız host, şema/sorgu/sır yok). Listeyi genişletmek kod incelemesi gerektirir.
//
// KAPSAM VE SINIRLAR (dürüstlük notu):
//  - Denetim HOST ADI üzerindedir. DNS REBINDING'e karşı ek koruma yoktur: izinli bir alan adının DNS'i ele geçirilirse
//    (veya joker `*.ideasoft.com.tr` altında saldırgan kontrollü bir alt alan çözülürse) iç IP'ye çözülebilir. Bu artık risk,
//    bağlantı anında çözülmüş IP'yi doğrulayan bir agent `lookup` kancasıyla (izlenen iş) kapatılabilir; bu görevde yapılmadı.
//  - Mock modu (`<PREFIX>_MOCK_MODE=true`) AÇIKKEN yalnızca loopback veya mock tabanının host'una izin verilir (assertMockSafeUrl ile aynı kural).
import { IntegrationError } from '../IntegrationError';
import { MockPrefix, readMockConfig, isMockSafeUrl } from '../mock/MockMode';
import { ADAPTER_KEYS } from '../../adapterKeys';
import { LLM_HOSTS } from '@platform/llm/catalog';

/**
 * Adaptör kodu -> izinli host desenleri. Desen: tam host (`apigw.trendyol.com`) veya joker (`*.ideasoft.com.tr`: EN AZ bir etiket +
 * yalnız `[a-z0-9-]` etiketleri; kök alan adının kendisi eşleşmez).
 * Kaynak: yerel DB kopyasındaki platform `Integrations.urls` host kümesi (salt-okunur tarama, 2026-09-28) + adaptör kodundaki varsayılan/sabit adresler (Service.ts, connector'lar), docs/research/2026-09-27-api-verification.md,
 * docs/research/2026-09-28-trendyol-v2-migration-spec.md (STAGE), INTEGRATIONS_REGISTRY.md.
 */
export const ALLOWED_OUTBOUND_HOSTS: Readonly<Record<string, readonly string[]>> = {
    trendyol: ['api.trendyol.com', 'apigw.trendyol.com', 'stageapigw.trendyol.com'],
    // oms-external: sipariş/paket (OMS) API'si — 2026-10-03 canlı salt-okuma ile DOĞRULANDI (orders/packages burada 200; mpop'ta 404).
    // [eslesme-fiyat WP3, K-16] + mpfinance-external (finans), api-asktoseller-merchant (soru), shipping-external (kargo) ve hepsinin SIT eşleri
    // (`-sit`; yalnız tenant `HB_ENV=sit` iken kullanılır). accounting-external K-1 finans yeniden yazımına kadar kalır (canlıda 404).
    hepsiburada: [
        'mpop.hepsiburada.com', 'listing-external.hepsiburada.com', 'accounting-external.hepsiburada.com', 'ticket-api.hepsiburada.com',
        'oms-external.hepsiburada.com', 'mpfinance-external.hepsiburada.com', 'api-asktoseller-merchant.hepsiburada.com', 'shipping-external.hepsiburada.com',
        'mpop-sit.hepsiburada.com', 'listing-external-sit.hepsiburada.com', 'oms-external-sit.hepsiburada.com', 'mpfinance-external-sit.hepsiburada.com',
        'api-asktoseller-merchant-sit.hepsiburada.com', 'shipping-external-sit.hepsiburada.com',
    ],
    n11: ['api.n11.com'],
    pazarama: ['isortagim.pazarama.com', 'isortagimapi.pazarama.com', 'isortagimgiris.pazarama.com'],
    // Ideasoft: kod varsayılanı (eslesme-fiyat WP4, D-IS-1) `<STORENAME>.myideasoft.com/admin-api`; eski varsayılan `.ideasoft.com.tr`; yerel DB kopyasındaki `Integrations.urls` (2026-09-28) `<STORENAME>.myideasoft.com`.
    ideasoft: ['*.ideasoft.com.tr', '*.myideasoft.com'],
    // Bizimhesap: kod varsayılanı `api.bizimhesap.com`; yerel DB kopyasındaki `Integrations.urls` `bizimhesap.com`.
    bizimhesap: ['api.bizimhesap.com', 'bizimhesap.com'],
    // ADR-0034 BR-5: sohbet LLM saglayicilari (BYOK). Host'lar `platform/llm/catalog.ts`'te SABIT (tenant yazamaz); bunlar ADAPTOR degildir
    // (`llm-` oneki; adapterKeys tablosunda yer almaz, mock oneki yok). Yalniz cikarim uclari icin POST: liveReadonlyPolicy.LLM_POST_PATHS.
    'llm-anthropic': [LLM_HOSTS.anthropic],
    'llm-openai': [LLM_HOSTS.openai],
    'llm-google': [LLM_HOSTS.google],
    // Google ile giris: ID token dogrulamasi icin JWKS (yalniz GET https://www.googleapis.com/oauth2/v3/certs). Adaptor DEGILDIR (`google-auth`; adapterKeys'te yer almaz).
    'google-auth': ['www.googleapis.com', 'oauth2.googleapis.com'], // JWKS (GET) + code->token degisimi (POST /token)
};

/** ResilientHttpClient'a verilen kod (`n11-soap` gibi eklerle) -> izin listesi anahtarı + mock ön eki. */
// ADR-0033 INT-02: mock öneki + varsayılan mock tabanı tek kod tablosundan (`adapterKeys.ts`) türer.
const MOCK_PREFIX: Record<string, MockPrefix> = Object.fromEntries(ADAPTER_KEYS.map(k => [k.code, k.mockPrefix]));
const MOCK_DEFAULT_BASE: Record<string, string> = Object.fromEntries(ADAPTER_KEYS.map(k => [k.code, k.mockDefaultBase]));

export const OUTBOUND_HOST_NOT_ALLOWED = 'OUTBOUND_HOST_NOT_ALLOWED';

export function adapterKeyOf(integrationCode: string): string {
    return String(integrationCode || '').toLowerCase().replace(/-soap$/, '');
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// Ayrıştırıcı farklılığı (parser differential) saldırılarına karşı: ham dizede kaçış/boşluk/kontrol karakteri olamaz.
const FORBIDDEN_RAW_CHARS = /[\\\s\u0000-\u001f\u007f]/;

function isIpLiteral(host: string): boolean {
    return host.startsWith('[') || /^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host);
}

/** `pattern` ('apigw.trendyol.com' | '*.ideasoft.com.tr') host ile eşleşir mi? */
export function hostMatchesPattern(host: string, pattern: string): boolean {
    if (!pattern.startsWith('*.')) return host === pattern;
    const suffix = pattern.slice(1); // '.ideasoft.com.tr'
    if (!host.endsWith(suffix)) return false;
    const prefix = host.slice(0, host.length - suffix.length);
    return prefix.length > 0 && prefix.split('.').every(l => LABEL.test(l));
}

export interface OutboundCheckOptions {
    /** Loopback'e (localhost/127.0.0.1/::1) izin ver. Varsayılan: yalnızca `NODE_ENV === 'test'` (yerel test sunucuları). Üretimde/dev'de false. */
    allowLoopback?: boolean;
    /** Test/özel: ortam yerine bu izin listesi kullanılır. */
    hosts?: Readonly<Record<string, readonly string[]>>;
}

function deny(integrationCode: string, clientId: string | number, url: string, reason: string, operation?: string): never {
    let shown = '(ayrıştırılamadı)';
    try { shown = new URL(url).hostname || shown; } catch { /* ham dizeyi ASLA yansıtma (sır/sorgu sızmasın) */ }
    throw new IntegrationError(
        'VALIDATION',
        `Giden istek reddedildi (${reason}): host '${shown.slice(0, 100)}' '${adapterKeyOf(integrationCode)}' için izinli değil. İstek ATILMADI (K7 savunma derinliği).`,
        { integrationCode, operation: operation ?? 'outbound-host-check', clientId, platformCode: OUTBOUND_HOST_NOT_ALLOWED },
    );
}

/**
 * Giden istek hedefini doğrular; izinli değilse `IntegrationError('VALIDATION', platformCode: OUTBOUND_HOST_NOT_ALLOWED)` fırlatır
 * (retry/breaker'a girmez: istek hiç başlamaz).
 *  - Mock modu AÇIK: loopback veya mock tabanı host'u (şema/port serbest; mock sunucular http).
 *  - Gerçek mod: yalnızca `https`, userinfo YOK, IP literal YOK, port yok/443, host adaptörün izin listesinde.
 */
export function assertAllowedOutboundHost(
    integrationCode: string,
    url: string,
    clientId: string | number = 'UnknownClient',
    opts: OutboundCheckOptions = {},
    operation?: string,
): void {
    const key = adapterKeyOf(integrationCode);
    if (typeof url !== 'string' || url.length === 0 || FORBIDDEN_RAW_CHARS.test(url)) deny(integrationCode, clientId, String(url), 'geçersiz URL', operation);

    let u: URL;
    try { u = new URL(url); } catch { return deny(integrationCode, clientId, url, 'geçersiz URL', operation); }
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    const allowLoopback = opts.allowLoopback ?? (process.env.NODE_ENV === 'test');

    const prefix = MOCK_PREFIX[key];
    if (prefix) {
        const mock = readMockConfig(prefix, MOCK_DEFAULT_BASE[key]);
        if (mock.enabled) {
            if (isMockSafeUrl(mock, url)) return;
            return deny(integrationCode, clientId, url, 'mock modunda mock tabanı/loopback dışı', operation);
        }
    }

    if (allowLoopback && LOOPBACK_HOSTS.has(host) && (u.protocol === 'http:' || u.protocol === 'https:')) return;

    if (u.protocol !== 'https:') return deny(integrationCode, clientId, url, 'yalnızca https', operation);
    if (u.username || u.password) return deny(integrationCode, clientId, url, 'URL içinde kimlik bilgisi (userinfo)', operation);
    if (u.port && u.port !== '443') return deny(integrationCode, clientId, url, 'izinsiz port', operation);
    if (!host || isIpLiteral(host)) return deny(integrationCode, clientId, url, 'IP adresi/boş host', operation);
    if (host === 'localhost' || host.endsWith('.localhost') || !host.includes('.')) return deny(integrationCode, clientId, url, 'yerel/tek etiketli host', operation);

    const patterns = (opts.hosts ?? ALLOWED_OUTBOUND_HOSTS)[key];
    if (!patterns || !patterns.some(p => hostMatchesPattern(host, p))) return deny(integrationCode, clientId, url, 'izin listesinde değil', operation);
}
