// Finans (FinancialService). FE: FinancialListView (screens.ts'te kayıtlı DEĞİL). Tümü salt-okunur, aynı tenant DB'si.
import { defineCapability as c, deferred, NO_AGENT, onScreens, noUi } from '../define';

const NOTE = 'Finansal veri (mali özet/ödeme dökümü); operatörden gizlenme kararı (kademe) netleşmeden sohbet kanalına açılmaz (toolset: finance).';
const NEVER_CALLED = 'Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).';

export const FINANCE_CAPABILITIES = [
    c({
        id: 'finance.transactions.list', domain: 'finance', summary: { tr: 'Finansal işlemleri listele', en: 'List financial transactions' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'FinancialService/getTransactionData' }],
        ui: onScreens('FinancialListView'), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: finansal veri; operatörden gizlenmesi istenebilir (member bırakıldı).',
    }),
    c({
        id: 'finance.summary', domain: 'finance', summary: { tr: 'Finansal özet', en: 'Financial summary' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'FinancialService/getFinancialSummary' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz (getTransactionData ile ortak kademe kararı).',
    }),
    c({
        id: 'finance.cargo_invoices.list', domain: 'finance', summary: { tr: 'Kargo faturası mutabakatını listele', en: 'List cargo invoice reconciliation' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'FinancialService/getCargoInvoices' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: 5000 satır üst sınırı; finansal veri kademe kararı.',
    }),
    c({
        id: 'finance.payouts.detail', domain: 'finance', summary: { tr: 'Ödeme emri dökümünü getir', en: 'Get payout order details' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'FinancialService/getPayoutDetails' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: paymentOrderId yalnızca skaler; finansal veri kademe kararı.',
    }),
];
