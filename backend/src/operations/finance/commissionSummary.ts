// COM-03 / COM-07 — komisyon kaynagi cozumleme + hakedis (settlements) satirlarindan ozet. SAF fonksiyonlar (DB/ag yok).
// Oncelik: tenant override (COM-04: kategori > kanal varsayilan) > gerceklesen (hakedis) > tahmini (kategori tablosu) > bilinmiyor.
// Bilinmeyen ASLA %0 sayilmaz (COM-02): oran `null` doner. Gercek `0` (ör. kampanya) korunur.

export type CommissionSource = 'override' | 'actual' | 'estimated' | 'unknown';

/** Ozet icin gereken alt kume: Financial kaydi (lean). Barkod `meta.barcode`'dadir. */
export interface SettlementRow {
    transactionType: string; // 'SALE' | 'RETURN' | ...
    commissionRate?: number | null;
    commissionAmount?: number | null;
    sellerRevenue?: number | null;
    payoutDate?: Date | string | null;
    paymentOrderId?: string | null;
    orderNumber?: string | null;
    meta?: { barcode?: string; paymentPeriod?: number } | null;
}

export interface ActualCommission {
    /** Satis satirlarinin oran ortalamasi (genelde tek deger). */
    rate: number;
    /** SALE satirlari toplami. */
    amount: number;
    /** SALE satirlari `sellerRevenue` toplami. */
    sellerRevenue: number;
    /** Iade satirlarinda geri gelen komisyon toplami (mutlak deger; isaret pazaryerine bagli oldugundan abs). */
    returnedAmount: number;
    lineCount: number;
    /** En gec hakedis (odeme) tarihi; bilinmiyorsa null. */
    payoutDate: Date | null;
    paymentOrderId: string | null;
    paymentPeriod: number | null;
}

export interface ResolvedCommission {
    source: CommissionSource;
    rate: number | null;
    actual: ActualCommission | null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function barcodeOf(row: SettlementRow): string | undefined {
    const b = row.meta?.barcode;
    return typeof b === 'string' && b !== '' ? b : undefined;
}

/** Bir barkodun hakedis satirlarindan (SALE + RETURN) gerceklesen ozet; oran verisi yoksa null. */
export function summarizeActual(rows: SettlementRow[]): ActualCommission | null {
    const sales = rows.filter(r => r.transactionType === 'SALE' && isNum(r.commissionRate));
    if (sales.length === 0) return null;
    let payout: Date | null = null;
    let paymentOrderId: string | null = null;
    let paymentPeriod: number | null = null;
    for (const r of sales) {
        if (r.payoutDate) {
            const d = new Date(r.payoutDate);
            if (!Number.isNaN(d.getTime()) && (!payout || d > payout)) { payout = d; paymentOrderId = r.paymentOrderId ?? null; }
        }
        if (isNum(r.meta?.paymentPeriod)) paymentPeriod = r.meta!.paymentPeriod as number;
    }
    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
        rate: round2(sales.reduce((a, r) => a + (r.commissionRate as number), 0) / sales.length),
        amount: round2(sales.reduce((a, r) => a + (isNum(r.commissionAmount) ? r.commissionAmount : 0), 0)),
        sellerRevenue: round2(sales.reduce((a, r) => a + (isNum(r.sellerRevenue) ? r.sellerRevenue : 0), 0)),
        returnedAmount: round2(rows.filter(r => r.transactionType === 'RETURN').reduce((a, r) => a + Math.abs(isNum(r.commissionAmount) ? r.commissionAmount : 0), 0)),
        lineCount: sales.length,
        payoutDate: payout,
        paymentOrderId,
        paymentPeriod,
    };
}

/** Oncelik zinciri: override > gerceklesen > tahmini > bilinmiyor. */
export function resolveCommission(input: { overrideRate?: number | null; actual?: ActualCommission | null; estimatedRate?: number | null }): ResolvedCommission {
    const actual = input.actual ?? null;
    if (isNum(input.overrideRate)) return { source: 'override', rate: input.overrideRate, actual };
    if (actual) return { source: 'actual', rate: actual.rate, actual };
    if (isNum(input.estimatedRate)) return { source: 'estimated', rate: input.estimatedRate, actual: null };
    return { source: 'unknown', rate: null, actual: null };
}

/** Tenant override satiri (yalniz cozumleme alanlari; bkz. ./commissionOverrides). */
export interface OverrideRow { scope: 'category' | 'default' | string; platformCategoryId?: string | null; rate: number }

/**
 * COM-04: tenant override orani. Kategori override (platform kategori kimligi eslesirse) > kanal varsayilan override > null.
 * `rows` ayni kanala aittir (yukleyici kanala gore suzer). Gercek %0 korunur (yalniz `null` = override yok).
 */
export function tenantOverrideRate(rows: ReadonlyArray<OverrideRow>, ctx: { platformCategoryId?: string | null }): number | null {
    if (ctx.platformCategoryId !== undefined && ctx.platformCategoryId !== null && ctx.platformCategoryId !== '') {
        const cat = rows.find(r => r.scope === 'category' && r.platformCategoryId != null && String(r.platformCategoryId) === String(ctx.platformCategoryId));
        if (cat && isNum(cat.rate)) return cat.rate;
    }
    const def = rows.find(r => r.scope === 'default');
    return def && isNum(def.rate) ? def.rate : null;
}

/** Barkod -> satirlar gruplamasi (barkodsuz satirlar atlanir). */
export function groupByBarcode(rows: SettlementRow[]): Map<string, SettlementRow[]> {
    const m = new Map<string, SettlementRow[]>();
    for (const r of rows) {
        const b = barcodeOf(r);
        if (!b) continue;
        const a = m.get(b);
        if (a) a.push(r); else m.set(b, [r]);
    }
    return m;
}

export interface CategoryRateSummary { categoryId: string | null; avgRate: number; sampleCount: number }

/**
 * SALE satirlarinin kategori basina ortalama gerceklesen orani. `barcodeToCategory` disinda kalan barkodlar `categoryId:null`
 * altinda toplanir. Ortalama satir sayisi agirlikli (her hakedis satiri esit); `sampleCount` ile birlikte doner.
 */
export function averageRateByCategory(
    perBarcode: ReadonlyArray<{ barcode: string; rateSum: number; count: number }>,
    barcodeToCategory: ReadonlyMap<string, string>,
): CategoryRateSummary[] {
    const acc = new Map<string | null, { sum: number; n: number }>();
    for (const b of perBarcode) {
        const key = barcodeToCategory.get(b.barcode) ?? null;
        const cur = acc.get(key) ?? { sum: 0, n: 0 };
        cur.sum += b.rateSum; cur.n += b.count;
        acc.set(key, cur);
    }
    return [...acc.entries()]
        .map(([categoryId, v]) => ({ categoryId, avgRate: Math.round((v.sum / v.n) * 100) / 100, sampleCount: v.n }))
        .sort((a, b) => b.sampleCount - a.sampleCount);
}
