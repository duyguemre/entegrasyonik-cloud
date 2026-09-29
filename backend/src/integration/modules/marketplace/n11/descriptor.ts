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
    capabilities: {
        products: {
            level: 'supported',
            methods: ['streamProducts', 'transferProducts', 'updateProduct', 'updateProductVariant', 'updateProductDelivery', 'updateProductStatuses', 'checkBatchProduct'],
            note: 'Ürün aktarımı ve güncelleme toplu görev akışıyla (ms/product/tasks) yapılır.',
            evidence: ['marketplace/n11/index.ts transferProducts'],
        },
        stockPrice: {
            level: 'supported',
            methods: ['updateProductStock', 'updateProductPrice'],
            note: 'Stok ve fiyat güncellemeleri pazaryerine iletilir.',
            evidence: ['marketplace/n11/index.ts updateProductStock'],
        },
        orders: {
            level: 'limited',
            methods: ['retrieveOrders'],
            note: 'Siparişler önce REST (`rest/delivery/v1/shipmentPackages`), UNAVAILABLE/NOT_SUPPORTED olursa SOAP\'a düşerek çekilir; çekim tek sayfa ile sınırlıdır.',
            evidence: ['marketplace/n11/services/OrderService.ts fetchOrders'],
        },
        // orderActions BİLİNÇLİ olarak not_supported: approveOrder VE rejectOrder ikisi de gerçek bir SOAP/REST
        // çağrısı yapmadan IntegrationError('NOT_SUPPORTED') fırlatır (ADR-0006 Karar 2, BACKLOG C9 sahte başarı
        // düzeltmesi). retrieveOrderRejectionReasons ayrı bir statik listeyle çalışır (aşağıda notProvided/limitations'ta).
        orderActions: {
            level: 'not_supported',
            methods: ['approveOrder', 'rejectOrder'],
            note: 'N11 sipariş onay/paketleme ve red uç noktaları uygulanmadı; her ikisi de NOT_SUPPORTED fırlatır. `retrieveOrderRejectionReasons` ayrıca statik bir liste döner (throw etmez).',
            evidence: ['marketplace/n11/services/OrderService.ts rejectOrder', 'marketplace/n11/services/OrderService.ts updateOrderPackageStatus'],
        },
        returns: {
            level: 'limited',
            methods: ['retrieveClaims', 'approveClaim', 'rejectClaim'],
            note: 'Yalnızca yeni iade talepleri ve yalnızca ilk sayfa listelenir.',
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
        shippingNotice: {
            level: 'limited',
            methods: ['sendOrderShipping'],
            note: 'Kargo bilgisi yalnızca siparişin ilk kalemi için iletilir (SOAP orderItemShipment).',
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
        'İade, soru ve hakediş listeleri ilk sayfa ile sınırlıdır.',
        'Marka bilgisi ve ödeme emri sorgusu sağlanmıyor.',
        'SOAP servislerinin (ProductSellingService/ProductStockService dahil) gelecekteki kapanış takvimi doğrulanamadı (BACKLOG P2).',
    ],
    rateLimits: {
        documented: {
            perMinute: 1000,
            source: 'docs/research/2026-09-28-integration-deadlines-scan.md §3 (REST sipariş/fiyat-stok servisi resmi limiti)',
        },
        // ResilientHttpClient politikası ile eşitlik: n11/services/Service.ts sharedPolicy (maxConcurrent:10, ratePerMin:1000, timeoutMs env||30000);
        // n11-soap AYNI politika değerleriyle AYRI bir ResilientHttpClient örneğidir (breaker izolasyonu için, bkz. Service.ts yorum).
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
