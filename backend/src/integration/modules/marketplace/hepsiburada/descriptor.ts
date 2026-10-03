// ADR-0018 Aşama A — Hepsiburada yetenek manifestosu.
// Kaynaklar: INTEGRATIONS_REGISTRY.md §2.2; site/src/data/integrations.ts (Hepsiburada bloğu);
// docs/research/2026-09-28-integration-deadlines-scan.md §4; src/integration/modules/marketplace/hepsiburada/index.ts.
import type { IntegrationDescriptor } from '@integration/catalog/types';
import { integrationCode } from './constants';
import { ALLOWED_OUTBOUND_HOSTS } from '@integration/modules/common/security/outboundHosts';

const HepsiburadaDescriptor: IntegrationDescriptor = {
    code: integrationCode,
    displayName: 'Hepsiburada',
    category: 'marketplace',
    status: 'available',
    adapterVersion: '1.0.0',
    protocol: 'rest',
    auth: {
        type: 'basic',
        requiredSettings: ['APISECRET', 'APIKEY', 'SELLERID'],
        tokenLifecycle: 'none',
    },
    capabilities: {
        products: {
            level: 'supported',
            methods: ['streamProducts', 'transferProducts', 'updateProduct', 'updateProductStatuses', 'checkBatchProduct'],
            note: 'Ürün aktarımı, içerik güncelleme ve toplu işlem durumu sorgulama. Varyant/teslimat güncelleme (updateProductVariant/updateProductDelivery) NOT_SUPPORTED fırlatır (kategorinin ayrı bir metodu, görünür sınır olarak limitations\'ta).',
            evidence: ['marketplace/hepsiburada/index.ts transferProducts'],
        },
        stockPrice: {
            level: 'supported',
            methods: ['updateProductStock', 'updateProductPrice'],
            note: 'Stok ve fiyat güncellemeleri pazaryerine iletilir.',
            evidence: ['marketplace/hepsiburada/index.ts updateProductStock'],
        },
        orders: {
            level: 'supported',
            methods: ['retrieveOrders'],
            note: 'Sipariş çekimi sayfalıdır (offset+limit, sayfa başına 100; tavan 50 sayfa / 5.000 kayıt). Tavan aşılırsa sessiz kesilmez: sonuç incomplete işaretlenir ve son başarılı senkron zamanı ilerlemez. Kimliksiz kayıt atlanır; tamamı kimliksizse VALIDATION (şema kayması).',
            evidence: ['marketplace/hepsiburada/index.ts retrieveOrders'],
        },
        orderActions: {
            level: 'supported',
            methods: ['approveOrder', 'rejectOrder', 'retrieveOrderRejectionReasons'],
            note: 'Sipariş reddetme ve paket oluşturma desteklenir.',
            evidence: ['marketplace/hepsiburada/index.ts rejectOrder'],
        },
        returns: {
            level: 'supported',
            methods: ['retrieveClaims', 'approveClaim', 'rejectClaim'],
            note: 'İade talepleri listelenir, onaylanır veya reddedilir.',
            evidence: ['marketplace/hepsiburada/index.ts approveClaim'],
        },
        questions: {
            level: 'limited',
            methods: ['retrieveMessages', 'answerMessage'],
            note: 'Soru servisi mevcuttur; kapsamı bu sürümde sınırlıdır (sayfalama/filtre doğrulanmadı).',
            evidence: ['marketplace/hepsiburada/index.ts retrieveMessages'],
        },
        finance: {
            level: 'limited',
            methods: ['retrieveFinancials'],
            note: 'Hakediş görünümü kısmidir; kargo faturası ve ödeme emri sorgusu döner ama daima boş dizi (retrieveCargoInvoices/retrieveSettlementsByPaymentId).',
            evidence: ['marketplace/hepsiburada/index.ts retrieveFinancials'],
        },
        categories: {
            level: 'supported',
            methods: ['retrieveCategories', 'retrieveCategoryAttributes', 'retrieveCategoryAttributeValues'],
            note: 'Kategori ağacı, nitelik ve nitelik değerleri pazaryerinden alınır. Marka ve komisyon bilgisi sağlanmaz (boş döner).',
            evidence: ['marketplace/hepsiburada/index.ts retrieveCategories'],
        },
        shippingNotice: {
            level: 'limited',
            methods: ['sendOrderShipping'],
            note: 'Paket oluşturulur; takip bilgisinin pazaryerine iletimi bu sürümde doğrulanmamıştır.',
            evidence: ['marketplace/hepsiburada/index.ts sendOrderShipping'],
        },
        invoiceNotice: {
            level: 'supported',
            methods: ['sendOrderInvoice'],
            note: 'Fatura bağlantısı pazaryerine iletilir.',
            evidence: ['marketplace/hepsiburada/index.ts sendOrderInvoice'],
        },
    },
    limitations: [
        'Varyant güncelleme desteklenmiyor (NOT_SUPPORTED).',
        'Teslimat güncelleme desteklenmiyor (NOT_SUPPORTED).',
        'Kargo faturası ve komisyon bilgisi sağlanmıyor.',
        'Sipariş/iade çekiminde tavan 5.000 kayıttır (aşılırsa incomplete işaretlenir).',
    ],
    rateLimits: {
        documented: {
            perSecond: 1000,
            source: 'docs/research/2026-09-28-integration-deadlines-scan.md §4 (arama özeti, doğrulanamadı — developers.hepsiburada.com 403 döndü)',
        },
        // ResilientHttpClient politikası ile eşitlik: Service.ts (maxConcurrent:5, timeoutMs env||60000, ratePerMin verilmedi).
        configured: { maxConcurrent: 5, timeoutMs: 60000 },
        verified: false,
    },
    api: {
        hosts: ['mpop.hepsiburada.com', 'listing-external.hepsiburada.com', 'accounting-external.hepsiburada.com', 'ticket-api.hepsiburada.com', 'oms-external.hepsiburada.com'],
        docs: [
            { url: 'https://developers.hepsiburada.com/hepsiburada/changelog', kind: 'changelog', official: true, monitor: 'manual', accessNote: 'WebFetch 403 (bot koruması) — otomatik izlenemedi, manuel turla doğrulanmalı' },
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
        prefix: 'HEPSIBURADA',
        contractFixtures: [],
    },
    contracts: [],
    verification: { liveApi: false, mockEnvironment: true },
};

export default HepsiburadaDescriptor;
