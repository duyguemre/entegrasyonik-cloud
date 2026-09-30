// E-fatura/fatura (InvoiceService). FE: InvoiceListView + OrderListView (useOrderActions).
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens } from '../define';

const INV = 'InvoiceListView';
const LEGAL = 'Mali/yasal belge işlemi (ERP/pazaryeri faturası) geri alınamaz; yalnız ekranda.';

export const INVOICES_CAPABILITIES = [
    c({
        id: 'invoices.list', domain: 'invoices', summary: { tr: 'Faturaları listele', en: 'List invoices' },
        effect: 'read', minTier: 'member', permission: 'invoices:read', pii: 'raw', bindings: [{ rpc: 'InvoiceService/getInvoices' }],
        ui: onScreens(INV), mcp: deferred('later', 'Fatura listesi müşteri PII ve mali veri içerir; maskeleme olmadan açılmaz (toolset: orders).'), agent: NO_AGENT,
    }),
    c({
        id: 'invoices.create', domain: 'invoices', summary: { tr: 'Siparişten fatura oluştur (tekli/toplu)', en: 'Create invoice from order (single/bulk)' },
        effect: 'write', minTier: 'member', permission: 'invoices:write', external: true, pii: 'raw', bindings: [{ rpc: 'InvoiceService/createInvoice' }, { rpc: 'InvoiceService/bulkCreateInvoice' }],
        ui: onScreens(['OrderListView', 'createInvoice']), mcp: nx('irreversible', LEGAL), agent: NO_AGENT,
    }),
    c({
        id: 'invoices.create_manual', domain: 'invoices', summary: { tr: 'Manuel fatura oluştur', en: 'Create a manual invoice' },
        effect: 'write', minTier: 'member', permission: 'invoices:write', external: true, pii: 'raw', bindings: [{ rpc: 'InvoiceService/createManualInvoice' }],
        ui: onScreens([INV, 'createManual']), mcp: nx('irreversible', LEGAL), agent: NO_AGENT,
    }),
    c({
        id: 'invoices.reissue', domain: 'invoices', summary: { tr: 'Hatalı faturayı çözüp yeniden düzenle', en: 'Resolve and reissue an invoice' },
        effect: 'write', minTier: 'member', permission: 'invoices:write', external: true, pii: 'raw', bindings: [{ rpc: 'InvoiceService/resolveAndReissueInvoice' }],
        ui: onScreens(['OrderListView', 'reissueInvoice']), mcp: nx('irreversible', LEGAL), agent: NO_AGENT,
    }),
    c({
        id: 'invoices.delete', domain: 'invoices', summary: { tr: 'Faturayı sil', en: 'Delete an invoice' },
        effect: 'destructive', minTier: 'member', permission: 'invoices:delete', bindings: [{ rpc: 'InvoiceService/deleteInvoice' }],
        ui: onScreens([INV, 'delete']), mcp: nx('irreversible', 'Mali belge silme geri alınamaz (undo yok); yalnız ekranda.'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: mali belge silme; günlük operasyon kabul edildi (member), admin gerekebilir.',
    }),
];
