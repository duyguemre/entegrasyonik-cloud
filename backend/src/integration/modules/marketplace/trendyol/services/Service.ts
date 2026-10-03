import { ADAPTER_KEYS } from '@integration/modules/adapterKeys';
import { AdapterHttpService, type AuthConfig } from '@integration/modules/common/adapter/AdapterHttpService';
import { trendyolGlobalRatePerMin, trendyolGroupRatePerMin, TRENDYOL_FINANCE_GROUP, TRENDYOL_FINANCE_RATE_PER_MIN, TRENDYOL_EXTRA_GROUP_RATE_PER_MIN } from '../limits';

// ADR-0033 INT-05: Trendyol Service, ortak `AdapterHttpService` tabanina gecti (ResilientHttpClient kurulumu, mock/gercek URL
// cozumleme ve get/post/put sarmalayicilari tabandan). Davranis karakterizasyonla birebir
// (tests/characterization/common/Trendyol.service.characterization.test.ts + MockMode.failOpen + defaultUrlsAndUserAgent).
// ADR-0033: Trendyol V2 guvenlik agi (urlSafetyNet), servis grubu limitleri (limits.ts: X1 kovalari, BarcodePriceGate, finance grubu)
// ve siparis pacer'i ADAPTORDE kalir; tabana yalniz HTTP kurulum/URL cozumleme/mock fail-closed/hata sarma tasindi.
// Platforma ozgu kalan: Basic kimlik + User-Agent, politika degerleri (global/grup kovalari), mock'ta /integration cift-yol tekillestirme.
const KEY = ADAPTER_KEYS.find(k => k.code === 'trendyol')!;

/**
 * [C22, 2026-09-28] Goreli URL'ler icin genel fallback taban (spec §1: resmi PROD tabani `apigw.trendyol.com/integration`).
 * ESKI deger `https://api.trendyol.com/sapigw` eski gateway'di (host + yol oneki yanlis, bkz. BACKLOG C11). Yalnizca
 * `settings.urls.baseUrl` bossa ve URL goreliyken kullanilir; DB'de baseUrl varsa o oncelikli. Tek kaynak: ADAPTER_KEYS.
 */
export const TRENDYOL_FALLBACK_BASE_URL = KEY.fallbackBaseUrl!;

// ADR-0006 Karar 1: tum HTTP cagrilari paylasimli ResilientHttpClient uzerinden gecer (retry/backoff/circuit breaker/timeout/metrik).
// [ADR-0006 adim 1] POST/PUT ag hatasinda retry YOK (idempotent:false varsayilan); okuma (GET) idempotent:true.
export default class Service extends AdapterHttpService {
    /** [BACKLOG C19] mock AÇIKKEN yalniz TY_MOCKABLE_ENDPOINTS listesindeki uclar cagrilabilir (fail-closed). */
    protected readonly enforceMockableEndpoints = true;
    /** Trendyol hem api. hem de apigw. host'unu kullanabiliyor; mock'ta ikisi de mock tabanina yeniden yazilir (yabanci host gecemez). */
    protected readonly mockHostPattern = /https:\/\/(api|apigw)\.trendyol\.com/g;

    public static getInstance(integrationParameters: any): Service {
        return new Service(integrationParameters);
    }

    constructor(params: any) {
        super(KEY, params, {
            policy: {
                // [C22] Global tavan tek yerde (../limits.ts; env TY_RATE_PER_MIN + katalog). Siparis cekme ayrica 30/dk (orderListPacer).
                ratePerMin: trendyolGlobalRatePerMin(),
                // [ADR-0030 X1] Servis grubu kovalari (urun okuma / urun yazma / stok-fiyat yazma) + finans; etiketsiz cagrilar genel kovada.
                groupRatePerMin: { ...trendyolGroupRatePerMin(), [TRENDYOL_FINANCE_GROUP]: TRENDYOL_FINANCE_RATE_PER_MIN, ...TRENDYOL_EXTRA_GROUP_RATE_PER_MIN },
            },
        });
    }

    /**
     * Auth Config: Her istekte API KEY ve SECRET ekler.
     *
     * [Trendyol URL/UA duzeltmesi, 2026-09-27, docs/research/2026-09-27-api-verification.md, BACKLOG.md C11] User-Agent
     * `{sellerId} - {EntegratorAdi}` (yanlis/eksik UA 403 ile reddedilir); `clientId` Entegrasyonik'in ic tenant kimligidir,
     * satici ID'si DEGILDIR. SELLERID `requiredSettings` ile zorunlu; yine de savunmaci: clientId fallback'ina SESSIZCE dusulmez,
     * hizli ve anlasilir hata firlatilir (ADR-0006 "sahte basari yok"; FinancialConnector.getFormattedUrl ile AYNI desen).
     */
    protected authConfig(): AuthConfig {
        const { APIKEY, APISECRET, SELLERID } = this.params.integrationSettings!.settings!;
        if (!SELLERID) {
            throw new Error('[Trendyol Service] User-Agent için SELLERID ayarı bulunamadı (requiredSettings ile zorunlu olmalıydı).');
        }
        return {
            auth: { username: APIKEY, password: APISECRET },
            headers: { 'User-Agent': `${SELLERID} - Entegrasyonik` },
        };
    }

    /** Taban cozumlemeden sonra mock'ta `/integration/integration` ciftlesmesini tekillestirir (mock tabani da /integration icerir). */
    public resolveUrl(url: string): string {
        const target = super.resolveUrl(url);
        return this.mockConfig().enabled ? target.replace('/integration/integration', '/integration') : target;
    }
}
