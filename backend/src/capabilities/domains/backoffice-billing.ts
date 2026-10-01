// Backoffice Aşama 4 (plan §2.2 B2 + §2.3 B4): abonelik yönetimi + gelir metrikleri + tenant yaşam döngüsü (yalnız `/admin-api`; `minTier:'platformAdmin'`).
// Yazmalar step-up + gerekçe ister (`admin/stepUp.ts REAUTH_RPCS`). Sağlayıcıya giden işlemler (iptal/plan değişikliği) `external:true` -> LIVE_READONLY guard reddeder.
import { defineCapability as c, nx, NO_AGENT, noUi } from '../define';
import { PLATFORM_ONLY } from '../permissions';

const PA = nx('platform_admin', 'Süper yönetici (platformAdmin) yeteneği; OAuth token\'ında ga bulunmadığı için MCP\'den çağrılamaz (ADR-0010).');
const UI = noUi('Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.');

export const BACKOFFICE_BILLING_CAPABILITIES = [
    c({
        id: 'platform.subscriptions.list', domain: 'platform', summary: { tr: 'Platform geneli abonelikleri listele (durum/plan filtresi, imleç sayfalama)', en: 'List subscriptions platform-wide (status/plan filter, cursor paging)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeBillingService/listSubscriptions' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.subscriptions.get', domain: 'platform', summary: { tr: 'Bir tenant aboneliği + plan + ödeme olayı geçmişi', en: 'A tenant subscription with plan and billing event history' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeBillingService/getSubscription' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.subscriptions.extend_trial', domain: 'platform', summary: { tr: 'Süren denemeyi uzat (<=30 gün; step-up + gerekçe)', en: 'Extend a running trial (<=30 days; step-up + reason)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeBillingService/extendTrial' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.subscriptions.cancel', domain: 'platform', summary: { tr: 'Aboneliği sağlayıcı üzerinden iptal et (dönem sonu ya da hemen; step-up + gerekçe)', en: 'Cancel a subscription via the provider (at period end or now; step-up + reason)' },
        effect: 'destructive', minTier: 'platformAdmin', permission: PLATFORM_ONLY, external: true, bindings: [{ rpc: 'BackofficeBillingService/cancelSubscription' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.subscriptions.change_plan', domain: 'platform', summary: { tr: 'Abonelik planını sağlayıcı üzerinden değiştir (step-up + gerekçe)', en: 'Change the subscription plan via the provider (step-up + reason)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, external: true, bindings: [{ rpc: 'BackofficeBillingService/changePlan' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.revenue.metrics', domain: 'platform', summary: { tr: 'Gelir metrikleri: MRR, durum dağılımı, deneme dönüşümü, kayıp', en: 'Revenue metrics: MRR, status distribution, trial conversion, churn' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeBillingService/getRevenueMetrics' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    // PRC-CFG (K57-S5): rekabet modülü ayarları. Plan varsayılanı/bütçe `_platform` kataloğunda (IntegrationConfigService ile yayın).
    c({
        id: 'platform.competition.settings', domain: 'platform', summary: { tr: 'Rekabet modülü ayarları: plan varsayılanları, kanal bütçesi, tenant istisnaları', en: 'Competition module settings: plan defaults, channel budget, tenant overrides' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY,
        bindings: [{ rpc: 'BackofficeBillingService/getCompetitionSettings' }, { rpc: 'BackofficeBillingService/getTenantCompetition' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.competition.override.set', domain: 'platform', summary: { tr: 'Tenant için rekabet ayarı istisnası yaz/kaldır (SKU tavanı, tazeleme, tazelik, öncelik; gerekçe)', en: 'Set/clear a tenant competition override (SKU cap, refresh, freshness, priority; reason)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeBillingService/setCompetitionOverride' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.tenant.lifecycle', domain: 'platform', summary: { tr: 'Tenant yaşam döngüsü: durum, deneme, silme talebi, provisioning adımları, son etkinlik', en: 'Tenant lifecycle: status, trial, deletion request, provisioning steps, recent activity' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeTenantService/getLifecycle' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.tenant.deletion.cancel_backoffice', domain: 'platform', summary: { tr: 'Bekleme süresindeki tenant silme talebini geri al (backoffice; step-up + gerekçe)', en: 'Cancel a pending tenant deletion (backoffice; step-up + reason)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeTenantService/cancelDeletion' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
];
