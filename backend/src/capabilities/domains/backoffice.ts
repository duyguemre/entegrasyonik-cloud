// ADR-0026 WP-LOG L2: backoffice log kontrol merkezi + denetim ekranı (yalnız `/admin-api`; `minTier:'platformAdmin'`).
// Okumalar `effect:'read'`; `setStatus` yazma (step-up gerekmez; RunOperation `backoffice.write` audit'i yazar). Hepsi MCP'den kapalı (platform_admin).
import { defineCapability as c, nx, NO_AGENT, noUi } from '../define';
import { PLATFORM_ONLY } from '../permissions';

const PA = nx('platform_admin', 'Süper yönetici (platformAdmin) yeteneği; OAuth token\'ında ga bulunmadığı için MCP\'den çağrılamaz (ADR-0010).');
const UI = noUi('Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.');

export const BACKOFFICE_CAPABILITIES = [
    c({
        id: 'platform.logs.list', domain: 'platform', summary: { tr: 'Kalıcı logları filtreli listele (imleç sayfalama)', en: 'List persisted logs (filtered, cursor paging)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeLogService/list' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.logs.issue_groups', domain: 'platform', summary: { tr: 'Hata gruplarını (ErrorEvents) listele', en: 'List error groups' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeLogService/issueGroups' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.logs.issue_trend', domain: 'platform', summary: { tr: 'Bir hata grubunun günlük trendi', en: 'Daily trend of an error group' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeLogService/issueTrend' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.logs.trace', domain: 'platform', summary: { tr: 'Bir correlationId için log izi', en: 'Log trace for a correlationId' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeLogService/trace' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.logs.volume', domain: 'platform', summary: { tr: 'Kaynak x seviye log hacmi', en: 'Log volume by source x level' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeLogService/volume' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.logs.issue_set_status', domain: 'platform', summary: { tr: 'Hata grubu durumunu değiştir (open/acknowledged/resolved/muted)', en: 'Set an error group status' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeErrorService/setStatus' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.audit.list', domain: 'platform', summary: { tr: 'Platform geneli denetim kayıtlarını listele (imleç sayfalama)', en: 'List platform-wide audit records (cursor paging)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeAuditService/list' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.admins.list', domain: 'platform', summary: { tr: 'Platform yöneticilerini listele (MFA/son giriş/kilit durumu; sır yok)', en: 'List platform admins (MFA/last login/lock status; no secrets)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeAdminUserService/list' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.admins.invite', domain: 'platform', summary: { tr: 'Yeni platform yöneticisi davet et (step-up; mevcut kullanıcı e-postası reddedilir)', en: 'Invite a new platform admin (step-up; existing-user email rejected)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeAdminUserService/invite' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.admins.disable', domain: 'platform', summary: { tr: 'Platform yöneticisini kapat / bekleyen daveti iptal et (step-up; son aktif yönetici korunur)', en: 'Disable a platform admin / revoke pending invite (step-up; last active admin protected)' },
        effect: 'destructive', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeAdminUserService/disable' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.admins.enable', domain: 'platform', summary: { tr: 'Kapatılmış platform yöneticisini yeniden aç (step-up)', en: 'Re-enable a disabled platform admin (step-up)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeAdminUserService/enable' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.admins.reset_mfa', domain: 'platform', summary: { tr: 'Platform yöneticisinin MFA kaydını sıfırla (step-up; kendisi hariç)', en: 'Reset the MFA enrollment of a platform admin (step-up; not self)' },
        effect: 'destructive', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeAdminUserService/resetMfa' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
];
