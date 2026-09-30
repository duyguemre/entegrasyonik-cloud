import { ADAPTER_KEYS } from '@integration/modules/adapterKeys';
import { AdapterHttpService, type AuthConfig } from '@integration/modules/common/adapter/AdapterHttpService';

// ADR-0033 INT-05: Hepsiburada Service, ortak `AdapterHttpService` tabanına geçti (ResilientHttpClient kurulumu, mock/gerçek URL
// çözümleme ve get/post/put/delete sarmalayıcıları tabandan). Davranış karakterizasyonla birebir
// (tests/characterization/common/Hepsiburada.service.characterization.test.ts + MockMode.failOpen + K7.tenantUrlOverride):
//   - ADR-0006/0020: timeout HB_HTTP_TIMEOUT_MS || katalog (HB için 60sn), maxConcurrent 5, ratePerMin 0 => sınırsız.
//   - okuma idempotent:true; POST/PUT/DELETE idempotent:false (5xx/timeout'ta retry YOK => UNKNOWN_OUTCOME).
//   - [BACKLOG C19] mock AÇIKKEN tüm göreli yollar mock tabanına gider; mutlak URL yalnız mock tabanı/loopback olabilir.
//     [C10c, faz4-conf-close] mock uç listesi UYGULANIR (enforceMockableEndpoints): kod içi varsayılan liste (adapterKeys) ∪ HEPSIBURADA_MOCKABLE_ENDPOINTS.
// Platforma özgü kalan: Basic kimlik + User-Agent başlığı ve çok-host taban seçimi (mpop / listing / accounting / ticket).
const KEY = ADAPTER_KEYS.find(k => k.code === 'hepsiburada')!;

export class Service extends AdapterHttpService {
    /** [C10c] mock AÇIKKEN yalnız mock uç listesindeki uçlar (kod içi varsayılan adapterKeys.mockDefaultEndpoints ∪ HEPSIBURADA_MOCKABLE_ENDPOINTS) çağrılabilir. */
    protected readonly enforceMockableEndpoints = true;
    constructor(params: any) {
        super(KEY, params);
    }

    /**
     * [K7 2026-09-28] Temel adresler YALNIZCA platform `Integrations.urls`'ten okunur (tenant `settings.urls` ÖNCELİKLİ DEĞİL; ADR-0020 K7).
     * Mock AÇIKKEN mock tabanı. Kategori uçları mock kapalıyken ana (mpop) tabana gider.
     */
    protected baseUrlFor(path: string): string {
        const mock = this.mockConfig();
        if (mock.enabled) return mock.baseUrl;

        const urls = this.params.integrationSettings?.urls || {};
        const realBase: string = urls.BASEURL || 'https://mpop.hepsiburada.com';
        if (path.includes('product/api/categories')) return realBase;
        if (path.includes('listings/')) return urls.LISTINGBASEURL || 'https://listing-external.hepsiburada.com';
        if (path.includes('settlements/')) return urls.ACCOUNTINGBASEURL || 'https://accounting-external.hepsiburada.com';
        if (path.includes('ticket-api/')) return urls.TICKETBASEURL || 'https://ticket-api.hepsiburada.com';
        return realBase;
    }

    protected authConfig(): AuthConfig {
        const s = this.params.integrationSettings?.settings || {};
        const username = (s.USERNAME || s.username || s.APIKEY || s.apikey || '').trim();
        const password = (s.PASSWORD || s.password || s.APISECRET || s.apisecret || '').trim();
        return {
            auth: { username, password },
            headers: { 'User-Agent': 'entegrasyonik', 'Content-Type': 'application/json' },
        };
    }
}

export default Service;
