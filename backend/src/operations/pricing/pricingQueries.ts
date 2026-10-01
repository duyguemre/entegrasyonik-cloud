// PRC-R1: buybox listesi, 30 günlük geçmiş ve kâr önizlemesi — SALT OKUMA. Ekran ve Otopilot/MCP aynı fonksiyonları kullanır
// (yetenekler `pricing.buybox.list`, `pricing.margin.preview`). Tenant kapsamı ClientDB tutamağıdır; veri tenant dışına çıkmaz.
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { AppError } from '@platform/core/errors';
import { getIntegrationDescriptor, listIntegrationDescriptors } from '@integration/catalog/IntegrationDescriptorRegistry';
import { isFeatureEnabled } from '@integration/config/featureFlags';
import { resolveDeductionRules } from '@integration/config/financeDeductionRules';
import { getNetRevenuePreview } from '@operations/finance/commissionQueries';
import { roundMoney } from '@operations/finance/netRevenue';
import { loadCompetitionSettings, type EffectiveCompetitionSettings } from './competitionSettings';
import { ownChannelPrice } from './buyboxState';
import { buildMarginPreview, type BuyboxState } from './margin';
import { BUYBOX_CHANNEL, ELIGIBLE_FILTER } from './BuyboxRefreshJob';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const DAY = 86_400_000;
export const HISTORY_DAYS_MAX = 90;
const invalid = (message: string, err: z.ZodError) => AppError.of('VALIDATION', { message, details: err.issues.map((x) => ({ path: x.path.join('.') })) });

export const BUYBOX_LIST_STATUSES = ['winning', 'losing', 'not_found', 'unchecked'] as const;

export const listBuyboxInput = z.object({
    status: z.enum(BUYBOX_LIST_STATUSES).optional(),
    productIds: z.array(z.string().regex(OBJECT_ID)).max(100).optional(),
    barcodes: z.array(z.string().min(1).max(128)).max(100).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    cursor: z.string().regex(OBJECT_ID).optional(),
}).strict();

export const historyInput = z.object({
    barcode: z.string().min(1).max(128),
    days: z.number().int().min(1).max(HISTORY_DAYS_MAX).optional(),
}).strict();

export const marginPreviewInput = z.object({
    items: z.array(z.object({
        variantId: z.string().regex(OBJECT_ID).optional(),
        barcode: z.string().min(1).max(128).optional(),
        /** Varsayımsal fiyat (KDV dahil). Verilmezse kanal fiyatı. */
        price: z.number().finite().min(0).max(10_000_000).optional(),
    }).strict().refine((i) => !!i.variantId !== !!i.barcode, 'variantId ya da barcode (yalnız biri) zorunludur')).min(1).max(50),
}).strict();

/** Kanal destek tablosu: manifestodaki `pricing.buybox.read` düzeyi (yazılmamışsa `not_supported`; K57-S1 "desteklenmiyor"). */
export function buyboxChannelSupport(): Array<{ code: string; displayName: string; level: string; verified: boolean }> {
    return listIntegrationDescriptors()
        .filter((d) => d.category === 'marketplace')
        .map((d) => {
            const e = d.capabilities['pricing.buybox.read'];
            return { code: d.code, displayName: d.displayName, level: e?.level ?? 'not_supported', verified: !!e?.lastVerifiedAt };
        });
}

function settingsDto(s: EffectiveCompetitionSettings, enabled: boolean) {
    return { enabled, plan: s.plan, skuCap: s.skuCap, refreshMin: s.refreshMin, freshnessMin: s.freshnessMin, priority: s.priority, sources: s.sources };
}

function rowDto(v: any, s: EffectiveCompetitionSettings, enabled: boolean, now: Date) {
    const c = v.competition?.[BUYBOX_CHANNEL] ?? null;
    const own = ownChannelPrice(v, BUYBOX_CHANNEL);
    const checkedAt = c?.checkedAt ? new Date(c.checkedAt) : null;
    const next = checkedAt ? new Date(checkedAt.getTime() + s.refreshMin * 60_000) : null;
    const ageMin = checkedAt ? Math.floor((now.getTime() - checkedAt.getTime()) / 60_000) : null;
    const bb = typeof c?.buyboxPrice === 'number' ? c.buyboxPrice : null;
    const gap = own !== null && bb !== null ? roundMoney(own - bb) : null;
    return {
        variantId: String(v._id), productId: v.productId ? String(v.productId) : null, barcode: v.barcode ?? null, sku: v.stockcode ?? null,
        status: (c?.status ?? 'unchecked') as BuyboxState,
        buyboxOrder: typeof c?.buyboxOrder === 'number' ? c.buyboxOrder : null, buyboxPrice: bb,
        hasMultipleSeller: typeof c?.hasMultipleSeller === 'boolean' ? c.hasMultipleSeller : null,
        ownPrice: own, gapAmount: gap, gapPercent: gap !== null && bb ? Math.round((gap / bb) * 1000) / 10 : null,
        checkedAt: checkedAt ? checkedAt.toISOString() : null,
        /** Dürüst gösterim: tazeleme kapalıysa null; vadesi geçmişse `overdue` (bütçe/yoğunluk nedeniyle ertelendi). */
        nextRefreshAt: enabled && next ? next.toISOString() : null,
        overdue: enabled && !!next && next.getTime() < now.getTime() - 60_000,
        fresh: ageMin !== null && ageMin <= s.freshnessMin,
        lostAt: c?.lostAt ? new Date(c.lostAt).toISOString() : null,
    };
}

export async function listBuybox(clientDB: any, applicationDB: any, tid: number, raw: unknown, now: Date = new Date()) {
    const p = listBuyboxInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz buybox listesi isteği.', p.error);
    const i = p.data;
    const limit = i.limit ?? 50;
    const settings = await loadCompetitionSettings(applicationDB, tid);
    const enabled = isFeatureEnabled('competition', { tenantId: tid }) && settings.skuCap > 0;
    const filter: any = { ...ELIGIBLE_FILTER };
    if (i.status) filter['competition.trendyol.status'] = i.status === 'unchecked' ? { $exists: false } : i.status;
    if (i.productIds?.length) filter.productId = { $in: i.productIds.map((x) => new ObjectId(x)) };
    if (i.barcodes?.length) filter.barcode = { $in: i.barcodes };
    if (i.cursor) filter._id = { $gt: new ObjectId(i.cursor) };
    const model = clientDB.getVariantModel();
    const rows: any[] = await model.find(filter, {
        productId: 1, barcode: 1, stockcode: 1, prices: 1, [`platforms.${BUYBOX_CHANNEL}.prices`]: 1, [`competition.${BUYBOX_CHANNEL}`]: 1,
    }).sort({ _id: 1 }).limit(limit + 1).maxTimeMS(10_000).lean();
    const counts: any[] = await model.aggregate([
        { $match: ELIGIBLE_FILTER },
        { $group: { _id: { $ifNull: ['$competition.trendyol.status', 'unchecked'] }, n: { $sum: 1 } } },
    ]).option({ maxTimeMS: 10_000 });
    const summary: Record<string, number> = { winning: 0, losing: 0, not_found: 0, unchecked: 0 };
    for (const c of counts) if (c._id in summary) summary[c._id] = c.n;
    const eligible = Object.values(summary).reduce((a, b) => a + b, 0);
    const page = rows.slice(0, limit);
    return {
        channel: BUYBOX_CHANNEL,
        channels: buyboxChannelSupport(),
        settings: { ...settingsDto(settings, enabled), eligible, tracked: Math.min(eligible, settings.skuCap) },
        summary,
        items: page.map((v) => rowDto(v, settings, enabled, now)),
        nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
    };
}

export async function buyboxHistory(clientDB: any, raw: unknown, now: Date = new Date()) {
    const p = historyInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz buybox geçmişi isteği.', p.error);
    const days = p.data.days ?? 30;
    const since = new Date(now.getTime() - days * DAY);
    const rows: any[] = await clientDB.getBuyboxSnapshotModel()
        .find({ integrationCode: BUYBOX_CHANNEL, barcode: p.data.barcode, observedAt: { $gte: since } },
            { observedAt: 1, status: 1, buyboxOrder: 1, buyboxPrice: 1, ownPrice: 1, hasMultipleSeller: 1 })
        .sort({ observedAt: 1 }).limit(2000).maxTimeMS(10_000).lean();
    return {
        channel: BUYBOX_CHANNEL, barcode: p.data.barcode, days,
        points: rows.map((r) => ({
            at: new Date(r.observedAt).toISOString(), status: r.status, buyboxOrder: r.buyboxOrder ?? null,
            buyboxPrice: r.buyboxPrice ?? null, ownPrice: r.ownPrice ?? null,
        })),
    };
}

export async function previewMargin(clientDB: any, applicationDB: any, tid: number, raw: unknown, now: Date = new Date()) {
    const p = marginPreviewInput.safeParse(raw);
    if (!p.success) throw invalid('Geçersiz kâr önizleme isteği.', p.error);
    const items = p.data.items;
    const ids = items.filter((x) => x.variantId).map((x) => new ObjectId(x.variantId!));
    const bcs = items.filter((x) => x.barcode).map((x) => x.barcode!);
    const or: any[] = [];
    if (ids.length) or.push({ _id: { $in: ids } });
    if (bcs.length) or.push({ barcode: { $in: bcs } });
    const variants: any[] = await clientDB.getVariantModel().find({ $or: or }, {
        productId: 1, barcode: 1, stockcode: 1, prices: 1, costPrice: 1, costUpdatedAt: 1,
        [`platforms.${BUYBOX_CHANNEL}.prices`]: 1, [`competition.${BUYBOX_CHANNEL}`]: 1,
    }).lean();
    const byId = new Map(variants.map((v) => [String(v._id), v]));
    const byBarcode = new Map(variants.filter((v) => v.barcode).map((v) => [String(v.barcode), v]));
    const settings = await loadCompetitionSettings(applicationDB, tid);
    const net = await getNetRevenuePreview(clientDB, tid, {
        items: items.map((x) => ({ variantId: x.variantId, barcode: x.barcode, integrationCode: BUYBOX_CHANNEL })),
    });
    const deductions = resolveDeductionRules(BUYBOX_CHANNEL);
    const supported = !!getIntegrationDescriptor(BUYBOX_CHANNEL)?.capabilities['pricing.buybox.read'];
    return {
        channel: BUYBOX_CHANNEL,
        freshnessMin: settings.freshnessMin,
        items: items.map((x, idx) => {
            const v = x.variantId ? byId.get(x.variantId) : byBarcode.get(x.barcode!);
            if (!v) return { variantId: x.variantId ?? null, barcode: x.barcode ?? null, found: false as const };
            const n: any = net.items[idx];
            const c = v.competition?.[BUYBOX_CHANNEL] ?? null;
            const preview = buildMarginPreview({
                ownPrice: x.price ?? ownChannelPrice(v, BUYBOX_CHANNEL),
                buybox: {
                    status: supported ? (c?.status ?? 'unchecked') : 'unchecked',
                    price: typeof c?.buyboxPrice === 'number' ? c.buyboxPrice : null,
                    order: typeof c?.buyboxOrder === 'number' ? c.buyboxOrder : null,
                    observedAt: c?.checkedAt ? new Date(c.checkedAt) : null,
                    hasMultipleSeller: typeof c?.hasMultipleSeller === 'boolean' ? c.hasMultipleSeller : null,
                },
                ctx: {
                    costPrice: typeof v.costPrice === 'number' ? v.costPrice : null,
                    vatRate: n?.vatRate ?? null,
                    commission: { rate: n?.commission?.rate ?? null, source: n?.commission?.source ?? 'unknown' },
                    deductions,
                },
                costUpdatedAt: v.costUpdatedAt ? new Date(v.costUpdatedAt) : null,
                freshnessMin: settings.freshnessMin, now,
            });
            return { variantId: String(v._id), productId: v.productId ? String(v.productId) : null, barcode: v.barcode ?? null, sku: v.stockcode ?? null, found: true as const, priceSource: x.price !== undefined ? 'input' : 'channel', ...preview };
        }),
    };
}
