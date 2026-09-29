// Pazaryeri müşteri mesajları (MessageService). FE: MessageListView (+ eski AdminView kopyası).
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens } from '../define';

const MSG = 'MessageListView';

export const MESSAGES_CAPABILITIES = [
    c({
        id: 'messages.list', domain: 'messages', summary: { tr: 'Müşteri mesajlarını listele', en: 'List customer messages' },
        effect: 'read', minTier: 'member', external: true, pii: 'raw', bindings: [{ rpc: 'MessageService/getMessages' }],
        ui: onScreens(MSG), mcp: deferred('later', 'Müşteri mesajları PII ve serbest metin (prompt-injection yüzeyi) içerir; maskeleme + untrustedPaths olmadan açılmaz.'), agent: NO_AGENT,
    }),
    c({
        id: 'messages.reply', domain: 'messages', summary: { tr: 'Müşteri mesajına yanıt ver', en: 'Reply to a customer message' },
        effect: 'write', minTier: 'member', external: true, pii: 'raw', bindings: [{ rpc: 'MessageService/replyMessage' }],
        ui: onScreens([MSG, 'reply']), mcp: nx('irreversible', 'Pazaryeri üzerinden müşteriye giden mesaj geri alınamaz; dışarı veri gönderen yetenek MCP\'ye açılmaz (ADR-0019 §5.6).'), agent: NO_AGENT,
    }),
    c({
        id: 'messages.mark_read', domain: 'messages', summary: { tr: 'Mesajı okundu işaretle', en: 'Mark a message as read' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'MessageService/markAsRead' }],
        ui: onScreens([MSG, 'markRead']), mcp: deferred('later', 'Yerel okundu bayrağı; salt durum değişikliği, onay akışı (Aşama D) sonrası değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'messages.delete', domain: 'messages', summary: { tr: 'Mesajları sil (tekli/toplu)', en: 'Delete messages (single/bulk)' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'MessageService/deleteMessage' }, { rpc: 'MessageService/bulkDeleteMessages' }],
        ui: onScreens([MSG, 'delete']), mcp: deferred('later', 'Yıkıcı silme; geri alma yok, yalnız ekranda (confirm:typed için undo gerekir).'), agent: NO_AGENT,
    }),
];
