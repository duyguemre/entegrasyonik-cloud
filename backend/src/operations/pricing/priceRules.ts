// PRC-R2: fiyat kuralları (B-10 `competition` tipi), KURU öneri üretimi ve İNSAN ONAYLI uygulama. Ekran ve Otopilot/MCP aynı
// fonksiyonları çağırır (yetenekler `pricing.rules.*`, `pricing.suggestions.list`, `pricing.suggestions.apply`; ADR-0019, K20).
// OTOMATİK (insan onaysız) UYGULAMA YOLU YOKTUR: fiyat yalnız `applySuggestions` ile değişir ve o da yalnız onaylı RPC'den çağrılır
// (PRC-R3 avukat yanıtını bekliyor; K58). Öneri üretimi (`generateSuggestions`) yalnız `PriceSuggestions` yazar, fiyata dokunmaz.
// Tenant kapsamı ClientDB tutamağıdır (K2/K5): fonksiyonlar başka tenant'ın DB'sini açmaz, tenant'lar arası veri birleştirmez.
// Anahtarlar (K19): platform `features.pricingRules` → tenant `PricingSettings.enabled` (+ sorumluluk metni kabulü, K3) → kural `enabled`.
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { AppError } from '@platform/core/errors';
import { roundMoney } from '@operations/finance/netRevenue';
import type { MarginContext } from './margin';
import { BUYBOX_CHANNEL, ELIGIBLE_FILTER } from './BuyboxRefreshJob';
import { ownChannelPrice } from './buyboxState';
import { DUAL_ENGINE_WARNING, PLATFORM_LIMITS, PRICING_CONSENT, parseRuleInput, type CompetitionParams } from './priceRule';
import { evaluate, fuseCheck, VISIBLE_BLOCK_REASONS, type EvalResult, type HistoryEntry, type PauseReason } from './ruleEngine';
import { effectiveChannelPrice } from '@platform/core/pricing/effectivePrice';
import { CHANNEL_AUTO_APPLY_NOTICE, channelRuleDto, saveChannelRule } from './channelRules';
import { loadSettings, tenantActive } from './pricingTenant';
import { CHANNEL_RULE_CHANNELS } from './channelRule';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const OID = z.string().regex(OBJECT_ID);
const DAY = 86_400_000;
const SETTINGS_ID = 'pricing';
/** Kural başına bir koşuda değerlendirilen en çok varyant (sistem yükü; kalan bir sonraki koşuda). */
export const RULE_EVAL_LIMIT = 500;
/** Tek onayda en çok öneri (toplu onay; önizlemeli kart). */
export const APPLY_MAX = 50;

export interface PricingEnv {
    now(): Date;
    /** K19 platform kill-switch (`features.pricingRules`). */
    platformEnabled(): boolean;
    /** Buybox verisi (PRC-R1 `features.competition`) bu tenant için açık mı. */
    competitionEnabled(tid: number): boolean;
    freshnessMin(tid: number): Promise<number>;
    /** Varyant başına kâr bağlamı (maliyet, KDV, komisyon, kesintiler) — yalnız bu tenant'ın DB'sinden. */
    marginContexts(clientDB: any, tid: number, variants: any[], code?: string): Promise<Map<string, MarginContext>>;
    /** Mevcut fiyat yayın hattı (ExportBatchService UPDATE_PRICE). */
    publish(clientDB: any, tid: number, barcodes: string[]): Promise<void>;
    notifyPaused(tid: number, params: { integ: string; ruleId: string; reason: PauseReason; day: string }): Promise<void>;
    audit(event: string, tid: number, actor: string | null, meta: Record<string, string | number | boolean | null>): void;
}

const invalid = (message: string, err: z.ZodError) => AppError.of('VALIDATION', { message, details: err.issues.map((x) => ({ path: x.path.join('.') })) });
const istanbulDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Kanal liste (üstü çizili) fiyatı: satış fiyatıyla aynı kaynaktan (`effectiveChannelPrice`, eslesme-fiyat WP5). */
export function channelListPrice(v: any, code: string): number | null {
    return effectiveChannelPrice(v, code).marketPrice;
}

// ---- Tenant anahtarı + sorumluluk metni (K3, K19) — loadSettings/tenantActive: ./pricingTenant ---------------------------------
export { loadSettings, tenantActive };

export const settingsInput = z.object({
    enabled: z.boolean(),
    /** Açarken ZORUNLU: kabul edilen metin sürümü (güncel sürüm olmalı). */
    consentVersion: z.string().max(40).optional(),
    /** Açarken ZORUNLU: pazaryerinin kendi otomatik fiyat aracının kapatılması uyarısı okundu (K17). */
    dualEngineAcknowledged: z.boolean().optional(),
    /** [eslesme-fiyat WP5, K-A2] kanal fiyat kuralının otomatik uygulanması (kill-switch); açarken `channelAutoApplyAcknowledged:true`. */
    channelAutoApply: z.boolean().optional(),
    channelAutoApplyAcknowledged: z.boolean().optional(),
}).strict();

export async function setPricingSettings(clientDB: any, tid: number, actor: string | null, raw: unknown, env: PricingEnv) {
    const p = settingsInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz fiyat kuralı ayarı.', p.error);
    const now = env.now();
    const prev = await loadSettings(clientDB);
    const set: any = { enabled: p.data.enabled, updatedAt: now, updatedBy: actor ?? undefined };
    if (p.data.enabled) {
        const accepted = prev?.consent?.version === PRICING_CONSENT.version;
        if (!accepted && p.data.consentVersion !== PRICING_CONSENT.version) {
            throw AppError.of('VALIDATION', { message: 'Fiyat kurallarını açmak için güncel sorumluluk metnini onaylayın.', details: [{ path: 'consentVersion' }] });
        }
        if (!prev?.dualEngineAcknowledgedAt && p.data.dualEngineAcknowledged !== true) {
            throw AppError.of('VALIDATION', { message: 'Pazaryerinin kendi otomatik fiyat aracıyla çift kullanım uyarısını onaylayın.', details: [{ path: 'dualEngineAcknowledged' }] });
        }
        if (!accepted) set.consent = { version: PRICING_CONSENT.version, acceptedAt: now, acceptedBy: actor ?? undefined };
        if (!prev?.dualEngineAcknowledgedAt) set.dualEngineAcknowledgedAt = now;
    }
    if (p.data.channelAutoApply !== undefined) {
        if (p.data.channelAutoApply && !prev?.channelAutoApplyAcknowledgedAt && p.data.channelAutoApplyAcknowledged !== true) {
            throw AppError.of('VALIDATION', { message: 'Kanal fiyat kuralı otomatik uygulamasını açmak için bildirimi onaylayın.', details: [{ path: 'channelAutoApplyAcknowledged' }] });
        }
        set.channelAutoApply = p.data.channelAutoApply && p.data.enabled;
        if (p.data.channelAutoApply && !prev?.channelAutoApplyAcknowledgedAt) set.channelAutoApplyAcknowledgedAt = now;
    } else if (!p.data.enabled) set.channelAutoApply = false; // tenant anahtarı kapanınca otomatik uygulama da kapanır
    await clientDB.getPricingSettingsModel().updateOne({ _id: SETTINGS_ID }, { $set: set }, { upsert: true });
    env.audit(p.data.enabled ? 'pricing.settings.enabled' : 'pricing.settings.disabled', tid, actor, {
        consentVersion: (set.consent?.version ?? prev?.consent?.version) ?? null, consentDraft: PRICING_CONSENT.draft,
        channelAutoApply: set.channelAutoApply ?? prev?.channelAutoApply ?? false,
    });
    if (!p.data.enabled) await expireOpen(clientDB, {}, 'tenant_disabled', now);
    return getRulesState(clientDB, tid, env);
}

// ---- Kural CRUD (`pricing.rules.*`) ---------------------------------------------------------------------------------------
function ruleDto(r: any, counts?: { open: number; blocked: number }) {
    if (r.type === 'channel') return channelRuleDto(r);
    const c = r.competition ?? {};
    return {
        id: String(r._id), type: r.type, name: r.name, enabled: !!r.enabled, version: r.version, integrationCode: r.integrationCode,
        scope: { productIds: (r.scope?.productIds ?? []).map(String), barcodes: r.scope?.barcodes ?? [] },
        competition: {
            mode: c.mode, deltaAmount: num(c.deltaAmount), deltaPercent: num(c.deltaPercent), floorMarginPercent: c.floorMarginPercent, ceiling: c.ceiling,
            step: c.step, maxChangesPerDay: c.maxChangesPerDay, cooldownMin: c.cooldownMin, maxIncreasePercentPerDay: c.maxIncreasePercentPerDay,
            excludeIfOutOfStock: !!c.excludeIfOutOfStock,
        },
        channel: null,
        pausedReason: r.pausedReason ?? null, pausedAt: iso(r.pausedAt), updatedAt: iso(r.updatedAt),
        suggestions: counts ?? { open: 0, blocked: 0 },
    };
}

export async function getRulesState(clientDB: any, tid: number, env: PricingEnv) {
    const [s, rules, counts] = await Promise.all([
        loadSettings(clientDB),
        clientDB.getPriceRuleModel().find({}).sort({ createdAt: 1 }).limit(200).lean(),
        clientDB.getPriceSuggestionModel().aggregate([{ $match: { current: true } }, { $group: { _id: { r: '$ruleId', s: '$status' }, n: { $sum: 1 } } }]),
    ]);
    const byRule = new Map<string, { open: number; blocked: number }>();
    for (const c of counts as any[]) {
        const key = String(c._id.r);
        const e = byRule.get(key) ?? { open: 0, blocked: 0 };
        if (c._id.s === 'open') e.open = c.n; else if (c._id.s === 'blocked') e.blocked = c.n;
        byRule.set(key, e);
    }
    const act = tenantActive(s, env);
    return {
        channel: BUYBOX_CHANNEL,
        platformEnabled: env.platformEnabled(),
        competitionEnabled: env.competitionEnabled(tid),
        active: act.active, inactiveReason: act.reason,
        settings: {
            enabled: !!s?.enabled,
            consent: { acceptedVersion: s?.consent?.version ?? null, acceptedAt: iso(s?.consent?.acceptedAt) },
            dualEngineAcknowledgedAt: iso(s?.dualEngineAcknowledgedAt),
            channelAutoApply: s?.channelAutoApply === true,
            channelAutoApplyAcknowledgedAt: iso(s?.channelAutoApplyAcknowledgedAt),
        },
        channelAutoApplyNotice: CHANNEL_AUTO_APPLY_NOTICE,
        channelRuleChannels: [...CHANNEL_RULE_CHANNELS],
        consent: { version: PRICING_CONSENT.version, draft: PRICING_CONSENT.draft, text: PRICING_CONSENT.text },
        dualEngineWarning: DUAL_ENGINE_WARNING,
        limits: PLATFORM_LIMITS,
        rules: (rules as any[]).map((r) => ruleDto(r, byRule.get(String(r._id)))),
    };
}

export async function saveRule(clientDB: any, tid: number, actor: string | null, raw: unknown, env: PricingEnv) {
    // [eslesme-fiyat WP5] `type:'channel'` kanal fiyat kuralı ayrı modülde (aynı koleksiyon, aynı yetenek/izin).
    if ((raw as any)?.type === 'channel') return saveChannelRule(clientDB, tid, actor, raw, env);
    const { type: _t, ...rest } = (raw ?? {}) as any;
    const i = parseRuleInput(_t === undefined || _t === 'competition' ? rest : raw);
    const now = env.now();
    const model = clientDB.getPriceRuleModel();
    const scope = {
        ...(i.scope?.productIds?.length ? { productIds: i.scope.productIds.map((x) => new ObjectId(x)) } : {}),
        ...(i.scope?.barcodes?.length ? { barcodes: [...new Set(i.scope.barcodes)] } : {}),
    };
    const body = { type: 'competition', name: i.name, enabled: i.enabled, integrationCode: i.integrationCode, scope, competition: i.competition, updatedAt: now, updatedBy: actor ?? undefined };
    let doc: any;
    if (i.id) {
        // Kaydetmek sürümü artırır ve duraklatmayı kaldırır (satıcı kuralı gözden geçirdi). Eski sürümün açık önerileri geçersizleşir.
        doc = await model.findOneAndUpdate({ _id: new ObjectId(i.id) }, { $set: body, $inc: { version: 1 }, $unset: { pausedReason: 1, pausedAt: 1 } }, { new: true }).lean();
        if (!doc) throw AppError.of('NOT_FOUND', { message: 'Fiyat kuralı bulunamadı.' });
        await expireOpen(clientDB, { ruleId: doc._id }, 'rule_changed', now);
    } else {
        const count = await model.countDocuments({});
        if (count >= 200) throw AppError.of('VALIDATION', { message: 'En çok 200 fiyat kuralı tanımlanabilir.' });
        doc = (await model.create({ ...body, version: 1, createdAt: now, createdBy: actor ?? undefined })).toObject();
    }
    env.audit(i.id ? 'pricing.rule.updated' : 'pricing.rule.created', tid, actor, {
        ruleId: String(doc._id), ruleVersion: doc.version, enabled: !!doc.enabled, mode: i.competition.mode,
        deltaAmount: i.competition.deltaAmount ?? null, deltaPercent: i.competition.deltaPercent ?? null, floorMarginPercent: i.competition.floorMarginPercent, ceiling: i.competition.ceiling,
    });
    if (doc.enabled) {
        try { await generateSuggestions(clientDB, tid, env); } catch { /* öneri bir sonraki buybox turunda üretilir */ }
    }
    return ruleDto(doc);
}

export const ruleIdInput = z.object({ id: OID }).strict();

export async function deleteRule(clientDB: any, tid: number, actor: string | null, raw: unknown, env: PricingEnv) {
    const p = ruleIdInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz istek.', p.error);
    const r = await clientDB.getPriceRuleModel().findOneAndDelete({ _id: new ObjectId(p.data.id) }).lean();
    if (!r) throw AppError.of('NOT_FOUND', { message: 'Fiyat kuralı bulunamadı.' });
    await expireOpen(clientDB, { ruleId: r._id }, 'rule_deleted', env.now());
    env.audit('pricing.rule.deleted', tid, actor, { ruleId: String(r._id), ruleVersion: r.version });
    return { deleted: true, id: p.data.id };
}

async function expireOpen(clientDB: any, filter: any, reason: string, now: Date) {
    await clientDB.getPriceSuggestionModel().updateMany(
        { ...filter, current: true },
        { $set: { status: 'expired', closedReason: reason, updatedAt: now }, $unset: { current: 1 } },
    );
}

// ---- Öneri üretimi (KURU) ------------------------------------------------------------------------------------------------
async function historyFor(clientDB: any, variantIds: ObjectId[], now: Date): Promise<Map<string, HistoryEntry[]>> {
    const rows: any[] = variantIds.length ? await clientDB.getPriceHistoryModel()
        .find({ integrationCode: BUYBOX_CHANNEL, variantId: { $in: variantIds }, at: { $gte: new Date(now.getTime() - 30 * DAY) } },
            { variantId: 1, at: 1, salePrice: 1, previousPrice: 1, source: 1 })
        .limit(20_000).lean() : [];
    const out = new Map<string, HistoryEntry[]>();
    for (const r of rows) {
        const key = String(r.variantId);
        const list = out.get(key) ?? [];
        list.push({ at: new Date(r.at), salePrice: r.salePrice, previousPrice: num(r.previousPrice), source: r.source });
        out.set(key, list);
    }
    return out;
}

const VARIANT_FIELDS = {
    productId: 1, barcode: 1, stockcode: 1, stock: 1, prices: 1, costPrice: 1, platforms: 1, [`competition.${BUYBOX_CHANNEL}`]: 1,
} as const;

function evalInputFor(rule: any, v: any, margin: MarginContext, history: HistoryEntry[], freshnessMin: number, now: Date) {
    const c = v.competition?.[BUYBOX_CHANNEL] ?? null;
    return {
        rule: { competition: rule.competition as CompetitionParams, pausedReason: rule.pausedReason ?? null },
        variant: { stock: Number(v.stock) || 0, ownPrice: ownChannelPrice(v, BUYBOX_CHANNEL), listPrice: channelListPrice(v, BUYBOX_CHANNEL) },
        buybox: c ? { status: c.status, price: num(c.buyboxPrice), order: num(c.buyboxOrder), checkedAt: c.checkedAt ? new Date(c.checkedAt) : null } : null,
        margin, history, freshnessMin, now,
    };
}

/** Kuralın kapsamındaki aday varyantlar (en özel kural önce işlenir; bir varyant bir koşuda tek kurala düşer). */
function ruleFilter(rule: any) {
    const f: any = { ...ELIGIBLE_FILTER, [`competition.${BUYBOX_CHANNEL}.status`]: { $exists: true } };
    if (rule.scope?.barcodes?.length) f.barcode = { $in: rule.scope.barcodes };
    if (rule.scope?.productIds?.length) f.productId = { $in: rule.scope.productIds };
    return f;
}
const specificity = (r: any) => (r.scope?.barcodes?.length ? 0 : r.scope?.productIds?.length ? 1 : 2);

export interface GenerateResult { skipped?: string; rules: number; evaluated: number; suggested: number; blocked: number; paused: number }

/**
 * KURU koşu: etkin kuralları değerlendirir, yalnız `PriceSuggestions`'a yazar (fiyat DEĞİŞMEZ). Salınım/dış değişiklikte kuralı duraklatır
 * ve bildirir (K12, K17). Buybox okuma işi tenant turundan sonra ve kural kaydedilince çağırır.
 */
export async function generateSuggestions(clientDB: any, tid: number, env: PricingEnv): Promise<GenerateResult> {
    const res: GenerateResult = { rules: 0, evaluated: 0, suggested: 0, blocked: 0, paused: 0 };
    const s = await loadSettings(clientDB);
    const act = tenantActive(s, env);
    if (!act.active) return { ...res, skipped: act.reason ?? 'inactive' };
    if (!env.competitionEnabled(tid)) return { ...res, skipped: 'competition_disabled' };
    const now = env.now();
    const freshnessMin = await env.freshnessMin(tid);
    const rules: any[] = (await clientDB.getPriceRuleModel().find({ type: 'competition', enabled: true, pausedReason: { $exists: false } }).lean())
        .sort((a: any, b: any) => specificity(a) - specificity(b) || String(a._id).localeCompare(String(b._id)));
    const handled = new Set<string>();
    const sugModel = clientDB.getPriceSuggestionModel();
    for (const rule of rules) {
        res.rules++;
        const variants: any[] = await clientDB.getVariantModel().find(ruleFilter(rule), VARIANT_FIELDS).limit(RULE_EVAL_LIMIT).maxTimeMS(10_000).lean();
        const fresh = variants.filter((v) => !handled.has(String(v._id)));
        if (!fresh.length) continue;
        const [margins, hist] = await Promise.all([
            env.marginContexts(clientDB, tid, fresh),
            historyFor(clientDB, fresh.map((v) => v._id), now),
        ]);
        let pause: PauseReason | null = null;
        const ops: any[] = [];
        for (const v of fresh) {
            const key = String(v._id);
            handled.add(key);
            const margin = margins.get(key);
            if (!margin) continue;
            res.evaluated++;
            const r = evaluate(evalInputFor(rule, v, margin, hist.get(key) ?? [], freshnessMin, now));
            if (r.kind === 'pause_rule') {
                pause = r.reason;
                if (r.reason === 'external_change') {
                    // K10/K17: dışarıda gerçekleşen fiyat da geçmişe yazılır.
                    const c = v.competition?.[BUYBOX_CHANNEL];
                    await clientDB.getPriceHistoryModel().create({
                        integrationCode: BUYBOX_CHANNEL, variantId: v._id, barcode: v.barcode, at: c?.checkedAt ? new Date(c.checkedAt) : now,
                        salePrice: c?.buyboxPrice, previousPrice: ownChannelPrice(v, BUYBOX_CHANNEL) ?? undefined, listPrice: channelListPrice(v, BUYBOX_CHANNEL) ?? undefined, source: 'external',
                    });
                }
                break;
            }
            ops.push(suggestionOp(rule, v, r, now));
            // Varyant bu koşuda bu kurala düştü: başka kuralın güncel kaydı kapanır (tek varyant = tek güncel öneri).
            ops.push({ updateMany: { filter: { variantId: v._id, ruleId: { $ne: rule._id }, current: true },
                update: { $set: { status: 'expired', closedReason: 'covered_by_other_rule', updatedAt: now }, $unset: { current: 1 } } } });
            if (r.kind === 'suggest') res.suggested++; else if (VISIBLE_BLOCK_REASONS.has(r.reason)) res.blocked++;
        }
        if (pause) {
            res.paused++;
            await clientDB.getPriceRuleModel().updateOne({ _id: rule._id }, { $set: { pausedReason: pause, pausedAt: now } });
            await expireOpen(clientDB, { ruleId: rule._id }, `rule_paused_${pause}`, now);
            env.audit('pricing.rule.paused', tid, null, { ruleId: String(rule._id), ruleVersion: rule.version, reason: pause });
            try { await env.notifyPaused(tid, { integ: BUYBOX_CHANNEL, ruleId: String(rule._id), reason: pause, day: istanbulDay(now) }); } catch { /* bildirim hatası duraklatmayı geri almaz */ }
            continue;
        }
        if (ops.length) await sugModel.bulkWrite(ops.flat(), { ordered: true });
    }
    return res;
}

/** (kural, varyant) başına tek GÜNCEL kayıt (`current:true`): öneri `open`, görünür engel `blocked`; diğer atlamalar güncel kaydı kapatır. */
function suggestionOp(rule: any, v: any, r: Exclude<EvalResult, { kind: 'pause_rule' }>, now: Date): any[] {
    const filter = { ruleId: rule._id, variantId: v._id, current: true };
    const c = v.competition?.[BUYBOX_CHANNEL] ?? {};
    const base = {
        ruleVersion: rule.version, integrationCode: BUYBOX_CHANNEL, productId: v.productId, barcode: v.barcode, sku: v.stockcode ?? undefined,
        buyboxPrice: num(c.buyboxPrice) ?? undefined, buyboxOrder: num(c.buyboxOrder) ?? undefined, buyboxObservedAt: c.checkedAt ? new Date(c.checkedAt) : undefined,
        updatedAt: now,
    };
    if (r.kind === 'suggest') {
        return [{ updateOne: { filter, upsert: true, update: {
            $set: { ...base, status: 'open', beforePrice: r.before, afterPrice: r.after, listPrice: r.listPrice ?? undefined, floor: r.floor, ceiling: r.ceiling,
                profitBefore: r.profitBefore ?? undefined, profitAfter: r.profitAfter ?? undefined, reasons: r.reasons, warnings: r.warnings },
            $unset: { blockedReason: 1 },
            $setOnInsert: { createdAt: now },
        } } }];
    }
    if (VISIBLE_BLOCK_REASONS.has(r.reason)) {
        return [{ updateOne: { filter, upsert: true, update: {
            $set: { ...base, status: 'blocked', blockedReason: r.reason, beforePrice: r.before ?? ownChannelPrice(v, BUYBOX_CHANNEL) ?? 0, floor: r.floor ?? undefined, reasons: [], warnings: [] },
            $unset: { afterPrice: 1, profitAfter: 1 },
            $setOnInsert: { createdAt: now },
        } } }];
    }
    return [{ updateMany: { filter, update: { $set: { status: 'expired', closedReason: r.reason, updatedAt: now }, $unset: { current: 1 } } } }];
}

// ---- Öneri listesi + fiyat geçmişi (`pricing.suggestions.list`) -------------------------------------------------------------
export const SUGGESTION_LIST_STATUSES = ['open', 'blocked', 'applied', 'dismissed', 'expired'] as const;
export const listSuggestionsInput = z.object({
    status: z.enum(SUGGESTION_LIST_STATUSES).optional(),
    ruleId: OID.optional(),
    barcodes: z.array(z.string().min(1).max(128)).max(100).optional(),
    buyboxLostOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    cursor: OID.optional(),
}).strict();

function suggestionDto(x: any, lowest10d: number | null) {
    return {
        id: String(x._id), ruleId: String(x.ruleId), ruleVersion: x.ruleVersion, integrationCode: x.integrationCode, variantId: String(x.variantId),
        productId: x.productId ? String(x.productId) : null, barcode: x.barcode, sku: x.sku ?? null, status: x.status,
        beforePrice: x.beforePrice, afterPrice: num(x.afterPrice), listPrice: num(x.listPrice), floor: num(x.floor), ceiling: num(x.ceiling),
        profitBefore: num(x.profitBefore), profitAfter: num(x.profitAfter),
        buyboxPrice: num(x.buyboxPrice), buyboxOrder: num(x.buyboxOrder), buyboxObservedAt: iso(x.buyboxObservedAt),
        reasons: x.reasons ?? [], warnings: x.warnings ?? [], blockedReason: x.blockedReason ?? null, closedReason: x.closedReason ?? null,
        createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt), appliedAt: iso(x.appliedAt),
        /** K10: son 10 günün en düşük gerçekleşen satış fiyatı (yasal "önceki fiyat" yardımcısı; garanti değildir). */
        lowestPrice10d: lowest10d,
    };
}

/** K10: kanal bazında son `days` günün en düşük satış fiyatı (uygulanan/dış değişiklik geçmişi + buybox gözlemlerindeki kendi fiyatımız + güncel). */
export async function lowestPrices(clientDB: any, variantIds: ObjectId[], current: Map<string, number | null>, days: number, now: Date): Promise<Map<string, number | null>> {
    const since = new Date(now.getTime() - days * DAY);
    const [h, s]: any[][] = variantIds.length ? await Promise.all([
        clientDB.getPriceHistoryModel().aggregate([
            { $match: { integrationCode: BUYBOX_CHANNEL, variantId: { $in: variantIds }, at: { $gte: since } } },
            { $group: { _id: '$variantId', min: { $min: '$salePrice' }, prevMin: { $min: '$previousPrice' } } },
        ]),
        clientDB.getBuyboxSnapshotModel().aggregate([
            { $match: { integrationCode: BUYBOX_CHANNEL, variantId: { $in: variantIds }, observedAt: { $gte: since }, ownPrice: { $type: 'number' } } },
            { $group: { _id: '$variantId', min: { $min: '$ownPrice' } } },
        ]),
    ]) : [[], []];
    const out = new Map<string, number | null>();
    for (const id of variantIds) {
        const key = String(id);
        const vals = [current.get(key), ...h.filter((x) => String(x._id) === key).flatMap((x) => [x.min, x.prevMin]), ...s.filter((x) => String(x._id) === key).map((x) => x.min)]
            .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
        out.set(key, vals.length ? roundMoney(Math.min(...vals)) : null);
    }
    return out;
}

export async function listSuggestions(clientDB: any, tid: number, raw: unknown, env: PricingEnv) {
    const p = listSuggestionsInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz öneri listesi isteği.', p.error);
    const i = p.data;
    const limit = i.limit ?? 50;
    const status = i.status ?? 'open';
    const filter: any = { status };
    if (status === 'open' || status === 'blocked') filter.current = true;
    if (i.ruleId) filter.ruleId = new ObjectId(i.ruleId);
    if (i.barcodes?.length) filter.barcode = { $in: i.barcodes };
    if (i.cursor) filter._id = { $lt: new ObjectId(i.cursor) };
    if (i.buyboxLostOnly) filter.buyboxOrder = { $gt: 1 };
    const model = clientDB.getPriceSuggestionModel();
    const [rows, counts, s] = await Promise.all([
        model.find(filter).sort({ _id: -1 }).limit(limit + 1).maxTimeMS(10_000).lean(),
        model.aggregate([{ $match: { current: true } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
        loadSettings(clientDB),
    ]);
    const page = (rows as any[]).slice(0, limit);
    const now = env.now();
    const current = new Map<string, number | null>(page.map((x) => [String(x.variantId), num(x.beforePrice)]));
    const lows = await lowestPrices(clientDB, [...new Set(page.map((x) => String(x.variantId)))].map((x) => new ObjectId(x)), current, 10, now);
    const summary = { open: 0, blocked: 0 };
    for (const c of counts as any[]) if (c._id === 'open' || c._id === 'blocked') summary[c._id as 'open' | 'blocked'] = c.n;
    const act = tenantActive(s, env);
    return {
        channel: BUYBOX_CHANNEL, active: act.active, inactiveReason: act.reason, summary, applyMax: APPLY_MAX,
        items: page.map((x) => suggestionDto(x, lows.get(String(x.variantId)) ?? null)),
        nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
    };
}

export const historyListInput = z.object({
    barcode: z.string().min(1).max(128).optional(),
    days: z.number().int().min(1).max(90).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    cursor: OID.optional(),
}).strict();

/** Denetim geçmişi (K18): uygulanan öneriler ve gözlenen dış değişiklikler, kural sürümü ve buybox değeriyle. */
export async function listPriceHistory(clientDB: any, raw: unknown, env: PricingEnv) {
    const p = historyListInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz fiyat geçmişi isteği.', p.error);
    const i = p.data;
    const limit = i.limit ?? 50;
    const filter: any = { integrationCode: BUYBOX_CHANNEL, at: { $gte: new Date(env.now().getTime() - (i.days ?? 30) * DAY) } };
    if (i.barcode) filter.barcode = i.barcode;
    if (i.cursor) filter._id = { $lt: new ObjectId(i.cursor) };
    const rows: any[] = await clientDB.getPriceHistoryModel().find(filter).sort({ _id: -1 }).limit(limit + 1).maxTimeMS(10_000).lean();
    const page = rows.slice(0, limit);
    return {
        channel: BUYBOX_CHANNEL,
        items: page.map((r) => ({
            id: String(r._id), at: iso(r.at), barcode: r.barcode ?? null, variantId: String(r.variantId), source: r.source,
            previousPrice: num(r.previousPrice), salePrice: r.salePrice, listPrice: num(r.listPrice),
            ruleId: r.ruleId ? String(r.ruleId) : null, ruleVersion: num(r.ruleVersion), suggestionId: r.suggestionId ? String(r.suggestionId) : null,
            buyboxPrice: num(r.buyboxPrice), buyboxObservedAt: iso(r.buyboxObservedAt), actor: r.actor ?? null,
        })),
        nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
    };
}

// ---- İnsan onaylı uygulama (`pricing.suggestions.apply`) ---------------------------------------------------------------------
export const applyInput = z.object({ suggestionIds: z.array(OID).min(1).max(APPLY_MAX) }).strict();

export interface ApplyOutcome {
    applied: Array<{ suggestionId: string; barcode: string; before: number; after: number }>;
    rejected: Array<{ suggestionId: string; barcode: string | null; reason: string }>;
    published: number;
}

/**
 * Onaylı uygulama. Her öneri için SİGORTA yeniden çalışır: anahtarlar (K19) + metin kabulü (K3), kural sürümü değişmemiş, kanal fiyatı
 * öneri anındakiyle aynı, taze veriyle motor AYNI fiyatı üretiyor (K1/K7/K8/K9/K12/K13/K17) ve bağımsız `fuseCheck` geçiyor.
 * Yalnız kanalın SATIŞ fiyatı değişir; liste (üstü çizili) fiyat değişmez/yükselmez (K9). Ortak fiyatlı varyant kanal bazlı fiyata geçer
 * (diğer kanalların fiyatı aynen korunur). Yayın mevcut hattan (UPDATE_PRICE). Her değişiklik geçmişe + denetime yazılır (K10, K18).
 */
export async function applySuggestions(clientDB: any, tid: number, actor: string | null, raw: unknown, env: PricingEnv): Promise<ApplyOutcome> {
    const p = applyInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz öneri onayı.', p.error);
    const act = tenantActive(await loadSettings(clientDB), env);
    if (!act.active) throw AppError.of('CAPABILITY_DISABLED', { message: 'Fiyat kuralları bu hesapta kapalı.', details: { reason: act.reason } });
    if (!env.competitionEnabled(tid)) throw AppError.of('CAPABILITY_DISABLED', { message: 'Buybox verisi bu hesapta kapalı.' });
    const now = env.now();
    const ids = [...new Set(p.data.suggestionIds)].map((x) => new ObjectId(x));
    const sugModel = clientDB.getPriceSuggestionModel();
    const sugs: any[] = await sugModel.find({ _id: { $in: ids } }).lean();
    const byId = new Map(sugs.map((x) => [String(x._id), x]));
    const out: ApplyOutcome = { applied: [], rejected: [], published: 0 };
    const reject = (id: string, barcode: string | null, reason: string) => { out.rejected.push({ suggestionId: id, barcode, reason }); };

    const ruleIds = [...new Set(sugs.map((x) => String(x.ruleId)))].map((x) => new ObjectId(x));
    const rules = new Map(((await clientDB.getPriceRuleModel().find({ _id: { $in: ruleIds } }).lean()) as any[]).map((r) => [String(r._id), r]));
    const variants: any[] = await clientDB.getVariantModel().find({ _id: { $in: sugs.map((x) => x.variantId) } }, VARIANT_FIELDS).lean();
    const vById = new Map(variants.map((v) => [String(v._id), v]));
    const [margins, hist, freshnessMin] = await Promise.all([
        env.marginContexts(clientDB, tid, variants), historyFor(clientDB, variants.map((v) => v._id), now), env.freshnessMin(tid),
    ]);
    const barcodes: string[] = [];
    const touched = new Set<string>();
    for (const oid of ids) {
        const id = String(oid);
        const s = byId.get(id);
        if (!s) { reject(id, null, 'not_found'); continue; }
        if (s.status !== 'open' || !s.current) { reject(id, s.barcode, `not_open_${s.status}`); continue; }
        const rule = rules.get(String(s.ruleId));
        if (!rule || !rule.enabled) { reject(id, s.barcode, 'rule_disabled'); continue; }
        if (rule.pausedReason) { reject(id, s.barcode, 'rule_paused'); continue; }
        if (rule.version !== s.ruleVersion) { reject(id, s.barcode, 'rule_changed'); continue; }
        const v = vById.get(String(s.variantId));
        const margin = v ? margins.get(String(v._id)) : undefined;
        if (!v || !margin) { reject(id, s.barcode, 'variant_not_found'); continue; }
        if (touched.has(String(v._id))) { reject(id, s.barcode, 'duplicate_variant'); continue; }
        const own = ownChannelPrice(v, BUYBOX_CHANNEL);
        if (own === null || Math.round(own * 100) !== Math.round(s.beforePrice * 100)) { reject(id, s.barcode, 'price_changed'); continue; }
        // Sigorta 1: motor taze veriyle yeniden (K1/K7/K8/K9/K12/K13/K17).
        const r = evaluate(evalInputFor(rule, v, margin, hist.get(String(v._id)) ?? [], freshnessMin, now));
        if (r.kind !== 'suggest') { reject(id, s.barcode, r.kind === 'skip' ? r.reason : `rule_paused_${r.reason}`); continue; }
        if (Math.round(r.after * 100) !== Math.round(s.afterPrice * 100)) { reject(id, s.barcode, 'suggestion_changed'); continue; }
        // Sigorta 2: bağımsız mutlak kontroller.
        const fuse = fuseCheck({ mode: rule.competition.mode, before: own, after: r.after, floor: r.floor, ceiling: rule.competition.ceiling, buyboxPrice: r.buyboxPrice, listPrice: r.listPrice });
        if (fuse.length) { reject(id, s.barcode, `fuse_${fuse[0]}`); continue; }

        const write = priceWrite(v, r.after);
        const res = await clientDB.getVariantModel().updateOne({ _id: v._id, ...write.guard }, { $set: write.set });
        if (!res?.modifiedCount && !res?.nModified) { reject(id, s.barcode, 'price_changed'); continue; }
        touched.add(String(v._id));
        const c = v.competition?.[BUYBOX_CHANNEL] ?? {};
        await clientDB.getPriceHistoryModel().create({
            integrationCode: BUYBOX_CHANNEL, variantId: v._id, barcode: v.barcode, at: now, salePrice: r.after, previousPrice: own,
            listPrice: r.listPrice ?? undefined, source: 'suggestion', ruleId: rule._id, ruleVersion: rule.version, suggestionId: s._id,
            buyboxPrice: r.buyboxPrice, buyboxObservedAt: c.checkedAt ? new Date(c.checkedAt) : undefined, actor: actor ?? undefined,
        });
        await sugModel.updateOne({ _id: s._id }, { $set: { status: 'applied', appliedAt: now, appliedBy: actor ?? undefined, updatedAt: now }, $unset: { current: 1 } });
        // K18: denetim — tenant, SKU, kanal, eski/yeni, buybox değeri+zamanı, kural sürümü, tetikleyen, sigorta sonucu.
        env.audit('pricing.suggestion.applied', tid, actor, {
            barcode: v.barcode, channel: BUYBOX_CHANNEL, before: own, after: r.after, buyboxPrice: r.buyboxPrice,
            buyboxAt: c.checkedAt ? new Date(c.checkedAt).toISOString() : null, ruleId: String(rule._id), ruleVersion: rule.version, source: 'rule_approved', fuse: 'pass',
        });
        out.applied.push({ suggestionId: id, barcode: v.barcode, before: own, after: r.after });
        barcodes.push(v.barcode);
    }
    if (barcodes.length) {
        await env.publish(clientDB, tid, barcodes);
        out.published = barcodes.length;
    }
    return out;
}

/** Yalnız kanalın satış fiyatı yazılır (K9: liste fiyatı korunur). Ortak fiyatlı varyant kanal bazlıya geçer; diğer kanallar aynı değerle sabitlenir. */
export function priceWrite(v: any, after: number): { guard: any; set: any } {
    const code = BUYBOX_CHANNEL;
    if (v?.prices?.isPlatformBasedPrice) {
        return { guard: { [`platforms.${code}.prices.salePrice`]: v.platforms?.[code]?.prices?.salePrice }, set: { [`platforms.${code}.prices.salePrice`]: after } };
    }
    const base = { salePrice: num(v?.prices?.salePrice) ?? 0, marketPrice: num(v?.prices?.marketPrice) ?? 0 };
    const set: any = { 'prices.isPlatformBasedPrice': true, [`platforms.${code}.prices`]: { salePrice: after, marketPrice: base.marketPrice } };
    for (const other of Object.keys(v?.platforms ?? {})) {
        if (other === code || !/^[a-z0-9_]{1,40}$/.test(other)) continue;
        if (!v.platforms[other]?.prices) set[`platforms.${other}.prices`] = { ...base };
    }
    return { guard: { 'prices.isPlatformBasedPrice': { $ne: true }, 'prices.salePrice': v?.prices?.salePrice }, set };
}

export const dismissInput = z.object({ suggestionIds: z.array(OID).min(1).max(APPLY_MAX) }).strict();

export async function dismissSuggestions(clientDB: any, tid: number, actor: string | null, raw: unknown, env: PricingEnv) {
    const p = dismissInput.safeParse(raw ?? {});
    if (!p.success) throw invalid('Geçersiz istek.', p.error);
    const now = env.now();
    const r = await clientDB.getPriceSuggestionModel().updateMany(
        { _id: { $in: p.data.suggestionIds.map((x) => new ObjectId(x)) }, current: true, status: 'open' },
        { $set: { status: 'dismissed', closedReason: 'user', updatedAt: now }, $unset: { current: 1 } },
    );
    env.audit('pricing.suggestion.dismissed', tid, actor, { count: r?.modifiedCount ?? 0 });
    return { dismissed: r?.modifiedCount ?? 0 };
}
