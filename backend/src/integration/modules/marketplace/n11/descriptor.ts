// ADR-0018 Aşama A — N11 yetenek manifestosu.
// Kaynaklar: INTEGRATIONS_REGISTRY.md §2.3; site/src/data/integrations.ts (N11 bloğu);
// docs/research/2026-09-28-integration-deadlines-scan.md §3; src/integration/modules/marketplace/n11/index.ts + services/OrderService.ts.
import type { IntegrationDescriptor } from '@integration/catalog/types';
import { integrationCode } from './constants';
import { ALLOWED_OUTBOUND_HOSTS } from '@integration/modules/common/security/outboundHosts';

const N11Descriptor: IntegrationDescriptor = {
    code: integrationCode,
    displayName: 'N11',
    category: 'marketplace',
    status: 'available',
    adapterVersion: '1.0.0',
    protocol: 'mixed',
    auth: {
        type: 'api_key_header',
        requiredSettings: ['APIKEY', 'APISECRET'],
        tokenLifecycle: 'none',
    },
    brandMapping: 'attribute', // [eslesme-fiyat WP2, K-C]
    capabilities: {
        products: {
            level: 'supported',
            methods: ['streamProducts', 'transferProducts', 'updateProduct', 'updateProductVariant', 'updateProductDelivery', 'updateProductStatuses', 'checkBatchProduct'],
            note: 'Ürün aktarımı ve güncelleme toplu görev akışıyla (ms/product/tasks) yapılır. Oluşturma gövdesi özellikleri (Marka = özellik 1), kargo şablonu, KDV (0/1/10/20), ana ürün kodu ve hazırlık süresini taşır; eksik alanlı ürün gönderilmez (alan bazlı mesaj). Ürün listesi resmî page/size ve content[] ile tüm sayfalar dolaşılarak akıtılır (sayfa başına 100; tavan 1000 sayfa / 100.000 kayıt, aşılırsa ya da sayfa tekrar ederse akış FAILED olur, sessiz kesilmez); içe aktarılan ürün iç modele dönüştürülür. Ürün sorgusu alan adları canlı API ile doğrulanmadı.',
            evidence: ['marketplace/n11/index.ts transferProducts'],
        },
        stockPrice: {
            level: 'supported',
            methods: ['updateProductStock', 'updateProductPrice'],
            note: 'Stok ve fiyat güncellemeleri pazaryerine iletilir.',
            evidence: ['marketplace/n11/index.ts updateProductStock'],
        },
        orders: {
            level: 'supported',
            methods: ['retrieveOrders'],
            note: 'Siparişler önce REST (`rest/delivery/v1/shipmentPackages`) ile sayfalı çekilir (sayfa başına 100; tavan 50 sayfa / 5.000 kayıt, aşılırsa ya da sayfa tekrar ederse sonuç "eksik" işaretlenir ve son başarılı senkron zamanı ilerlemez). REST UNAVAILABLE/NOT_SUPPORTED olursa ya da yanıt biçimi beklenmedikse SOAP yedeğine düşülür; SOAP yolu sayfalanmaz. Kimliksiz kayıt atlanır; tamamı kimliksizse VALIDATION (şema kayması).',
            evidence: ['marketplace/n11/services/OrderService.ts fetchOrders'],
        },
        // [eslesme-fiyat WP4, 02-ekler/n11 C-7] onay REST `rest/order/v1/update` (Picking) ile gerçek; red resmî uç doğrulanamadı →
        // NOT_SUPPORTED (ADR-0006, sahte başarı yok). retrieveOrderRejectionReasons statik liste döner.
        orderActions: {
            level: 'limited',
            methods: ['approveOrder', 'rejectOrder'],
            note: 'Onay: `Created` kalemler REST `rest/order/v1/update` ile `Picking`e çekilir (canlı doğrulama yerelde). Red uç noktası doğrulanamadı; NOT_SUPPORTED fırlatır. `retrieveOrderRejectionReasons` statik bir liste döner (throw etmez).',
            evidence: ['marketplace/n11/services/OrderService.ts rejectOrder', 'marketplace/n11/services/OrderService.ts updateOrderPackageStatus'],
        },
        returns: {
            level: 'limited',
            methods: ['retrieveClaims', 'approveClaim', 'rejectClaim'],
            note: 'Yalnızca yeni iade talepleri (REQUESTED) listelenir; 20 kayıtlık sayfalarla tüm sayfalar çekilir ve iç iade modeline eşlenir (alan adları canlıda doğrulanacak).',
            evidence: ['marketplace/n11/index.ts retrieveClaims'],
        },
        questions: {
            level: 'limited',
            methods: ['retrieveMessages', 'answerMessage'],
            note: 'Yalnızca açık sorular ve yalnızca ilk sayfa listelenir.',
            evidence: ['marketplace/n11/index.ts retrieveMessages'],
        },
        finance: {
            level: 'limited',
            methods: ['retrieveFinancials', 'retrieveCargoInvoices'],
            note: 'Hakediş görünümü kısmidir; ilk sayfa ile sınırlıdır. Ödeme emri sorgusu (retrieveSettlementsByPaymentId) daima boş dizi döner.',
            evidence: ['marketplace/n11/index.ts retrieveFinancials'],
        },
        categories: {
            level: 'supported',
            methods: ['retrieveCategories', 'retrieveCategoryAttributes', 'retrieveCategoryAttributeValues'],
            note: 'Kategori ağacı (CDN), nitelikler (REST) ve nitelik değerleri (SOAP) alınır. Marka ve komisyon bilgisi sağlanmaz (boş/undefined döner).',
            evidence: ['marketplace/n11/index.ts retrieveCategories'],
        },
        shippingNotice: {
            level: 'limited',
            methods: ['sendOrderShipping'],
            note: 'Kargo bilgisi siparişin tüm kalemleri için iletilir (SOAP MakeOrderItemShipment, orderItemList); kargo firması N11 kargo firmaları listesinden kimliğe çözülür. Gövde şeması resmî WSDL ile canlıda doğrulanmadı.',
            evidence: ['marketplace/n11/services/OrderService.ts sendOrderShipping'],
        },
        invoiceNotice: {
            level: 'supported',
            methods: ['sendOrderInvoice'],
            note: 'Fatura bağlantısı SOAP SellerInvoiceService ile pazaryerine iletilir.',
            evidence: ['marketplace/n11/services/OrderService.ts sendOrderInvoice'],
        },
    },
    limitations: [
        'Sipariş onaylama ve reddetme bu sürümde desteklenmez; işlem NOT_SUPPORTED hatası olarak bildirilir.',
        'Soru ve hakediş listeleri ilk sayfa ile sınırlıdır.',
        'Marka bilgisi ve ödeme emri sorgusu sağlanmıyor.',
        'Sipariş ve ürün sorgusu sayfalaması resmî page/size adlarıyla yapılır ancak canlı API ile doğrulanmadı; SOAP yedek yolu sayfalanmaz.',
        'SOAP servislerinin (ProductSellingService/ProductStockService dahil) gelecekteki kapanış takvimi doğrulanamadı (BACKLOG P2).',
    ],
    rateLimits: {
        documented: {
            perMinute: 1000,
            source: 'docs/research/2026-09-28-integration-deadlines-scan.md §3 (REST sipariş/fiyat-stok servisi resmi limiti)',
        },
        // ResilientHttpClient politikası ile eşitlik: ortak AdapterHttpService tabanı (katalog: maxConcurrent:10, ratePerMin:1000, timeoutMs env||30000);
        // n11-soap AYNI politika değerleriyle AYRI bir ResilientHttpClient örneğidir (breaker izolasyonu için, bkz. n11/services/Service.ts yorum).
        configured: { maxConcurrent: 10, ratePerMin: 1000, timeoutMs: 30000 },
        verified: false,
    },
    api: {
        hosts: ['api.n11.com'],
        docs: [
            { url: 'https://developer.n11.com/documentation/changelog/', kind: 'changelog', official: true, monitor: 'auto' },
            { url: 'https://developer.n11.com/documentation/elements/siparis-listeleme-servisi/', kind: 'reference', official: true, monitor: 'auto' },
            { url: 'https://magazadestek.n11.com/', kind: 'community', official: true, monitor: 'manual', accessNote: 'WebFetch 403 (bot koruması) — manuel turla izlenmeli' },
        ],
        lastVerifiedAt: '2026-09-28',
        verificationRef: 'docs/research/2026-09-28-integration-deadlines-scan.md',
    },
    // ADR-0020 Karar 1.4 (Aşama A) — `hosts` TEK KAYNAK `outboundHosts.ts::ALLOWED_OUTBOUND_HOSTS`'tan İTHAL
    // EDİLİR (çift tanım YOK, bkz. DescriptorConfig yorumu). `retiredEndpoints` bu entegrasyonda yok.
    config: {
        hosts: ALLOWED_OUTBOUND_HOSTS[integrationCode],
    },
    mock: {
        available: true,
        prefix: 'N11',
        contractFixtures: [],
    },
    contracts: [],
    verification: { liveApi: false, mockEnvironment: true },
};

export default N11Descriptor;
