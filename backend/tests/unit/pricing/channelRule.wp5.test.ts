// [eslesme-fiyat WP5, K-A] Kanal fiyat kuralı saf motoru: maliyet+kargo+komisyon+KDV+marj, ana fiyat ± ayar, yuvarlama (,99), taban/tavan,
// liste fiyatı yapay yükseltilmez (K9), değişim sınırı (K12, otomatikte engel), şema (K4: varsayılan yok). DB YOK.
import { describe, it, expect } from '@jest/globals';
import { channelParams, computeChannelPrice, priceForMargin, roundPrice, type ChannelParams } from '@operations/pricing/channelRule';
import { profitAt, type MarginContext } from '@operations/pricing/margin';

const ctx = (o: Partial<MarginContext> = {}): MarginContext => ({ costPrice: 100, vatRate: 20, commission: { rate: 15, source: 'override' }, deductions: {} as any, ...o });
const P = (o: Partial<ChannelParams> = {}): ChannelParams => ({
    base: 'cost', marginPercent: 10, commission: { source: 'auto' }, cargoCost: 0,
    rounding: { step: 0.01, direction: 'up', psychological: false }, listPrice: { strategy: 'keep' }, autoApply: false, ...o,
} as ChannelParams);
const run = (params: ChannelParams, o: any = {}) => computeChannelPrice({ params, baseSale: 200, baseList: 250, currentSale: 200, margin: ctx(), auto: false, ...o });

describe('priceForMargin', () => {
    it('çözülen fiyatta kâr marjı hedefe eşit (kuruş yukarı)', () => {
        const k = priceForMargin(ctx(), 10) as number;
        const p = profitAt(k / 100, ctx());
        expect(p.marginPercent).toBeGreaterThanOrEqual(9.9);
        expect(p.marginPercent).toBeLessThanOrEqual(10.1);
        expect(priceForMargin(ctx({ commission: { rate: 95, source: 'override' } }), 10)).toBeNull(); // ulaşılamaz
    });
});

describe('computeChannelPrice', () => {
    it('cost tabanı: kargo maliyete eklenir, gerekçe zinciri, kâr', () => {
        const a = run(P()) as any, b = run(P({ cargoCost: 20 })) as any;
        expect(a.ok && b.ok).toBe(true);
        expect(b.salePrice).toBeGreaterThan(a.salePrice);
        expect(b.reasons[0]).toMatch(/maliyet 100,00 \+ kargo 20,00; komisyon %15 \(override\); KDV %20; hedef marj %10/);
        expect(b.reasons.at(-1)).toMatch(/tahmini kâr/);
    });
    it('static komisyon oranı motorda kullanılır', () => {
        const auto = run(P(), { margin: ctx({ commission: { rate: 10, source: 'estimated' } }) }) as any;
        const stat = run(P({ commission: { source: 'static', rate: 20 } }), { margin: ctx({ commission: { rate: 10, source: 'estimated' } }) }) as any;
        expect(stat.salePrice).toBeGreaterThan(auto.salePrice);
    });
    it('eksik veri engeller (sıfır sayılmaz)', () => {
        expect(run(P(), { margin: ctx({ costPrice: null }) })).toMatchObject({ ok: false, blocked: 'cost_missing' });
        expect(run(P(), { margin: ctx({ vatRate: null }) })).toMatchObject({ ok: false, blocked: 'vat_missing' });
        expect(run(P(), { margin: ctx({ commission: { rate: null, source: 'unknown' } }) })).toMatchObject({ ok: false, blocked: 'commission_unknown' });
        expect(run(P({ base: 'salePrice', adjustPercent: 10 }), { baseSale: null })).toMatchObject({ ok: false, blocked: 'base_price_missing' });
    });
    it('salePrice tabanı ± ayar; maliyet gerekmez (taban yoksa)', () => {
        expect(run(P({ base: 'salePrice', adjustPercent: 10, adjustAmount: 5 }), { margin: ctx({ costPrice: null }) })).toMatchObject({ ok: true, salePrice: 225, marketPrice: 250 });
    });
    it('yuvarlama: adım/yön ve ,99', () => {
        expect(roundPrice(12345, { step: 1, direction: 'up', psychological: false })).toBe(12400);
        expect(roundPrice(12345, { step: 1, direction: 'down', psychological: true })).toBe(12299);
        expect(roundPrice(12345, { step: 0.01, direction: 'up', psychological: true })).toBe(12399);
        expect(roundPrice(12399, { step: 0.01, direction: 'nearest', psychological: true })).toBe(12399);
        expect(run(P({ base: 'salePrice', adjustPercent: 3, rounding: { step: 1, direction: 'up', psychological: true } }))).toMatchObject({ ok: true, salePrice: 206.99 });
    });
    it('taban/tavan (K7); taban > tavan engel', () => {
        const floored = run(P({ base: 'salePrice', adjustPercent: -40, floorMarginPercent: 5 })) as any;
        expect(floored.ok).toBe(true);
        expect(floored.reasons.join(' ')).toMatch(/taban \(marj %5\) uygulandı/);
        expect(run(P({ base: 'salePrice', adjustPercent: 50, ceiling: 260 }))).toMatchObject({ ok: true, salePrice: 260 });
        expect(run(P({ floorMarginPercent: 30, ceiling: 100 }))).toMatchObject({ ok: false, blocked: 'floor_above_ceiling' });
    });
    it('liste fiyatı: keep = ana liste (≥ satış), same = satış; yapay yükseltme yok (K9)', () => {
        expect(run(P({ base: 'salePrice', adjustPercent: 10 }))).toMatchObject({ salePrice: 220, marketPrice: 250 });
        expect(run(P({ base: 'salePrice', adjustPercent: 50 }))).toMatchObject({ salePrice: 300, marketPrice: 300 });
        expect(run(P({ base: 'salePrice', adjustPercent: 10, listPrice: { strategy: 'same' } }))).toMatchObject({ salePrice: 220, marketPrice: 220 });
    });
    it('değişim sınırı (K12): otomatikte engel, elle onayda uyarı', () => {
        const p = P({ base: 'salePrice', adjustPercent: 30, maxChangePercent: 10 });
        expect(run(p, { auto: true })).toMatchObject({ ok: false, blocked: 'change_too_large' });
        const manual = run(p) as any;
        expect(manual.ok).toBe(true);
        expect(manual.warnings[0]).toMatch(/değişim %30 > sınır %10/);
    });
});

describe('channelParams şeması (K4: varsayılan yok)', () => {
    it('cost tabanında marj, salePrice tabanında ayar, static komisyonda oran zorunlu; bilinmeyen alan red', () => {
        expect(channelParams.safeParse(P()).success).toBe(true);
        expect(channelParams.safeParse({ ...P(), marginPercent: null }).success).toBe(false);
        expect(channelParams.safeParse(P({ base: 'salePrice' })).success).toBe(false);
        expect(channelParams.safeParse(P({ commission: { source: 'static' } })).success).toBe(false);
        expect(channelParams.safeParse({ ...P(), competitorId: 'x' }).success).toBe(false);
        expect(channelParams.safeParse({ ...P(), listPrice: { strategy: 'markupPercent' } }).success).toBe(false);
    });
});
