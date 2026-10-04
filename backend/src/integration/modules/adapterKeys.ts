// ADR-0033 Karar 2 (INT-02): entegrasyon KODU / mock öneki / mock varsayılan tabanı / env öneki için TEK kod tablosu.
// Saf veri: hiçbir modülü içe aktarmaz (döngüsel bağımlılık olmasın; `config/env.ts` de buradan türetir).
// Yeni entegrasyon = buraya BİR satır (docs/INTEGRATION_PLAYBOOK.md §3.3). Host İZİN LİSTESİ burada DEĞİL,
// güvenlik incelemesi gereken `common/security/outboundHosts.ts::ALLOWED_OUTBOUND_HOSTS`'ta kalır
// (kod listesi eşitliğini tests/static/adapterKeys.static.test.ts doğrular).
// C10c (faz4-conf-close): mock modunda ÇAĞRILABİLİR uçların KOD İÇİ varsayılan listesi (yerel `.env` listesine bağımlılık kalmasın).
// Kaynak: mockserver/backend/src/platforms/<platform>/server.js rotaları (yalnız mock'un GERÇEKTEN sunduğu uçlar; `/mock-api/*` yönetim uçları hariç).
// Eşleştirme `candidate.includes(entry)`'dir. Env semantiği (common/mock/MockMode.ts::resolveMockableEndpoints): `<PREFIX>_MOCKABLE_ENDPOINTS` bu listeyi GENİŞLETİR (birleşim);
// yalnız-env kipi için listede `!` girişi verilir.
// Trendyol/Pazarama/N11 bu alanı taşımaz: bu üçü için liste yalnız env'den gelir (boş liste => hiçbir uç mock sayılmaz).
const MOCK_ENDPOINTS_HB = ['listings', 'product/api', 'orders/merchantid', 'packages/merchantid', 'claims', 'questions', 'transactions', 'suppliers', 'merchant-messages', 'ticket-api', 'rest/delivery/v1/shipmentPackages'] as const;
const MOCK_ENDPOINTS_IDEASOFT = ['products', 'orders', 'categories', 'brands', 'option-groups', 'product-variant-options', 'oauth'] as const;
const MOCK_ENDPOINTS_BIZIMHESAP = ['products', 'orders'] as const;

export const ADAPTER_KEYS = [
    { code: 'trendyol', category: 'marketplace', mockPrefix: 'TY', envPrefix: 'TY', mockDefaultBase: 'http://localhost:3005/integration', fallbackBaseUrl: 'https://apigw.trendyol.com/integration' },
    // NOT: Pazarama token ucu ve veri uçları INT-05'te bu TEK değerden (3006) türer (eskiden token 6011, diğerleri 3006 idi).
    { code: 'hepsiburada', category: 'marketplace', mockPrefix: 'HEPSIBURADA', envPrefix: 'HB', mockDefaultBase: 'http://127.0.0.1:6015/hepsiburada',
        mockDefaultEndpoints: MOCK_ENDPOINTS_HB },
    { code: 'n11', category: 'marketplace', mockPrefix: 'N11', envPrefix: 'N11', mockDefaultBase: 'http://localhost:6015/n11' },
    { code: 'pazarama', category: 'marketplace', mockPrefix: 'PAZARAMA', envPrefix: 'PAZARAMA', mockDefaultBase: 'http://localhost:3006/apigateway' },
    { code: 'ideasoft', category: 'ecommerce', mockPrefix: 'IDEASOFT', envPrefix: 'IDEASOFT', mockDefaultBase: 'http://localhost:6015/ideasoft',
        mockDefaultEndpoints: MOCK_ENDPOINTS_IDEASOFT },
    { code: 'bizimhesap', category: 'erp', mockPrefix: 'BIZIMHESAP', envPrefix: 'BIZIMHESAP', mockDefaultBase: 'http://localhost:6015/bizimhesap', fallbackBaseUrl: 'https://bizimhesap.com/api/b2b', // [eslesme-fiyat WP4, D-BH-1] resmî taban (eskiden api.bizimhesap.com)
        mockDefaultEndpoints: MOCK_ENDPOINTS_BIZIMHESAP },
] as const;

type AdapterKeyRow = typeof ADAPTER_KEYS[number];
/** Tablo satırının genişletilmiş (fallbackBaseUrl opsiyonel) şekli; adaptör tabanı bunu alır. */
export interface AdapterKey {
    readonly code: AdapterKeyRow['code'];
    readonly category: AdapterKeyRow['category'];
    readonly mockPrefix: AdapterKeyRow['mockPrefix'];
    readonly envPrefix: string;
    readonly mockDefaultBase: string;
    readonly fallbackBaseUrl?: string;
    /** Mock modunda varsayılan çağrılabilir uç listesi (bkz. yukarıdaki MOCK_ENDPOINTS_*); yoksa yalnız env listesi. */
    readonly mockDefaultEndpoints?: readonly string[];
}
export type AdapterCode = AdapterKeyRow['code'];
export type MockPrefixName = AdapterKeyRow['mockPrefix'];

export const ADAPTER_CODES: readonly AdapterCode[] = ADAPTER_KEYS.map(k => k.code);
