import { PLATFORM_TIME_ZONE, startOfDayInZone, addDaysInZone, dayKeyInZone } from '@utils/timeZone';
import type { OrderPanelRepository } from '@database/repositories/tenant/OrderPanelRepository';

const trendOf = (today: number, yesterday: number): number =>
    yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : (today > 0 ? 100 : 0);

/**
 * DASHBOARD: kapsamlı iş analitiği — toplam ciro, sipariş sayısı, iade, bekleyen fatura/kargo/iade/mesaj, son 7 gün.
 * [ADR-0021 D1 / GV-03] "Bugün/dün/7 gün" sınırları platform saat dilimi (Europe/Istanbul) gününe göre;
 * sunucu saat dilimi (konteynerde UTC) sınırı 3 saat kaydırıyordu.
 */
export async function orderDashboardInsights(repo: OrderPanelRepository): Promise<any> {
    const now = new Date();
    const todayStart = startOfDayInZone(now);
    const yesterdayStart = addDaysInZone(todayStart, -1);
    const sevenDaysAgo = addDaysInZone(todayStart, -6);

    const [
        statusDistResult,
        totalRevenueResult,
        dailyResult,
        todayResult,
        yesterdayResult,
        returnResult,
        pendingInvoiceCount,
        pendingShippingCount,
        pendingClaimCount,
        pendingMessageCount
    ] = await repo.dashboardAggregates({ todayStart, yesterdayStart, sevenDaysAgo, timeZone: PLATFORM_TIME_ZONE });

    const statusMap: Record<string, number> = {};
    for (const s of statusDistResult) statusMap[s._id] = s.count;

    const totalStats = totalRevenueResult[0] ?? { totalRevenue: 0, totalCount: 0 };

    const dailyMap: Record<string, { count: number; revenue: number }> = {};
    for (const d of dailyResult) {
        const key = `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`;
        dailyMap[key] = { count: d.count, revenue: d.revenue };
    }

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const key = dayKeyInZone(addDaysInZone(todayStart, -i));
        last7Days.push({ date: key, count: dailyMap[key]?.count ?? 0, revenue: dailyMap[key]?.revenue ?? 0 });
    }

    const today = todayResult[0] ?? { count: 0, revenue: 0 };
    const yesterday = yesterdayResult[0] ?? { count: 0, revenue: 0 };
    const returns = returnResult[0] ?? { totalReturnCount: 0, totalReturnAmount: 0 };

    return {
        totals: {
            orderCount: totalStats.totalCount,
            revenue: totalStats.totalRevenue,
            returnCount: returns.totalReturnCount,
            returnAmount: returns.totalReturnAmount
        },
        today: { count: today.count, revenue: today.revenue },
        trend: { countChange: trendOf(today.count, yesterday.count), revenueChange: trendOf(today.revenue, yesterday.revenue) },
        statusDistribution: {
            UNAPPROVED: statusMap['UNAPPROVED'] ?? 0,
            AWAITING_APPROVAL: statusMap['AWAITING_APPROVAL'] ?? 0,
            APPROVED: statusMap['APPROVED'] ?? 0,
            SHIPPED: statusMap['SHIPPED'] ?? 0,
            DELIVERED: statusMap['DELIVERED'] ?? 0,
            CANCELLED: statusMap['CANCELLED'] ?? 0,
            RETURNED: statusMap['RETURNED'] ?? 0,
            total: Object.values(statusMap).reduce((a, b) => a + b, 0)
        },
        pending: {
            invoiceCount: pendingInvoiceCount,   // Fatura kesilmesi gereken
            shippingCount: pendingShippingCount, // Kargoya verilmesi gereken
            claimCount: pendingClaimCount,       // İşlem bekleyen iade
            messageCount: pendingMessageCount    // Cevaplanmamış soru
        },
        last7Days
    };
}
