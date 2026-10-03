import { ADAPTER_KEYS } from '@integration/modules/adapterKeys';
import { AdapterHttpService, type AuthConfig } from '@integration/modules/common/adapter/AdapterHttpService';
import { HB_HOSTS, isHbSit, sitHost } from '../constants';

// ADR-0033 INT-05: Hepsiburada Service, ortak `AdapterHttpService` tabanına geçti (ResilientHttpClient kurulumu, mock/gerçek URL
// çözümleme ve get/post/put/delete sarmalayıcıları tabandan). Davranış karakterizasyonla birebir
// (tests/characterization/common/Hepsiburada.service.characterization.test.ts + MockMode.failOpen + K7.tenantUrlOverride):
//   - ADR-0006/0020: timeout HB_HTTP_TIMEOUT_MS || katalog (HB için 60sn), maxConcurrent 5, ratePerMin 0 => sınırsız.
//   - okuma idempotent:true; POST/PUT/DELETE idempotent:false (5xx/timeout'ta retry YOK => UNKNOWN_OUTCOME).
//   - [BACKLOG C19] mock AÇIKKEN tüm göreli yollar mock tabanına gider; mutlak URL yalnız mock tabanı/loopback olabilir.
//     [C10c, faz4-conf-close] mock uç listesi UYGULANIR (enforceMockableEndpoints): kod içi varsayılan liste (adapterKeys) ∪ HEPSIBURADA_MOCKABLE_ENDPOINTS.
// Platforma özgü kalan: Basic kimlik + User-Agent başlığı ve çok-host taban seçimi (mpop / listing / oms / finans / soru / ticket; SIT).
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

        // [eslesme-fiyat WP3, K-16] SIT (sandbox) yalnız açık tenant ayarıyla (`HB_ENV = 'sit'`): tüm tabanlar `-sit` eşlerine gider,
        // platform `urls` (prod) yok sayılır (prod/SIT karışmasın). Yazma testleri yalnız SIT'te (Bölüm 2).
        const sit = isHbSit(this.params.integrationSettings?.settings);
        const host = (h: string) => `https://${sit ? sitHost(h) : h}`;
        const urls = sit ? {} : (this.params.integrationSettings?.urls || {});
        const realBase: string = urls.BASEURL || host(HB_HOSTS.mpop);
        if (path.includes('product/api/categories')) return realBase;
        // Sipariş/paket/iade (OMS) uçları ayrı tabandadır: 2026-10-03 canlı salt-okuma ile doğrulandı (oms-external 200, mpop 404).
        if (/^\/?(orders|packages|claims|lineitems)\//i.test(path)) return urls.OMSBASEURL || host(HB_HOSTS.oms);
        if (path.includes('listings/')) return urls.LISTINGBASEURL || host(HB_HOSTS.listing);
        // Finans: yeni `transactions` (mpfinance-external, K-1); eski `settlements` (accounting-external, canlıda 404) K-1 yeniden yazımına kadar.
        if (/^\/?transactions\//i.test(path)) return urls.FINANCEBASEURL || host(HB_HOSTS.finance);
        if (path.includes('settlements/')) return urls.ACCOUNTINGBASEURL || host(HB_HOSTS.accounting);
        // Soru (Ask to Seller, K-2): `api/v1.0/issues`.
        if (/^\/?api\/v1\.0\/issues/i.test(path)) return urls.QUESTIONBASEURL || host(HB_HOSTS.questions);
        if (path.includes('ticket-api/')) return urls.TICKETBASEURL || host(HB_HOSTS.ticket);
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
