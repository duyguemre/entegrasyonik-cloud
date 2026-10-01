import { describe, it, expect, jest } from '@jest/globals';
import { clampPage, facetPage, facetStages, PAGINATE_MAX_LIMIT, PAGINATE_MAX_SKIP, PAGINATE_DEFAULT_LIMIT } from '@database/repositories/_shared/paginate';

describe('clampPage', () => {
  it('varsayılanlar: skip 0, limit 20', () => {
    expect(clampPage()).toEqual({ skip: 0, limit: PAGINATE_DEFAULT_LIMIT });
  });
  it.each([
    [{ skip: -5, limit: 0 }, { skip: 0, limit: 1 }],
    [{ skip: 'abc', limit: 'x' }, { skip: 0, limit: 20 }],
    [{ skip: '', limit: '' }, { skip: 0, limit: 20 }],
    [{ skip: 10.9, limit: 5.7 }, { skip: 10, limit: 5 }],
    [{ skip: 1e12, limit: 1e9 }, { skip: PAGINATE_MAX_SKIP, limit: PAGINATE_MAX_LIMIT }],
    [{ skip: '30', limit: '50' }, { skip: 30, limit: 50 }],
    [{ skip: null, limit: Infinity }, { skip: 0, limit: 20 }],
  ])('%p -> %p', (inp, out) => { expect(clampPage(inp as any)).toEqual(out); });
  it('maxLimit ve defaultLimit özelleştirilebilir (varsayılan tavanı aşamaz)', () => {
    expect(clampPage({ limit: 500, maxLimit: 50 }).limit).toBe(50);
    expect(clampPage({ defaultLimit: 500, maxLimit: 50 }).limit).toBe(50);
  });
});

describe('facetPage', () => {
  it('$match + (prePipeline) + tek $facet (items+total) kurar ve sonucu düzleştirir', async () => {
    const aggregate = jest.fn(async (_p: any[]) => [{ items: [{ a: 1 }], total: [{ count: 42 }] }]);
    const res = await facetPage({ aggregate }, { x: 1 }, { skip: 10, limit: 5, prePipeline: [{ $sort: { a: 1 } }], itemsPipeline: [{ $project: { a: 1 } }] });
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { x: 1 } }, { $sort: { a: 1 } },
      { $facet: { items: [{ $project: { a: 1 } }, { $skip: 10 }, { $limit: 5 }], total: [{ $count: 'count' }] } },
    ]);
    expect(res).toEqual({ items: [{ a: 1 }], total: 42, skip: 10, limit: 5 });
  });
  it('boş sonuçta total 0, items []', async () => {
    const res = await facetPage({ aggregate: async () => [{ items: [], total: [] }] }, {});
    expect(res).toMatchObject({ items: [], total: 0, skip: 0, limit: 20 });
    expect((await facetPage({ aggregate: async () => [] }, {})).total).toBe(0);
  });
  it('aşırı limit/skip tavanlanır (sorguya iletilen değerler)', async () => {
    const aggregate = jest.fn(async (_p: any[]) => []);
    await facetPage({ aggregate }, {}, { skip: -1, limit: 999999 });
    const facet = (aggregate.mock.calls[0][0] as any[])[1].$facet;
    expect(facet.items).toEqual([{ $skip: 0 }, { $limit: PAGINATE_MAX_LIMIT }]);
  });
  it('facetStages tek aşama döner', () => { expect(facetStages(0, 1)).toHaveLength(1); });
});
