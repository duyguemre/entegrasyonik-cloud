// ADR-0018 Aşama A — Ideasoft yetenek manifestosu.
// Kaynaklar: INTEGRATIONS_REGISTRY.md §3.1; site/src/data/integrations.ts (Ideasoft bloğu);
// docs/research/2026-09-28-integration-deadlines-scan.md §6; src/integration/modules/ecommerce/ideasoft/index.ts.
import type { IntegrationDescriptor } from '@integration/catalog/types';
import { integrationCode } from './constants';
import { ALLOWED_OUTBOUND_HOSTS } from '@integration/modules/common/security/outboundHosts';

const IdeasoftDescriptor: IntegrationDescriptor = {
    code: integrationCode,
    displayName: 'Ideasoft',
    category: 'ecommerce',
    status: 'limited',
    adapterVersion: '1.0.0',
    protocol: 'rest',
    auth: {
        type: 'oauth2_authorization_code',
        requiredSettings: ['storeName', 'key', 'secret'],
        tokenLifecycle: 'user_consent',
    },
    capabilities: {
        products: {
            level: 'limited',
            methods: ['streamProducts', 'transferProducts', 'updateProduct', 'updateProductVariant', 'updateProductDelivery', 'updateProductStatuses', 'checkBatchProduct'],
            note: 'Ürün oluşturma, fiyat/stok/içerik güncelleme çalışır; ama gerçek modda OAuth token akışı KOPUK (aşağıdaki limitations), bu yüzden coverage=limited.',
            evidence: ['ecommerce/ideasoft/index.ts transferProducts'],
        },
        stockPrice: {
            level: 'limited',
            methods: ['updateProductStock', 'updateProductPrice'],
            note: 'Stok ve fiyat güncellemeleri mağazaya iletilir (gerçek modda token akışı kopukluğu geçerli).',
            evidence: ['ecommerce/ideasoft/index.ts updateProductStock'],
        },
        orders: {
            level: 'limited',
            methods: ['retrieveOrders'],
            note: 'Siparişler sayfalı olarak çekilir.',
            evidence: ['ecommerce/ideasoft/index.ts retrieveOrders'],
        },
        orderActions: {
            level: 'limited',
            methods: ['approveOrder', 'rejectOrder'],
            note: 'Sipariş hazırlanıyor, iptal ve kargolandı durumları güncellenir.',
            evidence: ['ecommerce/ideasoft/index.ts approveOrder'],
        },
        shippingNotice: {
            level: 'limited',
            methods: ['sendOrderShipping'],
            note: 'Kargolandı durumu ve takip numarası mağazaya iletilir.',
            evidence: ['ecommerce/ideasoft/index.ts sendOrderShipping'],
        },
        // invoiceNotice BİLİNÇLİ olarak not_supported: sendOrderInvoice gerçek bir çağrı yapmadan
        // IntegrationError('NOT_SUPPORTED') fırlatır (ADR-0006 Karar 2, BACKLOG C9 sahte başarı düzeltmesi:
        // ÖNCEKİ davranış {success:true} no-op idi).
        invoiceNotice: {
            level: 'not_supported',
            methods: ['sendOrderInvoice'],
            note: 'Ideasoft sipariş faturası bildirimi henüz gerçek olarak uygulanmadı; NOT_SUPPORTED fırlatır.',
            evidence: ['ecommerce/ideasoft/services/OrderService.ts sendOrderInvoice'],
        },
        categories: {
            level: 'limited',
            methods: ['retrieveCategories', 'retrieveCategoryAttributes', 'retrieveCategoryAttributeValues', 'retrieveCategoryCommision', 'retrieveBrands'],
            note: 'Kategori ve marka bilgisi mağazadan alınır.',
            evidence: ['ecommerce/ideasoft/index.ts retrieveBrands'],
        },
    },
    limitations: [
        'Gerçek mağaza bağlantısında yetkilendirme (OAuth) adımı bu sürümde tamamlanmamıştır; entegrasyon şu an test/mock ortamında çalışır (BACKLOG C10).',
        'İade yönetimi sağlanmıyor.',
        'Mesaj (soru-cevap) yönetimi sağlanmıyor.',
        'Finans görünümü sağlanmıyor.',
        'Fatura bilgisi bildirimi desteklenmiyor.',
    ],
    rateLimits: {
        // ResilientHttpClient politikası ile eşitlik: ecommerce/ideasoft/services/Service.ts (ratePerMin:300, timeoutMs env||30000).
        configured: { ratePerMin: 300, timeoutMs: 30000 },
        verified: false,
    },
    api: {
        hosts: ['*.ideasoft.com.tr', '*.myideasoft.com'],
        docs: [
            { url: 'https://my.ideasoft.com.tr/versiyonlar', kind: 'changelog', official: true, monitor: 'auto' },
            { url: 'https://apidoc.ideasoft.dev/', kind: 'reference', official: true, monitor: 'manual', accessNote: 'Stoplight SPA — JS ile render ediliyor, WebFetch içerik okuyamadı' },
            { url: 'https://www.ideasoft.com.tr/yardim/api-kullanimi/', kind: 'reference', official: true, monitor: 'auto' },
        ],
        lastVerifiedAt: '2026-09-28',
        verificationRef: 'docs/research/2026-09-28-integration-deadlines-scan.md',
    },
    // ADR-0020 Karar 1.4 (Aşama A) — `hosts` TEK KAYNAK `outboundHosts.ts::ALLOWED_OUTBOUND_HOSTS`'tan İTHAL
    // EDİLİR (çift tanım YOK, bkz. DescriptorConfig yorumu; joker `*.ideasoft.com.tr`/`*.myideasoft.com` AYNEN
    // taşındı). `retiredEndpoints` bu entegrasyonda yok.
    config: {
        hosts: ALLOWED_OUTBOUND_HOSTS[integrationCode],
    },
    mock: {
        available: true,
        prefix: 'IDEASOFT',
        contractFixtures: [],
    },
    contracts: [],
    // C10 kapanana kadar probe kapalı (ADR-0018 kategori belgesi §8): token akışı kopuk.
    verification: { liveApi: false, mockEnvironment: true },
};

export default IdeasoftDescriptor;
