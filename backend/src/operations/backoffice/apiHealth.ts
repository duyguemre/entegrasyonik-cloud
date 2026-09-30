// [BO B5] Platform geneli entegrasyon API sağlığı (salt okuma). Kaynak: ApplicationDB `IntegrationCallMetrics` (30 gün TTL).
// Dönen: entegrasyon başına çağrı sayısı, hata oranı (kod bazında), yaklaşık p95 (kova üst sınırı), etkilenen tenant SAYISI. Tenant kimliği/operasyon/yük dönmez.
export const API_HEALTH_RANGES = { '1h': 3600_000, '24h': 86_400_000, '7d': 7 * 86_400_000 } as const;
export type ApiHealthRange = keyof typeof API_HEALTH_RANGES;
/** p95 kova sınırları (ms); son kova açık uçlu (>30000 => `null`). */
export const P95_BOUNDS_MS = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000] as const;
export const MAX_TIME_MS = 5000;
export const MAX_ROWS = 200;

export interface ApiHealthRow {
    integrationCode: string;
    total: number;
    errors: number;
    errorRate: number;
    errorsByCode: Array<{ code: string; count: number; rate: number }>;
    p95Ms: number | null;
    affectedTenants: number;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

export function p95FromBuckets(counts: number[], total: number): number | null {
    if (total <= 0) return null;
    const target = Math.ceil(total * 0.95);
    let cum = 0;
    for (let i = 0; i < counts.length; i++) {
        cum += counts[i];
        if (cum >= target) return i < P95_BOUNDS_MS.length ? P95_BOUNDS_MS[i] : null;
    }
    return null;
}

export async function buildApiHealth(deps: { applicationDB: any; range: ApiHealthRange; integrationCode?: string; now?: () => Date }) {
    const until = (deps.now ?? (() => new Date()))();
    const since = new Date(until.getTime() - API_HEALTH_RANGES[deps.range]);
    const model = deps.applicationDB.getIntegrationCallMetricModel();
    const match: Record<string, unknown> = { at: { $gte: since, $lte: until } };
    if (deps.integrationCode) match.integrationCode = deps.integrationCode;

    // kova başına sayım: (önceki sınır, sınır]
    const bucketSums: Record<string, unknown> = {};
    const last = P95_BOUNDS_MS.length;
    for (let i = 0; i <= last; i++) {
        const lo = i === 0 ? undefined : P95_BOUNDS_MS[i - 1];
        const hi = i === last ? undefined : P95_BOUNDS_MS[i];
        const conds: unknown[] = [];
        if (lo !== undefined) conds.push({ $gt: ['$durationMs', lo] });
        if (hi !== undefined) conds.push({ $lte: ['$durationMs', hi] });
        bucketSums[`b${i}`] = { $sum: { $cond: [{ $and: conds }, 1, 0] } };
    }

    const [rows, codeRows] = await Promise.all([
        model.aggregate([
            { $match: match },
            { $group: {
                _id: '$integrationCode', total: { $sum: 1 },
                errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
                tenants: { $addToSet: { $cond: [{ $eq: ['$status', 'error'] }, '$clientId', '$$REMOVE'] } },
                ...bucketSums,
            } },
            { $project: { total: 1, errors: 1, affectedTenants: { $size: '$tenants' }, ...Object.fromEntries(Object.keys(bucketSums).map((k) => [k, 1])) } },
            { $sort: { total: -1 } }, { $limit: MAX_ROWS },
        ]).option({ maxTimeMS: MAX_TIME_MS }),
        model.aggregate([
            { $match: { ...match, status: 'error' } },
            { $group: { _id: { integrationCode: '$integrationCode', code: { $ifNull: ['$code', 'UNKNOWN'] } }, count: { $sum: 1 } } },
            { $sort: { count: -1 } }, { $limit: 1000 },
        ]).option({ maxTimeMS: MAX_TIME_MS }),
    ]);

    const byCode = new Map<string, Array<{ code: string; count: number }>>();
    for (const r of codeRows) {
        const arr = byCode.get(r._id.integrationCode) ?? [];
        arr.push({ code: String(r._id.code).slice(0, 40), count: r.count });
        byCode.set(r._id.integrationCode, arr);
    }
    const items: ApiHealthRow[] = rows.map((r: any) => {
        const counts = Array.from({ length: last + 1 }, (_, i) => r[`b${i}`] ?? 0);
        return {
            integrationCode: String(r._id), total: r.total, errors: r.errors, errorRate: r.total ? round(r.errors / r.total) : 0,
            errorsByCode: (byCode.get(r._id) ?? []).slice(0, 20).map((c) => ({ ...c, rate: r.total ? round(c.count / r.total) : 0 })),
            p95Ms: p95FromBuckets(counts, r.total), affectedTenants: r.affectedTenants ?? 0,
        };
    });
    return { range: deps.range, since: since.toISOString(), until: until.toISOString(), items };
}
