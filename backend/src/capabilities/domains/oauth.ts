// Uzak MCP OAuth onay ekrani uclari — ADR-0035 / MCP-1. RPC'siz HTTP rotalari (`bindings: [{ http }]`): yetkiyi rota kendisi verir (cerez oturumu +
// impersonation/platform oturumunda 403). Arac olarak ACILMAZLAR: bir AI istemcisinin kendi baglanti onayini vermesi anlamsizdir (insan onayi, uygulama icinde).
import { defineCapability as c, nx, NO_AGENT, onShell } from '../define';

const SELF = { minTier: 'member', permission: 'app:use', scope: 'user', ui: onShell('session'), agent: NO_AGENT } as const;

export const OAUTH_CAPABILITIES = [
    c({
        id: 'oauth.consent.view', domain: 'account', summary: { tr: 'Yapay zekâ uygulaması bağlantı isteğini göster', en: 'Show an AI app connection request' },
        effect: 'read', bindings: [{ http: 'GET /oauth/requests/:id' }], ...SELF,
        mcp: nx('ui_plumbing', 'Onay ekranı verisi (uygulama adı, mağaza seçenekleri); insan onayı uygulama içinde verilir, yapay zekâ istemcisi kendi bağlantısını onaylayamaz.'),
    }),
    c({
        id: 'oauth.consent.decide', domain: 'account', summary: { tr: 'Yapay zekâ uygulaması bağlantı isteğine karar ver', en: 'Decide on an AI app connection request' },
        effect: 'write', idempotency: 'natural', bindings: [{ http: 'POST /oauth/requests/:id/decision' }], ...SELF,
        mcp: nx('ui_plumbing', 'Bağlantı izni verme/reddetme (tek kullanımlık istek, kod üretir); yalnızca kullanıcının web oturumunda, yapay zekâ istemcisi bu kararı veremez.'),
    }),
];
