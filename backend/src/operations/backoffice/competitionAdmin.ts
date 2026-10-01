// PRC-CFG (K57-S5): rekabet modülü ayarlarının backoffice görünümü + tenant istisnası yazımı. SAF: modeller/saat enjekte edilir.
// Plan varsayılanları ve kanal bütçesi `_platform` kataloğundadır ve MEVCUT `IntegrationConfigService` (taslak/yayın/geçmiş/geri alma,
// ADR-0031 Karar 5) ile değiştirilir — burada yeni bir yayın mekanizması YOK. Tenant istisnası `Subscriptions.limitOverrides.competition`.
// Denetim: `backoffice.write` (RunOperation, yetenek kaydı) + `BillingEvents` (`subscription.competition_override`, önce/sonra).
// Değişiklik yeniden başlatmasız etkilidir: buybox işi her turda aboneliği yeniden okur; ekran istek başına okur.
import { ApplicationError } from '@platform/core/errors';
import { logger } from '@platform/core/logger';
import {
    COMPETITION_BUDGET_CHANNELS, COMPETITION_LIMITS, COMPETITION_PLANS, COMPETITION_PRIORITIES, budgetKey, planKey,
} from '@integration/config/catalog/pricing';
import {
    channelBudgetPerMin, competitionOverrideSchema, notifyCooldownMs, notifyShadow, readPlanDefaults, settingsFromSubscription,
    SUBSCRIPTION_COMPETITION_PROJECTION, type SettingReader,
} from '@operations/pricing/competitionSettings';

/** `applicationDB` tutamağı (handler model çağırmaz; ratchet `handlerGetModel`) ya da testte doğrudan modeller. */
export interface CompetitionAdminDeps {
    applicationDB?: { getSubscriptionModel(): any; getClientModel(): any; getBillingEventModel(): any };
    subscriptionModel?: any;
    clientModel?: any;
    billingEventModel?: any;
    read?: SettingReader;
    now?: () => Date;
}

function models(d: CompetitionAdminDeps) {
    return {
        subscriptionModel: d.subscriptionModel ?? d.applicationDB!.getSubscriptionModel(),
        clientModel: d.clientModel ?? d.applicationDB!.getClientModel(),
        billingEventModel: d.billingEventModel ?? d.applicationDB!.getBillingEventModel(),
    };
}
export interface CompetitionActorCtx { sub?: string; reason: string; reqId?: string }

const MAX_OVERRIDES_LISTED = 200;
/** `api/admin/stepUp.ts` REASON_MIN_LENGTH ile aynı (katman sınırı: operations api'yi içe aktarmaz). */
const REASON_MIN = 10;

/** Ekranın tek okuma çağrısı: plan varsayılanları (yayınlanmış), bütçe, bildirim, istisnası olan tenant'lar, sınırlar ve katalog anahtarları. */
export async function getCompetitionSettings(d: CompetitionAdminDeps) {
    const m = models(d);
    const rows: any[] = await m.subscriptionModel
        .find({ 'limitOverrides.competition': { $exists: true } }, SUBSCRIPTION_COMPETITION_PROJECTION)
        .sort({ clientId: 1 }).limit(MAX_OVERRIDES_LISTED).lean();
    const tids = rows.map((r) => Number(r.clientId));
    const clients: any[] = tids.length ? await m.clientModel.find({ order: { $in: tids } }, { order: 1, name: 1, title: 1 }).lean() : [];
    const names = new Map(clients.map((c) => [Number(c.order), c.title ?? c.name ?? null]));
    return {
        plans: COMPETITION_PLANS.map((plan) => ({
            plan, ...readPlanDefaults(plan, d.read),
            keys: { skuCap: planKey(plan, 'skuCap'), refreshMin: planKey(plan, 'refreshMin'), freshnessMin: planKey(plan, 'freshnessMin'), priority: planKey(plan, 'priority') },
        })),
        budgets: COMPETITION_BUDGET_CHANNELS.map((channel) => ({ channel, perMin: channelBudgetPerMin(channel, d.read), key: budgetKey(channel) })),
        notify: { shadow: notifyShadow(d.read), cooldownHours: Math.round(notifyCooldownMs() / 3600_000) },
        overrides: rows.map((r) => ({
            tid: Number(r.clientId), tenantName: names.get(Number(r.clientId)) ?? null, planCode: r.planCode ?? null,
            override: pickOverride(r.limitOverrides?.competition),
            effective: settingsFromSubscription(r, d.read),
            updatedAt: r.limitOverrides?.competition?.updatedAt ?? null,
            note: r.limitOverrides?.competition?.note ?? null,
        })),
        limits: COMPETITION_LIMITS,
        priorities: COMPETITION_PRIORITIES,
    };
}

function pickOverride(o: any) {
    const out: Record<string, unknown> = {};
    for (const k of ['skuCap', 'refreshMin', 'freshnessMin', 'priority']) if (o?.[k] !== undefined && o?.[k] !== null) out[k] = o[k];
    return out;
}

/** Tek tenant'ın etkin ayarı + istisnası (ekranın tenant seçimi). */
export async function getTenantCompetition(d: CompetitionAdminDeps, input: { tid: unknown }) {
    const tid = Number(input.tid);
    if (!Number.isInteger(tid) || tid <= 0) throw new ApplicationError('tid geçersiz.', 400, 'VALIDATION');
    const sub: any = await models(d).subscriptionModel.findOne({ clientId: tid }, SUBSCRIPTION_COMPETITION_PROJECTION).lean();
    if (!sub) throw new ApplicationError('Abonelik bulunamadı.', 404, 'SUBSCRIPTION_NOT_FOUND');
    return { tid, planCode: sub.planCode ?? null, billingExempt: sub.billingExempt === true, override: pickOverride(sub.limitOverrides?.competition), effective: settingsFromSubscription(sub, d.read) };
}

/**
 * Tenant istisnasını yazar ya da (`override: null` / boş nesne) kaldırır. Alanlar plan ayarıyla AYNI sınırlarla doğrulanır;
 * gerekçe zorunludur (≥10 karakter). Yanıt: önce/sonra etkin ayar.
 */
export async function setCompetitionOverride(d: CompetitionAdminDeps, input: { tid: unknown; override: unknown; note?: unknown }, ctx: CompetitionActorCtx) {
    const tid = Number(input.tid);
    if (!Number.isInteger(tid) || tid <= 0) throw new ApplicationError('tid geçersiz.', 400, 'VALIDATION');
    if (ctx.reason.trim().length < REASON_MIN) throw new ApplicationError(`Gerekçe zorunludur (en az ${REASON_MIN} karakter).`, 400, 'VALIDATION');
    const clear = input.override === null || (typeof input.override === 'object' && input.override !== null && Object.keys(input.override).length === 0);
    let parsed: Record<string, unknown> = {};
    if (!clear) {
        const p = competitionOverrideSchema.safeParse(input.override);
        if (!p.success) throw new ApplicationError('İstisna değerleri geçersiz: ' + p.error.issues.map((x) => x.path.join('.')).join(', '), 400, 'VALIDATION');
        parsed = p.data;
    }
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 280) : undefined;
    const now = (d.now ?? (() => new Date()))();
    const m = models(d);
    const before: any = await m.subscriptionModel.findOne({ clientId: tid }, SUBSCRIPTION_COMPETITION_PROJECTION).lean();
    if (!before) throw new ApplicationError('Abonelik bulunamadı.', 404, 'SUBSCRIPTION_NOT_FOUND');
    const update = clear
        ? { $unset: { 'limitOverrides.competition': '' } }
        : { $set: { 'limitOverrides.competition': { ...parsed, ...(note ? { note } : {}), updatedBy: ctx.sub ?? null, updatedAt: now } } };
    await m.subscriptionModel.updateOne({ clientId: tid }, update);
    const after: any = await m.subscriptionModel.findOne({ clientId: tid }, SUBSCRIPTION_COMPETITION_PROJECTION).lean();
    const beforeOverride = pickOverride(before.limitOverrides?.competition);
    const afterOverride = pickOverride(after?.limitOverrides?.competition);
    try {
        await m.billingEventModel.create({
            provider: 'system', providerEventId: `competition-override:${tid}:${now.getTime()}`, type: 'subscription.competition_override', clientId: tid,
            receivedAt: now, processedAt: now, status: 'processed',
            payloadRedacted: { before: beforeOverride, after: afterOverride, cleared: clear, actor: ctx.sub ?? null, reason: ctx.reason.slice(0, 500) },
        });
    } catch (e: any) {
        logger.warn('[competitionAdmin] BillingEvent yazılamadı: ' + (e?.message ?? 'unknown'));
    }
    return {
        tid, cleared: clear, before: beforeOverride, after: afterOverride,
        effective: settingsFromSubscription(after ?? before, d.read),
    };
}
