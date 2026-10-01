// PRC-R0 (K57-S4): varyant birim maliyeti — TEK yazma/okuma noktası (ekran ve Otopilot/MCP aynı RPC'yi çağırır, ADR-0019).
// Maliyet = birim alış maliyeti, TL, KDV HARİÇ. `null` maliyeti siler ("girilmedi"). Her değişiklik `costUpdatedAt` yazar.
// Kapsam göstergesi: maliyeti girilmiş varyant / toplam varyant (yüzde). Maliyetsiz varyantta kâr hesaplanmaz ve kural/öneri kapalıdır.
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { AppError } from '@platform/core/errors';

const invalid = (message: string, err: z.ZodError) =>
    AppError.of('VALIDATION', { message, details: err.issues.map((x) => ({ path: x.path.join('.') })) });

export const MAX_COST = 10_000_000;
export const MAX_COST_ITEMS = 500;
/** Bu kadar günden eski maliyet "eski" uyarısı alır (kur/enflasyon, COMPETITION_PRICING E20). Kural kapatmaz; yalnız uyarı. */
export const COST_STALE_DAYS = 90;
const DAY = 86_400_000;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const money = z.number().finite().min(0).max(MAX_COST).refine((n) => Math.round(n * 100) === n * 100 || Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'en çok 2 ondalık');
const variantRef = z.object({
    variantId: z.string().regex(OBJECT_ID).optional(),
    barcode: z.string().min(1).max(128).optional(),
});

export const setCostsInput = z.object({
    items: z.array(variantRef.extend({ costPrice: money.nullable() }).strict()
        .refine((i) => !!i.variantId !== !!i.barcode, 'variantId ya da barcode (yalnız biri) zorunludur'))
        .min(1).max(MAX_COST_ITEMS),
}).strict();

export const listCostsInput = z.object({
    variantIds: z.array(z.string().regex(OBJECT_ID)).max(200).optional(),
    barcodes: z.array(z.string().min(1).max(128)).max(200).optional(),
    productId: z.string().regex(OBJECT_ID).optional(),
    missingOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    cursor: z.string().regex(OBJECT_ID).optional(),
}).strict();


export interface CostCoverage { total: number; withCost: number; percent: number; stale: number }

export function isStale(costUpdatedAt: Date | string | null | undefined, now: Date): boolean {
    if (!costUpdatedAt) return false;
    const t = new Date(costUpdatedAt).getTime();
    return Number.isFinite(t) && now.getTime() - t > COST_STALE_DAYS * DAY;
}

export function coveragePercent(withCost: number, total: number): number {
    return total > 0 ? Math.round((withCost / total) * 1000) / 10 : 0;
}

export async function costCoverage(clientDB: any, now: Date = new Date()): Promise<CostCoverage> {
    const model = clientDB.getVariantModel();
    const staleBefore = new Date(now.getTime() - COST_STALE_DAYS * DAY);
    const [total, withCost, stale] = await Promise.all([
        model.countDocuments({}),
        model.countDocuments({ costPrice: { $type: 'number' } }),
        model.countDocuments({ costPrice: { $type: 'number' }, costUpdatedAt: { $lt: staleBefore } }),
    ]);
    return { total, withCost, percent: coveragePercent(withCost, total), stale };
}

const toDto = (v: any, now: Date) => {
    const cost = typeof v.costPrice === 'number' && Number.isFinite(v.costPrice) ? v.costPrice : null;
    return {
        variantId: String(v._id), productId: v.productId ? String(v.productId) : null,
        sku: v.stockcode ?? null, barcode: v.barcode ?? null,
        costPrice: cost, costUpdatedAt: cost !== null && v.costUpdatedAt ? new Date(v.costUpdatedAt).toISOString() : null,
        stale: cost !== null && isStale(v.costUpdatedAt, now),
    };
};

/** Maliyet listesi (+ kapsam). Filtre verilmezse imleçli tüm varyantlar; `missingOnly` maliyeti olmayanlar. */
export async function listVariantCosts(clientDB: any, raw: unknown, now: Date = new Date()) {
    const parsed = listCostsInput.safeParse(raw ?? {});
    if (!parsed.success) throw invalid('Geçersiz maliyet listesi isteği.', parsed.error);
    const i = parsed.data;
    const limit = i.limit ?? 50;
    const filter: any = {};
    const or: any[] = [];
    if (i.variantIds?.length) or.push({ _id: { $in: i.variantIds.map((x) => new ObjectId(x)) } });
    if (i.barcodes?.length) or.push({ barcode: { $in: i.barcodes } });
    if (or.length) filter.$or = or;
    if (i.productId) filter.productId = new ObjectId(i.productId);
    if (i.missingOnly) filter.costPrice = { $not: { $type: 'number' } };
    if (i.cursor) filter._id = { $gt: new ObjectId(i.cursor) };
    const rows: any[] = await clientDB.getVariantModel()
        .find(filter, { productId: 1, stockcode: 1, barcode: 1, costPrice: 1, costUpdatedAt: 1 })
        .sort({ _id: 1 }).limit(limit + 1).lean();
    const page = rows.slice(0, limit);
    return {
        items: page.map((v) => toDto(v, now)),
        nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
        coverage: await costCoverage(clientDB, now),
        staleAfterDays: COST_STALE_DAYS,
    };
}

/**
 * Toplu maliyet yazımı (≤500). Bilinmeyen varyant `notFound`'a düşer (hata değil). Değeri değişmeyen kalem yazılmaz (tarih
 * korunur). Denetim: yetenek kaydı (`effect:'write'`) otomatik `AuditLogs` yazar (F7); önce/sonra burada döndürülür.
 */
export async function setVariantCosts(clientDB: any, raw: unknown, now: Date = new Date()) {
    const parsed = setCostsInput.safeParse(raw);
    if (!parsed.success) throw invalid('Geçersiz maliyet girdisi.', parsed.error);
    const items = parsed.data.items;
    const ids = items.filter((x) => x.variantId).map((x) => new ObjectId(x.variantId!));
    const bcs = items.filter((x) => x.barcode).map((x) => x.barcode!);
    const or: any[] = [];
    if (ids.length) or.push({ _id: { $in: ids } });
    if (bcs.length) or.push({ barcode: { $in: bcs } });
    const model = clientDB.getVariantModel();
    const found: any[] = await model.find({ $or: or }, { barcode: 1, costPrice: 1 }).lean();
    const byId = new Map(found.map((v) => [String(v._id), v]));
    const byBarcode = new Map(found.filter((v) => v.barcode).map((v) => [String(v.barcode), v]));

    const ops: any[] = [];
    const changes: Array<{ variantId: string; before: number | null; after: number | null }> = [];
    const notFound: string[] = [];
    let unchanged = 0;
    for (const it of items) {
        const v = it.variantId ? byId.get(it.variantId) : byBarcode.get(it.barcode!);
        if (!v) { notFound.push(it.variantId ?? it.barcode!); continue; }
        const before = typeof v.costPrice === 'number' ? v.costPrice : null;
        const after = it.costPrice === null ? null : Math.round(it.costPrice * 100) / 100;
        if (before === after) { unchanged++; continue; }
        ops.push({ updateOne: { filter: { _id: v._id }, update: after === null
            ? { $unset: { costPrice: '' }, $set: { costUpdatedAt: now } }
            : { $set: { costPrice: after, costUpdatedAt: now } } } });
        changes.push({ variantId: String(v._id), before, after });
    }
    if (ops.length) await model.bulkWrite(ops, { ordered: false });
    return { updated: changes.length, unchanged, notFound, changes: changes.slice(0, 50), coverage: await costCoverage(clientDB, now) };
}
