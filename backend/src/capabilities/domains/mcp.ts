// Uzak MCP tenant ayari + bagli uygulamalar — ADR-0035 / MCP-2. RPC'siz HTTP rotalari (`bindings: [{ http }]`, `api/http/mcpRoutes.ts`): yetkiyi rota kendisi verir
// (cerez oturumu; impersonation/platform oturumunda HEPSI 403). Arac olarak ACILMAZLAR: MCP erisimini acmak/kesmek bir yapay zeka istemcisinin degil, insanin (sahip) isidir.
import { defineCapability as c, nx, NO_AGENT, onScreens, onShell } from '../define';

const AI_CONN = onScreens('settings/AiConnectionView');
const APPS = onScreens('ConnectedAppsView');
const SELF = { minTier: 'member', permission: 'app:use', scope: 'user', ui: APPS, agent: NO_AGENT } as const;

const ONLY_HUMAN = (what: string) => nx('ui_plumbing', `${what}; insan (mağaza sahibi/kullanıcı) kararıdır, yapay zekâ istemcisi kendi erişimini açamaz/kesemez (ADR-0035).`);

export const MCP_CAPABILITIES = [
    c({
        id: 'mcp.settings.get', domain: 'account', summary: { tr: 'Yapay zekâ bağlantısı ayarı ve MCP adresi', en: 'AI connection setting and MCP address' },
        effect: 'read', bindings: [{ http: 'GET /mcp/settings' }], minTier: 'member', permission: 'settings:read', scope: 'tenant', ui: AI_CONN, agent: NO_AGENT,
        mcp: ONLY_HUMAN('Tenant MCP erişim ayarı görünümü'),
    }),
    c({
        id: 'mcp.settings.save', domain: 'account', summary: { tr: 'Yapay zekâ bağlantısını aç/kapat (yalnız mağaza sahibi)', en: 'Turn the AI connection on/off (store owner only)' },
        effect: 'write', idempotency: 'natural', bindings: [{ http: 'PUT /mcp/settings' }], minTier: 'admin', permission: 'settings:manage', scope: 'tenant', ui: AI_CONN, agent: NO_AGENT,
        mcp: ONLY_HUMAN('Tenant MCP erişimini açma + veri aktarım metni onayı (yalnız sahip; yönetici açamaz)'),
    }),
    c({
        id: 'mcp.connections.list', domain: 'account', summary: { tr: 'Bağlı yapay zekâ uygulamalarını listele', en: 'List connected AI apps' },
        effect: 'read', bindings: [{ http: 'GET /mcp/connections' }], ...SELF,
        mcp: ONLY_HUMAN('Bağlı uygulamalar listesi (kendi bağlantıları; kullanıcı yönetimi izniyle mağaza geneli)'),
    }),
    c({
        id: 'mcp.connections.revoke', domain: 'account', summary: { tr: 'Bir yapay zekâ uygulaması bağlantısını kes', en: 'Disconnect an AI app' },
        effect: 'write', idempotency: 'natural', bindings: [{ http: 'DELETE /mcp/connections/:id' }], ...SELF,
        mcp: ONLY_HUMAN('Bağlantı iptali (kendi bağlantısı; kullanıcı yönetimi izniyle başkasınınki)'),
    }),
    c({
        id: 'mcp.connections.revoke_all', domain: 'account', summary: { tr: 'Mağazadaki tüm yapay zekâ bağlantılarını kes', en: 'Disconnect all AI apps of the store' },
        effect: 'write', idempotency: 'natural', bindings: [{ http: 'POST /mcp/connections/revoke-all' }],
        minTier: 'admin', permission: 'users:manage', scope: 'tenant', ui: APPS, agent: NO_AGENT,
        mcp: ONLY_HUMAN('Tenant geneli bağlantı iptali'),
    }),
    c({
        id: 'mcp.approvals.list', domain: 'account', summary: { tr: 'Bekleyen yapay zekâ işlem onaylarım', en: 'My pending AI action approvals' },
        effect: 'read', bindings: [{ http: 'GET /mcp/approvals' }], ...SELF,
        mcp: ONLY_HUMAN('Bekleyen MCP işlem onayları (yalnız kendi kayıtları; MCP-4)'),
    }),
    c({
        id: 'mcp.approvals.view', domain: 'account', summary: { tr: 'Yapay zekâ işlem önerisini göster', en: 'Show an AI action proposal' },
        effect: 'read', bindings: [{ http: 'GET /mcp/approvals/:id' }], ...SELF, ui: onShell('session'),
        mcp: nx('ui_plumbing', 'Bant dışı onay sayfası verisi (önizleme); onay insanın web oturumunda verilir, yapay zekâ istemcisi kendi önerisini göremez/onaylayamaz (ADR-0035).'),
    }),
    c({
        id: 'mcp.approvals.decide', domain: 'account', summary: { tr: 'Yapay zekâ işlem önerisini onayla veya reddet', en: 'Approve or reject an AI action proposal' },
        effect: 'write', idempotency: 'key', bindings: [{ http: 'POST /mcp/approvals/:id' }], ...SELF, ui: onShell('session'),
        mcp: nx('ui_plumbing', 'Yazma işleminin tek yürütme kapısı: yalnız kaydın sahibinin web oturumu (impersonation 403); yapay zekâ istemcisi veya elicitation yanıtı onay sayılmaz (ADR-0035).'),
    }),
];
