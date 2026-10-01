// Sohbet aracısı (broker) uçları — ADR-0034. RPC'siz HTTP rotalarıdır (`bindings: [{ http }]`): yetkiyi rota kendisi verir
// (`authenticate` + `app:use`), RunOperation/OPERATION_POLICY'ye girmezler. Araç olarak AÇILMAZLAR (sohbetin kendi altyapısı).
// Sohbetin KULLANDIĞI yetenekler (`orders.list` …) `mcp.exposed` işaretlidir ve `capabilities/domains/*`'dadır.
import { defineCapability as c, nx, NO_AGENT, onShell } from '../define';
import { PLATFORM_ONLY } from '../permissions';

const SELF = { minTier: 'member', permission: 'app:use', scope: 'user', ui: onShell('chat'), agent: NO_AGENT } as const;

// BR-5 (BYOK kurulum): yalniz settings:manage; impersonation'da yasak (rota icinde); anahtar LLM kanalindan gecemez (mcp credential).
const PROVIDER = { minTier: 'admin', permission: 'settings:manage', scope: 'tenant', ui: onShell('chat'), agent: NO_AGENT } as const;
const PROVIDER_MCP = nx('credential', 'Tenant LLM sağlayıcı anahtarı ve KVKK aktarım onayı: sır/onay; LLM kanalından okunamaz/yazılamaz (ADR-0034 BR-5).');

// BR-4 (backoffice sohbeti): `/admin-api/agent/*` -- EK_ADMIN + TOTP oturumu (rota kendisi dogrular; `authenticateAdminRequest`). Musteri sohbetinden AYRI kayit/rota/cerez.
// Provider yazma uclari (save/remove) rotada step-up + gerekce ister. Platform anahtari BYOK degildir (tenant `Settings`'e dokunmaz).
const BO = { minTier: 'platformAdmin', permission: PLATFORM_ONLY, scope: 'platform', ui: onShell('chat'), agent: NO_AGENT } as const;
const BO_MCP = nx('platform_admin', 'Backoffice sohbetinin ic ucu (EK_ADMIN oturumu); OAuth token içinde ga bulunmadığı için MCP üzerinden çağrılamaz (ADR-0010, ADR-0034 Karar 6).');
const BO_PROVIDER_MCP = nx('credential', 'Platform LLM sağlayıcı anahtarı (backoffice sohbeti): sır; LLM kanalından okunamaz/yazılamaz (ADR-0034 BR-4).');

export const AGENT_CAPABILITIES = [
    c({
        id: 'agent.info', domain: 'account', summary: { tr: 'Sohbet durumu/sınırları/önerileri', en: 'Chat status, limits and suggestions' },
        effect: 'read', bindings: [{ http: 'GET /agent/info' }], ...SELF,
        mcp: nx('ui_plumbing', 'Sohbet panelinin açılış durumu (kurulum/kill-switch/bakım); kullanıcının işi değil, sohbet arayüzünün iç verisi.'),
    }),
    c({
        id: 'agent.turn', domain: 'account', summary: { tr: 'Sohbet turu (SSE akışı)', en: 'Chat turn (SSE stream)' },
        effect: 'propose', bindings: [{ http: 'POST /agent/turns' }], ...SELF,
        mcp: nx('ui_plumbing', 'Sohbetin kendisi (broker döngüsü); MCP istemcisi kendi modelini getirir, bu uç yalnız uygulama içi sohbet içindir.'),
    }),
    c({
        id: 'agent.confirm', domain: 'account', summary: { tr: 'Sohbet onay kartına karar (onayla/reddet)', en: 'Decide on a chat confirmation card (approve/reject)' },
        effect: 'write', idempotency: 'key', bindings: [{ http: 'POST /agent/confirm' }], ...SELF,
        mcp: nx('ui_plumbing', 'Sohbet onay kanalı (PendingAction); MCP onayı ayrı kanaldan (MRTR) gelir ve aynı PendingAction deposunu paylaşır, uç araç değildir.'),
    }),
    c({
        id: 'agent.more', domain: 'account', summary: { tr: 'Sohbet tablosunda "daha fazla göster"', en: 'Chat table "show more"' },
        effect: 'read', bindings: [{ http: 'POST /agent/more' }], ...SELF,
        mcp: nx('ui_plumbing', 'Sohbet tablosu sayfalaması (belirteçli, modelsiz); MCP istemcisi aynı yeteneği cursor ile doğrudan çağırır.'),
    }),
    c({
        id: 'agent.reset', domain: 'account', summary: { tr: 'Sohbet çalışma belleğini sil (yeni sohbet)', en: 'Clear chat working memory (new chat)' },
        effect: 'write', idempotency: 'natural', bindings: [{ http: 'DELETE /agent/conversations/:id' }], ...SELF,
        mcp: nx('ui_plumbing', 'Sohbet oturum belleğini siler (Redis, 60 dk); iş verisine dokunmaz, kullanıcının işi değil arayüz işidir.'),
    }),
    c({
        id: 'agent.provider.get', domain: 'account', summary: { tr: 'Yapay zekâ sağlayıcı durumu (maskeli anahtar, katalog, kullanım)', en: 'AI provider status (masked key, catalog, usage)' },
        effect: 'read', bindings: [{ http: 'GET /agent/provider' }], mcp: PROVIDER_MCP, ...PROVIDER,
    }),
    c({
        id: 'agent.provider.save', domain: 'account', summary: { tr: 'Yapay zekâ sağlayıcı/model/anahtarını kaydet (önce doğrulanır)', en: 'Save AI provider/model/key (verified first)' },
        effect: 'write', idempotency: 'natural', external: true, bindings: [{ http: 'PUT /agent/provider' }], mcp: PROVIDER_MCP, ...PROVIDER,
    }),
    c({
        id: 'agent.provider.test', domain: 'account', summary: { tr: 'Sağlayıcı anahtarını salt-okuma çağrıyla sına', en: 'Test provider key with a read-only call' },
        effect: 'read', external: true, bindings: [{ http: 'POST /agent/provider/test' }], mcp: PROVIDER_MCP, ...PROVIDER,
    }),
    c({
        id: 'agent.provider.remove', domain: 'account', summary: { tr: 'Yapay zekâ sağlayıcı anahtarını sil', en: 'Remove the AI provider key' },
        effect: 'write', idempotency: 'natural', bindings: [{ http: 'DELETE /agent/provider' }], mcp: PROVIDER_MCP, ...PROVIDER,
    }),
    c({
        id: 'agent.provider.consent', domain: 'account', summary: { tr: 'KVKK veri aktarım onayı ver/geri al (yalnız mağaza sahibi)', en: 'Give/revoke data-transfer consent (store owner only)' },
        effect: 'write', idempotency: 'natural', bindings: [{ http: 'POST /agent/provider/consent' }], mcp: PROVIDER_MCP, ...PROVIDER,
    }),
    // ---- BR-4: backoffice sohbeti ----
    c({
        id: 'platform.agent.info', domain: 'platform', summary: { tr: 'Backoffice sohbet durumu/sınırları/önerileri', en: 'Backoffice chat status, limits and suggestions' },
        effect: 'read', bindings: [{ http: 'GET /admin-api/agent/info' }], mcp: BO_MCP, ...BO,
    }),
    c({
        id: 'platform.agent.turn', domain: 'platform', summary: { tr: 'Backoffice sohbet turu (SSE akışı; yalnız salt-okunur platform araçları)', en: 'Backoffice chat turn (SSE; read-only platform tools only)' },
        effect: 'propose', bindings: [{ http: 'POST /admin-api/agent/turns' }], mcp: BO_MCP, ...BO,
    }),
    c({
        id: 'platform.agent.confirm', domain: 'platform', summary: { tr: 'Backoffice sohbet onayı (v1: yazma aracı yok; daima süresi dolmuş)', en: 'Backoffice chat confirmation (v1: no write tools; always expired)' },
        effect: 'write', idempotency: 'key', bindings: [{ http: 'POST /admin-api/agent/confirm' }], mcp: BO_MCP, ...BO,
    }),
    c({
        id: 'platform.agent.more', domain: 'platform', summary: { tr: 'Backoffice sohbet tablosunda "daha fazla göster"', en: 'Backoffice chat table "show more"' },
        effect: 'read', bindings: [{ http: 'POST /admin-api/agent/more' }], mcp: BO_MCP, ...BO,
    }),
    c({
        id: 'platform.agent.reset', domain: 'platform', summary: { tr: 'Backoffice sohbet çalışma belleğini sil', en: 'Clear backoffice chat working memory' },
        effect: 'write', idempotency: 'natural', bindings: [{ http: 'DELETE /admin-api/agent/conversations/:id' }], mcp: BO_MCP, ...BO,
    }),
    c({
        id: 'platform.agent.provider.get', domain: 'platform', summary: { tr: 'Platform yapay zekâ sağlayıcı durumu (maskeli anahtar, katalog, kullanım)', en: 'Platform AI provider status (masked key, catalog, usage)' },
        effect: 'read', bindings: [{ http: 'GET /admin-api/agent/provider' }], mcp: BO_PROVIDER_MCP, ...BO,
    }),
    c({
        id: 'platform.agent.provider.save', domain: 'platform', summary: { tr: 'Platform yapay zekâ sağlayıcı/model/anahtarını kaydet (step-up + gerekçe; önce doğrulanır)', en: 'Save platform AI provider/model/key (step-up + reason; verified first)' },
        effect: 'write', idempotency: 'natural', external: true, bindings: [{ http: 'PUT /admin-api/agent/provider' }], mcp: BO_PROVIDER_MCP, ...BO,
    }),
    c({
        id: 'platform.agent.provider.test', domain: 'platform', summary: { tr: 'Platform sağlayıcı anahtarını salt-okuma çağrıyla sına', en: 'Test the platform provider key with a read-only call' },
        effect: 'read', external: true, bindings: [{ http: 'POST /admin-api/agent/provider/test' }], mcp: BO_PROVIDER_MCP, ...BO,
    }),
    c({
        id: 'platform.agent.provider.remove', domain: 'platform', summary: { tr: 'Platform yapay zekâ sağlayıcı anahtarını sil (step-up + gerekçe)', en: 'Remove the platform AI provider key (step-up + reason)' },
        effect: 'write', idempotency: 'natural', bindings: [{ http: 'DELETE /admin-api/agent/provider' }], mcp: BO_PROVIDER_MCP, ...BO,
    }),
];
