/**
 * PRC-R1 — buybox durum geçişi (kaybedildi, seyreltilmiş geçmiş, soğuma) ve kâr önizlemesi (bilinmeyen bileşen 0 sayılmaz, başa baş fiyat).
 */
import { describe, it, expect } from '@jest/globals';
import { ownChannelPrice, shouldNotifyLost, statusOf, transition, SNAPSHOT_HEARTBEAT_MS } from '@operations/pricing/buyboxState';
import { breakEvenPrice, buildMarginPreview, profitAt, type MarginContext } from '@operations/pricing/margin';

const NOW = new Date('2026-10-01T12:00:00Z');
const obs = (order: number | null, price: number | null, found = true) => ({ barcode: 'B1', found, buyboxOrder: order, buyboxPrice: price, hasMultipleSeller: true });

describe('buybox durum geçişi', () => {
    it('statusOf: 1 = winning, >1 = losing, yok = not_found', () => {
        expect(statusOf(obs(1, 10))).toBe('winning');
        expect(statusOf(obs(3, 10))).toBe('losing');
        expect(statusOf(obs(null, null, false))).toBe('not_found');
    });
    it('ilk gözlem: değişti + geçmiş yazılır, kayıp değil', () => {
        const t = transition(null, obs(2, 99), 100, NOW);
        expect(t).toMatchObject({ changed: true, lost: false, writeSnapshot: true });
        expect(t.next.lostAt).toBeNull();
    });
    it('winning -> losing = kaybedildi; lostAt yazılır; kazanınca sıfırlanır', () => {
        const prev = transition(null, obs(1, 100), 100, new Date(NOW.getTime() - 3600_000)).next;
        const t = transition(prev, obs(2, 95), 100, NOW);
        expect(t.lost).toBe(true);
        expect(t.next.lostAt).toEqual(NOW);
        const back = transition(t.next, obs(1, 100), 100, new Date(NOW.getTime() + 60_000));
        expect(back.next.lostAt).toBeNull();
    });
    it('değişmeyen gözlem geçmişe yalnız 6 saatte bir yazılır (seyreltme)', () => {
        const first = transition(null, obs(2, 95), 100, NOW).next;
        const t1 = transition(first, obs(2, 95), 100, new Date(NOW.getTime() + 30 * 60_000));
        expect(t1).toMatchObject({ changed: false, writeSnapshot: false });
        expect(t1.next.changedAt).toEqual(NOW);
        const t2 = transition(t1.next, obs(2, 95), 100, new Date(NOW.getTime() + SNAPSHOT_HEARTBEAT_MS));
        expect(t2.writeSnapshot).toBe(true);
    });
    it('soğuma: önceki bildirimden bu yana süre dolmadıysa bildirim yok', () => {
        const prev = transition(null, obs(1, 100), 100, NOW).next;
        const t = transition(prev, obs(2, 90), 100, NOW);
        expect(shouldNotifyLost(t, null, 24 * 3600_000, NOW)).toBe(true);
        expect(shouldNotifyLost(t, new Date(NOW.getTime() - 3600_000), 24 * 3600_000, NOW)).toBe(false);
        expect(shouldNotifyLost(t, new Date(NOW.getTime() - 25 * 3600_000), 24 * 3600_000, NOW)).toBe(true);
    });
    it('kanal fiyatı: kanal bazlı fiyat açıksa platform fiyatı', () => {
        expect(ownChannelPrice({ prices: { isPlatformBasedPrice: false, salePrice: 100 } }, 'trendyol')).toBe(100);
        expect(ownChannelPrice({ prices: { isPlatformBasedPrice: true, salePrice: 100 }, platforms: { trendyol: { prices: { salePrice: 120 } } } }, 'trendyol')).toBe(120);
        // [eslesme-fiyat WP5] bayrak açık ama kanal fiyatı yoksa ana fiyata düşer (effectiveChannelPrice; eskiden null → kural çalışmıyordu).
        expect(ownChannelPrice({ prices: { isPlatformBasedPrice: true, salePrice: 100 } }, 'trendyol')).toBe(100);
    });
});

const full: MarginContext = {
    costPrice: 50, vatRate: 20, commission: { rate: 20, source: 'estimated' },
    deductions: { commissionVatRate: 20, serviceFeeFixed: 0, serviceFeeRate: 0, shippingContribution: 10, withholdingRate: 0 },
};

describe('kâr önizlemesi', () => {
    it('120 TL: komisyon 24 + KDV 4,80 + kargo 10 + satış KDV 20 + maliyet 50 => kâr 11,20', () => {
        const p = profitAt(120, full);
        expect(p.profit).toBe(11.2);
        expect(p.salesVat).toBe(20);
        expect(p.confidence).toBe('estimated');
        expect(p.missing).toEqual([]);
    });
    it('maliyet ya da KDV yoksa kâr hesaplanmaz (0 sayılmaz)', () => {
        expect(profitAt(120, { ...full, costPrice: null })).toMatchObject({ profit: null, confidence: 'unknown' });
        expect(profitAt(120, { ...full, vatRate: null }).missing).toContain('vat');
        expect(profitAt(120, { ...full, commission: { rate: null, source: 'unknown' } }).missing).toContain('commission');
    });
    it('eksik kesinti (kargo bilinmiyor) -> kısmi', () => {
        const p = profitAt(120, { ...full, deductions: { ...full.deductions, shippingContribution: null } });
        expect(p.confidence).toBe('partial');
        expect(p.missing).toContain('shipping');
    });
    it('başa baş fiyat: o fiyatta kâr ~0, kuruşa yukarı', () => {
        const be = breakEvenPrice(full)!;
        expect(be).toBeGreaterThan(0);
        expect(profitAt(be, full).profit!).toBeGreaterThanOrEqual(0);
        expect(profitAt(be - 0.1, full).profit!).toBeLessThan(0); // bileşenler kuruşa yuvarlandığından kâr basamaklıdır
        expect(breakEvenPrice({ ...full, costPrice: null })).toBeNull();
    });
    it('buybox tabanın altında: kaybedilmiş ve buybox fiyatı başa başın altında', () => {
        const be = breakEvenPrice(full)!;
        const prev = buildMarginPreview({
            ownPrice: 120, buybox: { status: 'losing', price: be - 5, order: 2, observedAt: new Date(NOW.getTime() - 10 * 60_000), hasMultipleSeller: true },
            ctx: full, costUpdatedAt: NOW, freshnessMin: 30, now: NOW,
        });
        expect(prev.buyboxBelowFloor).toBe(true);
        expect(prev.atBuybox!.profit!).toBeLessThan(0);
        expect(prev.gap.amount).toBeCloseTo(120 - (be - 5), 2);
        expect(prev.buybox.fresh).toBe(true);
        expect(prev.rulesEligible).toBe(true);
    });
    it('maliyetsiz üründe kural/öneri kapalı + gerekçe', () => {
        const prev = buildMarginPreview({
            ownPrice: 120, buybox: { status: 'unchecked', price: null, order: null, observedAt: null, hasMultipleSeller: null },
            ctx: { ...full, costPrice: null }, costUpdatedAt: null, freshnessMin: 30, now: NOW,
        });
        expect(prev.rulesEligible).toBe(false);
        expect(prev.ineligibleReasons).toEqual(['cost_missing']);
        expect(prev.buyboxBelowFloor).toBe(false);
        expect(prev.buybox.fresh).toBe(false);
    });
});
