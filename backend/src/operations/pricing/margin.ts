// PRC-R1: kâr önizlemesi — SAF fonksiyonlar (DB/ağ yok). Kesinti modeli COM-07 `computeNetRevenue`'dur (komisyon kaynağı etiketli,
// komisyona KDV, hizmet bedeli, kargo katkısı, stopaj); burada yalnız satış KDV'si ve birim maliyet düşülür:
//   kâr = net (brüt − pazaryeri kesintileri) − satış KDV'si (brüt − brüt/(1+KDV)) − maliyet (KDV hariç)
// Bilinmeyen bileşen ASLA 0 sayılmaz: maliyet/KDV/komisyon yoksa kâr `null`; diğer kesintiler eksikse kâr "kısmi" (`missing` listesi).
// Komisyona ödenen KDV'nin indirilebilirliği hesaba katılmaz (muhafazakâr; belgede yazılı).
import { computeNetRevenue, roundMoney, type NetRevenueDeductions, type CommissionRateSource, type ComponentKind } from '@operations/finance/netRevenue';

export type MarginMissing = 'cost' | 'vat' | 'commission' | ComponentKind;

export interface MarginContext {
    costPrice: number | null;
    /** Ürün KDV oranı (%); bilinmiyorsa null (Product.taxPercentage 0 = ayarsız). */
    vatRate: number | null;
    commission: { rate: number | null; source: CommissionRateSource };
    deductions: NetRevenueDeductions;
}

export interface ProfitAt {
    price: number;
    net: number | null;
    salesVat: number | null;
    profit: number | null;
    /** Kâr / brüt (KDV dahil) yüzdesi. */
    marginPercent: number | null;
    confidence: 'estimated' | 'partial' | 'unknown';
    missing: MarginMissing[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function profitAt(price: number, ctx: MarginContext): ProfitAt {
    const net = computeNetRevenue({ grossPrice: price, vatRate: ctx.vatRate, commission: ctx.commission, deductions: ctx.deductions });
    const missing: MarginMissing[] = [];
    if (!isNum(ctx.costPrice)) missing.push('cost');
    if (!isNum(ctx.vatRate)) missing.push('vat');
    if (net.net === null) missing.push('commission');
    for (const m of net.missing) if (m !== 'commission') missing.push(m);
    const salesVat = isNum(ctx.vatRate) ? roundMoney(price - price / (1 + ctx.vatRate / 100)) : null;
    const hard = !isNum(ctx.costPrice) || salesVat === null || net.net === null;
    const profit = hard ? null : roundMoney((net.net as number) - (salesVat as number) - (ctx.costPrice as number));
    return {
        price: roundMoney(price), net: net.net, salesVat, profit,
        marginPercent: profit !== null && price > 0 ? Math.round((profit / price) * 1000) / 10 : null,
        confidence: hard ? 'unknown' : missing.length > 0 ? 'partial' : 'estimated',
        missing,
    };
}

/**
 * Başa baş (taban) fiyat: kâr = 0 olan KDV dahil brüt fiyat. Model fiyatta doğrusal olduğundan iki noktadan çözülür, kuruşa YUKARI
 * yuvarlanır. Kâr hesaplanamıyorsa (maliyet/KDV/komisyon yok) ya da eğim ≤ 0 ise null. Eksik kesinti varsa taban da kısmidir.
 */
export function breakEvenPrice(ctx: MarginContext): number | null {
    const a = profitAt(0, ctx), b = profitAt(1000, ctx);
    if (a.profit === null || b.profit === null) return null;
    const slope = (b.profit - a.profit) / 1000;
    if (!(slope > 0)) return null;
    const p = -a.profit / slope;
    return p <= 0 ? 0 : Math.ceil(Math.round(p * 1e6) / 1e4) / 100;
}

export type BuyboxState = 'winning' | 'losing' | 'not_found' | 'unchecked';

export interface MarginPreviewInput {
    ownPrice: number | null;
    buybox: { status: BuyboxState; price: number | null; order: number | null; observedAt: Date | null; hasMultipleSeller: boolean | null };
    ctx: MarginContext;
    costUpdatedAt: Date | null;
    freshnessMin: number;
    now: Date;
}

export type EligibilityReason = 'cost_missing' | 'vat_missing' | 'commission_unknown';

export function buildMarginPreview(i: MarginPreviewInput) {
    const current = isNum(i.ownPrice) ? profitAt(i.ownPrice, i.ctx) : null;
    const bbPrice = i.buybox.price;
    const atBuybox = isNum(bbPrice) ? profitAt(bbPrice, i.ctx) : null;
    const floor = breakEvenPrice(i.ctx);
    const ageMin = i.buybox.observedAt ? Math.floor((i.now.getTime() - i.buybox.observedAt.getTime()) / 60_000) : null;
    const gapAmount = isNum(i.ownPrice) && isNum(bbPrice) ? roundMoney(i.ownPrice - bbPrice) : null;
    const reasons: EligibilityReason[] = [];
    if (!isNum(i.ctx.costPrice)) reasons.push('cost_missing');
    if (!isNum(i.ctx.vatRate)) reasons.push('vat_missing');
    if (i.ctx.commission.source === 'unknown' || !isNum(i.ctx.commission.rate)) reasons.push('commission_unknown');
    return {
        ownPrice: isNum(i.ownPrice) ? roundMoney(i.ownPrice) : null,
        buybox: {
            status: i.buybox.status, order: i.buybox.order, price: isNum(bbPrice) ? roundMoney(bbPrice) : null, hasMultipleSeller: i.buybox.hasMultipleSeller,
            observedAt: i.buybox.observedAt ? i.buybox.observedAt.toISOString() : null, ageMinutes: ageMin,
            fresh: ageMin !== null && ageMin <= i.freshnessMin,
        },
        gap: {
            amount: gapAmount,
            percent: gapAmount !== null && isNum(bbPrice) && bbPrice > 0 ? Math.round((gapAmount / bbPrice) * 1000) / 10 : null,
        },
        current, atBuybox,
        breakEvenPrice: floor,
        /** "Buybox'a ulaşmak tabanın altında": buybox bizde değil ve buybox fiyatı başa baş fiyatın altında (o fiyatta zarar). */
        buyboxBelowFloor: i.buybox.status === 'losing' && isNum(bbPrice) && floor !== null && bbPrice < floor,
        commission: { rate: i.ctx.commission.rate, source: i.ctx.commission.source },
        cost: { price: i.ctx.costPrice, updatedAt: i.costUpdatedAt ? i.costUpdatedAt.toISOString() : null },
        vatRate: i.ctx.vatRate,
        /** PRC-R0: maliyet/KDV/komisyon eksikse kural ve öneri KAPALI (R2 bu alanı okur); ekran uyarı gösterir. */
        rulesEligible: reasons.length === 0,
        ineligibleReasons: reasons,
    };
}
