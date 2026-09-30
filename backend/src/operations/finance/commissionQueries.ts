// COM-03 / COM-07 okuma tarafi: hakedis (FinancialTransactions) + siparis kalemi + kategori tablosu -> komisyon kaynagi etiketli ozet.
// Yalniz OKUR (yazim yok). DB modelleri `clientDB` uzerinden (tenant izolasyonu: clientDB secimi). Saf mantik: ./commissionSummary.
import { PlatformMappingProvider } from '@integration/modules/provider/PlatformMappingProvider';
import { CommissionOverrideStore } from './commissionOverrides';
import { computeNetRevenue, type NetRevenueResult } from './netRevenue';
import { resolveDeductionRules } from '@integration/config/financeDeductionRules';
import {
    averageRateByCategory, groupByBarcode, resolveCommission, summarizeActual, tenantOverrideRate,
    type ResolvedCommission, type SettlementRow, type CategoryRateSummary,
} from './commissionSummary';

const MAX_BARCODES = 200;
const MAX_ORDER_ROWS = 1000;
const MAX_AGG_BARCODES = 50_000;
export const REALIZED_DEFAULT_DAYS = 90;
export const REALIZED_MAX_DAYS = 180;

/** Financial kayitlari mapper'da 'TRENDYOL', siparisler 'trendyol' yazilir; iki yazimi da esle. */
export function codeVariants(integrationCode: string): string[] {
    return [...new Set([integrationCode, integrationCode.toLowerCase(), integrationCode.toUpperCase()])];
}

/** barkod -> yerel kategori kimligi (Variants -> Products.category). Eslesmeyen barkod haritada yoktur. */
export async function barcodeCategories(clientDB: any, barcodes: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (barcodes.length === 0) return out;
    const variants: any[] = await clientDB.getVariantModel().find({ barcode: { $in: barcodes } }, { barcode: 1, productId: 1 }).lean();
    const productIds = [...new Set(variants.map(v => String(v.productId)).filter(Boolean))];
    if (productIds.length === 0) return out;
    const products: any[] = await clientDB.getProductModel().find({ _id: { $in: productIds } }, { category: 1 }).lean();
    const catByProduct = new Map(products.filter(p => p.category).map(p => [String(p._id), String(p.category)]));
    for (const v of variants) {
        const c = catByProduct.get(String(v.productId));
        if (v.barcode && c) out.set(String(v.barcode), c);
    }
    return out;
}

/** Tahmini oran (kanal komisyon tablosu; AttributeMappings uzerinden): barkod -> oran. Oran bulunamayan barkod atlanir. */
async function estimateByBarcode(clientDB: any, clientId: any, integrationCode: string, barcodes: string[], cats: Map<string, string>): Promise<Map<string, number>> {
    const provider = new PlatformMappingProvider(clientDB, clientId, integrationCode.toLowerCase());
    const perCategory = new Map<string, number | null>();
    const out = new Map<string, number>();
    for (const b of barcodes) {
        const cat = cats.get(b);
        if (!cat) continue;
        if (!perCategory.has(cat)) perCategory.set(cat, await provider.getLocalCategoryCommission(cat));
        const r = perCategory.get(cat);
        if (typeof r === 'number') out.set(b, r);
    }
    return out;
}

async function resolveMany(clientDB: any, clientId: any, integrationCode: string, barcodes: string[], rowsByBarcode: Map<string, SettlementRow[]>) {
    const cats = await barcodeCategories(clientDB, barcodes);
    // COM-04: tenant override (onbellekli okuma). Override yoksa kategori->platform eslemesi aranmaz (ek maliyet yok).
    const overrideRows = await new CommissionOverrideStore(clientDB, clientId, integrationCode).loadRows();
    const platformCatByLocal = new Map<string, string | null>();
    if (overrideRows.some(r => r.scope === 'category')) {
        const provider = new PlatformMappingProvider(clientDB, clientId, integrationCode.toLowerCase());
        for (const c of new Set(cats.values())) {
            const p: any = await provider.getPlatformCategoryId(c);
            platformCatByLocal.set(c, p === undefined || p === null || p === '' ? null : String(p));
        }
    }
    const missingActual = barcodes.filter(b => !summarizeActual(rowsByBarcode.get(b) ?? []));
    const estimates = missingActual.length ? await estimateByBarcode(clientDB, clientId, integrationCode, missingActual, cats) : new Map<string, number>();
    const result = new Map<string, ResolvedCommission & { categoryId: string | null }>();
    for (const b of barcodes) {
        const categoryId = cats.get(b) ?? null;
        const resolved = resolveCommission({
            overrideRate: tenantOverrideRate(overrideRows, { platformCategoryId: categoryId ? platformCatByLocal.get(categoryId) ?? null : null }),
            actual: summarizeActual(rowsByBarcode.get(b) ?? []),
            estimatedRate: estimates.get(b) ?? null,
        });
        result.set(b, { ...resolved, categoryId });
    }
    return result;
}

/** Siparis bazli: kalem basina komisyon kaynagi + oran + (varsa) gerceklesen tutar/hakedis tarihi. */
export async function getOrderCommissionSummary(clientDB: any, clientId: any, input: { orderNumber: string; integrationCode: string }) {
    const codes = codeVariants(input.integrationCode);
    const rows: SettlementRow[] = await clientDB.getFinancialTransactionModel()
        .find({ integrationCode: { $in: codes }, orderNumber: input.orderNumber, transactionType: { $in: ['SALE', 'RETURN'] } })
        .limit(MAX_ORDER_ROWS).lean();
    const order: any = await clientDB.getOrderModel().findOne({ integrationCode: { $in: codes }, orderNumber: input.orderNumber }, { items: 1 }).lean();
    const byBarcode = groupByBarcode(rows);
    const items: any[] = Array.isArray(order?.items) ? order.items : [];
    const itemBarcodes = [...new Set(items.map(i => i?.barcode).filter((b: any): b is string => typeof b === 'string' && b !== ''))];
    const resolved = await resolveMany(clientDB, clientId, input.integrationCode, itemBarcodes, byBarcode);

    const rules = resolveDeductionRules(input.integrationCode);
    const lines = items.map(i => {
        const r = i.barcode ? resolved.get(i.barcode) : undefined;
        return {
            barcode: i.barcode ?? null, sku: i.sku ?? null, productName: i.productName ?? null, quantity: i.quantity ?? null,
            commission: r ? toDto(r) : toDto(undefined),
            net: lineNet(i, r, rules),
        };
    });
    const known = new Set(itemBarcodes);
    return {
        orderNumber: input.orderNumber,
        integrationCode: input.integrationCode,
        orderFound: !!order,
        items: lines,
        // Hakedis satiri var ama siparis kaleminde (barkod) eslesmeyen -> sessizce atilmaz, sayisi bildirilir.
        unmatchedSettlementRows: rows.filter(r => { const b = r.meta?.barcode; return !b || !known.has(b); }).length,
    };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * COM-07: siparis kalemi net geliri (kalem toplami uzerinden; okuma aninda, kalici alan yok). Brut = `totalPrice` (yoksa unitPrice x adet).
 * Sabit bedel/kargo katkisi KALEM BASINA tanimli oldugundan adetle carpilir. Gerceklesen hakedis varsa komisyon tutari gerceklesenden alinir.
 */
function lineNet(item: any, r: (ResolvedCommission & { categoryId: string | null }) | undefined, rules: ReturnType<typeof resolveDeductionRules>): NetRevenueResult {
    const qty = num(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
    const gross = num(item?.totalPrice) ?? (num(item?.unitPrice) !== null ? item.unitPrice * qty : null);
    const scaled = {
        ...rules,
        serviceFeeFixed: rules.serviceFeeFixed == null ? null : rules.serviceFeeFixed * qty,
        shippingContribution: rules.shippingContribution == null ? null : rules.shippingContribution * qty,
    };
    return computeNetRevenue({
        grossPrice: gross as number, // null -> computeNetRevenue 'unknown' doner
        vatRate: num(item?.taxRate),
        commission: { rate: r?.rate ?? null, source: r?.source ?? 'unknown' },
        deductions: scaled,
        settled: r?.actual ? { commissionAmount: r.actual.amount, sellerRevenue: r.actual.sellerRevenue } : null,
    });
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
export const MAX_NET_PREVIEW_ITEMS = 200;

export interface NetPreviewItemInput { barcode?: string; variantId?: string; grossPrice?: number; integrationCode: string }

/**
 * COM-07 urun liste/detay: brut fiyat + komisyon orani/kaynagi + tahmini net. `grossPrice` verilmezse varyantin brut satis fiyati
 * (kanal bazli fiyat aciksa `platforms.<kod>.prices.salePrice`, degilse `prices.salePrice`). Gercek satis tutari olmadigindan
 * `settled` KULLANILMAZ (oran bazli tahmin); komisyon kaynagi etiketi korunur. Yalniz OKUR.
 */
export async function getNetRevenuePreview(clientDB: any, clientId: any, input: { items: NetPreviewItemInput[] }) {
    const items = input.items.slice(0, MAX_NET_PREVIEW_ITEMS);
    const ids = [...new Set(items.map(i => i.variantId).filter((v): v is string => typeof v === 'string' && OBJECT_ID.test(v)))];
    const barcodesIn = [...new Set(items.map(i => i.barcode).filter((b): b is string => typeof b === 'string' && b !== ''))];
    const or: any[] = [];
    if (barcodesIn.length) or.push({ barcode: { $in: barcodesIn } });
    if (ids.length) or.push({ _id: { $in: ids } });
    const variants: any[] = or.length ? await clientDB.getVariantModel().find({ $or: or }, { barcode: 1, productId: 1, prices: 1, platforms: 1 }).lean() : [];
    const byBarcode = new Map(variants.filter(v => v.barcode).map(v => [String(v.barcode), v]));
    const byId = new Map(variants.map(v => [String(v._id), v]));
    const productIds = [...new Set(variants.map(v => String(v.productId)).filter(Boolean))];
    const products: any[] = productIds.length ? await clientDB.getProductModel().find({ _id: { $in: productIds } }, { taxPercentage: 1 }).lean() : [];
    const taxByProduct = new Map(products.map(p => [String(p._id), num(p.taxPercentage)]));

    const variantOf = (i: NetPreviewItemInput) => (i.barcode ? byBarcode.get(i.barcode) : undefined) ?? (i.variantId ? byId.get(i.variantId) : undefined);
    const codes = [...new Set(items.map(i => i.integrationCode))];
    const commissionBy = new Map<string, Map<string, any>>();
    for (const code of codes) {
        const bcs = [...new Set(items.filter(i => i.integrationCode === code).map(i => variantOf(i)?.barcode ?? i.barcode).filter((b): b is string => typeof b === 'string' && b !== ''))];
        const r: any = bcs.length ? await getCommissionByBarcodes(clientDB, clientId, { integrationCode: code, barcodes: bcs }) : { items: [] };
        commissionBy.set(code, new Map(r.items.map((x: any) => [x.barcode, x.commission])));
    }

    return {
        items: items.map(i => {
            const v = variantOf(i);
            const barcode: string | null = v?.barcode ?? i.barcode ?? null;
            const code = i.integrationCode.toLowerCase();
            const platformPrice = v?.prices?.isPlatformBasedPrice ? num(v?.platforms?.[code]?.prices?.salePrice) : null;
            const variantPrice = v ? (v.prices?.isPlatformBasedPrice ? platformPrice : num(v.prices?.salePrice)) : null;
            const gross = num(i.grossPrice) ?? variantPrice;
            const grossSource = num(i.grossPrice) !== null ? 'input' : variantPrice !== null ? 'variant' : 'unknown';
            const tax = v ? taxByProduct.get(String(v.productId)) ?? null : null;
            const vatRate = tax !== null && tax > 0 ? tax : null; // Product.taxPercentage varsayilani 0: 0 "ayarsiz" sayilir (stopaj matrahi bilinmiyor)
            const c = barcode ? commissionBy.get(i.integrationCode)?.get(barcode) : undefined;
            const commission = c ?? toDto(undefined);
            const net = computeNetRevenue({
                grossPrice: gross as number, vatRate,
                commission: { rate: commission.rate, source: commission.source },
                deductions: resolveDeductionRules(i.integrationCode),
            });
            return { barcode, variantId: v ? String(v._id) : (i.variantId ?? null), integrationCode: i.integrationCode, variantFound: !!v, grossSource, vatRate, commission: { source: commission.source, rate: commission.rate, categoryId: commission.categoryId ?? null }, net };
        }),
    };
}

/** Barkod bazli (liste/detay net fiyat): son N gunun hakedis satirlari -> gerceklesen; yoksa tahmini; yoksa bilinmiyor. */
export async function getCommissionByBarcodes(clientDB: any, clientId: any, input: { integrationCode: string; barcodes: string[]; days?: number }) {
    const barcodes = [...new Set(input.barcodes)].slice(0, MAX_BARCODES);
    const days = clampDays(input.days);
    const since = new Date(Date.now() - days * 86_400_000);
    const rows: SettlementRow[] = barcodes.length === 0 ? [] : await clientDB.getFinancialTransactionModel()
        .find({ integrationCode: { $in: codeVariants(input.integrationCode) }, transactionType: { $in: ['SALE', 'RETURN'] }, 'meta.barcode': { $in: barcodes }, transactionDate: { $gte: since } })
        .limit(MAX_AGG_BARCODES).lean();
    const resolved = await resolveMany(clientDB, clientId, input.integrationCode, barcodes, groupByBarcode(rows));
    return { integrationCode: input.integrationCode, days, items: barcodes.map(b => ({ barcode: b, commission: toDto(resolved.get(b)) })) };
}

/** Kategori basina son N gunun ortalama GERCEKLESEN orani (COM-03 kabul olcutu). */
export async function getRealizedCommissionByCategory(clientDB: any, input: { integrationCode: string; days?: number }): Promise<{ integrationCode: string; days: number; categories: Array<CategoryRateSummary & { title: string | null }> }> {
    const days = clampDays(input.days);
    const since = new Date(Date.now() - days * 86_400_000);
    const grouped: Array<{ _id: string; rateSum: number; count: number }> = await clientDB.getFinancialTransactionModel().aggregate([
        { $match: { integrationCode: { $in: codeVariants(input.integrationCode) }, transactionType: 'SALE', commissionRate: { $type: 'number' }, transactionDate: { $gte: since }, 'meta.barcode': { $type: 'string' } } },
        { $group: { _id: '$meta.barcode', rateSum: { $sum: '$commissionRate' }, count: { $sum: 1 } } },
        { $limit: MAX_AGG_BARCODES },
    ]);
    const perBarcode = grouped.map(g => ({ barcode: g._id, rateSum: g.rateSum, count: g.count }));
    const cats = await barcodeCategories(clientDB, perBarcode.map(p => p.barcode));
    const summary = averageRateByCategory(perBarcode, cats);
    const ids = summary.map(s => s.categoryId).filter((x): x is string => !!x);
    const titles = new Map<string, string>();
    if (ids.length) {
        const docs: any[] = await clientDB.getCategoryModel().find({ _id: { $in: ids } }, { title: 1 }).lean();
        for (const d of docs) titles.set(String(d._id), d.title);
    }
    return { integrationCode: input.integrationCode, days, categories: summary.map(s => ({ ...s, title: s.categoryId ? (titles.get(s.categoryId) ?? null) : null })) };
}

function clampDays(raw: unknown): number {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), REALIZED_MAX_DAYS) : REALIZED_DEFAULT_DAYS;
}

/** FE sozlesmesi: `source` etiketi + oran (bilinmiyorsa null) + gerceklesen ayrinti. */
function toDto(r: (ResolvedCommission & { categoryId: string | null }) | undefined) {
    if (!r) return { source: 'unknown' as const, rate: null, categoryId: null, actual: null };
    return {
        source: r.source, rate: r.rate, categoryId: r.categoryId,
        actual: r.actual && {
            amount: r.actual.amount, sellerRevenue: r.actual.sellerRevenue, returnedAmount: r.actual.returnedAmount, lineCount: r.actual.lineCount,
            payoutDate: r.actual.payoutDate, paymentOrderId: r.actual.paymentOrderId, paymentPeriod: r.actual.paymentPeriod,
        },
    };
}
