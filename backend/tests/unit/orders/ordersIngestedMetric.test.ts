// Platform sayacı orders_ingested_total{channel}: yalnız YENİ siparişler sayılır (güncelleme sayılmaz), tenant etiketi yok; 1sa rollup'a yazılır.
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const getClientDB = jest.fn<any>();
jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getClientDB: (...a: any[]) => getClientDB(...a), getApplicationDB: jest.fn() } }));

import { OrderRepository } from '@integration/engine/order/OrderRepository';
import { metricsRegistry } from '@platform/runtime/metrics/MetricsRegistry';
import { buildBulkWriteOps } from '@platform/runtime/metrics/metricsFlush';

const order = (id: string, ch = 'trendyol') => ({ externalOrderId: id, integrationCode: ch, internalStatus: 'APPROVED', items: [], dates: {} } as any);

function model(existing: string[]) {
    return {
        find: () => ({ select: () => ({ lean: async () => existing.map((externalOrderId) => ({ externalOrderId })) }) }),
        bulkWrite: (jest.fn() as any).mockResolvedValue({}),
    };
}

beforeEach(() => { metricsRegistry.drain(); });

describe('orders_ingested_total', () => {
    it('yeni sipariş sayılır, güncelleme sayılmaz; etiket yalnız channel', async () => {
        getClientDB.mockResolvedValue({ getOrderModel: () => model(['A']) });
        await new OrderRepository().saveOrders(7, [order('A'), order('B'), order('C'), order('D', 'n11')]);
        const s = metricsRegistry.drain().filter((x) => x.metric === 'orders_ingested_total');
        const by = Object.fromEntries(s.map((x) => [x.labels.channel, x.count]));
        expect(by).toEqual({ trendyol: 2, n11: 1 });
        for (const x of s) expect(Object.keys(x.labels)).toEqual(['channel']);
    });
    it('yalnız güncelleme -> sayaç oluşmaz', async () => {
        getClientDB.mockResolvedValue({ getOrderModel: () => model(['A']) });
        await new OrderRepository().saveOrders(7, [order('A')]);
        expect(metricsRegistry.drain().filter((x) => x.metric === 'orders_ingested_total')).toEqual([]);
    });
    it('rollup: flush ops 5dk ve 1sa kovasına $inc yazar', async () => {
        getClientDB.mockResolvedValue({ getOrderModel: () => model([]) });
        await new OrderRepository().saveOrders(7, [order('A'), order('B')]);
        const ops = buildBulkWriteOps(metricsRegistry.drain().filter((x) => x.metric === 'orders_ingested_total'), new Date('2026-10-01T12:34:00Z'));
        expect(ops.map((o) => o.updateOne.filter.resolution).sort()).toEqual(['1h', '5m']);
        expect(Object.values(ops[0].updateOne.update.$inc)).toEqual([2]);
    });
});
