// Entegrasyon (pazaryeri/e-ticaret/ERP/kargo) yapılandırma + iş (export/import job) yetenekleri.
// NOT: `stock.policy.*`/`brands.integration_mapping.save`/`products.platform_ready.set` (IntegrationService RPC'leri)
// iş alanı olarak `catalog`'a bağlıdır (bkz. domains/catalog.ts) — "Yetenek ≠ RPC operasyonu", domain iş odaklıdır.
import { z } from 'zod';
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens, onShell, noUi } from '../define';
import { toIso } from '../derive/pii';

const MP = 'integrations/MarketplaceView';
const EC = 'integrations/ECommerceView';
const SHIP = 'integrations/ShippingView';
const ERP = 'integrations/ErpView';
const ALL_SETTINGS = [MP, EC, SHIP, ERP];
const LOGS = 'LogListView';

const CRED_READ = (which: string) => nx('credential' as const, `${which} entegrasyon ayarlarını (kimlik bilgisi/token dahil) döndürür; sır LLM kanalına girmez (ADR-0019 §4.2, OPERATION_POLICY.md C12).`);
const CRED_WRITE = (which: string) => nx('credential' as const, `${which} entegrasyon kimlik bilgisi/yapılandırma YAZAR; sır LLM kanalından geçemez (MCP form elicitation'da sır yasak).`);

export const INTEGRATIONS_CAPABILITIES = [
    c({
        id: 'integrations.catalog.list', domain: 'integrations', summary: { tr: 'Kayıtlı entegrasyonları (platform kataloğu) getir', en: 'List registered integrations (platform catalog)' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/get' }, { rpc: 'IntegrationService/integrationTypes' }],
        ui: onShell('init'), mcp: deferred('later', 'Platform entegrasyon kataloğu (initApp); düşük öncelik, toolset genişlemesinde (integrations) değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.client.list', domain: 'integrations', summary: { tr: "Mağazanın kurulu entegrasyonlarını getir", en: "Get the tenant's configured integrations" },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/getClientIntegrations' }],
        ui: onShell('init'), mcp: deferred('later', 'Tenant entegrasyon durumu (initApp); toolset genişlemesinde (integrations) değerlendirilir.'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: yanıt tüm entegrasyon belgesini projeksiyonsuz döner (C12); maskeleme gerekebilir.',
    }),
    c({
        id: 'integrations.platform_info.get', domain: 'integrations', summary: { tr: 'Platform bilgisi (komisyon, kategori, marka, özellik) çek', en: 'Fetch platform info (commission, category, brand, attribute)' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', external: true, bindings: [
            { rpc: 'IntegrationService/retrievePlatformInfos' }, { rpc: 'IntegrationService/retrieveCommisionForCategoryFromIntegration' },
            { rpc: 'IntegrationService/retrieveCategoriesFromIntegration' }, { rpc: 'IntegrationService/retrieveBrandsFromIntegration' },
            { rpc: 'IntegrationService/retrieveCategoryAttributesFromIntegration' }, { rpc: 'IntegrationService/retrieveCategoryAttributeValuesFromIntegration' },
        ],
        ui: onScreens(...ALL_SETTINGS), mcp: deferred('later', 'Pazaryerinden canlı kategori/marka/özellik/komisyon çekme; eşleme akışının parçası, toolset genişlemesinde değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.marketplace.settings.get', domain: 'integrations', summary: { tr: 'Pazaryeri ayarlarını getir', en: 'Get marketplace settings' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/retrieveClientMarketplaceSettings' }],
        ui: onScreens(MP), mcp: CRED_READ('Pazaryeri'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: kimlik bilgisi AÇIK döner (ecommerce\'te maskeli, bunda değil; BACKLOG C12).',
    }),
    c({
        id: 'integrations.marketplace.settings.save', domain: 'integrations', summary: { tr: 'Pazaryeri ayarlarını kaydet', en: 'Save marketplace settings' },
        effect: 'write', minTier: 'admin', permission: 'integrations:manage', bindings: [{ rpc: 'IntegrationService/saveClientMarketplaceSettings' }],
        ui: onScreens([MP, 'save']), mcp: CRED_WRITE('Pazaryeri'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.marketplace.sort', domain: 'integrations', summary: { tr: 'Pazaryeri sıralamasını değiştir', en: 'Reorder marketplaces' },
        effect: 'write', minTier: 'member', permission: 'integrations:sync', bindings: [{ rpc: 'IntegrationService/sortClientMarketplaces' }],
        ui: onScreens(MP), mcp: nx('ui_plumbing', 'Görünüm tercihi (sıralama); kullanıcının işi değil, ekran iç düzeni.'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: tenant yapılandırması sayılırsa admin olabilir.',
    }),
    // NOT: 'IntegrationService/retrieveProductsFromClientMarketplace' (MarketplaceView.vue'nun FE çağrısı) BİLİNÇLİ
    // OLARAK kayıtsız: FE_CALLS_WITHOUT_BACKEND'de (gerçek servis metodu YOK, bugün de çalışmıyor). Ölü RPC'ye
    // yetenek bağı açılmaz (P1: her bağ gerçek bir servis metodu).
    c({
        id: 'integrations.ecommerce.settings.get', domain: 'integrations', summary: { tr: 'E-ticaret entegrasyon ayarlarını getir', en: 'Get e-commerce integration settings' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/retrieveClientECommerceSettings' }],
        ui: onScreens(EC), mcp: CRED_READ('E-ticaret'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.ecommerce.settings.save', domain: 'integrations', summary: { tr: 'E-ticaret entegrasyon ayarlarını kaydet', en: 'Save e-commerce integration settings' },
        effect: 'write', minTier: 'admin', permission: 'integrations:manage', bindings: [{ rpc: 'IntegrationService/saveClientECommerceSettings' }],
        ui: onScreens([EC, 'save']), mcp: CRED_WRITE('E-ticaret'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.ecommerce.token.exchange', domain: 'integrations', summary: { tr: 'Harici (OAuth) token alıp kaydet', en: 'Exchange and store an external (OAuth) token' },
        effect: 'write', minTier: 'admin', permission: 'integrations:manage', external: true, bindings: [{ rpc: 'IntegrationService/retrieveAndSetExternalToken' }],
        ui: onScreens([EC, 'oauthCallback']), mcp: nx('credential', 'OAuth token değişimi/kaydı; sır LLM kanalına giremez, yalnız ekranda (yönlendirme akışı).'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.erp.settings.get', domain: 'integrations', summary: { tr: 'ERP entegrasyon ayarlarını getir', en: 'Get ERP integration settings' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/retrieveClientErpSettings' }],
        ui: onScreens(ERP), mcp: CRED_READ('ERP'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: kimlik bilgisi AÇIK döner (BACKLOG C12).',
    }),
    c({
        id: 'integrations.erp.settings.save', domain: 'integrations', summary: { tr: 'ERP entegrasyon ayarlarını kaydet', en: 'Save ERP integration settings' },
        effect: 'write', minTier: 'admin', permission: 'integrations:manage', bindings: [{ rpc: 'IntegrationService/saveClientErpSettings' }],
        ui: onScreens([ERP, 'save']), mcp: CRED_WRITE('ERP'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.shipment.settings.get', domain: 'integrations', summary: { tr: 'Kargo entegrasyon ayarlarını getir', en: 'Get shipment integration settings' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/retrieveClientShipmentSettings' }],
        ui: onScreens(SHIP), mcp: CRED_READ('Kargo'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: kimlik bilgisi AÇIK döner (BACKLOG C12).',
    }),
    c({
        id: 'integrations.shipment.settings.save', domain: 'integrations', summary: { tr: 'Kargo entegrasyon ayarlarını kaydet', en: 'Save shipment integration settings' },
        effect: 'write', minTier: 'admin', permission: 'integrations:manage', bindings: [{ rpc: 'IntegrationService/saveClientShipmentSettings' }],
        ui: onScreens([SHIP, 'save']), mcp: CRED_WRITE('Kargo'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.webhook_token.generate', domain: 'integrations', summary: { tr: 'Webhook token üret/rotasyon yap', en: 'Generate/rotate a webhook token' },
        effect: 'write', minTier: 'admin', permission: 'integrations:manage', bindings: [{ rpc: 'IntegrationService/generateWebhookToken' }],
        ui: noUi('Backend-only: webhook kurulum ekranı Faz 2/3 (ADR-0005 Karar 8; BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('credential', 'Webhook sırrı (token) üretir/döndürür; sır LLM kanalına giremez.'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.catalog.manifest.get', domain: 'integrations', summary: { tr: 'Entegrasyon yetenek manifestosunu (kapsam rozetleri) getir', en: 'Get the integration capability manifest (scope badges)' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/getCatalog' }],
        ui: noUi('Backend-only: FE kapsam rozeti ekranı ADR-0018 Aşama A\'da (bu görev) yazılmadı; uç hazır, FE bağlanması ayrı görev (ADR-0015 sonrası, bkz. API_TENANT_SURFACE deseni).'),
        mcp: deferred('later', 'Statik yetenek manifestosu (ADR-0018); sır/PII yok, düşük öncelik, toolset genişlemesinde (integrations) değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.health.get', version: '1.1', domain: 'integrations', summary: { tr: 'Kendi tenant\'ının entegrasyon sağlığını getir', en: "Get the tenant's own integration health" },
        effect: 'read', minTier: 'admin', permission: 'integrations:manage', pii: 'none',
        input: z.object({}).strict(),
        output: z.object({
            generatedAt: z.string().nullable(),
            integrations: z.array(z.object({
                code: z.string(), type: z.string().nullable(), enabled: z.boolean(),
                health: z.enum(['not_configured', 'no_data', 'healthy', 'degraded', 'down']),
                credentialsConfigured: z.boolean().nullable(), lastSuccessfulSyncAt: z.string().nullable(),
                circuit: z.enum(['closed', 'open', 'half_open']).nullable(),
                calls24h: z.number().int(), errors24h: z.number().int(), lastErrorCode: z.string().nullable(),
            })),
        }),
        bindings: [{ rpc: 'IntegrationService/getIntegrationHealth' }],
        project: (raw: any) => ({
            generatedAt: toIso(raw?.generatedAt),
            integrations: (Array.isArray(raw?.integrations) ? raw.integrations : []).map((x: any) => ({
                code: String(x?.integrationCode ?? ''), type: typeof x?.type === 'string' ? x.type : null, enabled: x?.enabled !== false,
                health: x?.health, credentialsConfigured: typeof x?.credentialsConfigured === 'boolean' ? x.credentialsConfigured : null,
                lastSuccessfulSyncAt: toIso(x?.lastSuccessfulSyncAt), circuit: x?.circuit?.state ?? null,
                calls24h: Number(x?.last24h?.total) || 0, errors24h: Number(x?.last24h?.error) || 0,
                lastErrorCode: typeof x?.lastError?.code === 'string' ? x.lastError.code : null,
            })),
        }),
        ui: noUi('Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE; API_TENANT_SURFACE §3).'),
        mcp: { exposed: { toolset: 'core', confirm: 'none', present: 'status', deepLink: { screen: MP } } },
        llm: {
            description: 'Returns the health of each of the tenant\'s connected integrations (marketplaces, e-commerce, ERP, shipping): overall status, whether credentials '
                + 'are configured, last successful sync time, circuit-breaker state, and call/error counts for the last 24 hours with the last error code. '
                + 'Use it to explain why orders or stock are not syncing. No secrets or raw error messages are returned. Read-only; admin-level permission required.',
            examples: ['Entegrasyonlarım sağlıklı mı?', 'Trendyol neden senkronize olmuyor?', 'Son 24 saatte hangi entegrasyon hata veriyor?'],
        },
        agent: NO_AGENT,
    }),
    c({
        id: 'integrations.connection.test', domain: 'integrations', summary: { tr: 'Entegrasyon bağlantısını test et (kimlik/erişim doğrulaması)', en: 'Test an integration connection (credential/reachability check)' },
        effect: 'read', minTier: 'admin', permission: 'integrations:manage', external: true, bindings: [{ rpc: 'IntegrationService/testConnection' }],
        ui: noUi('Backend-only: FE "Bağlantıyı test et" düğmesi bulut önyüz oturumunda eklenecek (docs/API_TENANT_SURFACE.md §Bağlantı testi).'),
        mcp: deferred('later', 'Yan etkisiz bağlantı doğrulaması (dakikada 3/tenant+entegrasyon); sır dönmez. Toolset genişlemesinde (integrations) değerlendirilir.'), agent: NO_AGENT,
    }),
    // NOT: 'IntegrationService/checkProductStatus' (ProductListView.vue/BizimhesapComponent.vue'nun FE çağrısı)
    // BİLİNÇLİ OLARAK kayıtsız: FE_CALLS_WITHOUT_BACKEND'de (gerçek servis metodu YOK). Ölü RPC'ye yetenek bağı açılmaz.
    c({
        id: 'integrations.export.jobs.list', domain: 'integrations', summary: { tr: 'Dışa aktarma işlerini listele/ara', en: 'List/search export jobs' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/getExportJobs' }, { rpc: 'IntegrationService/advancedSearchExportJobs' }],
        ui: onScreens(LOGS), mcp: deferred('later', 'Dışa aktarma iş günlüğü; işlemsel bilgi, toolset genişlemesinde (integrations) değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.export.jobs.detail', domain: 'integrations', summary: { tr: 'Dışa aktarma işi ayrıntısını getir', en: 'Get export job detail' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/getExportJobDetail' }],
        ui: onScreens(LOGS), mcp: deferred('later', 'Dışa aktarma iş ayrıntısı; toolset genişlemesinde (integrations) değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.import.jobs.list', domain: 'integrations', summary: { tr: 'İçe aktarma işlerini listele/arşivle', en: 'List/archive import jobs' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/getImportJobs' }, { rpc: 'IntegrationService/archiveImportJobs' }],
        ui: onScreens(LOGS), mcp: deferred('later', 'İçe aktarma iş günlüğü; işlemsel bilgi, toolset genişlemesinde (integrations) değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'integrations.import.jobs.detail', domain: 'integrations', summary: { tr: 'İçe aktarma işi ayrıntısını/raporunu getir', en: 'Get import job detail/report' },
        effect: 'read', minTier: 'member', permission: 'integrations:read', bindings: [{ rpc: 'IntegrationService/getImportJobByJobId' }, { rpc: 'IntegrationService/getJobReport' }],
        ui: onScreens(LOGS), mcp: deferred('later', 'İçe aktarma iş ayrıntısı/raporu; toolset genişlemesinde (integrations) değerlendirilir.'), agent: NO_AGENT,
    }),
    // NOT: 'IntegrationService/processPlatformProduct' (ProductListView.vue'nun FE çağrısı) BİLİNÇLİ OLARAK bağa
    // DAHİL EDİLMEDİ: FE_CALLS_WITHOUT_BACKEND'de (gerçek servis metodu YOK). Ölü RPC'ye yetenek bağı açılmaz.
    c({
        id: 'integrations.batch.dispatch', domain: 'integrations', summary: { tr: 'Ürünleri platforma toplu gönder / durum sorgula', en: 'Batch-dispatch products to platform / query status' },
        effect: 'write', minTier: 'member', permission: 'integrations:sync', external: true, bindings: [{ rpc: 'IntegrationService/batchCreator' }, { rpc: 'IntegrationService/requestFetchFromPlatform' }],
        ui: onScreens('productDefinitions/ProductListView'),
        mcp: deferred('later', 'Toplu yayın/senkron tetikleme (dış yan etkili); onay akışı (Aşama D) olmadan açılmaz.'), agent: NO_AGENT,
    }),
];
