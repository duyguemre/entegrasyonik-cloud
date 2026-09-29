// Tenant'ın destek talepleri (TicketService). FE: TicketListView (screens.ts'te kayıtlı DEĞİL).
import { defineCapability as c, deferred, NO_AGENT, onScreens } from '../define';

const TICKETS = 'supports/TicketListView';
const NOTE = 'Destek talebi; sohbet kanalından açma/yanıtlama değeri düşük, serbest metin (untrusted) içerir; toolset genişlemesinde değerlendirilir.';

export const SUPPORT_CAPABILITIES = [
    c({
        id: 'tickets.list', domain: 'support', summary: { tr: 'Destek taleplerimi listele', en: 'List my support tickets' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'TicketService/getTickets' }],
        ui: onScreens(TICKETS), mcp: deferred('later', NOTE), agent: NO_AGENT,
    }),
    c({
        id: 'tickets.open', domain: 'support', summary: { tr: 'Destek talebi aç', en: 'Open a support ticket' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'TicketService/openTicket' }],
        ui: onScreens([TICKETS, 'open']), mcp: deferred('later', NOTE), agent: NO_AGENT,
    }),
    c({
        id: 'tickets.message.send', domain: 'support', summary: { tr: 'Destek talebine mesaj gönder', en: 'Send a message on a support ticket' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'TicketService/sendTicketMessage' }],
        ui: onScreens([TICKETS, 'reply']), mcp: deferred('later', NOTE), agent: NO_AGENT,
    }),
    c({
        id: 'tickets.close', domain: 'support', summary: { tr: 'Destek talebini kapat', en: 'Close a support ticket' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'TicketService/closeTicket' }],
        ui: onScreens([TICKETS, 'close']), mcp: deferred('later', NOTE), agent: NO_AGENT,
    }),
];
