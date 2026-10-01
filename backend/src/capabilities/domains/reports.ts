// Raporlar/özetler. Bugün bağlı tek RPC: OrderService/getOrderDashboardInsights (Panel/StatisticsComponent).
// `reports.sales.summary` LLM yüzeylerine açıktır (ADR-0034 BR-2, core araç).
import { z } from 'zod';
import { defineCapability as c, NO_AGENT, onScreens } from '../define';

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const REPORTS_CAPABILITIES = [
    c({
        id: 'reports.sales.summary', version: '1.1', domain: 'reports', summary: { tr: 'Satış özeti (bugün/dün/7 gün: sipariş, ciro, iade)', en: 'Sales summary (today/yesterday/7 days: orders, revenue, claims)' },
        effect: 'read', minTier: 'member', permission: 'reports:read', pii: 'none',
        input: z.object({}).strict(),
        output: z.object({
            currency: z.literal('TRY'),
            today: z.object({ orders: z.number().int(), revenue: z.number() }),
            changeVsYesterdayPct: z.object({ orders: z.number(), revenue: z.number() }),
            totals: z.object({ orders: z.number().int(), revenue: z.number(), returns: z.number().int(), returnAmount: z.number() }),
            pending: z.object({ invoice: z.number().int(), shipping: z.number().int(), claims: z.number().int(), messages: z.number().int() }),
            last7Days: z.array(z.object({ date: z.string(), orders: z.number().int(), revenue: z.number() })),
        }),
        bindings: [{ rpc: 'OrderService/getOrderDashboardInsights' }],
        project: (raw: any) => ({
            currency: 'TRY' as const,
            today: { orders: n(raw?.today?.count), revenue: n(raw?.today?.revenue) },
            changeVsYesterdayPct: { orders: n(raw?.trend?.countChange), revenue: n(raw?.trend?.revenueChange) },
            totals: { orders: n(raw?.totals?.orderCount), revenue: n(raw?.totals?.revenue), returns: n(raw?.totals?.returnCount), returnAmount: n(raw?.totals?.returnAmount) },
            pending: { invoice: n(raw?.pending?.invoiceCount), shipping: n(raw?.pending?.shippingCount), claims: n(raw?.pending?.claimCount), messages: n(raw?.pending?.messageCount) },
            last7Days: (Array.isArray(raw?.last7Days) ? raw.last7Days : []).map((d: any) => ({ date: String(d?.date ?? ''), orders: n(d?.count), revenue: n(d?.revenue) })),
        }),
        ui: onScreens('DashboardView'),
        mcp: { exposed: { toolset: 'core', confirm: 'none', present: 'kpi', deepLink: { screen: 'DashboardView' } } },
        llm: {
            description: 'Returns the tenant\'s sales summary: today\'s order count and revenue with the change versus yesterday, all-time totals including returns, '
                + 'pending work counts (invoices, shipments, claims, messages) and a 7-day order/revenue series. Amounts are in Turkish lira. '
                + 'The periods are fixed (today, yesterday, last 7 days); arbitrary date ranges or per-channel breakdowns are not supported. Read-only.',
            examples: ['Bu haftaki satış özeti', 'Bugün kaç sipariş aldık, ciro ne kadar?', 'Dünle kıyaslayınca satışlar nasıl?'],
        },
        agent: NO_AGENT,
        review: 'Bağ ADAY eşlemedir: getOrderDashboardInsights sabit bugün/dün/7 gün penceresi döndürür; ADR-0009 sözleşmesi (from/to, kanal kırılımı) için ileride yeni/genişletilmiş RPC gerekir (BR-2 sapması: girdi boş nesne).',
    }),
];
