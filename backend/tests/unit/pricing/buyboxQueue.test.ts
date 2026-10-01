/**
 * PRC-CFG / PRC-R1 — buybox tazeleme kuyruğu: SKU tavanı + öncelik politikası + vade, ve kanal bütçesinin tenant'lar arası adil paylaşımı.
 */
import { describe, it, expect } from '@jest/globals';
import { allocateFair, chunk, orderCandidates, selectDue, BUYBOX_BATCH_SIZE, type BuyboxCandidate } from '@operations/pricing/buyboxQueue';

const NOW = new Date('2026-10-01T12:00:00Z');
const minAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const cand = (barcode: string, o: Partial<BuyboxCandidate> = {}): BuyboxCandidate => ({ barcode, stock: 5, checkedAt: null, changedAt: null, ...o });
const bcs = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(3, '0')}`);

describe('orderCandidates — öncelik politikası', () => {
    const list = [
        cand('A', { stock: 0, checkedAt: minAgo(10) }),
        cand('B', { stock: 3, checkedAt: minAgo(100) }),
        cand('C', { stock: 0, checkedAt: minAgo(500), changedAt: minAgo(60) }),
        cand('D', { stock: 9, checkedAt: null }),
    ];
    it('changed_first: son 24 sa değişen -> stoklu -> en eski okuma', () => {
        expect(orderCandidates(list, 'changed_first', NOW).map((c) => c.barcode)).toEqual(['C', 'D', 'B', 'A']);
    });
    it('stocked_only: stoksuzlar elenir, en eski okuma önce (hiç okunmamış en başta)', () => {
        expect(orderCandidates(list, 'stocked_only', NOW).map((c) => c.barcode)).toEqual(['D', 'B']);
    });
    it('oldest_first: yalnız okuma zamanına göre', () => {
        expect(orderCandidates(list, 'oldest_first', NOW).map((c) => c.barcode)).toEqual(['D', 'C', 'B', 'A']);
    });
    it('24 saatten eski değişiklik öne alınmaz', () => {
        const l = [cand('X', { changedAt: minAgo(25 * 60), checkedAt: minAgo(5) }), cand('Y', { checkedAt: minAgo(6) })];
        expect(orderCandidates(l, 'changed_first', NOW).map((c) => c.barcode)).toEqual(['Y', 'X']);
    });
});

describe('selectDue — tavan + vade', () => {
    it('tavanın dışındaki aday izlenmez; vadesi gelmeyen okunmaz', () => {
        const l = [cand('A', { checkedAt: minAgo(400) }), cand('B', { checkedAt: minAgo(10) }), cand('C'), cand('D', { checkedAt: minAgo(1000) })];
        const r = selectDue(l, { skuCap: 3, refreshMin: 360, priority: 'oldest_first' }, NOW);
        expect(r).toEqual({ due: ['C', 'D', 'A'], tracked: 3, overCap: 1 });
    });
    it('skuCap 0 = izleme kapalı', () => {
        expect(selectDue([cand('A')], { skuCap: 0, refreshMin: 30, priority: 'changed_first' }, NOW)).toEqual({ due: [], tracked: 0, overCap: 1 });
    });
    it('tam vade sınırı dahil (checkedAt = now - refresh)', () => {
        expect(selectDue([cand('A', { checkedAt: minAgo(30) })], { skuCap: 10, refreshMin: 30, priority: 'oldest_first' }, NOW).due).toEqual(['A']);
    });
});

describe('allocateFair — kanal bütçesi tenant\'lar arası', () => {
    it('istek başına en çok 10 barkod', () => {
        expect(BUYBOX_BATCH_SIZE).toBe(10);
        expect(chunk(bcs('x', 25)).map((c) => c.length)).toEqual([10, 10, 5]);
    });
    it('bütçe yeterliyse herkes tamamen okunur, erteleme yok', () => {
        const p = allocateFair([{ tid: 2, barcodes: bcs('b', 15) }, { tid: 1, barcodes: bcs('a', 5) }], 10, 0);
        expect(p.calls).toHaveLength(3);
        expect(p.deferred.size).toBe(0);
    });
    it('büyük tenant küçüğü aç bırakamaz: round-robin, kalan ertelenir', () => {
        const p = allocateFair([{ tid: 1, barcodes: bcs('a', 500) }, { tid: 2, barcodes: bcs('b', 10) }, { tid: 3, barcodes: bcs('c', 20) }], 4, 0);
        expect(p.calls.map((c) => c.tid)).toEqual([1, 2, 3, 1]);
        expect(p.deferred.get(1)).toBe(480);
        expect(p.deferred.get(3)).toBe(10);
        expect(p.deferred.has(2)).toBe(false);
    });
    it('başlangıç her turda kayar (aynı tenant sürekli ilk olmaz)', () => {
        const q = [{ tid: 1, barcodes: bcs('a', 100) }, { tid: 2, barcodes: bcs('b', 100) }, { tid: 3, barcodes: bcs('c', 100) }];
        const t1 = allocateFair(q, 1, 0);
        const t2 = allocateFair(q, 1, t1.nextStart);
        const t3 = allocateFair(q, 1, t2.nextStart);
        expect([t1, t2, t3].map((p) => p.calls[0].tid)).toEqual([1, 2, 3]);
    });
    it('bütçe 0: çağrı yok, tüm vadeliler ertelenir', () => {
        const p = allocateFair([{ tid: 1, barcodes: bcs('a', 7) }], 0, 0);
        expect(p.calls).toHaveLength(0);
        expect(p.deferred.get(1)).toBe(7);
    });
    it('B bütçe, T tenant: her tenant en az floor(B/T) parti alır', () => {
        const q = Array.from({ length: 5 }, (_, i) => ({ tid: i + 1, barcodes: bcs(`t${i}`, 1000) }));
        const p = allocateFair(q, 23, 3);
        const per = new Map<number, number>();
        for (const c of p.calls) per.set(c.tid, (per.get(c.tid) ?? 0) + 1);
        for (const n of per.values()) expect(n).toBeGreaterThanOrEqual(Math.floor(23 / 5));
        expect(p.calls).toHaveLength(23);
    });
});
