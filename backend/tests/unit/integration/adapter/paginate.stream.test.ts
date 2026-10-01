// INT-05: ortak `paginate` akış kipi (onPage + collect:false). Büyük kataloglar bellekte toplanmadan sayfa sayfa işlenir;
// tavan/tekrar eden sayfa yine `getIncomplete` ile işaretlenir. Ağ yok.
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { paginate } from '@integration/modules/common/adapter/paginate';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';

beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });

const mk = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: from + i }));

describe('paginate - akış kipi', () => {
    it('onPage her sayfayı sırayla alır; collect:false dönüşü boş, offset ilerler, total ile durur', async () => {
        const seen: number[][] = [];
        const offsets: number[] = [];
        const r = await paginate<{ id: number }>(async ({ offset, limit }) => {
            offsets.push(offset);
            return { items: mk(Math.min(limit, 25 - offset), offset), total: 25 };
        }, { kind: 'offset', maxPages: 10, limit: 10, operation: 't', collect: false, onPage: async (items) => { seen.push(items.map(i => i.id)); } });
        expect(r).toEqual([]);
        expect(offsets).toEqual([0, 10, 20]);
        expect(seen.map(s => s.length)).toEqual([10, 10, 5]);
        expect(getIncomplete(r)).toBeUndefined();
    });

    it('collect:false iken sayfa tavanı yine incomplete işaretler (collected sayacı doğru)', async () => {
        const r = await paginate(async ({ offset, limit }) => ({ items: mk(limit, offset) }), {
            kind: 'offset', maxPages: 3, limit: 10, operation: 't', collect: false, onPage: async () => undefined,
        });
        expect(r).toHaveLength(0);
        expect(getIncomplete(r)).toMatchObject({ reason: 'PAGINATION_PAGE_CAP', collected: 30 });
    });

    it('onPage hatası yutulmaz (fırlar)', async () => {
        await expect(paginate(async () => ({ items: mk(5) }), {
            kind: 'offset', maxPages: 3, limit: 5, operation: 't', onPage: async () => { throw new Error('persist'); },
        })).rejects.toThrow('persist');
    });

    it('onPage + collect varsayılan (true): hem akıtır hem toplar', async () => {
        let n = 0;
        const r = await paginate(async ({ offset }) => ({ items: mk(offset === 0 ? 10 : 3, offset) }), {
            kind: 'offset', maxPages: 5, limit: 10, operation: 't', onPage: async (i) => { n += i.length; },
        });
        expect(n).toBe(13);
        expect(r).toHaveLength(13);
    });
});
