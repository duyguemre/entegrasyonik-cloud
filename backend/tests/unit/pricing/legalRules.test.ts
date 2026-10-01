/**
 * PRC-R2 — AUTO_PRICING_LEGAL §(c) tasarım kuralları (K1, K4, K6, K7, K8, K9, K12, K13, K17) + bağımsız fiyat sigortası.
 * Test adları kurala bağlıdır (`legal-Kx-...`): kural→test eşlemesi docs/PRICING_COMPETITION.md §R2.7.
 * SAF motor/şema testleri (DB yok). K2/K3/K5/K11/K16/K18/K19 için bkz. priceRulesOps.test.ts ve pricingLegal.static.test.ts.
 */
import { describe, expect, it } from '@jest/globals';
import { competitionParams, parseRuleInput, saveRuleInput, PLATFORM_LIMITS, type CompetitionParams } from '@operations/pricing/priceRule';
import { evaluate, floorPrice, fuseCheck, isOscillating, PUBLISH_GRACE_MS, type EvalInput, type HistoryEntry } from '@operations/pricing/ruleEngine';
import type { MarginContext } from '@operations/pricing/margin';

const NOW = new Date('2026-10-01T12:00:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;

/** kâr(p) = 0,9p − p(1 − 1/1,2) − 50 ≈ 0,7333p − 50 → başa baş ≈ 68,19; %10 marj tabanı = 50 / 0,6333 ≈ 78,95. */
const MARGIN: MarginContext = {
    costPrice: 50, vatRate: 20, commission: { rate: 10, source: 'estimated' },
    deductions: { commissionVatRate: 0, serviceFeeFixed: 0, serviceFeeRate: 0, shippingContribution: 0, withholdingRate: 0 },
};

const PARAMS: CompetitionParams = {
    mode: 'below', deltaAmount: 1, deltaPercent: null, floorMarginPercent: 10, ceiling: 200, step: 0.01,
    maxChangesPerDay: 6, cooldownMin: 30, maxIncreasePercentPerDay: 5, excludeIfOutOfStock: true,
};

function input(over: Partial<EvalInput> & { params?: Partial<CompetitionParams> } = {}): EvalInput {
    const { params, ...rest } = over;
    return {
        rule: { competition: { ...PARAMS, ...params }, pausedReason: null },
        variant: { stock: 5, ownPrice: 120, listPrice: 120 },
        buybox: { status: 'losing', price: 110, order: 2, checkedAt: new Date(NOW.getTime() - 5 * MIN) },
        margin: MARGIN, history: [], freshnessMin: 30, now: NOW,
        ...rest,
    };
}

const applied = (minsAgo: number, from: number, to: number): HistoryEntry => ({ at: new Date(NOW.getTime() - minsAgo * MIN), previousPrice: from, salePrice: to, source: 'suggestion' });

describe('temel öneri (KURU motor; fiyatı KOD hesaplar — K15)', () => {
    it('buybox başkasında, altında kal 1 TL → 109,00; kâr önce/sonra, gerekçe kodları', () => {
        const r = evaluate(input());
        expect(r).toMatchObject({ kind: 'suggest', before: 120, after: 109, buyboxPrice: 110, floor: 78.95, ceiling: 200 });
        if (r.kind !== 'suggest') throw new Error();
        expect(r.reasons).toEqual(['mode_below', 'buybox_held_by_other', 'price_down']);
        expect(r.profitBefore).toBeGreaterThan(r.profitAfter as number);
    });
    it('üstünde kal: buybox + fark, yukarı yuvarlanır (adım 0,10)', () => {
        const r = evaluate(input({ params: { mode: 'above', deltaAmount: 0.05, step: 0.1, maxIncreasePercentPerDay: 10 }, variant: { stock: 5, ownPrice: 105, listPrice: 130 } }));
        expect(r).toMatchObject({ kind: 'skip', reason: 'discount_display_active' }); // üstü çizili gösterimde yukarı yok (K9)
        const r2 = evaluate(input({ params: { mode: 'above', deltaAmount: 0.05, step: 0.1, maxIncreasePercentPerDay: 10 }, variant: { stock: 5, ownPrice: 105, listPrice: 105 } }));
        expect(r2).toMatchObject({ kind: 'skip', reason: 'above_list_price' }); // 110,10 > liste 105 (K9)
        const r3 = evaluate(input({ params: { mode: 'above', deltaAmount: 0.05, step: 0.1, maxIncreasePercentPerDay: 10 }, variant: { stock: 5, ownPrice: 108, listPrice: 120 } }));
        expect(r3).toMatchObject({ kind: 'skip', reason: 'discount_display_active' });
        const r4 = evaluate(input({ params: { mode: 'above', deltaAmount: 0.05, step: 0.1, maxIncreasePercentPerDay: 10 }, variant: { stock: 5, ownPrice: 120, listPrice: 120 } }));
        expect(r4).toMatchObject({ kind: 'suggest', after: 110.1 }); // aşağı: 120 → 110,10
    });
    it('buybox zaten bizde → öneri yok', () => {
        expect(evaluate(input({ buybox: { status: 'winning', price: 120, order: 1, checkedAt: new Date(NOW.getTime() - MIN) } }))).toMatchObject({ kind: 'skip', reason: 'already_winning' });
    });
});

describe('legal-K1-no-equalize: eşitleme yok, fark > 0 (sunucu tarafında red; 0\'a yuvarlanan değerler de)', () => {
    it('legal-K1-no-equalize: 0 TL ve %0 reddedilir', () => {
        expect(competitionParams.safeParse({ ...PARAMS, deltaAmount: 0 }).success).toBe(false);
        expect(competitionParams.safeParse({ ...PARAMS, deltaAmount: null, deltaPercent: 0 }).success).toBe(false);
    });
    it('legal-K1-no-equalize: 0\'a yuvarlanan fark (0,004 TL, %0,04) reddedilir', () => {
        expect(competitionParams.safeParse({ ...PARAMS, deltaAmount: 0.004 }).success).toBe(false);
        expect(competitionParams.safeParse({ ...PARAMS, deltaAmount: null, deltaPercent: 0.04 }).success).toBe(false);
        expect(competitionParams.safeParse({ ...PARAMS, deltaAmount: 0.01 }).success).toBe(true);
        expect(competitionParams.safeParse({ ...PARAMS, deltaAmount: null, deltaPercent: 0.1 }).success).toBe(true);
    });
    it('legal-K1-no-equalize: fark alanı hiç yoksa reddedilir; ileti eşitleme yapılmadığını söyler', () => {
        expect(() => parseRuleInput({ name: 'x', enabled: false, integrationCode: 'trendyol', competition: { ...PARAMS, deltaAmount: null } })).toThrow(/eşitleme yapılmaz/);
    });
    it('legal-K1-no-equalize: yuvarlama buybox fiyatına eşit çıkarsa bir adım daha uygulanır; sonuç ASLA buybox\'a eşit değil', () => {
        // %0,1 fark @110 = 0,11 → 109,89; adım 1 TL → 109'a aşağı yuvarlanır (eşit değil). Adım 10 TL: 100 (eşit değil).
        // Eşitlik senaryosu: buybox 110, fark 0,01, adım 10 → floor(109,99/10)*10 = 100 ≠ 110. Üstünde: 110,01 → ceil adım 10 = 120.
        const above = evaluate(input({ params: { mode: 'above', deltaAmount: 0.01, step: 10, maxIncreasePercentPerDay: 10 }, variant: { stock: 5, ownPrice: 130, listPrice: 130 } }));
        expect(above).toMatchObject({ kind: 'suggest', after: 120 });
        // Kuruş düzeyinde: adım 0,01 ile buybox − 0,01 eşit olamaz; tüm aday fiyatlar taranır.
        for (const bb of [99.99, 100, 100.01, 57.33, 1234.56]) {
            for (const mode of ['below', 'above'] as const) {
                const r = evaluate(input({ params: { mode, deltaAmount: 0.01, step: 0.01, ceiling: 5000, maxIncreasePercentPerDay: 10 }, buybox: { status: 'losing', price: bb, order: 3, checkedAt: NOW }, variant: { stock: 5, ownPrice: mode === 'below' ? bb + 5 : bb + 50, listPrice: bb + 100 } }));
                if (r.kind === 'suggest') expect(Math.round(r.after * 100)).not.toBe(Math.round(bb * 100));
            }
        }
    });
    it('legal-K1-no-equalize: sigorta eşit fiyatı ve yanlış tarafı ayrıca reddeder', () => {
        const base = { mode: 'below' as const, before: 120, floor: 80, ceiling: 200, buyboxPrice: 110, listPrice: 150 };
        expect(fuseCheck({ ...base, after: 110 })).toEqual(expect.arrayContaining(['equals_buybox', 'wrong_side_of_buybox']));
        expect(fuseCheck({ ...base, mode: 'above', after: 109 })).toContain('wrong_side_of_buybox');
        expect(fuseCheck({ ...base, after: 109 })).toEqual([]);
    });
});

describe('legal-K4-seller-values: önerilen fark dayatılmaz, alanlar boş gelir', () => {
    it('legal-K4-seller-values: şemada varsayılan YOK — boş form reddedilir (değerleri satıcı girer)', () => {
        const r = competitionParams.safeParse({ mode: 'below', deltaAmount: 1 });
        expect(r.success).toBe(false);
        if (!r.success) expect(r.error.issues.map((i) => i.path[0]).sort()).toEqual(['ceiling', 'cooldownMin', 'excludeIfOutOfStock', 'floorMarginPercent', 'maxChangesPerDay', 'maxIncreasePercentPerDay', 'step']);
        expect(saveRuleInput.safeParse({ name: 'x', integrationCode: 'trendyol', competition: PARAMS }).success).toBe(false); // enabled da açıkça seçilir
    });
});

describe('legal-K6-no-competitor-field: rakip/mağaza hedefleme yok', () => {
    it('legal-K6-no-competitor-field: kural şemasında rakip/satıcı/mağaza alanı yok ve bilinmeyen alan reddedilir', () => {
        for (const k of ['competitorId', 'sellerId', 'storeId', 'merchantId', 'competitorName', 'targetSeller']) {
            expect(competitionParams.safeParse({ ...PARAMS, [k]: '123' }).success).toBe(false);
            expect(saveRuleInput.safeParse({ name: 'x', enabled: false, integrationCode: 'trendyol', competition: PARAMS, [k]: '123' }).success).toBe(false);
            expect(Object.keys(competitionParams._def.schema.shape)).not.toContain(k);
        }
    });
});

describe('legal-K7-floor-required: zorunlu taban (maliyet+komisyon+kargo+KDV+marj); maliyet yoksa kural çalışmaz', () => {
    it('legal-K7-floor-required: maliyet yoksa öneri yok (cost_missing)', () => {
        expect(evaluate(input({ margin: { ...MARGIN, costPrice: null } }))).toEqual({ kind: 'skip', reason: 'cost_missing' });
        expect(evaluate(input({ margin: { ...MARGIN, vatRate: null } }))).toEqual({ kind: 'skip', reason: 'vat_missing' });
        expect(evaluate(input({ margin: { ...MARGIN, commission: { rate: null, source: 'unknown' } } }))).toEqual({ kind: 'skip', reason: 'commission_unknown' });
    });
    it('legal-K7-floor-required: taban = başa baş + hedef marj; tabanın altına öneri yok', () => {
        expect(floorPrice(MARGIN, 0)).toBe(68.19);
        expect(floorPrice(MARGIN, 10)).toBe(78.95);
        const r = evaluate(input({ buybox: { status: 'losing', price: 75, order: 2, checkedAt: NOW } }));
        expect(r).toMatchObject({ kind: 'skip', reason: 'below_floor', floor: 78.95 });
        expect(evaluate(input({ params: { floorMarginPercent: 80 } }))).toMatchObject({ kind: 'skip', reason: 'floor_unreachable' });
    });
    it('legal-K7-floor-required: tavan aşılmaz (above modunda tavana kırpılır)', () => {
        const r = evaluate(input({ params: { mode: 'above', deltaAmount: 5, ceiling: 112, maxIncreasePercentPerDay: 10 }, variant: { stock: 5, ownPrice: 125, listPrice: 125 } }));
        expect(r).toMatchObject({ kind: 'suggest', after: 112 });
        if (r.kind === 'suggest') expect(r.warnings).toContain('ceiling_applied');
        expect(evaluate(input({ params: { mode: 'above', deltaAmount: 5, ceiling: 110, maxIncreasePercentPerDay: 10 }, variant: { stock: 5, ownPrice: 125, listPrice: 125 } })))
            .toMatchObject({ kind: 'skip', reason: 'above_ceiling' });
        expect(fuseCheck({ mode: 'below', before: 120, after: 79, floor: 80, ceiling: 200, buyboxPrice: 110, listPrice: null })).toContain('below_floor');
        expect(fuseCheck({ mode: 'above', before: 120, after: 201, floor: 80, ceiling: 200, buyboxPrice: 110, listPrice: null })).toContain('above_ceiling');
    });
});

describe('legal-K8-increase-cap: yukarı yönlü artış sınırı', () => {
    const up = (over: Partial<EvalInput> = {}) => input({ params: { mode: 'above', deltaAmount: 30, maxIncreasePercentPerDay: 5 }, variant: { stock: 5, ownPrice: 100, listPrice: 200 }, buybox: { status: 'losing', price: 99, order: 2, checkedAt: NOW }, ...over });
    it('legal-K8-increase-cap: liste/üstü çizili fiyat varken yukarı hedefte önce K9 engeli uygulanır', () => {
        const r = evaluate(up({ variant: { stock: 5, ownPrice: 100, listPrice: 100 } }));
        expect(r).toMatchObject({ kind: 'skip', reason: 'above_list_price' });
        const r2 = evaluate(up({ variant: { stock: 5, ownPrice: 100, listPrice: 1000 } }));
        expect(r2).toMatchObject({ kind: 'skip', reason: 'discount_display_active' });
    });
    it('legal-K8-increase-cap: liste fiyatı yüksek olmayan üründe artış %5 ile sınırlı; son 24 saatte düşük fiyat varsa ona göre', () => {
        const base = input({ params: { mode: 'above', deltaAmount: 30, maxIncreasePercentPerDay: 5, ceiling: 1000 }, variant: { stock: 5, ownPrice: 100, listPrice: 100 }, buybox: { status: 'losing', price: 99, order: 2, checkedAt: NOW } });
        // liste = 100 → yukarı her hedef liste fiyatını aşar (K9) — K8'i ayrı görmek için liste fiyatı bilinmiyor (null) senaryosu:
        const r = evaluate({ ...base, variant: { stock: 5, ownPrice: 100, listPrice: null } });
        expect(r).toMatchObject({ kind: 'suggest', after: 105 });
        if (r.kind === 'suggest') expect(r.warnings).toContain('increase_capped');
        const withLow = evaluate({ ...base, variant: { stock: 5, ownPrice: 100, listPrice: null }, history: [applied(600, 96, 100)] });
        expect(withLow).toMatchObject({ kind: 'suggest', after: 100.8 }); // 96 × 1,05
    });
    it('legal-K8-increase-cap: satıcı sınırı platform üst sınırını (%10/gün) aşamaz; sigorta platform sınırını ayrıca uygular', () => {
        expect(competitionParams.safeParse({ ...PARAMS, maxIncreasePercentPerDay: PLATFORM_LIMITS.maxIncreasePercentPerDay + 0.1 }).success).toBe(false);
        expect(fuseCheck({ mode: 'above', before: 100, after: 111, floor: 50, ceiling: 500, buyboxPrice: 90, listPrice: null })).toContain('increase_over_platform_cap');
        expect(fuseCheck({ mode: 'below', before: 100, after: 49, floor: 10, ceiling: 500, buyboxPrice: 90, listPrice: null })).toContain('drop_over_cap');
    });
    it('legal-K8-increase-cap: 30 gün sınırı (%25) son 30 günün en düşüğüne göre', () => {
        const r = evaluate(input({ params: { mode: 'above', deltaAmount: 30, maxIncreasePercentPerDay: 10, ceiling: 1000 }, variant: { stock: 5, ownPrice: 120, listPrice: null },
            buybox: { status: 'losing', price: 99, order: 2, checkedAt: NOW }, history: [applied(20 * 24 * 60, 100, 120)] }));
        // 30 gün en düşüğü 100 → en çok 125; 24 sa en düşüğü 120 → 132; hedef 129 → 125'e kırpılır.
        expect(r).toMatchObject({ kind: 'suggest', after: 125 });
        if (r.kind === 'suggest') expect(r.warnings).toContain('increase_capped');
        // 30 gün tabanı mevcut fiyattan da düşükse ve kırpılmış hedef mevcut fiyatı geçmiyorsa öneri yok.
        expect(evaluate(input({ params: { mode: 'above', deltaAmount: 30, maxIncreasePercentPerDay: 10, ceiling: 1000 }, variant: { stock: 5, ownPrice: 130, listPrice: null },
            buybox: { status: 'losing', price: 120, order: 2, checkedAt: NOW }, history: [applied(20 * 24 * 60, 100, 130)] }))).toMatchObject({ kind: 'skip', reason: 'increase_limit' });
    });
});

describe('legal-K9-list-price: yalnız satış fiyatı; liste/üstü çizili fiyat asla yükseltilmez; üstü çizili üründe uyarılı/engelli', () => {
    it('legal-K9-list-price: hedef liste fiyatını aşarsa öneri engellenir', () => {
        expect(evaluate(input({ params: { mode: 'above', deltaAmount: 30, ceiling: 1000, maxIncreasePercentPerDay: 10 }, variant: { stock: 5, ownPrice: 100, listPrice: 104 }, buybox: { status: 'losing', price: 99, order: 2, checkedAt: NOW } })))
            .toMatchObject({ kind: 'skip', reason: 'above_list_price' });
        expect(fuseCheck({ mode: 'above', before: 100, after: 105, floor: 50, ceiling: 500, buyboxPrice: 99, listPrice: 104 })).toContain('above_list_price');
    });
    it('legal-K9-list-price: üstü çizili fiyat gösterilen üründe yukarı öneri engelli, aşağı öneri uyarılı', () => {
        const down = evaluate(input({ variant: { stock: 5, ownPrice: 120, listPrice: 150 } }));
        expect(down).toMatchObject({ kind: 'suggest', after: 109 });
        if (down.kind === 'suggest') expect(down.warnings).toContain('discount_display_active');
        expect(evaluate(input({ params: { mode: 'above', deltaAmount: 5, maxIncreasePercentPerDay: 10 }, variant: { stock: 5, ownPrice: 100, listPrice: 150 }, buybox: { status: 'losing', price: 99, order: 2, checkedAt: NOW } })))
            .toMatchObject({ kind: 'skip', reason: 'discount_display_active' });
    });
});

describe('legal-K12-frequency: sıklık/soğuma sınırı ve salınım tespiti', () => {
    it('legal-K12-frequency: günlük değişiklik sınırı dolunca öneri yok', () => {
        const h = Array.from({ length: 6 }, (_, i) => applied(60 * (i + 1) + 40, 130 - i, 129 - i));
        expect(evaluate(input({ history: h }))).toMatchObject({ kind: 'skip', reason: 'daily_limit' });
    });
    it('legal-K12-frequency: soğuma süresi dolmadan öneri yok (yayın payı dolduktan sonra)', () => {
        const checked = new Date(NOW.getTime() - MIN);
        const h = [applied(PUBLISH_GRACE_MS / MIN + 2, 125, 120)]; // 32 dk önce; soğuma 60 dk
        expect(evaluate(input({ params: { cooldownMin: 60 }, history: h, buybox: { status: 'losing', price: 110, order: 2, checkedAt: checked } }))).toMatchObject({ kind: 'skip', reason: 'cooldown' });
        expect(evaluate(input({ params: { cooldownMin: 30 }, history: h, buybox: { status: 'losing', price: 110, order: 2, checkedAt: checked } }))).toMatchObject({ kind: 'suggest' });
    });
    it('legal-K12-frequency: aynı SKU\'da kısa sürede ileri-geri (salınım) → kural duraklatılır', () => {
        const h = [applied(300, 120, 110), applied(200, 110, 118), applied(100, 118, 109)];
        expect(isOscillating(h, NOW)).toBe(true);
        expect(evaluate(input({ history: h, variant: { stock: 5, ownPrice: 109, listPrice: 109 }, buybox: { status: 'losing', price: 105, order: 2, checkedAt: NOW } })))
            .toEqual({ kind: 'pause_rule', reason: 'oscillation' });
        expect(isOscillating([applied(300, 120, 110), applied(200, 110, 105)], NOW)).toBe(false);
    });
    it('legal-K12-frequency: platform sınırları (≤24/gün, soğuma ≥15 dk) şemada', () => {
        expect(competitionParams.safeParse({ ...PARAMS, maxChangesPerDay: 25 }).success).toBe(false);
        expect(competitionParams.safeParse({ ...PARAMS, cooldownMin: 14 }).success).toBe(false);
    });
});

describe('legal-K13-stale-data: bayat veriyle öneri yok', () => {
    it('legal-K13-stale-data: buybox gözlemi tazelik eşiğinden eskiyse öneri yok', () => {
        expect(evaluate(input({ buybox: { status: 'losing', price: 110, order: 2, checkedAt: new Date(NOW.getTime() - 31 * MIN) } }))).toMatchObject({ kind: 'skip', reason: 'stale_data' });
        expect(evaluate(input({ buybox: { status: 'losing', price: 110, order: 2, checkedAt: new Date(NOW.getTime() - 30 * MIN) } }))).toMatchObject({ kind: 'suggest' });
        expect(evaluate(input({ buybox: null }))).toMatchObject({ kind: 'skip', reason: 'no_buybox' });
        expect(evaluate(input({ buybox: { status: 'not_found', price: null, order: null, checkedAt: NOW } }))).toMatchObject({ kind: 'skip', reason: 'no_buybox' });
    });
});

describe('legal-K17-dual-engine: dış değişiklik algılanınca kural durur', () => {
    it('legal-K17-dual-engine: buybox bizdeyken görünen fiyat kayıtlı kanal fiyatından farklı → kural duraklat', () => {
        expect(evaluate(input({ buybox: { status: 'winning', price: 117.5, order: 1, checkedAt: NOW } }))).toEqual({ kind: 'pause_rule', reason: 'external_change' });
    });
    it('legal-K17-dual-engine: kendi uygulamamızdan sonra yayın payı dolmadan karar verilmez (yanlış alarm yok)', () => {
        const h = [applied(10, 125, 120)];
        expect(evaluate(input({ history: h, buybox: { status: 'winning', price: 125, order: 1, checkedAt: new Date(NOW.getTime() - 5 * MIN) } }))).toMatchObject({ kind: 'skip', reason: 'awaiting_publish' });
    });
});

describe('diğer önkoşullar', () => {
    it('stok yok + excludeIfOutOfStock → öneri yok; duraklatılmış kural → öneri yok', () => {
        expect(evaluate(input({ variant: { stock: 0, ownPrice: 120, listPrice: 120 } }))).toMatchObject({ kind: 'skip', reason: 'out_of_stock' });
        expect(evaluate(input({ params: { excludeIfOutOfStock: false }, variant: { stock: 0, ownPrice: 120, listPrice: 120 } }))).toMatchObject({ kind: 'suggest' });
        expect(evaluate({ ...input(), rule: { competition: PARAMS, pausedReason: 'external_change' } })).toEqual({ kind: 'skip', reason: 'rule_paused' });
    });
    it('motor girdisinde rakip kimliği taşıyan alan yok (K6/K16: yalnız fiyat/sıra/zaman)', () => {
        expect(Object.keys(input().buybox!).sort()).toEqual(['checkedAt', 'order', 'price', 'status']);
    });
    it('HOUR sabiti (yardımcı)', () => { expect(HOUR).toBe(3_600_000); });
});
