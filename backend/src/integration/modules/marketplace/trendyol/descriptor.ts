// ADR-0018 Aşama A — Trendyol yetenek manifestosu. Kodla birlikte sürümlenir, DB'ye YAZILMAZ (kategori belgesi §4).
// Kaynaklar: INTEGRATIONS_REGISTRY.md §2.1; site/src/data/integrations.ts (Trendyol bloğu); docs/research/2026-09-27-api-verification.md;
// docs/research/2026-09-28-trendyol-v2-migration-spec.md; docs/research/2026-09-28-integration-deadlines-scan.md §1-2;
// `../limits.ts`, `../urlSafetyNet.ts`, `../api/productUrls.ts` (C22 köprüsü — buradan REFERANS verilir, tekrar üretilmez).
import type { IntegrationDescriptor, RetiredEndpointPattern } from '@integration/catalog/types';
import { integrationCode } from './constants';
import { DEFAULT_GLOBAL_RATE_PER_MIN, DEFAULT_ORDER_LIST_RATE_PER_MIN } from './limits';
import { ALLOWED_OUTBOUND_HOSTS } from '@integration/modules/common/security/outboundHosts';
import { PRODUCT_URL_MIGRATIONS } from './api/productUrls';

/**
 * Bilinen eski/kapanan uç noktalar (C22 bulgusu — `urlSafetyNet.ts`/`productUrls.ts` bu listeyi KOD olarak
 * uygular; burada yalnız İNSAN OKUNUR özet + tarih durur, ikinci bir doğruluk kaynağı AÇILMAZ).
 * Kaynak: docs/research/2026-09-28-trendyol-v2-migration-spec.md §1, §6; ...-integration-deadlines-scan.md §1-2.
 */
const TRENDYOL_KNOWN_DEPRECATED_ENDPOINTS = [
    {
        description: 'Sipariş V1 `order/sellers/{id}/orders` (V2\'siz) — yerine `order/sellers/{id}/v2/orders`. Kod tarafı köprüsü: urlSafetyNet.ts normalizeTrendyolOrderListUrl().',
        deadline: '2026-10-15',
        bridgeRef: 'urlSafetyNet.ts',
    },
    {
        description: 'Ürün V1 (aktarma `POST products`, filtreleme `GET products`, kategori-özellik `product-categories/{id}/attributes`) — yerine V2 (`v2/products`, `products/approved|unapproved`, `categories/{id}/attributes`). Kod tarafı köprüsü: productUrls.ts.',
        deadline: '2026-10-15',
        bridgeRef: 'productUrls.ts',
    },
    {
        description: '`origin` (menşe, 2 harfli ülke kodu) ürün aktarım/güncellemede zorunlu hale gelir (bugün opsiyonel, kategori attribute altından da kabul ediliyor). Kod tarafında henüz gönderilmiyor (BACKLOG P0 riski R6).',
        deadline: '2026-10-23',
        bridgeRef: 'productConstants.ts (TRENDYOL_ORIGIN_REQUIRED_FROM_MS)',
    },
] as const;

/**
 * ADR-0020 Karar 1.4/1.5 — `config.retiredEndpoints` (Aşama A). İKİNCİ bir doğruluk kaynağı AÇMAZ: gerçek
 * normalizasyon/ret mantığı köprü dosyalarındadır (`sourceRef`). Bu dizi yalnız panel/insan okunur ENVANTERDİR,
 * TEK YER'den (`PRODUCT_URL_MIGRATIONS` + sipariş V1 deseni) türetilir — yeniden YAZILMAZ/KOPYALANMAZ.
 */
const TRENDYOL_RETIRED_ENDPOINTS: RetiredEndpointPattern[] = [
    {
        pattern: 'order/sellers/<SELLERID>/orders (V2\'siz)',
        retiredAt: '2026-10-15',
        replacementKey: 'orderListUrl (order/sellers/<SELLERID>/v2/orders)',
        sourceRef: 'urlSafetyNet.ts::normalizeTrendyolOrderListUrl',
    },
    ...PRODUCT_URL_MIGRATIONS.filter((m) => m.from !== null).map((m) => ({
        pattern: m.from as string,
        retiredAt: '2026-10-15',
        replacementKey: `${m.key} (${m.to})`,
        sourceRef: 'api/productUrls.ts::PRODUCT_URL_MIGRATIONS',
    })),
];

const TrendyolDescriptor: IntegrationDescriptor = {
    code: integrationCode,
    displayName: 'Trendyol',
    category: 'marketplace',
    status: 'available',
    // C22 V2 geçişi (sipariş+ürün) yapıldı; sözleşme/host/yol değişikliği -> minor artış (kategori belgesi §6).
    adapterVersion: '1.1.0',
    protocol: 'rest',
    auth: {
        type: 'basic',
        requiredSettings: ['SELLERID', 'APIKEY', 'APISECRET'],
        tokenLifecycle: 'none',
    },
    brandMapping: 'id', // [eslesme-fiyat WP2, K-C]
    capabilities: {
        products: {
            level: 'supported',
            methods: ['streamProducts', 'transferProducts', 'updateProduct', 'updateProductVariant', 'updateProductDelivery', 'updateProductStatuses', 'checkBatchProduct'],
            note: 'Ürün aktarımı (V2), içerik/varyant/teslimat güncelleme ve toplu işlem durumu sorgulama.',
            evidence: ['marketplace/trendyol/index.ts transferProducts', 'marketplace/trendyol/services/ProductService.ts'],
        },
        stockPrice: {
            level: 'supported',
            methods: ['updateProductStock', 'updateProductPrice'],
            note: 'Stok/fiyat V1-V2 ortak uç; aynı gövde 15 dk içinde tekrarlanamaz (TRENDYOL_PRODUCT_LIMITS.SAME_BODY_COOLDOWN_MS).',
            evidence: ['marketplace/trendyol/index.ts updateProductStock'],
        },
        orders: {
            level: 'supported',
            methods: ['retrieveOrders'],
            note: 'Sipariş V2 (`v2/orders`); pencere <=14 gün, sayfa/oran limitli, ardışık çekim (limits.ts, TRENDYOL_ORDER_V2).',
            evidence: ['marketplace/trendyol/api/OrderConnector.ts fetchOrdersFromPlatform'],
        },
        orderActions: {
            level: 'platform_auto',
            methods: ['approveOrder'],
            note: 'Trendyol siparişi kendisi onaylar; `approveOrder` gerçek çağrı yapmadan `true` döner (bilinçli no-op). Ayrı `rejectOrder` gerçek çağrı yapar (supported).',
            evidence: ['marketplace/trendyol/index.ts approveOrder'],
        },
        returns: {
            level: 'supported',
            methods: ['retrieveClaims', 'approveClaim', 'rejectClaim', 'retrieveOrderRejectionReasons'],
            note: 'İade talepleri listelenir, onaylanır veya red nedeniyle reddedilir.',
            evidence: ['marketplace/trendyol/index.ts approveClaim'],
        },
        questions: {
            level: 'supported',
            methods: ['retrieveMessages', 'answerMessage'],
            note: 'Müşteri soruları listelenir ve cevaplanır (size<=50, tarih aralığı <=2 hafta).',
            evidence: ['marketplace/trendyol/index.ts answerMessage'],
        },
        finance: {
            level: 'supported',
            methods: ['retrieveFinancials', 'retrieveCargoInvoices', 'retrieveSettlementsByPaymentId'],
            note: 'Hakediş, diğer finansal hareketler, kargo faturası ve ödeme emri görünümü.',
            evidence: ['marketplace/trendyol/index.ts retrieveFinancials'],
        },
        shippingNotice: {
            level: 'limited',
            methods: ['sendOrderShipping'],
            note: 'Kargo takip bilgisi elle girilir ve pazaryerine iletilir; paket kimliği eşleşmesi uçtan uca doğrulanmadı (INTEGRATIONS_REGISTRY §2.1).',
            evidence: ['marketplace/trendyol/api/OrderConnector.ts sendOrderShipping'],
        },
        invoiceNotice: {
            level: 'supported',
            methods: ['sendOrderInvoice'],
            note: 'Fatura bağlantısı resmi şemayla (`invoiceLink`, `shipmentPackageId`, opsiyonel `invoiceNumber`) iletilir.',
            evidence: ['marketplace/trendyol/api/OrderConnector.ts sendOrderInvoice'],
        },
        categories: {
            level: 'supported',
            methods: ['retrieveCategories', 'retrieveCategoryAttributes', 'retrieveCategoryAttributeValues', 'retrieveCategoryCommision', 'retrieveBrands'],
            note: 'Kategori, nitelik, marka ve komisyon bilgisi pazaryerinden alınır.',
            evidence: ['marketplace/trendyol/index.ts retrieveCategories'],
        },
        'pricing.buybox.read': {
            level: 'limited',
            methods: ['readBuybox'],
            note: 'Buybox sırası, buybox fiyatı ve çok-satıcı bilgisi salt okunur (≤10 barkod/istek, zamanlanmış). Uç yolu, storeFrontCode değeri ve yanıt alan adları resmi dokümandan doğrudan teyit edilemedi; yerelde doğrulanana kadar iş varsayılan KAPALI (features.competition).',
            evidence: ['marketplace/trendyol/api/BuyboxConnector.ts mapBuyboxResponse', 'tests/unit/pricing/buyboxConnector.test.ts'],
            // lastVerifiedAt BİLİNÇLİ OLARAK BOŞ: docs/PRICING_COMPETITION.md §6 (yerel LIVE_READONLY doğrulaması, K57-S8 açık karar).
        },
    },
    limitations: [
        'Kargo takip bilgisi otomatik değil, elle girilerek iletilir.',
        'Sipariş satır kimliği yeniden adlandırması (`line.id`→`lineId`) adaptörde henüz uygulanmadı (BACKLOG R9, doğruluk riski).',
        '`origin` (menşe) alanı ürün gönderiminde henüz eklenmedi (23.10.2026\'da zorunlu olacak, BACKLOG R6).',
        'Buybox bilgisi yalnız okunur; rakip satıcı listesi ve fiyat önerisi Trendyol API\'sinde yok. Buybox alanları yerelde doğrulanmadı.',
    ],
    rateLimits: {
        documented: {
            perMinute: DEFAULT_ORDER_LIST_RATE_PER_MIN,
            source: 'docs/research/2026-09-28-trendyol-v2-migration-spec.md §3.7 (muhafazakâr taban, 50K kademe; kaynaklar birbiriyle çelişiyor: 30-100/dk tablo vs 1000/dk servis sayfası)',
        },
        // ResilientHttpClient politikası ile eşitlik: Service.ts (maxConcurrent:10, timeoutMs env||30000, ratePerMin=trendyolGlobalRatePerMin()).
        configured: { maxConcurrent: 10, ratePerMin: DEFAULT_GLOBAL_RATE_PER_MIN, timeoutMs: 30000 },
        verified: false,
    },
    api: {
        knownVersion: 'integration v2 (sipariş+ürün)',
        hosts: ['apigw.trendyol.com', 'api.trendyol.com', 'stageapigw.trendyol.com'],
        docs: [
            { url: 'https://developers.trendyol.com/v2.0/changelog/changelog', kind: 'changelog', official: true, monitor: 'auto' },
            { url: 'https://developers.trendyol.com/llms.txt', kind: 'reference', official: true, monitor: 'auto' },
            { url: 'https://developers.trendyol.com/docs/1-servis-limitleri', kind: 'reference', official: true, monitor: 'auto' },
            { url: 'https://developers.trendyol.com/docs/api-status.md', kind: 'status', official: true, monitor: 'auto' },
        ],
        lastVerifiedAt: '2026-09-28',
        verificationRef: 'docs/research/2026-09-28-trendyol-v2-migration-spec.md',
        knownDeprecatedEndpoints: [...TRENDYOL_KNOWN_DEPRECATED_ENDPOINTS],
    },
    // ADR-0020 Karar 1.4/1.5 (Aşama A) — `hosts` TEK KAYNAK `outboundHosts.ts::ALLOWED_OUTBOUND_HOSTS`'tan İTHAL
    // EDİLİR (çift tanım YOK). `retiredEndpoints` TEK KAYNAK `productUrls.ts::PRODUCT_URL_MIGRATIONS` (+ sipariş
    // V1 deseni, `urlSafetyNet.ts`) İTHAL EDİLİR — C22'nin köprüsü burada YENİDEN YAZILMADI.
    config: {
        hosts: ALLOWED_OUTBOUND_HOSTS[integrationCode],
        retiredEndpoints: TRENDYOL_RETIRED_ENDPOINTS,
    },
    mock: {
        available: true,
        prefix: 'TY',
        contractFixtures: [],
        knownDeviations: [
            'BACKLOG C20 (mock hâlâ V1 alan adlarını üretiyor; V2 alan adları C22 sonrası mock\'a taşınmadı)',
            'PRC-R1: buybox ucu mock sunucuda henüz yok; fikstür tests/fixtures/trendyol/buybox-information.json (alanlar doğrulanmadı), mockserver rotası yerelde eklenecek (docs/PRICING_COMPETITION.md §6).',
        ],
    },
    contracts: ['trendyol.orders.list@v2', 'trendyol.claims.list@v1', 'trendyol.products.buybox@v1'],
    probes: [
        { id: 'trendyol.categories.tree', capability: 'categories', readOnly: true, needs: 'public' },
        { id: 'trendyol.brands.search', capability: 'categories', readOnly: true, needs: 'public' },
    ],
    verification: { liveApi: false, mockEnvironment: true },
};

export default TrendyolDescriptor;
