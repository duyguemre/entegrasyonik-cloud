// ADR-0018 Aşama A — Bizimhesap yetenek manifestosu.
// Kaynaklar: INTEGRATIONS_REGISTRY.md §4.1; site/src/data/integrations.ts (Bizimhesap bloğu);
// docs/research/2026-09-28-integration-deadlines-scan.md §7; src/integration/modules/erp/bizimhesap/index.ts.
import type { IntegrationDescriptor } from '@integration/catalog/types';
import { integrationCode } from './constants';
import { ALLOWED_OUTBOUND_HOSTS } from '@integration/modules/common/security/outboundHosts';

const BizimhesapDescriptor: IntegrationDescriptor = {
    code: integrationCode,
    displayName: 'Bizimhesap',
    category: 'erp',
    status: 'limited',
    adapterVersion: '1.0.0',
    protocol: 'rest',
    auth: {
        type: 'api_key_header',
        requiredSettings: ['secret'], // [WP4 D-BH-1] Key+Token aynı API anahtarı
        tokenLifecycle: 'none',
    },
    brandMapping: 'none', // [eslesme-fiyat WP2, K-C]
    capabilities: {
        // ERP kaynak (yalnız okuma): streamProducts çalışır; transferProducts/updateProduct*/updateProductStock/Price
        // hepsi `productService.notSupported(op)` üzerinden IntegrationError('NOT_SUPPORTED') fırlatır. Tek bir yeteneği
        // (`products`) hem çalışan okuma hem NOT_SUPPORTED yazma metotları paylaştığı için düzey `limited` seçildi
        // (kategori belgesi §4 "İlk doldurma kuralı" — örtük sınırlar limited+note ile yazılır).
        products: {
            level: 'limited',
            methods: ['streamProducts'],
            note: 'Ürünler ERP kaynağından yalnızca okunur (streamProducts); yazma metotları (transferProducts/updateProduct/updateProductVariant/updateProductDelivery/updateProductStock/updateProductPrice) NOT_SUPPORTED fırlatır.',
            evidence: ['erp/bizimhesap/index.ts streamProducts', 'erp/bizimhesap/services/ProductService.ts notSupported'],
        },
        orders: {
            level: 'limited',
            methods: ['retrieveOrders'],
            note: 'Bizimhesap resmî API\'sinde sipariş listeleme ucu yok; sipariş okuma yalnız tenant ayarında sipariş listesi adresi tanımlıysa yapılır, aksi halde NOT_SUPPORTED. Sipariş üreticisi (OrderQueueProducer.ts) ERP tipini taramaz (otomatik zamanlanmış çekim yok).',
            evidence: ['erp/bizimhesap/index.ts retrieveOrders'],
        },
        categories: {
            level: 'limited',
            methods: ['retrieveCategories', 'retrieveCategoryAttributes', 'retrieveCategoryAttributeValues', 'retrieveCategoryCommision', 'retrieveBrands'],
            note: 'Kategori ve marka bilgisi ürün kataloğundan türetilir (Bizimhesap\'ın kendi kategori API\'si değil).',
            evidence: ['erp/bizimhesap/index.ts retrieveCategories'],
        },
    },
    limitations: [
        'Yalnızca okuma: Bizimhesap tarafına ürün, stok veya fatura yazılmaz.',
        'Sipariş okuma otomatik zamanlanmış çekime dahil değildir (OrderQueueProducer erp tipini taramıyor).',
        'İade, mesaj ve finans görünümü sağlanmıyor.',
        'Fatura oluşturma desteklenmiyor.',
        'Resmi dokümantasyonda sipariş LİSTELEME (okuma) uç noktası görünmüyor; yalnızca "Sipariş/Fatura Ekleme" (yazma) dokümante — adaptörün sipariş okuma davranışı mock\'a dayanıyor olabilir (BACKLOG P1 doğruluk riski).',
    ],
    rateLimits: {
        // ResilientHttpClient politikası ile eşitlik: erp/bizimhesap/services/Service.ts (ratePerMin:300, timeoutMs env||30000).
        configured: { ratePerMin: 300, timeoutMs: 30000 },
        verified: false,
    },
    api: {
        hosts: ['api.bizimhesap.com', 'bizimhesap.com'],
        docs: [
            { url: 'https://apidocs.bizimhesap.com/', kind: 'reference', official: true, monitor: 'auto' },
            { url: 'https://apidocs.bizimhesap.com/llms.txt', kind: 'reference', official: true, monitor: 'auto' },
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
        prefix: 'BIZIMHESAP',
        contractFixtures: [],
    },
    contracts: [],
    verification: { liveApi: false, mockEnvironment: true },
};

export default BizimhesapDescriptor;
