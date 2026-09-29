// BACKLOG C19: mock modu FAIL-CLOSED. Tüm adaptörlerin `*_MOCK_MODE` / `*_MOCK_BASE_URL` /
// `*_MOCKABLE_ENDPOINTS` bayrakları TEK yerde (burada) okunur ve mock modunda gerçek pazaryeri
// adresine gidilmesi yapısal olarak engellenir:
//   - mock modu AÇIKKEN listede olmayan endpoint  -> IntegrationError('NOT_SUPPORTED',
//     platformCode:'MOCK_ENDPOINT_NOT_MOCKED', retryable:false); HİÇ istek atılmaz.
//   - mock modu AÇIKKEN mock tabanına çevrilemeyen (yabancı/gerçek host'lu) mutlak URL -> aynı hata.
//   - MOCKABLE listesi BOŞ/tanımsız/yalnız virgüllerden oluşuyorsa hiçbir endpoint mock sayılmaz
//     (ÖNCEKİ davranış: boş girdi `url.includes('')` ile "joker" olurdu; artık yok).
// Bu, dev-tools/egress-guard.js'in (ağ seviyesi, `npm run start:local`) YERİNE değil YANINDA
// çalışan uygulama-seviyesi ikinci savunma hattıdır.
import { IntegrationError } from '../IntegrationError';
import { getConfig } from '@config';

export type MockPrefix = 'TY' | 'PAZARAMA' | 'N11' | 'HEPSIBURADA' | 'IDEASOFT' | 'BIZIMHESAP';

export const MOCK_ENDPOINT_NOT_MOCKED = 'MOCK_ENDPOINT_NOT_MOCKED';

export interface MockConfig {
    prefix: MockPrefix;
    /** `<PREFIX>_MOCK_MODE === 'true'` */
    enabled: boolean;
    /** `<PREFIX>_MOCK_BASE_URL` veya adaptörün verdiği varsayılan (sondaki '/' korunur; birleştiren temizler). */
    baseUrl: string;
    /** `<PREFIX>_MOCKABLE_ENDPOINTS` virgülle ayrılmış liste; trim'lenmiş, boş girdiler ATILMIŞ. */
    mockableEndpoints: string[];
}

/** Ortam değişkenlerini ÇAĞRI ANINDA okur (`@config` her erişimde ham ortamı parmak iziyle denetler; testler env'i değiştirince otomatik yenilenir, süreç-ömürlü cache YOK). */
export function readMockConfig(prefix: MockPrefix, defaultBaseUrl: string): MockConfig {
    const m = getConfig().mock[prefix];
    return {
        prefix,
        enabled: m.enabled,
        baseUrl: m.baseUrl || defaultBaseUrl,
        mockableEndpoints: m.mockableEndpoints,
    };
}

/**
 * `candidate` mock'lanabilir mi? Varsayılan eşleştirme `candidate.includes(entry)` (Trendyol/Pazarama/N11-REST
 * davranışı, büyük/küçük harf duyarlı). N11-SOAP gibi farklı eşleştirme isteyenler `matcher` verir.
 * Liste boşsa DAİMA false.
 */
export function isEndpointMockable(
    cfg: MockConfig,
    candidate: string,
    matcher: (entry: string, candidate: string) => boolean = (m, c) => c.includes(m),
): boolean {
    return cfg.mockableEndpoints.some(m => matcher(m, candidate));
}

export interface MockErrorCtx {
    integrationCode: string;
    clientId: string | number;
    operation?: string;
}

// Hata mesajına sorgu dizesi/kimlik bilgisi sızmasın diye yalnızca origin+path gösterilir.
function describeTarget(target: string): string {
    try {
        const u = new URL(target);
        return `${u.origin}${u.pathname}`;
    } catch {
        return target.split('?')[0].slice(0, 200);
    }
}

/** Mock modunda mock'lanmamış bir hedefe gidilmek istendiğinde fırlatılan hata (retryable=false). */
export function mockNotMockedError(cfg: MockConfig, target: string, ctx: MockErrorCtx, reason: 'not-listed' | 'foreign-host' = 'not-listed'): IntegrationError {
    const what = reason === 'foreign-host'
        ? `mock tabanına/loopback'e çevrilemeyen mutlak URL '${describeTarget(target)}'`
        : `'${describeTarget(target)}' endpoint'i ${cfg.prefix}_MOCKABLE_ENDPOINTS listesinde yok`;
    return new IntegrationError(
        'NOT_SUPPORTED',
        `Mock modunda (${cfg.prefix}_MOCK_MODE=true) ${what}; gerçek adrese İSTEK ATILMADI (fail-closed, C19).`,
        {
            integrationCode: ctx.integrationCode,
            operation: ctx.operation ?? 'mock-routing',
            clientId: ctx.clientId,
            platformCode: MOCK_ENDPOINT_NOT_MOCKED,
        },
    );
}

/** Mock modunda mock'lanabilir listede olmayan endpoint için hata fırlatır. */
export function assertEndpointMockable(
    cfg: MockConfig,
    target: string,
    ctx: MockErrorCtx,
    matcher?: (entry: string, candidate: string) => boolean,
): void {
    if (!isEndpointMockable(cfg, target, matcher)) throw mockNotMockedError(cfg, target, ctx);
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** URL'nin host'u loopback mu ya da mock tabanının host'u mu? Ayrıştırılamazsa false. */
export function isMockSafeUrl(cfg: MockConfig, url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (LOOPBACK_HOSTS.has(host)) return true;
        return host === new URL(cfg.baseUrl).hostname.toLowerCase();
    } catch {
        return false;
    }
}

/**
 * Mock modunda son (dönüştürme SONRASI) URL'nin gerçek/yabancı bir host'a işaret etmediğini doğrular.
 * Mock modu kapalıysa hiçbir şey yapmaz (gerçek mod davranışı değişmez).
 */
export function assertMockSafeUrl(cfg: MockConfig, finalUrl: string, ctx: MockErrorCtx): void {
    if (!cfg.enabled) return;
    if (!isMockSafeUrl(cfg, finalUrl)) throw mockNotMockedError(cfg, finalUrl, ctx, 'foreign-host');
}
