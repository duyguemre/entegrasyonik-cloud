// Sohbet aracısı (broker) uçları — ADR-0034. RPC'siz HTTP rotalarıdır (`bindings: [{ http }]`): yetkiyi rota kendisi verir
// (`authenticate` + `app:use`), RunOperation/OPERATION_POLICY'ye girmezler. Araç olarak AÇILMAZLAR (sohbetin kendi altyapısı).
// Sohbetin KULLANDIĞI yetenekler (`orders.list` …) `mcp.exposed` işaretlidir ve `capabilities/domains/*`'dadır.
import { defineCapability as c, nx, NO_AGENT, onShell } from '../define';

const SELF = { minTier: 'member', permission: 'app:use', scope: 'user', ui: onShell('chat'), agent: NO_AGENT } as const;

// BR-5 (BYOK kurulum): yalniz settings:manage; impersonation'da yasak (rota icinde); anahtar LLM kanalindan gecemez (mcp credential).
const PROVIDER = { minTier: 'admin', permission: 'settings:manage', scope: 'tenant', ui: onShell('chat'), agent: NO_AGENT } as const;
const PROVIDER_MCP = nx('credential', 'Tenant LLM sağlayıcı anahtarı ve KVKK aktarım onayı: sır/onay; LLM kanalından okunamaz/yazılamaz (ADR-0034 BR-5).');

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
];
