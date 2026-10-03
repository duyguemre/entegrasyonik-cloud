import { ADAPTER_KEYS } from '@integration/modules/adapterKeys';
import { AdapterHttpService, type AuthConfig } from '@integration/modules/common/adapter/AdapterHttpService';

// ADR-0033 INT-01 (örnek bağlantı): Bizimhesap Service, ortak `AdapterHttpService` tabanına geçti. Davranış
// karakterizasyonla birebir (tests/characterization/common/Bizimhesap.resilience.contract.test.ts):
//   - ResilientHttpClient politikası: timeout (BIZIMHESAP_HTTP_TIMEOUT_MS || ADR-0020 kataloğu), ratePerMin 300, maxConcurrent 10.
//   - okuma idempotent:true; POST/PUT idempotent:false (timeout/5xx'te otomatik retry YOK => UNKNOWN_OUTCOME).
//   - mock AÇIKKEN mutlak URL yalnız mock tabanı/loopback olabilir (BACKLOG C19, fail-closed); göreli yol mock tabanına gider.
// Kalan platforma özgü kısım yalnız kimlik başlıkları (key/token).
const KEY = ADAPTER_KEYS.find(k => k.code === 'bizimhesap')!;

export default class Service extends AdapterHttpService {
    /** [C10c] mock AÇIKKEN yalnız mock uç listesindeki uçlar (kod içi varsayılan adapterKeys ∪ BIZIMHESAP_MOCKABLE_ENDPOINTS) çağrılabilir. */
    protected readonly enforceMockableEndpoints = true;

    constructor(params: any) {
        super(KEY, params);
    }

    protected authConfig(): AuthConfig {
        // [eslesme-fiyat WP4, 02-ekler/bizimhesap C-2 / D-BH-1] resmî: `Key` ve `Token` başlıklarının İKİSİ de aynı API anahtarı.
        // Eskiden `Key` = "Bizimhesap ID" (settings.key) gidiyordu. API anahtarı `secret` (ön yüz "API Anahtarı"); yoksa eski `key`.
        const s = this.params.integrationSettings?.settings || {};
        const apiKey = String(s.secret || s.APISECRET || s.token || s.key || s.APIKEY || s.apikey || '').trim();
        return { headers: { key: apiKey, token: apiKey, 'Content-Type': 'application/json' } };
    }
}
