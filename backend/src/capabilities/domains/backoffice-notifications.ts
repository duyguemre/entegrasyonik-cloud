// ADR-0029 Karar 7 (NB7/NB8): backoffice bildirim/duyuru/uyarı yetenekleri (yalnız `/admin-api`; `minTier:'platformAdmin'`) + tenant duyuru bandı (`AnnouncementService/getActive`).
// Yazmalar step-up + gerekçe ister (`admin/stepUp.ts REAUTH_RPCS`). Toplu e-posta (`scheduleAnnouncement`) `external:true` -> LIVE_READONLY guard reddeder.
import { defineCapability as c, nx, NO_AGENT, noUi } from '../define';
import { PLATFORM_ONLY } from '../permissions';

const PA = nx('platform_admin', 'Süper yönetici (platformAdmin) yeteneği; OAuth token\'ında ga bulunmadığı için MCP\'den çağrılamaz (ADR-0010).');
const UI = noUi('Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.');
const R = 'BackofficeNotificationService';

export const BACKOFFICE_NOTIFICATIONS_CAPABILITIES = [
    c({
        id: 'notifications.announcements.active', domain: 'account', summary: { tr: 'Aktif platform duyurularını getir (duyuru bandı)', en: 'Get active platform announcements (announcement banner)' },
        effect: 'read', minTier: 'member', permission: 'app:use', bindings: [{ rpc: 'AnnouncementService/getActive' }],
        ui: noUi('Backend-only: duyuru bandı (F-N4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('ui_plumbing', 'Duyuru bandı: kullanıcının işi değil, uygulama kabuğunun iç işi; sohbet kanalına açılmaz.'), agent: NO_AGENT,
    }),
    c({
        id: 'platform.announcements.list', domain: 'platform', summary: { tr: 'Duyuruları listele (durum/tür/tarih filtresi, imleç)', en: 'List announcements (status/kind/date filter, cursor)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: `${R}/listAnnouncements` }, { rpc: `${R}/getAnnouncement` }, { rpc: `${R}/previewAnnouncement` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.announcements.save', domain: 'platform', summary: { tr: 'Duyuru taslağı oluştur / güncelle (step-up + gerekçe)', en: 'Create / update an announcement draft (step-up + reason)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: `${R}/createAnnouncement` }, { rpc: `${R}/updateAnnouncement` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.announcements.schedule', domain: 'platform', summary: { tr: 'Duyuruyu zamanla / yayına al (e-posta kanalında toplu gönderim; step-up + gerekçe + hizmet duyurusu onayı)', en: 'Schedule / publish an announcement (bulk email when enabled; step-up + reason + service-notice consent)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, external: true, bindings: [{ rpc: `${R}/scheduleAnnouncement` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.announcements.cancel', domain: 'platform', summary: { tr: 'Duyuruyu iptal et (bant hemen kalkar; gönderilmiş bildirimler geri alınmaz; step-up + gerekçe)', en: 'Cancel an announcement (banner disappears; sent notifications stay; step-up + reason)' },
        effect: 'destructive', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: `${R}/cancelAnnouncement` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.notifications.deliveries.read', domain: 'platform', summary: { tr: 'Bildirim teslim günlüğü: istatistik ve liste (e-posta adresi yok)', en: 'Notification delivery log: stats and list (no email addresses)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: `${R}/getDeliveryStats` }, { rpc: `${R}/listDeliveries` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.notifications.deliveries.retry', domain: 'platform', summary: { tr: 'Başarısız/ölü teslimi yeniden kuyruğa al (step-up + gerekçe)', en: 'Requeue a failed/dead delivery (step-up + reason)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, external: true, bindings: [{ rpc: `${R}/retryDelivery` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.notifications.deliveries.discard', domain: 'platform', summary: { tr: 'Teslimi at (bir daha denenmez; step-up + gerekçe)', en: 'Discard a delivery (never retried; step-up + reason)' },
        effect: 'destructive', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: `${R}/discardDelivery` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.notifications.tenant_history', domain: 'platform', summary: { tr: 'Tenant bildirim geçmişi (yalnız meta veri; bildirim içeriği yok)', en: 'Tenant notification history (metadata only; no content)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, pii: 'masked', bindings: [{ rpc: `${R}/getTenantHistory` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.notifications.catalog', domain: 'platform', summary: { tr: 'Bildirim olay kataloğu + şablon önizleme (yalnız render, gönderim yok)', en: 'Notification event catalog + template preview (render only, no send)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: `${R}/getCatalog` }, { rpc: `${R}/previewTemplate` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.notifications.test_email', domain: 'platform', summary: { tr: 'Yöneticinin kendi adresine test e-postası gönder (SMTP doğrulaması; step-up + gerekçe)', en: 'Send a test email to the admin\'s own address (SMTP check; step-up + reason)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, external: true, bindings: [{ rpc: `${R}/sendTestEmail` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.alerts.list', domain: 'platform', summary: { tr: 'Platform uyarılarını listele (firing/resolved; ADR-0017 Uyarılar paneli)', en: 'List platform alerts (firing/resolved; ADR-0017 Alerts panel)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: `${R}/listAlerts` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.alerts.mute', domain: 'platform', summary: { tr: 'Uyarıyı süreli sustur ya da susturmayı kaldır (step-up + gerekçe)', en: 'Mute an alert for a period or unmute (step-up + reason)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: `${R}/muteAlert` }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
];
