/** DB-02: Tickets / ImportJobs sıralama alanı izin listesi (bilinmeyen alan => varsayılan sıralama, hata yok). */
import { describe, it, expect, jest } from '@jest/globals';
import { pickSortField } from '@utils/search';
import TicketService from '@api/rpc/handlers/ticket-service';
import IntegrationService from '@api/rpc/handlers/integration-service';

describe('pickSortField', () => {
    it('izinli alan geçer; bilinmeyen/tür dışı => fallback', () => {
        expect(pickSortField('a', ['a', 'b'], 'b')).toEqual({ field: 'a', usedFallback: false });
        for (const v of ['x', undefined, null, 5, { $gt: 1 }, '']) expect(pickSortField(v, ['a'], 'b')).toEqual({ field: 'b', usedFallback: true });
    });
});

describe('TicketService.getTickets sıralama izin listesi', () => {
    const run = async (sortBy: any) => {
        const aggregate = jest.fn(async (_p: any[]) => [{ totalRecords: [], tickets: [] }]);
        const svc: any = new TicketService(7, { pagination: { page: 1, limit: 10 }, sortBy });
        svc.applicationDB = { getTicketModel: () => ({ aggregate }) };
        await svc.getTickets();
        return aggregate.mock.calls[0][0] as any[];
    };
    it('izinli alan $facet dışında; bilinmeyen alan varsayılan lastMessageAt -1', async () => {
        expect((await run({ key: 'status', order: 'asc' }))[1]).toEqual({ $sort: { status: 1 } });
        expect((await run({ key: 'messages.content', order: 'asc' }))[1]).toEqual({ $sort: { lastMessageAt: -1 } });
        expect(Object.keys((await run(undefined))[2])).toEqual(['$facet']);
    });
});

describe('IntegrationService.getImportJobs sıralama izin listesi', () => {
    const run = async (body: any) => {
        const q: any = {};
        q.sort = jest.fn(() => q); q.skip = jest.fn(() => q); q.limit = jest.fn(() => q); q.lean = jest.fn(async () => []);
        const svc: any = new IntegrationService(7, body);
        svc.applicationDB = { getImportJobModel: () => ({ find: () => q, countDocuments: async () => 0 }) };
        await svc.getImportJobs();
        return q.sort.mock.calls[0][0];
    };
    it('izinli alan geçer; bilinmeyen alan => jobId -1', async () => {
        expect(await run({ sortBy: 'startedAt', sortOrder: 'desc' })).toEqual({ startedAt: -1 });
        expect(await run({ sortBy: 'error.stack', sortOrder: 'desc' })).toEqual({ jobId: -1 });
        expect(await run({})).toEqual({ jobId: -1 });
    });
});
