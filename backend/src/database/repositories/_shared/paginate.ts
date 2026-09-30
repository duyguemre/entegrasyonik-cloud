/**
 * BA-09 / ADR-0024 D6: `$facet` tabanlı sayfalama TEK fonksiyonda (api/** içindeki 10 kopyanın yerine — göç Dalga 1/3).
 * `items` + `total` tek toplulaştırmada döner. skip/limit tavanlıdır (negatif/NaN/aşırı değer güvenli aralığa çekilir).
 */
export const PAGINATE_DEFAULT_LIMIT = 20;
export const PAGINATE_MAX_LIMIT = 200;
export const PAGINATE_MAX_SKIP = 100_000;

export interface PageOptions { skip?: unknown; limit?: unknown; maxLimit?: number; defaultLimit?: number }
export interface PageResult<T> { items: T[]; total: number; skip: number; limit: number }

function toInt(v: unknown): number | undefined {
    const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export function clampPage(opts: PageOptions = {}): { skip: number; limit: number } {
    const maxLimit = opts.maxLimit ?? PAGINATE_MAX_LIMIT;
    const def = Math.min(opts.defaultLimit ?? PAGINATE_DEFAULT_LIMIT, maxLimit);
    const limitIn = toInt(opts.limit);
    const limit = limitIn === undefined ? def : Math.min(Math.max(limitIn, 1), maxLimit);
    const skipIn = toInt(opts.skip);
    const skip = skipIn === undefined ? 0 : Math.min(Math.max(skipIn, 0), PAGINATE_MAX_SKIP);
    return { skip, limit };
}

/** `$facet` aşaması: `[{ $facet: { items: [{$skip},{$limit}], total: [{$count}] } }]`. `itemsPipeline` skip'ten ÖNCE uygulanır (sıralama/projeksiyon). */
export function facetStages(skip: number, limit: number, itemsPipeline: Record<string, any>[] = []): Record<string, any>[] {
    return [{ $facet: { items: [...itemsPipeline, { $skip: skip }, { $limit: limit }], total: [{ $count: 'count' }] } }];
}

/** Minimal model yüzeyi (mongoose Model.aggregate). */
export interface Aggregatable { aggregate(pipeline: any[]): PromiseLike<any[]> }

export async function facetPage<T = any>(
    model: Aggregatable,
    match: Record<string, any>,
    opts: PageOptions & { itemsPipeline?: Record<string, any>[]; prePipeline?: Record<string, any>[]; sort?: Record<string, 1 | -1> } = {},
): Promise<PageResult<T>> {
    const { skip, limit } = clampPage(opts);
    // [DB-02] $match -> $sort -> (prePipeline) -> $facet: $sort $facet İÇİNDE olursa indeks kullanılamaz.
    const sortStage = opts.sort && Object.keys(opts.sort).length > 0 ? [{ $sort: opts.sort }] : [];
    const pipeline = [{ $match: match }, ...sortStage, ...(opts.prePipeline ?? []), ...facetStages(skip, limit, opts.itemsPipeline)];
    const res = await model.aggregate(pipeline);
    const first = res?.[0] ?? {};
    return { items: (first.items ?? []) as T[], total: first.total?.[0]?.count ?? 0, skip, limit };
}
