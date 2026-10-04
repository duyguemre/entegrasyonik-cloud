// [eslesme-fiyat WP5, PLAN §3.4, K-A/K-A2] Kanal fiyat kuralı operasyonları: kayıt (`PriceRules.type:'channel'`), önizleme (salt okuma),
// İNSAN ONAYLI uygulama ve — yalnız bu tipte, tenant anahtarı `channelAutoApply` + kural `autoApply` açıkken — zamanlanmış OTOMATİK uygulama.
//
// Uygulama ne yazar: `Variants.platforms.<kod>.rulePrice = { salePrice, marketPrice, ruleId, ruleVersion, at, reasons }`. Kanala giden fiyat
// `effectiveChannelPrice` ile çözülür (kanal özel fiyatı > kural sonucu > ana fiyat); etkin fiyat değişirse `pricePending` işaretlenir ve
// `PricePublishTrigger` yayınlar (K-B). Kullanıcının kanal özel fiyatına ve ana fiyatına DOKUNULMAZ. Her değişiklik PriceHistory
// (`rule_channel`, kural kimliği/sürümü) + denetim kaydı. Sıklık (K12): varyant×kanal başına 24 saatte en çok PLATFORM_LIMITS.maxChangesPerDay,
// ardışık değişiklik arası en az PLATFORM_LIMITS.minCooldownMin dk (otomatik uygulamada).
// Rekabet kuralı (`competition`) bu dosyada yoktur ve otomatik uygulanmaz (PRC-R3).
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { AppError } from '@platform/core/errors';
import { effectiveChannelPrice, round2 } from '@platform/core/pricing/effectivePrice';
import { CHANNEL_RULE_CHANNELS, channelParams, computeChannelPrice, type ChannelParams, type ChannelResult } from './channelRule';
import { PLATFORM_LIMITS } from './priceRule';
import type { MarginContext } from './margin';
import { loadSettings, tenantActive } from './pricingTenant';
import { diffChannelPrices, markPriceChanges } from './pricePending';

/** `PricingEnv`'in kanal kuralının kullandığı alt kümesi (yapısal; priceRules ile döngü olmasın). */
export interface PricingEnv {
    now(): Date;
    platformEnabled(): boolean;
    marginContexts(clientDB: any, tid: number, variants: any[], code?: string): Promise<Map<string, MarginContext>>;
    audit(event: string, tid: number, actor: string | null, meta: Record<string, string | number | boolean | null>): void;
}

const OID = z.string().regex(/^[0-9a-fA-F]{24}$/);
const BARCODE = z.string().min(1).max(128);
const DAY = 86_400_000;
/** Kural başına bir koşuda en çok varyant (kalan bir sonraki koşuda). */
export const CHANNEL_RULE_EVAL_LIMIT = 500;
export const CHANNEL_PREVIEW_MAX = 200;

/** K-A2 açılırken satıcıya gösterilen bildirim (sorumluluk metnine ek; avukat görüşü kapsamı dışında, PLAN §9). */
export const CHANNEL_AUTO_APPLY_NOTICE = {
    tr: 'Kanal fiyat kurallarında "otomatik uygula" açıksa, girdiğiniz maliyet/komisyon/marj değerleriyle hesaplanan fiyat onayınız beklenmeden kanala gönderilir. '
        + 'Rakip fiyatı kullanılmaz; taban/tavan ve değişim sınırı uygulanır. Her değişiklik fiyat geçmişine yazılır; anahtarı kapatınca otomatik uygulama hemen durur.',
    en: 'If "auto apply" is on for channel pricing rules, the price computed from your cost/commission/margin values is sent to the channel without waiting for approval. '
        + 'Competitor prices are not used; floor/ceiling and change limits apply. Every change is recorded in price history; turning the switch off stops auto apply immediately.',
} as const;

export const saveChannelRuleInput = z.object({
    id: OID.optional(),
    type: z.literal('channel'),
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    integrationCode: z.enum(CHANNEL_RULE_CHANNELS),
    scope: z.object({ productIds: z.array(OID).max(500).optional(), barcodes: z.array(BARCODE).max(500).optional() }).strict().optional(),
    channel: channelParams,
}).strict();

const invalid = (message: string, err: z.ZodError) => AppError.of('VALIDATION', { message, details: err.issues.map((x) => ({ path: x.path.join('.'), rule: x.message })) });
const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : null);

export function channelRuleDto(r: any) {
    return {
        id: String(r._id), type: 'channel', name: r.name, enabled: !!r.enabled, version: r.version, integrationCode: r.integrationCode,
        scope: { productIds: (r.scope?.productIds ?? []).map(String), barcodes: r.scope?.barcodes ?? [] },
        competition: null, channel: r.channel as ChannelParams,
        pausedReason: r.pausedReason ?? null, pausedAt: iso(r.pausedAt), updatedAt: iso(r.updatedAt),
        suggestions: { open: 0, blocked: 0 },
    };
}

export async function saveChannelRule(clientDB: any, tid: number, actor: string | null, raw: unknown, env: PricingEnv) {
    const p = saveChannelRuleInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz kanal fiyat kuralı.', p.error);
    const i = p.data;
    const now = env.now();
    const model = clientDB.getPriceRuleModel();
    const scope = {
        ...(i.scope?.productIds?.length ? { productIds: i.scope.productIds.map((x) => new ObjectId(x)) } : {}),
        ...(i.scope?.barcodes?.length ? { barcodes: [...new Set(i.scope.barcodes)] } : {}),
    };
    const body = { type: 'channel', name: i.name, enabled: i.enabled, integrationCode: i.integrationCode, scope, channel: i.channel, updatedAt: now, updatedBy: actor ?? undefined };
    let doc: any;
    if (i.id) {
        doc = await model.findOneAndUpdate({ _id: new ObjectId(i.id), type: 'channel' }, { $set: body, $inc: { version: 1 }, $unset: { pausedReason: 1, pausedAt: 1 } }, { new: true }).lean();
        if (!doc) throw AppError.of('NOT_FOUND', { message: 'Kanal fiyat kuralı bulunamadı.' });
    } else {
        if ((await model.countDocuments({})) >= 200) throw AppError.of('VALIDATION', { message: 'En çok 200 fiyat kuralı tanımlanabilir.' });
        doc = (await model.create({ ...body, version: 1, createdAt: now, createdBy: actor ?? undefined })).toObject();
    }
    env.audit(i.id ? 'pricing.rule.updated' : 'pricing.rule.created', tid, actor, {
        ruleId: String(doc._id), ruleVersion: doc.version, type: 'channel', enabled: !!doc.enabled, integrationCode: i.integrationCode,
        base: i.channel.base, marginPercent: i.channel.marginPercent ?? null, autoApply: i.channel.autoApply,
    });
    return channelRuleDto(doc);
}

/** Kural kapsamındaki yayınlanmış varyantlar (kanala TRANSFER tamamlanmış). */
function scopeFilter(rule: any, extra: { variantIds?: string[]; barcodes?: string[] } = {}) {
    const f: any = { [`platforms.${rule.integrationCode}.upload.TRANSFER.status`]: 'COMPLETED' };
    if (rule.scope?.barcodes?.length) f.barcode = { $in: rule.scope.barcodes };
    if (rule.scope?.productIds?.length) f.productId = { $in: rule.scope.productIds };
    if (extra.variantIds?.length) f._id = { $in: extra.variantIds.map((x) => new ObjectId(x)) };
    if (extra.barcodes?.length) f.barcode = f.barcode ? { $in: extra.barcodes.filter((b) => rule.scope.barcodes.includes(b)) } : { $in: extra.barcodes };
    return f;
}
const VARIANT_FIELDS = { productId: 1, barcode: 1, stockcode: 1, prices: 1, costPrice: 1, platforms: 1 } as const;

export interface ChannelEvalRow {
    variantId: string; barcode: string | null; current: { salePrice: number | null; source: string };
    result: ChannelResult; changed: boolean;
}

async function evaluateRule(clientDB: any, tid: number, rule: any, env: PricingEnv, opts: { auto: boolean; limit: number; variantIds?: string[]; barcodes?: string[]; excludeIds?: Set<string> }): Promise<{ rows: ChannelEvalRow[]; variants: Map<string, any> }> {
    const params = channelParams.parse(rule.channel); // kayıtlı belge yeniden doğrulanır (elle DB düzenlemesine karşı)
    const code = rule.integrationCode;
    const variants: any[] = (await clientDB.getVariantModel().find(scopeFilter(rule, opts), VARIANT_FIELDS).limit(opts.limit).lean())
        .filter((v: any) => !opts.excludeIds?.has(String(v._id)));
    const margins = variants.length ? await env.marginContexts(clientDB, tid, variants, code) : new Map();
    const rows: ChannelEvalRow[] = [];
    for (const v of variants) {
        const margin = margins.get(String(v._id));
        if (!margin) continue;
        const cur = effectiveChannelPrice(v, code);
        const result = computeChannelPrice({
            params, baseSale: v.prices?.salePrice ?? null, baseList: v.prices?.marketPrice ?? null, currentSale: cur.salePrice, margin, auto: opts.auto,
        });
        const prev = v.platforms?.[code]?.rulePrice;
        const changed = result.ok && (round2(prev?.salePrice ?? -1) !== result.salePrice || round2(prev?.marketPrice ?? -1) !== result.marketPrice || prev?.ruleVersion !== rule.version);
        rows.push({ variantId: String(v._id), barcode: v.barcode ?? null, current: { salePrice: cur.salePrice, source: cur.source }, result, changed });
    }
    return { rows, variants: new Map(variants.map((v) => [String(v._id), v])) };
}

async function loadChannelRule(clientDB: any, id: string) {
    const rule = await clientDB.getPriceRuleModel().findOne({ _id: new ObjectId(id), type: 'channel' }).lean();
    if (!rule) throw AppError.of('NOT_FOUND', { message: 'Kanal fiyat kuralı bulunamadı.' });
    return rule;
}

export const previewChannelRuleInput = z.object({
    id: OID, barcodes: z.array(BARCODE).max(100).optional(), limit: z.number().int().min(1).max(CHANNEL_PREVIEW_MAX).optional(),
}).strict();

/** SALT OKUMA: kuralın kapsamındaki varyantlar için hesaplanan fiyat + gerekçe (fiyat değişmez). */
export async function previewChannelRule(clientDB: any, tid: number, raw: unknown, env: PricingEnv) {
    const p = previewChannelRuleInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz istek.', p.error);
    const rule = await loadChannelRule(clientDB, p.data.id);
    const { rows } = await evaluateRule(clientDB, tid, rule, env, { auto: false, limit: p.data.limit ?? 50, barcodes: p.data.barcodes });
    return {
        rule: channelRuleDto(rule),
        summary: { total: rows.length, ok: rows.filter((r) => r.result.ok).length, changed: rows.filter((r) => r.changed).length, blocked: rows.filter((r) => !r.result.ok).length },
        items: rows,
    };
}

export const applyChannelRuleInput = z.object({ id: OID, variantIds: z.array(OID).min(1).max(CHANNEL_RULE_EVAL_LIMIT).optional() }).strict();

export interface ChannelApplyOutcome { applied: number; unchanged: number; blocked: number; throttled: number; pending: number; skipped?: string }

/** Son 24 saatteki `rule_channel` değişiklikleri: varyant → { count, lastAt } (K12 sıklık/soğuma). */
async function recentRuleChanges(clientDB: any, code: string, ids: ObjectId[], now: Date) {
    const rows: any[] = ids.length ? await clientDB.getPriceHistoryModel()
        .find({ integrationCode: code, source: 'rule_channel', variantId: { $in: ids }, at: { $gte: new Date(now.getTime() - DAY) } }, { variantId: 1, at: 1 })
        .limit(20_000).lean() : [];
    const out = new Map<string, { count: number; lastAt: number }>();
    for (const r of rows) {
        const k = String(r.variantId), at = new Date(r.at).getTime();
        const e = out.get(k) ?? { count: 0, lastAt: 0 };
        e.count++; e.lastAt = Math.max(e.lastAt, at);
        out.set(k, e);
    }
    return out;
}

/**
 * Kuralı uygular: `rulePrice` yazar, etkin fiyatı değişen kanallara `pricePending` + geçmiş. `auto=true` yalnız zamanlanmış işten
 * (tenant `channelAutoApply` + kural `autoApply` + kural etkin şartları burada da denetlenir).
 */
export async function applyChannelRule(clientDB: any, tid: number, actor: string | null, raw: unknown, env: PricingEnv, opts: { auto?: boolean; handled?: Set<string> } = {}): Promise<ChannelApplyOutcome> {
    const p = applyChannelRuleInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz istek.', p.error);
    const auto = !!opts.auto;
    const out: ChannelApplyOutcome = { applied: 0, unchanged: 0, blocked: 0, throttled: 0, pending: 0 };
    const settings = await loadSettings(clientDB);
    const act = tenantActive(settings, env);
    if (!act.active) {
        if (auto) return { ...out, skipped: act.reason ?? 'inactive' };
        throw AppError.of('VALIDATION', { message: 'Fiyat kuralları bu hesapta kapalı ya da sorumluluk metni onaylanmamış.', details: [{ path: 'settings', rule: act.reason ?? 'inactive' }] });
    }
    const rule = await loadChannelRule(clientDB, p.data.id);
    if (auto && (!rule.enabled || rule.pausedReason || rule.channel?.autoApply !== true || settings?.channelAutoApply !== true)) return { ...out, skipped: 'auto_apply_off' };

    const now = env.now();
    const code = rule.integrationCode;
    const { rows, variants } = await evaluateRule(clientDB, tid, rule, env, { auto, limit: CHANNEL_RULE_EVAL_LIMIT, variantIds: p.data.variantIds, excludeIds: opts.handled });
    for (const r of rows) opts.handled?.add(r.variantId); // bir koşuda varyant tek kurala düşer (en özel kural önce)
    const recent = auto ? await recentRuleChanges(clientDB, code, rows.filter((r) => r.changed).map((r) => new ObjectId(r.variantId)), now) : new Map();
    const ops: any[] = [];
    const changes: ReturnType<typeof diffChannelPrices> = [];
    for (const r of rows) {
        if (!r.result.ok) { out.blocked++; continue; }
        if (!r.changed) { out.unchanged++; continue; }
        if (auto) {
            const rc = recent.get(r.variantId);
            if (rc && (rc.count >= PLATFORM_LIMITS.maxChangesPerDay || now.getTime() - rc.lastAt < PLATFORM_LIMITS.minCooldownMin * 60_000)) { out.throttled++; continue; }
        }
        const v = variants.get(r.variantId);
        const rulePrice = { salePrice: r.result.salePrice, marketPrice: r.result.marketPrice, ruleId: String(rule._id), ruleVersion: rule.version, at: now, reasons: r.result.reasons };
        const after = { ...v, platforms: { ...v.platforms, [code]: { ...v.platforms?.[code], rulePrice } } };
        changes.push(...diffChannelPrices(v, after).filter((c) => c.code === code));
        ops.push({ updateOne: { filter: { _id: v._id }, update: { $set: { [`platforms.${code}.rulePrice`]: rulePrice } } } });
        out.applied++;
    }
    if (ops.length) await clientDB.getVariantModel().bulkWrite(ops, { ordered: false });
    const marked = await markPriceChanges(clientDB, changes, {
        reason: 'rule_channel', historySource: 'rule_channel', actor, now, extra: { ruleId: rule._id, ruleVersion: rule.version },
    });
    out.pending = marked.marked;
    env.audit(auto ? 'pricing.channelRule.autoApplied' : 'pricing.channelRule.applied', tid, actor, {
        ruleId: String(rule._id), ruleVersion: rule.version, integrationCode: code, applied: out.applied, blocked: out.blocked, throttled: out.throttled, pending: out.pending,
    });
    return out;
}

export interface ChannelRunResult { skipped?: string; rules: number; applied: number; blocked: number; throttled: number }

/** Zamanlanmış koşu (tenant başına): etkin + `autoApply` kanal kuralları; tenant `channelAutoApply` kapalıysa hiçbir şey yazılmaz. */
export async function runChannelRules(clientDB: any, tid: number, env: PricingEnv): Promise<ChannelRunResult> {
    const res: ChannelRunResult = { rules: 0, applied: 0, blocked: 0, throttled: 0 };
    const settings = await loadSettings(clientDB);
    if (!tenantActive(settings, env).active) return { ...res, skipped: 'inactive' };
    if (settings?.channelAutoApply !== true) return { ...res, skipped: 'channel_auto_apply_off' };
    const specificity = (r: any) => (r.scope?.barcodes?.length ? 0 : r.scope?.productIds?.length ? 1 : 2);
    const rules: any[] = (await clientDB.getPriceRuleModel().find({ type: 'channel', enabled: true, 'channel.autoApply': true, pausedReason: { $exists: false } }).limit(200).lean())
        .sort((a: any, b: any) => specificity(a) - specificity(b) || String(a._id).localeCompare(String(b._id)));
    const handled = new Map<string, Set<string>>(); // kanal → bu koşuda işlenen varyantlar
    for (const rule of rules) {
        res.rules++;
        const set = handled.get(rule.integrationCode) ?? new Set<string>();
        handled.set(rule.integrationCode, set);
        try {
            const r = await applyChannelRule(clientDB, tid, null, { id: String(rule._id) }, env, { auto: true, handled: set });
            res.applied += r.applied; res.blocked += r.blocked; res.throttled += r.throttled;
        } catch (err) {
            console.error(`[channelRules] kural ${String(rule._id)} (tid=${tid}):`, (err as Error)?.message);
        }
    }
    return res;
}
