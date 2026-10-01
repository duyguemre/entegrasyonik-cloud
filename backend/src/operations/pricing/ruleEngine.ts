// PRC-R2: rekabet kuralı MOTORU + bağımsız FİYAT SİGORTASI — SAF (DB/ağ yok). Fiyatı KOD hesaplar (K15); yapay zekâ yalnız açıklar.
// Motor KURU çalışır: yalnız öneri/atlama/kural-duraklat kararı döner; hiçbir yere yazmaz. Uygulama (insan onayı) aynı fonksiyonu
// taze veriyle YENİDEN çalıştırır ve `fuseCheck`'i ayrıca uygular (öneri anından sonra değişen hiçbir şey sessizce geçmez).
// Tüm tutarlar kuruş (tam sayı) üzerinden hesaplanır; kayan nokta yuvarlaması eşitlemeye (K1) yol açamaz.
// Girdi yalnız TEK tenant'ın tek varyantına aittir (K2): fonksiyon başka tenant/rakip verisi almaz; rakip kimliği yoktur (K6, K16).
import { profitAt, type MarginContext } from './margin';
import { PLATFORM_LIMITS, type CompetitionParams } from './priceRule';

export type SkipReason =
    | 'rule_paused' | 'cost_missing' | 'vat_missing' | 'commission_unknown' | 'no_price' | 'no_buybox' | 'stale_data' | 'out_of_stock'
    | 'awaiting_publish' | 'daily_limit' | 'cooldown' | 'already_winning' | 'equalize_forbidden' | 'floor_unreachable' | 'below_floor'
    | 'above_ceiling' | 'above_list_price' | 'discount_display_active' | 'increase_limit' | 'no_change' | 'fuse_rejected';

/** Kullanıcıya "engellendi" olarak GÖSTERİLEN (sessizce atlanmayan) nedenler: satıcının bir şeyi düzeltmesi/bilmesi gerekir. */
export const VISIBLE_BLOCK_REASONS: ReadonlySet<SkipReason> = new Set<SkipReason>([
    'cost_missing', 'vat_missing', 'commission_unknown', 'floor_unreachable', 'below_floor', 'above_ceiling', 'above_list_price',
    'discount_display_active', 'increase_limit', 'equalize_forbidden',
]);

export type PauseReason = 'external_change' | 'oscillation';
export type Warning = 'discount_display_active' | 'increase_capped' | 'ceiling_applied' | 'extra_step_k1' | 'partial_deductions';

export interface HistoryEntry {
    at: Date;
    salePrice: number;
    previousPrice?: number | null;
    source: 'suggestion' | 'external';
}

export interface EvalInput {
    rule: { competition: CompetitionParams; pausedReason?: string | null };
    variant: { stock: number; ownPrice: number | null; listPrice: number | null };
    buybox: { status: 'winning' | 'losing' | 'not_found' | 'unchecked'; price: number | null; order: number | null; checkedAt: Date | null } | null;
    margin: MarginContext;
    /** Bu varyant + kanal için son 30 günün fiyat geçmişi (sıra önemsiz). */
    history: HistoryEntry[];
    freshnessMin: number;
    now: Date;
}

export interface SuggestResult {
    kind: 'suggest';
    before: number;
    after: number;
    floor: number;
    ceiling: number;
    listPrice: number | null;
    buyboxPrice: number;
    profitBefore: number | null;
    profitAfter: number | null;
    reasons: string[];
    warnings: Warning[];
}
export interface SkipResult { kind: 'skip'; reason: SkipReason; floor?: number | null; before?: number | null }
export interface PauseResult { kind: 'pause_rule'; reason: PauseReason }
export type EvalResult = SuggestResult | SkipResult | PauseResult;

const DAY = 86_400_000;
/** Uygulanan fiyatın pazaryerinde görünmesi için tanınan süre: bu süre dolmadan buybox gözlemi "dış değişiklik" sayılmaz. */
export const PUBLISH_GRACE_MS = 30 * 60_000;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const k = (tl: number) => Math.round(tl * 100);
const tl = (kurus: number) => kurus / 100;
const floorTo = (kurus: number, step: number) => Math.floor(kurus / step) * step;
const ceilTo = (kurus: number, step: number) => Math.ceil(kurus / step) * step;

/** K7: taban = başa baş + hedef marj (% brüt). Kâr fiyatta doğrusal: p = −a / (eğim − m). Hesaplanamıyorsa null. Kuruşa YUKARI. */
export function floorPrice(ctx: MarginContext, marginPercent: number): number | null {
    const a = profitAt(0, ctx), b = profitAt(1000, ctx);
    if (a.profit === null || b.profit === null) return null;
    const slope = (b.profit - a.profit) / 1000;
    const denom = slope - marginPercent / 100;
    if (!(denom > 0)) return null;
    const p = -a.profit / denom;
    return p <= 0 ? 0.01 : Math.ceil(Math.round(p * 1e6) / 1e4) / 100;
}

/** Son 24 saatte uygulanan değişikliklerden salınım: yön en az iki kez döndüyse (ör. aşağı-yukarı-aşağı). */
export function isOscillating(history: HistoryEntry[], now: Date): boolean {
    const recent = history
        .filter((h) => h.source === 'suggestion' && isNum(h.previousPrice) && now.getTime() - h.at.getTime() <= DAY)
        .sort((x, y) => x.at.getTime() - y.at.getTime());
    let flips = 0, last = 0;
    for (const h of recent) {
        const dir = Math.sign(k(h.salePrice) - k(h.previousPrice as number));
        if (dir === 0) continue;
        if (last !== 0 && dir !== last) flips++;
        last = dir;
    }
    return flips >= 2;
}

export interface FuseInput {
    mode: 'below' | 'above';
    before: number;
    after: number;
    floor: number;
    ceiling: number;
    buyboxPrice: number;
    listPrice: number | null;
}

/**
 * BAĞIMSIZ fiyat sigortası (motor sonucundan ayrı yazılmış ikinci çizgi; uygulamada YENİDEN çalışır). İhlal listesi boşsa geçer.
 * K1 (eşit değil, doğru tarafta), K7 (taban/tavan), K8 (platform günlük artış üst sınırı), K9 (liste fiyatını aşma), düşüş üst sınırı.
 */
export function fuseCheck(f: FuseInput): string[] {
    const v: string[] = [];
    const after = k(f.after), before = k(f.before), bb = k(f.buyboxPrice);
    if (!(after > 0)) v.push('non_positive');
    if (after < k(f.floor)) v.push('below_floor');
    if (after > k(f.ceiling)) v.push('above_ceiling');
    if (after === bb) v.push('equals_buybox');
    if (f.mode === 'below' && after >= bb) v.push('wrong_side_of_buybox');
    if (f.mode === 'above' && after <= bb) v.push('wrong_side_of_buybox');
    if (f.listPrice !== null && after > k(f.listPrice)) v.push('above_list_price');
    if (after > before && after > Math.floor(before * (1 + PLATFORM_LIMITS.maxIncreasePercentPerDay / 100))) v.push('increase_over_platform_cap');
    if (after < before && after < Math.ceil(before * (1 - PLATFORM_LIMITS.maxDropPercent / 100))) v.push('drop_over_cap');
    return v;
}

export function evaluate(i: EvalInput): EvalResult {
    const c = i.rule.competition;
    const now = i.now.getTime();
    if (i.rule.pausedReason) return { kind: 'skip', reason: 'rule_paused' };
    // K7: maliyet (ve kâr bileşenleri) yoksa kural ÇALIŞMAZ.
    if (!isNum(i.margin.costPrice)) return { kind: 'skip', reason: 'cost_missing' };
    if (!isNum(i.margin.vatRate)) return { kind: 'skip', reason: 'vat_missing' };
    if (i.margin.commission.source === 'unknown' || !isNum(i.margin.commission.rate)) return { kind: 'skip', reason: 'commission_unknown' };
    const own = i.variant.ownPrice;
    if (!isNum(own) || own <= 0) return { kind: 'skip', reason: 'no_price' };
    const bb = i.buybox;
    if (!bb || (bb.status !== 'winning' && bb.status !== 'losing') || !isNum(bb.price) || !bb.checkedAt) return { kind: 'skip', reason: 'no_buybox', before: own };
    // K13: bayat veriyle öneri yok.
    if (now - bb.checkedAt.getTime() > i.freshnessMin * 60_000) return { kind: 'skip', reason: 'stale_data', before: own };
    if (c.excludeIfOutOfStock && !(i.variant.stock > 0)) return { kind: 'skip', reason: 'out_of_stock', before: own };

    const applied = i.history.filter((h) => h.source === 'suggestion');
    const lastApplied = applied.reduce<number | null>((m, h) => (m === null || h.at.getTime() > m ? h.at.getTime() : m), null);
    // Yayın gecikmesi: son uygulamadan sonra yeterince yeni gözlem yoksa karar verilmez (yanlış "dış değişiklik" alarmını da önler).
    if (lastApplied !== null && bb.checkedAt.getTime() - lastApplied < PUBLISH_GRACE_MS) return { kind: 'skip', reason: 'awaiting_publish', before: own };
    // K17: buybox bizdeyse görünen fiyat bizim canlı fiyatımızdır; kayıtlı kanal fiyatından farklıysa fiyat dışarıda değişmiştir → kural durur.
    if (bb.status === 'winning' && k(bb.price) !== k(own)) return { kind: 'pause_rule', reason: 'external_change' };
    // K12: salınım → kural durur; sıklık/soğuma → atla.
    if (isOscillating(i.history, i.now)) return { kind: 'pause_rule', reason: 'oscillation' };
    const last24 = applied.filter((h) => now - h.at.getTime() <= DAY);
    if (last24.length >= c.maxChangesPerDay) return { kind: 'skip', reason: 'daily_limit', before: own };
    if (lastApplied !== null && now - lastApplied < c.cooldownMin * 60_000) return { kind: 'skip', reason: 'cooldown', before: own };
    if (bb.status === 'winning') return { kind: 'skip', reason: 'already_winning', before: own };

    const step = Math.max(1, k(c.step));
    const bbK = k(bb.price);
    // K1: fark = max(TL, %); kuruşa yuvarlanınca 0 ise eşitleme sayılır ve reddedilir.
    const pctK = isNum(c.deltaPercent) ? Math.round((bbK * c.deltaPercent) / 100) : 0;
    const delta = Math.max(isNum(c.deltaAmount) ? k(c.deltaAmount) : 0, pctK);
    if (delta < 1) return { kind: 'skip', reason: 'equalize_forbidden', before: own };
    const warnings: Warning[] = [];
    const reasons: string[] = [`mode_${c.mode}`, 'buybox_held_by_other'];
    let target = c.mode === 'below' ? floorTo(bbK - delta, step) : ceilTo(bbK + delta, step);
    if (target === bbK) { target += c.mode === 'below' ? -step : step; warnings.push('extra_step_k1'); }

    // K7: taban (zorunlu) ve tavan.
    const floorTl = floorPrice(i.margin, c.floorMarginPercent);
    if (floorTl === null) return { kind: 'skip', reason: 'floor_unreachable', floor: null, before: own };
    const floorK = k(floorTl), ceilK = k(c.ceiling);
    if (target > ceilK) {
        target = floorTo(ceilK, step);
        warnings.push('ceiling_applied');
        if (c.mode === 'above' && target <= bbK) return { kind: 'skip', reason: 'above_ceiling', floor: floorTl, before: own };
    }
    if (target < floorK) return { kind: 'skip', reason: 'below_floor', floor: floorTl, before: own };

    // K9: liste (üstü çizili) fiyat asla yükseltilmez; üstü çizili fiyat gösterilen üründe yalnız aşağı yönlü öneri (uyarılı).
    const ownK = k(own);
    const listK = isNum(i.variant.listPrice) && i.variant.listPrice > 0 ? k(i.variant.listPrice) : null;
    if (listK !== null && target > listK) return { kind: 'skip', reason: 'above_list_price', floor: floorTl, before: own };
    const discountShown = listK !== null && listK > ownK;
    if (discountShown && target > ownK) return { kind: 'skip', reason: 'discount_display_active', floor: floorTl, before: own };
    if (discountShown) warnings.push('discount_display_active');

    // K8: yukarı yönlü artış sınırı — son 24 saatin ve 30 günün en düşük fiyatına göre.
    if (target > ownK) {
        const prices = (ms: number) => [ownK, ...i.history.filter((h) => now - h.at.getTime() <= ms).flatMap((h) => [k(h.salePrice), ...(isNum(h.previousPrice) ? [k(h.previousPrice)] : [])])];
        const low24 = Math.min(...prices(DAY)), low30 = Math.min(...prices(30 * DAY));
        const allowed = Math.min(
            Math.floor(low24 * (1 + Math.min(c.maxIncreasePercentPerDay, PLATFORM_LIMITS.maxIncreasePercentPerDay) / 100)),
            Math.floor(low30 * (1 + PLATFORM_LIMITS.maxIncreasePercent30d / 100)),
        );
        if (target > allowed) {
            target = floorTo(allowed, step);
            warnings.push('increase_capped');
            if (target <= ownK || (c.mode === 'above' && target <= bbK) || target < floorK) return { kind: 'skip', reason: 'increase_limit', floor: floorTl, before: own };
        }
    }
    if (target === ownK) return { kind: 'skip', reason: 'no_change', floor: floorTl, before: own };

    const after = tl(target);
    const fuse = fuseCheck({ mode: c.mode, before: own, after, floor: floorTl, ceiling: c.ceiling, buyboxPrice: bb.price, listPrice: listK === null ? null : tl(listK) });
    if (fuse.length) return { kind: 'skip', reason: 'fuse_rejected', floor: floorTl, before: own };
    const pb = profitAt(own, i.margin), pa = profitAt(after, i.margin);
    if (pa.confidence === 'partial') warnings.push('partial_deductions');
    reasons.push(target < ownK ? 'price_down' : 'price_up');
    return {
        kind: 'suggest', before: tl(ownK), after, floor: floorTl, ceiling: c.ceiling, listPrice: listK === null ? null : tl(listK), buyboxPrice: tl(bbK),
        profitBefore: pb.profit, profitAfter: pa.profit, reasons, warnings,
    };
}
