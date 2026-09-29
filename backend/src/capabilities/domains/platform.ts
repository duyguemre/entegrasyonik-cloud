// Platform yönetimi (ga = platformAdmin dikeyi; ADR-0001 Karar 8). Hepsi `mcp.notExposed{platform_admin}`:
// OAuth token'ında `ga` yoktur (ADR-0010:43) → MCP'den TEKNİK olarak çağrılamaz.
import { defineCapability as c, nx, NO_AGENT, onScreens, onShell, noUi } from '../define';

const PA = nx('platform_admin', 'Süper yönetici (platformAdmin) yeteneği; OAuth token\'ında ga bulunmadığı için MCP\'den çağrılamaz (ADR-0010).');
const CLIENTS = 'adminPanel/AdminClientListView';
const TICKETS = 'adminPanel/AdminTicketListView';
const SYSTEM = 'adminPanel/AdminSystemManagementView';

export const PLATFORM_CAPABILITIES = [
    c({
        id: 'platform.store.select', domain: 'platform', summary: { tr: 'Süper yönetici: mağaza seç (impersonation)', en: 'Super admin: select a store (impersonation)' },
        effect: 'write', minTier: 'platformAdmin', scope: 'platform', bindings: [{ rpc: 'SecurityService/selectStore' }],
        ui: onShell('session'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.tenant.deletion.cancel', domain: 'platform', summary: { tr: 'Bekleme süresindeki tenant silme talebini geri al', en: 'Cancel a pending tenant deletion within the grace period' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'TenantDataService/cancelDeletion' }],
        ui: noUi('Backend-only: FE ekranı henüz yok (ADR-0003 F.20; BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.admin.get', domain: 'platform', summary: { tr: 'AdminService genel GET okuması (eski istisna)', en: 'AdminService generic GET read (legacy exception)' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/get' }],
        ui: noUi('FE çağırmıyor (operation-policy.test.ts tek eski istisna: AdminService/get).'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.clients.list', domain: 'platform', summary: { tr: 'Tüm mağazaları (tenant) listele', en: 'List all tenants' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/getClients' }],
        ui: onScreens(CLIENTS, TICKETS), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.clients.create', domain: 'platform', summary: { tr: 'Yeni mağaza (tenant) oluştur', en: 'Create a tenant' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/createClient' }],
        ui: onScreens([CLIENTS, 'create']), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.clients.update', domain: 'platform', summary: { tr: 'Mağaza (tenant) bilgisini güncelle', en: 'Update a tenant' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/updateClient' }],
        ui: onScreens([CLIENTS, 'update']), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.clients.delete', domain: 'platform', summary: { tr: 'Mağazayı (tenant) sil', en: 'Delete a tenant' },
        effect: 'destructive', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/deleteClient' }],
        ui: onScreens([CLIENTS, 'delete']), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.clients.stats', domain: 'platform', summary: { tr: 'Mağaza istatistiklerini getir', en: 'Get tenant statistics' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/getClientStats' }],
        ui: onScreens(CLIENTS), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.clients.integrations.list', domain: 'platform', summary: { tr: 'Mağazanın entegrasyonlarını listele', en: 'List a tenant\'s integrations' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/getClientIntegrations' }],
        ui: onScreens(CLIENTS), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.metrics.global', domain: 'platform', summary: { tr: 'Platform genel metriklerini getir', en: 'Get global platform metrics' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/getGlobalMetrics' }],
        ui: onScreens(CLIENTS), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.tickets.list', domain: 'platform', summary: { tr: 'Tüm destek taleplerini listele', en: 'List all support tickets' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/getTickets' }],
        ui: onScreens(TICKETS), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.tickets.create', domain: 'platform', summary: { tr: 'Mağaza adına destek talebi aç', en: 'Create a support ticket on behalf of a tenant' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/createTicket' }],
        ui: onScreens([TICKETS, 'create']), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.tickets.reply', domain: 'platform', summary: { tr: 'Destek talebine yanıt ver', en: 'Reply to a support ticket' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/replyToTicket' }],
        ui: onScreens([TICKETS, 'reply']), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.tickets.delete', domain: 'platform', summary: { tr: 'Destek talebini sil', en: 'Delete a support ticket' },
        effect: 'destructive', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/deleteTicket' }],
        ui: onScreens([TICKETS, 'delete']), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.system.health', domain: 'platform', summary: { tr: 'Sistem sağlık durumunu getir', en: 'Get system health' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/getSystemHealth' }],
        ui: onScreens(SYSTEM), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.exports.detail', domain: 'platform', summary: { tr: 'Dışa aktarma iş ayrıntılarını getir', en: 'Get export job details' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'AdminService/getExportDetails' }],
        ui: onScreens(SYSTEM), mcp: PA, agent: NO_AGENT,
    }),

    // --- ADR-0020 Karar 6 (Aşama B): entegrasyon/motor ayar yönetimi (IntegrationConfigService) ---
    // FE ekranları (Karar 4) ADR-0020 Aşama C kapsamı; backend hazır, `ui: noUi(...)` (BACKEND_ONLY_NOT_YET_IN_FE).
    // `proposeFromFinding` ve `setIntake` (kill-switch/bakım) BU GÖREVİN KAPSAMI DIŞI (ADR-0018 Aşama C / ADR-0020 Aşama D).
    c({
        id: 'platform.integrations.list', domain: 'platform', summary: { tr: 'Tüm entegrasyon/motor ayar hedeflerini listele', en: 'List all integration/engine config targets' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationConfigService/list' }],
        ui: noUi('Backend-only: ADR-0020 Aşama C ekranları henüz yok.'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.integration_config.get', domain: 'platform', summary: { tr: 'Bir hedefin etkin yapılandırmasını (kaynak dahil) getir', en: 'Get a target\'s effective configuration (with source)' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationConfigService/get' }],
        ui: noUi('Backend-only: ADR-0020 Aşama C ekranları henüz yok.'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.integration_config.history', domain: 'platform', summary: { tr: 'Bir hedefin sürüm geçmişini getir', en: 'Get a target\'s revision history' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationConfigService/history' }],
        ui: noUi('Backend-only: ADR-0020 Aşama C ekranları henüz yok.'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.integration_config.save_draft', domain: 'platform', summary: { tr: 'Taslak ayar değişikliğini kaydet (iyimser kilit)', en: 'Save a draft config change (optimistic lock)' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationConfigService/saveDraft' }],
        ui: noUi('Backend-only: ADR-0020 Aşama C ekranları henüz yok.'), mcp: PA, agent: NO_AGENT,
        undo: { kind: 'compensate', with: 'platform.integration_config.discard_draft' },
    }),
    c({
        id: 'platform.integration_config.discard_draft', domain: 'platform', summary: { tr: 'Taslağı at', en: 'Discard the draft' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationConfigService/discardDraft' }],
        ui: noUi('Backend-only: ADR-0020 Aşama C ekranları henüz yok.'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.integration_config.preview_publish', domain: 'platform', summary: { tr: 'Yayın öncesi fark, çapraz doğrulama ve etki önizlemesi', en: 'Pre-publish diff, cross-validation and impact preview' },
        effect: 'propose', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationConfigService/previewPublish' }],
        ui: noUi('Backend-only: ADR-0020 Aşama C ekranları henüz yok.'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.integration_config.publish', domain: 'platform', summary: { tr: 'Taslağı yayınla (dangerous değişiklikte gerekçe + yazılı onay)', en: 'Publish the draft (reason + typed approval for dangerous changes)' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationConfigService/publish' }],
        ui: noUi('Backend-only: ADR-0020 Aşama C ekranları henüz yok.'), mcp: PA, agent: NO_AGENT,
        undo: { kind: 'compensate', with: 'platform.integration_config.rollback' },
    }),
    c({
        id: 'platform.integration_config.rollback', domain: 'platform', summary: { tr: 'Eski bir sürüme geri dön (yeni revizyon olarak yayınlanır)', en: 'Roll back to a previous version (published as a new revision)' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationConfigService/rollback' }],
        ui: noUi('Backend-only: ADR-0020 Aşama C ekranları henüz yok.'), mcp: PA, agent: NO_AGENT,
        undo: { kind: 'compensate', with: 'platform.integration_config.rollback' },
    }),
    c({
        id: 'platform.integration_config.take_over_lock', domain: 'platform', summary: { tr: 'Başka bir yöneticinin açık taslağının kilidini devral', en: 'Take over another admin\'s open draft lock' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationConfigService/takeOverLock' }],
        ui: noUi('Backend-only: ADR-0020 Aşama C ekranları henüz yok.'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.integration_config.test_endpoint', domain: 'platform', summary: { tr: 'Ayar/uç nokta doğrulaması (yalnız statik + replay; canlı mod ADR-0018 B+ gerektirir)', en: 'Setting/endpoint validation (static + replay only; live mode requires ADR-0018 B+)' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationConfigService/testEndpoint' }],
        ui: noUi('Backend-only: ADR-0020 Aşama C ekranları henüz yok.'), mcp: PA, agent: NO_AGENT,
    }),

    // --- ADR-0018 Karar 2/4 (Aşama B): entegrasyon uyum bulguları (IntegrationComplianceService) ---
    // FE "Entegrasyon uyum" sekmesi (Karar 2 "Konsol") AYRI görevde (buluta devredilecek); backend hazır,
    // `ui: noUi(...)` (BACKEND_ONLY_NOT_YET_IN_FE). `FindingService`'i TÜKETİR, yeniden yazmaz.
    c({
        // `IntegrationComplianceService.get()` (GET /:service rotası, `RunOperation` operation='get') `list()`e
        // AYNI davranışla yönlenir (integration-config-service.ts'in `get()`→`getEffectiveConfig()` deseniyle AYNI
        // fikir); AYRI bir yetenek AÇMADAN aynı bağa eklendi (integrations.ts `IntegrationService/get` +
        // `integrationTypes` ÖRNEĞİYLE AYNI desen).
        id: 'platform.integration_compliance.list', domain: 'platform', summary: { tr: 'Entegrasyon uyum bulgularını listele (entegrasyon/kategori/tür/şiddet/durum filtreli)', en: 'List integration compliance findings (filterable by integration/category/kind/severity/status)' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationComplianceService/list' }, { rpc: 'IntegrationComplianceService/get' }],
        ui: noUi('Backend-only: ADR-0018 Aşama B admin konsol ekranı ayrı görevde (buluta devredilecek).'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.integration_compliance.summary', domain: 'platform', summary: { tr: 'Entegrasyon başına uyum özet kartı (adapterVersion, lastVerifiedAt, son probe, açık bulgu sayıları)', en: 'Per-integration compliance summary card (adapterVersion, lastVerifiedAt, last probe, open finding counts)' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationComplianceService/summary' }],
        ui: noUi('Backend-only: ADR-0018 Aşama B admin konsol ekranı ayrı görevde (buluta devredilecek).'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.integration_compliance.get_detail', domain: 'platform', summary: { tr: 'Tek bir uyum bulgusunun tam kaydını getir (kanıt + etkilenen tenant sayısı/listesi dahil)', en: 'Get a single compliance finding\'s full record (incl. evidence + affected tenants)' },
        effect: 'read', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationComplianceService/getDetail' }],
        ui: noUi('Backend-only: ADR-0018 Aşama B admin konsol ekranı ayrı görevde (buluta devredilecek).'), mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.integration_compliance.transition', domain: 'platform', summary: { tr: 'Bulgu durumunu değiştir (triage/accept/wontfix/false_positive/fixed; fixed için fixRef zorunlu)', en: 'Transition a finding\'s status (triage/accept/wontfix/false_positive/fixed; fixRef required for fixed)' },
        effect: 'write', minTier: 'platformAdmin', bindings: [{ rpc: 'IntegrationComplianceService/transition' }],
        ui: noUi('Backend-only: ADR-0018 Aşama B admin konsol ekranı ayrı görevde (buluta devredilecek).'), mcp: PA, agent: NO_AGENT,
    }),
];
