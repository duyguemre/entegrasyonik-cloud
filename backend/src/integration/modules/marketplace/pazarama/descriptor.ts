// ADR-0018 Aşama A — Pazarama yetenek manifestosu.
// Kaynaklar: INTEGRATIONS_REGISTRY.md §2.4; site/src/data/integrations.ts (Pazarama bloğu);
// docs/research/2026-09-28-integration-deadlines-scan.md §5; src/integration/modules/marketplace/pazarama/index.ts.
import type { IntegrationDescriptor } from '@integration/catalog/types';
import { integrationCode } from './constants';
import { ALLOWED_OUTBOUND_HOSTS } from '@integration/modules/common/security/outboundHosts';

const PazaramaDescriptor: IntegrationDescriptor = {
    code: integrationCode,
    displayName: 'Pazarama',
    category: 'marketplace',
    status: 'available',
    adapterVersion: '1.0.0',
    protocol: 'rest',
    auth: {
        type: 'oauth2_client_credentials',
        requiredSettings: ['APIKEY', 'APISECRET'],
        tokenLifecycle: 'cached_refresh',
    },
    capabilities: {
        products: {
            level: 'supported',
            methods: ['streamProducts', 'transferProducts', 'updateProduct', 'updateProductVariant', 'updateProductDelivery', 'updateProductStatuses', 'checkBatchProduct'],
            note: 'Ürün aktarımı ve güncelleme toplu işlem akışıyla yapılır.',
            evidence: ['marketplace/pazarama/index.ts transferProducts'],
        },
        stockPrice: {
            level: 'supported',
            methods: ['updateProductStock', 'updateProductPrice'],
            note: 'Stok ve fiyat güncellemeleri pazaryerine iletilir.',
            evidence: ['marketplace/pazarama/index.ts updateProductStock'],
        },
        orders: {
            level: 'supported',
            methods: ['retrieveOrders'],
            note: 'Siparişler çekilir; sipariş durumu, kargo ve fatura bağlantısı güncellenir. Sayfalama doğrulanamadı (INTEGRATIONS_REGISTRY §2.4).',
            evidence: ['marketplace/pazarama/index.ts retrieveOrders'],
        },
        orderActions: {
            level: 'supported',
            methods: ['approveOrder', 'rejectOrder', 'retrieveOrderRejectionReasons'],
            note: 'Sipariş onaylama ("hazırlanıyor" statüsüne geçiş) ve reddetme desteklenir.',
            evidence: ['marketplace/pazarama/index.ts approveOrder'],
        },
        returns: {
            level: 'supported',
            methods: ['retrieveClaims', 'approveClaim', 'rejectClaim'],
            note: 'İade talepleri onaylanır, reddedilir, incelemeye gönderilir veya revize edilir.',
            evidence: ['marketplace/pazarama/index.ts approveClaim'],
        },
        questions: {
            level: 'supported',
            methods: ['retrieveMessages', 'answerMessage'],
            note: 'Müşteri mesajları listelenir ve cevaplanır.',
            evidence: ['marketplace/pazarama/index.ts answerMessage'],
        },
        finance: {
            level: 'limited',
            methods: ['retrieveFinancials', 'retrieveCargoInvoices'],
            note: 'Hakediş görünümü mevcuttur; ödeme emrine göre ayrıntı sorgusu (retrieveSettlementsByPaymentId) bu sürümde yoktur (daima boş dizi).',
            evidence: ['marketplace/pazarama/index.ts retrieveFinancials'],
        },
        shippingNotice: {
            level: 'limited',
            methods: ['sendOrderShipping'],
            note: 'Kargo bilgisi yalnızca siparişin ilk kalemi için iletilir.',
            evidence: ['marketplace/pazarama/index.ts sendOrderShipping'],
        },
        invoiceNotice: {
            level: 'supported',
            methods: ['sendOrderInvoice'],
            note: 'Fatura bağlantısı pazaryerine iletilir.',
            evidence: ['marketplace/pazarama/index.ts sendOrderInvoice'],
        },
        categories: {
            level: 'supported',
            methods: ['retrieveCategories', 'retrieveCategoryAttributes', 'retrieveCategoryAttributeValues', 'retrieveCategoryCommision', 'retrieveBrands'],
            note: 'Kategori, marka ve komisyon bilgisi pazaryerinden alınır.',
            evidence: ['marketplace/pazarama/index.ts retrieveCategories'],
        },
    },
    limitations: [
        'Ödeme emrine göre hakediş ayrıntısı sağlanmıyor.',
        'Kargo bilgisi yalnızca siparişin ilk kalemi için iletilir.',
        'Sipariş çekimi sayfalaması doğrulanamadı; resmi rate limit yayınlanmamış.',
    ],
    rateLimits: {
        // Kaynak: docs/research/2026-09-28-integration-deadlines-scan.md §5 — resmi limit değeri bulunamadı.
        configured: { maxConcurrent: 11, timeoutMs: 30000 },
        verified: false,
    },
    api: {
        hosts: ['isortagim.pazarama.com', 'isortagimapi.pazarama.com', 'isortagimgiris.pazarama.com'],
        docs: [
            { url: 'https://isortagim.pazarama.com/auth/integration', kind: 'reference', official: true, monitor: 'manual', accessNote: 'Giriş arkasında (panel SPA) — manuel turla izlenmeli' },
        ],
        lastVerifiedAt: '2026-09-27',
        verificationRef: 'docs/research/2026-09-27-api-verification.md',
    },
    // ADR-0020 Karar 1.4 (Aşama A) — `hosts` TEK KAYNAK `outboundHosts.ts::ALLOWED_OUTBOUND_HOSTS`'tan İTHAL
    // EDİLİR (çift tanım YOK, bkz. DescriptorConfig yorumu). `retiredEndpoints` bu entegrasyonda yok.
    config: {
        hosts: ALLOWED_OUTBOUND_HOSTS[integrationCode],
    },
    mock: {
        available: true,
        prefix: 'PAZARAMA',
        contractFixtures: [],
    },
    contracts: [],
    verification: { liveApi: false, mockEnvironment: true },
};

export default PazaramaDescriptor;
