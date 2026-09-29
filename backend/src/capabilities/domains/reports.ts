// Raporlar/özetler. Bugün bağlı tek RPC: OrderService/getOrderDashboardInsights (Panel/StatisticsComponent).
import { defineCapability as c, deferred, NO_AGENT, onScreens } from '../define';

export const REPORTS_CAPABILITIES = [
    c({
        id: 'reports.sales.summary', domain: 'reports', summary: { tr: 'Satış özeti (bugün/dün/7 gün: sipariş, ciro, iade)', en: 'Sales summary (today/yesterday/7 days: orders, revenue, claims)' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'OrderService/getOrderDashboardInsights' }],
        ui: onScreens('DashboardView'),
        mcp: deferred('C', 'ADR-0009 çekirdek araç #2 (reports_sales_summary); Aşama C\'de açılır. Önkoşul: from/to (≤90 gün) + channel girdi şeması ve kanal bazlı çıktı.'), agent: NO_AGENT,
        review: 'Bağ ADAY eşlemedir: getOrderDashboardInsights sabit bugün/dün/7 gün penceresi döndürür; ADR-0009 sözleşmesi (from/to, kanal kırılımı) için Aşama C\'de yeni/genişletilmiş RPC gerekir.',
    }),
];
