// ADR-0018 Karar 1 / docs/INTEGRATION_CATEGORY_MODEL.md §2-4 — kategori kümesi + yetenek manifestosu tipleri.
// Bu dosya SALT VERİ tanımlarını taşır; hiçbir I/O yapmaz. Aşama A kapsamı: manifesto + tutarlılık testleri.
//
// KAPSAM DIŞI (bilinçli, Aşama B/C): IIntegrationAdapter/IShippingProvider/IEInvoiceProvider portları (kategori
// belgesi §5) — kargo/e-fatura adaptörü gelene kadar `IntegrationFactory`'ye yeni giriş açılmaz (ADR-0018 Karar 1.4,
// "Aşama sonrası"). Bu dosya yalnızca BUGÜN var olan 6 adaptörü tanımlamak için gerekli tipleri içerir.

/** Kanonik 5 kategori (ADR-0018 Karar 1.1). DB'deki `shipment` adı GÖÇ EDİLMEZ — bkz. `categoryToStorageKey`. */
export type IntegrationCategory = 'marketplace' | 'ecommerce' | 'erp' | 'einvoice' | 'shipping';

export const INTEGRATION_CATEGORIES: readonly IntegrationCategory[] = ['marketplace', 'ecommerce', 'erp', 'einvoice', 'shipping'];

/**
 * `ClientIntegrations` (tenant ayarı) alan adları — `shipment` (DB) `shipping` (kanonik) ile farklı isimlendirilir.
 * `einvoice`/`marketplace`/`ecommerce`/`erp` kanonik ad ile birebir aynıdır.
 * Kaynak: `docs/INTEGRATION_CATEGORY_MODEL.md` §2; `client/models/ClientIntegration.ts:18-22`.
 */
const CATEGORY_TO_STORAGE_KEY: Record<IntegrationCategory, string> = {
    marketplace: 'marketplace',
    ecommerce: 'ecommerce',
    erp: 'erp',
    einvoice: 'einvoice',
    shipping: 'shipment',
};

const STORAGE_KEY_TO_CATEGORY: Record<string, IntegrationCategory> = Object.fromEntries(
    (Object.entries(CATEGORY_TO_STORAGE_KEY) as Array<[IntegrationCategory, string]>).map(([cat, key]) => [key, cat]),
);

/** Kanonik kategori adı -> `ClientIntegrations` şemasındaki dizi adı (yalnızca `shipping` farklıdır: `shipment`). */
export function categoryToStorageKey(category: IntegrationCategory): string {
    return CATEGORY_TO_STORAGE_KEY[category];
}

/** `ClientIntegrations` dizi adı -> kanonik kategori. Bilinmeyen anahtar için `undefined` (fırlatmaz — çağıran karar verir). */
export function storageKeyToCategory(storageKey: string): IntegrationCategory | undefined {
    return STORAGE_KEY_TO_CATEGORY[storageKey];
}

/**
 * Yetenek (capability) anahtar kümesi — `docs/INTEGRATION_CATEGORY_MODEL.md` §3. Site kaydındaki
 * (`site/src/data/integrations.ts`) 10 anahtar AYNEN korunur; kargo/e-fatura'ya özgü anahtarlar eklenir
 * (henüz hiçbir adaptörde kullanılmaz — kategoriler `shipping`/`einvoice` bugün boş).
 */
export type CapabilityKey =
    | 'products'
    | 'stockPrice'
    | 'orders'
    | 'orderActions'
    | 'returns'
    | 'questions'
    | 'finance'
    | 'shippingNotice'
    | 'invoiceNotice'
    | 'categories'
    // Kargo (ADR-0018 kategori belgesi §5.1) — bugün hiçbir adaptörde yok, ilerideki port için ayrılmıştır.
    | 'shipmentCreate'
    | 'label'
    | 'tracking'
    | 'shipmentCancel'
    | 'rates'
    | 'returnShipment'
    // E-fatura (§5.2) — bugün hiçbir adaptörde yok.
    | 'einvoiceIssue'
    | 'earchiveIssue'
    | 'edespatchIssue'
    | 'documentStatus'
    | 'documentCancel'
    | 'taxpayerLookup'
    | 'documentPdf'
    // ERP muhasebe senkronu (§3) — bugün hiçbir adaptörde yok.
    | 'accountingSync';

/**
 * Yetenek düzeyi (ADR-0018 Karar 1.2 / kategori belgesi §3):
 *  - supported: gerçek çağrı yapar, testlidir.
 *  - limited: çalışır ama kapsamı dar; `note` ZORUNLU.
 *  - platform_auto: platform kendisi yapar, biz bilinçli no-op'uz.
 *  - not_supported: BİLİNÇLİ desteklenmiyor — metot `IntegrationError('NOT_SUPPORTED')` fırlatmak ZORUNDADIR
 *    (bu tutarlılık, `tests/contract/catalog/*.consistency.test.ts` içinde her `not_supported` girişi için doğrulanır).
 * Manifestoda HİÇ yazılmayan yetenek de `not_supported` sayılır (§3); bu tür örtük durumlar test kapsamına girmez.
 */
export type CapabilityLevel = 'supported' | 'limited' | 'platform_auto' | 'not_supported';

export interface CapabilityEntry {
    level: CapabilityLevel;
    /** Bu yeteneği karşılayan port/facade metotları (ör. `['transferProducts']`). Tutarlılık testleri bunu kullanır. */
    methods: string[];
    /** TR, kısa, doğrulanabilir açıklama; `level==='limited'` ise ZORUNLU (manifesto tutarlılık testinde denetlenir). */
    note?: string;
    /** 'dosya:satır' ya da test adı biçiminde kanıt referansları (görünmez, yalnız iç kullanım). */
    evidence?: string[];
}

export interface DocRef {
    url: string;
    kind: 'reference' | 'changelog' | 'announcements' | 'openapi' | 'status' | 'community';
    /** Resmi kaynak mı (ör. PTT'nin resmi olmayan GitHub referansı `false`). */
    official: boolean;
    /** Kaynak izleme modu (ADR-0018 Karar 2c). Aşama A'da yalnız VERİ — izleyici Aşama B'de kurulur. */
    monitor: 'auto' | 'manual' | 'off';
    /** ör. 'JS ile render — manual', 'giriş arkasında — manual'. */
    accessNote?: string;
};

export interface RateLimitInfo {
    documented?: { perMinute?: number; perSecond?: number; notes?: string; source: string };
    /** `ResilientHttpClient` politikası ile EŞİT olmalı (tutarlılık testi). */
    configured: { maxConcurrent?: number; ratePerMin?: number; timeoutMs?: number };
    /** Resmi kaynaktan doğrulandı mı (ör. Pazarama: `false` — panel girişin arkasında). */
    verified: boolean;
}

/** Bilinen eski/kapanan uç nokta (yalnızca bilgi amaçlı; C22 köprüsü `urlSafetyNet.ts`/`productUrls.ts`'ye REFERANS verir, tekrar üretmez). */
export interface KnownDeprecatedEndpoint {
    /** Kısa açıklama (ör. "Sipariş V1 (`.../orders`)"). */
    description: string;
    /** ISO tarih (kapanış/brownout). */
    deadline: string;
    /** Kod içi köprü referansı (dosya adı; sır/URL içermez). */
    bridgeRef: string;
}

/**
 * ADR-0020 Karar 1.5 — bilinen eski/kapanan uç nokta (yalnızca Trendyol'da dolu, C22). Bu tip İKİNCİ bir
 * doğruluk kaynağı AÇMAZ: gerçek normalizasyon/ret mantığı `sourceRef`teki köprü dosyasındadır (ör.
 * `urlSafetyNet.ts`, `api/productUrls.ts`); burası yalnız panel/insan okunur ENVANTERDİR (SALT VERİ).
 */
export interface RetiredEndpointPattern {
    /** İnsan okunur desen/yol (ör. 'product/sellers/<SELLERID>/products' ya da bir regex kaynak metni). */
    pattern: string;
    /** ISO tarih (kapanış/brownout). */
    retiredAt: string;
    /** Yerine geçen anahtar/uç (varsa; ör. 'transferUrl (v2/products)'). */
    replacementKey?: string;
    /** Kod içi köprü referansı ('dosya.ts' ya da 'dosya.ts::exportAdı'); sır/URL içermez. */
    sourceRef: string;
}

/**
 * ADR-0020 Karar 1.4/1.5 — platform ayar kataloğunun host/emekli-uç bölümü. Bu ALT TİPİN SAHİBİ ADR-0020'dir
 * (üst `IntegrationDescriptor` tipi ADR-0018'e aittir — dosya başı not, "tip dosyası 0018'in, `config` alt tipi
 * 0020'nindir"). Aşama A kapsamı: yalnız host + emekli-uç ENVANTERİ (salt veri, davranış değişmez). Uç nokta
 * `pathTemplate`/host SEÇİMİ (ADR §1.4 `config.endpoints`) ve platform geçersiz kılma yazma ucu Aşama B/C'dedir
 * (bu görevde YAPILMADI, bkz. görev raporu).
 */
export interface DescriptorConfig {
    /** İzinli giden host desenleri (tam host ya da `*.` joker). TEK KAYNAK `common/security/outboundHosts.ts::
     *  ALLOWED_OUTBOUND_HOSTS`'tur — bu alan ORADAN İTHAL EDİLİR (`ALLOWED_OUTBOUND_HOSTS[code]`), burada
     *  YENİDEN TANIMLANMAZ (K7 güvenlik kontrolüyle çift tanım / sürüklenme riski olmasın diye). */
    hosts: readonly string[];
    /** Bilinen eski/kapanan uç noktalar (yalnızca Trendyol'da dolu, C22 köprüsü). */
    retiredEndpoints?: RetiredEndpointPattern[];
}

/**
 * Entegrasyon yetenek manifestosu (ADR-0018 Karar 1.2, kategori belgesi §4). Her adaptörün yanında
 * `descriptor.ts` içinde durur, kodla birlikte sürümlenir, DB'ye YAZILMAZ.
 */
export interface IntegrationDescriptor {
    /** `IntegrationFactory` kodu (küçük harf) — fabrika kod kümesiyle EŞİTLİK testi. */
    code: string;
    displayName: string;
    category: IntegrationCategory;
    status: 'available' | 'limited' | 'roadmap' | 'deprecated';
    /** semver; sözleşme/şema değişikliğinde artar (kategori belgesi §6). */
    adapterVersion: string;
    protocol: 'rest' | 'soap' | 'mixed';
    auth: {
        type: 'basic' | 'api_key_header' | 'oauth2_client_credentials' | 'oauth2_authorization_code' | 'custom';
        /** Adaptörün `requiredSettings` alanıyla EŞİT olmalı (tutarlılık testi). */
        requiredSettings: string[];
        tokenLifecycle?: 'none' | 'cached_refresh' | 'user_consent';
    };
    capabilities: Partial<Record<CapabilityKey, CapabilityEntry>>;
    /** Görünür kapsam sınırları (dürüstlük ilkesi, E3). */
    limitations: string[];
    rateLimits: RateLimitInfo;
    api: {
        knownVersion?: string;
        /** Yalnız host (sır/sorgu yok). */
        hosts: string[];
        docs: DocRef[];
        /** Son insan/araştırma doğrulama turu (ISO tarih). */
        lastVerifiedAt?: string;
        verificationRef?: string;
        /** C22 köprüsünde bulunan bilinen eski/kapanan uç noktalar (yalnız Trendyol'da dolu). */
        knownDeprecatedEndpoints?: KnownDeprecatedEndpoint[];
    };
    /** ADR-0020 Karar 1.4/1.5 — bkz. `DescriptorConfig` (sahiplik notu orada). */
    config: DescriptorConfig;
    mock: {
        available: boolean;
        /** `common/mock/MockMode.ts` `MockPrefix` değeri (varsa). */
        prefix?: string;
        contractFixtures: string[];
        knownDeviations?: string[];
    };
    /** İzlenen sözleşme kimlikleri (ör. `'trendyol.orders.list@v2'`). */
    contracts: string[];
    probes?: Array<{ id: string; capability: CapabilityKey; readOnly: true; needs: 'platform_account' | 'public' }>;
    verification: { liveApi: boolean; mockEnvironment: boolean };
}
