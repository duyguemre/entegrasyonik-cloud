// K51 (BO1) yetenekleri: yönlendiren dashboard (getAttention/getPulse), müşteri operasyon özeti (BE-01/02), kayıtlı görünümler (BE-05). Yalnız `/admin-api` (`minTier:'platformAdmin'`).
// Hepsi MCP/agent'a kapalı (platform_admin). Toplu yeniden deneme (BE-03) `backoffice-engine.ts`'te; sorun grubu süzgeci (BE-06) mevcut `platform.logs.issue_groups` bağında.
import { defineCapability as c, nx, NO_AGENT, noUi } from '../define';
import { PLATFORM_ONLY } from '../permissions';

const PA = nx('platform_admin', 'Süper yönetici (platformAdmin) yeteneği; OAuth token\'ında ga bulunmadığı için MCP\'den çağrılamaz (ADR-0010).');
const UI = noUi('Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.');

export const BACKOFFICE_ATTENTION_CAPABILITIES = [
    c({
        id: 'platform.overview.attention', domain: 'platform', summary: { tr: 'Dikkat gerektirenler: sistem + müşteriler, öncelik sıralı, önerilen eylemlerle', en: 'Items needing attention: system + customers, priority-ordered, with suggested actions' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeOverviewService/getAttention' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.overview.pulse', domain: 'platform', summary: { tr: 'Büyük resim kullanım özeti (aktif müşteri, sipariş/çağrı hacmi, hata oranı trendi, MRR)', en: 'Big-picture usage summary (active tenants, order/call volume, error-rate trend, MRR)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeOverviewService/getPulse' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.tenants.list', domain: 'platform', summary: { tr: 'Müşteri listesi + operasyon özeti (plan, abonelik, açık sorun, başarısız iş, son hata)', en: 'Tenant list + operations summary (plan, subscription, open issues, failed jobs, last error)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeTenantService/listTenants' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.tenants.health_summary', domain: 'platform', summary: { tr: 'Müşteri sağlık özeti (açık sorunlar, başarısız iş sayaçları, son senkron, uyarılar; iş verisi yok)', en: 'Tenant health summary (open issues, failed-job counters, last sync, alerts; no business data)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeTenantService/getHealthSummary' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.prefs.list_views', domain: 'platform', summary: { tr: 'Yöneticinin kayıtlı görünümlerini listele', en: 'List the saved views of the calling admin' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficePrefsService/listViews' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.prefs.save_view', domain: 'platform', summary: { tr: 'Kayıtlı görünüm kaydet/güncelle (yönetici başına ≤ 20)', en: 'Save/update a saved view (≤ 20 per admin)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficePrefsService/saveView' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.prefs.delete_view', domain: 'platform', summary: { tr: 'Kayıtlı görünümü sil (yalnız kendi kaydı)', en: 'Delete a saved view (own records only)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficePrefsService/deleteView' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
];
